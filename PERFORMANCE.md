# Performance

Every number here comes from a k6 run whose summary is committed in
[`loadtests/k6/results/`](loadtests/k6/results/). Nothing is extrapolated. Runs were local,
so treat the results as relative evidence, not production capacity.

## Environment

| | |
|---|---|
| Machine | Apple M4, 10 cores, 24 GB RAM (macOS) |
| API | 1 uvicorn process (no `--workers`), FastAPI, asyncpg pool 10 + 10 overflow |
| Data | PostgreSQL 17 and Redis on the same machine (Homebrew) |
| Background load | Simulation worker running at 1× (one tick every 2 s), Next.js dev server idle |
| Load generator | k6 v2.3.0 on the same machine, targeting the API directly (`:8000`) |
| Date | 2026-10-20 |

## 1. Dashboard reads: [`dashboard-read.js`](loadtests/k6/dashboard-read.js)

Each virtual user does what an open Command Center does. It loads six endpoints in parallel
(overview, attractions, event log, guest flow, open work orders, reliability), then polls the
overview. It ramps from 0 to 25, then 50, then 100 users over 2 min 40 s.

| | Before | After (gzip + open-only work orders) |
|---|---|---|
| Requests | 19,167 | 19,608 |
| Failed | **0** | **0** |
| Median | 26.1 ms | **11.5 ms** |
| p95 | 116.3 ms | **48.4 ms** |
| p99 | 214.3 ms | **71.3 ms** |
| Max | 685.4 ms | 208.9 ms |
| `/overview` p95 | 117.7 ms | 49.1 ms |
| Data received | **449 MB** | **29 MB** |

Thresholds: error rate < 1%, and p95 < 250 ms for `/overview` and `/attractions`. Both
passed in both runs. Throughput (about 118 requests/s) is set by the scenario's think time,
not by saturation, so this test does not measure maximum throughput.

### What the test found, and what changed

The first run moved **449 MB for 19k requests**, about 23 KB per request. Measuring each
endpoint showed two causes:

| Endpoint | Before (plain) | After |
|---|---|---|
| `GET /tickets?limit=300` (the dashboard fetched **all** work orders) | 115,508 B | replaced by `?open_only=true`: open orders only |
| `GET /attractions` | 15,753 B | 3,332 B (gzip) |
| `GET /activity?limit=40` | 14,582 B | 1,657 B (gzip) |
| `GET /tickets?limit=300` (Maintenance page still uses it) | 115,508 B | 14,382 B (gzip) |

Two changes followed. `GZipMiddleware` now compresses JSON responses over 1 KB; it covers
HTTP only, leaving WebSockets alone. And the dashboard, map, and search now request only open
work orders (`useOpenTickets`), because the full history is needed only on the Maintenance page.

**A caveat, recorded as measured.** The first run after these changes
([`dashboard-read-after-coldstart.json`](loadtests/k6/results/dashboard-read-after-coldstart.json))
had good p95 (58.8 ms) but a **p99 of 1.39 s and a max of 2.63 s**. It started seconds after a
full stack restart, while the Next.js dev server was compiling pages on the same CPU. An
immediate rerun (the "After" column) did not reproduce the tail. A cold-start overlap is the
likely cause, but it is not proven. Starlette's gzip runs at level 9 on the event loop. That's
a plausible tail-latency cost under heavier load, and it hasn't been measured separately yet.

## 2. WebSocket fan-out: [`websocket-fanout.js`](loadtests/k6/websocket-fanout.js)

N dashboards each fetch a one-time ticket, open `/ws/events`, and hold the stream for 60 s.
Each socket checks that stream IDs strictly increase (no duplicates, no reordering) and counts
simulation ticks. Ticks are published every 2 s, so a 60 s hold expects about 30.

| Sockets | Connect pattern | Failed requests | Sessions | Connect p95 | Out-of-order events | Ticks per socket |
|---|---|---|---|---|---|---|
| 200 | **all at the same instant** | **65 of 201 (32%)** | 135 | 77.1 ms | 0 | 30 |
| 200 | spread over 10 s | 0 of 201 | 200 | 3.1 ms | 0 | 29.96 avg |
| 500 | spread over 10 s | 0 of 501 | 500 | 2.4 ms | 0 | 29.3 avg (median 29, p95 30) |

**The 32% failure in the burst case is an OS listen-queue limit, not an application bug.**
- Only 135 ticket requests ever reached the API, and all returned 200.
- The other 65 failed on the client with `connection reset by peer`.
- macOS caps the listen backlog at `kern.ipc.somaxconn = 128`. A burst of 200 TCP connects in
  the same instant overflows it, and the kernel resets the excess.

I didn't change the system setting. In production the fix belongs at the edge: a load
balancer with keep-alive, plus Linux's larger default backlog (4096), raised further if
needed via uvicorn's `--backlog`. Real dashboards don't all connect in the same millisecond,
so the staggered rows are the realistic case. The burst row stays in the table because it's
the documented failure mode.

Across every successful socket, **zero events arrived out of order or duplicated**. That's the
property the client's `EventSequencer` and the server's subscribe-before-replay design exist
to guarantee.

## Not measured yet (honest gaps)

- Write-heavy load: concurrent status changes and work-order creation, including row-lock
  contention with the simulation worker.
- Maximum throughput: a constant-arrival-rate test to find the saturation point.
- Multiple API processes (`--workers N`) or replicas.
- The cost of gzip level 9 versus a lower level under heavier load.
- Database behavior at scale: `metric_samples` grows by about 24 rows per tick, so it needs a
  retention job and an index review after days of data.

## Reproduce

```bash
./scripts/dev.sh                     # in one terminal
cd loadtests/k6
k6 run --summary-export results/dashboard-read.json dashboard-read.js
CONNECTIONS=500 k6 run --summary-export results/websocket-fanout-500.json websocket-fanout.js
STAGGER_MS=0 CONNECTIONS=200 k6 run websocket-fanout.js   # the burst case
```
