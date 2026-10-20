from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from afterhours.attractions import service
from afterhours.attractions.models import AttractionStatus, AttractionType, MetricSample
from afterhours.attractions.schemas import (
    AttractionOut,
    ConfigureIn,
    LandOut,
    MetricPointOut,
    StatusChangeIn,
    StatusIntervalOut,
)
from afterhours.attractions.service import Actor
from afterhours.auth.deps import DbSession, require
from afterhours.auth.models import User
from afterhours.auth.permissions import Permission
from afterhours.core.errors import AppError

router = APIRouter(
    tags=["attractions"], dependencies=[Depends(require(Permission.VIEW_OPERATIONS))]
)

ChangeStatusUser = Annotated[User, Depends(require(Permission.CHANGE_ATTRACTION_STATUS))]
ConfigureUser = Annotated[User, Depends(require(Permission.CONFIGURE_ATTRACTION))]
MAX_HOURLY_CAPACITY = 5000


@router.get("/lands")
async def list_lands(db: DbSession) -> list[LandOut]:
    return [LandOut.model_validate(land) for land in await service.list_lands(db)]


@router.get("/attractions")
async def list_attractions(
    db: DbSession,
    land: Annotated[str | None, Query(max_length=64)] = None,
    type: Annotated[AttractionType | None, Query()] = None,
    status: Annotated[AttractionStatus | None, Query()] = None,
) -> list[AttractionOut]:
    rows = await service.list_attractions(db, land=land, type_=type, status=status)
    return [AttractionOut.model_validate(a) for a in rows]


@router.get("/attractions/{slug}")
async def get_attraction(db: DbSession, slug: str) -> AttractionOut:
    return AttractionOut.model_validate(await service.get_attraction(db, slug))


@router.get("/attractions/{slug}/status-history")
async def get_status_history(
    db: DbSession, slug: str, limit: Annotated[int, Query(ge=1, le=500)] = 50
) -> list[StatusIntervalOut]:
    attraction = await service.get_attraction(db, slug)
    rows = await service.status_history(db, attraction, limit)
    return [StatusIntervalOut.model_validate(r) for r in rows]


@router.get("/attractions/{slug}/metrics")
async def get_metrics(
    db: DbSession, slug: str, limit: Annotated[int, Query(ge=1, le=1000)] = 240
) -> list[MetricPointOut]:
    """Most recent simulated samples, oldest first (ready to plot)."""
    attraction = await service.get_attraction(db, slug)
    rows = (
        await db.scalars(
            select(MetricSample)
            .where(MetricSample.attraction_id == attraction.id)
            .order_by(MetricSample.sim_time.desc())
            .limit(limit)
        )
    ).all()
    return [MetricPointOut.model_validate(r) for r in reversed(rows)]


@router.post("/attractions/{slug}/status")
async def change_status(
    db: DbSession, slug: str, body: StatusChangeIn, user: ChangeStatusUser
) -> AttractionOut:
    attraction = await service.change_status(
        db, slug, body.status, actor=Actor.of(user), reason=body.reason
    )
    await db.refresh(attraction)
    return AttractionOut.model_validate(attraction)


@router.patch("/attractions/{slug}")
async def configure(
    db: DbSession, slug: str, body: ConfigureIn, user: ConfigureUser
) -> AttractionOut:
    current = await service.get_attraction(db, slug)
    rpd = body.riders_per_dispatch or current.riders_per_dispatch
    interval = body.dispatch_interval_s or current.dispatch_interval_s
    if rpd * 3600 / interval > MAX_HOURLY_CAPACITY:
        raise AppError(
            f"That would exceed {MAX_HOURLY_CAPACITY:,} riders/hour",
            details={"hourly_capacity": round(rpd * 3600 / interval)},
        )
    attraction = await service.configure(
        db,
        slug,
        expected_version=body.version,
        riders_per_dispatch=body.riders_per_dispatch,
        dispatch_interval_s=body.dispatch_interval_s,
        actor=Actor.of(user),
    )
    await db.refresh(attraction)
    return AttractionOut.model_validate(attraction)
