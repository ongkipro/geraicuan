import { describe, expect, it } from "vitest";

import { parsePlatformFilters } from "@/lib/platform-monitoring-filters";

const now = new Date("2026-08-30T12:00:00.000Z");
const tenantId = "10000000-0000-4000-8000-000000000001";
const outletId = "20000000-0000-4000-8000-000000000001";
const options = {
  route: "/platform/tenant" as const,
  now,
  knownTenantIds: [tenantId],
  knownOutletIds: [outletId],
  knownCouriers: ["JNE"],
};

describe("platform monitoring URL contract", () => {
  it("canonicalizes scoped filters and remains stable", () => {
    const parsed = parsePlatformFilters({ tenant: tenantId, outlet: outletId, kurir: "jne", status: "issued", halaman: "2" }, options);
    expect(parsed.filters).toMatchObject({ scope: { kind: "tenant", tenantId }, outletId, courier: "JNE", status: "ISSUED", page: 2 });
    expect(parsed.issues).toEqual([]);
    const stable = parsePlatformFilters(Object.fromEntries(parsed.canonicalQuery), options);
    expect(stable.canonicalQuery.toString()).toBe(parsed.canonicalQuery.toString());
  });

  it("drops invalid and route-inapplicable input without blanking the result", () => {
    const parsed = parsePlatformFilters({ tz: "Mars/Base", outlet: outletId, status: "unknown", hasil: "DENIED", q: "x", extra: "1" }, options);
    expect(parsed.filters).toMatchObject({ scope: { kind: "global" }, outletId: null, status: null, outcome: null, query: null, page: 1 });
    expect(parsed.issues).toEqual(expect.arrayContaining(["tz_tidak_dikenal", "outlet_tanpa_tenant", "status_tidak_dikenal", "parameter_tidak_berlaku", "kata_kunci_terlalu_pendek", "parameter_tidak_dikenal"]));
  });
});
