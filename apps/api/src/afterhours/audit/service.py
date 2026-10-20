import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from afterhours.audit.models import AuditLog


def record(
    session: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    """Stage an audit entry in the caller's transaction, so the entry and the change it
    describes commit (or roll back) together."""
    request_id = structlog.contextvars.get_contextvars().get("request_id")
    session.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before,
            after=after,
            request_id=request_id,
        )
    )
