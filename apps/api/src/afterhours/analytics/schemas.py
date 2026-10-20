"""Response models for dashboards. ``simulated`` is always True: a client can never
present these numbers as real park data."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class SimStateOut(BaseModel):
    running: bool
    speed: float
    sim_time: datetime
    tick: int
    guests_in_park: int
    simulated: Literal[True] = True
    speeds: list[float] = []


class TrendPoint(BaseModel):
    sim_time: datetime
    guests: int
    avg_wait: float


class OverviewOut(BaseModel):
    simulated: Literal[True] = True
    attractions_total: int
    attractions_up: int
    attractions_by_status: dict[str, int]
    avg_wait_minutes: float
    guests_in_park: int
    park_capacity: int
    open_incidents: dict[str, int]
    sim: SimStateOut
    trend: list[TrendPoint]


class GuestFlowPoint(TrendPoint):
    riders_served: int


class GuestFlowOut(BaseModel):
    simulated: Literal[True] = True
    points: list[GuestFlowPoint]
    riders_today: int


class AttractionReliability(BaseModel):
    slug: str
    name: str
    uptime_pct: float
    incidents: int
    mttr_minutes: float | None


class ReliabilityOut(BaseModel):
    window_hours: int
    uptime_pct: float
    incidents: int
    resolved: int
    mttr_minutes: float | None
    mttr_park_minutes: float | None
    attractions: list[AttractionReliability]
    note: str


class ActivityItem(BaseModel):
    """A domain event as stored in the activity feed (the same envelope the WebSocket sends)."""

    id: str
    type: str
    entity_id: str | None
    occurred_at: datetime
    payload: dict[str, Any]
    schema_version: int
