import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from afterhours.core.db import Base, TimestampMixin, str_enum


class AttractionType(StrEnum):
    COASTER = "coaster"
    DARK_RIDE = "dark_ride"
    WATER = "water"
    FLAT = "flat"
    SHOW = "show"
    FAMILY = "family"


class AttractionStatus(StrEnum):
    OPERATING = "operating"
    DELAYED = "delayed"
    DOWN = "down"
    CLOSED = "closed"
    REFURB = "refurb"


class Land(Base):
    __tablename__ = "lands"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(default=0)

    attractions: Mapped[list["Attraction"]] = relationship(back_populates="land")


class Attraction(TimestampMixin, Base):
    __tablename__ = "attractions"
    __table_args__ = (
        CheckConstraint("hourly_capacity BETWEEN 1 AND 5000", name="hourly_capacity_range"),
        CheckConstraint("riders_per_dispatch BETWEEN 1 AND 1000", name="riders_per_dispatch_range"),
        CheckConstraint("dispatch_interval_s BETWEEN 5 AND 3600", name="dispatch_interval_range"),
        CheckConstraint("popularity BETWEEN 0 AND 1", name="popularity_range"),
        CheckConstraint("map_x BETWEEN 0 AND 100 AND map_y BETWEEN 0 AND 100", name="map_bounds"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    land_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lands.id", ondelete="RESTRICT"))
    type: Mapped[AttractionType] = mapped_column(str_enum(AttractionType))
    status: Mapped[AttractionStatus] = mapped_column(str_enum(AttractionStatus))
    description: Mapped[str] = mapped_column(Text, default="")

    # Operational design parameters, used by the simulation (Phase 6).
    hourly_capacity: Mapped[int]
    riders_per_dispatch: Mapped[int]
    dispatch_interval_s: Mapped[int]
    popularity: Mapped[float]  # 0..1 relative demand weight

    # Position on the park map, as percentages of the map's width/height.
    map_x: Mapped[float]
    map_y: Mapped[float]

    # Optimistic concurrency: writers must send the version they read.
    version: Mapped[int] = mapped_column(default=1)
    __mapper_args__ = {"version_id_col": version}  # noqa: RUF012

    land: Mapped[Land] = relationship(back_populates="attractions", lazy="joined")
    live: Mapped["AttractionLive | None"] = relationship(lazy="joined", uselist=False)


class AttractionLive(Base):
    """Current simulated queue state, one row per attraction, overwritten every tick.
    Kept out of ``attractions`` so the simulation's high-frequency writes never bump the
    optimistic-lock version that operators edit against."""

    __tablename__ = "attraction_live"

    attraction_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("attractions.id", ondelete="CASCADE"), primary_key=True
    )
    queue_length: Mapped[int] = mapped_column(default=0)
    wait_minutes: Mapped[int | None] = mapped_column(default=0)  # None while not running
    riders_last_hour: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now())


class MetricSample(Base):
    """One simulated observation per attraction per tick (the analytics time series)."""

    __tablename__ = "metric_samples"
    __table_args__ = (Index("ix_metric_samples_attraction_ts", "attraction_id", "ts"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    attraction_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("attractions.id", ondelete="CASCADE")
    )
    ts: Mapped[datetime] = mapped_column(server_default=func.now())  # wall clock
    sim_time: Mapped[datetime]  # simulated park clock
    queue_length: Mapped[int]
    wait_minutes: Mapped[int | None]
    arrivals: Mapped[int]
    riders_served: Mapped[int]
    status: Mapped[AttractionStatus] = mapped_column(str_enum(AttractionStatus))

    attraction: Mapped[Attraction] = relationship(lazy="raise")


class ParkSample(Base):
    """Park-wide simulated guest flow per tick."""

    __tablename__ = "park_samples"
    __table_args__ = (Index("ix_park_samples_ts", "ts"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(server_default=func.now())
    sim_time: Mapped[datetime]
    guests_in_park: Mapped[int]
    arrivals: Mapped[int]
    departures: Mapped[int]
    riders_served: Mapped[int]
    avg_wait_minutes: Mapped[float]


class StatusHistory(Base):
    """Status as half-open intervals ``[started_at, ended_at)``; ``ended_at IS NULL`` is the
    current status. Uptime then becomes an interval-overlap sum rather than an event replay."""

    __tablename__ = "attraction_status_history"
    __table_args__ = (
        Index("ix_status_history_attraction_started", "attraction_id", "started_at"),
        # At most one open interval per attraction, enforced by the database.
        Index(
            "uq_status_history_one_open",
            "attraction_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
        CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="interval_order"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    attraction_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("attractions.id", ondelete="CASCADE")
    )
    status: Mapped[AttractionStatus] = mapped_column(str_enum(AttractionStatus))
    started_at: Mapped[datetime]
    ended_at: Mapped[datetime | None]
    reason: Mapped[str | None] = mapped_column(String(280))
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
