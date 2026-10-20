import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from afterhours.attractions.models import Attraction, StatusHistory
from afterhours.audit.models import AuditLog
from afterhours.events.publisher import recent_activity
from tests.conftest import LoginAs, stream_events

URL = "/api/v1/attractions/orbit-9"


@pytest.mark.parametrize(
    ("role", "code"), [("analyst", 403), ("technician", 403), ("ops_manager", 200)]
)
async def test_status_change_requires_permission(
    client: AsyncClient, login_as: LoginAs, role: str, code: int
) -> None:
    resp = await client.post(
        f"{URL}/status", json={"status": "closed"}, headers=await login_as(role)
    )
    assert resp.status_code == code


async def test_status_change_records_history_audit_and_event(
    client: AsyncClient, login_as: LoginAs, db: AsyncSession
) -> None:
    resp = await client.post(
        f"{URL}/status",
        json={"status": "down", "reason": "Wheel assembly inspection"},
        headers=await login_as("ops_manager"),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "down"

    ride = await db.scalar(select(Attraction).where(Attraction.slug == "orbit-9"))
    assert ride is not None
    intervals = (
        await db.scalars(
            select(StatusHistory)
            .where(StatusHistory.attraction_id == ride.id)
            .order_by(StatusHistory.started_at)
        )
    ).all()
    assert [(i.status.value, i.ended_at is None) for i in intervals] == [
        ("operating", False),
        ("down", True),
    ]

    audit = await db.scalar(select(AuditLog).where(AuditLog.action == "attraction.status_changed"))
    assert audit is not None and audit.after == {
        "status": "down",
        "reason": "Wheel assembly inspection",
    }

    [event] = await stream_events("attraction.status_changed")
    assert event["payload"] == {
        "slug": "orbit-9",
        "name": "Orbit 9",
        "land": "Starlight Pier",
        "from": "operating",
        "to": "down",
        "reason": "Wheel assembly inspection",
        "actor": "Morgan Ops",
        "version": resp.json()["version"],
    }
    feed = await recent_activity()
    assert feed[0]["type"] == "attraction.status_changed"


async def test_same_status_is_a_noop(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.post(
        f"{URL}/status", json={"status": "operating"}, headers=await login_as("admin")
    )
    assert resp.status_code == 200
    assert await stream_events() == []


async def test_configure_derives_capacity(client: AsyncClient, login_as: LoginAs) -> None:
    headers = await login_as("ops_manager")
    version = (await client.get(URL, headers=headers)).json()["version"]
    resp = await client.patch(
        URL,
        json={"version": version, "riders_per_dispatch": 30, "dispatch_interval_s": 60},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["hourly_capacity"] == 1800
    assert resp.json()["version"] == version + 1


async def test_configure_with_stale_version_conflicts(
    client: AsyncClient, login_as: LoginAs
) -> None:
    headers = await login_as("ops_manager")
    resp = await client.patch(URL, json={"version": 99, "riders_per_dispatch": 30}, headers=headers)
    assert resp.status_code == 409
    assert resp.json()["error"]["details"] == {"current_version": 1}


async def test_configure_rejects_impossible_capacity(
    client: AsyncClient, login_as: LoginAs
) -> None:
    resp = await client.patch(
        URL,
        json={"version": 1, "riders_per_dispatch": 1000, "dispatch_interval_s": 5},
        headers=await login_as("admin"),
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["details"]["hourly_capacity"] == 720_000


async def test_configure_requires_a_change(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.patch(URL, json={"version": 1}, headers=await login_as("admin"))
    assert resp.status_code == 422


async def test_technician_cannot_configure(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.patch(
        URL, json={"version": 1, "riders_per_dispatch": 20}, headers=await login_as("technician")
    )
    assert resp.status_code == 403
