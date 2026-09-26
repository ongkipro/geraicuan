// T-221 / DATA-14 (PR-76–PR-78): one immutable invoice per issued shipment.
// Fixtures live in their own tenants and are removed by tenant, never by
// TRUNCATE, so this file leaves every other test's rows alone.
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  courierServiceName,
  issueShipmentInvoice,
  loadShipmentInvoice,
} from "@/db/shipment-invoice-repository";
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

const principal = vi.hoisted(() => ({
  current: { scope: "tenant", userId: "", tenantId: "", role: "OPERATOR", tenantStatus: "ACTIVE" },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => principal.current),
}));

// The action runs for real against the runtime role, not a stubbed repository.
vi.mock("@/db/client", async () => {
  const { drizzle: connect } = await import("drizzle-orm/node-postgres");
  const { Pool: PgPool } = await import("pg");
  const tables = await import("@/db/schema");
  const pool = new PgPool({ connectionString: process.env.APP_DATABASE_URL });
  return { db: connect({ client: pool, schema: tables }), pool };
});

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0221-0000-0000000000a1";
const tenantB = "00000000-0000-0221-0000-0000000000b1";
const outletA = "00000000-0000-0221-0001-0000000000a1";
const outletB = "00000000-0000-0221-0001-0000000000b1";
const adminA = "t221-admin-a";
const operatorA = "t221-operator-a";
const userB = "t221-user-b";

function fixtureIds(sequence: number) {
  const suffix = sequence.toString(16).padStart(12, "0");
  return {
    shipmentId: `00000000-0000-0221-0010-${suffix}`,
    estimateSnapshotId: `00000000-0000-0221-0011-${suffix}`,
    estimateServiceId: `00000000-0000-0221-0012-${suffix}`,
    batchId: `00000000-0000-0221-0013-${suffix}`,
    providerOrderSnapshotId: `00000000-0000-0221-0014-${suffix}`,
  };
}

async function seedShipment(input: {
  sequence: number;
  tenantId?: string;
  outletId?: string;
  status?: "ISSUED" | "AWAITING_UPSTREAM_PAYMENT";
  cod?: "COD" | "COD_SHIPPING_ONLY";
  insuranceIdr?: number | null;
}) {
  const tenantId = input.tenantId ?? tenantA;
  const outletId = input.outletId ?? outletA;
  const status = input.status ?? "ISSUED";
  const isCod = input.cod !== undefined;
  const codAmount = input.cod === "COD" ? 111721 : input.cod === "COD_SHIPPING_ONLY" ? 8277 : null;
  const ids = fixtureIds(input.sequence);
  const awb = status === "ISSUED" ? `JNE-T221-${String(input.sequence).padStart(6, "0")}` : null;

  const { rows } = await adminPool.query<{ public_reference: string; tenant_number: number }>(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES ($1, $2, $3, $4) RETURNING public_reference, tenant_number",
    [ids.shipmentId, tenantId, outletId, status],
  );
  await adminPool.query(
    `INSERT INTO shipment_drafts (
      shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity,
      declared_value_idr, is_cod, cod_shipping_only, pickup_address_id, origin_area_id
    ) VALUES (
      $1, $2, 'fixture-destination', 'Menteng, Menteng, Jakarta Pusat, DKI Jakarta, 10310',
      'Kain batik (2), Daster', 1250, 3, 150000, $3, $4, $5, 'origin-fixture'
    )`,
    [ids.shipmentId, tenantId, isCod, input.cod === "COD_SHIPPING_ONLY", `pickup-${tenantId.slice(-2)}`],
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
      id, tenant_id, shipment_id, outlet_id, origin_area_id,
      destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source
    ) VALUES ($1, $2, $3, $4, 'origin-fixture', 'fixture-destination', 'Menteng, Jakarta Pusat', 1250, $5, 'platform_default')`,
    [ids.estimateSnapshotId, tenantId, ids.shipmentId, outletId, isCod],
  );
  await adminPool.query(
    `INSERT INTO shipment_estimate_services (
      id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible
    ) VALUES ($1, $2, $3, 'REG', 'IDR', 8000, 'price', '1-2 hari', true)`,
    [ids.estimateServiceId, tenantId, ids.estimateSnapshotId],
  );
  await adminPool.query(
    `INSERT INTO provider_batches (
      id, tenant_id, outlet_id, pickup_address_id, courier,
      credential_source, provider_account_key, idempotency_key, status,
      submission_attempted_at, completed_at
    ) VALUES ($1, $2, $3, 'fixture-pickup', 'JNE', 'platform_default', $4, $5, 'COMPLETED', now(), now())`,
    [ids.batchId, tenantId, outletId, "a".repeat(64), `22100${input.sequence}`.padStart(64, "0")],
  );
  await adminPool.query(
    `INSERT INTO provider_order_snapshots (
      id, tenant_id, batch_id, shipment_id, estimate_snapshot_id,
      estimate_service_id, position, provider_service, destination_area_id, destination_area_label, currency,
      shipping_amount_idr, provider_charged_shipping_idr, insurance_amount_idr, is_cod,
      provider_cod_amount_idr, status, provider_order_id, is_paid,
      cnote_no, safe_response_code, resolved_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 0, 'REG', 'fixture-destination', 'Menteng, Jakarta Pusat', 'IDR',
      8000, 7000, $7, $8, $9, $10, $11, $12, $13, 'FIXTURE_ACCEPTED', now()
    )`,
    [
      ids.providerOrderSnapshotId,
      tenantId,
      ids.batchId,
      ids.shipmentId,
      ids.estimateSnapshotId,
      ids.estimateServiceId,
      input.insuranceIdr === undefined ? 1500 : input.insuranceIdr,
      isCod,
      codAmount,
      status,
      `t221-order-${input.sequence}`,
      status === "ISSUED",
      awb,
    ],
  );

  return { ...ids, awb, publicReference: rows[0].public_reference, tenantNumber: rows[0].tenant_number };
}

function asUser<T>(userId: string, tenantId: string, work: Parameters<typeof withTenantContext<T>>[3]) {
  return withTenantContext(appDb, userId, tenantId, work);
}

async function invoiceCount(shipmentId: string) {
  const { rows } = await adminPool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM shipment_invoices WHERE shipment_id = $1",
    [shipmentId],
  );
  return rows[0].n;
}

async function clean() {
  const tenantIds = [tenantA, tenantB];
  for (const table of [
    "audit_events",
    "shipment_invoices",
    "print_events",
    "provider_order_snapshots",
    "provider_batches",
    "shipment_cod_totals",
    "shipment_estimate_services",
    "shipment_estimate_snapshots",
    "shipment_parties",
    "shipment_drafts",
    "shipments",
    "outlet_pickup_points",
    "outlets",
    "memberships",
  ]) {
    await adminPool.query(`DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`, [tenantIds]);
  }
  await adminPool.query("DELETE FROM tenant_shipment_counters WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [[adminA, operatorA, userB]]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await clean();
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'T221 Admin A', 't221-admin-a@example.test'),
      ($2, 'T221 Operator A', 't221-operator-a@example.test'),
      ($3, 'T221 User B', 't221-user-b@example.test')`,
    [adminA, operatorA, userB],
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status, contact_whatsapp) VALUES
      ($1, 'Gerai Nota A', 'ACTIVE', '081234567890'), ($2, 'Gerai Nota B', 'ACTIVE', NULL)`,
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'OPERATOR')`,
    [tenantA, adminA, operatorA, tenantB, userB],
  );
  await adminPool.query(
    `INSERT INTO outlets (
      id, tenant_id, name, default_pickup_address_id, default_pickup_address_label,
      default_origin_area_id, default_origin_area_label
    ) VALUES
      ($1, $2, 'Outlet Nota A', 'pickup-a1', 'Gudang Mengantar, Jl. Kenanga 5, Menteng, Jakarta Pusat', 'origin-fixture', 'Menteng, Jakarta Pusat'),
      ($3, $4, 'Outlet Nota B', 'pickup-b1', 'Gudang B, Jl. Mawar 1, Coblong, Bandung', 'origin-fixture', 'Coblong, Bandung')`,
    [outletA, tenantA, outletB, tenantB],
  );
  await adminPool.query(
    `INSERT INTO outlet_pickup_points (
      tenant_id, outlet_id, pickup_address_id, pickup_address_label, origin_area_id, origin_area_label, is_default
    ) VALUES
      ($1, $2, 'pickup-a1', 'Gudang Mengantar, Jl. Kenanga 5, Menteng, Jakarta Pusat', 'origin-fixture', 'Menteng, Jakarta Pusat', true),
      ($3, $4, 'pickup-b1', 'Gudang B, Jl. Mawar 1, Coblong, Bandung', 'origin-fixture', 'Coblong, Bandung', true)`,
    [tenantA, outletA, tenantB, outletB],
  );
});

afterAll(async () => {
  await clean();
  const client = await import("@/db/client") as unknown as { pool: Pool };
  await Promise.all([adminPool.end(), appPool.end(), client.pool.end()]);
});

describe("shipment invoice issuance", () => {
  it("issues one snapshot invoice and returns the same one on a second call", async () => {
    const fixture = await seedShipment({ sequence: 1 });

    const first = await asUser(operatorA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, fixture.shipmentId));
    const second = await asUser(adminA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, fixture.shipmentId));

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.invoice).toEqual(first.invoice);
    expect(first.invoice).toMatchObject({
      invoiceNumber: `INV-${fixture.publicReference}`,
      issuedByUserId: operatorA,
      templateVersion: 1,
      // The confirmed provider `price`, never the gerai's cost (7 000).
      shippingChargeIdr: 8000,
      insuranceIdr: 1500,
      totalIdr: 9500,
      collectionMode: "NON_COD",
      courierCollectionIdr: null,
      declaredValueIdr: 150000,
      document: {
        gerai: { name: "Gerai Nota A", whatsapp: "081234567890", address: "Jl. Kenanga 5, Menteng, Jakarta Pusat" },
        resi: fixture.awb,
        courierService: "JNE REG",
        sender: { name: "Gerai Sintetis", phone: "081211110000", city: "Jl. Kenanga 5, Menteng, Jakarta Pusat" },
        recipient: { name: "Penerima Sintetis", city: "Menteng, Jakarta Pusat" },
        items: [{ name: "Kain batik", quantity: 2 }, { name: "Daster", quantity: 1 }],
        weightGrams: 1250,
        deliveryEstimate: "1–2 hari",
      },
    });
    // Privacy minimum: the recipient's street address and phone are not on the nota.
    expect(JSON.stringify(first.invoice.document)).not.toMatch(/Rahasia|081299998765/);
    expect(await invoiceCount(fixture.shipmentId)).toBe(1);
  });

  it("records the courier COD instruction apart from the total", async () => {
    const cod = await seedShipment({ sequence: 2, cod: "COD", insuranceIdr: null });
    const codOngkir = await seedShipment({ sequence: 3, cod: "COD_SHIPPING_ONLY", insuranceIdr: null });

    const [full, shippingOnly] = await asUser(operatorA, tenantA, async (tx, context) => [
      await issueShipmentInvoice(tx, context, cod.shipmentId),
      await issueShipmentInvoice(tx, context, codOngkir.shipmentId),
    ]);

    expect(full).toMatchObject({
      ok: true,
      invoice: { collectionMode: "COD", courierCollectionIdr: 111721, shippingChargeIdr: 8000, insuranceIdr: 0, totalIdr: 8000 },
    });
    expect(shippingOnly).toMatchObject({
      ok: true,
      // COD Ongkir: the charge the courier collects is the shipping charge on the nota (audit 2026-09-26).
      invoice: { collectionMode: "COD_SHIPPING_ONLY", courierCollectionIdr: 8277, shippingChargeIdr: 8277, insuranceIdr: 0, totalIdr: 8277 },
    });
  });

  it("creates exactly one row under five concurrent requests", async () => {
    const fixture = await seedShipment({ sequence: 4 });

    const results = await Promise.all(Array.from({ length: 5 }, (_, index) =>
      asUser(index % 2 === 0 ? operatorA : adminA, tenantA, (tx, context) =>
        issueShipmentInvoice(tx, context, fixture.shipmentId))));

    const ids = new Set(results.map((result) => (result.ok ? result.invoice.id : result.code)));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(ids.size).toBe(1);
    expect(await invoiceCount(fixture.shipmentId)).toBe(1);
  });

  it("refuses a shipment without a resi and an unknown shipment", async () => {
    const unpaid = await seedShipment({ sequence: 5, status: "AWAITING_UPSTREAM_PAYMENT" });

    const refused = await asUser(operatorA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, unpaid.shipmentId));
    const missing = await asUser(operatorA, tenantA, (tx, context) =>
      issueShipmentInvoice(tx, context, "00000000-0000-0221-0010-00000000ffff"));

    expect(refused).toEqual({ ok: false, code: "NOT_ISSUED" });
    expect(missing).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await invoiceCount(unpaid.shipmentId)).toBe(0);
  });

  it("keeps another tenant from reading or issuing the invoice", async () => {
    const fixture = await seedShipment({ sequence: 6 });
    await asUser(operatorA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, fixture.shipmentId));

    const [visible, loaded, issued] = await asUser(userB, tenantB, async (tx, context) => [
      // No tenant predicate: row-level security alone must hide it.
      await tx.select({ id: schema.shipmentInvoices.id }).from(schema.shipmentInvoices),
      await loadShipmentInvoice(tx, context, fixture.shipmentId),
      await issueShipmentInvoice(tx, context, fixture.shipmentId),
    ] as const);

    expect(visible).toEqual([]);
    expect(loaded).toBeNull();
    expect(issued).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await invoiceCount(fixture.shipmentId)).toBe(1);
  });

  it("refuses a direct insert whose snapshot has no resi, even from the runtime role", async () => {
    const unpaid = await seedShipment({ sequence: 7, status: "AWAITING_UPSTREAM_PAYMENT" });

    const attempt = asUser(operatorA, tenantA, (tx) => tx.execute(sql`
      INSERT INTO shipment_invoices (
        tenant_id, shipment_id, provider_order_snapshot_id, invoice_number, issued_by_user_id,
        document, shipping_charge_idr, insurance_idr, total_idr, collection_mode, declared_value_idr
      ) VALUES (
        ${tenantA}, ${unpaid.shipmentId}, ${unpaid.providerOrderSnapshotId}, ${`INV-${unpaid.publicReference}`},
        ${operatorA}, '{}'::jsonb, 8000, 0, 8000, 'NON_COD', 150000
      )`));

    await expect(attempt).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("grants the runtime role SELECT and INSERT only", async () => {
    const { rows } = await adminPool.query<Record<string, boolean>>(`
      SELECT
        has_table_privilege('geraicuan_app', 'shipment_invoices', 'SELECT') AS "select",
        has_table_privilege('geraicuan_app', 'shipment_invoices', 'INSERT') AS "insert",
        has_table_privilege('geraicuan_app', 'shipment_invoices', 'UPDATE') AS "update",
        has_table_privilege('geraicuan_app', 'shipment_invoices', 'DELETE') AS "delete",
        has_table_privilege('geraicuan_app', 'shipment_invoices', 'TRUNCATE') AS "truncate",
        has_any_column_privilege('geraicuan_app', 'shipment_invoices', 'UPDATE') AS "update_column"
    `);
    expect(rows[0]).toEqual({
      select: true,
      insert: true,
      update: false,
      delete: false,
      truncate: false,
      update_column: false,
    });

    const fixture = await seedShipment({ sequence: 8 });
    await asUser(operatorA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, fixture.shipmentId));
    for (const statement of [
      sql`UPDATE shipment_invoices SET total_idr = total_idr WHERE shipment_id = ${fixture.shipmentId}`,
      sql`DELETE FROM shipment_invoices WHERE shipment_id = ${fixture.shipmentId}`,
    ]) {
      await expect(asUser(operatorA, tenantA, (tx) => tx.execute(statement)))
        .rejects.toMatchObject({ cause: { code: "42501" } });
    }
    expect(await invoiceCount(fixture.shipmentId)).toBe(1);
  });

  it("reprints the stored snapshot after the gerai profile, parties and draft change", async () => {
    const fixture = await seedShipment({ sequence: 9 });
    const issued = await asUser(operatorA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, fixture.shipmentId));
    if (!issued.ok) throw new Error("invoice was not issued");

    await adminPool.query("UPDATE tenants SET name = 'Gerai Baru', contact_whatsapp = '089999999999' WHERE id = $1", [tenantA]);
    await adminPool.query("UPDATE outlet_pickup_points SET pickup_address_label = 'X, Jl. Baru 1, Bandung' WHERE tenant_id = $1", [tenantA]);
    await adminPool.query("UPDATE shipment_parties SET name = 'Nama Baru' WHERE shipment_id = $1", [fixture.shipmentId]);
    await adminPool.query("UPDATE shipment_drafts SET package_content = 'Lain', declared_value_idr = 1 WHERE shipment_id = $1", [fixture.shipmentId]);

    const reprint = await asUser(adminA, tenantA, (tx, context) => loadShipmentInvoice(tx, context, fixture.shipmentId));
    const again = await asUser(adminA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, fixture.shipmentId));

    expect(reprint).toEqual(issued.invoice);
    expect(again).toEqual(issued);
  });

  it("rejects a row whose money does not add up or whose collection mode is inconsistent", async () => {
    const fixture = await seedShipment({ sequence: 10 });
    const insert = (overrides: { total?: number; mode?: string; collection?: number | null; document?: string }) =>
      adminPool.query(
        `INSERT INTO shipment_invoices (
          tenant_id, shipment_id, provider_order_snapshot_id, invoice_number, issued_by_user_id,
          document, shipping_charge_idr, insurance_idr, total_idr, collection_mode, courier_collection_idr, declared_value_idr
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 8000, 1500, $7, $8, $9, 150000)`,
        [
          tenantA,
          fixture.shipmentId,
          fixture.providerOrderSnapshotId,
          `INV-${fixture.publicReference}`,
          operatorA,
          overrides.document ?? "{}",
          overrides.total ?? 9500,
          overrides.mode ?? "NON_COD",
          overrides.collection ?? null,
        ],
      );

    await expect(insert({ total: 9000 })).rejects.toMatchObject({ constraint: "shipment_invoices_total_is_sum" });
    await expect(insert({ collection: 5000 })).rejects.toMatchObject({ constraint: "shipment_invoices_courier_collection_pair" });
    await expect(insert({ mode: "COD" })).rejects.toMatchObject({ constraint: "shipment_invoices_courier_collection_pair" });
    await expect(insert({ document: "[]" })).rejects.toMatchObject({ constraint: "shipment_invoices_document_object" });
    expect(await invoiceCount(fixture.shipmentId)).toBe(0);
  });
});

describe("issueShipmentInvoice action", () => {
  it("issues by shipment number for either role and hides other tenants' numbers", async () => {
    const { issueShipmentInvoice: issueAction } = await import("@/app/app/invoice/actions");
    const own = await seedShipment({ sequence: 11 });
    await seedShipment({ sequence: 12, tenantId: tenantB, outletId: outletB });
    // Tenant B's second number exists only in B, so inside tenant A it is absent.
    const foreign = await seedShipment({ sequence: 13, tenantId: tenantB, outletId: outletB });

    principal.current = { scope: "tenant", userId: operatorA, tenantId: tenantA, role: "OPERATOR", tenantStatus: "ACTIVE" };
    const byOperator = await issueAction(String(own.tenantNumber));
    principal.current = { ...principal.current, userId: adminA, role: "TENANT_ADMIN" };
    const byAdmin = await issueAction(own.publicReference);

    expect(byOperator.ok).toBe(true);
    expect(byAdmin).toEqual(byOperator);
    if (byOperator.ok) expect(byOperator.invoice.invoiceNumber).toBe(`INV-${own.publicReference}`);

    expect(foreign.tenantNumber).not.toBe(own.tenantNumber);
    expect(await issueAction(String(foreign.tenantNumber))).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await issueAction(foreign.shipmentId)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await issueAction("bukan-nomor")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await invoiceCount(foreign.shipmentId)).toBe(0);
  });
});

describe("invoice courier/service line", () => {
  it("prints the courier's display name once", () => {
    expect(courierServiceName("lion", "lion")).toBe("Lion Parcel");
    expect(courierServiceName("SiCepat", "SiCepat")).toBe("SiCepat");
    expect(courierServiceName("JNE", "REG")).toBe("JNE REG");
  });
});

// T-233: the gerai WhatsApp on the nota is the owner's to change, through one definer
// function limited to an active Tenant Admin of the caller's own tenant.
describe("gerai WhatsApp (T-233)", () => {
  const whatsappOf = async (tenantId: string) =>
    (await adminPool.query<{ w: string | null }>("SELECT contact_whatsapp AS w FROM tenants WHERE id = $1", [tenantId])).rows[0].w;

  it("lets the Tenant Admin change their own gerai's WhatsApp, normalised and audited", async () => {
    const { saveTenantContact } = await import("@/app/app/pengaturan/actions");
    principal.current = { scope: "tenant", userId: adminA, tenantId: tenantA, role: "TENANT_ADMIN", tenantStatus: "ACTIVE" };

    const saved = await saveTenantContact({}, formWith({ whatsapp: "+62 813-2222-3333" }));

    expect(saved).toMatchObject({ savedWhatsapp: "081322223333" });
    expect(await whatsappOf(tenantA)).toBe("081322223333");
    expect(await whatsappOf(tenantB)).toBeNull();
    const { rows } = await adminPool.query(
      "SELECT actor_id, actor_role, target_id, metadata FROM audit_events WHERE tenant_id = $1 AND action = 'TENANT_CONTACT_UPDATED'",
      [tenantA],
    );
    expect(rows).toEqual([{ actor_id: adminA, actor_role: "TENANT_MEMBER", target_id: tenantA, metadata: { field: "contact_whatsapp", hadPrevious: true } }]);

    // Saving the same number again changes nothing and audits nothing.
    await saveTenantContact({}, formWith({ whatsapp: "081322223333" }));
    const { rows: again } = await adminPool.query("SELECT count(*)::int AS n FROM audit_events WHERE tenant_id = $1", [tenantA]);
    expect(again[0].n).toBe(1);
  });

  it("refuses an Operator in the action and in the database", async () => {
    const { saveTenantContact } = await import("@/app/app/pengaturan/actions");
    principal.current = { scope: "tenant", userId: operatorA, tenantId: tenantA, role: "OPERATOR", tenantStatus: "ACTIVE" };
    await expect(saveTenantContact({}, formWith({ whatsapp: "081322223333" }))).rejects.toThrow("REDIRECT:/app");

    // Called directly, the function refuses the Operator too.
    await expect(asUser(operatorA, tenantA, (tx) => tx.execute(sql`SELECT public.set_tenant_contact_whatsapp('081322223333')`)))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    expect(await whatsappOf(tenantA)).toBe("081234567890");
  });

  it("cannot reach another tenant: the function writes only the context tenant, and no direct UPDATE path exists", async () => {
    // Even with the tenant setting forged to B inside A's transaction, the function
    // checks the caller's membership in that tenant and refuses.
    await expect(asUser(adminA, tenantA, async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantB}, true)`);
      return tx.execute(sql`SELECT public.set_tenant_contact_whatsapp('081377778888')`);
    })).rejects.toMatchObject({ cause: { code: "42501" } });
    expect(await whatsappOf(tenantB)).toBeNull();
    expect(await whatsappOf(tenantA)).toBe("081234567890");
    // userB is only an Operator of B; a tenant admin elsewhere is nothing in B.
    await expect(asUser(userB, tenantB, (tx) => tx.execute(sql`SELECT public.set_tenant_contact_whatsapp('081377778888')`)))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    // The runtime role has no UPDATE on the column and cannot forge the audit action.
    await expect(asUser(adminA, tenantA, (tx) => tx.execute(sql`UPDATE tenants SET contact_whatsapp = '081311112222' WHERE id = ${tenantB}`)))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(asUser(adminA, tenantA, (tx) => tx.execute(sql`INSERT INTO audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome)
      VALUES (${adminA}, 'TENANT_MEMBER', ${tenantA}, 'TENANT_CONTACT_UPDATED', 'TENANT', ${tenantA}, 'SUCCESS')`)))
      .rejects.toMatchObject({ cause: { code: "42501" } });
    expect(await whatsappOf(tenantB)).toBeNull();
  });

  it("rejects an invalid number in the action and in the database", async () => {
    const { saveTenantContact } = await import("@/app/app/pengaturan/actions");
    principal.current = { scope: "tenant", userId: adminA, tenantId: tenantA, role: "TENANT_ADMIN", tenantStatus: "ACTIVE" };
    for (const whatsapp of ["", "0812", "+1 415 555 0100", "0812abc45678", "01234567890"]) {
      const result = await saveTenantContact({}, formWith({ whatsapp }));
      expect(result.error, whatsapp).toBeTruthy();
      expect(result.savedWhatsapp).toBeUndefined();
    }
    await expect(asUser(adminA, tenantA, (tx) => tx.execute(sql`SELECT public.set_tenant_contact_whatsapp('+6281322223333')`)))
      .rejects.toMatchObject({ cause: { code: "22023" } });
    expect(await whatsappOf(tenantA)).toBe("081234567890");
  });

  it("keeps the old WhatsApp on invoices issued before and prints the new one on later invoices", async () => {
    const before = await seedShipment({ sequence: 21 });
    const after = await seedShipment({ sequence: 22 });
    const first = await asUser(operatorA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, before.shipmentId));

    await asUser(adminA, tenantA, (tx) => tx.execute(sql`SELECT public.set_tenant_contact_whatsapp('081377778888')`));

    const reprint = await asUser(operatorA, tenantA, (tx, context) => loadShipmentInvoice(tx, context, before.shipmentId));
    const later = await asUser(operatorA, tenantA, (tx, context) => issueShipmentInvoice(tx, context, after.shipmentId));
    expect(first.ok && first.invoice.document.gerai.whatsapp).toBe("081234567890");
    expect(reprint?.document.gerai.whatsapp).toBe("081234567890");
    expect(later.ok && later.invoice.document.gerai.whatsapp).toBe("081377778888");
  });
});

function formWith(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}
