// What one open Command Center does on load and while polling, at increasing user counts.
import http from "k6/http";
import { check, group, sleep } from "k6";

import { API, signOn } from "./lib.js";

export const options = {
  scenarios: {
    dashboards: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 25 },
        { duration: "60s", target: 50 },
        { duration: "30s", target: 100 },
        { duration: "30s", target: 100 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:overview}": ["p(95)<250"],
    "http_req_duration{endpoint:attractions}": ["p(95)<250"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function setup() {
  return { token: signOn("analyst") };
}

const PATHS = {
  overview: "/api/v1/overview",
  attractions: "/api/v1/attractions",
  activity: "/api/v1/activity?limit=40",
  guest_flow: "/api/v1/analytics/guest-flow?max_points=120",
  tickets: "/api/v1/tickets?open_only=true&limit=300", // what the dashboard actually needs
  reliability: "/api/v1/analytics/reliability?hours=24",
};

export default function (data) {
  // Browsers always send Accept-Encoding; so does this test (the API gzips responses > 1 KB).
  const params = (endpoint) => ({
    headers: { Authorization: `Bearer ${data.token}`, "Accept-Encoding": "gzip" },
    tags: { endpoint },
  });
  group("dashboard load", () => {
    const responses = http.batch(
      Object.entries(PATHS).map(([name, path]) => ["GET", `${API}${path}`, null, params(name)]),
    );
    responses.forEach((r) => check(r, { "status 200": (res) => res.status === 200 }));
  });
  // Then poll like the UI does (overview every 15 s, guest flow every 10 s), compressed.
  sleep(1 + Math.random());
  check(http.get(`${API}${PATHS.overview}`, params("overview")), { "poll 200": (r) => r.status === 200 });
  sleep(1 + Math.random());
}
