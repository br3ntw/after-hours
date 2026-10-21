# ADR-0005: A browser-only demo build for GitHub Pages

- Status: Accepted
- Date: 2026-10-20

## Context
Reviewers (often recruiters) need a link they can click. The real system needs FastAPI,
PostgreSQL, Redis and an always-on simulation worker, and nothing may be deployed to paid
infrastructure without the owner's approval. GitHub Pages is free but serves static files
only.

## Decision
Add a second build target of the same web app, `npm run build:pages`:
- A Next.js static export (`output: "export"`, `basePath: /after-hours`).
- `src/lib/demo/` holds a TypeScript port of the queueing model (`simulation/model.py`) and an
  in-browser server that implements the same REST contract, error envelope, permission
  matrix, ticket state machine and event stream as the API.
- The seam is the API client's existing `fetchImpl` option, plus one branch in the realtime
  provider that subscribes to the in-browser server instead of opening a WebSocket. The
  screens are unchanged.
- The demo is labeled on the sign-in page and on every screen: the API and simulation run
  in the browser, and the full project runs on FastAPI, PostgreSQL and Redis.
- Static export can't use Cache Components or PPR, so the demo build turns them off. The
  per-page `instant = false` exports (Cache-Components-only) were replaced with the
  equivalent global `instantInsights.validationLevel: "manual-warning"`.

## Consequences
- A free, always-on link that runs the real UI against a faithful simulation.
- The simulation logic now exists twice. `lib/demo/seed.ts` is generated from the Python
  seed and permission matrix. The model and server mirror named Python modules and are covered
  by their own unit tests and a Playwright suite (`npm run e2e:pages`). The Python side
  remains the source of truth.
- The demo is not the backend: no persistence (a reload starts a fresh park), no auth
  beyond role picking, and no multi-user real-time. The label says so.
- The normal build is unaffected: the demo code is reached only through dynamic imports
  behind a build-time flag. Its chunks are emitted but never loaded.
