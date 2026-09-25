import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-204: the read-only Mengantar pull moved from Keuangan to Histori kiriman /
 * Retur (`src/app/app/pengiriman/status-sync-actions.ts`). These checks pin
 * what must not change in the move: Tenant Admin only, input validated before
 * any tenant data access, the 62-day cap, the claimed slot before provider
 * I/O, the outlet's own account re-checked before writing, and the same
 * evidence write.
 */

const TENANT_ID = "00000000-0000-4000-8000-000000020401";
const OUTLET_ID = "00000000-0000-4000-8000-000000020411";
const ATTEMPT_ID = "00000000-0000-4000-8000-000000020431";
const NEXT_ATTEMPT_ID = "00000000-0000-4000-8000-000000020432";

const errors = vi.hoisted(() => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  MengantarConfigurationError: class MengantarConfigurationError extends Error {},
  MengantarSettlementError: class MengantarSettlementError extends Error {},
  ProviderSettlementDeniedError: class ProviderSettlementDeniedError extends Error {},
  ProviderSettlementThrottledError: class ProviderSettlementThrottledError extends Error {},
  TenantContextDeniedError: class TenantContextDeniedError extends Error {},
}));

const mocks = vi.hoisted(() => ({
  authorityChanged: false,
  calls: [] as string[],
  contextCalls: 0,
  fetchPeriods: [] as Array<{ end: Date; start: Date }>,
  principal: {
    role: "TENANT_ADMIN" as "OPERATOR" | "TENANT_ADMIN",
    scope: "tenant" as "platform" | "tenant",
    tenantId: "00000000-0000-4000-8000-000000020401",
    userId: "status-pull-admin",
  },
  recorded: [] as Array<Record<string, unknown>>,
  resolveCount: 0,
  revalidated: [] as string[],
  throttled: false,
  transitions: 2,
}));

vi.mock("node:crypto", () => ({ randomUUID: vi.fn(() => NEXT_ATTEMPT_ID) }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((href: string) => mocks.revalidated.push(href)),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/tenant-context", () => ({
  TenantContextDeniedError: errors.TenantContextDeniedError,
  withTenantContext: vi.fn(async (_db, userId, tenantId, callback) => {
    mocks.contextCalls += 1;
    return callback({}, { role: mocks.principal.role, tenantId, userId });
  }),
}));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: errors.CmsAuthorizationDeniedError,
  requireCmsScope: vi.fn(async () => mocks.principal),
}));
vi.mock("@/db/provider-settlement-repository", () => ({
  ProviderSettlementDeniedError: errors.ProviderSettlementDeniedError,
  ProviderSettlementThrottledError: errors.ProviderSettlementThrottledError,
  claimProviderSettlementPull: vi.fn(async (_tx, _context, outletId: string) => {
    mocks.calls.push(`claim:${outletId}`);
    if (mocks.throttled) throw new errors.ProviderSettlementThrottledError();
  }),
  providerSettlementAccountKey: vi.fn((tenantId: string, outletId: string, source: string) => `${tenantId}:${outletId}:${source}`),
  recordProviderSettlementPull: vi.fn(async (_tx, _context, input: Record<string, unknown>) => {
    mocks.calls.push("record");
    mocks.recorded.push(input);
    return {
      appliedTransitionCount: mocks.transitions,
      invoiceCount: 3,
      matchedItemCount: 1,
      matchedStatusCount: 4,
      orderCount: 9,
      refusedTransitionCount: 1,
      unrecognisedStatuses: ["status_baru"],
    };
  }),
}));
vi.mock("@/lib/mengantar-credentials", () => ({
  MengantarConfigurationError: errors.MengantarConfigurationError,
  lockMengantarAccountAuthority: vi.fn(async () => {
    mocks.calls.push("lock");
  }),
  resolveMengantarAccountCredentials: vi.fn(async () => {
    mocks.resolveCount += 1;
    const authority = mocks.authorityChanged && mocks.resolveCount > 1 ? "authority-b" : "authority-a";
    return { authority, credentials: { apiKey: "not-a-real-key" }, source: "TENANT" };
  }),
  sameMengantarAccountAuthority: vi.fn((left: string, right: string) => left === right),
}));
vi.mock("@/lib/mengantar-settlement", () => ({
  MengantarSettlementError: errors.MengantarSettlementError,
  MengantarSettlementTooLargeError: class MengantarSettlementTooLargeError extends errors.MengantarSettlementError {},
  fetchMengantarSettlement: vi.fn(async (_credentials, period: { end: Date; start: Date }) => {
    mocks.calls.push("fetch");
    mocks.fetchPeriods.push(period);
    return { snapshot: true };
  }),
}));

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const fields = {
    attemptId: ATTEMPT_ID,
    dari: "2026-09-01",
    khusus: "1",
    outletId: OUTLET_ID,
    rentang: "kustom",
    sampai: "2026-09-07",
    tz: "Asia/Jakarta",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  mocks.authorityChanged = false;
  mocks.calls.length = 0;
  mocks.contextCalls = 0;
  mocks.fetchPeriods.length = 0;
  mocks.principal = { role: "TENANT_ADMIN", scope: "tenant", tenantId: TENANT_ID, userId: "status-pull-admin" };
  mocks.recorded.length = 0;
  mocks.resolveCount = 0;
  mocks.revalidated.length = 0;
  mocks.throttled = false;
  mocks.transitions = 2;
});

describe("Perbarui status dari Mengantar (T-204)", () => {
  it("redirects an Operator before tenant data access", async () => {
    const { pullMengantarStatus } = await import("@/app/app/pengiriman/status-sync-actions");
    mocks.principal = { ...mocks.principal, role: "OPERATOR" };
    await expect(pullMengantarStatus({}, form())).rejects.toThrow("REDIRECT:/app");
    expect(mocks.contextCalls).toBe(0);
  });

  it("rejects a malformed attempt or outlet, and a period over 62 days, before claiming a slot", async () => {
    const { pullMengantarStatus } = await import("@/app/app/pengiriman/status-sync-actions");
    expect(await pullMengantarStatus({}, form({ outletId: "not-a-uuid" }))).toMatchObject({ status: "error" });
    expect(await pullMengantarStatus({}, form({ attemptId: "x" }))).toMatchObject({ status: "error" });
    const tooLong = await pullMengantarStatus({}, form({ dari: "2026-06-01", sampai: "2026-09-01" }));
    expect(tooLong).toMatchObject({ status: "error", nextAttemptId: ATTEMPT_ID });
    expect(tooLong.message).toContain("maksimal 62 hari");
    expect(mocks.contextCalls).toBe(0);
  });

  it("claims the slot before provider I/O, records the evidence and refreshes the hosting pages", async () => {
    const { pullMengantarStatus } = await import("@/app/app/pengiriman/status-sync-actions");
    const result = await pullMengantarStatus({}, form());

    expect(mocks.calls).toEqual([`claim:${OUTLET_ID}`, "lock", "fetch", "lock", "record"]);
    expect(mocks.fetchPeriods[0]).toEqual({
      end: new Date("2026-09-07T17:00:00.000Z"),
      start: new Date("2026-08-31T17:00:00.000Z"),
    });
    expect(mocks.recorded[0]).toMatchObject({
      credentialSource: "TENANT",
      outletId: OUTLET_ID,
      providerAccountKey: `${TENANT_ID}:${OUTLET_ID}:TENANT`,
      snapshot: { snapshot: true },
    });
    expect(result).toMatchObject({ acceptedAttemptId: ATTEMPT_ID, nextAttemptId: NEXT_ATTEMPT_ID, status: "success" });
    expect(result.message).toContain("2 kiriman berpindah status");
    expect(result.message).toContain("1 laporan Mengantar bertentangan");
    expect(result.message).toContain("status_baru");
    expect(mocks.revalidated).toEqual(expect.arrayContaining(["/app/pengiriman", "/app/pengiriman/rts", "/app"]));
    expect(mocks.revalidated).not.toContain("/app/keuangan");
  });

  it("refreshes only the hosting pages when nothing moved", async () => {
    const { pullMengantarStatus } = await import("@/app/app/pengiriman/status-sync-actions");
    mocks.transitions = 0;
    await pullMengantarStatus({}, form());
    expect(mocks.revalidated).toEqual(["/app/pengiriman", "/app/pengiriman/rts"]);
  });

  it("keeps the one-minute throttle and refuses a changed account authority without writing", async () => {
    const { pullMengantarStatus } = await import("@/app/app/pengiriman/status-sync-actions");
    mocks.throttled = true;
    const throttled = await pullMengantarStatus({}, form());
    expect(throttled.message).toContain("Tunggu satu menit");
    expect(mocks.calls).not.toContain("fetch");

    mocks.throttled = false;
    mocks.calls.length = 0;
    mocks.authorityChanged = true;
    const changed = await pullMengantarStatus({}, form());
    expect(changed).toMatchObject({ status: "error", nextAttemptId: ATTEMPT_ID });
    expect(changed.message).toContain("Koneksi Mengantar outlet");
    expect(mocks.calls).not.toContain("record");
  });
});
