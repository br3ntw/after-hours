from httpx import AsyncClient

from afterhours.seed import ATTRACTIONS, LANDS
from tests.conftest import LoginAs


async def test_list_lands_in_display_order(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.get("/api/v1/lands", headers=await login_as("analyst"))
    assert [land["slug"] for land in resp.json()] == [land["slug"] for land in LANDS]


async def test_list_attractions(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.get("/api/v1/attractions", headers=await login_as("analyst"))
    body = resp.json()
    assert len(body) == len(ATTRACTIONS)
    first = body[0]
    assert first["land"]["slug"] == "tidewater-quay"
    assert first["status"] == "operating"
    assert first["version"] == 1


async def test_filter_by_type_and_land(client: AsyncClient, login_as: LoginAs) -> None:
    headers = await login_as("analyst")
    resp = await client.get("/api/v1/attractions?type=coaster", headers=headers)
    assert {a["type"] for a in resp.json()} == {"coaster"}
    assert len(resp.json()) == sum(1 for a in ATTRACTIONS if a[3] == "coaster")

    resp = await client.get("/api/v1/attractions?land=emberwood&type=show", headers=headers)
    assert [a["slug"] for a in resp.json()] == ["hearthsong-theater"]


async def test_invalid_filter_is_rejected(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.get(
        "/api/v1/attractions?status=exploded", headers=await login_as("analyst")
    )
    assert resp.status_code == 422


async def test_get_attraction_and_history(client: AsyncClient, login_as: LoginAs) -> None:
    headers = await login_as("analyst")
    resp = await client.get("/api/v1/attractions/orbit-9", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Orbit 9"

    resp = await client.get("/api/v1/attractions/orbit-9/status-history", headers=headers)
    history = resp.json()
    assert len(history) == 1
    assert history[0]["status"] == "operating"
    assert history[0]["ended_at"] is None


async def test_unknown_attraction_is_404(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.get("/api/v1/attractions/nope", headers=await login_as("analyst"))
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"
