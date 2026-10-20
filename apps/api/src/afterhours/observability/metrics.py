"""Prometheus metrics. Names follow the `afterhours_<thing>_<unit>` convention.

The API exposes them at GET /metrics; the worker serves its own registry on
AH_WORKER_METRICS_PORT (default 9101), so each process is scraped separately.
"""

from fastapi import APIRouter
from fastapi.responses import Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

HTTP_REQUESTS = Counter(
    "afterhours_http_requests_total",
    "HTTP requests by method, handler (endpoint name) and status code.",
    ["method", "handler", "status"],
)
HTTP_LATENCY = Histogram(
    "afterhours_http_request_duration_seconds",
    "HTTP request latency by method and handler (endpoint name).",
    ["method", "handler"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5),
)
WS_CONNECTIONS = Gauge(
    "afterhours_ws_connections",
    "Open WebSocket connections on this API process.",
)
EVENTS_PUBLISHED = Counter(
    "afterhours_events_published_total", "Domain events appended to the stream.", ["type"]
)
EVENT_PUBLISH_FAILURES = Counter(
    "afterhours_events_publish_failures_total",
    "Events dropped because Redis was unavailable (see ADR-0003).",
)
SIM_TICK_SECONDS = Histogram(
    "afterhours_sim_tick_duration_seconds",
    "Wall time to compute and persist one simulation tick.",
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2),
)
SIM_TICK_FAILURES = Counter("afterhours_sim_tick_failures_total", "Ticks that raised an error.")

router = APIRouter(include_in_schema=False)


@router.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
