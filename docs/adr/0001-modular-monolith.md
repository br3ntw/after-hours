# ADR-0001: Modular monolith with a separate simulation worker process

- Status: Proposed
- Date: 2026-10-13

## Context
The platform has seven functional areas (attractions, maintenance, simulation, events,
analytics, auth, audit). It is built by one developer, and its load is modest: about 24
attractions, tens of operators, and hundreds of dashboard viewers.

## Decision
Ship one Python package, `afterhours`, with two entrypoints:
- `api`: FastAPI, which serves REST and WebSockets and can scale horizontally.
- `worker`: the simulation tick loop and periodic jobs, run as a single replica.

Each module owns its tables and exposes a service interface. Modules never import another
module's repository.

## Alternatives considered
- **Microservices per domain.** Rejected. Network hops, distributed transactions, and N
  deploy pipelines would add cost with no measured benefit at this scale.
- **Simulation inside the API process.** Rejected. Every API replica would tick, which
  multiplies simulated guests. A leader lock would fix that but adds failure modes a
  dedicated process avoids.

## Consequences
- A single deploy artifact (one image, two commands).
- Module boundaries are enforced by convention and import-linting, not the network.
- The worker is a singleton. If it dies, simulation pauses while the API keeps serving, and
  `/readyz` on the worker plus a Prometheus alert surface the outage.
