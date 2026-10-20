import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { ActivityItem, Attraction, Overview } from "@/lib/api/types";
import { keys } from "@/lib/queries";

import { applyEvent, compareIds, EventSequencer, type ServerMessage } from "./events";
import { pulseCount } from "./pulse-store";
import { backoffMs } from "./realtime-provider";

type EventMsg = Extract<ServerMessage, { kind: "event" }>;
const event = (id: string, type: string, payload: Record<string, unknown>): EventMsg => ({
  kind: "event",
  id,
  type,
  entity_id: null,
  occurred_at: "2026-10-13T12:00:00Z",
  payload,
  schema_version: 1,
});

const attraction = (slug: string, status: Attraction["status"] = "operating"): Attraction =>
  ({
    slug,
    status,
    name: slug,
    live: { queue_length: 0, wait_minutes: 0, riders_last_hour: 0, updated_at: "" },
  }) as Attraction;

describe("stream id ordering", () => {
  it("compares millisecond then sequence parts numerically", () => {
    expect(compareIds("1700000000000-2", "1700000000000-10")).toBeLessThan(0);
    expect(compareIds("1700000000001-0", "1700000000000-99")).toBeGreaterThan(0);
    expect(compareIds("5-5", "5-5")).toBe(0);
  });

  it("drops duplicates and out-of-order replays", () => {
    const seq = new EventSequencer();
    expect(seq.accept("10-0")).toBe(true);
    expect(seq.accept("10-0")).toBe(false); // duplicate (e.g. replay overlapping live)
    expect(seq.accept("9-5")).toBe(false); // older
    expect(seq.accept("10-1")).toBe(true);
    expect(seq.lastId).toBe("10-1");
  });
});

describe("applyEvent", () => {
  it("applies a sim tick to the attraction list and overview without refetching", () => {
    const qc = new QueryClient();
    qc.setQueryData(keys.attractions, [attraction("orbit-9"), attraction("glacier-run")]);
    qc.setQueryData<Partial<Overview>>(keys.overview, {
      guests_in_park: 1,
      avg_wait_minutes: 0,
      sim: {} as Overview["sim"],
      trend: [],
    });

    applyEvent(
      qc,
      event("1-0", "sim.tick", {
        sim_time: "2026-10-13T15:00:00Z",
        speed: 1,
        running: true,
        tick: 5,
        guests_in_park: 25000,
        avg_wait: 31.5,
        riders_served: 400,
        rides: [{ slug: "orbit-9", wait_minutes: 45, queue_length: 900, status: "operating" }],
      }),
    );

    const list = qc.getQueryData<Attraction[]>(keys.attractions)!;
    expect(list[0]!.live).toMatchObject({ wait_minutes: 45, queue_length: 900 });
    expect(list[1]!.live?.wait_minutes).toBe(0); // untouched
    const overview = qc.getQueryData<Overview>(keys.overview)!;
    expect(overview.guests_in_park).toBe(25000);
    expect(overview.avg_wait_minutes).toBe(31.5);
    expect(overview.trend).toHaveLength(1);
  });

  it("a tick that changes a ride's status pulses that ride", () => {
    const qc = new QueryClient();
    qc.setQueryData(keys.attractions, [attraction("brass-comet")]);
    const before = pulseCount("attraction:brass-comet");
    applyEvent(
      qc,
      event("2-0", "sim.tick", {
        sim_time: "x",
        speed: 1,
        running: true,
        tick: 1,
        guests_in_park: 0,
        avg_wait: 0,
        riders_served: 0,
        rides: [{ slug: "brass-comet", wait_minutes: null, queue_length: 0, status: "down" }],
      }),
    );
    expect(qc.getQueryData<Attraction[]>(keys.attractions)![0]!.status).toBe("down");
    expect(pulseCount("attraction:brass-comet")).toBe(before + 1);
  });

  it("prepends operator events to the activity feed exactly once", () => {
    const qc = new QueryClient();
    qc.setQueryData<ActivityItem[]>(keys.activity, []);
    const e = event("3-0", "attraction.status_changed", { slug: "orbit-9", name: "Orbit 9", to: "closed" });
    applyEvent(qc, e);
    applyEvent(qc, e);
    expect(qc.getQueryData<ActivityItem[]>(keys.activity)!.map((a) => a.id)).toEqual(["3-0"]);
  });

  it("does not add telemetry ticks to the activity feed", () => {
    const qc = new QueryClient();
    qc.setQueryData<ActivityItem[]>(keys.activity, []);
    applyEvent(
      qc,
      event("4-0", "sim.tick", {
        sim_time: "x",
        speed: 1,
        running: true,
        tick: 1,
        guests_in_park: 0,
        avg_wait: 0,
        riders_served: 0,
        rides: [],
      }),
    );
    expect(qc.getQueryData<ActivityItem[]>(keys.activity)).toEqual([]);
  });
});

describe("backoffMs", () => {
  it("grows exponentially with jitter and caps at 15 s", () => {
    expect(backoffMs(0, () => 1)).toBe(500);
    expect(backoffMs(0, () => 0)).toBe(250);
    expect(backoffMs(3, () => 1)).toBe(4000);
    expect(backoffMs(20, () => 1)).toBe(15000);
  });
});
