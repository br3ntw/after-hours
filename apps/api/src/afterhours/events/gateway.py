"""WebSocket fan-out of the Redis event stream, with replay for reconnecting clients.

Protocol (server → client JSON messages):
    {"kind": "event", "id": "<stream id>", ...envelope}   ordered; ids strictly increase
    {"kind": "resync_required"}   the client's last id was trimmed from the stream; refetch
    {"kind": "ping"}              heartbeat every 15 s
Clients connect to ``/ws/events?ticket=<one-time ticket>&since=<last id seen>``.
"""

import asyncio
import contextlib
import json
import secrets
import uuid
from typing import Any, cast

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from redis.asyncio import Redis

from afterhours.auth.deps import CurrentUser
from afterhours.core.config import get_settings
from afterhours.core.logging import get_logger
from afterhours.core.redis import get_redis
from afterhours.observability.metrics import WS_CONNECTIONS

log = get_logger(__name__)
router = APIRouter()

TICKET_TTL_SECONDS = 30
HEARTBEAT_SECONDS = 15
REPLAY_LIMIT = 2000


def _ticket_key(ticket: str) -> str:
    return f"ah:ws-ticket:{ticket}"


@router.post("/api/v1/ws-ticket", tags=["events"])
async def issue_ws_ticket(user: CurrentUser) -> dict[str, Any]:
    """Browsers can't set headers on a WebSocket handshake, so the socket authenticates
    with a short-lived, single-use ticket fetched over authenticated REST."""
    ticket = secrets.token_urlsafe(24)
    await get_redis().set(_ticket_key(ticket), str(user.id), ex=TICKET_TTL_SECONDS)
    return {"ticket": ticket, "expires_in": TICKET_TTL_SECONDS}


async def redeem_ticket(redis: Redis, ticket: str) -> uuid.UUID | None:
    user_id = cast(str | None, await redis.getdel(_ticket_key(ticket)))  # single use
    return uuid.UUID(user_id) if user_id else None


def _stream_id_tuple(stream_id: str) -> tuple[int, int]:
    ms, _, seq = stream_id.partition("-")
    return int(ms), int(seq or 0)


StreamEntries = list[tuple[str, dict[str, str]]]


async def replay_since(redis: Redis, since: str) -> tuple[StreamEntries, bool]:
    """Events strictly after ``since``. Returns (events, resync_required)."""
    stream = get_settings().events_stream
    first = cast(StreamEntries, await redis.xrange(stream, count=1))
    if first and _stream_id_tuple(since) < _stream_id_tuple(first[0][0]):
        # The stream was trimmed past the client's position: some events are gone for good.
        return [], True
    events = cast(StreamEntries, await redis.xrange(stream, min=f"({since}", count=REPLAY_LIMIT))
    return events, len(events) >= REPLAY_LIMIT


OVERFLOW = ("", "__overflow__")


class Broadcaster:
    """One XREAD loop per API process, fanning out to every connected socket's queue."""

    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[tuple[str, str]]] = set()
        self._task: asyncio.Task[None] | None = None

    def subscribe(self) -> asyncio.Queue[tuple[str, str]]:
        q: asyncio.Queue[tuple[str, str]] = asyncio.Queue(maxsize=1000)
        self._queues.add(q)
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())
        return q

    def unsubscribe(self, q: asyncio.Queue[tuple[str, str]]) -> None:
        self._queues.discard(q)

    @property
    def connections(self) -> int:
        return len(self._queues)

    async def _run(self) -> None:
        redis = get_redis()
        stream = get_settings().events_stream
        last_id = "$"
        while self._queues:
            try:
                batches = cast(
                    list[tuple[str, StreamEntries]],
                    await redis.xread({stream: last_id}, block=5000, count=200),
                )
            except Exception as exc:
                log.warning("ws.broadcast_read_failed", error=str(exc))
                await asyncio.sleep(1)
                continue
            for _, entries in batches:
                for event_id, fields in entries:
                    last_id = event_id
                    for q in list(self._queues):
                        if q.full():
                            # A client this far behind can't catch up live. Drop it and
                            # let it reconnect, replaying from its last id instead of
                            # stalling every other socket.
                            self._queues.discard(q)
                            while not q.empty():
                                q.get_nowait()
                            q.put_nowait(OVERFLOW)
                            continue
                        q.put_nowait((event_id, fields["data"]))


broadcaster = Broadcaster()


def _message(event_id: str, data: str) -> str:
    return json.dumps({"kind": "event", "id": event_id, **json.loads(data)})


@router.websocket("/ws/events")
async def events_socket(websocket: WebSocket, ticket: str = "", since: str | None = None) -> None:
    origin = websocket.headers.get("origin")
    if origin and origin not in get_settings().cors_origins:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    redis = get_redis()
    user_id = await redeem_ticket(redis, ticket) if ticket else None
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()

    # Subscribe *before* replaying so nothing published during the replay is lost; the
    # live queue may then repeat replayed ids, which are skipped by id.
    queue = broadcaster.subscribe()
    WS_CONNECTIONS.inc()
    last_sent = "0-0"

    async def pump() -> None:
        nonlocal last_sent
        if since:
            events, resync = await replay_since(redis, since)
            if resync:
                await websocket.send_json({"kind": "resync_required"})
            for event_id, fields in events:
                await websocket.send_text(_message(event_id, fields["data"]))
                last_sent = event_id
        while True:
            event_id, data = await queue.get()
            if (event_id, data) == OVERFLOW:
                await websocket.send_json({"kind": "resync_required"})
                return
            if _stream_id_tuple(event_id) <= _stream_id_tuple(last_sent):
                continue
            await websocket.send_text(_message(event_id, data))
            last_sent = event_id

    async def listen() -> None:
        while True:  # we expect no client messages; this just notices the close
            await websocket.receive_text()

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_SECONDS)
            await websocket.send_json({"kind": "ping"})

    tasks = {asyncio.create_task(t()) for t in (pump, listen, heartbeat)}
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        for t in done:
            exc = t.exception()
            if exc is not None and not isinstance(exc, WebSocketDisconnect):
                log.warning("ws.connection_error", error=repr(exc))
    finally:
        broadcaster.unsubscribe(queue)
        WS_CONNECTIONS.dec()
        with contextlib.suppress(Exception):
            await websocket.close()
