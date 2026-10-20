from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from afterhours.attractions.models import Attraction, AttractionLive, MetricSample, ParkSample
from afterhours.core.redis import get_redis
from afterhours.simulation import control, engine
from tests.conftest import LoginAs, stream_events

S = "/api/v1/simulation"


@pytest.mark.parametrize("role", ["ops_manager", "technician", "analyst"])
async def test_only_admins_control_the_simulation(
    client: AsyncClient, login_as: LoginAs, role: str
) -> None:
    assert (await client.post(f"{S}/pause", headers=await login_as(role))).status_code == 403


async def test_everyone_can_read_simulation_state(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.get(S, headers=await login_as("analyst"))
    assert resp.status_code == 200
    assert resp.json()["simulated"] is True


async def test_reset_warm_starts_the_park(
    client: AsyncClient, login_as: LoginAs, db: AsyncSession
) -> None:
    resp = await client.post(f"{S}/reset", headers=await login_as("admin"))
    assert resp.status_code == 200
    state = resp.json()
    assert datetime.fromisoformat(state["sim_time"]).strftime("%H:%M") == "14:00"
    assert state["guests_in_park"] > 1000

    assert (await db.scalar(select(func.count()).select_from(ParkSample)) or 0) > 30
    assert (await db.scalar(select(func.count()).select_from(MetricSample)) or 0) > 30 * 24
    lives = (await db.scalars(select(AttractionLive))).all()
    assert len(lives) == 24
    assert any((live.wait_minutes or 0) > 0 for live in lives)
    assert [e["payload"]["action"] for e in await stream_events("sim.control")] == ["reset"]


async def test_warmup_samples_cover_their_whole_interval(db: AsyncSession) -> None:
    """Each warm-up sample sums 5 simulated minutes of riders, matching its spacing."""
    await engine.reset(db, get_redis(), running=True)
    rows = (
        await db.scalars(
            select(MetricSample)
            .join(MetricSample.attraction)
            .where(Attraction.slug == "gearspring-runaway")
            .order_by(MetricSample.sim_time)
        )
    ).all()
    late = [r for r in rows if r.sim_time.hour >= 13]  # long lines by now: running at capacity
    per_minute = sum(r.riders_served for r in late) / (5 * len(late))
    assert per_minute == pytest.approx(1600 / 60, rel=0.15)  # ~design capacity of 1,600/h


async def test_tick_advances_clock_and_publishes(db: AsyncSession) -> None:
    redis = get_redis()
    before = await engine.reset(db, redis, running=True)
    after = await engine.tick(db, redis)
    assert after is not None
    assert after.sim_time == before.sim_time + timedelta(minutes=1)
    assert after.tick == before.tick + 1
    [tick] = await stream_events("sim.tick")
    assert tick["payload"]["simulated"] is True
    assert len(tick["payload"]["rides"]) == 24


async def test_paused_simulation_does_not_tick(db: AsyncSession) -> None:
    redis = get_redis()
    await engine.reset(db, redis, running=False)
    assert await engine.tick(db, redis) is None


async def test_first_tick_initialises_and_autostarts(db: AsyncSession) -> None:
    state = await engine.tick(db, get_redis())
    assert state is not None and state.running


async def test_speed_control(client: AsyncClient, login_as: LoginAs) -> None:
    admin = await login_as("admin")
    assert (await client.post(f"{S}/speed", json={"speed": 5}, headers=admin)).json()["speed"] == 5
    assert (await client.post(f"{S}/speed", json={"speed": 3}, headers=admin)).status_code == 400
    s = await control.read_state()
    assert s.speed == 5


async def test_controls_before_first_tick_still_warm_start(db: AsyncSession) -> None:
    redis = get_redis()
    await control.set_speed(2.0, redis)  # admin touches a control before the worker ran
    assert not (await control.read_state(redis)).initialized
    await control.set_running(True, redis)
    state = await engine.tick(db, redis)  # first tick still performs the warm start
    assert state is not None and state.initialized and state.speed == 2.0
    assert state.sim_time.hour == 14


async def test_pause_and_start(client: AsyncClient, login_as: LoginAs) -> None:
    admin = await login_as("admin")
    assert (await client.post(f"{S}/pause", headers=admin)).json()["running"] is False
    assert (await client.post(f"{S}/start", headers=admin)).json()["running"] is True


async def test_downtime_drill_takes_ride_down_and_auto_repairs(
    client: AsyncClient, login_as: LoginAs, db: AsyncSession
) -> None:
    admin = await login_as("admin")
    redis = get_redis()
    await engine.reset(db, redis, running=True)
    resp = await client.post(
        f"{S}/downtime", json={"attraction_slug": "brass-comet", "minutes": 5}, headers=admin
    )
    assert resp.status_code == 200
    ride = (await client.get("/api/v1/attractions/brass-comet", headers=admin)).json()
    assert ride["status"] == "down"

    # Drive the simulated clock forward at 10 min/tick until the repair plan completes.
    await control.set_speed(10.0, redis)
    for _ in range(6):
        await engine.tick(db, redis)
    ride = (await client.get("/api/v1/attractions/brass-comet", headers=admin)).json()
    assert ride["status"] == "operating"
    ticket = (await client.get(f"/api/v1/tickets/{resp.json()['ticket_id']}", headers=admin)).json()
    assert ticket["state"] in ("resolved", "closed")
    assert ticket["assignee"] is not None

    # Recovery is reported on the park clock: at least the 5 simulated repair minutes,
    # even though only seconds of wall time passed.
    rel = (await client.get("/api/v1/analytics/reliability", headers=admin)).json()
    assert rel["mttr_park_minutes"] is not None and rel["mttr_park_minutes"] >= 5
    assert rel["mttr_minutes"] < 1


async def test_downtime_on_a_down_ride_is_rejected(client: AsyncClient, login_as: LoginAs) -> None:
    admin = await login_as("admin")
    await client.post(
        "/api/v1/attractions/orbit-9/status", json={"status": "closed"}, headers=admin
    )
    resp = await client.post(f"{S}/downtime", json={"attraction_slug": "orbit-9"}, headers=admin)
    assert resp.status_code == 400
