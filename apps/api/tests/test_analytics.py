from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from afterhours.core.redis import get_redis
from afterhours.simulation import engine
from tests.conftest import LoginAs


async def test_overview_is_labelled_simulated(
    client: AsyncClient, login_as: LoginAs, db: AsyncSession
) -> None:
    await engine.reset(db, get_redis(), running=True)
    body = (await client.get("/api/v1/overview", headers=await login_as("analyst"))).json()
    assert body["simulated"] is True
    assert body["attractions_total"] == 24
    assert body["attractions_up"] == 24
    assert body["guests_in_park"] > 0
    assert body["avg_wait_minutes"] >= 0
    assert set(body["open_incidents"]) == {"sev1", "sev2", "sev3", "sev4"}
    assert len(body["trend"]) > 10


async def test_guest_flow_is_downsampled(
    client: AsyncClient, login_as: LoginAs, db: AsyncSession
) -> None:
    await engine.reset(db, get_redis(), running=True)
    body = (
        await client.get(
            "/api/v1/analytics/guest-flow?max_points=20", headers=await login_as("analyst")
        )
    ).json()
    assert len(body["points"]) == 20
    times = [p["sim_time"] for p in body["points"]]
    assert times == sorted(times)
    assert body["riders_today"] > 0


async def test_reliability_reflects_downtime(client: AsyncClient, login_as: LoginAs) -> None:
    ops = await login_as("ops_manager")
    await client.post("/api/v1/attractions/orbit-9/status", json={"status": "down"}, headers=ops)
    body = (await client.get("/api/v1/analytics/reliability", headers=ops)).json()
    orbit = next(a for a in body["attractions"] if a["slug"] == "orbit-9")
    assert orbit["uptime_pct"] < 100
    assert body["uptime_pct"] < 100


async def test_activity_feed_lists_operator_events(client: AsyncClient, login_as: LoginAs) -> None:
    ops = await login_as("ops_manager")
    await client.post("/api/v1/attractions/orbit-9/status", json={"status": "closed"}, headers=ops)
    feed = (await client.get("/api/v1/activity", headers=ops)).json()
    assert feed[0]["type"] == "attraction.status_changed"
    assert feed[0]["payload"]["to"] == "closed"
    assert feed[0]["id"]
