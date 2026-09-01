import { describe, expect, it } from "vitest";

import {
  DATA_STALE_AFTER_MS,
  isDataStale,
} from "@/lib/data-freshness";

describe("dashboard data freshness policy", () => {
  const generatedAt = new Date("2026-08-31T12:00:00.000Z");

  it("changes to stale at the documented five-minute boundary", () => {
    expect(isDataStale(generatedAt, new Date("2026-08-31T12:04:59.999Z"))).toBe(false);
    expect(isDataStale(generatedAt, new Date("2026-08-31T12:05:00.000Z"))).toBe(true);
    expect(DATA_STALE_AFTER_MS).toBe(300_000);
  });

  it("fails safe for invalid timestamps and rejects invalid thresholds", () => {
    expect(isDataStale(new Date("invalid"), new Date())).toBe(true);
    expect(() => isDataStale(generatedAt, generatedAt, 0)).toThrow(RangeError);
  });
});
