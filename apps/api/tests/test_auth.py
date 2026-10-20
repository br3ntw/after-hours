from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from afterhours.audit.models import AuditLog
from afterhours.auth.models import RefreshToken, User
from tests.conftest import SEED_PASSWORD, LoginAs

LOGIN = "/api/v1/auth/login"
ADMIN = {"email": "admin@afterhours.test", "password": SEED_PASSWORD}


async def test_login_returns_access_token_and_hardened_refresh_cookie(client: AsyncClient) -> None:
    resp = await client.post(LOGIN, json=ADMIN)
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "admin"
    assert "users:manage" in body["user"]["permissions"]

    cookie = resp.headers["set-cookie"].lower()
    assert "ah_refresh=" in cookie
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "path=/api/v1/auth" in cookie


async def test_login_is_case_insensitive_on_email(client: AsyncClient) -> None:
    resp = await client.post(LOGIN, json={**ADMIN, "email": "Admin@AfterHours.test"})
    assert resp.status_code == 200


@pytest.mark.parametrize(
    "creds",
    [
        {"email": "admin@afterhours.test", "password": "wrong"},
        {"email": "nobody@afterhours.test", "password": SEED_PASSWORD},
    ],
)
async def test_bad_credentials_give_identical_401(
    client: AsyncClient, creds: dict[str, str]
) -> None:
    resp = await client.post(LOGIN, json=creds)
    assert resp.status_code == 401
    # Same message either way: no account enumeration.
    assert resp.json() == {
        "error": {"code": "unauthenticated", "message": "Invalid email or password"}
    }


async def test_inactive_user_cannot_log_in(client: AsyncClient, db: AsyncSession) -> None:
    user = await db.scalar(select(User).where(User.email == ADMIN["email"]))
    assert user is not None
    user.is_active = False
    await db.flush()
    resp = await client.post(LOGIN, json=ADMIN)
    assert resp.status_code == 401


async def test_validation_errors_use_envelope(client: AsyncClient) -> None:
    resp = await client.post(LOGIN, json={"password": ""})
    assert resp.status_code == 422
    err = resp.json()["error"]
    assert err["code"] == "validation_error"
    assert {tuple(d["loc"]) for d in err["details"]} == {("body", "email"), ("body", "password")}


async def test_me_requires_bearer_token(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"


async def test_me_rejects_tampered_token(client: AsyncClient, login_as: LoginAs) -> None:
    headers = await login_as("analyst")
    headers["Authorization"] += "x"
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401


async def test_me_returns_profile(client: AsyncClient, login_as: LoginAs) -> None:
    resp = await client.get("/api/v1/auth/me", headers=await login_as("technician"))
    assert resp.status_code == 200
    assert resp.json()["role"] == "technician"
    assert "users:manage" not in resp.json()["permissions"]


async def test_refresh_rotates_token(client: AsyncClient) -> None:
    await client.post(LOGIN, json=ADMIN)
    first = client.cookies["ah_refresh"]

    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 200
    assert resp.json()["access_token"]
    assert client.cookies["ah_refresh"] != first


async def _age_revocations(db: AsyncSession, seconds: int) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.revoked_at.is_not(None))
        .values(revoked_at=RefreshToken.revoked_at - timedelta(seconds=seconds))
    )


async def test_refresh_token_reuse_revokes_whole_family(
    client: AsyncClient, db: AsyncSession
) -> None:
    await client.post(LOGIN, json=ADMIN)
    stolen = client.cookies["ah_refresh"]
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200
    legit = client.cookies["ah_refresh"]
    await _age_revocations(db, 60)  # outside the concurrent-refresh grace window

    # Attacker replays the already-rotated token.
    client.cookies.set("ah_refresh", stolen, path="/api/v1/auth")
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401
    assert "reuse" in resp.json()["error"]["message"]

    # The legitimate user's newer token has been revoked too.
    client.cookies.set("ah_refresh", legit, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401

    actions = (await db.scalars(select(AuditLog.action))).all()
    assert "auth.refresh_reuse_detected" in actions


async def test_concurrent_refresh_race_is_not_treated_as_theft(client: AsyncClient) -> None:
    await client.post(LOGIN, json=ADMIN)
    original = client.cookies["ah_refresh"]
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200
    winner = client.cookies["ah_refresh"]

    # A second tab presents the original cookie a moment later.
    client.cookies.set("ah_refresh", original, path="/api/v1/auth")
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "refresh_superseded"

    # The family was NOT revoked: the winning token still works.
    client.cookies.set("ah_refresh", winner, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200


async def test_refresh_without_cookie(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_logout_revokes_refresh_token(client: AsyncClient, db: AsyncSession) -> None:
    await client.post(LOGIN, json=ADMIN)
    token = client.cookies["ah_refresh"]
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    await _age_revocations(db, 60)

    client.cookies.set("ah_refresh", token, path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_login_is_audited(client: AsyncClient, db: AsyncSession) -> None:
    await client.post(LOGIN, json=ADMIN, headers={"X-Request-ID": "req-audit-1"})
    entry = await db.scalar(select(AuditLog).where(AuditLog.action == "auth.login"))
    assert entry is not None
    assert entry.request_id == "req-audit-1"


async def test_repeated_failures_are_rate_limited(client: AsyncClient) -> None:
    bad = {**ADMIN, "password": "wrong"}
    for _ in range(5):
        assert (await client.post(LOGIN, json=bad)).status_code == 401
    resp = await client.post(LOGIN, json=ADMIN)  # even the right password is held back now
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "rate_limited"
    assert 0 < int(resp.headers["retry-after"]) <= 900


async def test_success_clears_the_failure_counter(client: AsyncClient) -> None:
    bad = {**ADMIN, "password": "wrong"}
    for _ in range(4):
        await client.post(LOGIN, json=bad)
    assert (await client.post(LOGIN, json=ADMIN)).status_code == 200
    for _ in range(4):  # a fresh window: four more failures are still allowed
        assert (await client.post(LOGIN, json=bad)).status_code == 401


async def test_rate_limit_is_per_account(client: AsyncClient) -> None:
    for _ in range(5):
        await client.post(LOGIN, json={**ADMIN, "password": "wrong"})
    other = {"email": "ops@afterhours.test", "password": SEED_PASSWORD}
    assert (await client.post(LOGIN, json=other)).status_code == 200
