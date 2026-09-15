import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  principal: vi.fn(), ready: vi.fn(), limit: vi.fn(), validate: vi.fn(),
  resolve: vi.fn(), fetch: vi.fn(), lock: vi.fn(), context: vi.fn(),
  select: vi.fn(), write: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/tenant-context", () => ({
  TenantContextDeniedError: class TenantContextDeniedError extends Error {},
  withTenantContext: fixture.context,
}));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: fixture.principal,
}));
vi.mock("@/db/outlet-readiness-repository", () => ({ requireReadyShipmentOutlet: fixture.ready }));
vi.mock("@/lib/estimate-rate-limit", () => ({
  enforceEstimateRateLimit: fixture.limit,
  EstimateRateLimitedError: class EstimateRateLimitedError extends Error {},
}));
vi.mock("@/app/app/location-actions", () => ({ validateMengantarDestinationAreaSelection: fixture.validate }));
vi.mock("@/lib/mengantar-credentials", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/mengantar-credentials")>(),
  resolveMengantarAccountCredentials: fixture.resolve,
  lockMengantarAccountAuthority: fixture.lock,
}));
vi.mock("@/lib/mengantar-estimate", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/mengantar-estimate")>(),
  fetchMengantarEstimate: fixture.fetch,
}));

import { checkShippingRates } from "@/app/app/cek-tarif/actions";
import { TenantContextDeniedError } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError } from "@/lib/cms-auth";
import { EstimateRateLimitedError } from "@/lib/estimate-rate-limit";
import { MengantarConfigurationError } from "@/lib/mengantar-credentials";
import { MengantarEstimateError, MengantarNoSupportedServicesError } from "@/lib/mengantar-estimate";

const outletId = "00000000-0000-0000-0000-000000000111";
const principal = { scope: "tenant", tenantId: "00000000-0000-0000-0000-000000000101", userId: "rate-user" };
const authority = { source: "private" as const, version: 7, connectionUpdatedAt: new Date("2026-09-01T00:00:00Z") };
const resolved = {
  authority, source: "private", originAreaId: "origin-area", pickupAddressId: "pickup-area",
  credentials: { apiKey: "fixture-secret-never-return", baseUrl: "https://provider.invalid" },
};
const service = {
  providerService: "JNE", shippingAmountIdr: 8000, deliveryEstimate: "2 - 3 days", codEligible: false,
  currency: "IDR", shippingSourceField: "price", insuranceAmountIdr: null, insuranceSourceField: null,
};
function form(changes: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    outletId, areaOutletId: outletId, areaId: "canonical-area", areaLabel: "Dago, Bandung, 40135",
    areaQuery: "Dago", weightGrams: "1000", ...changes,
  })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.principal.mockResolvedValue(principal);
  fixture.ready.mockResolvedValue(outletId);
  fixture.validate.mockResolvedValue({
    success: true, authority, option: { areaId: "canonical-area", areaLabel: "Dago, Bandung, 40135" },
  });
  fixture.resolve.mockResolvedValue(resolved);
  fixture.fetch.mockResolvedValue([service]);
  fixture.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{
    originAreaId: "origin-area", originAreaLabel: "Coblong, Bandung",
  }] }) }) });
  fixture.context.mockImplementation(async (_db, userId, tenantId, work) => work({
    select: fixture.select, insert: fixture.write, update: fixture.write,
    delete: fixture.write, execute: fixture.write,
  }, { userId, tenantId, role: "OPERATOR" }));
});

describe("ephemeral tenant shipping-rate checks", () => {
  it("uses server scope and returns only a quote without business persistence", async () => {
    const result = await checkShippingRates({}, form({ tenantId: "forged", originAreaId: "forged" }));
    expect(result).toEqual({ quote: {
      outletId, originAreaLabel: "Coblong, Bandung", destinationAreaLabel: "Dago, Bandung, 40135",
      weightGrams: 1000, retrievedAt: expect.any(String), services: [{
        providerService: "JNE", shippingAmountIdr: 8000, deliveryEstimate: "2 - 3 days", codEligible: false,
      }],
    } });
    expect(fixture.fetch).toHaveBeenCalledWith(expect.objectContaining({ originAreaId: "origin-area" }), {
      originAreaId: "origin-area", destinationAreaId: "canonical-area", weightGrams: 1000,
    });
    expect(fixture.context.mock.calls.every((call) => call[1] === principal.userId && call[2] === principal.tenantId)).toBe(true);
    expect(fixture.write).not.toHaveBeenCalled();
    expect(fixture.limit).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
    expect(JSON.stringify(result)).not.toContain("provider.invalid");
  });

  it.each(["1", "100000"])("accepts boundary weight %s", async (weightGrams) => {
    expect((await checkShippingRates({}, form({ weightGrams }))).quote?.weightGrams).toBe(Number(weightGrams));
  });
  it.each(["", "0", "-1", "1.5", "1e3", "NaN", "100001", "9999999999", " 1"])("rejects invalid weight %s before provider work", async (weightGrams) => {
    expect((await checkShippingRates({}, form({ weightGrams }))).fieldErrors?.weightGrams).toBeTruthy();
    expect(fixture.validate).not.toHaveBeenCalled();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { outletId: "forged" }, { areaOutletId: "another-outlet" }, { areaId: "" },
    { areaLabel: "invalid\nlabel" }, { areaQuery: "x".repeat(101) },
  ])("rejects invalid form binding %j", async (changes) => {
    expect((await checkShippingRates({}, form(changes))).fieldErrors).toBeTruthy();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("preserves unauthenticated and platform redirects", async () => {
    fixture.principal.mockRejectedValueOnce(new CmsAuthorizationDeniedError("anonymous"));
    await expect(checkShippingRates({}, form())).rejects.toThrow("REDIRECT:/login/tenant");
    fixture.principal.mockResolvedValueOnce({ scope: "platform", userId: "platform-user" });
    await expect(checkShippingRates({}, form())).rejects.toThrow("REDIRECT:/login/tenant");
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("denies a revoked tenant context without exposing a quote", async () => {
    fixture.context.mockRejectedValueOnce(new TenantContextDeniedError());
    expect(await checkShippingRates({}, form())).toEqual({ error: expect.any(String) });
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("rejects an unavailable or foreign outlet before destination lookup", async () => {
    fixture.ready.mockResolvedValue(null);
    expect(await checkShippingRates({}, form())).toEqual({ error: expect.any(String) });
    expect(fixture.validate).not.toHaveBeenCalled();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it.each(["selection_mismatch", "rate_limited", "stale_authority"])("returns destination recovery for %s", async (error) => {
    fixture.validate.mockResolvedValue({ success: false, error, message: "Pilih ulang tujuan." });
    expect(await checkShippingRates({}, form())).toEqual({ fieldErrors: { destinationAreaLabel: "Pilih ulang tujuan." } });
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("rejects area account drift before requesting a rate", async () => {
    fixture.resolve.mockResolvedValue({ ...resolved, authority: { ...authority, version: 8 } });
    expect(await checkShippingRates({}, form())).toEqual({ error: expect.stringContaining("berubah") });
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it.each([
    { authority: { ...authority, version: 8 } }, { originAreaId: "changed-origin" },
    { pickupAddressId: "changed-pickup" }, { authority: { ...authority, source: "platform_default" } },
  ])("rejects in-flight account/origin/pickup drift %j", async (change) => {
    fixture.resolve.mockResolvedValueOnce(resolved).mockResolvedValueOnce({ ...resolved, ...change });
    expect(await checkShippingRates({}, form())).toEqual({ error: expect.stringContaining("berubah") });
    expect(fixture.write).not.toHaveBeenCalled();
  });
  it("rejects outlet readiness revoked during provider work", async () => {
    fixture.ready.mockResolvedValueOnce(outletId).mockResolvedValueOnce(outletId).mockResolvedValueOnce(null);
    expect(await checkShippingRates({}, form())).toEqual({ error: expect.any(String) });
  });
  it("handles configured rate-limit failure without provider work", async () => {
    fixture.limit.mockRejectedValue(new EstimateRateLimitedError());
    expect(await checkShippingRates({}, form())).toEqual({ error: expect.stringContaining("Terlalu banyak") });
    expect(fixture.validate).not.toHaveBeenCalled();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("returns a safe configuration failure", async () => {
    fixture.resolve.mockRejectedValue(new MengantarConfigurationError());
    expect(await checkShippingRates({}, form())).toEqual({ error: expect.stringContaining("belum siap") });
  });
  it("distinguishes recognized unsupported routes from provider failures", async () => {
    fixture.fetch.mockRejectedValueOnce(new MengantarNoSupportedServicesError());
    expect((await checkShippingRates({}, form())).quote?.services).toEqual([]);
    fixture.fetch.mockRejectedValueOnce(new MengantarEstimateError());
    expect(await checkShippingRates({}, form())).toEqual({ error: expect.stringContaining("Mengantar") });
  });
  it("does not mislabel a platform origin with an unrelated outlet location", async () => {
    const platformAuthority = { ...authority, source: "platform_default" };
    fixture.validate.mockResolvedValue({ success: true, authority: platformAuthority,
      option: { areaId: "canonical-area", areaLabel: "Dago, Bandung, 40135" } });
    fixture.resolve.mockResolvedValue({ ...resolved, source: "platform_default", authority: platformAuthority,
      originAreaId: "platform-origin" });
    expect((await checkShippingRates({}, form())).quote?.originAreaLabel).toBe("Asal koneksi platform");
  });
});
