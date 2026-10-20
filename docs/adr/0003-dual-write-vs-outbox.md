# ADR-0003: Commit-then-publish instead of a transactional outbox (for now)

- Status: Proposed
- Date: 2026-10-13

## Context
A status change writes to Postgres and publishes to Redis. These are two systems with no
shared transaction.

## Decision
Commit the database transaction first, then publish. If publishing fails, log the failure
and increment `afterhours_events_publish_failures_total`.

## Why this is acceptable here
Postgres is the source of truth. Event loss is a *staleness* problem, not a *correctness*
problem: clients periodically reconcile against the REST snapshot and on every reconnect.
Publishing before the commit would be worse, because clients could see events for changes
that were later rolled back.

## Revisit when
Downstream consumers act on events (for example, paging a technician). At that point,
adopt a transactional outbox: insert an `outbox` row in the same transaction, and have a
relay publish rows and mark them sent.
