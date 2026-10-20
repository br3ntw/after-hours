"""ASGI application factory. Run with ``uvicorn afterhours.main:app``."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from afterhours import models  # noqa: F401 - register all mappers before first query
from afterhours.analytics.router import router as analytics_router
from afterhours.attractions.router import router as attractions_router
from afterhours.auth.router import router as auth_router
from afterhours.core.config import get_settings
from afterhours.core.db import get_engine
from afterhours.core.errors import register_error_handlers
from afterhours.core.logging import configure_logging, get_logger
from afterhours.core.middleware import RequestContextMiddleware
from afterhours.core.redis import get_redis
from afterhours.events.gateway import router as events_router
from afterhours.health.router import router as health_router
from afterhours.maintenance.router import router as maintenance_router
from afterhours.observability.metrics import router as metrics_router
from afterhours.simulation.router import router as simulation_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_logger(__name__).info("app.startup", env=get_settings().env)
    yield
    await get_redis().aclose()
    await get_engine().dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)

    app = FastAPI(
        title="AFTER HOURS Operations API",
        summary="Fictional theme-park operations platform. All operational data is simulated.",
        version="0.1.0",
        lifespan=lifespan,
        # Interactive docs are a dev convenience; the OpenAPI JSON stays available for codegen.
        docs_url="/docs" if settings.env != "prod" else None,
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    # JSON lists compress ~5-10x; HTTP only (Starlette's GZip leaves WebSockets alone).
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(RequestContextMiddleware)
    register_error_handlers(app)

    v1 = APIRouter(prefix="/api/v1")
    v1.include_router(auth_router)
    v1.include_router(attractions_router)
    v1.include_router(maintenance_router)
    v1.include_router(simulation_router)
    v1.include_router(analytics_router)
    app.include_router(v1)
    app.include_router(events_router)
    app.include_router(metrics_router)
    app.include_router(health_router)
    return app


app = create_app()
