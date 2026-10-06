// T-274: Cetak resi's end-of-day line — LBL-PRINTED-TODAY, LBL-HANDED-OVER-TODAY, LBL-DAY-PENDING —
// real against the isolated test database (runtime role, RLS on), on a fixed clock and at the WIB
// day's edges. Fixtures live in their own tenants and are removed by tenant; no Mengantar call.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

const { loadLabelDaySummary } = await import("@/app/app/label/label-day-summary");
const { loadLabelIndexPage } = await import("@/db/label-print-repository");
const { countHandedOverToday } = await import("@/db/shipment-handover-repository");
const { withTenantContext } = await import("@/db/tenant-context");

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenants = {
  a: { id: "00000000-0000-0274-0000-0000000000a1", operator: "t274-operator-a", outlet: "00000000-0000-0274-0001-0000000000a1" },
  b: { id: "00000000-0000-0274-0000-0000000000b1", operator: "t274-operator-b", outlet: "00000000-0000-0274-0001-0000000000b1" },
};
type TenantKey = keyof typeof tenants;
let sequence = 0;

type Seeded = { awb: string; shipmentId: string; snapshotId: string };

async function seedShipment(key: TenantKey, status: "ISSUED" | "CANCELLED" = "ISSUED"): Promise<Seeded> {
  const tenant = tenants[key];
  sequence += 1;
  const suffix = `${key}${sequence.toString(16).padStart(11, "0")}`;
  const ids = {
    batchId: `00000000-0000-0274-0013-${suffix}`,
    estimateServiceId: `00000000-0000-0274-0012-${suffix}`,
    estimateSnapshotId: `00000000-0000-0274-0011-${suffix}`,
    providerOrderSnapshotId: `00000000-0000-0274-0014-${suffix}`,
    shipmentId: `00000000-0000-0274-0010-${suffix}`,
  };
  const awb = `JNE274${key.toUpperCase()}${String(sequence).padStart(5, "0")}`;
  await adminPool.query("INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, $4)", [ids.shipmentId, tenant.id, tenant.outlet, status]);
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label, package_content,
      package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only, pickup_address_id, origin_area_id, handover_type
    ) VALUES ($1, $2, 'fixture-destination', 'Menteng, Jakarta Pusat', 'Kain', 1000, 1, 100000, false, false, 'pickup-274', 'origin-fixture', 'DROP_OFF')`,
    [ids.shipmentId, tenant.id],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'RECIPIENT', 'Penerima Sintetis', '081299990274', 'Jl. Sintetis 1', 'fixture-destination', 'Menteng, Jakarta Pusat')`,
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
    ) VALUES ($1, $2, $3, 'pickup-274', 'JNE', 'platform_default', $4, $5, 'COMPLETED', now(), now())`,
    [ids.batchId, tenant.id, tenant.outlet, "d".repeat(64), `274${key}${sequence}`.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service,
      destination_area_id, destination_area_label, currency, shipping_amount_idr, provider_charged_shipping_idr,
      insurance_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id, is_paid, cnote_no,
      safe_response_code, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'REG', 'fixture-destination', 'Menteng, Jakarta Pusat', 'IDR',
      8000, 7000, 0, false, NULL, $7, $8, true, $9, 'FIXTURE_ACCEPTED', now() - interval '5 days')`,
    // A resi Mengantar cancelled after issuance: the shipment is CANCELLED, the issued snapshot stays.
    [ids.providerOrderSnapshotId, tenant.id, ids.batchId, ids.shipmentId, ids.estimateSnapshotId, ids.estimateServiceId, "ISSUED", `t274-order-${key}-${sequence}`, awb],
  );
  return { awb, shipmentId: ids.shipmentId, snapshotId: ids.providerOrderSnapshotId };
}

/** A PRINTED event at a chosen instant. */
async function printAt(key: TenantKey, parcel: Seeded, at: string) {
  await adminPool.query(
    `INSERT INTO print_events (tenant_id, shipment_id, provider_order_snapshot_id, sequence, outcome, awb_snapshot, actor_user_id, actor_role, printed_at)
     VALUES ($1, $2, $3, (SELECT coalesce(max(sequence), 0) + 1 FROM print_events WHERE shipment_id = $2), 'PRINTED', $4, $5, 'OPERATOR', $6::timestamptz)`,
    [tenants[key].id, parcel.shipmentId, parcel.snapshotId, parcel.awb, tenants[key].operator, at],
  );
}

/** A handover event (HANDED_OVER or UNDONE) recorded at a chosen instant. */
async function handoverAt(key: TenantKey, parcel: Seeded, at: string, kind: "HANDED_OVER" | "UNDONE" = "HANDED_OVER") {
  await adminPool.query(
    `INSERT INTO shipment_handover_events (tenant_id, shipment_id, sequence, kind, method, actor_user_id, actor_role, created_at)
     VALUES ($1, $2, (SELECT coalesce(max(sequence), 0) + 1 FROM shipment_handover_events WHERE shipment_id = $2), $3, $4, $5, 'OPERATOR', $6::timestamptz)`,
    [tenants[key].id, parcel.shipmentId, kind, kind === "HANDED_OVER" ? "DROP_OFF" : null, tenants[key].operator, at],
  );
}

async function clean() {
  for (const tenant of Object.values(tenants)) {
    for (const table of [
      "shipment_handover_events", "print_events", "provider_order_snapshots", "provider_batches",
      "shipment_estimate_services", "shipment_estimate_snapshots", "shipment_parties",
      "shipment_drafts", "shipments", "outlets", "memberships",
    ]) {
      await adminPool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenant.id]);
    }
    await adminPool.query("DELETE FROM tenant_shipment_counters WHERE tenant_id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM audit_events WHERE tenant_id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM tenants WHERE id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM users WHERE id = $1", [tenant.operator]);
  }
}

function read<T>(key: TenantKey, work: Parameters<typeof withTenantContext<T>>[3]) {
  return withTenantContext(appDb, tenants[key].operator, tenants[key].id, work);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await clean();
  sequence = 0;
  for (const [key, tenant] of Object.entries(tenants)) {
    await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)", [tenant.operator, `Operator ${key}`, `${tenant.operator}@example.test`]);
    await adminPool.query("INSERT INTO tenants (id, name, status, contact_whatsapp) VALUES ($1, $2, 'ACTIVE', '081234567890')", [tenant.id, `Gerai T274 ${key}`]);
    await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR')", [tenant.id, tenant.operator]);
    await adminPool.query(
      `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_pickup_address_label, default_origin_area_id, default_origin_area_label)
       VALUES ($1, $2, $3, 'pickup-274', 'Gudang, Menteng', 'origin-fixture', 'Menteng, Jakarta Pusat')`,
      [tenant.outlet, tenant.id, `Outlet ${key}`],
    );
  }
});

afterAll(async () => {
  await clean();
  await adminPool.end();
  await appPool.end();
});

// The fixed clock: 1 Oct 2026, 10.00 WIB. Today (WIB) is [30 Sep 17:00Z, 1 Oct 17:00Z).
const CLOCK = new Date("2026-10-01T03:00:00Z");
const MIDNIGHT = "2026-09-30T17:00:00.000Z";
const JUST_BEFORE = "2026-09-30T16:59:59.999Z";
const TOMORROW = "2026-10-01T17:00:00.000Z";

describe("loadLabelDaySummary (spec 19 LBL-PRINTED-TODAY, LBL-HANDED-OVER-TODAY, LBL-DAY-PENDING)", () => {
  it("counts exactly at the WIB day's edges on a fixed clock", async () => {
    const atMidnight = await seedShipment("a"); // first print at 00.00 WIB: printed today, ready
    await printAt("a", atMidnight, MIDNIGHT);
    const justBefore = await seedShipment("a"); // 23.59.59,999 the day before: pending
    await printAt("a", justBefore, JUST_BEFORE);
    const reprinted = await seedShipment("a"); // first print 3 days ago, reprint today: pending, not printed today
    await printAt("a", reprinted, "2026-09-28T03:00:00Z");
    await printAt("a", reprinted, "2026-10-01T02:00:00Z");
    const handedToday = await seedShipment("a"); // printed and handed over today
    await printAt("a", handedToday, "2026-10-01T01:00:00Z");
    await handoverAt("a", handedToday, "2026-10-01T02:30:00Z");
    const printedYesterdayHandedToday = await seedShipment("a"); // handed over at 00.00 WIB exactly
    await printAt("a", printedYesterdayHandedToday, "2026-09-29T03:00:00Z");
    await handoverAt("a", printedYesterdayHandedToday, MIDNIGHT);
    const handedYesterday = await seedShipment("a"); // handed over just before today: neither
    await printAt("a", handedYesterday, "2026-09-29T03:00:00Z");
    await handoverAt("a", handedYesterday, JUST_BEFORE);
    const undone = await seedShipment("a"); // handed over today, then undone: pending again
    await printAt("a", undone, "2026-09-29T03:00:00Z");
    await handoverAt("a", undone, "2026-10-01T01:00:00Z");
    await handoverAt("a", undone, "2026-10-01T01:30:00Z", "UNDONE");
    const tomorrow = await seedShipment("a"); // at the next midnight: not today
    await printAt("a", tomorrow, TOMORROW);
    const cancelled = await seedShipment("a", "CANCELLED"); // printed yesterday, resi cancelled: not pending
    await printAt("a", cancelled, "2026-09-29T03:00:00Z");
    await seedShipment("a"); // never printed: nothing
    const other = await seedShipment("b"); // another gerai's print today
    await printAt("b", other, MIDNIGHT);

    expect(await read("a", (tx, context) => loadLabelDaySummary(tx, context, CLOCK))).toEqual({
      "LBL-HANDED-OVER-TODAY": 2, // handedToday, printedYesterdayHandedToday
      "LBL-PRINTED-TODAY": 2, // atMidnight, handedToday
      "LBL-DAY-PENDING": 3, // justBefore, reprinted, undone
    });
    expect(await read("b", (tx, context) => loadLabelDaySummary(tx, context, CLOCK))).toEqual({
      "LBL-HANDED-OVER-TODAY": 0,
      "LBL-PRINTED-TODAY": 1,
      "LBL-DAY-PENDING": 0,
    });
    // The next WIB day, 1 ms after its midnight: yesterday's prints are pending, the handovers were yesterday.
    const nextDay = new Date("2026-10-01T17:00:00.001Z");
    expect(await read("a", (tx, context) => loadLabelDaySummary(tx, context, nextDay))).toEqual({
      "LBL-HANDED-OVER-TODAY": 0,
      "LBL-PRINTED-TODAY": 1, // the next midnight's print, now today
      "LBL-DAY-PENDING": 4, // + atMidnight; the next midnight's print is today, not before it
    });
  });

  it("on the transaction clock agrees with the tiles' Tertunda and with countHandedOverToday", async () => {
    const hour = 3_600_000;
    const ready = await seedShipment("a");
    await printAt("a", ready, new Date(Date.now() - 50 * hour).toISOString());
    const fresh = await seedShipment("a");
    await printAt("a", fresh, new Date().toISOString());
    const handed = await seedShipment("a");
    await printAt("a", handed, new Date(Date.now() - 50 * hour).toISOString());
    await handoverAt("a", handed, new Date().toISOString());
    const [day, page, handedOverToday] = await read("a", async (tx, context) => [
      await loadLabelDaySummary(tx, context),
      await loadLabelIndexPage(tx, context, { printState: "sudah", status: "issued" }),
      await countHandedOverToday(tx, context),
    ] as const);
    // Unfiltered, the day line's own ID (T-277) equals the Tertunda tile.
    expect(day["LBL-DAY-PENDING"]).toBe(page.summary["LBL-READY-PENDING"]);
    expect(day["LBL-DAY-PENDING"]).toBe(1);
    expect(day["LBL-HANDED-OVER-TODAY"]).toBe(handedOverToday);
    expect(day["LBL-HANDED-OVER-TODAY"]).toBe(1);
    expect(day["LBL-PRINTED-TODAY"]).toBe(1);
  });
});
