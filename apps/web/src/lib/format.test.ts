import { describe, expect, it } from "vitest";

import { formatDuration, formatRelative, formatSimClock, formatWait } from "./format";

describe("format", () => {
  it("renders the simulated clock in park time (UTC fields), independent of the viewer's zone", () => {
    expect(formatSimClock("2026-10-13T14:05:00Z")).toBe("2:05 PM");
  });

  it("relative time", () => {
    const now = Date.parse("2026-10-13T12:10:00Z");
    expect(formatRelative("2026-10-13T12:09:55Z", now)).toBe("just now");
    expect(formatRelative("2026-10-13T12:09:30Z", now)).toBe("30s ago");
    expect(formatRelative("2026-10-13T12:00:00Z", now)).toBe("10 min ago");
    expect(formatRelative("2026-10-13T09:10:00Z", now)).toBe("3 h ago");
  });

  it("durations and waits", () => {
    expect(formatDuration("2026-10-13T12:00:00Z", "2026-10-13T12:45:00Z")).toBe("45 min");
    expect(formatDuration("2026-10-13T12:00:00Z", "2026-10-13T14:05:00Z")).toBe("2 h 5 min");
    expect(formatWait(null)).toBe("—");
    expect(formatWait(35)).toBe("35 min");
  });
});
