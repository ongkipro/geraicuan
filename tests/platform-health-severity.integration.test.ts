import { describe, expect, it } from "vitest";

import {
  PLATFORM_HEALTH_THRESHOLDS as T,
  platformHealthSeverities,
  type PlatformHealthSignals,
} from "@/db/platform-monitoring-repository";

/**
 * T-93 / spec 19 M-2 platform table: every severity rule at its boundary, through the one
 * function `readPlatformHealth` uses. Each expectation sits on the exact threshold and one unit
 * past it, so moving a threshold (or flipping a strict/inclusive comparison) fails here.
 */
const quiet: PlatformHealthSignals = {
  queue: { count: 0, oldestMs: null },
  unpaid: { count: 0, oldestMs: null },
  unknown: { count: 0, oldestMs: null },
  failures: { share: 0, recentCodePeak: 0, hasCriticalCode: false },
};
const severity = (patch: Partial<PlatformHealthSignals>) => platformHealthSeverities({ ...quiet, ...patch });

describe("platform health severity boundaries (spec 19 M-2)", () => {
  it("is Normal everywhere with nothing to report", () => {
    expect(platformHealthSeverities(quiet)).toEqual({ failures: "normal", queue: "normal", unknown: "normal", unpaid: "normal" });
  });

  it("OPS-QUEUE-STUCK: any stuck batch is Perhatian; 20 or more, or oldest past 60 minutes, is Kritis", () => {
    expect(T.queueCriticalCount).toBe(20);
    expect(T.queueCriticalAgeMs).toBe(60 * 60_000);
    expect(severity({ queue: { count: 1, oldestMs: 0 } }).queue).toBe("perhatian");
    expect(severity({ queue: { count: 19, oldestMs: T.queueCriticalAgeMs } }).queue).toBe("perhatian");
    expect(severity({ queue: { count: 20, oldestMs: 0 } }).queue).toBe("kritis");
    expect(severity({ queue: { count: 1, oldestMs: T.queueCriticalAgeMs + 1 } }).queue).toBe("kritis");
  });

  it("OPS-UNPAID: any unpaid order is at least Perhatian, however recent; older than 24 hours is Kritis", () => {
    expect(T.unpaidCriticalAgeMs).toBe(24 * 60 * 60_000);
    expect(severity({ unpaid: { count: 1, oldestMs: 0 } }).unpaid).toBe("perhatian");
    expect(severity({ unpaid: { count: 1, oldestMs: 60_000 } }).unpaid).toBe("perhatian");
    expect(severity({ unpaid: { count: 3, oldestMs: T.unpaidCriticalAgeMs } }).unpaid).toBe("perhatian");
    expect(severity({ unpaid: { count: 1, oldestMs: T.unpaidCriticalAgeMs + 1 } }).unpaid).toBe("kritis");
  });

  it("OPS-UNKNOWN: any unknown outcome is Perhatian; oldest past 30 minutes is Kritis", () => {
    expect(T.unknownCriticalAgeMs).toBe(30 * 60_000);
    expect(severity({ unknown: { count: 1, oldestMs: 0 } }).unknown).toBe("perhatian");
    expect(severity({ unknown: { count: 1, oldestMs: T.unknownCriticalAgeMs } }).unknown).toBe("perhatian");
    expect(severity({ unknown: { count: 1, oldestMs: T.unknownCriticalAgeMs + 1 } }).unknown).toBe("kritis");
  });

  it("OPS-FAILURE-SHARE: above 2% is Perhatian, above 10% is Kritis", () => {
    expect(T.failureAttentionShare).toBe(0.02);
    expect(T.failureCriticalShare).toBe(0.1);
    const share = (value: number) => severity({ failures: { ...quiet.failures, share: value } }).failures;
    expect(share(0.02)).toBe("normal");
    expect(share(0.021)).toBe("perhatian");
    expect(share(0.1)).toBe("perhatian");
    expect(share(0.101)).toBe("kritis");
  });

  it("rolling code rule: 5 failures with one code in the last 60 minutes is Kritis at any share", () => {
    expect(T.failureRecentCodeCount).toBe(5);
    expect(T.failureRecentWindowMs).toBe(60 * 60_000);
    const peak = (value: number) => severity({ failures: { ...quiet.failures, recentCodePeak: value } }).failures;
    expect(peak(4)).toBe("normal");
    expect(peak(5)).toBe("kritis");
  });

  it("credential code rule: any AUTH, CREDENTIAL or SCHEMA failure in range is Kritis at any share", () => {
    expect(severity({ failures: { ...quiet.failures, hasCriticalCode: true } }).failures).toBe("kritis");
  });
});
