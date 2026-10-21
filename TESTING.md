# Testing

Every result recorded here comes from an actual run. Commands are listed so anyone can reproduce them.

## Strategy

| Layer | Tool | What it covers |
|---|---|---|
| API unit + integration | pytest, httpx ASGI transport, real PostgreSQL + Redis | Endpoints, auth flows, RBAC matrix, DB constraints |
| Migrations | Alembic, run by the pytest session fixture | Every test run migrates `base → head` on a clean database |
| Schema drift | `alembic check` (CI) | ORM models and migrations agree |
| Contract drift | OpenAPI export plus `git diff` (CI) | `docs/openapi.json` and generated TS types match the code |
| Web unit/component | Vitest, Testing Library, jsdom | API client refresh logic, accessible status rendering |
| Simulation model | pytest (pure functions, seeded RNG) | Queue growth and drain, downtime, balking, posted-wait rounding, demand redistribution, determinism |
| E2E (manual, browser) | Claude Browser pane against the running stack | Every screen and flow; see IMPLEMENTATION_AUDIT.md § Results |
| E2E (automated) | Playwright 1.63, Chromium, full running stack | Seven journeys: status change propagating to map, activity feed and summary; analyst RBAC (UI plus a 403 from the API); SEV1 work order through to resolution; assigning a work order as it is created; pause freezing the park clock; demo controls hidden from non-admins; keyboard map |
| Browser demo | Vitest (`src/lib/demo`) and Playwright (`npm run e2e:pages`) against the static export served under `/after-hours/` | The in-browser server's contract (permissions, SEV1 down/up, state machine, error envelope, ticking) and six journeys: labeling, stopping a ride, the SEV1 lifecycle, pause, analyst permissions, live clock |
| Load | k6 2.3 | Dashboard reads up to 100 users, and WebSocket fan-out up to 500 sockets. See [PERFORMANCE.md](PERFORMANCE.md) |

### Isolation approach (API)
Each test runs inside an outer transaction that is rolled back afterwards. The session uses
`join_transaction_mode="create_savepoint"`, so application code can call `commit()` normally
while nothing persists between tests. Tests run against real PostgreSQL rather than SQLite,
because the schema relies on Postgres features (partial unique indexes, JSONB, `FOR UPDATE`).

### Notable tests
- `tests/test_permissions.py`: all 40 role × permission cells are pinned explicitly.
- `tests/test_auth.py::test_refresh_token_reuse_revokes_whole_family`: replaying a stolen
  refresh token kills the whole token family.
- `tests/test_auth.py::test_concurrent_refresh_race_is_not_treated_as_theft`: two tabs
  refreshing at the same moment do not log the user out.
- `src/lib/api/client.test.ts`: three concurrent 401s trigger exactly one refresh.

## Results log

| Date | Suite | Command | Result |
|---|---|---|---|
| 2026-10-13 | API | `uv run pytest -q` | 76 passed |
| 2026-10-13 | API static | `ruff check`, `mypy --strict` (37 files) | clean |
| 2026-10-13 | Web | `npm test` | 13 passed (2 files) |
| 2026-10-13 | Web static | `npm run lint`, `npm run typecheck` | clean |
| 2026-10-13 | Web build | `npm run build` | succeeded |
| 2026-10-13 | Dependencies | `pip-audit --strict`, `npm audit --omit=dev` | 0 known vulnerabilities |
| 2026-10-13 | Manual E2E | Signed in as ops manager in a browser; reload restored the session; 24 attractions rendered; no console errors | passed |

| 2026-10-13 | API (after overhaul) | `uv run pytest -q` | **134 passed** |
| 2026-10-13 | API static | `ruff check`, `mypy --strict` (60 files) | clean |
| 2026-10-13 | Web (after overhaul) | `npm test` | **25 passed** (5 files) |
| 2026-10-13 | Web static and build | `npm run lint`, `npm run typecheck`, `npm run build` | clean; 8 routes built |
| 2026-10-13 | WebSocket smoke | `ws_smoke.py` against a live API and worker | ordered and unique delivery; `since=` replay matched the missed events exactly; reused ticket rejected |
| 2026-10-13 | Design detector | `impeccable detect --json apps/web/src` | 0 findings |
| 2026-10-13 | Reduced motion | CSSOM inspection | rules present; **not emulated** (Playwright MCP couldn't start without Chrome) |

| 2026-10-20 | API | `uv run pytest -q` | **140 passed** (adds login rate limiting and Prometheus metrics) |
| 2026-10-20 | Web | `npm test` | **31 passed** |
| 2026-10-20 | E2E | `npm run e2e` (stack via `./scripts/dev.sh`) | **6 passed**, three consecutive runs |
| 2026-10-20 | E2E (v3 mockup redesign) | `npx playwright test`, specs updated for the new UI copy | **7 passed** |
| 2026-10-20 | Web (v3) | prettier, typecheck, lint, `npm test`, `npm run build` | clean; **31 passed**; build OK |
| 2026-10-20 | API | `uv run pytest -q` (adds the ticket row-lock regression test) | **141 passed** |
| 2026-10-20 | Web | prettier, typecheck, lint, `npm test`, `npm run build`, `npm run build:pages` | clean; **38 passed**; both builds OK |
| 2026-10-20 | E2E (full stack) | `npx playwright test` | **7 passed** |
| 2026-10-20 | E2E (browser demo) | `npm run build:pages && npm run e2e:pages` | **6 passed** |
| 2026-10-20 | Load | k6, see [PERFORMANCE.md](PERFORMANCE.md) | dashboard reads: 0 failures, p95 48 ms; WebSockets: 500 sockets, 0 failures, 0 out-of-order |

**A bug found by the E2E suite:** every `<Dialog>` used the same `id="dialog-title"`, so with
the always-mounted Reset dialog present, the work-order dialog's accessible name was
"Reset the park?". Ids now come from `useId()` everywhere a component can be mounted twice.
Next 16 keeps recently visited routes mounted, so that's common.

CI workflows exist in `.github/workflows/` but have **not run yet**, because the repo has not
been pushed to GitHub.
