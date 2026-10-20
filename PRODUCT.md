# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: hiring reviewers.** Recruiters, hiring managers, and engineers evaluating a
  software-engineering portfolio (target: The Walt Disney Company SWE / SWE II / full-stack
  roles). They arrive cold, often for about 60 seconds, and must see a living, credible
  system, then be able to dig into how it works. (Confirmed 2026-10-13.)
- **Simulated personas inside the product:** Administrator, Operations Manager, Maintenance
  Technician, Read-Only Analyst at a fictional park. The workflows must be believable to
  someone who knows park operations, because credibility is part of what reviewers judge.

## Product Purpose

AFTER HOURS ("The technology behind the magic.") is a real-time operations and
attraction-reliability command center for **Lanternfall Park**, a fully fictional theme
park. It monitors attraction status, simulated wait times, guest flow, capacity, and
maintenance incidents, and lets authorized operators act on them. Success means a reviewer
sees the park running live within seconds, changes something, watches the effect propagate,
and comes away convinced of the engineering underneath.

## Positioning

A working system, not a mockup: a real event-driven backend (FastAPI, PostgreSQL, Redis
Streams, WebSockets), a documented queueing simulation, backend-enforced RBAC, and an audit
trail. Every number on screen is produced by code the reviewer can read.

## Operating Context

- Runs locally (Next.js web, FastAPI API, simulation worker, Postgres, Redis); Supabase as
  hosted Postgres for demos.
- **Entry:** a one-click demo role picker on the sign-in page, available only when demo login
  is enabled (never in prod). Normal email/password login remains. (Confirmed.)
- **Simulation auto-runs on start**, so the park is already alive on first open. Admins can
  pause, reset, change speed, and trigger downtime. (Confirmed.)

## Capabilities and Constraints

- Roles: Administrator, Operations Manager, Maintenance Technician, Read-Only Analyst.
  Authorization is enforced by the API; the UI only hides what a role can't do.
- Lands: Tidewater Quay, Clockwork Canyon, Aurora Heights, Emberwood, Starlight Pier
  (24 attractions).
- Terminology: attraction status is operating / delayed / down / closed / refurb; ticket
  severity is SEV1–SEV4.

## Brand Commitments

- Name **AFTER HOURS**, tagline "The technology behind the magic."
- **All IP original.** No Disney names, characters, castles, artwork, data, or internal
  systems. The park and its map are invented.
- **Simulated data is always labeled as simulated.** Never presented as real park data.

## Evidence on Hand

- Measured results only: test counts in TESTING.md, and load-test results (when they exist)
  in PERFORMANCE.md.
- There are no real users, customers, testimonials, or production deployments. Never
  fabricate any.

## Product Principles

1. **Alive on arrival.** The first screen moves, because the system is actually running.
2. **Cause → visible effect.** Every operator action visibly propagates (map, feed, KPIs)
   so reviewers can see the event system work.
3. **Honest data.** Simulated values are labeled, and claims are backed by code or measured
   runs.
4. **Operational clarity over decoration.** It must read as a tool an operator could use
   under pressure.

## Accessibility & Inclusion

WCAG 2.2 AA target: status is never conveyed by color alone, the app is keyboard-operable
(including the map), and `prefers-reduced-motion` is respected.
