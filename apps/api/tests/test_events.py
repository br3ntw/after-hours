from httpx import AsyncClient

from afterhours.core.config import get_settings
from afterhours.core.redis import get_redis
from afterhours.events.gateway import redeem_ticket, replay_since
from afterhours.events.publisher import publish
from tests.conftest import LoginAs


async def test_ws_ticket_is_single_use(client: AsyncClient, login_as: LoginAs) -> None:
    headers = await login_as("analyst")
    me = (await client.get("/api/v1/auth/me", headers=headers)).json()
    ticket = (await client.post("/api/v1/ws-ticket", headers=headers)).json()["ticket"]
    redis = get_redis()
    assert str(await redeem_ticket(redis, ticket)) == me["id"]
    assert await redeem_ticket(redis, ticket) is None


async def test_ws_ticket_requires_auth(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/ws-ticket")).status_code == 401


async def test_replay_returns_only_newer_events_in_order() -> None:
    ids = [await publish("test.event", {"n": n}) for n in range(5)]
    assert all(ids)
    events, resync = await replay_since(get_redis(), ids[1])  # type: ignore[arg-type]
    assert not resync
    assert [e[0] for e in events] == ids[2:]


async def test_replay_flags_resync_when_history_was_trimmed() -> None:
    redis = get_redis()
    for n in range(3):
        await publish("test.event", {"n": n})
    await redis.xtrim(get_settings().events_stream, maxlen=1)
    events, resync = await replay_since(redis, "1-0")
    assert resync and events == []


async def test_demo_login(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/demo-config")).json() == {"demo_login": True}
    resp = await client.post("/api/v1/auth/demo-login", json={"role": "technician"})
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "technician"
    assert "ah_refresh=" in resp.headers["set-cookie"]


async def test_demo_login_rejects_unknown_role(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/auth/demo-login", json={"role": "root"})).status_code == 422
