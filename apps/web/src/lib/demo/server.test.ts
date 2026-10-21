import { describe, expect, it } from "vitest";

import type { Attraction, Overview, TicketDetail, TokenResponse } from "@/lib/api/types";

import { demoFetch } from "./fetch";
import { postedWait } from "./model";
import { DemoServer } from "./server";

function client(server = new DemoServer()) {
  let token: string | null = null;
  const call = (method: string, path: string, body?: unknown) =>
    server.handle({
      method,
      path,
      query: new URL(path, "http://x").searchParams,
      body,
      token,
    });
  const as = (role: string) => {
    token = (call("POST", "/auth/demo-login", { role }).body as TokenResponse).access_token;
  };
  const get = <T>(path: string) => call("GET", path.split("?")[0]!, undefined).body as T;
  return { server, call, as, get };
}

describe("browser demo server", () => {
  it("warm-starts the park at 14:00 with guests, waits and history", () => {
    const { as, get } = client();
    as("analyst");
    const o = get<Overview>("/overview");
    expect(o.sim.sim_time.slice(11, 16)).toBe("14:00");
    expect(o.attractions_total).toBe(24);
    expect(o.guests_in_park).toBeGreaterThan(5000);
    expect(o.avg_wait_minutes).toBeGreaterThan(0);
    expect(o.trend.length).toBeGreaterThan(30);
    expect(o.simulated).toBe(true);
  });

  it("enforces the same permission matrix as the API", () => {
    const { call, as } = client();
    expect(() => call("GET", "/attractions")).toThrow("Not authenticated");
    as("analyst");
    expect(() => call("POST", "/attractions/orbit-9/status", { status: "down" })).toThrow(
      "Requires permission 'attractions:change_status'",
    );
    as("ops_manager");
    expect(() => call("POST", "/simulation/pause")).toThrow("Requires permission 'simulation:control'");
    expect(call("POST", "/attractions/orbit-9/status", { status: "down" }).status).toBe(200);
  });

  it("a SEV1 takes the ride down; resolving the last one brings it back", () => {
    const { call, as, get } = client();
    as("ops_manager");
    const t = call("POST", "/tickets", {
      attraction_slug: "glacier-run",
      title: "Restraint check failed",
      issue_type: "safety",
      severity: "sev1",
    }).body as TicketDetail;
    expect(get<Attraction>("/attractions/glacier-run").status).toBe("down");

    const tech = get<{ id: string }[]>("/technicians")[0]!;
    call("POST", `/tickets/${t.id}/assign`, { assignee_id: tech.id });
    call("POST", `/tickets/${t.id}/transition`, { to_state: "in_progress" });
    const done = call("POST", `/tickets/${t.id}/transition`, { to_state: "resolved", note: "Fixed" })
      .body as TicketDetail;
    expect(done.state).toBe("resolved");
    expect(done.events.map((e) => e.kind)).toEqual(["created", "assigned", "state_changed", "state_changed"]);
    expect(get<Attraction>("/attractions/glacier-run").status).toBe("operating");
  });

  it("rejects transitions the state machine doesn't allow", () => {
    const { call, as } = client();
    as("ops_manager");
    const t = call("POST", "/tickets", {
      attraction_slug: "orbit-9",
      title: "Lap bar padding",
      issue_type: "other",
      severity: "sev4",
    }).body as TicketDetail;
    expect(() => call("POST", `/tickets/${t.id}/transition`, { to_state: "closed" })).toThrow(
      "Cannot move a ticket from open to closed",
    );
  });

  it("advances the park clock on each tick and stops when paused", () => {
    const { as, get, call, server } = client();
    as("admin");
    const before = get<Overview>("/overview").sim.sim_time;
    server.tick();
    expect(get<Overview>("/overview").sim.sim_time).not.toBe(before);
    call("POST", "/simulation/pause");
    const paused = get<Overview>("/overview").sim.sim_time;
    server.tick();
    expect(get<Overview>("/overview").sim.sim_time).toBe(paused);
  });

  it("posts waits rounded up to 5 minutes, like the Python model", () => {
    const ride = { riders_per_dispatch: 24, dispatch_interval_s: 60, popularity: 1, status: "operating" };
    expect(postedWait(0, ride)).toBe(0);
    expect(postedWait(10, ride)).toBe(5);
    expect(postedWait(500, ride)).toBe(25); // 500 / 24 per min ≈ 20.8 → 25
    expect(postedWait(500, { ...ride, status: "down" })).toBeNull();
  });
});

describe("demoFetch", () => {
  it("returns the backend's error envelope and status codes", async () => {
    const res = await demoFetch("/api/v1/attractions");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthenticated", message: "Not authenticated" } });
  });
});
