# ADR-0004: Supabase as the managed PostgreSQL provider (database only)

- Status: Accepted
- Date: 2026-10-13

## Context
The project owner prefers Supabase. The development Mac has no Docker. The architecture
needs PostgreSQL plus Redis, and backend-enforced RBAC is a core requirement.

## Decision
- Use Supabase **only as hosted PostgreSQL** (free tier) for the shared dev/demo
  environment. The API connects through `AH_DATABASE_URL` like any other Postgres
  (session pooler, TLS on). Alembic owns the schema.
- **Do not use Supabase Auth, Realtime, or auto-generated REST.** Authentication, RBAC,
  WebSockets, and the API are part of what this project demonstrates, and splitting
  authorization between FastAPI and Postgres row-level security would create two sources of
  truth.
- Run local PostgreSQL 17 (the same major version as Supabase) via Homebrew for fast,
  disposable test databases. CI uses a `postgres:17` service container.
- Redis is not offered by Supabase: run it locally via Homebrew, and in hosted environments
  use any Redis-compatible service (ElastiCache, Upstash).

## Consequences
- Portable: switching to RDS later means changing one URL.
- asyncpg needs `statement_cache_size=0` behind Supabase's transaction pooler (port 6543).
  This is exposed as `AH_DATABASE_DISABLE_STATEMENT_CACHE`. The session pooler (5432)
  doesn't need it.
- Supabase exposes the `public` schema through its PostgREST API by default. Disable the
  Data API in project settings (or enable RLS with no policies) so tables are reachable only
  through FastAPI. This is listed in DEPLOYMENT.md as a required step.
