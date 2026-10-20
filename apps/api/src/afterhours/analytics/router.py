"""Read models for the dashboards. Everything derived from simulation output is labelled
``simulated: true`` so a client can never present it as real park data."""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from afterhours.analytics.schemas import (
    ActivityItem,
    GuestFlowOut,
    OverviewOut,
    ReliabilityOut,
)
from afterhours.attractions.models import (
    Attraction,
    AttractionStatus,
    ParkSample,
    StatusHistory,
)
from afterhours.auth.deps import DbSession, require
from afterhours.auth.permissions import Permission
from afterhours.core.config import get_settings
from afterhours.events.publisher import recent_activity
from afterhours.maintenance import service as maintenance
from afterhours.maintenance.models import MaintenanceTicket, Severity
from afterhours.simulation.control import read_state

router = APIRouter(tags=["analytics"], dependencies=[Depends(require(Permission.VIEW_OPERATIONS))])

UP_STATUSES = (AttractionStatus.OPERATING, AttractionStatus.DELAYED)


def _downsample[T](rows: list[T], max_points: int) -> list[T]:
    if len(rows) <= max_points:
        return rows
    step = len(rows) / max_points
    return [rows[int(i * step)] for i in range(max_points - 1)] + [rows[-1]]


@router.get("/overview")
async def overview(db: DbSession) -> OverviewOut:
    rides = (await db.scalars(select(Attraction))).unique().all()
    running = [a for a in rides if a.status in UP_STATUSES]
    waits = [a.live.wait_minutes for a in running if a.live and a.live.wait_minutes is not None]
    sim = await read_state()
    trend = (
        await db.scalars(select(ParkSample).order_by(ParkSample.sim_time.desc()).limit(36))
    ).all()
    return OverviewOut.model_validate(
        {
            "attractions_total": len(rides),
            "attractions_up": len(running),
            "attractions_by_status": {
                s.value: sum(1 for a in rides if a.status == s) for s in AttractionStatus
            },
            "avg_wait_minutes": round(sum(waits) / len(waits), 1) if waits else 0,
            "guests_in_park": sim.guests_in_park,
            "park_capacity": get_settings().park_capacity,
            "open_incidents": await maintenance.open_counts_by_severity(db),
            "sim": sim.as_dict(),
            "trend": [
                {"sim_time": p.sim_time, "guests": p.guests_in_park, "avg_wait": p.avg_wait_minutes}
                for p in reversed(trend)
            ],
        }
    )


@router.get("/analytics/guest-flow")
async def guest_flow(
    db: DbSession, max_points: Annotated[int, Query(ge=10, le=500)] = 160
) -> GuestFlowOut:
    """Today's simulated park day (the current sim date), downsampled for plotting."""
    sim = await read_state()
    day_start = datetime(sim.sim_time.year, sim.sim_time.month, sim.sim_time.day, tzinfo=UTC)
    rows = (
        await db.scalars(
            select(ParkSample).where(ParkSample.sim_time >= day_start).order_by(ParkSample.sim_time)
        )
    ).all()
    points = _downsample(list(rows), max_points)
    return GuestFlowOut.model_validate(
        {
            "points": [
                {
                    "sim_time": p.sim_time,
                    "guests": p.guests_in_park,
                    "avg_wait": p.avg_wait_minutes,
                    "riders_served": p.riders_served,
                }
                for p in points
            ],
            "riders_today": int(sum(p.riders_served for p in rows)),
        }
    )


@router.get("/analytics/reliability")
async def reliability(
    db: DbSession, hours: Annotated[int, Query(ge=1, le=24 * 30)] = 24
) -> ReliabilityOut:
    """Uptime and recovery over the last ``hours`` of wall-clock time.

    Uptime = time in operating/delayed ÷ observed time, computed from status intervals.
    MTTR = mean (resolved_at − opened_at) for resolved SEV1/SEV2 tickets in the window.
    """
    now = datetime.now(UTC)
    window_start = now - timedelta(hours=hours)
    rides = (await db.scalars(select(Attraction).order_by(Attraction.name))).unique().all()
    intervals = (
        await db.scalars(
            select(StatusHistory).where(
                (StatusHistory.ended_at.is_(None)) | (StatusHistory.ended_at > window_start)
            )
        )
    ).all()
    tickets = (
        (
            await db.scalars(
                select(MaintenanceTicket).where(MaintenanceTicket.opened_at >= window_start)
            )
        )
        .unique()
        .all()
    )

    per_ride: list[dict[str, Any]] = []
    for ride in rides:
        observed = up = 0.0
        for iv in (i for i in intervals if i.attraction_id == ride.id):
            start = max(iv.started_at, window_start)
            end = iv.ended_at or now
            span = max(0.0, (end - start).total_seconds())
            observed += span
            if iv.status in UP_STATUSES:
                up += span
        ride_tickets = [t for t in tickets if t.attraction_id == ride.id]
        repairs = [
            (t.resolved_at - t.opened_at).total_seconds() / 60
            for t in ride_tickets
            if t.resolved_at and t.severity in (Severity.SEV1, Severity.SEV2)
        ]
        per_ride.append(
            {
                "slug": ride.slug,
                "name": ride.name,
                "uptime_pct": round(100 * up / observed, 2) if observed else 100.0,
                "incidents": len(ride_tickets),
                "mttr_minutes": round(sum(repairs) / len(repairs), 1) if repairs else None,
            }
        )
    all_repairs = [r["mttr_minutes"] for r in per_ride if r["mttr_minutes"] is not None]
    park_repairs = [
        (t.sim_resolved_at - t.sim_opened_at).total_seconds() / 60
        for t in tickets
        if t.sim_opened_at
        and t.sim_resolved_at
        and t.sim_resolved_at >= t.sim_opened_at
        and t.severity in (Severity.SEV1, Severity.SEV2)
    ]
    resolved = sum(1 for t in tickets if t.resolved_at)
    return ReliabilityOut.model_validate(
        {
            "window_hours": hours,
            "uptime_pct": round(sum(r["uptime_pct"] for r in per_ride) / len(per_ride), 2)
            if per_ride
            else 100.0,
            "incidents": len(tickets),
            "resolved": resolved,
            "mttr_minutes": round(sum(all_repairs) / len(all_repairs), 1) if all_repairs else None,
            "mttr_park_minutes": (
                round(sum(park_repairs) / len(park_repairs), 1) if park_repairs else None
            ),
            "attractions": per_ride,
            "note": "Simulation repairs run on the simulated clock; operator repairs on wall time.",
        }
    )


@router.get("/activity")
async def activity(limit: Annotated[int, Query(ge=1, le=200)] = 30) -> list[ActivityItem]:
    return [ActivityItem.model_validate(item) for item in await recent_activity(limit)]
