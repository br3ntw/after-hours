"""Publish domain events to the Redis Stream that feeds every WebSocket client.

Commit-then-publish (ADR-0003): callers publish only *after* their database transaction
commits, so clients never see an event for a change that rolled back. If Redis is down the
event is dropped and logged; clients reconcile from REST snapshots on reconnect.
"""

import json
from datetime import UTC, datetime
from typing import Any, cast

from redis.asyncio import Redis
from redis.exceptions import RedisError

from afterhours.core.config import get_settings
from afterhours.core.logging import get_logger
from afterhours.core.redis import get_redis
from afterhours.observability.metrics import EVENT_PUBLISH_FAILURES, EVENTS_PUBLISHED

log = get_logger(__name__)

# Events worth a line in the human-facing activity feed. High-frequency telemetry
# (sim.tick) goes only to the stream.
FEED_EVENT_TYPES = frozenset(
    {
        "attraction.status_changed",
        "attraction.configured",
        "ticket.created",
        "ticket.updated",
        "sim.control",
    }
)
ACTIVITY_LIMIT = 200


def _envelope(event_type: str, payload: dict[str, Any], entity_id: str | None) -> dict[str, Any]:
    return {
        "type": event_type,
        "entity_id": entity_id,
        "occurred_at": datetime.now(UTC).isoformat(),
        "payload": payload,
        "schema_version": 1,
    }


async def publish(
    event_type: str,
    payload: dict[str, Any],
    *,
    entity_id: str | None = None,
    redis: Redis | None = None,
) -> str | None:
    """Append an event; returns its stream id (the client's ordering/dedupe key)."""
    settings = get_settings()
    r = redis or get_redis()
    envelope = _envelope(event_type, payload, entity_id)
    data = json.dumps(envelope, default=str)
    try:
        event_id = cast(
            str,
            await r.xadd(settings.events_stream, {"data": data}, maxlen=10_000, approximate=True),
        )
        if event_type in FEED_EVENT_TYPES:
            feed_item = json.dumps({"id": event_id, **envelope}, default=str)
            async with r.pipeline(transaction=False) as pipe:
                pipe.lpush(settings.activity_list, feed_item)
                pipe.ltrim(settings.activity_list, 0, ACTIVITY_LIMIT - 1)
                await pipe.execute()
        EVENTS_PUBLISHED.labels(event_type).inc()
        return event_id
    except RedisError as exc:
        EVENT_PUBLISH_FAILURES.inc()
        log.error("events.publish_failed", event_type=event_type, error=str(exc))
        return None


async def recent_activity(limit: int = 30, redis: Redis | None = None) -> list[dict[str, Any]]:
    r = redis or get_redis()
    rows = cast(list[str], await r.lrange(get_settings().activity_list, 0, limit - 1))
    return [json.loads(row) for row in rows]
