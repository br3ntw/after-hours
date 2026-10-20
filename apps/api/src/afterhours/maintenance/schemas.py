import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field

from afterhours.maintenance.models import IssueType, Severity, TicketSource, TicketState


class TicketAttractionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str


class TicketEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    at: datetime
    actor_name: str
    kind: str
    from_state: TicketState | None
    to_state: TicketState | None
    note: str | None


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    number: int
    attraction: TicketAttractionOut
    title: str
    description: str
    issue_type: IssueType
    severity: Severity
    state: TicketState
    source: TicketSource
    assignee: PersonOut | None
    opened_at: datetime
    assigned_at: datetime | None
    started_at: datetime | None
    resolved_at: datetime | None
    resolution_notes: str | None
    version: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def ref(self) -> str:
        return f"MT-{self.number}"


class TicketDetailOut(TicketOut):
    events: list[TicketEventOut]


class TicketCreateIn(BaseModel):
    attraction_slug: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=3, max_length=140)
    description: str = Field(default="", max_length=4000)
    issue_type: IssueType
    severity: Severity


class AssignIn(BaseModel):
    assignee_id: uuid.UUID


class TransitionIn(BaseModel):
    to_state: TicketState
    note: str | None = Field(default=None, max_length=2000)
