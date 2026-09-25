// T-230 / PR-87 + PR-76: the batch print view issues exactly one invoice per shipment,
// however often it is opened. Fixtures live in their own tenant and are removed by
// tenant, never by TRUNCATE, so other rows (and the demo data) stay untouched.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadBatchPrint } from "@/app/app/label/cetak/batch-data";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantId = "00000000-0000-0230-0000-0000000000a1";
const outletId = "00000000-0000-0230-0001-0000000000a1";
const operatorId = "t230-operator-a";

async function seedShipment(sequence: number, status: "ISSUED" | "AWAITING_UPSTREAM_PAYMENT" = "ISSUED") {
  const suffix = sequence.toString(16).padStart(12, "0");
  const ids = {
    batchId: `00000000-0000-0230-0013-${suffix}`,
    estimateServiceId: `00000000-0000-0230-0012-${suffix}`,
    estimateSnapshotId: `00000000-0000-0230-0011-${suffix}`,
    providerOrderSnapshotId: `00000000-0000-0230-0014-${suffix}`,
    shipmentId: `00000000-0000-0230-0010-${suffix}`,
  };
  const { rows } = await adminPool.query<{ tenant_number: number }>(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, $4) RETURNING tenant_number",
    [ids.shipmentId, tenantId, outletId, status],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label, package_content,
      package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only, pickup_address_id, origin_area_id
    ) VALUES ($1, $2, 'fixture-destination', 'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310',
      'Kain batik (2)', 1250, 2, 150000, false, false, 'pickup-a1', 'origin-fixture')`,
    [ids.shipmentId, tenantId],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (
      tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label
    ) VALUES
      ($1, $2, 'SENDER', 'Gerai Sintetis', '081211110000', 'Jl. Kenanga 5, Menteng, Jakarta Pusat', NULL, NULL),
      ($1, $2, 'RECIPIENT', 'Penerima Sintetis', '081299998765', 'Jl. Rahasia 9 RT 1', 'fixture-destination',
        'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310')`,
    [tenantId, ids.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label,
      weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin-fixture', 'fixture-destination', 'Menteng, Jakarta Pusat', 1250, false, 'platform_default')`,
    [ids.estimateSnapshotId, tenantId, ids.shipmentId, outletId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency, shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'REG', 'IDR', 8000, 'price', '1-2 hari', true)`,
    [ids.estimateServiceId, tenantId, ids.estimateSnapshotId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier, credential_source, provider_account_key,
      idempotency_key, status, submission_attempted_at, completed_at
    ) VALUES ($1, $2, $3, 'pickup-a1', 'JNE', 'platform_default', $4, $5, 'COMPLETED', now(), now())`,
    [ids.batchId, tenantId, outletId, "b".repeat(64), `23000${sequence}`.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service,
      destination_area_id, destination_area_label, currency, shipping_amount_idr, provider_charged_shipping_idr,
      insurance_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id, is_paid, cnote_no,
      safe_response_code, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'REG', 'fixture-destination', 'Menteng, Jakarta Pusat', 'IDR',
      8000, 7000, 0, false, NULL, $7, $8, $9, $10, 'FIXTURE_ACCEPTED', now())`,
    [
      ids.providerOrderSnapshotId, tenantId, ids.batchId, ids.shipmentId, ids.estimateSnapshotId, ids.estimateServiceId,
      status, `t230-order-${sequence}`, status === "ISSUED", status === "ISSUED" ? `JNE-T230-${String(sequence).padStart(6, "0")}` : null,
    ],
  );
  return { ...ids, tenantNumber: rows[0].tenant_number };
}

async function invoiceCounts() {
  const { rows } = await adminPool.query<{ shipment_id: string; n: number }>(
    "SELECT shipment_id, count(*)::int AS n FROM shipment_invoices WHERE tenant_id = $1 GROUP BY shipment_id",
    [tenantId],
  );
  return Object.fromEntries(rows.map((row) => [row.shipment_id, row.n]));
}

async function clean() {
  for (const table of [
    "shipment_invoices", "print_events", "provider_order_snapshots", "provider_batches", "shipment_cod_totals",
    "shipment_estimate_services", "shipment_estimate_snapshots", "shipment_parties", "shipment_drafts", "shipments",
    "outlet_pickup_points", "outlets", "memberships",
  ]) {
    await adminPool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  }
  await adminPool.query("DELETE FROM tenant_shipment_counters WHERE tenant_id = $1", [tenantId]);
  await adminPool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  await adminPool.query("DELETE FROM users WHERE id = $1", [operatorId]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await clean();
  await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, 'T230 Operator', 't230-operator@example.test')", [operatorId]);
  await adminPool.query("INSERT INTO tenants (id, name, status, contact_whatsapp) VALUES ($1, 'Gerai Batch', 'ACTIVE', '081234567890')", [tenantId]);
  await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR')", [tenantId, operatorId]);
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_pickup_address_label, default_origin_area_id, default_origin_area_label)
     VALUES ($1, $2, 'Outlet Batch', 'pickup-a1', 'Gudang, Jl. Kenanga 5, Menteng, Jakarta Pusat', 'origin-fixture', 'Menteng, Jakarta Pusat')`,
    [outletId, tenantId],
  );
  await adminPool.query(
    `INSERT INTO outlet_pickup_points (tenant_id, outlet_id, pickup_address_id, pickup_address_label, origin_area_id, origin_area_label, is_default)
     VALUES ($1, $2, 'pickup-a1', 'Gudang, Jl. Kenanga 5, Menteng, Jakarta Pusat', 'origin-fixture', 'Menteng, Jakarta Pusat', true)`,
    [tenantId, outletId],
  );
});

afterAll(async () => {
  await clean();
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("batch print view", () => {
  it("issues exactly one invoice per shipment on repeat and skips a shipment without a resi", async () => {
    const first = await seedShipment(1);
    const second = await seedShipment(2);
    const unpaid = await seedShipment(3, "AWAITING_UPSTREAM_PAYMENT");
    const numbers = [first.tenantNumber, unpaid.tenantNumber, second.tenantNumber, 99_999];
    const open = () => withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
      loadBatchPrint(tx, context, { content: "keduanya", numbers }));

    const once = await open();
    const twice = await open();
    const [a, b, c] = await Promise.all([open(), open(), open()]);

    expect(once.map((item) => [item.tenantNumber, item.kind])).toEqual([
      [first.tenantNumber, "ready"], [unpaid.tenantNumber, "skipped"], [second.tenantNumber, "ready"], [99_999, "skipped"],
    ]);
    expect(once[1]).toMatchObject({ reason: "NOT_ISSUED" });
    expect(once[3]).toMatchObject({ reason: "NOT_FOUND" });
    const invoiceIds = (items: typeof once) => items.flatMap((item) => (item.kind === "ready" && item.invoice ? [item.invoice.id] : []));
    expect(invoiceIds(once)).toHaveLength(2);
    for (const again of [twice, a, b, c]) expect(invoiceIds(again)).toEqual(invoiceIds(once));
    expect(await invoiceCounts()).toEqual({ [first.shipmentId]: 1, [second.shipmentId]: 1 });
  });

  it("issues nothing when only labels are printed", async () => {
    const shipment = await seedShipment(4);
    const items = await withTenantContext(appDb, operatorId, tenantId, (tx, context) =>
      loadBatchPrint(tx, context, { content: "label", numbers: [shipment.tenantNumber] }));
    expect(items).toMatchObject([{ invoice: null, kind: "ready" }]);
    expect(await invoiceCounts()).toEqual({});
  });
});
