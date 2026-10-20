// Many dashboards holding the live event stream open at once.
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

import { API, signOn } from "./lib.js";

const WS = API.replace(/^http/, "ws");
const eventsReceived = new Counter("ws_events_received");
const outOfOrder = new Counter("ws_events_out_of_order");
const ticksPerSocket = new Trend("ws_ticks_per_socket");

const CONNECTIONS = Number(__ENV.CONNECTIONS || 200);
const HOLD_MS = Number(__ENV.HOLD_MS || 60000);
// Spread connects over this window. 0 = every socket at the same instant, which on macOS
// overflows the listen backlog (kern.ipc.somaxconn = 128) and the kernel resets the excess.
const STAGGER_MS = Number(__ENV.STAGGER_MS ?? 10000);

export const options = {
  scenarios: {
    sockets: { executor: "per-vu-iterations", vus: CONNECTIONS, iterations: 1, maxDuration: "4m" },
  },
  thresholds: {
    ws_connecting: ["p(95)<500"],
    checks: ["rate>0.99"],
    ws_events_out_of_order: ["count==0"],
  },
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
};

export function setup() {
  return { token: signOn("analyst") };
}

export default function (data) {
  if (STAGGER_MS > 0) sleep((Math.random() * STAGGER_MS) / 1000);
  const ticket = http
    .post(`${API}/api/v1/ws-ticket`, null, { headers: { Authorization: `Bearer ${data.token}` } })
    .json("ticket");
  let lastId = "0-0";
  let ticks = 0;
  const cmp = (a, b) => {
    const [am, as] = a.split("-").map(Number);
    const [bm, bs] = b.split("-").map(Number);
    return am === bm ? as - bs : am - bm;
  };
  const res = ws.connect(`${WS}/ws/events?ticket=${encodeURIComponent(ticket)}`, null, (socket) => {
    socket.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.kind !== "event") return;
      eventsReceived.add(1);
      if (cmp(msg.id, lastId) <= 0) outOfOrder.add(1);
      lastId = msg.id;
      if (msg.type === "sim.tick") ticks += 1;
    });
    socket.setTimeout(() => socket.close(), HOLD_MS);
  });
  check(res, { "upgraded (101)": (r) => r && r.status === 101 });
  check(ticks, { "received live ticks": (n) => n > 0 });
  ticksPerSocket.add(ticks);
}
