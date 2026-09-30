// T-270 (owner 2026-10-01): Cetak resi's work queues are a state, not a period, and "Scan resi"
// selects a ready parcel for handover. Real against the isolated test database (runtime role, RLS
// on); only the session lookup is replaced. Fixtures live in their own tenants and are removed by
// tenant; no Mengantar call is made anywhere, and a scan records nothing.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const session = vi.hoisted(() => ({ principal: { role: "OPERATOR", scope: "tenant", tenantId: "", tenantStatus: "ACTIVE", userId: "" } }));
vi.mock("@/app/app/pengiriman/_list/tenant-page", () => ({ requireTenantPrincipal: async () => session.principal }));
vi.mock("@/db/client", async () => {
  const { drizzle: connect } = await import("drizzle-orm/node-postgres");
  const { Pool: PgPool } = await import("pg");
  const dbSchema = await import("@/db/schema");
  return { db: connect({ client: new PgPool({ allowExitOnIdle: true, connectionString: process.env.APP_DATABASE_URL }), schema: dbSchema }) };
});
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { markShipmentsHandedOverAction, scanForHandover, selectReadyForHandover } = await import("@/app/app/label/handover-actions");
const { selectUnprintedLabels } = await import("@/app/app/label/cetak/actions");
const { loadLabelIndexPage } = await import("@/db/label-print-repository");
const { withTenantContext } = await import("@/db/tenant-context");
const { parseAnalyticsRange } = await import("@/lib/analytics-range");
const { createProcessWindowLimiter } = await import("@/lib/location-search-rate-limit");
const { handoverScanOutcome, normalizeHandoverScan } = await import("@/lib/shipment-handover");

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenants = {
  a: { admin: "t270-admin-a", id: "00000000-0000-0270-0000-0000000000a1", operator: "t270-operator-a", outlet: "00000000-0000-0270-0001-0000000000a1" },
  b: { admin: "t270-admin-b", id: "00000000-0000-0270-0000-0000000000b1", operator: "t270-operator-b", outlet: "00000000-0000-0270-0001-0000000000b1" },
};
type TenantKey = keyof typeof tenants;
let sequence = 0;

type Seeded = { awb: string; number: number; publicReference: string; shipmentId: string; snapshotId: string };

async function seedShipment(
  key: TenantKey,
  options: { printed?: boolean; status?: "ISSUED" | "AWAITING_UPSTREAM_PAYMENT"; handoverType?: "PICKUP" | "DROP_OFF" } = {},
): Promise<Seeded> {
  const tenant = tenants[key];
  const status = options.status ?? "ISSUED";
  sequence += 1;
  const suffix = `${key}${sequence.toString(16).padStart(11, "0")}`;
  const ids = {
    batchId: `00000000-0000-0270-0013-${suffix}`,
    estimateServiceId: `00000000-0000-0270-0012-${suffix}`,
    estimateSnapshotId: `00000000-0000-0270-0011-${suffix}`,
    providerOrderSnapshotId: `00000000-0000-0270-0014-${suffix}`,
    shipmentId: `00000000-0000-0270-0010-${suffix}`,
  };
  const awb = `JNE270${key.toUpperCase()}${String(sequence).padStart(5, "0")}`;
  const { rows } = await adminPool.query<{ public_reference: string; tenant_number: number }>(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, $4) RETURNING tenant_number, public_reference",
    [ids.shipmentId, tenant.id, tenant.outlet, status],
  );
  const handoverType = options.handoverType ?? "DROP_OFF";
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label, package_content,
      package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only, pickup_address_id, origin_area_id,
      handover_type, pickup_date, pickup_slot
    ) VALUES ($1, $2, 'fixture-destination', 'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310',
      'Kain', 1000, 1, 100000, false, false, 'pickup-270', 'origin-fixture', $3, $4, $5)`,
    [ids.shipmentId, tenant.id, handoverType, handoverType === "PICKUP" ? "2026-09-30" : null, handoverType === "PICKUP" ? "10:00" : null],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'RECIPIENT', 'Penerima Sintetis', '081299990270', 'Jl. Sintetis 1', 'fixture-destination',
       'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310')`,
    [tenant.id, ids.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label,
      weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin-fixture', 'fixture-destination', 'Menteng, Jakarta Pusat', 1000, false, 'platform_default')`,
    [ids.estimateSnapshotId, tenant.id, ids.shipmentId, tenant.outlet],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'REG', 'IDR', 8000, 'price', '1-2 hari', true)`,
    [ids.estimateServiceId, tenant.id, ids.estimateSnapshotId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source, provider_account_key,
      idempotency_key, status, submission_attempted_at, completed_at
    ) VALUES ($1, $2, $3, 'pickup-270', 'JNE', 'platform_default', $4, $5, 'COMPLETED', now(), now())`,
    [ids.batchId, tenant.id, tenant.outlet, "d".repeat(64), `270${key}${sequence}`.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service,
      destination_area_id, destination_area_label, currency, shipping_amount_idr, provider_charged_shipping_idr,
      insurance_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id, is_paid, cnote_no,
      safe_response_code, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'REG', 'fixture-destination', 'Menteng, Jakarta Pusat', 'IDR',
      8000, 7000, 0, false, NULL, $7, $8, $9, $10, 'FIXTURE_ACCEPTED', now() - ($11 || ' seconds')::interval)`,
    [
      ids.providerOrderSnapshotId, tenant.id, ids.batchId, ids.shipmentId, ids.estimateSnapshotId, ids.estimateServiceId,
      status, `t270-order-${key}-${sequence}`, status === "ISSUED", status === "ISSUED" ? awb : null, String(1000 - sequence),
    ],
  );
  if (options.printed) {
    await adminPool.query(
      `INSERT INTO print_events (tenant_id, shipment_id, provider_order_snapshot_id, sequence, outcome, awb_snapshot, actor_user_id, actor_role)
       VALUES ($1, $2, $3, 1, 'PRINTED', $4, $5, 'OPERATOR')`,
      [tenant.id, ids.shipmentId, ids.providerOrderSnapshotId, awb, tenant.operator],
    );
  }
  return { awb, number: rows[0].tenant_number, publicReference: rows[0].public_reference, shipmentId: ids.shipmentId, snapshotId: ids.providerOrderSnapshotId };
}

async function clean() {
  for (const tenant of Object.values(tenants)) {
    for (const table of [
      "shipment_handover_events", "shipment_invoices", "print_events", "provider_order_snapshots", "provider_batches",
      "shipment_cod_totals", "shipment_estimate_services", "shipment_estimate_snapshots", "shipment_parties",
      "shipment_drafts", "shipments", "outlet_pickup_points", "outlets", "memberships",
    ]) {
      await adminPool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenant.id]);
    }
    await adminPool.query("DELETE FROM tenant_shipment_counters WHERE tenant_id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM audit_events WHERE tenant_id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM tenants WHERE id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [[tenant.admin, tenant.operator]]);
  }
}

function as(key: TenantKey, role: "OPERATOR" | "TENANT_ADMIN" = "OPERATOR", tenantKey: TenantKey = key) {
  const tenant = tenants[key];
  session.principal = { ...session.principal, role, tenantId: tenants[tenantKey].id, userId: role === "OPERATOR" ? tenant.operator : tenant.admin };
}

function read<T>(key: TenantKey, work: Parameters<typeof withTenantContext<T>>[3], role: "OPERATOR" | "TENANT_ADMIN" = "OPERATOR") {
  const tenant = tenants[key];
  return withTenantContext(appDb, role === "OPERATOR" ? tenant.operator : tenant.admin, tenant.id, work);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await clean();
  sequence = 0;
  for (const [key, tenant] of Object.entries(tenants)) {
    await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)", [
      tenant.operator, `Operator ${key.toUpperCase()}`, `${tenant.operator}@example.test`,
      tenant.admin, `Pemilik ${key.toUpperCase()}`, `${tenant.admin}@example.test`,
    ]);
    await adminPool.query("INSERT INTO tenants (id, name, status, contact_whatsapp) VALUES ($1, $2, 'ACTIVE', '081234567890')", [tenant.id, `Gerai T270 ${key}`]);
    await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR'), ($1, $3, 'TENANT_ADMIN')", [tenant.id, tenant.operator, tenant.admin]);
    await adminPool.query(
      `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_pickup_address_label, default_origin_area_id, default_origin_area_label)
       VALUES ($1, $2, $3, 'pickup-270', 'Gudang, Menteng', 'origin-fixture', 'Menteng, Jakarta Pusat')`,
      [tenant.outlet, tenant.id, `Outlet ${key}`],
    );
  }
});

afterAll(async () => {
  await clean();
  await adminPool.end();
  await appPool.end();
});


/** A PRINTED event at a chosen instant (the queue's "joined" time), instead of the seed's now(). */
async function printAt(key: TenantKey, parcel: Seeded, at: string) {
  await adminPool.query(
    `INSERT INTO print_events (tenant_id, shipment_id, provider_order_snapshot_id, sequence, outcome, awb_snapshot, actor_user_id, actor_role, printed_at)
     VALUES ($1, $2, $3, (SELECT coalesce(max(sequence), 0) + 1 FROM print_events WHERE shipment_id = $2), 'PRINTED', $4, $5, 'OPERATOR', $6::timestamptz)`,
    [tenants[key].id, parcel.shipmentId, parcel.snapshotId, parcel.awb, tenants[key].operator, at],
  );
}

async function handoverEventCount(tenantKey: TenantKey) {
  const { rows } = await adminPool.query<{ count: number }>("SELECT count(*)::int AS count FROM shipment_handover_events WHERE tenant_id = $1", [tenants[tenantKey].id]);
  return rows[0].count;
}

describe("queues are a state, not a period (LBL-UNPRINTED, LBL-PRINTED, LBL-HANDED-OVER)", () => {
  it("lists and counts an old parcel in every queue tab whatever the period; Semua resi and Dibatalkan keep the period", async () => {
    const oldReady = await seedShipment("a");
    const oldUnprinted = await seedShipment("a");
    const oldHanded = await seedShipment("a", { printed: true });
    const fresh = await seedShipment("a", { printed: true });
    await adminPool.query(
      "UPDATE provider_order_snapshots SET resolved_at = '2025-03-10T03:00:00Z', created_at = '2025-03-10T03:00:00Z' WHERE shipment_id = ANY($1::uuid[])",
      [[oldReady.shipmentId, oldUnprinted.shipmentId, oldHanded.shipmentId]],
    );
    await printAt("a", oldReady, "2025-03-10T04:00:00Z");
    as("a");
    await markShipmentsHandedOverAction({ method: "PICKUP", numbers: [oldHanded.number] });

    const last30 = parseAnalyticsRange({}, new Date());
    const march2025 = parseAnalyticsRange({ dari: "2025-03-01", khusus: "1", rentang: "kustom", sampai: "2025-03-31", tz: "Asia/Jakarta" }, new Date());
    for (const range of [last30, march2025, undefined]) {
      const page = await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState: "semua", range, status: "issued" }));
      expect(page.summary["LBL-UNPRINTED"]).toBe(1);
      expect(page.summary["LBL-PRINTED"]).toBe(2);
      expect(page.summary["LBL-HANDED-OVER"]).toBe(1);
      // PR-52: each tab's count equals its rows, for this period.
      for (const [printState, metricId] of [["semua", "LBL-ALL"], ["belum", "LBL-UNPRINTED"], ["sudah", "LBL-PRINTED"], ["diserahkan", "LBL-HANDED-OVER"], ["batal", "LBL-CANCELLED"]] as const) {
        const tab = await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState, range, status: "issued" }));
        expect(tab.rows, `${printState} ${range?.startDate ?? "all"}`).toHaveLength(page.summary[metricId]);
      }
    }
    const sudah = await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState: "sudah", range: last30, status: "issued" }));
    expect(sudah.rows.map((row) => row.shipmentId)).toEqual([fresh.shipmentId, oldReady.shipmentId]);
    // Semua resi follows the period: the fresh parcel in the last 30 days, the three old ones in March 2025.
    expect((await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState: "semua", range: last30, status: "issued" }))).summary["LBL-ALL"]).toBe(1);
    expect((await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState: "semua", range: march2025, status: "issued" }))).summary["LBL-ALL"]).toBe(3);
    // The select-all actions take the same period-free queue.
    expect((await selectUnprintedLabels({ dari: "2026-01-01", khusus: "1", rentang: "kustom", sampai: "2026-01-02" })).numbers).toEqual([oldUnprinted.number]);
    expect((await selectReadyForHandover({ dari: "2026-01-01", khusus: "1", rentang: "kustom", sampai: "2026-01-02" })).total).toBe(2);
  });

  it("splits Siap diserahkan by first print into Hari ini and Tertunda (WIB); the counts equal the grouped rows", async () => {
    const today = await seedShipment("a", { printed: true });
    const yesterday = await seedShipment("a");
    const reprinted = await seedShipment("a");
    await printAt("a", yesterday, new Date(Date.now() - 26 * 3_600_000).toISOString());
    // First printed three days ago, reprinted now: it has waited since the first print.
    await printAt("a", reprinted, new Date(Date.now() - 72 * 3_600_000).toISOString());
    await printAt("a", reprinted, new Date().toISOString());
    const page = await read("a", (tx, context) => loadLabelIndexPage(tx, context, { printState: "sudah", status: "issued" }));
    expect(page.summary["LBL-READY-TODAY"]).toBe(1);
    expect(page.summary["LBL-READY-PENDING"]).toBe(2);
    expect(page.summary["LBL-READY-TODAY"] + page.summary["LBL-READY-PENDING"]).toBe(page.summary["LBL-PRINTED"]);
    // Newest first print first: Hari ini before Tertunda.
    expect(page.rows.map((row) => [row.shipmentId, row.printedToday])).toEqual([
      [today.shipmentId, true], [yesterday.shipmentId, false], [reprinted.shipmentId, false],
    ]);
    expect(page.rows.filter((row) => row.printedToday)).toHaveLength(page.summary["LBL-READY-TODAY"]);
    expect(page.rows[2].firstPrintedAt!.getTime()).toBeLessThan(Date.now() - 71 * 3_600_000);
  });
});

describe("scanForHandover (Scan resi)", () => {
  it("adds a ready parcel by resi as a scanner types it: any case, CR/LF/Tab, surrounding spaces", async () => {
    const parcel = await seedShipment("a", { handoverType: "PICKUP", printed: true });
    as("a");
    const expected = { awb: parcel.awb, handoverType: "PICKUP", number: parcel.number, ok: true, publicReference: parcel.publicReference };
    expect(await scanForHandover(parcel.awb)).toEqual(expected);
    expect(await scanForHandover(` ${parcel.awb.toLowerCase()}\r\n`)).toEqual(expected);
    expect(await scanForHandover(`${parcel.awb}\t`)).toEqual(expected);
  });

  it("accepts the nomor kiriman with or without its prefix", async () => {
    const parcel = await seedShipment("a", { printed: true });
    as("a", "TENANT_ADMIN");
    expect(await scanForHandover(parcel.publicReference)).toMatchObject({ number: parcel.number, ok: true });
    expect(await scanForHandover(parcel.publicReference.toLowerCase())).toMatchObject({ number: parcel.number, ok: true });
    expect(await scanForHandover(String(parcel.number))).toMatchObject({ number: parcel.number, ok: true });
    // Another prefix is not this gerai's reference.
    expect(await scanForHandover(`XY-${parcel.number}`)).toEqual({ ok: false, publicReference: null, reason: "NOT_FOUND" });
  });

  it("an all-digit resi wins over a nomor kiriman with the same digits", async () => {
    const first = await seedShipment("a", { printed: true });
    const second = await seedShipment("a", { printed: true });
    await adminPool.query("UPDATE provider_order_snapshots SET cnote_no = $1 WHERE shipment_id = $2", [String(second.number), first.shipmentId]);
    await adminPool.query("UPDATE print_events SET awb_snapshot = $1 WHERE shipment_id = $2", [String(second.number), first.shipmentId]).catch(() => undefined);
    as("a");
    expect(await scanForHandover(String(second.number))).toMatchObject({ number: first.number, ok: true });
    expect(await scanForHandover(second.publicReference)).toMatchObject({ number: second.number, ok: true });
  });

  it("refuses each other state with its reason and the parcel's nomor kiriman", async () => {
    const unprinted = await seedShipment("a");
    const handed = await seedShipment("a", { printed: true });
    const scanned = await seedShipment("a", { printed: true });
    const cancelled = await seedShipment("a", { printed: true });
    const unpaid = await seedShipment("a", { status: "AWAITING_UPSTREAM_PAYMENT" });
    as("a");
    await markShipmentsHandedOverAction({ method: "DROP_OFF", numbers: [handed.number] });
    await adminPool.query("UPDATE shipments SET status = 'IN_TRANSIT' WHERE id = $1", [scanned.shipmentId]);
    await adminPool.query("UPDATE shipments SET status = 'CANCELLED' WHERE id = $1", [cancelled.shipmentId]);
    const before = await handoverEventCount("a");

    expect(await scanForHandover(unprinted.awb)).toEqual({ ok: false, publicReference: unprinted.publicReference, reason: "NOT_PRINTED" });
    expect(await scanForHandover(handed.awb)).toEqual({ ok: false, publicReference: handed.publicReference, reason: "HANDED_OVER" });
    expect(await scanForHandover(scanned.awb)).toEqual({ ok: false, publicReference: scanned.publicReference, reason: "PICKED_UP" });
    expect(await scanForHandover(cancelled.awb)).toEqual({ ok: false, publicReference: cancelled.publicReference, reason: "ORDER_CANCELLED" });
    expect(await scanForHandover(String(unpaid.number))).toEqual({ ok: false, publicReference: unpaid.publicReference, reason: "NOT_ISSUED" });
    expect(await scanForHandover("JNE270ZZZ99999")).toEqual({ ok: false, publicReference: null, reason: "NOT_FOUND" });
    for (const bad of ["", "ab", "   ", "JNE 270/ A", "x".repeat(65), 12345, null, { awb: handed.awb }]) {
      expect(await scanForHandover(bad), JSON.stringify(bad)).toEqual({ ok: false, publicReference: null, reason: "INVALID" });
    }
    // A scan only reads: nothing was recorded.
    expect(await handoverEventCount("a")).toBe(before);
  });

  it("never reaches another gerai's parcel, by resi or by number, for either role", async () => {
    await seedShipment("a", { printed: true });
    const foreignFirst = await seedShipment("b", { printed: true });
    const foreign = await seedShipment("b", { printed: true });
    for (const role of ["OPERATOR", "TENANT_ADMIN"] as const) {
      as("a", role);
      expect(await scanForHandover(foreign.awb)).toEqual({ ok: false, publicReference: null, reason: "NOT_FOUND" });
      expect(await scanForHandover(foreignFirst.awb)).toEqual({ ok: false, publicReference: null, reason: "NOT_FOUND" });
      // Gerai A has only its first number; B's second number is B's alone.
      expect(await scanForHandover(String(foreign.number))).toEqual({ ok: false, publicReference: null, reason: "NOT_FOUND" });
    }
    // The same resi scanned in its own gerai is ready.
    as("b");
    expect(await scanForHandover(foreign.awb)).toMatchObject({ number: foreign.number, ok: true });
  });

  it("stops a runaway client with the per-member window", async () => {
    const allow = createProcessWindowLimiter(3, 60_000);
    const member = { tenantId: "t", userId: "u" };
    expect([allow(member, 0), allow(member, 1), allow(member, 2), allow(member, 3)]).toEqual([true, true, true, false]);
    expect(allow({ tenantId: "t", userId: "other" }, 3)).toBe(true);
    expect(allow(member, 60_000)).toBe(true);
  });
});

describe("scan normalization and the client's selection rule", () => {
  it("normalizes resi and nomor kiriman input", () => {
    expect(normalizeHandoverScan(" jne123abc\r\n")).toEqual({ code: "JNE123ABC", number: null, reference: null });
    expect(normalizeHandoverScan("gc-10123")).toEqual({ code: "GC-10123", number: null, reference: "GC-10123" });
    expect(normalizeHandoverScan("10123")).toEqual({ code: "10123", number: 10123, reference: null });
    expect(normalizeHandoverScan("0012345678901")).toEqual({ code: "0012345678901", number: null, reference: null });
    expect(normalizeHandoverScan("99999999999")).toEqual({ code: "99999999999", number: null, reference: null });
    expect(normalizeHandoverScan("GC-9999")).toEqual({ code: "GC-9999", number: null, reference: null });
    for (const bad of ["", "ab", "a/b/c", "x".repeat(65), undefined, 10123]) expect(normalizeHandoverScan(bad)).toBeNull();
  });

  const ready = (number: number) => ({ awb: `AWB${number}`, handoverType: null, number, ok: true as const, publicReference: `GC-${number}` });

  it("adds a new parcel, says so for a duplicate without adding it, and stops at the 50 cap", () => {
    expect(handoverScanOutcome(ready(10001), new Set([10000]), 50)).toEqual({ kind: "added", number: 10001, text: "GC-10001 ditambahkan · 2 dipilih" });
    expect(handoverScanOutcome(ready(10000), new Set([10000]), 50)).toEqual({ kind: "duplicate", number: 10000, text: "GC-10000 sudah dipilih. Tidak ditambahkan dua kali." });
    const full = new Set(Array.from({ length: 50 }, (_, index) => 20_000 + index));
    expect(handoverScanOutcome(ready(10002), full, 50)).toMatchObject({ kind: "cap" });
    // A duplicate at the cap is still a duplicate, not a cap refusal.
    expect(handoverScanOutcome(ready(20_000), full, 50)).toMatchObject({ kind: "duplicate" });
    expect(handoverScanOutcome(ready(10002), new Set(Array.from({ length: 49 }, (_, index) => 20_000 + index)), 50)).toMatchObject({ kind: "added", text: "GC-10002 ditambahkan · 50 dipilih" });
  });

  it("words each refusal with the parcel's nomor kiriman where there is one", () => {
    expect(handoverScanOutcome({ ok: false, publicReference: "GC-10009", reason: "NOT_PRINTED" }, new Set(), 50))
      .toEqual({ kind: "refused", text: "GC-10009: label belum dicetak. Cetak dulu sebelum diserahkan." });
    expect(handoverScanOutcome({ ok: false, publicReference: null, reason: "NOT_FOUND" }, new Set(), 50))
      .toEqual({ kind: "refused", text: "Resi atau nomor kiriman tidak ditemukan di gerai ini." });
    expect(handoverScanOutcome({ ok: false, publicReference: "GC-10010", reason: "ORDER_CANCELLED" }, new Set(), 50).text).toBe("GC-10010: dibatalkan Mengantar. Jangan diserahkan ke kurir.");
  });
});
