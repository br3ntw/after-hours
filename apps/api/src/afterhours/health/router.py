import asyncio
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from afterhours.core.db import get_engine
from afterhours.core.logging import get_logger
from afterhours.core.redis import get_redis

router = APIRouter(tags=["health"])
log = get_logger(__name__)


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """Liveness: the process is up and serving. Deliberately checks no dependencies."""
    return {"status": "ok"}


async def _check_db() -> None:
    async with get_engine().connect() as conn:
        await conn.execute(text("SELECT 1"))


async def _check_redis() -> None:
    await get_redis().ping()


@router.get("/readyz")
async def readyz() -> JSONResponse:
    """Readiness: dependencies reachable. A load balancer should stop routing on 503."""
    checks: dict[str, Any] = {}
    for name, check in (("database", _check_db), ("redis", _check_redis)):
        try:
            await asyncio.wait_for(check(), timeout=2)
            checks[name] = "ok"
        except Exception as exc:
            log.warning("readyz.check_failed", dependency=name, error=type(exc).__name__)
            checks[name] = "unavailable"
    ready = all(v == "ok" for v in checks.values())
    return JSONResponse(
        {"status": "ready" if ready else "degraded", "checks": checks},
        status_code=200 if ready else 503,
    )
