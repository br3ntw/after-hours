import { describe, expect, it } from "vitest";

import type { ActivityItem } from "@/lib/api/types";

import { age, describe as describeItem } from "./activity-feed";

const item = (type: string, payload: Record<string, unknown>): ActivityItem => ({
  id: "1-0",
  type,
  entity_id: null,
  occurred_at: "2026-10-13T12:00:00Z",
  payload,
  schema_version: 1,
});

describe("activity descriptions", () => {
  it("status change names the ride, new status, reason and actor", () => {
    const d = describeItem(
      item("attraction.status_changed", {
        slug: "orbit-9",
        name: "Orbit 9",
        to: "down",
        reason: "Lap bar check",
        actor: "Morgan Ops",
      }),
    );
    expect(d.title).toBe("Orbit 9 · Down");
    expect(d.detail).toBe("Lap bar check · Morgan Ops");
    expect(d.href).toBe("/attractions/orbit-9");
  });

  it("ticket assignment names the technician and links to the ticket", () => {
    const d = describeItem(
      item("ticket.updated", {
        id: "abc",
        ref: "MT-1003",
        change: "assigned",
        assignee: "Sam Okafor",
        severity: "sev1",
        title: "Lap bar",
        attraction: { name: "Orbit 9" },
      }),
    );
    expect(d.title).toBe("MT-1003 assigned to Sam Okafor");
    expect(d.tone).toBe("text-crit");
    expect(d.href).toBe("/maintenance?ticket=abc");
  });
});

describe("log age column", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  it.each([
    ["2026-10-14T11:59:55Z", "now"],
    ["2026-10-14T11:59:15Z", "45s"],
    ["2026-10-14T11:57:00Z", "3m"],
    ["2026-10-14T09:00:00Z", "3h"],
  ])("%s → %s", (iso, expected) => {
    expect(age(iso, now)).toBe(expected);
  });
});
