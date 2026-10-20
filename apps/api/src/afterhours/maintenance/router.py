import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from afterhours.attractions.service import Actor
from afterhours.auth.deps import CurrentUser, DbSession, require
from afterhours.auth.models import User
from afterhours.auth.permissions import Permission, has_permission
from afterhours.core.errors import PermissionDeniedError
from afterhours.maintenance import service
from afterhours.maintenance.schemas import (
    AssignIn,
    PersonOut,
    TicketCreateIn,
    TicketDetailOut,
    TicketOut,
    TransitionIn,
)

router = APIRouter(
    tags=["maintenance"], dependencies=[Depends(require(Permission.VIEW_OPERATIONS))]
)


@router.get("/tickets")
async def list_tickets(
    db: DbSession,
    open_only: bool = False,
    attraction: Annotated[str | None, Query(max_length=64)] = None,
    assignee_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[TicketOut]:
    rows = await service.list_tickets(
        db, open_only=open_only, attraction_slug=attraction, assignee_id=assignee_id, limit=limit
    )
    return [TicketOut.model_validate(t) for t in rows]


@router.get("/tickets/{ticket_id}")
async def get_ticket(db: DbSession, ticket_id: uuid.UUID) -> TicketDetailOut:
    return TicketDetailOut.model_validate(await service.get_ticket(db, ticket_id))


@router.post("/tickets", status_code=status.HTTP_201_CREATED)
async def create_ticket(
    db: DbSession,
    body: TicketCreateIn,
    user: Annotated[User, Depends(require(Permission.CREATE_TICKET))],
) -> TicketDetailOut:
    ticket = await service.create_ticket(
        db,
        attraction_slug=body.attraction_slug,
        title=body.title,
        description=body.description,
        issue_type=body.issue_type,
        severity=body.severity,
        actor=Actor.of(user),
    )
    return TicketDetailOut.model_validate(ticket)


@router.post("/tickets/{ticket_id}/assign")
async def assign_ticket(
    db: DbSession,
    ticket_id: uuid.UUID,
    body: AssignIn,
    user: Annotated[User, Depends(require(Permission.ASSIGN_TICKET))],
) -> TicketDetailOut:
    ticket = await service.assign(db, ticket_id, body.assignee_id, actor=Actor.of(user))
    return TicketDetailOut.model_validate(ticket)


@router.post("/tickets/{ticket_id}/transition")
async def transition_ticket(
    db: DbSession, ticket_id: uuid.UUID, body: TransitionIn, user: CurrentUser
) -> TicketDetailOut:
    can_any = has_permission(user.role, Permission.UPDATE_ANY_TICKET)
    if not can_any and not has_permission(user.role, Permission.UPDATE_OWN_TICKET):
        raise PermissionDeniedError("Requires permission 'tickets:update_own'")
    ticket = await service.transition(
        db, ticket_id, body.to_state, actor=Actor.of(user), can_update_any=can_any, note=body.note
    )
    return TicketDetailOut.model_validate(ticket)


@router.get("/technicians")
async def list_technicians(db: DbSession) -> list[PersonOut]:
    return [PersonOut.model_validate(u) for u in await service.list_technicians(db)]
