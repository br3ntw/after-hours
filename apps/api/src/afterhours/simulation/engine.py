"""Simulation engine: advances the park one tick and persists and publishes the result.

Run by exactly one worker process (ADR-0001). Every value it writes is SIMULATED.
Each tick:
  1. advance the gate (guests in park) and every attraction's queue (model.py);
  2. persist live state, per-ride samples, and a park sample;
  3. roll random incidents (breakdowns, which open SIMULATION tickets, and short delays);
  4. advance auto-repairs (assign → start → resolve → close) for simulation tickets;
  5. publish one ``sim.tick`` event carrying every ride's wait for the live UI.
"""

import json
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, cast

from redis.asyncio import Redis
from sqlalchemy import delete, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from afterhours.attractions import service as attractions
from afterhours.attractions.models import (
    Attraction,
    AttractionLive,
    AttractionStatus,
    AttractionType,
    MetricSample,
    ParkSample,
)
from afterhours.attractions.service import SYSTEM, Actor
from afterhours.audit.service import record
from afterhours.core.config import get_settings
from afterhours.core.logging import get_logger
from afterhours.events.publisher import publish
from afterhours.maintenance import service as maintenance
from afterhours.maintenance.models import (
    IssueType,
    MaintenanceTicket,
    Severity,
    TicketSource,
    TicketState,
)
from afterhours.simulation import model
from afterhours.simulation.control import WARM_START, SimState, opening_day, read_state, write_state

log = get_logger(__name__)

# Mean time between failures in *simulated* minutes, by attraction type (invented values).
MTBF_MINUTES: dict[AttractionType, float] = {
    AttractionType.COASTER: 2400,
    AttractionType.DARK_RIDE: 3000,
    AttractionType.WATER: 2800,
    AttractionType.FLAT: 3600,
    AttractionType.FAMILY: 5000,
    AttractionType.SHOW: 8000,
}
DELAY_MEAN_MINUTES = 1500  # short "delayed" blips (e.g. a guest-assist stop)

BREAKDOWNS: list[tuple[IssueType, Severity, str]] = [
    (IssueType.MECHANICAL, Severity.SEV1, "Lift motor fault stopped the ride cycle"),
    (IssueType.ELECTRICAL, Severity.SEV1, "Block-zone sensor fault, ride e-stopped"),
    (IssueType.SAFETY, Severity.SEV1, "Restraint check failed on dispatch"),
    (IssueType.MECHANICAL, Severity.SEV2, "Vehicle brake fin wear, reduced dispatch rate"),
    (IssueType.ELECTRICAL, Severity.SEV2, "Show-control audio dropout, running degraded"),
]

DELAYS_KEY = "ah:sim:delays"  # slug -> sim time the delay clears
REPAIRS_KEY = "ah:sim:repairs"  # ticket id -> plan {assign_at, start_at, resolve_at, close_at}
LOCK_KEY = "ah:sim:lock"


@dataclass(slots=True)
class RideRow:
    id: uuid.UUID
    slug: str
    name: str
    type: AttractionType
    status: AttractionStatus
    config: model.RideConfig
    queue: int


def _minute_of_day(t: datetime) -> float:
    return t.hour * 60 + t.minute + t.second / 60


async def _load_rides(db: AsyncSession) -> list[RideRow]:
    rows = (await db.scalars(select(Attraction).order_by(Attraction.slug))).unique().all()
    return [
        RideRow(
            id=a.id,
            slug=a.slug,
            name=a.name,
            type=a.type,
            status=a.status,
            config=model.RideConfig(
                a.riders_per_dispatch, a.dispatch_interval_s, a.popularity, a.status.value
            ),
            queue=a.live.queue_length if a.live else 0,
        )
        for a in rows
    ]


@dataclass(slots=True)
class StepOutput:
    sim_time: datetime
    guests: int
    gate_arrivals: int
    gate_departures: int
    rides: dict[str, model.RideStep]


def _advance(
    rides: list[RideRow], guests: int, sim_time: datetime, dt: float, rng: random.Random
) -> StepOutput:
    """Pure model step over the whole park (no I/O)."""
    settings = get_settings()
    new_time = sim_time + timedelta(minutes=dt)
    minute = _minute_of_day(new_time)
    gate = model.step_gate(guests, minute, dt, settings.park_capacity, rng)
    configs = {r.slug: r.config for r in rides}
    demand = model.ride_demand(gate.guests_in_park, configs, minute)
    steps = {r.slug: model.step_ride(r.config, r.queue, demand[r.slug], dt, rng) for r in rides}
    return StepOutput(new_time, gate.guests_in_park, gate.arrivals, gate.departures, steps)


async def _persist(db: AsyncSession, rides: list[RideRow], out: StepOutput, dt: float) -> float:
    waits = [s.wait_minutes for s in out.rides.values() if s.wait_minutes is not None]
    avg_wait = round(sum(waits) / len(waits), 1) if waits else 0.0
    by_slug = {r.slug: r for r in rides}

    live_rows = [
        {
            "attraction_id": by_slug[slug].id,
            "queue_length": s.queue,
            "wait_minutes": s.wait_minutes,
            "riders_last_hour": round(s.served * 60 / dt),  # per simulated hour
        }
        for slug, s in out.rides.items()
    ]
    stmt = pg_insert(AttractionLive).values(live_rows)
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=[AttractionLive.attraction_id],
            set_={
                "queue_length": stmt.excluded.queue_length,
                "wait_minutes": stmt.excluded.wait_minutes,
                "riders_last_hour": stmt.excluded.riders_last_hour,
                "updated_at": stmt.excluded.updated_at,
            },
        )
    )
    await db.execute(
        insert(MetricSample),
        [
            {
                "attraction_id": by_slug[slug].id,
                "sim_time": out.sim_time,
                "queue_length": s.queue,
                "wait_minutes": s.wait_minutes,
                "arrivals": s.arrivals,
                "riders_served": s.served,
                "status": by_slug[slug].status,
            }
            for slug, s in out.rides.items()
        ],
    )
    db.add(
        ParkSample(
            sim_time=out.sim_time,
            guests_in_park=out.guests,
            arrivals=out.gate_arrivals,
            departures=out.gate_departures,
            riders_served=sum(s.served for s in out.rides.values()),
            avg_wait_minutes=avg_wait,
        )
    )
    await db.commit()
    return avg_wait


async def _roll_incidents(
    db: AsyncSession, redis: Redis, rides: list[RideRow], state: SimState, rng: random.Random
) -> None:
    if not model.is_open(_minute_of_day(state.sim_time)):
        return
    dt = state.speed
    for ride in rides:
        if ride.status != AttractionStatus.OPERATING:
            continue
        if rng.random() < dt / MTBF_MINUTES[ride.type]:
            issue, severity, title = rng.choice(BREAKDOWNS)
            await schedule_breakdown(db, redis, ride.slug, issue, severity, title, state, rng)
        elif rng.random() < dt / DELAY_MEAN_MINUTES:
            until = state.sim_time + timedelta(minutes=rng.randint(4, 15))
            await attractions.change_status(
                db, ride.slug, AttractionStatus.DELAYED, actor=SYSTEM, reason="Guest-assist stop"
            )
            await redis.hset(DELAYS_KEY, ride.slug, until.isoformat())


async def schedule_breakdown(
    db: AsyncSession,
    redis: Redis,
    slug: str,
    issue: IssueType,
    severity: Severity,
    title: str,
    state: SimState,
    rng: random.Random,
    *,
    actor: Actor = SYSTEM,
    repair_minutes: int | None = None,
) -> MaintenanceTicket:
    ticket = await maintenance.create_ticket(
        db,
        attraction_slug=slug,
        title=title,
        description="Generated by the demo simulation.",
        issue_type=issue,
        severity=severity,
        actor=actor,
        source=TicketSource.SIMULATION,
    )
    if severity == Severity.SEV2:
        await attractions.change_status(
            db, slug, AttractionStatus.DELAYED, actor=SYSTEM, reason=f"MT-{ticket.number}: {title}"
        )
    t0 = state.sim_time
    assign_at = t0 + timedelta(minutes=rng.randint(3, 8))
    start_at = assign_at + timedelta(minutes=rng.randint(2, 6))
    resolve_at = start_at + timedelta(minutes=repair_minutes or rng.randint(18, 60))
    plan = {
        "assign_at": assign_at.isoformat(),
        "start_at": start_at.isoformat(),
        "resolve_at": resolve_at.isoformat(),
        "close_at": (resolve_at + timedelta(minutes=10)).isoformat(),
    }
    await redis.hset(REPAIRS_KEY, str(ticket.id), json.dumps(plan))
    return ticket


async def _advance_delays(db: AsyncSession, redis: Redis, now: datetime) -> None:
    delays = cast(dict[str, str], await redis.hgetall(DELAYS_KEY))
    for slug, until in delays.items():
        if datetime.fromisoformat(until) <= now:
            await redis.hdel(DELAYS_KEY, slug)
            current = await attractions.get_attraction(db, slug)
            if current.status == AttractionStatus.DELAYED:
                await attractions.change_status(
                    db, slug, AttractionStatus.OPERATING, actor=SYSTEM, reason="Delay cleared"
                )


async def _advance_repairs(db: AsyncSession, redis: Redis, now: datetime) -> None:
    """Work SIMULATION tickets through their lifecycle. If a person has already moved a
    ticket past a step, that step is skipped rather than fought over."""
    plans = cast(dict[str, str], await redis.hgetall(REPAIRS_KEY))
    if not plans:
        return
    techs = list(await maintenance.list_technicians(db))
    for ticket_id, raw in plans.items():
        plan = json.loads(raw)
        try:
            ticket = await maintenance.get_ticket(db, uuid.UUID(ticket_id))
        except Exception:
            await redis.hdel(REPAIRS_KEY, ticket_id)
            continue
        due = {k: datetime.fromisoformat(v) <= now for k, v in plan.items()}
        try:
            if ticket.state == TicketState.OPEN and due["assign_at"] and techs:
                tech = techs[ticket.number % len(techs)]
                await maintenance.assign(db, ticket.id, tech.id, actor=SYSTEM)
            elif ticket.state == TicketState.ASSIGNED and due["start_at"]:
                await maintenance.transition(
                    db, ticket.id, TicketState.IN_PROGRESS, actor=SYSTEM, can_update_any=True
                )
            elif ticket.state == TicketState.IN_PROGRESS and due["resolve_at"]:
                await maintenance.transition(
                    db,
                    ticket.id,
                    TicketState.RESOLVED,
                    actor=SYSTEM,
                    can_update_any=True,
                    note="Repaired and test-cycled (simulated).",
                )
                if ticket.attraction.status == AttractionStatus.DELAYED:
                    await attractions.change_status(
                        db,
                        ticket.attraction.slug,
                        AttractionStatus.OPERATING,
                        actor=SYSTEM,
                        reason=f"MT-{ticket.number} resolved",
                    )
            elif ticket.state == TicketState.RESOLVED and due["close_at"]:
                await maintenance.transition(
                    db, ticket.id, TicketState.CLOSED, actor=SYSTEM, can_update_any=True
                )
            elif ticket.state == TicketState.CLOSED:
                await redis.hdel(REPAIRS_KEY, ticket_id)
        except maintenance.InvalidTransitionError:
            await db.rollback()


async def tick(db: AsyncSession, redis: Redis) -> SimState | None:
    """Advance one tick if running. Returns the new state (None when paused)."""
    state = await read_state(redis)
    if not state.initialized:
        await reset(db, redis, running=get_settings().sim_autostart)
        return await read_state(redis)
    if not state.running:
        return None

    async with redis.lock(LOCK_KEY, timeout=30, blocking_timeout=5):
        state = await read_state(redis)  # re-read under the lock (reset may have run)
        rng = random.Random(f"{get_settings().sim_seed}:{state.tick}")
        rides = await _load_rides(db)

        if _minute_of_day(state.sim_time) >= model.CLOSE_MINUTE + 45:
            # Overnight: jump to the next morning with an empty park.
            next_day = state.sim_time.date() + timedelta(days=1)
            morning = datetime(
                next_day.year, next_day.month, next_day.day, 8, 45, tzinfo=state.sim_time.tzinfo
            )
            await db.execute(update(AttractionLive).values(queue_length=0, wait_minutes=0))
            await db.commit()
            state = SimState(state.running, state.speed, morning, state.tick + 1, 0, True)
            await write_state(state, redis)
            return state

        out = _advance(rides, state.guests_in_park, state.sim_time, state.speed, rng)
        avg_wait = await _persist(db, rides, out, state.speed)
        new_state = SimState(
            state.running, state.speed, out.sim_time, state.tick + 1, out.guests, True
        )
        await write_state(new_state, redis)

        await _advance_delays(db, redis, out.sim_time)
        await _advance_repairs(db, redis, out.sim_time)
        await _roll_incidents(db, redis, rides, new_state, rng)

        # Re-read statuses so the tick event reflects incidents rolled this tick.
        statuses = {
            a.slug: a.status.value for a in (await db.scalars(select(Attraction))).unique().all()
        }
        await publish("sim.tick", _tick_payload(new_state, out, avg_wait, statuses), redis=redis)
        return new_state


def _tick_payload(
    state: SimState, out: StepOutput, avg_wait: float, statuses: dict[str, str]
) -> dict[str, Any]:
    return {
        **state.as_dict(),
        "avg_wait": avg_wait,
        "riders_served": sum(s.served for s in out.rides.values()),
        "rides": [
            {
                "slug": slug,
                "wait_minutes": s.wait_minutes
                if statuses.get(slug) in ("operating", "delayed")
                else None,
                "queue_length": s.queue,
                "status": statuses.get(slug),
            }
            for slug, s in out.rides.items()
        ],
    }


async def reset(
    db: AsyncSession, redis: Redis, *, running: bool, actor: Actor = SYSTEM
) -> SimState:
    """Return the park to a known state and warm-start it to mid-day.

    History (status intervals, tickets, audit) is preserved; simulated telemetry is
    cleared and regenerated so charts start with a realistic morning already behind them.
    """
    async with redis.lock(LOCK_KEY, timeout=60, blocking_timeout=10):
        await redis.delete(DELAYS_KEY, REPAIRS_KEY)
        await db.execute(delete(MetricSample))
        await db.execute(delete(ParkSample))
        await db.commit()

        for ticket in await maintenance.list_tickets(db, open_only=True, limit=1000):
            ticket.state = TicketState.CLOSED
            ticket.resolution_notes = "Closed by simulation reset."
            ticket.resolved_at = ticket.resolved_at or datetime.now(ticket.opened_at.tzinfo)
        record(
            db,
            actor_id=actor.user_id,
            action="simulation.reset",
            entity_type="simulation",
            entity_id="park",
        )
        await db.commit()
        for a in (await db.scalars(select(Attraction))).unique().all():
            if a.status != AttractionStatus.OPERATING:
                await attractions.change_status(
                    db, a.slug, AttractionStatus.OPERATING, actor=actor, reason="Simulation reset"
                )

        rides = await _load_rides(db)
        for r in rides:
            r.queue = 0
        rng = random.Random(f"{get_settings().sim_seed}:warmup")
        sim_time = opening_day() + timedelta(hours=8, minutes=45)
        end = opening_day() + WARM_START
        guests = 0
        park_rows: list[dict[str, Any]] = []
        ride_rows: list[dict[str, Any]] = []
        last: StepOutput | None = None
        by_slug = {r.slug: r for r in rides}
        # Flows (arrivals, riders) are summed over each 5-minute bucket so every stored
        # sample's counts cover exactly the time since the previous sample, like live ticks.
        served: dict[str, int] = {r.slug: 0 for r in rides}
        arrived: dict[str, int] = {r.slug: 0 for r in rides}
        gate_in = gate_out = 0
        while sim_time < end:
            last = _advance(rides, guests, sim_time, 1.0, rng)
            sim_time, guests = last.sim_time, last.guests
            gate_in += last.gate_arrivals
            gate_out += last.gate_departures
            for r in rides:
                step = last.rides[r.slug]
                r.queue = step.queue
                served[r.slug] += step.served
                arrived[r.slug] += step.arrivals
            if sim_time.minute % 5 == 0:  # keep warm-up history compact
                waits = [s.wait_minutes for s in last.rides.values() if s.wait_minutes is not None]
                park_rows.append(
                    {
                        "sim_time": sim_time,
                        "guests_in_park": guests,
                        "arrivals": gate_in,
                        "departures": gate_out,
                        "riders_served": sum(served.values()),
                        "avg_wait_minutes": round(sum(waits) / len(waits), 1) if waits else 0.0,
                    }
                )
                ride_rows.extend(
                    {
                        "attraction_id": by_slug[slug].id,
                        "sim_time": sim_time,
                        "queue_length": s.queue,
                        "wait_minutes": s.wait_minutes,
                        "arrivals": arrived[slug],
                        "riders_served": served[slug],
                        "status": AttractionStatus.OPERATING,
                    }
                    for slug, s in last.rides.items()
                )
                served = dict.fromkeys(served, 0)
                arrived = dict.fromkeys(arrived, 0)
                gate_in = gate_out = 0
        await db.execute(insert(ParkSample), park_rows)
        await db.execute(insert(MetricSample), ride_rows)
        if last is None:  # pragma: no cover - the warm-up window is never empty
            raise RuntimeError("warm-up produced no steps")
        stmt = pg_insert(AttractionLive).values(
            [
                {
                    "attraction_id": r.id,
                    "queue_length": last.rides[r.slug].queue,
                    "wait_minutes": last.rides[r.slug].wait_minutes,
                    "riders_last_hour": 0,
                }
                for r in rides
            ]
        )
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=[AttractionLive.attraction_id],
                set_={
                    "queue_length": stmt.excluded.queue_length,
                    "wait_minutes": stmt.excluded.wait_minutes,
                },
            )
        )
        await db.commit()

        current = await read_state(redis)
        state = SimState(running, current.speed, sim_time, 0, guests, True)
        await write_state(state, redis)
    await publish(
        "sim.control", {"action": "reset", "actor": actor.name, **state.as_dict()}, redis=redis
    )
    log.info("sim.reset", sim_time=state.sim_time.isoformat(), guests=guests)
    return state
