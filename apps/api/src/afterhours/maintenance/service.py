"""Maintenance ticket lifecycle.

State machine (enforced here, not in the UI):

    open ──assign──▶ assigned ──▶ in_progress ──▶ resolved ──▶ closed
                                       ▲               │
                                       └── reopen ─────┘

Side effects that make tickets *operational*, not just records:
* A SEV1 (safety) ticket takes its attraction DOWN in the same transaction.
* Resolving the last open SEV1 ticket on a DOWN attraction brings it back to OPERATING.
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from afterhours.attractions import service as attractions
from afterhours.attractions.models import Attraction, AttractionStatus
from afterhours.attractions.service import Actor
from afterhours.audit.service import record
from afterhours.auth.models import User
from afterhours.auth.permissions import Role
from afterhours.core.errors import AppError, ConflictError, NotFoundError, PermissionDeniedError
from afterhours.events.publisher import publish
from afterhours.maintenance.models import (
    IssueType,
    MaintenanceTicket,
    Severity,
    TicketEvent,
    TicketSource,
    TicketState,
)
from afterhours.simulation.control import read_state

OPEN_STATES = (TicketState.OPEN, TicketState.ASSIGNED, TicketState.IN_PROGRESS)

TRANSITIONS: dict[TicketState, frozenset[TicketState]] = {
    TicketState.OPEN: frozenset({TicketState.IN_PROGRESS}),
    TicketState.ASSIGNED: frozenset({TicketState.IN_PROGRESS}),
    TicketState.IN_PROGRESS: frozenset({TicketState.RESOLVED}),
    TicketState.RESOLVED: frozenset({TicketState.CLOSED, TicketState.IN_PROGRESS}),
    TicketState.CLOSED: frozenset(),
}


class InvalidTransitionError(AppError):
    code = "invalid_transition"


def ticket_event_payload(t: MaintenanceTicket, actor: Actor, change: str) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "ref": f"MT-{t.number}",
        "title": t.title,
        "severity": t.severity.value,
        "state": t.state.value,
        "attraction": {"slug": t.attraction.slug, "name": t.attraction.name},
        "assignee": t.assignee.full_name if t.assignee else None,
        "source": t.source.value,
        "change": change,
        "actor": actor.name,
    }


def _timeline(
    t: MaintenanceTicket,
    actor: Actor,
    kind: str,
    *,
    from_state: TicketState | None = None,
    to_state: TicketState | None = None,
    note: str | None = None,
) -> None:
    t.events.append(
        TicketEvent(
            actor_id=actor.user_id,
            actor_name=actor.name,
            kind=kind,
            from_state=from_state,
            to_state=to_state,
            note=note,
        )
    )


async def list_tickets(
    db: AsyncSession,
    *,
    open_only: bool = False,
    attraction_slug: str | None = None,
    assignee_id: uuid.UUID | None = None,
    limit: int = 200,
) -> Sequence[MaintenanceTicket]:
    stmt = select(MaintenanceTicket).order_by(MaintenanceTicket.opened_at.desc()).limit(limit)
    if open_only:
        stmt = stmt.where(MaintenanceTicket.state.in_(OPEN_STATES))
    if attraction_slug:
        stmt = stmt.join(MaintenanceTicket.attraction).where(Attraction.slug == attraction_slug)
    if assignee_id:
        stmt = stmt.where(MaintenanceTicket.assignee_id == assignee_id)
    return (await db.scalars(stmt)).unique().all()


async def get_ticket(
    db: AsyncSession, ticket_id: uuid.UUID, *, lock: bool = False
) -> MaintenanceTicket:
    """Load a ticket. ``lock=True`` takes the row lock for a state change.

    Without the lock, an assignment and a transition sent back to back both read the old
    state; the version check then rejects whichever commits second. With it, the second
    waits for the first and applies on top of it.
    """
    if not lock:
        ticket = await db.get(MaintenanceTicket, ticket_id)
    else:
        ticket = await db.scalar(
            select(MaintenanceTicket)
            .where(MaintenanceTicket.id == ticket_id)
            # OF: the joined attraction/assignee are on the nullable side of outer joins.
            .with_for_update(of=MaintenanceTicket)
            .execution_options(populate_existing=True)
        )
    if ticket is None:
        raise NotFoundError("Ticket not found")
    return ticket


async def list_technicians(db: AsyncSession) -> Sequence[User]:
    stmt = (
        select(User)
        .where(User.role == Role.TECHNICIAN, User.is_active.is_(True))
        .order_by(User.full_name)
    )
    return (await db.scalars(stmt)).all()


async def open_counts_by_severity(db: AsyncSession) -> dict[str, int]:
    rows = await db.execute(
        select(MaintenanceTicket.severity, func.count())
        .where(MaintenanceTicket.state.in_(OPEN_STATES))
        .group_by(MaintenanceTicket.severity)
    )
    counts = {s.value: 0 for s in Severity}
    for severity, n in rows.all():
        counts[severity.value] = n
    return counts


async def create_ticket(
    db: AsyncSession,
    *,
    attraction_slug: str,
    title: str,
    description: str,
    issue_type: IssueType,
    severity: Severity,
    actor: Actor,
    source: TicketSource = TicketSource.OPERATOR,
) -> MaintenanceTicket:
    attraction = await attractions.get_attraction(db, attraction_slug)
    ticket = MaintenanceTicket(
        attraction_id=attraction.id,
        attraction=attraction,
        title=title,
        description=description,
        issue_type=issue_type,
        severity=severity,
        state=TicketState.OPEN,
        source=source,
        reported_by=actor.user_id,
        sim_opened_at=await _sim_now(),
        events=[],
    )
    db.add(ticket)
    _timeline(ticket, actor, "created", to_state=TicketState.OPEN, note=description or None)
    await db.flush()
    record(
        db,
        actor_id=actor.user_id,
        action="ticket.created",
        entity_type="ticket",
        entity_id=str(ticket.id),
        after={
            "ref": f"MT-{ticket.number}",
            "severity": severity.value,
            "attraction": attraction.slug,
        },
    )

    takes_down = severity == Severity.SEV1 and attraction.status in (
        AttractionStatus.OPERATING,
        AttractionStatus.DELAYED,
    )
    if takes_down:
        # change_status commits the ticket and the status change together.
        await attractions.change_status(
            db,
            attraction.slug,
            AttractionStatus.DOWN,
            actor=actor,
            reason=f"MT-{ticket.number} (SEV1): {title}",
        )
    else:
        await db.commit()
    await db.refresh(ticket)
    await publish(
        "ticket.created", ticket_event_payload(ticket, actor, "created"), entity_id=str(ticket.id)
    )
    return ticket


async def assign(
    db: AsyncSession, ticket_id: uuid.UUID, assignee_id: uuid.UUID, *, actor: Actor
) -> MaintenanceTicket:
    ticket = await get_ticket(db, ticket_id, lock=True)
    if ticket.state not in OPEN_STATES:
        raise InvalidTransitionError(f"Cannot assign a {ticket.state.value} ticket")
    tech = await db.get(User, assignee_id)
    if tech is None or tech.role != Role.TECHNICIAN or not tech.is_active:
        raise AppError("Assignee must be an active maintenance technician")

    previous = ticket.assignee.full_name if ticket.assignee else None
    ticket.assignee_id, ticket.assignee = tech.id, tech
    ticket.assigned_at = datetime.now(UTC)
    from_state = ticket.state
    if ticket.state == TicketState.OPEN:
        ticket.state = TicketState.ASSIGNED
    _timeline(
        ticket,
        actor,
        "assigned",
        from_state=from_state,
        to_state=ticket.state,
        note=f"Assigned to {tech.full_name}" + (f" (was {previous})" if previous else ""),
    )
    record(
        db,
        actor_id=actor.user_id,
        action="ticket.assigned",
        entity_type="ticket",
        entity_id=str(ticket.id),
        before={"assignee": previous},
        after={"assignee": tech.full_name},
    )
    await _commit(db)
    await publish(
        "ticket.updated", ticket_event_payload(ticket, actor, "assigned"), entity_id=str(ticket.id)
    )
    return ticket


async def transition(
    db: AsyncSession,
    ticket_id: uuid.UUID,
    to_state: TicketState,
    *,
    actor: Actor,
    can_update_any: bool,
    note: str | None = None,
) -> MaintenanceTicket:
    ticket = await get_ticket(db, ticket_id, lock=True)
    # Data-dependent authorization: technicians may only work their own tickets.
    if not can_update_any and ticket.assignee_id != actor.user_id:
        raise PermissionDeniedError("Technicians can only update tickets assigned to them")
    if to_state not in TRANSITIONS[ticket.state]:
        raise InvalidTransitionError(
            f"Cannot move a ticket from {ticket.state.value} to {to_state.value}",
            details={"allowed": sorted(s.value for s in TRANSITIONS[ticket.state])},
        )

    now = datetime.now(UTC)
    from_state = ticket.state
    ticket.state = to_state
    if to_state == TicketState.IN_PROGRESS:
        ticket.started_at = ticket.started_at or now
        if from_state == TicketState.RESOLVED:  # reopened
            ticket.resolved_at = None
    elif to_state == TicketState.RESOLVED:
        ticket.resolved_at = now
        ticket.sim_resolved_at = await _sim_now()
        ticket.resolution_notes = note
    _timeline(ticket, actor, "state_changed", from_state=from_state, to_state=to_state, note=note)
    record(
        db,
        actor_id=actor.user_id,
        action="ticket.state_changed",
        entity_type="ticket",
        entity_id=str(ticket.id),
        before={"state": from_state.value},
        after={"state": to_state.value},
    )

    reopen = to_state == TicketState.RESOLVED and await _should_reopen(db, ticket)
    if reopen:
        await attractions.change_status(
            db,
            ticket.attraction.slug,
            AttractionStatus.OPERATING,
            actor=actor,
            reason=f"MT-{ticket.number} resolved",
        )
    else:
        await _commit(db)
    await publish(
        "ticket.updated",
        ticket_event_payload(ticket, actor, to_state.value),
        entity_id=str(ticket.id),
    )
    return ticket


async def _should_reopen(db: AsyncSession, ticket: MaintenanceTicket) -> bool:
    if ticket.attraction.status != AttractionStatus.DOWN:
        return False
    blocking = await db.scalar(
        select(func.count())
        .select_from(MaintenanceTicket)
        .where(
            MaintenanceTicket.attraction_id == ticket.attraction_id,
            MaintenanceTicket.id != ticket.id,
            MaintenanceTicket.severity == Severity.SEV1,
            MaintenanceTicket.state.in_(OPEN_STATES),
        )
    )
    return not blocking


async def _sim_now() -> datetime | None:
    try:
        state = await read_state()
    except Exception:  # Redis down: just omit the park-time stamp
        return None
    return state.sim_time if state.initialized else None


async def _commit(db: AsyncSession) -> None:
    try:
        await db.commit()
    except StaleDataError as exc:
        await db.rollback()
        raise ConflictError("Ticket was changed by someone else; reload and retry") from exc
