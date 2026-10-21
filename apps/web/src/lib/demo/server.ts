/**
 * In-browser stand-in for the AFTER HOURS API, used only by the GitHub Pages demo build.
 *
 * It implements the same REST contract (paths, payloads, error envelope, permission
 * matrix) and the same event stream as the FastAPI backend, so the UI runs unchanged.
 * It mirrors these Python modules; keep them in step:
 *   attractions/service.py · maintenance/service.py · analytics/router.py ·
 *   simulation/engine.py · simulation/control.py · events/publisher.py
 * State lives in memory: reloading the page starts a fresh, warm-started park.
 * Everything it produces is SIMULATED and fictional.
 */
import type {
  ActivityItem,
  Attraction,
  AttractionStatus,
  AttractionType,
  GuestFlow,
  IssueType,
  Me,
  MetricPoint,
  Overview,
  Permission,
  Person,
  Reliability,
  Role,
  Severity,
  SimState,
  StatusInterval,
  TicketDetail,
  TicketEvent,
  TicketState,
  TokenResponse,
} from "@/lib/api/types";
import type { ServerMessage } from "@/lib/realtime/events";

import {
  CLOSE_MINUTE,
  createRng,
  isOpen,
  rideDemand,
  type RideConfig,
  type RideStep,
  type Rng,
  stepGate,
  stepRide,
} from "./model";
import { ATTRACTIONS, DEMO_USERS, LANDS, ROLE_PERMISSIONS } from "./seed";

// --- constants mirrored from the backend ------------------------------------------------

const PARK_CAPACITY = 45_000;
const SPEEDS = [0.5, 1, 2, 5, 10];
const TICK_MS = 2_000;
const WARM_START_HOURS = 14;
const UP_STATUSES: AttractionStatus[] = ["operating", "delayed"];
const OPEN_STATES: TicketState[] = ["open", "assigned", "in_progress"];
const MAX_HOURLY_CAPACITY = 5000;

const MTBF_MINUTES: Record<AttractionType, number> = {
  coaster: 2400,
  dark_ride: 3000,
  water: 2800,
  flat: 3600,
  family: 5000,
  show: 8000,
};
const DELAY_MEAN_MINUTES = 1500;
const BREAKDOWNS: [IssueType, Severity, string][] = [
  ["mechanical", "sev1", "Lift motor fault stopped the ride cycle"],
  ["electrical", "sev1", "Block-zone sensor fault, ride e-stopped"],
  ["safety", "sev1", "Restraint check failed on dispatch"],
  ["mechanical", "sev2", "Vehicle brake fin wear, reduced dispatch rate"],
  ["electrical", "sev2", "Show-control audio dropout, running degraded"],
];
const TRANSITIONS: Record<TicketState, TicketState[]> = {
  open: ["in_progress"],
  assigned: ["in_progress"],
  in_progress: ["resolved"],
  resolved: ["closed", "in_progress"],
  closed: [],
};
const FEED_TYPES = new Set([
  "attraction.status_changed",
  "attraction.configured",
  "ticket.created",
  "ticket.updated",
  "sim.control",
]);
const SESSION_KEY = "ah-demo-session";

// --- small helpers ----------------------------------------------------------------------

export class DemoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
const badRequest = (msg: string, details?: unknown) => new DemoError(400, "bad_request", msg, details);
const notFound = (msg: string) => new DemoError(404, "not_found", msg);
const forbidden = (msg: string) => new DemoError(403, "forbidden", msg);
const invalid = (msg: string) => new DemoError(422, "validation_error", msg);
const invalidTransition = (msg: string, details?: unknown) =>
  new DemoError(400, "invalid_transition", msg, details);

const MIN = 60_000;
const nowIso = () => new Date().toISOString();
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * MIN);
const minuteOfDay = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const clone = <T>(v: T): T => structuredClone(v);
const uuid = () => crypto.randomUUID();
const average = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

function openingDay(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function downsample<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  return [...Array.from({ length: max - 1 }, (_, i) => rows[Math.floor(i * step)]!), rows.at(-1)!];
}

// --- internal records -------------------------------------------------------------------

interface Ride {
  a: Attraction;
  popularity: number;
  queue: number;
  history: StatusInterval[]; // oldest first
  metrics: MetricPoint[]; // oldest first
}

interface User extends Me {
  id: string;
}

interface Ticket extends TicketDetail {
  assignee_id: string | null;
  sim_opened_at: string | null;
  sim_resolved_at: string | null;
}

interface ParkSample {
  sim_time: string;
  guests: number;
  riders_served: number;
  avg_wait: number;
}

interface Actor {
  user_id: string | null;
  name: string;
}
const SYSTEM: Actor = { user_id: null, name: "Simulation" };
const actorOf = (u: User): Actor => ({ user_id: u.id, name: u.full_name });

interface RepairPlan {
  assign_at: Date;
  start_at: Date;
  resolve_at: Date;
  close_at: Date;
}

type Listener = (msg: ServerMessage) => void;

export interface DemoRequest {
  method: string;
  path: string; // without the /api/v1 prefix
  query: URLSearchParams;
  body: unknown;
  token: string | null;
}

// --- the server -------------------------------------------------------------------------

export class DemoServer {
  private rides = new Map<string, Ride>();
  private users: User[];
  private tickets: Ticket[] = [];
  private nextTicketNumber = 1001;
  private parkSamples: ParkSample[] = [];
  private activity: ActivityItem[] = []; // newest first
  private listeners = new Set<Listener>();
  private delays = new Map<string, Date>();
  private repairs = new Map<string, RepairPlan>();
  private lastStreamMs = 0;
  private streamSeq = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private sim = { running: true, speed: 1, simTime: new Date(), tick: 0, guests: 0 };

  constructor() {
    const landBySlug = new Map<string, { id: string; slug: string; name: string; description: string }>(
      LANDS.map((l) => [l.slug, { id: `land-${l.slug}`, ...l }]),
    );
    const now = nowIso();
    for (const s of ATTRACTIONS) {
      const land = landBySlug.get(s.land)!;
      this.rides.set(s.slug, {
        popularity: s.popularity,
        queue: 0,
        metrics: [],
        history: [{ status: "operating", started_at: now, ended_at: null, reason: "Initial seed" }],
        a: {
          id: `attraction-${s.slug}`,
          slug: s.slug,
          name: s.name,
          description: s.description,
          type: s.type,
          land: { id: land.id, slug: land.slug, name: land.name, description: land.description },
          status: "operating",
          hourly_capacity: s.hourly_capacity,
          riders_per_dispatch: s.riders_per_dispatch,
          dispatch_interval_s: s.dispatch_interval_s,
          popularity: s.popularity,
          map_x: s.map_x,
          map_y: s.map_y,
          version: 1,
          updated_at: now,
          live: null,
        },
      });
    }
    this.users = DEMO_USERS.map((u, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      permissions: ROLE_PERMISSIONS[u.role],
    }));
    this.reset(SYSTEM, true);
  }

  /** Start ticking (idempotent). Called once the UI is mounted in a browser. */
  start(): void {
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.start();
    return () => this.listeners.delete(listener);
  }

  // --- HTTP surface ---------------------------------------------------------------------

  handle(req: DemoRequest): { status: number; body: unknown } {
    const { method, path, query, body } = req;
    const parts = path.split("/").filter(Boolean);
    const b = (body ?? {}) as Record<string, unknown>;

    // Auth (no session needed)
    if (parts[0] === "auth") {
      switch (`${method} ${parts[1]}`) {
        case "GET demo-config":
          return ok({ demo_login: true });
        case "POST demo-login":
          return ok(this.demoLogin(String(b.role)));
        case "POST login":
          throw new DemoError(
            401,
            "unauthenticated",
            "Email sign-in needs the full stack. In this browser demo, pick a role instead.",
          );
        case "POST refresh":
          return ok(this.refresh());
        case "POST logout":
          sessionStore.clear();
          return { status: 204, body: null };
        case "GET me":
          return ok(this.authenticate(req.token));
      }
      throw notFound("Not Found");
    }

    const user = this.authenticate(req.token);
    const need = (p: Permission) => {
      if (!user.permissions.includes(p)) throw forbidden(`Requires permission '${p}'`);
    };
    need("operations:view");

    const route = `${method} ${parts.join("/")}`;
    const limit = (dflt: number) => Number(query.get("limit") ?? dflt);

    if (route === "GET lands") return ok(LANDS.map((l) => ({ id: `land-${l.slug}`, ...l })));
    if (route === "GET attractions") return ok(this.listAttractions());
    if (route === "GET overview") return ok(this.overview());
    if (route === "GET activity") return ok(this.activity.slice(0, limit(30)));
    if (route === "GET analytics/guest-flow")
      return ok(this.guestFlow(Number(query.get("max_points") ?? 160)));
    if (route === "GET analytics/reliability") return ok(this.reliability(Number(query.get("hours") ?? 24)));
    if (route === "GET simulation") return ok(this.simOut());
    if (route === "GET technicians") return ok(this.technicians());
    if (route === "POST ws-ticket") return ok({ ticket: "demo" });

    if (parts[0] === "attractions" && parts[1]) {
      const ride = this.ride(parts[1]);
      const sub = parts[2];
      if (method === "GET" && !sub) return ok(clone(ride.a));
      if (method === "GET" && sub === "status-history")
        return ok(clone(ride.history.slice(-limit(50)).reverse()));
      if (method === "GET" && sub === "metrics") return ok(clone(ride.metrics.slice(-limit(240))));
      if (method === "POST" && sub === "status") {
        need("attractions:change_status");
        const status = b.status as AttractionStatus;
        if (!["operating", "delayed", "down", "closed", "refurb"].includes(status))
          throw invalid("Invalid status");
        const reason = typeof b.reason === "string" && b.reason ? b.reason : null;
        this.changeStatus(ride.a.slug, status, actorOf(user), reason);
        return ok(clone(ride.a));
      }
      if (method === "PATCH" && !sub) {
        need("attractions:configure");
        return ok(this.configure(ride, b, actorOf(user)));
      }
    }

    if (parts[0] === "tickets") {
      if (method === "GET" && !parts[1]) {
        const openOnly = query.get("open_only") === "true";
        return ok(
          this.tickets
            .filter((t) => !openOnly || OPEN_STATES.includes(t.state))
            .sort((x, y) => y.opened_at.localeCompare(x.opened_at))
            .slice(0, limit(200))
            .map((t) => this.ticketOut(t, false)),
        );
      }
      if (method === "POST" && !parts[1]) {
        need("tickets:create");
        const title = String(b.title ?? "").trim();
        if (title.length < 3 || title.length > 140) throw invalid("Title must be 3–140 characters");
        const t = this.createTicket({
          slug: String(b.attraction_slug),
          title,
          description: String(b.description ?? ""),
          issue: b.issue_type as IssueType,
          severity: b.severity as Severity,
          actor: actorOf(user),
          source: "operator",
        });
        return { status: 201, body: this.ticketOut(t, true) };
      }
      const t = this.ticket(parts[1]!);
      if (method === "GET" && !parts[2]) return ok(this.ticketOut(t, true));
      if (method === "POST" && parts[2] === "assign") {
        need("tickets:assign");
        return ok(this.ticketOut(this.assign(t, String(b.assignee_id), actorOf(user)), true));
      }
      if (method === "POST" && parts[2] === "transition") {
        const any = user.permissions.includes("tickets:update_any");
        if (!any && !user.permissions.includes("tickets:update_own"))
          throw forbidden("Requires permission 'tickets:update_own'");
        const note = typeof b.note === "string" && b.note ? b.note : null;
        return ok(
          this.ticketOut(this.transition(t, b.to_state as TicketState, actorOf(user), any, note), true),
        );
      }
    }

    if (parts[0] === "simulation" && method === "POST") {
      need("simulation:control");
      return ok(this.control(parts[1] ?? "", b, user));
    }

    throw notFound("Not Found");
  }

  // --- auth -----------------------------------------------------------------------------

  private token(u: User): TokenResponse {
    const { id, email, full_name, role, permissions } = u;
    return {
      access_token: `demo.${id}`,
      token_type: "bearer",
      expires_in: 900,
      user: { id, email, full_name, role, permissions },
    };
  }

  private demoLogin(role: string): TokenResponse {
    const u = this.users.find((x) => x.role === (role as Role));
    if (!u) throw invalid("Unknown role");
    sessionStore.set(u.id);
    return this.token(u);
  }

  private refresh(): TokenResponse {
    const u = this.users.find((x) => x.id === sessionStore.get());
    if (!u) throw new DemoError(401, "unauthenticated", "No session");
    return this.token(u);
  }

  private authenticate(token: string | null): User {
    const u = token?.startsWith("demo.") ? this.users.find((x) => x.id === token.slice(5)) : undefined;
    if (!u) throw new DemoError(401, "unauthenticated", "Not authenticated");
    return u;
  }

  // --- events (events/publisher.py) -----------------------------------------------------

  private publish(type: string, payload: Record<string, unknown>, entityId: string | null = null): void {
    const ms = Date.now();
    if (ms > this.lastStreamMs) {
      this.lastStreamMs = ms;
      this.streamSeq = 0;
    } else {
      this.streamSeq++;
    }
    const item: ActivityItem = {
      id: `${this.lastStreamMs}-${this.streamSeq}`,
      type,
      entity_id: entityId,
      occurred_at: nowIso(),
      payload,
      schema_version: 1,
    };
    if (FEED_TYPES.has(type)) this.activity = [item, ...this.activity].slice(0, 200);
    const msg = { kind: "event" as const, ...item };
    // Delivered asynchronously, like a socket: never inside the caller's request.
    queueMicrotask(() => this.listeners.forEach((l) => l(clone(msg))));
  }

  // --- attractions (attractions/service.py) ---------------------------------------------

  private ride(slug: string): Ride {
    const r = this.rides.get(slug);
    if (!r) throw notFound(`Attraction '${slug}' not found`);
    return r;
  }

  private listAttractions(): Attraction[] {
    const landOrder = new Map<string, number>(LANDS.map((l, i) => [l.slug, i]));
    return [...this.rides.values()]
      .map((r) => r.a)
      .sort(
        (x, y) => landOrder.get(x.land.slug)! - landOrder.get(y.land.slug)! || x.name.localeCompare(y.name),
      )
      .map(clone);
  }

  private changeStatus(
    slug: string,
    status: AttractionStatus,
    actor: Actor,
    reason: string | null,
  ): Attraction {
    const r = this.ride(slug);
    const old = r.a.status;
    if (old === status) return r.a;
    const now = nowIso();
    const open = r.history.at(-1);
    if (open && open.ended_at === null) open.ended_at = now;
    r.history.push({ status, started_at: now, ended_at: null, reason });
    if (r.history.length > 200) r.history.shift();
    r.a.status = status;
    r.a.version++;
    r.a.updated_at = now;
    this.publish(
      "attraction.status_changed",
      {
        slug,
        name: r.a.name,
        land: r.a.land.name,
        from: old,
        to: status,
        reason,
        actor: actor.name,
        version: r.a.version,
      },
      slug,
    );
    return r.a;
  }

  private configure(r: Ride, b: Record<string, unknown>, actor: Actor): Attraction {
    const rpdIn = b.riders_per_dispatch as number | undefined;
    const ivIn = b.dispatch_interval_s as number | undefined;
    if (rpdIn === undefined && ivIn === undefined)
      throw invalid("Provide riders_per_dispatch and/or dispatch_interval_s");
    if (
      (rpdIn !== undefined && (rpdIn < 1 || rpdIn > 1000)) ||
      (ivIn !== undefined && (ivIn < 5 || ivIn > 3600))
    )
      throw invalid("Request validation failed");
    const rpd = rpdIn ?? r.a.riders_per_dispatch;
    const iv = ivIn ?? r.a.dispatch_interval_s;
    if ((rpd * 3600) / iv > MAX_HOURLY_CAPACITY)
      throw badRequest(`That would exceed ${MAX_HOURLY_CAPACITY.toLocaleString("en-US")} riders/hour`, {
        hourly_capacity: Math.round((rpd * 3600) / iv),
      });
    if (b.version !== r.a.version)
      throw new DemoError(409, "conflict", "Attraction was changed by someone else; reload and retry", {
        current_version: r.a.version,
      });
    r.a.riders_per_dispatch = rpd;
    r.a.dispatch_interval_s = iv;
    r.a.hourly_capacity = Math.round((rpd * 3600) / iv);
    r.a.version++;
    r.a.updated_at = nowIso();
    this.publish(
      "attraction.configured",
      {
        slug: r.a.slug,
        name: r.a.name,
        actor: actor.name,
        riders_per_dispatch: rpd,
        dispatch_interval_s: iv,
        hourly_capacity: r.a.hourly_capacity,
        version: r.a.version,
      },
      r.a.slug,
    );
    return clone(r.a);
  }

  // --- maintenance (maintenance/service.py) ---------------------------------------------

  private ticket(id: string): Ticket {
    const t = this.tickets.find((x) => x.id === id);
    if (!t) throw notFound("Ticket not found");
    return t;
  }

  private technicians(): Person[] {
    return this.users
      .filter((u) => u.role === "technician")
      .sort((x, y) => x.full_name.localeCompare(y.full_name))
      .map((u) => ({ id: u.id, full_name: u.full_name }));
  }

  private ticketOut(t: Ticket, withEvents: boolean): TicketDetail {
    const { assignee_id: _a, sim_opened_at: _o, sim_resolved_at: _r, events, ...rest } = t;
    void _a;
    void _o;
    void _r;
    return clone(withEvents ? { ...rest, events } : (rest as TicketDetail));
  }

  private timeline(
    t: Ticket,
    actor: Actor,
    kind: string,
    from: TicketState | null,
    to: TicketState | null,
    note: string | null,
  ): void {
    const e: TicketEvent = {
      actor_name: actor.name,
      at: nowIso(),
      kind,
      from_state: from,
      to_state: to,
      note,
    };
    t.events.push(e);
  }

  private ticketPayload(t: Ticket, actor: Actor, change: string): Record<string, unknown> {
    return {
      id: t.id,
      ref: t.ref,
      title: t.title,
      severity: t.severity,
      state: t.state,
      attraction: { ...t.attraction },
      assignee: t.assignee?.full_name ?? null,
      source: t.source,
      change,
      actor: actor.name,
    };
  }

  private createTicket(o: {
    slug: string;
    title: string;
    description: string;
    issue: IssueType;
    severity: Severity;
    actor: Actor;
    source: "operator" | "simulation";
  }): Ticket {
    const r = this.ride(o.slug);
    const number = this.nextTicketNumber++;
    const t: Ticket = {
      id: uuid(),
      number,
      ref: `MT-${number}`,
      attraction: { slug: r.a.slug, name: r.a.name },
      title: o.title,
      description: o.description,
      issue_type: o.issue,
      severity: o.severity,
      state: "open",
      source: o.source,
      assignee: null,
      assignee_id: null,
      opened_at: nowIso(),
      assigned_at: null,
      started_at: null,
      resolved_at: null,
      resolution_notes: null,
      sim_opened_at: this.sim.simTime.toISOString(),
      sim_resolved_at: null,
      version: 1,
      events: [],
    };
    this.timeline(t, o.actor, "created", null, "open", o.description || null);
    this.tickets.push(t);
    if (o.severity === "sev1" && UP_STATUSES.includes(r.a.status)) {
      this.changeStatus(r.a.slug, "down", o.actor, `${t.ref} (SEV1): ${o.title}`);
    }
    this.publish("ticket.created", this.ticketPayload(t, o.actor, "created"), t.id);
    return t;
  }

  private assign(t: Ticket, assigneeId: string, actor: Actor): Ticket {
    if (!OPEN_STATES.includes(t.state)) throw invalidTransition(`Cannot assign a ${t.state} ticket`);
    const tech = this.users.find((u) => u.id === assigneeId);
    if (!tech || tech.role !== "technician")
      throw badRequest("Assignee must be an active maintenance technician");
    const previous = t.assignee?.full_name ?? null;
    t.assignee = { id: tech.id, full_name: tech.full_name };
    t.assignee_id = tech.id;
    t.assigned_at = nowIso();
    const from = t.state;
    if (t.state === "open") t.state = "assigned";
    t.version++;
    this.timeline(
      t,
      actor,
      "assigned",
      from,
      t.state,
      `Assigned to ${tech.full_name}${previous ? ` (was ${previous})` : ""}`,
    );
    this.publish("ticket.updated", this.ticketPayload(t, actor, "assigned"), t.id);
    return t;
  }

  private transition(
    t: Ticket,
    to: TicketState,
    actor: Actor,
    canUpdateAny: boolean,
    note: string | null,
  ): Ticket {
    if (!canUpdateAny && t.assignee_id !== actor.user_id)
      throw forbidden("Technicians can only update tickets assigned to them");
    if (!TRANSITIONS[t.state]?.includes(to))
      throw invalidTransition(`Cannot move a ticket from ${t.state} to ${to}`, {
        allowed: [...TRANSITIONS[t.state]].sort(),
      });
    const now = nowIso();
    const from = t.state;
    t.state = to;
    if (to === "in_progress") {
      t.started_at ??= now;
      if (from === "resolved") t.resolved_at = null;
    } else if (to === "resolved") {
      t.resolved_at = now;
      t.sim_resolved_at = this.sim.simTime.toISOString();
      t.resolution_notes = note;
    }
    t.version++;
    this.timeline(t, actor, "state_changed", from, to, note);

    if (to === "resolved" && this.ride(t.attraction.slug).a.status === "down") {
      const blocking = this.tickets.some(
        (x) =>
          x.id !== t.id &&
          x.attraction.slug === t.attraction.slug &&
          x.severity === "sev1" &&
          OPEN_STATES.includes(x.state),
      );
      if (!blocking) this.changeStatus(t.attraction.slug, "operating", actor, `${t.ref} resolved`);
    }
    this.publish("ticket.updated", this.ticketPayload(t, actor, to), t.id);
    return t;
  }

  // --- analytics (analytics/router.py) --------------------------------------------------

  private simOut(): SimState {
    return { ...this.simDict(), speeds: SPEEDS };
  }

  private simDict() {
    return {
      running: this.sim.running,
      speed: this.sim.speed,
      sim_time: this.sim.simTime.toISOString(),
      tick: this.sim.tick,
      guests_in_park: this.sim.guests,
      simulated: true as const,
    };
  }

  private overview(): Overview {
    const rides = [...this.rides.values()].map((r) => r.a);
    const running = rides.filter((a) => UP_STATUSES.includes(a.status));
    const waits = running.map((a) => a.live?.wait_minutes).filter((w): w is number => w != null);
    const byStatus: Record<string, number> = {};
    for (const s of ["operating", "delayed", "down", "closed", "refurb"])
      byStatus[s] = rides.filter((a) => a.status === s).length;
    const incidents: Record<string, number> = { sev1: 0, sev2: 0, sev3: 0, sev4: 0 };
    for (const t of this.tickets) if (OPEN_STATES.includes(t.state)) incidents[t.severity]!++;
    return {
      attractions_total: rides.length,
      attractions_up: running.length,
      attractions_by_status: byStatus,
      avg_wait_minutes: waits.length ? round1(average(waits)!) : 0,
      guests_in_park: this.sim.guests,
      park_capacity: PARK_CAPACITY,
      open_incidents: incidents,
      sim: this.simOut(),
      simulated: true,
      trend: this.parkSamples
        .slice(-36)
        .map((p) => ({ sim_time: p.sim_time, guests: p.guests, avg_wait: p.avg_wait })),
    };
  }

  private guestFlow(maxPoints: number): GuestFlow {
    const t = this.sim.simTime;
    const dayStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())).toISOString();
    const rows = this.parkSamples.filter((p) => p.sim_time >= dayStart);
    return {
      points: downsample(rows, maxPoints).map((p) => ({
        sim_time: p.sim_time,
        guests: p.guests,
        avg_wait: p.avg_wait,
        riders_served: p.riders_served,
      })),
      riders_today: rows.reduce((s, p) => s + p.riders_served, 0),
      simulated: true,
    };
  }

  private reliability(hours: number): Reliability {
    const now = Date.now();
    const windowStart = now - hours * 3600_000;
    const tickets = this.tickets.filter((t) => Date.parse(t.opened_at) >= windowStart);
    const major = (t: Ticket) => t.severity === "sev1" || t.severity === "sev2";
    const perRide = [...this.rides.values()]
      .map((r) => r.a)
      .sort((x, y) => x.name.localeCompare(y.name))
      .map((a) => {
        let observed = 0;
        let up = 0;
        for (const iv of this.rides.get(a.slug)!.history) {
          const end = iv.ended_at ? Date.parse(iv.ended_at) : now;
          if (end <= windowStart) continue;
          const span = Math.max(0, end - Math.max(Date.parse(iv.started_at), windowStart));
          observed += span;
          if (UP_STATUSES.includes(iv.status)) up += span;
        }
        const mine = tickets.filter((t) => t.attraction.slug === a.slug);
        const repairs = mine
          .filter((t) => t.resolved_at && major(t))
          .map((t) => (Date.parse(t.resolved_at!) - Date.parse(t.opened_at)) / MIN);
        const mttr = average(repairs);
        return {
          slug: a.slug,
          name: a.name,
          uptime_pct: observed ? round2((100 * up) / observed) : 100,
          incidents: mine.length,
          mttr_minutes: mttr === null ? null : round1(mttr),
        };
      });
    const allRepairs = perRide.map((r) => r.mttr_minutes).filter((m): m is number => m !== null);
    const parkRepairs = tickets
      .filter((t) => t.sim_opened_at && t.sim_resolved_at && t.sim_resolved_at >= t.sim_opened_at && major(t))
      .map((t) => (Date.parse(t.sim_resolved_at!) - Date.parse(t.sim_opened_at!)) / MIN);
    const mttr = average(allRepairs);
    const mttrPark = average(parkRepairs);
    return {
      window_hours: hours,
      uptime_pct: perRide.length ? round2(average(perRide.map((r) => r.uptime_pct))!) : 100,
      incidents: tickets.length,
      resolved: tickets.filter((t) => t.resolved_at).length,
      mttr_minutes: mttr === null ? null : round1(mttr),
      mttr_park_minutes: mttrPark === null ? null : round1(mttrPark),
      attractions: perRide,
      note: "Simulation repairs run on the simulated clock; operator repairs on wall time.",
    };
  }

  // --- simulation control (simulation/router.py, control.py) ----------------------------

  private control(action: string, b: Record<string, unknown>, user: User): unknown {
    const actor = actorOf(user);
    const announce = (label: string) => {
      this.publish("sim.control", { action: label, actor: actor.name, ...this.simDict() });
      return this.simOut();
    };
    switch (action) {
      case "start":
        this.sim.running = true;
        return announce("start");
      case "pause":
        this.sim.running = false;
        return announce("pause");
      case "speed": {
        const speed = Number(b.speed);
        if (!SPEEDS.includes(speed)) throw badRequest(`speed must be one of (${SPEEDS.join(", ")})`);
        this.sim.speed = speed;
        return announce(`speed ${speed}x`);
      }
      case "reset":
        this.reset(actor, true);
        return this.simOut();
      case "downtime": {
        const r = this.ride(String(b.attraction_slug));
        if (!UP_STATUSES.includes(r.a.status)) throw badRequest(`${r.a.name} is already ${r.a.status}`);
        const minutes = Number(b.minutes ?? 30);
        const reason = String(b.reason ?? "Operator-triggered downtime drill");
        const t = this.scheduleBreakdown(
          r.a.slug,
          "safety",
          "sev1",
          reason,
          createRng(Date.now()),
          actor,
          minutes,
        );
        return { ticket_id: t.id, ref: t.ref };
      }
    }
    throw notFound("Not Found");
  }

  // --- simulation engine (simulation/engine.py) -----------------------------------------

  private configs(): Record<string, RideConfig> {
    const out: Record<string, RideConfig> = {};
    for (const [slug, r] of this.rides)
      out[slug] = {
        riders_per_dispatch: r.a.riders_per_dispatch,
        dispatch_interval_s: r.a.dispatch_interval_s,
        popularity: r.popularity,
        status: r.a.status,
      };
    return out;
  }

  private advance(dt: number, rng: Rng) {
    const newTime = addMinutes(this.sim.simTime, dt);
    const minute = minuteOfDay(newTime);
    const gate = stepGate(this.sim.guests, minute, dt, PARK_CAPACITY, rng);
    const configs = this.configs();
    const demand = rideDemand(gate.guests_in_park, configs, minute);
    const steps: Record<string, RideStep> = {};
    for (const [slug, r] of this.rides)
      steps[slug] = stepRide(configs[slug]!, r.queue, demand[slug]!, dt, rng);
    return { simTime: newTime, guests: gate.guests_in_park, steps };
  }

  private avgWait(steps: Record<string, RideStep>): number {
    const waits = Object.values(steps)
      .map((s) => s.wait_minutes)
      .filter((w): w is number => w !== null);
    return waits.length ? round1(average(waits)!) : 0;
  }

  tick(): void {
    if (!this.sim.running) return;
    const rng = createRng(7 * 1_000_003 + this.sim.tick);
    const dt = this.sim.speed;

    if (minuteOfDay(this.sim.simTime) >= CLOSE_MINUTE + 45) {
      // Overnight: jump to the next morning with an empty park.
      const t = this.sim.simTime;
      this.sim.simTime = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 8, 45));
      this.sim.guests = 0;
      this.sim.tick++;
      for (const r of this.rides.values()) {
        r.queue = 0;
        if (r.a.live) r.a.live = { ...r.a.live, queue_length: 0, wait_minutes: 0 };
      }
      return;
    }

    const out = this.advance(dt, rng);
    const avgWait = this.avgWait(out.steps);
    const simIso = out.simTime.toISOString();
    for (const [slug, s] of Object.entries(out.steps)) {
      const r = this.rides.get(slug)!;
      r.queue = s.queue;
      r.a.live = {
        queue_length: s.queue,
        wait_minutes: s.wait_minutes,
        riders_last_hour: Math.round((s.served * 60) / dt),
        updated_at: nowIso(),
      };
      r.metrics.push({
        sim_time: simIso,
        queue_length: s.queue,
        wait_minutes: s.wait_minutes,
        riders_served: s.served,
        status: r.a.status,
      });
      if (r.metrics.length > 400) r.metrics.shift();
    }
    const served = Object.values(out.steps).reduce((sum, s) => sum + s.served, 0);
    this.parkSamples.push({ sim_time: simIso, guests: out.guests, riders_served: served, avg_wait: avgWait });
    if (this.parkSamples.length > 3000) this.parkSamples.shift();
    this.sim = { ...this.sim, simTime: out.simTime, guests: out.guests, tick: this.sim.tick + 1 };

    this.advanceDelays(out.simTime);
    this.advanceRepairs(out.simTime);
    this.rollIncidents(rng);

    this.publish("sim.tick", {
      ...this.simDict(),
      avg_wait: avgWait,
      riders_served: served,
      rides: Object.entries(out.steps).map(([slug, s]) => {
        const status = this.rides.get(slug)!.a.status;
        return {
          slug,
          wait_minutes: UP_STATUSES.includes(status) ? s.wait_minutes : null,
          queue_length: s.queue,
          status,
        };
      }),
    });
  }

  private rollIncidents(rng: Rng): void {
    if (!isOpen(minuteOfDay(this.sim.simTime))) return;
    const dt = this.sim.speed;
    for (const r of this.rides.values()) {
      if (r.a.status !== "operating") continue;
      if (rng.random() < dt / MTBF_MINUTES[r.a.type]) {
        const [issue, severity, title] = rng.choice(BREAKDOWNS);
        this.scheduleBreakdown(r.a.slug, issue, severity, title, rng, SYSTEM);
      } else if (rng.random() < dt / DELAY_MEAN_MINUTES) {
        this.changeStatus(r.a.slug, "delayed", SYSTEM, "Guest-assist stop");
        this.delays.set(r.a.slug, addMinutes(this.sim.simTime, rng.randint(4, 15)));
      }
    }
  }

  private scheduleBreakdown(
    slug: string,
    issue: IssueType,
    severity: Severity,
    title: string,
    rng: Rng,
    actor: Actor,
    repairMinutes?: number,
  ): Ticket {
    const t = this.createTicket({
      slug,
      title,
      description: "Generated by the demo simulation.",
      issue,
      severity,
      actor,
      source: "simulation",
    });
    if (severity === "sev2") this.changeStatus(slug, "delayed", SYSTEM, `${t.ref}: ${title}`);
    const assign_at = addMinutes(this.sim.simTime, rng.randint(3, 8));
    const start_at = addMinutes(assign_at, rng.randint(2, 6));
    const resolve_at = addMinutes(start_at, repairMinutes ?? rng.randint(18, 60));
    this.repairs.set(t.id, { assign_at, start_at, resolve_at, close_at: addMinutes(resolve_at, 10) });
    return t;
  }

  private advanceDelays(now: Date): void {
    for (const [slug, until] of this.delays) {
      if (until > now) continue;
      this.delays.delete(slug);
      if (this.ride(slug).a.status === "delayed")
        this.changeStatus(slug, "operating", SYSTEM, "Delay cleared");
    }
  }

  /** Work SIMULATION tickets through their lifecycle; skip steps a person already took. */
  private advanceRepairs(now: Date): void {
    const techs = this.technicians();
    for (const [id, plan] of this.repairs) {
      const t = this.tickets.find((x) => x.id === id);
      if (!t) {
        this.repairs.delete(id);
        continue;
      }
      try {
        if (t.state === "open" && plan.assign_at <= now && techs.length) {
          this.assign(t, techs[t.number % techs.length]!.id, SYSTEM);
        } else if (t.state === "assigned" && plan.start_at <= now) {
          this.transition(t, "in_progress", SYSTEM, true, null);
        } else if (t.state === "in_progress" && plan.resolve_at <= now) {
          this.transition(t, "resolved", SYSTEM, true, "Repaired and test-cycled (simulated).");
          if (this.ride(t.attraction.slug).a.status === "delayed")
            this.changeStatus(t.attraction.slug, "operating", SYSTEM, `${t.ref} resolved`);
        } else if (t.state === "resolved" && plan.close_at <= now) {
          this.transition(t, "closed", SYSTEM, true, null);
        } else if (t.state === "closed") {
          this.repairs.delete(id);
        }
      } catch (e) {
        if (!(e instanceof DemoError)) throw e;
      }
    }
  }

  /** Return the park to a known state and warm-start it to mid-day (engine.reset). */
  private reset(actor: Actor, running: boolean): void {
    this.delays.clear();
    this.repairs.clear();
    this.parkSamples = [];
    for (const t of this.tickets) {
      if (!OPEN_STATES.includes(t.state)) continue;
      t.state = "closed";
      t.resolution_notes = "Closed by simulation reset.";
      t.resolved_at ??= nowIso();
    }
    for (const r of this.rides.values()) {
      r.metrics = [];
      r.queue = 0;
      if (r.a.status !== "operating") this.changeStatus(r.a.slug, "operating", actor, "Simulation reset");
    }

    const rng = createRng(7);
    const day = openingDay();
    this.sim = { running, speed: this.sim.speed, simTime: addMinutes(day, 8 * 60 + 45), tick: 0, guests: 0 };
    const end = addMinutes(day, WARM_START_HOURS * 60);
    const served: Record<string, number> = {};
    let last: ReturnType<DemoServer["advance"]> | null = null;
    // Flows are summed per 5-minute bucket so each sample covers the time since the last.
    while (this.sim.simTime < end) {
      last = this.advance(1, rng);
      this.sim.simTime = last.simTime;
      this.sim.guests = last.guests;
      for (const [slug, s] of Object.entries(last.steps)) {
        this.rides.get(slug)!.queue = s.queue;
        served[slug] = (served[slug] ?? 0) + s.served;
      }
      if (last.simTime.getUTCMinutes() % 5 === 0) {
        const simIso = last.simTime.toISOString();
        this.parkSamples.push({
          sim_time: simIso,
          guests: last.guests,
          riders_served: Object.values(served).reduce((s, n) => s + n, 0),
          avg_wait: this.avgWait(last.steps),
        });
        for (const [slug, s] of Object.entries(last.steps)) {
          this.rides.get(slug)!.metrics.push({
            sim_time: simIso,
            queue_length: s.queue,
            wait_minutes: s.wait_minutes,
            riders_served: served[slug] ?? 0,
            status: "operating",
          });
          served[slug] = 0;
        }
      }
    }
    for (const [slug, r] of this.rides) {
      const s = last?.steps[slug];
      r.a.live = {
        queue_length: s?.queue ?? 0,
        wait_minutes: s?.wait_minutes ?? 0,
        riders_last_hour: 0,
        updated_at: nowIso(),
      };
    }
    this.publish("sim.control", { action: "reset", actor: actor.name, ...this.simDict() });
  }
}

const ok = (body: unknown) => ({ status: 200, body });

/** The signed-in demo role survives a reload (like the real refresh cookie); the park doesn't. */
const sessionStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  set(id: string) {
    try {
      sessionStorage.setItem(SESSION_KEY, id);
    } catch {
      // Storage blocked: the session just won't survive a reload.
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  },
};

let instance: DemoServer | null = null;
/** One park per tab, created on first use in the browser. */
export function getDemoServer(): DemoServer {
  instance ??= new DemoServer();
  return instance;
}
