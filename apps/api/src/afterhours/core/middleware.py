"""Request-id propagation and one structured access-log line per request."""

import re
import time
import uuid

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from afterhours.core.logging import get_logger
from afterhours.observability.metrics import HTTP_LATENCY, HTTP_REQUESTS

log = get_logger("afterhours.http")
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class RequestContextMiddleware:
    """Pure ASGI (not BaseHTTPMiddleware) so it adds no overhead to streaming or WebSockets."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope["headers"])
        incoming = headers.get(b"x-request-id", b"").decode("latin-1")
        # Accept a caller's id only if it is well-formed; never echo arbitrary input.
        request_id = incoming if _SAFE_ID.match(incoming) else uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        status_code = 500
        start = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed = time.perf_counter() - start
            # The matched route template (e.g. /api/v1/attractions/{slug}), never the raw
            # path, keeps label cardinality bounded; unmatched paths collapse to one label.
            # Label by the matched endpoint's name (e.g. "get_attraction"): bounded and
            # stable, unlike raw paths. (FastAPI 0.143 nests routers, so the route object
            # here carries only its relative path; the name is unique app-wide.)
            route = getattr(scope.get("route"), "name", None) or "unmatched"
            if route != "metrics":
                HTTP_REQUESTS.labels(scope["method"], route, str(status_code)).inc()
                HTTP_LATENCY.labels(scope["method"], route).observe(elapsed)
            log.info(
                "http.request",
                method=scope["method"],
                path=scope["path"],
                status=status_code,
                duration_ms=round((time.perf_counter() - start) * 1000, 2),
            )
