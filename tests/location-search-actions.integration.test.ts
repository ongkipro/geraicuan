import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "00000000-0000-4000-8000-000000000541";
const OUTLET_ID = "00000000-0000-4000-8000-000000000542";
const SECRET_SENTINEL = "provider-secret-must-not-return";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  LocationSearchConcurrencyError: class LocationSearchConcurrencyError extends Error {},
  LocationSearchRateLimitedError: class LocationSearchRateLimitedError extends Error {},
  MengantarConfigurationError: class MengantarConfigurationError extends Error {},
  MengantarLocationError: class MengantarLocationError extends Error {},
  MengantarLocationQueryError: class MengantarLocationQueryError extends Error {},
}));

const mocks = vi.hoisted(() => ({
  auditScenario: null as null | "contacts-area-error" | "contacts-area-no-result" | "contacts-area-results",
  authorityCalls: 0,
  authorizationDenied: false,
  concurrencyBusy: false,
  contextDenied: false,
  currentAuthorityVersion: new Date("2026-09-02T01:00:00.000Z"),
  fetchCalls: [] as Array<{ apiKey: string; baseUrl: string; query: string }>,
  fetchFailure: "" as "" | "generic" | "provider",
  initialAuthorityVersion: new Date("2026-09-02T01:00:00.000Z"),
  principal: {
    role: "OPERATOR" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000000541",
    userId: "location-operator-a",
  },
  rateAttempts: 0,
  rateLimited: false,
  readyOutletId: "00000000-0000-4000-8000-000000000542",
  source: "private" as "platform_default" | "private",
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(
    mocks.auditScenario ? { "x-geraicuan-ui-audit": mocks.auditScenario } : {},
  )),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("@/db/client", () => ({ db: {}, dbPool: {} }));

vi.mock("@/db/outlet-readiness-repository", () => ({
  listReadyShipmentOutlets: vi.fn(async () => [{ id: mocks.readyOutletId, name: "Outlet audit" }]),
}));

vi.mock("@/db/tenant-context", () => ({
  withTenantContext: vi.fn(async (_db, userId, tenantId, callback) => {
    if (mocks.contextDenied) throw new Error(`tenant denied ${SECRET_SENTINEL}`);
    return callback({}, { role: mocks.principal.role, tenantId, userId });
  }),
}));

vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: errors.CmsAuthorizationDeniedError,
  requireCmsScope: vi.fn(async () => {
    if (mocks.authorizationDenied) throw new errors.CmsAuthorizationDeniedError();
    return mocks.principal;
  }),
}));

vi.mock("@/lib/location-search-rate-limit", () => ({
  LocationSearchConcurrencyError: errors.LocationSearchConcurrencyError,
  LocationSearchRateLimitedError: errors.LocationSearchRateLimitedError,
  enforceLocationSearchRateLimit: vi.fn(async () => {
    mocks.rateAttempts += 1;
    if (mocks.rateLimited) throw new errors.LocationSearchRateLimitedError();
  }),
  withLocationSearchConcurrencyGuard: vi.fn(async (_pool, _context, work) => {
    if (mocks.concurrencyBusy) throw new errors.LocationSearchConcurrencyError();
    return work();
  }),
}));

vi.mock("@/lib/mengantar-credentials", () => ({
  MengantarConfigurationError: errors.MengantarConfigurationError,
  sameMengantarAccountAuthority: (
    first: { connectionUpdatedAt: Date | null; source: string; version: number },
    second: { connectionUpdatedAt: Date | null; source: string; version: number },
  ) => (
    first.source === second.source
    && first.version === second.version
    && (first.connectionUpdatedAt?.getTime() ?? null)
      === (second.connectionUpdatedAt?.getTime() ?? null)
  ),
  resolveMengantarAccountCredentials: vi.fn(async () => {
    const connectionUpdatedAt = mocks.authorityCalls === 0
      ? mocks.initialAuthorityVersion
      : mocks.currentAuthorityVersion;
    mocks.authorityCalls += 1;
    return {
      authority: {
        connectionUpdatedAt: mocks.source === "private" ? connectionUpdatedAt : null,
        version: connectionUpdatedAt.getTime(),
        source: mocks.source,
      },
      credentials: {
        apiKey: `${mocks.source}-${SECRET_SENTINEL}`,
        baseUrl: "https://api-public.mengantar.com",
        pickupAddressId: "unused-pickup",
      },
      originAreaId: "unused-origin",
      pickupAddressId: "unused-pickup",
      source: mocks.source,
    };
  }),
}));

vi.mock("@/lib/mengantar-locations", () => ({
  MengantarLocationError: errors.MengantarLocationError,
  MengantarLocationQueryError: errors.MengantarLocationQueryError,
  normalizeMengantarAreaQuery: vi.fn((query: unknown) => {
    if (typeof query !== "string" || query.trim().length < 3 || query.length > 100) {
      throw new errors.MengantarLocationQueryError();
    }
    return query.trim().replace(/\s+/gu, " ");
  }),
  fetchMengantarDestinationAreas: vi.fn(async (credentials, query) => {
    mocks.fetchCalls.push({ ...credentials, query });
    if (mocks.fetchFailure === "provider") throw new errors.MengantarLocationError();
    if (mocks.fetchFailure === "generic") {
      throw new Error(`unexpected ${SECRET_SENTINEL}`);
    }
    return [{ areaId: "area-safe", areaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135" }];
  }),
}));

import {
  searchMengantarDestinationAreas,
  validateMengantarDestinationAreaSelection,
} from "@/app/app/location-actions";

beforeEach(() => {
  vi.unstubAllEnvs();
  mocks.auditScenario = null;
  mocks.authorityCalls = 0;
  mocks.authorizationDenied = false;
  mocks.concurrencyBusy = false;
  mocks.contextDenied = false;
  mocks.currentAuthorityVersion = new Date("2026-09-02T01:00:00.000Z");
  mocks.fetchCalls.length = 0;
  mocks.fetchFailure = "";
  mocks.initialAuthorityVersion = new Date("2026-09-02T01:00:00.000Z");
  mocks.principal = {
    role: "OPERATOR",
    scope: "tenant",
    tenantId: TENANT_ID,
    userId: "location-operator-a",
  };
  mocks.rateAttempts = 0;
  mocks.rateLimited = false;
  mocks.source = "private";
});

describe("Mengantar destination-area Server Action", () => {
  it("keeps development audit lookup fixtures read-only and provider-free", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.auditScenario = "contacts-area-results";

    const search = await searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung");
    expect(search).toEqual({
      options: [
        { areaId: "audit-area-1", areaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135" },
        { areaId: "audit-area-2", areaLabel: "Sekeloa, Coblong, Kota Bandung, Jawa Barat, 40134" },
      ],
      success: true,
    });
    expect(mocks.authorityCalls).toBe(0);
    expect(mocks.fetchCalls).toHaveLength(0);
    expect(mocks.rateAttempts).toBe(0);

    const validation = await validateMengantarDestinationAreaSelection(
      OUTLET_ID,
      "Dago Bandung",
      "audit-area-1",
      "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
    );
    expect(validation).toMatchObject({ error: "stale_authority", success: false });
    expect(validation).not.toHaveProperty("authority");
    expect(mocks.authorityCalls).toBe(0);
    expect(mocks.fetchCalls).toHaveLength(0);

    mocks.auditScenario = "contacts-area-no-result";
    await expect(searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung"))
      .resolves.toEqual({ options: [], success: true });

    mocks.auditScenario = "contacts-area-error";
    await expect(searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung"))
      .resolves.toMatchObject({ error: "unavailable", options: [], success: false });
    expect(mocks.authorityCalls).toBe(0);
    expect(mocks.fetchCalls).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it.each(["private", "platform_default"] as const)(
    "uses the server-resolved %s account, rechecks authority, and returns only a safe DTO",
    async (source) => {
      mocks.source = source;

      const result = await searchMengantarDestinationAreas(
        OUTLET_ID,
        "  Dago   Bandung ",
      );

      expect(result).toEqual({
        options: [{
          areaId: "area-safe",
          areaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
        }],
        success: true,
      });
      expect(mocks.rateAttempts).toBe(1);
      expect(mocks.authorityCalls).toBe(2);
      expect(mocks.fetchCalls).toEqual([{
        apiKey: `${source}-${SECRET_SENTINEL}`,
        baseUrl: "https://api-public.mengantar.com",
        pickupAddressId: "unused-pickup",
        query: "Dago Bandung",
      }]);
      expect(JSON.stringify(result)).not.toContain(SECRET_SENTINEL);
      expect(JSON.stringify(result)).not.toContain("private");
      expect(JSON.stringify(result)).not.toContain("platform_default");
    },
  );

  it("rejects blank, short, oversized, and malformed outlet input before rate or provider work", async () => {
    for (const [outletId, query] of [
      [OUTLET_ID, ""],
      [OUTLET_ID, "ab"],
      [OUTLET_ID, "x".repeat(101)],
      ["not-an-outlet", "Dago Bandung"],
    ]) {
      const result = await searchMengantarDestinationAreas(outletId, query);
      expect(result.success).toBe(false);
      expect(result.options).toEqual([]);
    }
    expect(mocks.rateAttempts).toBe(0);
    expect(mocks.fetchCalls).toHaveLength(0);
  });

  it("rejects a changed private credential authority after lookup", async () => {
    mocks.currentAuthorityVersion = new Date("2026-09-02T01:01:00.000Z");

    const result = await searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung");

    expect(result).toMatchObject({
      error: "stale_authority",
      options: [],
      success: false,
    });
    expect(mocks.fetchCalls).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(SECRET_SENTINEL);
  });

  it("keeps authority out of search DTOs but returns the exact snapshot for server-side persistence validation", async () => {
    const search = await searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung");
    expect(search).not.toHaveProperty("authority");

    mocks.authorityCalls = 0;
    const validation = await validateMengantarDestinationAreaSelection(
      OUTLET_ID,
      "Dago Bandung",
      "area-safe",
      "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
    );
    expect(validation).toMatchObject({
      authority: {
        source: "private",
        version: mocks.currentAuthorityVersion.getTime(),
      },
      success: true,
    });
  });

  it("maps durable rate and distributed concurrency rejection without calling the provider", async () => {
    mocks.rateLimited = true;
    await expect(searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung"))
      .resolves.toMatchObject({ error: "rate_limited", options: [], success: false });
    expect(mocks.fetchCalls).toHaveLength(0);

    mocks.rateLimited = false;
    mocks.concurrencyBusy = true;
    await expect(searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung"))
      .resolves.toMatchObject({ error: "busy", options: [], success: false });
    expect(mocks.fetchCalls).toHaveLength(0);
  });

  it("denies unauthenticated and cross-tenant attempts before provider I/O", async () => {
    mocks.authorizationDenied = true;
    await expect(searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung"))
      .rejects.toThrow("REDIRECT:/login/tenant");
    expect(mocks.rateAttempts).toBe(0);
    expect(mocks.fetchCalls).toHaveLength(0);

    mocks.authorizationDenied = false;
    mocks.contextDenied = true;
    const result = await searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung");
    expect(result).toMatchObject({ error: "unavailable", options: [], success: false });
    expect(JSON.stringify(result)).not.toContain(SECRET_SENTINEL);
    expect(mocks.fetchCalls).toHaveLength(0);
  });

  it.each(["provider", "generic"] as const)(
    "sanitizes %s provider failures and does not retry",
    async (failure) => {
      mocks.fetchFailure = failure;

      const result = await searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung");

      expect(result).toMatchObject({ error: "unavailable", options: [], success: false });
      expect(JSON.stringify(result)).not.toContain(SECRET_SENTINEL);
      expect(mocks.fetchCalls).toHaveLength(1);
      expect(mocks.authorityCalls).toBe(1);
    },
  );
  it("T-245: times every provider lookup in one allowlisted line without the query text", async () => {
    const logger = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung");
      mocks.rateLimited = true;
      await searchMengantarDestinationAreas(OUTLET_ID, "Dago Bandung");
      mocks.rateLimited = false;
      await validateMengantarDestinationAreaSelection(
        OUTLET_ID,
        "Dago Bandung",
        "area-safe",
        "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
      );
      const lines = logger.mock.calls.map((call) => String(call[0]));
      const events = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(events).toHaveLength(3);
      expect(events[0]).toMatchObject({
        actorId: "location-operator-a",
        event: "location.search.timing",
        operation: "provider_search",
        outcome: "success",
        providerCalls: 1,
        queryLength: "Dago Bandung".length,
        resultCount: 1,
        tenantId: TENANT_ID,
      });
      expect(events[0].totalMs).toEqual(expect.any(Number));
      expect(events[0].providerMs).toEqual(expect.any(Number));
      expect(events[1]).toMatchObject({ outcome: "rate_limited", providerCalls: 0 });
      expect(events[1]).not.toHaveProperty("providerMs");
      expect(events[2]).toMatchObject({ operation: "provider_validate", outcome: "success" });
      for (const line of lines) {
        expect(line).not.toMatch(/Dago|Coblong|Bandung|40135/u);
        expect(line).not.toContain(SECRET_SENTINEL);
      }
    } finally {
      logger.mockRestore();
    }
  });
});
