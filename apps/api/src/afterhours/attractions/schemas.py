import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from afterhours.attractions.models import AttractionStatus, AttractionType


class LandOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    description: str


class LiveOut(BaseModel):
    """Simulated live queue state. ``wait_minutes`` is null while the ride isn't running."""

    model_config = ConfigDict(from_attributes=True)

    queue_length: int
    wait_minutes: int | None
    riders_last_hour: int
    updated_at: datetime


class AttractionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    land: LandOut
    type: AttractionType
    status: AttractionStatus
    description: str
    hourly_capacity: int
    riders_per_dispatch: int
    dispatch_interval_s: int
    popularity: float
    map_x: float
    map_y: float
    version: int
    updated_at: datetime
    live: LiveOut | None


class StatusIntervalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: AttractionStatus
    started_at: datetime
    ended_at: datetime | None
    reason: str | None


class StatusChangeIn(BaseModel):
    status: AttractionStatus
    reason: str | None = Field(default=None, max_length=280)


class ConfigureIn(BaseModel):
    version: int = Field(ge=1, description="The version you read; a mismatch returns 409")
    riders_per_dispatch: int | None = Field(default=None, ge=1, le=1000)
    dispatch_interval_s: int | None = Field(default=None, ge=5, le=3600)

    @model_validator(mode="after")
    def _something_to_change(self) -> "ConfigureIn":
        if self.riders_per_dispatch is None and self.dispatch_interval_s is None:
            raise ValueError("Provide riders_per_dispatch and/or dispatch_interval_s")
        return self


class MetricPointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sim_time: datetime
    wait_minutes: int | None
    queue_length: int
    riders_served: int
    status: AttractionStatus
