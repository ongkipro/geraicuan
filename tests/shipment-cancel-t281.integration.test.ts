// T-281 (D-42) "Batalkan kiriman": the Server Action, the live `DELETE /order` transport, the
// shipment write with its audit row (migration 0074) and the detail rail, for real against the
// isolated test database (runtime role, RLS on). Only the session lookup and `fetch` are
// replaced: nothing leaves the process, and no Mengantar order is created or deleted.
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveProviderAccountKey } from "@/db/order-batch-repository";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const session = vi.hoisted(() => ({
  principal: { role: "TENANT_ADMIN" as "TENANT_ADMIN" | "OPERATOR", scope: "tenant" as const, tenantId: "", userId: "" },
}));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: async () => session.principal,
}));
vi.mock("@/db/client", async () => {
  const { drizzle: connect } = await import("drizzle-orm/node-postgres");
  const { Pool: PgPool } = await import("pg");
  const dbSchema = await import("@/db/schema");
  const dbPool = new PgPool({ allowExitOnIdle: true, connectionString: process.env.APP_DATABASE_URL });
  return { db: connect({ client: dbPool, schema: dbSchema }), dbPool };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
  usePathname: () => "/app/pengiriman/10000",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { cancelShipmentOnMengantar } = await import("@/app/app/pengiriman/[shipmentId]/cancel-actions");
const { default: ShipmentDetailPage } = await import("@/app/app/pengiriman/[shipmentId]/page");
const { readMengantarDeleteOrderAnswer } = await import("@/lib/mengantar-live-transport");
const { dbPool } = await import("@/db/client");

const adminPool = new Pool({ connectionString: adminDatabaseUrl });

const KEY = "SYNTHETIC-T281-KEY";
const tenants = {
  a: { admin: "t281-admin-a", id: "00000000-0000-0281-0000-0000000000a1", operator: "t281-operator-a", outlet: "00000000-0000-0281-0001-0000000000a1" },
  b: { admin: "t281-admin-b", id: "00000000-0000-0281-0000-0000000000b1", operator: "t281-operator-b", outlet: "00000000-0000-0281-0001-0000000000b1" },
};
type TenantKey = keyof typeof tenants;
let sequence = 0;

type Call = { body: unknown; method: string; path: string };
const calls: Call[] = [];
let answers: Array<() => Response | Promise<Response>> = [];
const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status });
const lost = () => () => { throw new TypeError("socket hang up"); };

type SeedOptions = {
  status?: "ISSUED" | "AWAITING_UPSTREAM_PAYMENT" | "IN_TRANSIT";
  courier?: string;
  providerOrderId?: string | null;
  acceptedSecondsAgo?: number;
  providerStatus?: string;
  recoveryStatus?: "PAYMENT_QUEUED" | "PAYING" | "PAYMENT_UNKNOWN";
};

async function seedShipment(key: TenantKey, options: SeedOptions = {}) {
  const tenant = tenants[key];
  const status = options.status ?? "ISSUED";
  sequence += 1;
  const suffix = `${key}${sequence.toString(16).padStart(11, "0")}`;
  const ids = {
    batchId: `00000000-0000-0281-0013-${suffix}`,
    estimateServiceId: `00000000-0000-0281-0012-${suffix}`,
    estimateSnapshotId: `00000000-0000-0281-0011-${suffix}`,
    snapshotId: `00000000-0000-0281-0014-${suffix}`,
    shipmentId: `00000000-0000-0281-0010-${suffix}`,
  };
  const providerOrderId = options.providerOrderId === undefined ? `0000000000000000281${String(sequence).padStart(5, "0")}` : options.providerOrderId;
  const awb = `JNE281${key.toUpperCase()}${String(sequence).padStart(5, "0")}`;
  const issued = status !== "AWAITING_UPSTREAM_PAYMENT";
  const { rows } = await adminPool.query<{ tenant_number: string }>(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, $4) RETURNING tenant_number",
    [ids.shipmentId, tenant.id, tenant.outlet, status],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label, package_content,
      package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only, pickup_address_id, origin_area_id,
      handover_type
    ) VALUES ($1, $2, 'fixture-destination', 'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310',
      'Kain', 1000, 1, 100000, false, false, 'pickup-a', 'origin-a', 'DROP_OFF')`,
    [ids.shipmentId, tenant.id],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'RECIPIENT', 'Penerima Sintetis', '081299990281', 'Jl. Sintetis 1', 'fixture-destination',
       'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310')`,
    [tenant.id, ids.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label,
      weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin-a', 'fixture-destination', 'Menteng, Jakarta Pusat', 1000, false, 'platform_default')`,
    [ids.estimateSnapshotId, tenant.id, ids.shipmentId, tenant.outlet],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, $4, 'IDR', 8000, 'price', '1-2 hari', true)`,
    [ids.estimateServiceId, tenant.id, ids.estimateSnapshotId, options.courier ?? "JNE"],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source, provider_account_key,
      idempotency_key, status, submission_attempted_at, completed_at
    ) VALUES ($1, $2, $3, 'pickup-a', $4, 'platform_default', $5, $6, 'COMPLETED', now(), now())`,
    [ids.batchId, tenant.id, tenant.outlet, options.courier ?? "JNE", deriveProviderAccountKey("platform_default"), `281${key}${sequence}`.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service,
      destination_area_id, destination_area_label, currency, shipping_amount_idr, provider_charged_shipping_idr,
      insurance_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id, is_paid, cnote_no,
      safe_response_code, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'fixture-destination', 'Menteng, Jakarta Pusat', 'IDR',
      8000, 7000, 0, false, NULL, $8, $9, $10, $11, 'FIXTURE_ACCEPTED', now() - make_interval(secs => $12))`,
    [
      ids.snapshotId, tenant.id, ids.batchId, ids.shipmentId, ids.estimateSnapshotId, ids.estimateServiceId, options.courier ?? "JNE",
      issued ? "ISSUED" : "AWAITING_UPSTREAM_PAYMENT", providerOrderId, issued, issued ? awb : null, options.acceptedSecondsAgo ?? 3600,
    ],
  );
  if (options.providerStatus) {
    await adminPool.query(
      `INSERT INTO provider_order_status_observations (tenant_id, shipment_id, outlet_id, cnote_no, provider_status, source, provider_event_at)
       VALUES ($1, $2, $3, $4, $5, 'WEBHOOK', now())`,
      [tenant.id, ids.shipmentId, tenant.outlet, awb, options.providerStatus],
    );
  }
  if (options.recoveryStatus) {
    const paying = options.recoveryStatus !== "PAYMENT_QUEUED";
    await adminPool.query(
      `INSERT INTO provider_unpaid_recoveries (tenant_id, batch_id, provider_order_snapshot_id, requested_by_user_id, status, attempted_at, completed_at, safe_response_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenant.id, ids.batchId, ids.snapshotId, tenant.admin, options.recoveryStatus, paying ? new Date() : null,
        options.recoveryStatus === "PAYMENT_UNKNOWN" ? new Date() : null,
        options.recoveryStatus === "PAYMENT_UNKNOWN" ? "PAY_UNPAID_OUTCOME_UNKNOWN" : null],
    );
  }
  return { ...ids, number: rows[0].tenant_number, providerOrderId };
}

function form(shipmentId: string, confirmed = true) {
  const data = new FormData();
  data.set("shipmentId", shipmentId);
  if (confirmed) data.set("confirmation", "confirmed");
  return data;
}

function as(key: TenantKey, role: "TENANT_ADMIN" | "OPERATOR" = "TENANT_ADMIN") {
  const tenant = tenants[key];
  session.principal = { role, scope: "tenant", tenantId: tenant.id, userId: role === "TENANT_ADMIN" ? tenant.admin : tenant.operator };
}

async function shipmentStatus(shipmentId: string) {
  return (await adminPool.query<{ status: string }>("SELECT status FROM shipments WHERE id = $1", [shipmentId])).rows[0]?.status;
}

async function cancelAudit(tenantId: string = tenants.a.id) {
  return (await adminPool.query(
    "SELECT actor_id, actor_role, tenant_id, target_type, target_id, outcome, metadata FROM audit_events WHERE action = 'SHIPMENT_CANCELLED' AND tenant_id = $1",
    [tenantId],
  )).rows;
}

const cancel = (shipmentId: string, confirmed = true) => cancelShipmentOnMengantar({}, form(shipmentId, confirmed));
const deleted = (id: string) => json(200, { success: true, message: "1 orders are deleted from 1 selected orders", deletedCount: 1, deletedOrderIds: [id], deletedOrderIdsHumanReadable: ["22092742ED56"] });

async function clean() {
  for (const tenant of Object.values(tenants)) {
    await adminPool.query("DELETE FROM audit_events WHERE tenant_id = $1", [tenant.id]);
    for (const table of [
      "provider_order_status_observations", "provider_unpaid_recoveries", "provider_order_snapshots", "provider_batches",
      "shipment_estimate_services", "shipment_estimate_snapshots", "shipment_parties", "shipment_drafts", "shipments",
      "shipment_rate_limits", "outlets", "memberships", "tenant_shipment_counters",
    ]) {
      await adminPool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenant.id]);
    }
    await adminPool.query("DELETE FROM tenants WHERE id = $1", [tenant.id]);
  }
  for (const tenant of Object.values(tenants)) {
    await adminPool.query("DELETE FROM users WHERE id = ANY($1)", [[tenant.admin, tenant.operator]]);
  }
}

const consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  calls.length = 0;
  answers = [];
  vi.stubEnv("MENGANTAR_LIVE_ORDERS_ENABLED", "1");
  vi.stubEnv("MENGANTAR_API_KEY", KEY);
  vi.stubEnv("MENGANTAR_BASE_URL", "https://api.mengantar.test/");
  vi.stubEnv("MENGANTAR_PICKUP_ADDRESS_ID", "pickup-a");
  vi.stubEnv("MENGANTAR_ORIGIN_AREA_ID", "origin-a");
  vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      method: init.method ?? "GET",
      path: url.pathname.replace(`/api/public/${KEY}`, ""),
    });
    const next = answers.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  });
  for (const method of ["log", "info", "warn", "error", "debug"] as const) consoleSpies.push(vi.spyOn(console, method));
  await clean();
  for (const tenant of Object.values(tenants)) {
    await adminPool.query(
      "INSERT INTO users (id, name, email) VALUES ($1, 'T281 Admin', $3), ($2, 'T281 Operator', $4)",
      [tenant.admin, tenant.operator, `${tenant.admin}@example.test`, `${tenant.operator}@example.test`],
    );
    await adminPool.query(
      "INSERT INTO tenants (id, name, status, mengantar_credential_policy) VALUES ($1, 'T281 Tenant', 'ACTIVE', 'PLATFORM_DEFAULT_ALLOWED')",
      [tenant.id],
    );
    await adminPool.query(
      "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR')",
      [tenant.id, tenant.admin, tenant.operator],
    );
    await adminPool.query(
      "INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES ($1, $2, 'T281 Outlet', 'pickup-a', 'origin-a')",
      [tenant.outlet, tenant.id],
    );
  }
  as("a");
}, 30_000);

afterEach(() => {
  // No credential and no recipient data in anything the code logged.
  const logged = JSON.stringify(consoleSpies.flatMap((spy) => spy.mock.calls));
  for (const secret of [KEY, "081299990281", "Penerima Sintetis"]) expect(logged).not.toContain(secret);
  for (const spy of consoleSpies.splice(0)) spy.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await clean();
  await Promise.all([adminPool.end(), dbPool.end()]);
});

describe("T-281 cancelShipmentOnMengantar: gates before any call", () => {
  it("refuses an Operator, a missing confirmation and the live switch off, without a request", async () => {
    const shipment = await seedShipment("a");
    as("a", "OPERATOR");
    expect(await cancel(shipment.shipmentId)).toEqual({ error: "Pembatalan kiriman hanya tersedia untuk pemilik gerai." });
    as("a");
    expect(await cancel(shipment.shipmentId, false)).toEqual({ error: "Centang konfirmasi bahwa pembatalan tidak dapat diurungkan." });
    vi.stubEnv("MENGANTAR_LIVE_ORDERS_ENABLED", "0");
    expect(await cancel(shipment.shipmentId)).toEqual({
      error: "Pembatalan di Mengantar belum diaktifkan di GeraiCUAN. Hubungi admin GeraiCUAN.",
    });
    expect(calls).toEqual([]);
    expect(await shipmentStatus(shipment.shipmentId)).toBe("ISSUED");
    expect(await cancelAudit()).toEqual([]);
  });

  it("checks the live switch before any rule, and the library refuses on its own when it is off", async () => {
    const moving = await seedShipment("a", { status: "IN_TRANSIT" });
    const issued = await seedShipment("a");
    vi.stubEnv("MENGANTAR_LIVE_ORDERS_ENABLED", "0");
    expect(await cancel(moving.shipmentId)).toEqual({
      error: "Pembatalan di Mengantar belum diaktifkan di GeraiCUAN. Hubungi admin GeraiCUAN.",
    });
    const { db } = await import("@/db/client");
    const { cancelShipmentAtMengantar } = await import("@/lib/shipment-cancellation");
    const { LiveMengantarOrdersDisabledError } = await import("@/lib/mengantar-live-transport");
    await expect(cancelShipmentAtMengantar({
      db, lockPool: dbPool, principalId: tenants.a.admin, shipmentId: issued.shipmentId, tenantId: tenants.a.id,
    })).rejects.toBeInstanceOf(LiveMengantarOrdersDisabledError);
    expect(calls).toEqual([]);
    expect(await shipmentStatus(issued.shipmentId)).toBe("ISSUED");
  });

  it("refuses another gerai's shipment as not found", async () => {
    const other = await seedShipment("b");
    expect(await cancel(other.shipmentId)).toEqual({ error: "Kiriman tidak ditemukan." });
    expect(calls).toEqual([]);
    expect(await shipmentStatus(other.shipmentId)).toBe("ISSUED");
  });

  it.each([
    ["a status past ISSUED", { status: "IN_TRANSIT" as const }, /hanya kiriman Resi terbit atau Menunggu pembayaran/],
    ["no Mengantar order id", { providerOrderId: null }, /belum punya nomor pesanan Mengantar/],
    ["a provider status past pickup", { providerStatus: "PICKED UP" }, /sudah mencatat paket dijemput/],
    ["an unrecognised provider status", { providerStatus: "ON DELIVERY" }, /sudah mencatat paket dijemput/],
    ["Anteraja accepted 4 minutes ago", { courier: "anteraja", acceptedSecondsAgo: 240 }, /AnterAja baru bisa dibatalkan 5 menit/],
    ["an uncertain payment", { status: "AWAITING_UPSTREAM_PAYMENT" as const, recoveryStatus: "PAYMENT_UNKNOWN" as const }, /Pembayaran pesanan ini belum pasti/],
    ["a courier the docs give no value for", { courier: "spx" }, /tidak bisa dibatalkan dari GeraiCUAN/],
  ])("refuses %s before sending anything", async (_name, options, message) => {
    const shipment = await seedShipment("a", options);
    expect(await cancel(shipment.shipmentId)).toEqual({ error: expect.stringMatching(message) });
    expect(calls).toEqual([]);
    expect(await shipmentStatus(shipment.shipmentId)).toBe((options as SeedOptions).status ?? "ISSUED");
    expect(await cancelAudit()).toEqual([]);
  });
});

describe("T-281 cancelShipmentOnMengantar: Mengantar's answer", () => {
  it("sends DELETE /order {courier, ids}, and only a confirmed deletion cancels with one audit row", async () => {
    const shipment = await seedShipment("a", { providerStatus: "PENDING PICKUP" });
    answers.push(deleted(shipment.providerOrderId!));
    expect(await cancel(shipment.shipmentId)).toEqual({ cancelled: { already: false } });
    expect(calls).toEqual([{ body: { courier: "JNE", ids: [shipment.providerOrderId] }, method: "DELETE", path: "/order" }]);
    expect(await shipmentStatus(shipment.shipmentId)).toBe("CANCELLED");
    expect(await cancelAudit()).toEqual([{
      actor_id: tenants.a.admin, actor_role: "TENANT_MEMBER", metadata: { courier: "JNE", fromStatus: "ISSUED" },
      outcome: "SUCCESS", target_id: shipment.shipmentId, target_type: "SHIPMENT", tenant_id: tenants.a.id,
    }]);
    // No ledger entry: a cancellation books nothing (as a pull-observed CANCELLED).
    expect((await adminPool.query("SELECT count(*)::int AS n FROM ledger_entries WHERE tenant_id = $1", [tenants.a.id])).rows[0].n).toBe(0);

    // A second click finds it cancelled and sends nothing.
    expect(await cancel(shipment.shipmentId)).toEqual({ cancelled: { already: true } });
    expect(calls).toHaveLength(1);
    expect(await cancelAudit()).toHaveLength(1);
  });

  it("cancels an unpaid order (Menunggu pembayaran) and an Anteraja order after 5 minutes, with the documented courier value", async () => {
    const unpaid = await seedShipment("a", { status: "AWAITING_UPSTREAM_PAYMENT", recoveryStatus: "PAYMENT_QUEUED" });
    answers.push(deleted(unpaid.providerOrderId!));
    expect(await cancel(unpaid.shipmentId)).toEqual({ cancelled: { already: false } });
    expect(await shipmentStatus(unpaid.shipmentId)).toBe("CANCELLED");

    const anteraja = await seedShipment("a", { courier: "AnterAja", acceptedSecondsAgo: 301 });
    answers.push(deleted(anteraja.providerOrderId!));
    expect(await cancel(anteraja.shipmentId)).toEqual({ cancelled: { already: false } });
    expect(calls.map((call) => call.body)).toEqual([
      { courier: "JNE", ids: [unpaid.providerOrderId] },
      { courier: "anteraja", ids: [anteraja.providerOrderId] },
    ]);
    expect((await cancelAudit()).map((row) => row.metadata.fromStatus).sort()).toEqual(["AWAITING_UPSTREAM_PAYMENT", "ISSUED"]);
  });

  it("leaves the shipment unchanged when Mengantar skips the order (past pickup)", async () => {
    const shipment = await seedShipment("a");
    answers.push(json(200, { success: true, message: "0 orders are deleted from 1 selected orders", deletedCount: 0, deletedOrderIds: [] }));
    expect(await cancel(shipment.shipmentId)).toEqual({
      error: expect.stringMatching(/^Mengantar tidak menghapus pesanan ini.*Status kiriman tidak diubah\..*Pesan Mengantar: “0 orders are deleted from 1 selected orders”$/),
    });
    expect(await shipmentStatus(shipment.shipmentId)).toBe("ISSUED");
    expect(await cancelAudit()).toEqual([]);
  });

  it("shows a courier's refusal, and drops a refusal message that quotes the key", async () => {
    const shipment = await seedShipment("a");
    answers.push(json(400, { success: false, message: "Order sudah di-pickup kurir" }));
    expect(await cancel(shipment.shipmentId)).toEqual({
      error: "Mengantar menolak pembatalan. Status kiriman tidak diubah. Pesan Mengantar: “Order sudah di-pickup kurir”",
    });
    answers.push(json(400, { success: false, message: `invalid key ${KEY}` }));
    const redacted = await cancel(shipment.shipmentId);
    expect(redacted).toEqual({ error: "Mengantar menolak pembatalan. Status kiriman tidak diubah." });
    expect(JSON.stringify(redacted)).not.toContain(KEY);
    expect(await shipmentStatus(shipment.shipmentId)).toBe("ISSUED");
    expect(await cancelAudit()).toEqual([]);
  });

  it.each([
    ["a lost answer", lost()],
    ["a 502", json(502, { message: "bad gateway" })],
    ["an unreadable success", () => new Response("<html>", { status: 200 })],
  ])("treats %s as unknown: unchanged, and points to the status pull", async (_name, answer) => {
    const shipment = await seedShipment("a");
    answers.push(answer);
    expect(await cancel(shipment.shipmentId)).toEqual({
      error: "Hasil pembatalan di Mengantar belum pasti. Status kiriman tidak diubah. Jalankan “Perbarui status dari Mengantar” di Histori kiriman, atau cek pesanan di aplikasi Mengantar.",
    });
    expect(calls).toHaveLength(1);
    expect(await shipmentStatus(shipment.shipmentId)).toBe("ISSUED");
    expect(await cancelAudit()).toEqual([]);
  });

  it("serializes two clicks on one account: Mengantar is asked once", async () => {
    const shipment = await seedShipment("a");
    answers.push(deleted(shipment.providerOrderId!));
    const results = await Promise.all([cancel(shipment.shipmentId), cancel(shipment.shipmentId)]);
    expect(results).toEqual(expect.arrayContaining([{ cancelled: { already: false } }, { cancelled: { already: true } }]));
    expect(calls).toHaveLength(1);
    expect(await cancelAudit()).toHaveLength(1);
  });
});

describe("T-281 review fixes", () => {
  it("counts a deletion that a racing status pull recorded first as this cancel (F6)", async () => {
    const shipment = await seedShipment("a", { providerStatus: "PENDING PICKUP" });
    answers.push(async () => {
      await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [shipment.shipmentId]);
      return deleted(shipment.providerOrderId!)();
    });
    expect(await cancel(shipment.shipmentId)).toEqual({ cancelled: { already: false } });
    expect(await shipmentStatus(shipment.shipmentId)).toBe("CANCELLED");
  });

  it("refuses, without a request, an order id that is not Mengantar's object _id (F5)", async () => {
    const shipment = await seedShipment("a", { providerOrderId: "ORDER-T281-READABLE" });
    const result = await cancel(shipment.shipmentId);
    expect(result).toMatchObject({ error: expect.any(String) });
    expect(calls).toHaveLength(0);
    expect(await shipmentStatus(shipment.shipmentId)).toBe("ISSUED");
  });

  it("stops a pay-unpaid claim from paying once the shipment was cancelled (F2)", async () => {
    const { refreshUnpaidRecoveryClaim } = await import("@/db/unpaid-recovery-repository");
    const { withTenantContext } = await import("@/db/tenant-context");
    const { db } = await import("@/db/client");
    const shipment = await seedShipment("a", { recoveryStatus: "PAYING", status: "AWAITING_UPSTREAM_PAYMENT" });
    const recovery = (await adminPool.query<{ id: string; batch_id: string }>(
      "SELECT r.id, r.batch_id FROM provider_unpaid_recoveries r JOIN provider_order_snapshots s ON s.id = r.provider_order_snapshot_id WHERE s.shipment_id = $1",
      [shipment.shipmentId])).rows[0]!;
    const refresh = () => withTenantContext(db, tenants.a.admin, tenants.a.id, (tx, context) =>
      refreshUnpaidRecoveryClaim(tx, context, recovery.batch_id, recovery.id));
    expect(await refresh()).toBe(true);
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [shipment.shipmentId]);
    expect(await refresh()).toBe(false);
  });
});

describe("T-281 readMengantarDeleteOrderAnswer", () => {
  it("reads only a success naming our _id as a deletion", () => {
    expect(readMengantarDeleteOrderAnswer({ body: { success: true, deletedOrderIds: ["x"] }, status: 200 }, "x")).toEqual({ kind: "DELETED" });
    expect(readMengantarDeleteOrderAnswer({ body: { success: true, deletedOrderIds: ["y"] }, status: 200 }, "x")).toEqual({ kind: "SKIPPED", providerMessage: null });
    expect(readMengantarDeleteOrderAnswer({ body: { success: false, message: "no" }, status: 200 }, "x")).toEqual({ kind: "REFUSED", providerMessage: "no" });
    expect(readMengantarDeleteOrderAnswer({ body: { deletedOrderIds: ["x"] }, status: 200 }, "x")).toMatchObject({ kind: "UNKNOWN" });
    expect(readMengantarDeleteOrderAnswer({ body: { success: true, deletedOrderIds: "x" }, status: 200 }, "x")).toMatchObject({ kind: "UNKNOWN" });
    expect(readMengantarDeleteOrderAnswer({ body: { message: "wait" }, status: 422 }, "x")).toEqual({ kind: "REFUSED", providerMessage: "wait" });
    expect(readMengantarDeleteOrderAnswer({ body: { success: true, deletedOrderIds: ["x"] }, status: 500 }, "x")).toMatchObject({ kind: "UNKNOWN" });
  });
});

describe("T-281 audit guard (0074): the runtime role appends SHIPMENT_CANCELLED only for its own cancelled shipment as Tenant Admin", () => {
  const insert = `INSERT INTO audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, metadata)
    VALUES ($1, 'TENANT_MEMBER', $2, 'SHIPMENT_CANCELLED', 'SHIPMENT', $3, 'SUCCESS', '{}')`;
  async function asRuntime(userId: string, tenantId: string, target: string) {
    const client = new Pool({ connectionString: appDatabaseUrl, max: 1 });
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [userId, tenantId]);
      await client.query(insert, [userId, tenantId, target]);
      await client.query("ROLLBACK");
      return "ok";
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return (error as { code?: string }).code;
    } finally {
      await client.end();
    }
  }

  it("refuses another gerai, an Operator and a shipment that is not CANCELLED; allows the real case", async () => {
    const cancelledA = await seedShipment("a");
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [cancelledA.shipmentId]);
    const liveA = await seedShipment("a");
    const cancelledB = await seedShipment("b");
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [cancelledB.shipmentId]);

    expect(await asRuntime(tenants.a.admin, tenants.a.id, cancelledA.shipmentId)).toBe("ok");
    // Another gerai's cancelled shipment, named from tenant A's context.
    expect(await asRuntime(tenants.a.admin, tenants.a.id, cancelledB.shipmentId)).toBe("42501");
    // Tenant B's row written by A's admin claiming B's context (not a member there).
    expect(await asRuntime(tenants.a.admin, tenants.b.id, cancelledB.shipmentId)).toBe("42501");
    expect(await asRuntime(tenants.a.operator, tenants.a.id, cancelledA.shipmentId)).toBe("42501");
    expect(await asRuntime(tenants.a.admin, tenants.a.id, liveA.shipmentId)).toBe("42501");
  });

  it("answers the definer lookup only for the context tenant", async () => {
    const cancelledB = await seedShipment("b");
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [cancelledB.shipmentId]);
    const client = new Pool({ connectionString: appDatabaseUrl, max: 1 });
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [tenants.a.admin, tenants.a.id]);
      const asked = await client.query("SELECT public.shipment_cancel_audit_allowed($1, $2, $3) AS allowed", [tenants.b.id, cancelledB.shipmentId, tenants.b.admin]);
      expect(asked.rows[0].allowed).toBe(false);
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  });
});

describe("T-281 detail rail", () => {
  async function render(shipment: { number: string }) {
    const page = await (ShipmentDetailPage as (props: { params: Promise<{ shipmentId: string }>; searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>)({
      params: Promise.resolve({ shipmentId: shipment.number }),
      searchParams: Promise.resolve({}),
    });
    return renderToStaticMarkup(page);
  }
  const button = /<button[^>]*>(?:(?!<\/button>)[\s\S])*Batalkan kiriman<\/button>/;

  it("offers Batalkan kiriman to a Tenant Admin on Resi terbit and Menunggu pembayaran only, with the live switch on", async () => {
    const issued = await seedShipment("a");
    const unpaid = await seedShipment("a", { status: "AWAITING_UPSTREAM_PAYMENT" });
    const moving = await seedShipment("a", { status: "IN_TRANSIT" });
    const html = await render(issued);
    expect(html).toMatch(button);
    expect(html).toMatch(/<button[^>]*class="[^"]*border-destructive\/60[^"]*max-md:h-11|<button[^>]*class="[^"]*max-md:h-11[^"]*border-destructive\/60/);
    expect(await render(unpaid)).toMatch(button);
    expect(await render(moving)).not.toMatch(button);
    // Already Dibatalkan: the slot stays mounted for the outcome, but offers nothing on a fresh load.
    const cancelled = await seedShipment("a");
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [cancelled.shipmentId]);
    const cancelledHtml = await render(cancelled);
    expect(cancelledHtml).not.toMatch(button);
    expect(cancelledHtml).not.toContain("Kiriman dibatalkan di Mengantar");

    as("a", "OPERATOR");
    expect(await render(issued)).not.toMatch(button);
    as("a");
    vi.stubEnv("MENGANTAR_LIVE_ORDERS_ENABLED", "0");
    expect(await render(issued)).not.toMatch(button);
  });
});
