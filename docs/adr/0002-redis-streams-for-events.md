# ADR-0002: Redis Streams as the real-time event backbone

- Status: Proposed
- Date: 2026-10-13

## Context
Dashboards need live updates. Clients reconnect after network drops and must not miss or
double-apply events. The API may run as several replicas.

## Decision
Publish domain events to one capped Redis Stream (`ah:events`, `MAXLEN ~ 10000`). Each API
replica reads it with `XREAD BLOCK` and fans out to its sockets. Clients send their last
seen stream ID on reconnect, and the server replays the missed range.

## Alternatives considered
- **Redis pub/sub only.** Fire-and-forget with no replay, so reconnecting clients silently
  miss events.
- **Postgres LISTEN/NOTIFY.** No replay either, and payloads are limited to 8 KB.
- **Kafka / NATS JetStream.** Durable and replayable, but adds a heavyweight service that
  this event volume does not justify.

## Consequences
- Stream IDs give a total order, so client-side deduplication is a simple `id <= lastSeen`
  comparison.
- The replay window is bounded. Clients beyond it receive `resync_required` and refetch the
  snapshot.
- Redis is already present for rate limiting and caching, so no new infrastructure is needed.
