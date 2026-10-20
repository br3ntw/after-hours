import random
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from afterhours.analytics.schemas import SimStateOut
from afterhours.attractions import service as attractions
from afterhours.attractions.models import AttractionStatus
from afterhours.attractions.service import Actor
from afterhours.auth.deps import DbSession, require
from afterhours.auth.models import User
from afterhours.auth.permissions import Permission
from afterhours.core.errors import AppError
from afterhours.core.redis import get_redis
from afterhours.events.publisher import publish
from afterhours.maintenance.models import IssueType, Severity
from afterhours.simulation import control, engine

router = APIRouter(prefix="/simulation", tags=["simulation"])
Controller = Annotated[User, Depends(require(Permission.CONTROL_SIMULATION))]


class SpeedIn(BaseModel):
    speed: float = Field(description=f"Simulated minutes per tick; one of {control.SPEEDS}")


class DowntimeIn(BaseModel):
    attraction_slug: str = Field(min_length=1, max_length=64)
    minutes: int = Field(default=30, ge=5, le=240, description="Simulated repair time")
    reason: str = Field(default="Operator-triggered downtime drill", max_length=140)


@router.get("", dependencies=[Depends(require(Permission.VIEW_OPERATIONS))])
async def get_state() -> SimStateOut:
    return _out(await control.read_state())


def _out(state: control.SimState) -> SimStateOut:
    return SimStateOut.model_validate(state.as_dict() | {"speeds": list(control.SPEEDS)})


async def _announce(action: str, user: User, state: control.SimState) -> SimStateOut:
    await publish("sim.control", {"action": action, "actor": user.full_name, **state.as_dict()})
    return _out(state)


@router.post("/start")
async def start(user: Controller) -> SimStateOut:
    return await _announce("start", user, await control.set_running(True))


@router.post("/pause")
async def pause(user: Controller) -> SimStateOut:
    return await _announce("pause", user, await control.set_running(False))


@router.post("/speed")
async def speed(body: SpeedIn, user: Controller) -> SimStateOut:
    try:
        state = await control.set_speed(body.speed)
    except ValueError as exc:
        raise AppError(str(exc)) from exc
    return await _announce(f"speed {body.speed:g}x", user, state)


@router.post("/reset")
async def reset(db: DbSession, user: Controller) -> SimStateOut:
    current = await control.read_state()
    state = await engine.reset(
        db, get_redis(), running=current.running or not current.initialized, actor=Actor.of(user)
    )
    return _out(state)


@router.post("/downtime")
async def trigger_downtime(db: DbSession, body: DowntimeIn, user: Controller) -> dict[str, str]:
    """Incident drill: opens a SEV1 simulation ticket (taking the ride down) that the
    simulation then works and resolves after ``minutes`` of simulated time."""
    attraction = await attractions.get_attraction(db, body.attraction_slug)
    if attraction.status not in (AttractionStatus.OPERATING, AttractionStatus.DELAYED):
        raise AppError(f"{attraction.name} is already {attraction.status.value}")
    state = await control.read_state()
    ticket = await engine.schedule_breakdown(
        db,
        get_redis(),
        attraction.slug,
        IssueType.SAFETY,
        Severity.SEV1,
        body.reason,
        state,
        random.Random(),
        actor=Actor.of(user),
        repair_minutes=body.minutes,
    )
    return {"ticket_id": str(ticket.id), "ref": f"MT-{ticket.number}"}
