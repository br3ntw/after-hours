#!/usr/bin/env bash
# Run the whole local stack: API (:8000), simulation worker, web (:3000).
# Ctrl+C stops all three. Requires Postgres + Redis running (see README).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for port in 8000 3000; do
  if lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is already in use. Stop whatever is running there first." >&2
    exit 1
  fi
done

pids=()
cleanup() {
  trap - INT TERM EXIT
  echo; echo "Stopping…"
  kill "${pids[@]}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

(cd "$ROOT/apps/api" && uv run alembic upgrade head >/dev/null && uv run afterhours-seed)

(cd "$ROOT/apps/api" && exec uv run uvicorn afterhours.main:app --port 8000 2>&1 | sed -u 's/^/[api]    /') &
pids+=($!)
(cd "$ROOT/apps/api" && exec uv run afterhours-worker 2>&1 | sed -u 's/^/[worker] /') &
pids+=($!)
(cd "$ROOT/apps/web" && exec npm run dev 2>&1 | sed -u 's/^/[web]    /') &
pids+=($!)

echo "AFTER HOURS is starting: open http://localhost:3000 (Ctrl+C to stop)"
wait
