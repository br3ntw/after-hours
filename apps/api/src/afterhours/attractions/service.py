import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from afterhours.attractions.models import (
    Attraction,
    AttractionStatus,
    AttractionType,
    Land,
    StatusHistory,
)
from afterhours.audit.service import record
from afterhours.auth.models import User
from afterhours.core.errors import ConflictError, NotFoundError
from afterhours.events.publisher import publish


async def list_lands(db: AsyncSession) -> Sequence[Land]:
    return (await db.scalars(select(Land).order_by(Land.sort_order))).all()


async def list_attractions(
    db: AsyncSession,
    *,
    land: str | None = None,
    type_: AttractionType | None = None,
    status: AttractionStatus | None = None,
) -> Sequence[Attraction]:
    stmt = select(Attraction).join(Attraction.land).order_by(Land.sort_order, Attraction.name)
    if land:
        stmt = stmt.where(Land.slug == land)
    if type_:
        stmt = stmt.where(Attraction.type == type_)
    if status:
        stmt = stmt.where(Attraction.status == status)
    return (await db.scalars(stmt)).all()


async def get_attraction(db: AsyncSession, slug: str) -> Attraction:
    attraction = await db.scalar(select(Attraction).where(Attraction.slug == slug))
    if attraction is None:
        raise NotFoundError(f"Attraction '{slug}' not found")
    return attraction


async def status_history(
    db: AsyncSession, attraction: Attraction, limit: int
) -> Sequence[StatusHistory]:
    stmt = (
        select(StatusHistory)
        .where(StatusHistory.attraction_id == attraction.id)
        .order_by(StatusHistory.started_at.desc())
        .limit(limit)
    )
    return (await db.scalars(stmt)).all()


# --- Mutations -------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Actor:
    """Who made a change: a user, or the simulation (``user_id=None``)."""

    user_id: uuid.UUID | None
    name: str

    @classmethod
    def of(cls, user: User) -> "Actor":
        return cls(user.id, user.full_name)


SYSTEM = Actor(None, "Simulation")


def _status_event(
    a: Attraction, old: AttractionStatus, reason: str | None, actor: Actor
) -> dict[str, Any]:
    return {
        "slug": a.slug,
        "name": a.name,
        "land": a.land.name,
        "from": old.value,
        "to": a.status.value,
        "reason": reason,
        "actor": actor.name,
        "version": a.version,
    }


async def change_status(
    db: AsyncSession,
    slug: str,
    new_status: AttractionStatus,
    *,
    actor: Actor,
    reason: str | None = None,
    publish_event: bool = True,
) -> Attraction:
    """Close the open status interval, open a new one, audit it, commit, then publish.

    The row lock serialises an operator and the simulation worker changing the same ride at
    once; the partial unique index on open intervals is the database-level backstop.
    """
    attraction = await db.scalar(
        select(Attraction).where(Attraction.slug == slug).with_for_update(of=Attraction)
    )
    if attraction is None:
        raise NotFoundError(f"Attraction '{slug}' not found")
    old = attraction.status
    if old == new_status:
        return attraction

    now = datetime.now(UTC)
    await db.execute(
        update(StatusHistory)
        .where(StatusHistory.attraction_id == attraction.id, StatusHistory.ended_at.is_(None))
        .values(ended_at=now)
    )
    db.add(
        StatusHistory(
            attraction_id=attraction.id,
            status=new_status,
            started_at=now,
            reason=reason,
            changed_by=actor.user_id,
        )
    )
    attraction.status = new_status
    record(
        db,
        actor_id=actor.user_id,
        action="attraction.status_changed",
        entity_type="attraction",
        entity_id=slug,
        before={"status": old.value},
        after={"status": new_status.value, "reason": reason},
    )
    await db.commit()
    if publish_event:
        await publish(
            "attraction.status_changed",
            _status_event(attraction, old, reason, actor),
            entity_id=slug,
        )
    return attraction


async def configure(
    db: AsyncSession,
    slug: str,
    *,
    expected_version: int,
    riders_per_dispatch: int | None,
    dispatch_interval_s: int | None,
    actor: Actor,
) -> Attraction:
    """Change dispatch parameters. Hourly capacity is derived, never set independently,
    so the three numbers can't disagree."""
    attraction = await get_attraction(db, slug)
    if attraction.version != expected_version:
        raise ConflictError(
            "Attraction was changed by someone else; reload and retry",
            details={"current_version": attraction.version},
        )
    before = {
        "riders_per_dispatch": attraction.riders_per_dispatch,
        "dispatch_interval_s": attraction.dispatch_interval_s,
        "hourly_capacity": attraction.hourly_capacity,
    }
    if riders_per_dispatch is not None:
        attraction.riders_per_dispatch = riders_per_dispatch
    if dispatch_interval_s is not None:
        attraction.dispatch_interval_s = dispatch_interval_s
    attraction.hourly_capacity = round(
        attraction.riders_per_dispatch * 3600 / attraction.dispatch_interval_s
    )
    after = {
        "riders_per_dispatch": attraction.riders_per_dispatch,
        "dispatch_interval_s": attraction.dispatch_interval_s,
        "hourly_capacity": attraction.hourly_capacity,
    }
    record(
        db,
        actor_id=actor.user_id,
        action="attraction.configured",
        entity_type="attraction",
        entity_id=slug,
        before=before,
        after=after,
    )
    try:
        await db.commit()
    except StaleDataError as exc:  # a concurrent writer won between our read and commit
        await db.rollback()
        raise ConflictError("Attraction was changed by someone else; reload and retry") from exc
    await publish(
        "attraction.configured",
        {
            "slug": slug,
            "name": attraction.name,
            "actor": actor.name,
            **after,
            "version": attraction.version,
        },
        entity_id=slug,
    )
    return attraction
