from typing import Any

from httpx import AsyncClient

from tests.conftest import LoginAs, stream_events

T = "/api/v1/tickets"


def ticket(severity: str = "sev3", slug: str = "glacier-run") -> dict[str, Any]:
    return {
        "attraction_slug": slug,
        "title": "Restraint sensor intermittent",
        "description": "Row 3 lap bar reports unlocked on dispatch",
        "issue_type": "electrical",
        "severity": severity,
    }


async def _technicians(client: AsyncClient, headers: dict[str, str]) -> dict[str, str]:
    techs = (await client.get("/api/v1/technicians", headers=headers)).json()
    return {t["full_name"]: t["id"] for t in techs}


async def test_analyst_cannot_create_tickets(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.post(T, json=ticket(), headers=await login_as("analyst"))
    assert resp.status_code == 403


async def test_technician_can_report_an_incident(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.post(T, json=ticket(), headers=await login_as("technician"))
    assert resp.status_code == 201
    body = resp.json()
    assert body["ref"].startswith("MT-")
    assert body["state"] == "open"
    assert body["source"] == "operator"
    assert [e["kind"] for e in body["events"]] == ["created"]
    assert [e["type"] for e in await stream_events()] == ["ticket.created"]


async def test_sev1_takes_attraction_down_and_resolution_reopens_it(
    client: AsyncClient, login_as: LoginAs
) -> None:
    ops = await login_as("ops_manager")
    created = (await client.post(T, json=ticket("sev1"), headers=ops)).json()
    ride = (await client.get("/api/v1/attractions/glacier-run", headers=ops)).json()
    assert ride["status"] == "down"

    techs = await _technicians(client, ops)
    tid = created["id"]
    resp = await client.post(
        f"{T}/{tid}/assign", json={"assignee_id": techs["Riley Technician"]}, headers=ops
    )
    assert resp.json()["state"] == "assigned"

    tech = await login_as("technician")  # Riley
    for state in ("in_progress", "resolved"):
        resp = await client.post(
            f"{T}/{tid}/transition", json={"to_state": state, "note": "ok"}, headers=tech
        )
        assert resp.status_code == 200, resp.text

    ride = (await client.get("/api/v1/attractions/glacier-run", headers=ops)).json()
    assert ride["status"] == "operating"
    detail = (await client.get(f"{T}/{tid}", headers=ops)).json()
    assert [e["kind"] for e in detail["events"]] == [
        "created",
        "assigned",
        "state_changed",
        "state_changed",
    ]
    assert detail["resolved_at"] is not None

    types = [e["type"] for e in await stream_events()]
    assert types.count("attraction.status_changed") == 2


async def test_another_open_sev1_keeps_the_ride_down(
    client: AsyncClient, login_as: LoginAs
) -> None:
    ops = await login_as("ops_manager")
    first = (await client.post(T, json=ticket("sev1"), headers=ops)).json()
    await client.post(T, json=ticket("sev1"), headers=ops)
    for state in ("in_progress", "resolved"):
        await client.post(f"{T}/{first['id']}/transition", json={"to_state": state}, headers=ops)
    ride = (await client.get("/api/v1/attractions/glacier-run", headers=ops)).json()
    assert ride["status"] == "down"


async def test_technician_cannot_work_someone_elses_ticket(
    client: AsyncClient, login_as: LoginAs
) -> None:
    ops = await login_as("ops_manager")
    created = (await client.post(T, json=ticket(), headers=ops)).json()
    techs = await _technicians(client, ops)
    await client.post(
        f"{T}/{created['id']}/assign", json={"assignee_id": techs["Sam Okafor"]}, headers=ops
    )

    resp = await client.post(
        f"{T}/{created['id']}/transition",
        json={"to_state": "in_progress"},
        headers=await login_as("technician"),  # Riley, not Sam
    )
    assert resp.status_code == 403


async def test_invalid_transition_is_rejected(client: AsyncClient, login_as: LoginAs) -> None:
    ops = await login_as("ops_manager")
    created = (await client.post(T, json=ticket(), headers=ops)).json()
    resp = await client.post(
        f"{T}/{created['id']}/transition", json={"to_state": "closed"}, headers=ops
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_transition"
    assert resp.json()["error"]["details"] == {"allowed": ["in_progress"]}


async def test_only_technicians_can_be_assigned(client: AsyncClient, login_as: LoginAs) -> None:
    ops = await login_as("ops_manager")
    created = (await client.post(T, json=ticket(), headers=ops)).json()
    me = (await client.get("/api/v1/auth/me", headers=ops)).json()
    resp = await client.post(
        f"{T}/{created['id']}/assign", json={"assignee_id": me["id"]}, headers=ops
    )
    assert resp.status_code == 400


async def test_technician_cannot_assign(client: AsyncClient, login_as: LoginAs) -> None:
    tech = await login_as("technician")
    created = (await client.post(T, json=ticket(), headers=tech)).json()
    techs = await _technicians(client, tech)
    resp = await client.post(
        f"{T}/{created['id']}/assign", json={"assignee_id": techs["Riley Technician"]}, headers=tech
    )
    assert resp.status_code == 403


async def test_open_only_filter(client: AsyncClient, login_as: LoginAs) -> None:
    ops = await login_as("ops_manager")
    created = (await client.post(T, json=ticket(), headers=ops)).json()
    for state in ("in_progress", "resolved", "closed"):
        await client.post(f"{T}/{created['id']}/transition", json={"to_state": state}, headers=ops)
    await client.post(T, json=ticket(slug="orbit-9"), headers=ops)
    open_tickets = (await client.get(f"{T}?open_only=true", headers=ops)).json()
    assert [t["attraction"]["slug"] for t in open_tickets] == ["orbit-9"]
