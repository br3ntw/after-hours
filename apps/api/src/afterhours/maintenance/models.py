import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, ForeignKey, Identity, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from afterhours.attractions.models import Attraction
from afterhours.auth.models import User
from afterhours.core.db import Base, TimestampMixin, str_enum


class Severity(StrEnum):
    SEV1 = "sev1"  # safety-critical: attraction must stop
    SEV2 = "sev2"  # major: guest-facing failure
    SEV3 = "sev3"  # minor: degraded, still operating
    SEV4 = "sev4"  # cosmetic / scheduled


class IssueType(StrEnum):
    MECHANICAL = "mechanical"
    ELECTRICAL = "electrical"
    SAFETY = "safety"
    OTHER = "other"


class TicketState(StrEnum):
    OPEN = "open"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketSource(StrEnum):
    OPERATOR = "operator"  # filed by a person
    SIMULATION = "simulation"  # generated (and auto-worked) by the demo simulation


class MaintenanceTicket(TimestampMixin, Base):
    __tablename__ = "maintenance_tickets"
    __table_args__ = (
        Index("ix_tickets_attraction_state", "attraction_id", "state"),
        Index(
            "ix_tickets_open",
            "state",
            postgresql_where=text("state IN ('open', 'assigned', 'in_progress')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Human-friendly reference shown as MT-1001, MT-1002, ...
    number: Mapped[int] = mapped_column(Identity(start=1001), unique=True)
    attraction_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("attractions.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(140))
    description: Mapped[str] = mapped_column(Text, default="")
    issue_type: Mapped[IssueType] = mapped_column(str_enum(IssueType))
    severity: Mapped[Severity] = mapped_column(str_enum(Severity))
    state: Mapped[TicketState] = mapped_column(str_enum(TicketState))
    source: Mapped[TicketSource] = mapped_column(str_enum(TicketSource))
    reported_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    opened_at: Mapped[datetime] = mapped_column(server_default=func.now())
    assigned_at: Mapped[datetime | None]
    started_at: Mapped[datetime | None]
    resolved_at: Mapped[datetime | None]
    resolution_notes: Mapped[str | None] = mapped_column(Text)
    # The simulated park clock at open/resolve, so recovery time can be reported in park
    # time (the sim clock runs 15–300× faster than wall time).
    sim_opened_at: Mapped[datetime | None]
    sim_resolved_at: Mapped[datetime | None]

    version: Mapped[int] = mapped_column(default=1)
    __mapper_args__ = {"version_id_col": version}  # noqa: RUF012

    attraction: Mapped[Attraction] = relationship(lazy="joined")
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id], lazy="joined")
    events: Mapped[list["TicketEvent"]] = relationship(
        order_by="TicketEvent.at", lazy="selectin", cascade="all, delete-orphan"
    )


class TicketEvent(Base):
    """Timeline entry for a ticket: creation, assignment, state change, note."""

    __tablename__ = "ticket_events"
    __table_args__ = (Index("ix_ticket_events_ticket_at", "ticket_id", "at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("maintenance_tickets.id", ondelete="CASCADE")
    )
    at: Mapped[datetime] = mapped_column(server_default=func.now())
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_name: Mapped[str] = mapped_column(String(120))  # denormalised: "Simulation" for system
    kind: Mapped[str] = mapped_column(String(32))
    from_state: Mapped[TicketState | None] = mapped_column(str_enum(TicketState, "from_state"))
    to_state: Mapped[TicketState | None] = mapped_column(str_enum(TicketState, "to_state"))
    note: Mapped[str | None] = mapped_column(Text)
