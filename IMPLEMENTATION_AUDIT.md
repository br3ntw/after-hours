# Implementation Audit (before the visual overhaul)

_Audited 2026-10-13, at the end of Phase 3, by inspecting the code and running it. Nothing
here is inferred from documentation._

## Why the app "does very little"

**Nothing in the system ever changes on its own, and almost nothing can be changed by a
user.** Phase 3 delivered the plumbing (auth, schema, read APIs), but the four things that
make an operations platform feel alive did not exist yet:

1. **No simulation engine.** There is no worker process, no queue model, and no wait-time
   data. Every attraction stays `operating` forever, and wait times aren't even a field.
2. **No write paths.** The API exposes only `GET` endpoints for attractions. Nobody can open
   or close a ride, change capacity, or file a ticket. There's no maintenance module at all.
3. **No real-time channel.** There's no Redis Streams publisher and no WebSocket endpoint,
   so the UI only learns about changes by refetching (every 15 s via TanStack Query
   staleness).
4. **One screen.** The web app has a sign-in page and a single table. The map, attraction
   detail, maintenance, and analytics routes don't exist.

The interface was not "visually static on top of a working engine". It was static
because there was no engine.

## What works (verified)

| Area | Status | Evidence |
|---|---|---|
| Auth: login, refresh rotation, reuse detection, logout, `/me` | ✅ | 76 API tests pass; manual browser sign-in |
| RBAC matrix (4 roles × 10 permissions) | ✅ | `tests/test_permissions.py` |
| Lands/attractions read API, filters, status history | ✅ | `tests/test_attractions.py` |
| Audit log (append-only, same transaction) | ✅ | `tests/test_auth.py::test_login_is_audited` |
| Health/readiness, structured logs, request IDs | ✅ | `tests/test_health.py` |
| Migrations, idempotent seed (24 attractions with map coordinates) | ✅ | Seed run twice; `alembic check` clean |
| Web: sign-in, session restore, attraction table | ✅ | 13 Vitest tests; browser check |

## Incomplete or missing

| Capability requested | State before overhaul |
|---|---|
| Simulation engine, demo mode, and controls | Missing |
| Attraction status / capacity changes | Missing (permission constants exist, no endpoints) |
| Maintenance tickets, technicians, timelines | Missing (no tables) |
| Real-time event engine (Redis Streams + WebSocket) | Missing (designed in ADR-0002 only) |
| Activity feed, analytics (uptime, MTTR, throughput) | Missing |
| Park map, attraction detail, maintenance UI | Missing |
| Login rate limiting | Missing (planned) |

## Reusable pieces

- **Backend:** `require(Permission.X)`, `audit.service.record`, the error envelope,
  `StatusHistory` intervals (ready for uptime math), and the `map_x`/`map_y` coordinates
  already stored for every attraction.
- **Frontend:** the API client (single-flight refresh), `AuthProvider` / `can()`, generated
  OpenAPI types, `StatusBadge` semantics (icon + label), and the TanStack Query setup.

## Plan

Build the missing engine first, so the UI has something real to show:

1. **Backend:** attraction mutations → maintenance module → simulation engine and worker
   → event stream and WebSocket → analytics and activity endpoints → demo controls and demo
   login.
2. **Frontend:** the design system from the pinned palette → shell → command center with
   the live map → full map → attraction detail → maintenance → demo controls.
3. **Verify:** API tests for every new endpoint and the simulation model, web unit tests,
   and a browser pass on desktop and mobile.

The outcome of each item is recorded in [§ Results](#results-after-the-overhaul) below.

## Results after the overhaul

Verified on 2026-10-13 against the running stack (API, worker, Postgres, Redis, and the
production web build) in a real browser, plus automated suites. See [TESTING.md](TESTING.md)
for commands and counts.

| Requirement | Result | How it was verified |
|---|---|---|
| Simulation engine runs | ✅ | Worker ticks every 2 s. The park warm-starts at 14:00, and the clock and guest count advance live |
| Demo Mode: start / pause / reset / speed / trigger downtime | ✅ | Each control exercised in the browser as Administrator. Pause held the clock for 6 s at 10×. Reset dialog returned to 14:00. The downtime drill took Gearspring Runaway down and auto-repaired it |
| Real-time updates | ✅ | A WebSocket smoke script received ticks interleaved with an operator event, in order with no duplicates. Reconnecting with `since=` replayed exactly the missed events, and a reused ticket was rejected |
| Status change propagates to map, feed, KPIs | ✅ | Set Undertow Expedition to Down in the map panel: marker, panel, feed (with reason and actor), toast, and the "1 down" KPI all updated |
| Maintenance tickets change state | ✅ | A SEV1 on Orbit 9 took it down. Assign → start → resolve brought it back to operating. The timeline and status history recorded every step |
| Attraction detail, history, performance charts | ✅ | Wait and riders-per-minute charts, status history, tickets, and the capacity form with optimistic-lock conflict handling |
| Interactive map: pan, zoom, filters, alerts, details | ✅ | Wheel, drag, and pinch handlers. Keyboard `+`/`←`/`0` verified by script. Type/status filters, crowd-density layer, open-ticket badges |
| Analytics | ✅ | Uptime by attraction (worst first), MTTR, headliner wait trends (four validated series), guest flow |
| RBAC on all new endpoints | ✅ | API tests per role (status, configure, tickets, assignment, simulation control) |
| Responsive | ✅ | No horizontal overflow at 390 px (scroll width 390 = viewport). Layouts checked at 1440×900 and 390×844 |
| Keyboard | ✅ | Map is focusable with documented keys. Markers are tabbable with descriptive names. Dialogs use native `<dialog>` |
| Reduced motion | ⚠️ partial | The shipped CSS contains the `prefers-reduced-motion` and `prefers-reduced-transparency` rules (confirmed via CSSOM). It was **not** emulated end to end: the Playwright MCP needs Google Chrome, which isn't installed |

### Bugs found and fixed during verification
- **Controls before the first tick crashed state reads.** A partial Redis hash broke every
  later read. Controls now always write the full state.
- **Throughput was about 5× too low.** Warm-up samples covered 5 minutes but stored one
  minute of riders.
- **Glass panels were too transparent** over the map, so marker text bled through.
- **The mobile header overflowed** by 71 px.
- **Chart axis labels were clipped,** and direct labels were truncated.
- **Native `window.confirm`** for reset was replaced with an accessible dialog.

### Finish review (impeccable-finish-reviewer)
Disposition **fix** with 8 material items, all applied and re-verified:
- The guest-flow chart now sits above the fold at 1440×900.
- Map overlays moved off the park.
- The status control no longer clips.
- Motion is back on contract (220 ms).
- Marker legibility has a size floor.
- "Live" is labeled at every width.
- Chart scales read true.
- MTTR is reported in park time (new `sim_opened_at` / `sim_resolved_at` columns), with wall clock second.
- Glyph arrows were replaced with icons.

Follow-ups the reviewer raised that were **not** done: drawn land landmarks, idle map motion
(water shimmer, lantern twinkle), and richer attraction hero art.

### Known limitations (not hidden)
- MTTR is shown in **park time** for tickets opened after the park-clock columns were added.
  Older tickets only have wall-clock times (see [docs/simulation.md](docs/simulation.md)).
- The **Liquid Glass Design** skill is an empty stub, so its guidance could not be applied.
  The glass treatment follows the brief's own constraints.
- **Wpds** (WordPress Design System) wasn't used: it's off-brief, and using it would mean
  installing an upstream bundle.

## Redesign v2: "operations console" (2026-10-14)

**User feedback:** v1 "feels clearly made by AI". **Diagnosis:** v1 followed a reference
mockup that matches the most common AI-dashboard look (navy plus neon glow, frosted glass, ring
and gauge KPI cards). It kept the scaffold's default font, used template copy (time-of-day
greeting, tagline hero), had illustrated "dusk" art and blob-shaped lands, put a "Simulated" pill
on every panel, and gave every surface the same weight.

**What changed (functionality untouched):**
- **Typeface:** Barlow, with Barlow Condensed caps for headings and column labels and a
  monospace for measured numbers.
- **Surfaces:** flat, hairline-ruled, with square corners. Glass is replaced by solid raised
  sheets; translucency remains only on the dialog backdrop.
- **Status board:** the four ring/gauge cards became one ruled board. The only graphic is the
  gate-capacity meter.
- **Schematic park map:** straight zones on a survey grid and transit-style paths. Rides are
  three-letter code tags with wait times or spelled-out states.
- **Event log:** replaces the icon feed, showing age (not a second clock) and a category column.
- **Factual headers:** detail screens use a code tag and dispatch parameters instead of
  illustrated hero art.
- **Simulation labeling:** one persistent SIMULATION · FICTIONAL PARK indicator replaces the
  per-panel pills. Charts keep their "simulated" captions.
- **Copy:** domain wording ("rides up", "gate count", "work orders", "sign-on"), and no greeting.

**Verified:** typecheck, lint, and 31 web tests pass; the design detector reports 0 findings.
Every screen was checked in the browser at 1440×900 and 390×844 (scroll width equals the
viewport). Simulation controls (pause, start, speed, reset) return 200 through the web proxy.

**Root cause of "Simulation control failed":** the API process on :8000 had been started
before the simulation endpoints existed and was never restarted, so it returned 404. Running
`./scripts/dev.sh` (API, worker, and web together) fixed it. No code change was needed.


## Redesign v3: back to the reference mockup (2026-10-20)

**User request:** "make the graphics for the rides and everything better… match that mockup
photo i gave you as close as i can". The user declined paid image generation, so all artwork is
hand-built SVG.

**What changed (no API changes):**
- **Illustrated night park map:** lands with landmarks, procedural trees, lit paths and a lagoon
  lighthouse. Markers are mockup-style pills (gradient type icon, wait, name). On phone-size maps
  they collapse to icons, with the wait shown on hover, focus or selection.
- **Ride art:** a procedural night scene per ride, varied by land palette and ride type. It
  appears on attraction cards, the map's detail panel and the detail hero.
- **Shell and Command Center:** a glass sidebar with a Park Status card, a top bar with the park
  clock, a greeting, four KPI cards (ring, bars, gauge, alert), Live Activity and Guest Flow.
- **Attractions:** a card grid with land filters and sorting.
- **Attraction Details:** a hero banner, an "Open attraction" action, tabs (Overview, Live Data,
  Maintenance, History) and stat cards with a mini bar chart and a sparkline.
- **Create maintenance ticket:** segmented issue type, Low/Medium/High/Critical (mapped to
  SEV4–SEV1), and optional assign-to chips. The ticket is created first and then assigned, so a
  failed assignment never loses the ticket.
- **Sign-on, Maintenance, Analytics:** restyled to match.

**Verified:** prettier, typecheck, lint, 31 unit tests, production build, and 7/7 Playwright
journeys (one new: assign on create). Browser checks at 1440×900 and 390×844 found no horizontal
overflow. Screenshots were regenerated with `node apps/web/e2e/screenshots.mjs`.
