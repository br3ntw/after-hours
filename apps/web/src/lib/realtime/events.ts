import type { QueryClient } from "@tanstack/react-query";

import type { ActivityItem, Attraction, GuestFlow, Overview } from "@/lib/api/types";
import { keys } from "@/lib/queries";

import { pulse } from "./pulse-store";
import { toast } from "./toast-store";

/** What the server sends over /ws/events. */
export type ServerMessage =
  ({ kind: "event"; id: string } & Omit<ActivityItem, "id">) | { kind: "resync_required" } | { kind: "ping" };

export interface TickRide {
  slug: string;
  wait_minutes: number | null;
  queue_length: number;
  status: Attraction["status"] | null;
}

interface TickPayload {
  sim_time: string;
  speed: number;
  running: boolean;
  tick: number;
  guests_in_park: number;
  avg_wait: number;
  riders_served: number;
  rides: TickRide[];
}

const parseId = (id: string): [number, number] => {
  const [ms, seq] = id.split("-");
  return [Number(ms), Number(seq ?? 0)];
};

export function compareIds(a: string, b: string): number {
  const [am, as] = parseId(a);
  const [bm, bs] = parseId(b);
  return am === bm ? as - bs : am - bm;
}

/**
 * Stream ids are totally ordered, so de-duplication across reconnects and replay is a
 * single comparison against the last id applied.
 */
export class EventSequencer {
  lastId: string | null = null;

  accept(id: string): boolean {
    if (this.lastId !== null && compareIds(id, this.lastId) <= 0) return false;
    this.lastId = id;
    return true;
  }
}

const FEED_TYPES = new Set([
  "attraction.status_changed",
  "attraction.configured",
  "ticket.created",
  "ticket.updated",
  "sim.control",
]);

/** Apply one server event to the TanStack Query cache. Pure aside from cache, pulse, toast. */
export function applyEvent(qc: QueryClient, event: Extract<ServerMessage, { kind: "event" }>): void {
  if (event.type === "sim.tick") {
    applyTick(qc, event.payload as unknown as TickPayload);
    return;
  }

  if (FEED_TYPES.has(event.type)) {
    const item: ActivityItem = {
      id: event.id,
      type: event.type,
      entity_id: event.entity_id,
      occurred_at: event.occurred_at,
      payload: event.payload,
      schema_version: event.schema_version,
    };
    qc.setQueryData<ActivityItem[]>(keys.activity, (old) =>
      old?.some((a) => a.id === item.id) ? old : [item, ...(old ?? [])].slice(0, 60),
    );
    pulse(`feed:${event.id}`);
  }

  const p = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "attraction.status_changed":
    case "attraction.configured": {
      const slug = String(p.slug);
      pulse(`attraction:${slug}`);
      void qc.invalidateQueries({ queryKey: keys.attractions });
      void qc.invalidateQueries({ queryKey: keys.overview });
      void qc.invalidateQueries({ queryKey: keys.reliability });
      if (event.type === "attraction.status_changed") pulse("kpi:attractions");
      break;
    }
    case "ticket.created":
    case "ticket.updated": {
      void qc.invalidateQueries({ queryKey: keys.tickets });
      void qc.invalidateQueries({ queryKey: keys.overview });
      pulse("kpi:incidents");
      const attraction = p.attraction as { slug: string; name: string } | undefined;
      if (attraction) pulse(`attraction:${attraction.slug}`);
      if (event.type === "ticket.created" && (p.severity === "sev1" || p.severity === "sev2")) {
        toast({
          tone: p.severity === "sev1" ? "critical" : "warning",
          title: `${String(p.ref)} · ${p.severity === "sev1" ? "SEV1" : "SEV2"} at ${attraction?.name ?? "attraction"}`,
          body: String(p.title),
          href: `/maintenance?ticket=${String(p.id)}`,
        });
      }
      break;
    }
    case "sim.control":
      void qc.invalidateQueries();
      break;
  }
}

function applyTick(qc: QueryClient, t: TickPayload): void {
  const bySlug = new Map(t.rides.map((r) => [r.slug, r]));
  qc.setQueryData<Attraction[]>(keys.attractions, (old) =>
    old?.map((a) => {
      const r = bySlug.get(a.slug);
      if (!r) return a;
      if (r.status && r.status !== a.status) pulse(`attraction:${a.slug}`);
      return {
        ...a,
        status: r.status ?? a.status,
        live: {
          queue_length: r.queue_length,
          wait_minutes: r.wait_minutes,
          riders_last_hour: a.live?.riders_last_hour ?? 0,
          updated_at: t.sim_time,
        },
      };
    }),
  );
  const sim = {
    running: t.running,
    speed: t.speed,
    sim_time: t.sim_time,
    tick: t.tick,
    guests_in_park: t.guests_in_park,
    simulated: true as const,
  };
  qc.setQueryData<Overview>(keys.overview, (old) =>
    old
      ? {
          ...old,
          guests_in_park: t.guests_in_park,
          avg_wait_minutes: t.avg_wait,
          sim: { ...old.sim, ...sim },
          trend: [
            ...old.trend.slice(-35),
            { sim_time: t.sim_time, guests: t.guests_in_park, avg_wait: t.avg_wait },
          ],
        }
      : old,
  );
  qc.setQueryData(keys.sim, (old: Overview["sim"] | undefined) => (old ? { ...old, ...sim } : old));
  qc.setQueryData<GuestFlow>(keys.guestFlow, (old) => {
    if (!old) return old;
    const points = [
      ...old.points,
      {
        sim_time: t.sim_time,
        guests: t.guests_in_park,
        avg_wait: t.avg_wait,
        riders_served: t.riders_served,
      },
    ];
    // Keep the live chart bounded; drop every other historic point once it gets long.
    const bounded =
      points.length > 220 ? points.filter((_, i) => i % 2 === 0 || i > points.length - 40) : points;
    return { ...old, points: bounded, riders_today: old.riders_today + t.riders_served };
  });
}
