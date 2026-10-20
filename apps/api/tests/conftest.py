"""Test harness.

* Runs the real Alembic migrations (down to base, then up to head) against a dedicated
  test database, so every run also verifies that the migrations work in both directions.
* Seeds the fictional park once and commits it.
* Wraps each test in an outer transaction that is rolled back afterwards. Application code
  may still call ``commit()``; with ``join_transaction_mode="create_savepoint"`` that only
  releases a savepoint, so tests never leak state into each other.
"""

import os
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any, cast

# Must be set before anything imports afterhours (settings are cached at first use).
os.environ.setdefault("AH_ENV", "test")
os.environ["AH_DATABASE_URL"] = os.environ.get(
    "AH_TEST_DATABASE_URL", "postgresql+asyncpg://localhost/afterhours_test"
)
os.environ.setdefault("AH_JWT_SECRET", "test-secret-" + "x" * 40)
os.environ.setdefault("AH_LOG_JSON", "false")
os.environ.setdefault("AH_LOG_LEVEL", "WARNING")
# Separate Redis keys (and DB 1) so tests never touch a running dev park.
os.environ.setdefault("AH_REDIS_URL", "redis://localhost:6379/1")
os.environ["AH_EVENTS_STREAM"] = "ah:test:events"
os.environ["AH_ACTIVITY_LIST"] = "ah:test:activity"
os.environ["AH_SIM_STATE_KEY"] = "ah:test:sim"
os.environ["AH_DEMO_LOGIN"] = "true"

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, AsyncSession, create_async_engine

from afterhours.core.config import get_settings
from afterhours.core.db import get_session
from afterhours.main import app
from afterhours.seed import seed

API_DIR = os.path.dirname(os.path.dirname(__file__))
SEED_PASSWORD = "correct-horse-battery-staple"


def _alembic(connection: object, *revisions: str) -> None:
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(API_DIR, "migrations"))
    cfg.attributes["connection"] = connection
    for rev in revisions:
        if rev == "base":
            command.downgrade(cfg, "base")
        else:
            command.upgrade(cfg, rev)


@pytest.fixture(scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(get_settings().database_url)
    async with eng.begin() as conn:
        await conn.run_sync(lambda c: _alembic(c, "base", "head"))
    async with AsyncSession(eng, expire_on_commit=False) as db:
        await seed(db, SEED_PASSWORD)
    yield eng
    await eng.dispose()


@pytest.fixture
async def connection(engine: AsyncEngine) -> AsyncIterator[AsyncConnection]:
    async with engine.connect() as conn:
        outer = await conn.begin()
        yield conn
        await outer.rollback()


@pytest.fixture
async def db(connection: AsyncConnection) -> AsyncIterator[AsyncSession]:
    async with AsyncSession(
        bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    ) as session:
        yield session


@pytest.fixture
async def client(db: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _session_override() -> AsyncIterator[AsyncSession]:
        yield db

    app.dependency_overrides[get_session] = _session_override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


LoginAs = Callable[[str], Awaitable[dict[str, str]]]

ROLE_EMAILS = {
    "admin": "admin@afterhours.test",
    "ops_manager": "ops@afterhours.test",
    "technician": "tech@afterhours.test",
    "analyst": "analyst@afterhours.test",
}


@pytest.fixture
def login_as(client: AsyncClient) -> LoginAs:
    """Return auth headers for a seeded user of the given role."""

    async def _login(role: str) -> dict[str, str]:
        resp = await client.post(
            "/api/v1/auth/login", json={"email": ROLE_EMAILS[role], "password": SEED_PASSWORD}
        )
        assert resp.status_code == 200, resp.text
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    return _login


@pytest.fixture(autouse=True)
async def clean_redis() -> AsyncIterator[None]:
    """Tests use Redis DB 1 only (see env above), so flushing it is safe."""
    from afterhours.core.redis import get_redis

    redis = get_redis()
    assert get_settings().redis_url.endswith("/1") or os.environ.get("CI")
    await redis.flushdb()
    yield


async def stream_events(event_type: str | None = None) -> list[dict[str, Any]]:
    import json

    from afterhours.core.redis import get_redis
    from afterhours.events.gateway import StreamEntries

    rows = cast(StreamEntries, await get_redis().xrange(get_settings().events_stream))
    events = [json.loads(fields["data"]) for _, fields in rows]
    return [e for e in events if event_type is None or e["type"] == event_type]
