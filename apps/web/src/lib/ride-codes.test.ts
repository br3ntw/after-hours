import { describe, expect, it } from "vitest";

import { rideCode } from "./ride-codes";

describe("rideCode", () => {
  it("uses the assigned code", () => {
    expect(rideCode("orbit-9")).toBe("OR9");
  });
  it("falls back to a deterministic three-letter code", () => {
    expect(rideCode("new-ride")).toBe("NEW");
  });
});
