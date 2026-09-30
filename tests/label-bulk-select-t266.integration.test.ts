// T-266 (critique 2026-09-29 #4, adapt): "Pilih semua belum dicetak" is a Server Action that
// returns the unprinted resi of the caller's own gerai for the list's filter, across pages. The
// action runs here for real against the isolated test database (runtime role, RLS on); only the
// session lookup is replaced. Fixtures live in their own tenants and are removed by tenant.
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { selectUnprintedLabels } = await import("@/app/app/label/cetak/actions");
const { MAX_BATCH_SHIPMENTS } = await import("@/app/app/label/cetak/batch-query");

const adminPool = new Pool({ connectionString: adminDatabaseUrl });

const tenants = {
  a: { id: "00000000-0000-0266-0000-0000000000a1", outlets: ["00000000-0000-0266-0001-0000000000a1", "00000000-0000-0266-0001-0000000000a2"], user: "t266-operator-a" },
  b: { id: "00000000-0000-0266-0000-0000000000b1", outlets: ["00000000-0000-0266-0001-0000000000b1"], user: "t266-operator-b" },
};
type TenantKey = keyof typeof tenants;
let sequence = 0;

async function seedShipment(key: TenantKey, options: { outlet?: number; printed?: boolean; status?: "ISSUED" | "AWAITING_UPSTREAM_PAYMENT"; resolvedAt?: string } = {}) {
  const tenant = tenants[key];
  const outletId = tenant.outlets[options.outlet ?? 0];
  const status = options.status ?? "ISSUED";
  sequence += 1;
  const suffix = `${key === "a" ? "a" : "b"}${sequence.toString(16).padStart(11, "0")}`;
  const ids = {
    batchId: `00000000-0000-0266-0013-${suffix}`,
    estimateServiceId: `00000000-0000-0266-0012-${suffix}`,
    estimateSnapshotId: `00000000-0000-0266-0011-${suffix}`,
    providerOrderSnapshotId: `00000000-0000-0266-0014-${suffix}`,
    shipmentId: `00000000-0000-0266-0010-${suffix}`,
  };
  const awb = `JNE266${key.toUpperCase()}${String(sequence).padStart(5, "0")}`;
  const { rows } = await adminPool.query<{ tenant_number: number }>(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, $4) RETURNING tenant_number",
    [ids.shipmentId, tenant.id, outletId, status],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label, package_content,
      package_weight_grams, package_quantity, declared_value_idr, is_cod, cod_shipping_only, pickup_address_id, origin_area_id
    ) VALUES ($1, $2, 'fixture-destination', 'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310',
      'Kain', 1000, 1, 100000, false, false, 'pickup-266', 'origin-fixture')`,
    [ids.shipmentId, tenant.id],
  );
  await adminPool.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'RECIPIENT', 'Penerima Sintetis', '081299990266', 'Jl. Sintetis 1', 'fixture-destination',
       'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310')`,
    [tenant.id, ids.shipmentId],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_snapshots (
      id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label,
      weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin-fixture', 'fixture-destination', 'Menteng, Jakarta Pusat', 1000, false, 'platform_default')`,
    [ids.estimateSnapshotId, tenant.id, ids.shipmentId, outletId],
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
    ) VALUES ($1, $2, $3, 'pickup-266', 'JNE', 'platform_default', $4, $5, 'COMPLETED', now(), now())`,
    [ids.batchId, tenant.id, outletId, "c".repeat(64), `266${sequence}`.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id, position, provider_service,
      destination_area_id, destination_area_label, currency, shipping_amount_idr, provider_charged_shipping_idr,
      insurance_amount_idr, is_cod, provider_cod_amount_idr, status, provider_order_id, is_paid, cnote_no,
      safe_response_code, resolved_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'REG', 'fixture-destination', 'Menteng, Jakarta Pusat', 'IDR',
      8000, 7000, 0, false, NULL, $7, $8, $9, $10, 'FIXTURE_ACCEPTED', COALESCE($11::timestamptz, now() - ($12 || ' seconds')::interval))`,
    [
      ids.providerOrderSnapshotId, tenant.id, ids.batchId, ids.shipmentId, ids.estimateSnapshotId, ids.estimateServiceId,
      status, `t266-order-${sequence}`, status === "ISSUED", status === "ISSUED" ? awb : null, options.resolvedAt ?? null, String(1000 - sequence),
    ],
  );
  if (options.printed) {
    await adminPool.query(
      `INSERT INTO print_events (tenant_id, shipment_id, provider_order_snapshot_id, sequence, outcome, awb_snapshot, actor_user_id, actor_role)
       VALUES ($1, $2, $3, 1, 'PRINTED', $4, $5, 'OPERATOR')`,
      [tenant.id, ids.shipmentId, ids.providerOrderSnapshotId, awb, tenant.user],
    );
  }
  return { awb, number: rows[0].tenant_number };
}

async function clean() {
  for (const tenant of Object.values(tenants)) {
    for (const table of [
      "shipment_invoices", "print_events", "provider_order_snapshots", "provider_batches", "shipment_cod_totals",
      "shipment_estimate_services", "shipment_estimate_snapshots", "shipment_parties", "shipment_drafts", "shipments",
      "outlet_pickup_points", "outlets", "memberships",
    ]) {
      await adminPool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenant.id]);
    }
    await adminPool.query("DELETE FROM tenant_shipment_counters WHERE tenant_id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM audit_events WHERE tenant_id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM tenants WHERE id = $1", [tenant.id]);
    await adminPool.query("DELETE FROM users WHERE id = $1", [tenant.user]);
  }
}

function as(key: TenantKey, tenantKey: TenantKey = key) {
  session.principal = { ...session.principal, tenantId: tenants[tenantKey].id, userId: tenants[key].user };
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await clean();
  sequence = 0;
  for (const [key, tenant] of Object.entries(tenants)) {
    await adminPool.query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)", [tenant.user, `T266 ${key}`, `${tenant.user}@example.test`]);
    await adminPool.query("INSERT INTO tenants (id, name, status, contact_whatsapp) VALUES ($1, $2, 'ACTIVE', '081234567890')", [tenant.id, `Gerai T266 ${key}`]);
    await adminPool.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR')", [tenant.id, tenant.user]);
    for (const [index, outletId] of tenant.outlets.entries()) {
      await adminPool.query(
        `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_pickup_address_label, default_origin_area_id, default_origin_area_label)
         VALUES ($1, $2, $3, 'pickup-266', 'Gudang, Menteng', 'origin-fixture', 'Menteng, Jakarta Pusat')`,
        [outletId, tenant.id, `Outlet ${key}${index}`],
      );
    }
  }
});

afterAll(async () => {
  await clean();
  await adminPool.end();
});

describe("selectUnprintedLabels (Pilih semua belum dicetak)", () => {
  it("returns the caller's unprinted resi across outlets, never printed, unpaid or another gerai's", async () => {
    const first = await seedShipment("a");
    const otherOutlet = await seedShipment("a", { outlet: 1 });
    const third = await seedShipment("a");
    await seedShipment("a", { printed: true });
    await seedShipment("a", { status: "AWAITING_UPSTREAM_PAYMENT" });
    const foreign = await seedShipment("b");

    as("a");
    // The URL's print state is ignored: the action always selects "belum".
    const result = await selectUnprintedLabels({ cetak: "sudah" });
    expect(result.total).toBe(3);
    // Newest first, as the list orders them.
    expect(result.numbers).toEqual([third.number, otherOutlet.number, first.number]);

    as("b");
    expect(await selectUnprintedLabels({})).toEqual({ numbers: [foreign.number], total: 1 });
  });

  it("applies the list's filter: resi suffix and issued period", async () => {
    const kept = await seedShipment("a");
    await seedShipment("a");
    await seedShipment("a", { resolvedAt: "2025-01-15T03:00:00Z" });

    as("a");
    expect(await selectUnprintedLabels({ q: kept.awb.slice(-6) })).toEqual({ numbers: [kept.number], total: 1 });
    // A resi suffix outside the list's pattern lists nothing, as on the page.
    expect(await selectUnprintedLabels({ q: "x" })).toEqual({ numbers: [], total: 0 });
    // Default period (30 days) leaves last year's resi out; a custom range brings only it back.
    expect((await selectUnprintedLabels({})).total).toBe(2);
    const lastYear = await selectUnprintedLabels({ dari: "2025-01-01", khusus: "1", rentang: "kustom", sampai: "2025-01-31", tz: "Asia/Jakarta" });
    expect(lastYear.total).toBe(1);
    expect(lastYear.numbers).toHaveLength(1);
  });

  it("refuses a session whose tenant is not the user's gerai (no cross-tenant read)", async () => {
    await seedShipment("a");
    as("b", "a");
    await expect(selectUnprintedLabels({})).rejects.toThrow(/not authorized/i);
  });

  it(`caps the selection at the batch maximum (${50}) and still reports the true count`, async () => {
    for (let index = 0; index < MAX_BATCH_SHIPMENTS + 3; index += 1) await seedShipment("a");
    as("a");
    const result = await selectUnprintedLabels({});
    expect(result.total).toBe(MAX_BATCH_SHIPMENTS + 3);
    expect(result.numbers).toHaveLength(MAX_BATCH_SHIPMENTS);
    expect(new Set(result.numbers).size).toBe(MAX_BATCH_SHIPMENTS);
  }, 60_000);
});
