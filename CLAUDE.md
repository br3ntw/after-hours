# AFTER HOURS: guidance for Claude Code

Fictional theme-park operations platform (portfolio project). All parks, attractions, and
data are invented; operational data is simulated and must always be labeled as such.
No Disney IP, names, or data.

## Layout
- `apps/api`: FastAPI modular monolith (Python 3.12, uv, SQLAlchemy 2 async, Alembic).
  Modules: `auth`, `attractions`, `maintenance`, `simulation`, `events`, `analytics`, `audit`,
  `health`, `core`. Layering: router → service → models. `afterhours-worker` is the single
  simulation process (`simulation/engine.py`; the pure model is in `simulation/model.py`).
- `apps/web`: Next.js 16 (App Router, Cache Components), React 19, Tailwind 4, TanStack Query.
  **Read `apps/web/node_modules/next/dist/docs/` before writing Next code**: APIs differ from older versions.
- `docs/openapi.json`: the API contract. Regenerate after any API change, then run `npm run gen:api`.
- `docs/adr/`: decision records. ARCHITECTURE.md §12 is the roadmap.

## Commands

```bash
npm run dev                 # (repo root) = ./scripts/dev.sh: API :8000 + worker + web :3000
```
```bash
# API (from apps/api)
uv run pytest -q            # uses local DB afterhours_test; migrates base→head each run
uv run ruff format . && uv run ruff check . && uv run mypy src tests
uv run alembic revision --autogenerate -m "..."
uv run python scripts/fix_enum_checks.py migrations/versions/<new>.py   # dedupe enum CHECKs
uv run python -m afterhours.openapi > ../../docs/openapi.json
uv run afterhours-seed      # idempotent; refuses in prod
uv run uvicorn afterhours.main:app --port 8000

# E2E and load (stack running via ./scripts/dev.sh)
(cd apps/web && npm run e2e)          # Playwright 1.63.0 pinned: matches the cached Chromium 1243
(cd loadtests/k6 && k6 run dashboard-read.js)   # record real results in PERFORMANCE.md only

# Web (from apps/web)
npm run gen:api && npm run typecheck && npm run lint && npm test && npm run build
npm run dev                 # proxies /api/v1/* to localhost:8000
npm run build:pages && npm run e2e:pages   # static browser demo (out/) and its E2E tests
```

## Rules
- Authorization is enforced only by `require(Permission.X)` in the API. Change the matrix in
  `auth/permissions.py`, `tests/test_permissions.py`, and ARCHITECTURE.md §7 together.
- State changes write an audit entry via `audit.service.record` in the same transaction.
- Never report test or benchmark numbers that were not actually produced by a run.
- Log skill/agent usage in SKILL_USAGE.md only when actually invoked.

## Local environment quirks (this Mac)
- The repo lives in iCloud-synced Documents, which sets the `hidden` flag on the venv's
  `.pth` file, and Python 3.12 ignores hidden `.pth` files. `apps/api/.venv` is therefore a
  symlink to `~/.local/share/venvs/afterhours-api`. If imports of `afterhours` fail, check this.
- Postgres 17 and Redis run as Homebrew services.
- The desktop app's preview launcher cannot read this folder; start the dev servers from a shell.
- iCloud also creates "name 2.ext" duplicates (seen in `.next/` and `docs/screenshots/`). tsconfig excludes
  `.next/**/* ?.ts` (TS globs support only `*` and `?`). Delete strays with
  `find . -path ./apps/web/node_modules -prune -o -name "* [0-9].*" -print`. Moving the repo out of iCloud fixes all of this.
- Design: PRODUCT.md (product truth), `.impeccable/surfaces/apps-web-src-app.md` (v3 direction
  contract: match the user's reference mockup), DESIGN.md (v2, out of date). Tokens live in
  `apps/web/src/app/globals.css`; use semantic names, never raw hex. Artwork is hand-built SVG
  (`park-map/park-art.tsx`, `ops/ride-art.tsx`); ride-type icons and gradients come from `lib/ride-type.ts`.
- The web app is Next 16 with Cache Components. Ops pages render after client-side session
  restore; `experimental.instantInsights.validationLevel: "manual-warning"` stands in for
  per-page `instant = false`, which the static demo export rejects.
- Browser demo (GitHub Pages, ADR-0005): `src/lib/demo/` mirrors the Python model, services and
  event payloads. When those change, update the demo too. Regenerate `lib/demo/seed.ts` from
  `seed.py`; never hand-edit it.
