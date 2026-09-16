import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  authenticated: true,
  exportLimit: false,
  role: "TENANT_ADMIN" as "TENANT_ADMIN" | "OPERATOR",
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/cms-auth", () => {
  class CmsAuthorizationDeniedError extends Error {}
  return {
    CmsAuthorizationDeniedError,
    requireCmsScope: vi.fn(async () => {
      if (!fixture.authenticated) throw new CmsAuthorizationDeniedError();
      return {
        role: fixture.role,
        scope: "tenant" as const,
        tenantId: "00000000-0000-4000-8000-000000003101",
        userId: "analytics-export-user",
      };
    }),
  };
});
vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(
    async (
      _db: unknown,
      userId: string,
      tenantId: string,
      work: (tx: unknown, context: unknown) => Promise<unknown>,
    ) => work({}, { role: fixture.role, tenantId, userId }),
  ),
}));
vi.mock("@/db/analytics-repository", () => {
  class AnalyticsFilterDeniedError extends Error {}
  class AnalyticsExportLimitError extends Error {
    constructor(readonly totalCount: number, readonly maxRows: number) {
      super("limit");
    }
  }
  return {
    AnalyticsFilterDeniedError,
    AnalyticsExportLimitError,
    loadAnalyticsFilterOptions: vi.fn(async () => ({
      couriers: ["JNE"],
      outlets: [{ id: "00000000-0000-4000-8000-000000003111", name: "Outlet A" }],
    })),
    loadShipmentExport: vi.fn(async () => {
      if (fixture.exportLimit) throw new AnalyticsExportLimitError(10_001, 10_000);
      return {
        totalCount: 1,
        rows: [{
          shipmentId: "00000000-0000-4000-8000-000000003121",
          publicReference: "GC-10121",
          createdAt: new Date("2026-08-30T01:00:00.000Z"),
          issuedAt: new Date("2026-08-30T02:00:00.000Z"),
          outletName: "=HYPERLINK(\"https://invalid.test\")\nOutlet",
          courier: "JNE",
          providerService: "REG",
          status: "ISSUED" as const,
          cnoteNo: "+FORMULA",
          isCod: true,
          providerCodAmountIdr: 100_000,
        }],
      };
    }),
  };
});

import { loadShipmentExport } from "@/db/analytics-repository";
import { GET } from "@/app/app/analitik/export.csv/route";

describe("tenant analytics CSV export route", () => {
  beforeEach(() => {
    fixture.authenticated = true;
    fixture.exportLimit = false;
    fixture.role = "TENANT_ADMIN";
    vi.mocked(loadShipmentExport).mockClear();
  });

  it("exports the authorized filtered set with safe download headers and cells", async () => {
    const response = await GET(new Request(
      "http://localhost/app/analitik/export.csv?rentang=30-hari&tz=Asia%2FJakarta&outlet=00000000-0000-4000-8000-000000003111&kurir=JNE&status=ISSUED&basis=outcome&halaman=9",
    ));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toContain("'=" + "HYPERLINK");
    expect(body).toContain("'+FORMULA");
    expect(body).not.toContain("\nOutlet");
    expect(body).toContain("shipment_reference");
    expect(body).toContain("GC-10121");
    expect(body).not.toContain("00000000-0000-4000-8000-000000003121");
    expect(loadShipmentExport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: "00000000-0000-4000-8000-000000003101" }),
      expect.anything(),
      expect.objectContaining({
        courier: "JNE",
        lifecycleStatus: "ISSUED",
        outletId: "00000000-0000-4000-8000-000000003111",
      }),
      10_000,
      "outcome",
    );
  });

  it("denies unauthenticated and Operator requests without loading export rows", async () => {
    fixture.authenticated = false;
    expect((await GET(new Request("http://localhost/app/analitik/export.csv"))).status).toBe(401);
    fixture.authenticated = true;
    fixture.role = "OPERATOR";
    expect((await GET(new Request("http://localhost/app/analitik/export.csv"))).status).toBe(403);
    expect(loadShipmentExport).not.toHaveBeenCalled();
  });

  it("fails closed for invalid scope and refuses oversized exports", async () => {
    const invalid = await GET(new Request(
      "http://localhost/app/analitik/export.csv?outlet=00000000-0000-4000-8000-000000009999",
    ));
    expect(invalid.status).toBe(400);
    expect(loadShipmentExport).not.toHaveBeenCalled();

    fixture.exportLimit = true;
    const oversized = await GET(new Request("http://localhost/app/analitik/export.csv?rentang=30-hari&tz=Asia%2FJakarta"));
    expect(oversized.status).toBe(413);
    expect(await oversized.text()).toContain("10001 rows");
  });
});
