import { describe, expect, it } from "vitest";

import {
  parseTenantAnalyticsQuery,
  serializeTenantAnalyticsQuery,
} from "@/lib/analytics-filters";

const outletId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-31T04:00:00.000Z");

describe("tenant analytics URL filters", () => {
  it("normalizes known filters into a stable canonical query", () => {
    const parsed = parseTenantAnalyticsQuery(
      {
        rentang: "7-hari",
        tz: "Asia/Jakarta",
        outlet: outletId,
        kurir: "jne",
        status: "issued",
        basis: "outcome",
        halaman: "2",
      },
      {
        now,
        knownOutletIds: [outletId],
        knownCouriers: ["JNE"],
      },
    );

    expect(parsed.issues).toEqual([]);
    expect(parsed.query).toMatchObject({
      filters: {
        outletId,
        courier: "JNE",
        lifecycleStatus: "ISSUED",
      },
      eventBasis: "outcome",
      page: 2,
    });
    expect(parsed.canonicalQuery.toString()).toBe(
      `rentang=7-hari&tz=Asia%2FJakarta&outlet=${outletId}&kurir=JNE&status=ISSUED&basis=outcome&halaman=2`,
    );
    expect(
      serializeTenantAnalyticsQuery(parsed.query).toString(),
    ).toBe(parsed.canonicalQuery.toString());
  });

  it("drops unowned or unknown dimensions without preserving unsafe URL state", () => {
    const parsed = parseTenantAnalyticsQuery(
      {
        outlet: "00000000-0000-4000-8000-000000000099",
        kurir: "unknown",
        status: "not-a-status",
        basis: "not-a-basis",
      },
      { now, knownOutletIds: [outletId], knownCouriers: ["JNE"] },
    );

    expect(parsed.query.filters).toEqual({
      outletId: null,
      courier: null,
      lifecycleStatus: null,
    });
    expect(parsed.filterRejected).toBe(true);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        "outlet_tidak_dikenal",
        "kurir_tidak_dikenal",
        "status_tidak_dikenal",
        "basis_tidak_dikenal",
      ]),
    );
    expect(parsed.canonicalQuery.toString()).not.toContain("outlet=");
  });

  it("preserves the current-exception supporting basis", () => {
    const parsed = parseTenantAnalyticsQuery(
      { basis: "exceptions", outlet: outletId },
      { now, knownOutletIds: [outletId], knownCouriers: ["JNE"] },
    );

    expect(parsed.filterRejected).toBe(false);
    expect(parsed.query.eventBasis).toBe("exceptions");
    expect(parsed.canonicalQuery.toString()).toContain("basis=exceptions");
  });
});
