import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T-284: statuses follow Mengantar without a click — a read-only pull after a Tenant Admin's
 * Dasbor or Histori response, for the stalest ready outlet, at most once per 15 minutes per
 * outlet. Real database (claim, evidence row, RLS); the provider client is stubbed.
 */
const fetchCalls = vi.hoisted(() => ({ periods: [] as Array<{ start: Date; end: Date }>, fail: false }));
vi.mock("@/lib/mengantar-settlement", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/mengantar-settlement")>();
  return {
    ...original,
    fetchMengantarSettlement: vi.fn(async (_credentials: unknown, period: { start: Date; end: Date }) => {
      fetchCalls.periods.push(period);
      if (fetchCalls.fail) throw new original.MengantarSettlementError();
      return { invoiceCount: 0, items: [], orderCount: 0, orderStatuses: [], refunds: [] };
    }),
  };
});
const OUTLET_A = "00000000-0000-4000-8000-000000028411";
const OUTLET_B = "00000000-0000-4000-8000-000000028412";
vi.mock("@/db/outlet-readiness-repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listReadyShipmentOutlets: vi.fn(async () => [{ id: OUTLET_A, name: "A" }, { id: OUTLET_B, name: "B" }]),
}));

const { autoPullMengantarStatus, scheduleAutoStatusPull, stalestOutlet, AUTO_STATUS_PULL_AFTER_MS, AUTO_STATUS_PULL_DAYS } = await import("@/lib/mengantar-status-pull");
const { ensureIntegrationRuntimeRole } = await import("./integration-runtime-role");

const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
const TENANT = "00000000-0000-4000-8000-000000028401";
const ADMIN = "auto-pull-admin";
const OPERATOR = "auto-pull-operator";
const admin = { role: "TENANT_ADMIN", tenantId: TENANT, userId: ADMIN };

async function pulls() {
  return (await adminPool.query<{ outlet_id: string }>("SELECT outlet_id FROM provider_settlement_pulls WHERE tenant_id = $1 ORDER BY created_at", [TENANT])).rows.map((row) => row.outlet_id);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, process.env.APP_DATABASE_URL!);
});
beforeEach(async () => {
  fetchCalls.periods.length = 0;
  fetchCalls.fail = false;
  vi.stubEnv("MENGANTAR_API_KEY", "SYNTHETIC-AUTO-PULL-KEY");
  vi.stubEnv("MENGANTAR_BASE_URL", "https://api.mengantar.test/");
  vi.stubEnv("MENGANTAR_PICKUP_ADDRESS_ID", "pickup-auto");
  vi.stubEnv("MENGANTAR_ORIGIN_AREA_ID", "origin-auto");
  await adminPool.query("DELETE FROM provider_settlement_pulls WHERE tenant_id = $1", [TENANT]);
  await adminPool.query("DELETE FROM shipment_rate_limits WHERE tenant_id = $1", [TENANT]);
  await adminPool.query("DELETE FROM memberships WHERE tenant_id = $1", [TENANT]);
  await adminPool.query("DELETE FROM outlets WHERE tenant_id = $1", [TENANT]);
  await adminPool.query("DELETE FROM tenants WHERE id = $1", [TENANT]);
  await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, 'Owner', 'auto-pull-owner@example.test'), ($2, 'Op', 'auto-pull-op@example.test') ON CONFLICT (id) DO NOTHING", [ADMIN, OPERATOR]);
  await adminPool.query("INSERT INTO tenants (id, name, status, mengantar_credential_policy) VALUES ($1, 'Auto Pull', 'ACTIVE', 'PLATFORM_DEFAULT_ALLOWED')", [TENANT]);
  await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR')", [TENANT, ADMIN, OPERATOR]);
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES ($1, $3, 'A', 'pickup-auto', 'origin-auto'), ($2, $3, 'B', 'pickup-auto', 'origin-auto')",
    [OUTLET_A, OUTLET_B, TENANT],
  );
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await adminPool.end();
});

describe("stalestOutlet (T-284)", () => {
  const now = new Date("2026-10-07T03:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it("prefers a never-pulled outlet, then the oldest pull, and waits while every outlet is fresh", () => {
    expect(stalestOutlet(["a", "b"], new Map([["a", ago(60 * 60_000)]]), now)).toBe("b");
    expect(stalestOutlet(["a", "b"], new Map([["a", ago(60 * 60_000)], ["b", ago(20 * 60_000)]]), now)).toBe("a");
    expect(stalestOutlet(["a"], new Map([["a", ago(AUTO_STATUS_PULL_AFTER_MS - 1)]]), now)).toBeNull();
    expect(stalestOutlet(["a"], new Map([["a", ago(AUTO_STATUS_PULL_AFTER_MS)]]), now)).toBe("a");
    expect(stalestOutlet([], new Map(), now)).toBeNull();
  });
});

describe("autoPullMengantarStatus (T-284)", () => {
  it("never runs for an Operator", async () => {
    expect(await autoPullMengantarStatus({ role: "OPERATOR", tenantId: TENANT, userId: OPERATOR })).toBeNull();
    expect(fetchCalls.periods).toHaveLength(0);
    expect(await pulls()).toEqual([]);
  });

  it("pulls one stale outlet over the last 14 days, records the evidence, then waits while it is fresh", async () => {
    const now = new Date();
    const result = await autoPullMengantarStatus(admin, now);
    expect(result).not.toBeNull();
    expect(fetchCalls.periods).toHaveLength(1);
    expect(fetchCalls.periods[0]!.end).toEqual(now);
    expect(now.getTime() - fetchCalls.periods[0]!.start.getTime()).toBe(AUTO_STATUS_PULL_DAYS * 86_400_000);
    const first = await pulls();
    expect(first).toHaveLength(1);

    // The other outlet is still stale, but the member's one-pull-a-minute claim refuses it; nothing breaks.
    expect(await autoPullMengantarStatus(admin, new Date())).toBeNull();
    expect(await pulls()).toEqual(first);

    // With the minute passed, the other (never-pulled) outlet goes next; then both are fresh.
    await adminPool.query("DELETE FROM shipment_rate_limits WHERE tenant_id = $1", [TENANT]);
    await autoPullMengantarStatus(admin, new Date());
    expect((await pulls()).sort()).toEqual([OUTLET_A, OUTLET_B].sort());
    await adminPool.query("DELETE FROM shipment_rate_limits WHERE tenant_id = $1", [TENANT]);
    expect(await autoPullMengantarStatus(admin, new Date())).toBeNull();
    expect(fetchCalls.periods).toHaveLength(2);
  });

  it("swallows a provider failure into a name-only log line", async () => {
    fetchCalls.fail = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await autoPullMengantarStatus(admin, new Date())).toBeNull();
    const line = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(line).toContain('"reason":"MengantarSettlementError"');
    expect(line).not.toMatch(/SYNTHETIC|api\.mengantar|https?:/);
    warn.mockRestore();
  });

  it("schedules nothing outside a request, for an Operator or for a gerai awaiting approval", () => {
    expect(scheduleAutoStatusPull({ ...admin, tenantStatus: "ACTIVE" })).toBe(false); // no request scope in tests
    expect(scheduleAutoStatusPull({ ...admin, role: "OPERATOR" })).toBe(false);
    expect(scheduleAutoStatusPull({ ...admin, tenantStatus: "PROVISIONING" })).toBe(false);
  });
});
