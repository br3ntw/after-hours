"""Imports every ORM model so ``Base.metadata`` is complete (used by Alembic and tests)."""

from afterhours.attractions.models import (
    Attraction,
    AttractionLive,
    Land,
    MetricSample,
    ParkSample,
    StatusHistory,
)
from afterhours.audit.models import AuditLog
from afterhours.auth.models import RefreshToken, User
from afterhours.core.db import Base
from afterhours.maintenance.models import MaintenanceTicket, TicketEvent

__all__ = [
    "Attraction",
    "AttractionLive",
    "AuditLog",
    "Base",
    "Land",
    "MaintenanceTicket",
    "MetricSample",
    "ParkSample",
    "RefreshToken",
    "StatusHistory",
    "TicketEvent",
    "User",
]
