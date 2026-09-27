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

  it("normalizes old timezone links to WIB without an active timezone filter", () => {
    const parsed = parsePlatformFilters({ tz: "UTC", rentang: "hari-ini" }, { ...options, now: new Date("2026-12-31T17:00:00Z") });
    expect(parsed.filters.range).toMatchObject({ timezone: "Asia/Jakarta", startDate: "2027-01-01", lastIncludedDate: "2027-01-01" });
    expect(parsed.canonicalQuery.get("tz")).toBe("Asia/Jakarta");
    expect(parsed.issues).toEqual([]);
  });

  it("drops invalid and route-inapplicable input without blanking the result", () => {
    const parsed = parsePlatformFilters({ tz: "Mars/Base", outlet: outletId, status: "unknown", hasil: "DENIED", q: "x", extra: "1" }, options);
    expect(parsed.filters).toMatchObject({ scope: { kind: "global" }, outletId: null, status: null, outcome: null, query: null, page: 1 });
    expect(parsed.issues).toEqual(expect.arrayContaining(["tz_tidak_dikenal", "outlet_tanpa_tenant", "status_tidak_dikenal", "parameter_tidak_berlaku", "kata_kunci_terlalu_pendek", "parameter_tidak_dikenal"]));
  });

  it("T-257: reads aksi only on /platform/audit and status-gerai only on /platform/tenant, canonically", () => {
    const audit = parsePlatformFilters({ aksi: "tenant_suspended" }, { ...options, route: "/platform/audit" });
    expect(audit.filters.action).toBe("TENANT_SUSPENDED");
    expect(audit.issues).toEqual([]);
    expect(audit.canonicalQuery.get("aksi")).toBe("TENANT_SUSPENDED");
    expect(parsePlatformFilters(Object.fromEntries(audit.canonicalQuery), { ...options, route: "/platform/audit" }).canonicalQuery.toString()).toBe(audit.canonicalQuery.toString());
    expect(parsePlatformFilters({ aksi: "DROP_TABLE" }, { ...options, route: "/platform/audit" })).toMatchObject({ filters: { action: null }, issues: ["aksi_tidak_dikenal"] });
    expect(parsePlatformFilters({ aksi: "TENANT_SUSPENDED" }, options)).toMatchObject({ filters: { action: null }, issues: ["parameter_tidak_berlaku"] });

    const tenants = parsePlatformFilters({ "status-gerai": "suspended" }, options);
    expect(tenants.filters.tenantStatus).toBe("SUSPENDED");
    expect(tenants.canonicalQuery.get("status-gerai")).toBe("SUSPENDED");
    expect(parsePlatformFilters({ "status-gerai": "gone" }, options)).toMatchObject({ filters: { tenantStatus: null }, issues: ["status_gerai_tidak_dikenal"] });
    expect(parsePlatformFilters({ "status-gerai": "ACTIVE" }, { ...options, route: "/platform/audit" })).toMatchObject({ filters: { tenantStatus: null }, issues: ["parameter_tidak_berlaku"] });
  });
});
