import { eq } from "drizzle-orm";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * T-241: per-tenant contact numbers (`/app/kontak/<peran>/<n>`), the legacy UUID redirect, the
 * kategori CHECK and the attribution of GeraiCUAN shipments to a contact (spec 05 DATA contact
 * attribution; spec 19 CON-SHP-*). Isolated database only; no Mengantar call.
 */
const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) throw new Error("Integration database URLs are required.");
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test" || new URL(adminDatabaseUrl).port === "55461") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const state = vi.hoisted(() => ({
  principal: { role: "OPERATOR" as "OPERATOR" | "TENANT_ADMIN", scope: "tenant" as const, tenantId: "", userId: "" },
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  permanentRedirect: (href: string) => {
    throw new Error(`PERMANENT_REDIRECT:${href}`);
  },
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
  usePathname: () => "/app/kontak/pengirim",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/db/client", async () => {
  const { drizzle: connect } = await import("drizzle-orm/node-postgres");
  const { Pool: PgPool } = await import("pg");
  const dbSchema = await import("@/db/schema");
  return { db: connect({ client: new PgPool({ connectionString: process.env.APP_DATABASE_URL }), schema: dbSchema }) };
});
vi.mock("@/app/app/kontak/contact-page-guard", () => ({ requireContactPagePrincipal: async () => state.principal }));
vi.mock("@/app/app/kontak/[contactId]/actions", () => ({
  addContactAddressAction: vi.fn(),
  archiveContactAction: vi.fn(),
  setPrimaryContactAddressAction: vi.fn(),
  updateContactAction: vi.fn(),
  updateContactAddressAction: vi.fn(),
}));
vi.mock("@/app/app/location-actions", () => ({ searchMengantarDestinationAreas: vi.fn() }));

const { withTenantContext } = await import("@/db/tenant-context");
const {
  archiveContact,
  createContact,
  getContactByNumber,
  listContactAddresses,
  listContactDirectory,
  setPrimaryContactAddress,
  updateContact,
} = await import("@/db/contact-repository");
const { loadContactShipmentHistory, loadContactShipmentSummary } = await import("@/db/contact-shipment-repository");
const { default: LegacyContactDetailPage } = await import("@/app/app/kontak/[contactId]/page");
const { ContactDetail } = await import("@/app/app/kontak/contact-detail");

const admin = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-4000-8000-000000024101";
const tenantB = "00000000-0000-4000-8000-000000024102";
const outletA = "00000000-0000-4000-8000-000000024111";
const outletB = "00000000-0000-4000-8000-000000024112";
const adminA = "t241-admin-a";
const operatorA = "t241-operator-a";
const adminB = "t241-admin-b";

const base = {
  address: "Jl. Kontak 241",
  addressLabel: "Gudang",
  destinationAreaId: "t241-area",
  destinationAreaLabel: "Citarum, Bandung Wetan, Kota Bandung, Jawa Barat, 40115",
  isRecipient: false,
  isSender: true,
  name: "Gerai Satu",
  phone: "081224100001",
};

const shipmentId = (sequence: number) => `00000000-0000-4000-8241-${String(sequence).padStart(12, "0")}`;

async function clean() {
  for (const table of [
    "provider_order_snapshots",
    "provider_batches",
    "shipment_cod_totals",
    "shipment_estimate_services",
    "shipment_estimate_snapshots",
    "shipment_parties",
    "shipment_drafts",
    "shipments",
    "contact_addresses",
    "contacts",
    "outlets",
    "memberships",
  ]) {
    await admin.query(`DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`, [[tenantA, tenantB]]);
  }
  await admin.query("DELETE FROM tenant_contact_counters WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  await admin.query("DELETE FROM tenant_shipment_counters WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  await admin.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantB]]);
  await admin.query("DELETE FROM users WHERE id = ANY($1::text[])", [[adminA, operatorA, adminB]]);
}

/** A shipment whose `role` party carries `phone`; COD ones are issued with a COD total. */
async function seedShipment(input: {
  cod?: { amountIdr: number; issued: boolean };
  createdAt: string;
  phone: string;
  role: "SENDER" | "RECIPIENT";
  sequence: number;
  status: (typeof schema.shipmentStatuses)[number];
  tenantId?: string;
}) {
  const tenantId = input.tenantId ?? tenantA;
  const outletId = tenantId === tenantA ? outletA : outletB;
  const id = shipmentId(input.sequence);
  await admin.query(
    "INSERT INTO shipments (id, tenant_id, outlet_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)",
    [id, tenantId, outletId, input.status, input.createdAt],
  );
  await admin.query(
    `INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label,
      package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod, created_at, updated_at)
     VALUES ($1, $2, 'area', 'Panaikang, Panakkukang, Kota Makassar, Sulawesi Selatan, 90231', 'Paket', 1000, 1, 150000, $3, $4, $4)`,
    [id, tenantId, Boolean(input.cod), input.createdAt],
  );
  const other = input.role === "SENDER" ? "082299990000" : "081199990000";
  await admin.query(
    `INSERT INTO shipment_parties (tenant_id, shipment_id, role, name, phone, address, destination_area_id, destination_area_label)
     VALUES ($1, $2, 'SENDER', 'Pengirim Snapshot', $3, 'Alamat pengirim', NULL, NULL),
            ($1, $2, 'RECIPIENT', 'Penerima Snapshot', $4, 'Alamat penerima', 'area', 'Panaikang, Kota Makassar')`,
    [tenantId, id, input.role === "SENDER" ? input.phone : other, input.role === "RECIPIENT" ? input.phone : other],
  );
  if (!input.cod) return;
  const snapshotId = `00000000-0000-4000-8242-${String(input.sequence).padStart(12, "0")}`;
  const serviceId = `00000000-0000-4000-8243-${String(input.sequence).padStart(12, "0")}`;
  const batchId = `00000000-0000-4000-8244-${String(input.sequence).padStart(12, "0")}`;
  await admin.query(
    `INSERT INTO shipment_estimate_snapshots (id, tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id,
      destination_area_label, weight_grams, is_cod_requested, credential_source)
     VALUES ($1, $2, $3, $4, 'origin', 'area', 'Kota Makassar', 1000, true, 'platform_default')`,
    [snapshotId, tenantId, id, outletId],
  );
  await admin.query(
    `INSERT INTO shipment_estimate_services (id, tenant_id, snapshot_id, provider_service, currency,
      shipping_amount_idr, shipping_source_field, delivery_estimate, cod_eligible)
     VALUES ($1, $2, $3, 'JNE REG', 'IDR', 12000, 'price', 'fixture', true)`,
    [serviceId, tenantId, snapshotId],
  );
  await admin.query(
    `INSERT INTO shipment_cod_totals (tenant_id, shipment_id, snapshot_id, estimate_service_id, currency,
      goods_value_idr, shipping_amount_idr, service_fee_idr, vat_amount_idr, provider_cod_amount_idr)
     VALUES ($1, $2, $3, $4, 'IDR', 200000, 15000, 6450, 710, $5)`,
    [tenantId, id, snapshotId, serviceId, input.cod.amountIdr],
  );
  await admin.query(
    `INSERT INTO provider_batches (id, tenant_id, outlet_id, pickup_address_id, courier, credential_source,
      provider_account_key, idempotency_key, status, submission_attempted_at, completed_at)
     VALUES ($1, $2, $3, 'pickup', 'JNE', 'platform_default', $4, $5, 'COMPLETED', $6, $6)`,
    [batchId, tenantId, outletId, (24_100 + input.sequence).toString(16).padStart(64, "0"), (24_900 + input.sequence).toString(16).padStart(64, "0"), input.createdAt],
  );
  await admin.query(
    `INSERT INTO provider_order_snapshots (id, tenant_id, batch_id, shipment_id, estimate_snapshot_id, estimate_service_id,
      position, provider_service, destination_area_id, destination_area_label, currency, shipping_amount_idr, is_cod,
      provider_cod_amount_idr, status, provider_order_id, is_paid, cnote_no, resolved_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0, 'JNE REG', 'area', 'Kota Makassar', 'IDR', 12000, true, $6,
      $7, $8, true, $9, $10)`,
    [
      tenantId, batchId, id, snapshotId, serviceId, input.cod.amountIdr,
      input.cod.issued ? "ISSUED" : "FAILED",
      input.cod.issued ? `order-${input.sequence}` : null,
      input.cod.issued ? `AWB24100${input.sequence}` : null,
      input.createdAt,
    ],
  );
}

let contactOne: string;
let contactTwo: string;

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, appDatabaseUrl);
  await clean();
  await admin.query(
    "INSERT INTO users (id, name, email) VALUES ($1, 'T241 Admin A', 't241-a@example.test'), ($2, 'T241 Operator A', 't241-o@example.test'), ($3, 'T241 Admin B', 't241-b@example.test')",
    [adminA, operatorA, adminB],
  );
  await admin.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'T241 A', 'ACTIVE'), ($2, 'T241 B', 'ACTIVE')", [tenantA, tenantB]);
  await admin.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')",
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await admin.query(
    "INSERT INTO outlets (id, tenant_id, name) VALUES ($1, $2, 'T241 Outlet A'), ($3, $4, 'T241 Outlet B')",
    [outletA, tenantA, outletB, tenantB],
  );
  contactOne = await withTenantContext(appDb, operatorA, tenantA, (tx, context) => createContact(tx, context, { ...base, category: "PIC_UTAMA" }));
  contactTwo = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
    createContact(tx, context, { ...base, isRecipient: true, isSender: false, name: "Budi Santoso", phone: "081224100002" }));
});

afterAll(async () => {
  await clean();
  await appPool.end();
  await admin.end();
});

describe("contact numbers (T-241)", () => {
  it("allocates 1, 2, … per tenant in insert order, independently per tenant", async () => {
    const tenantBContact = await withTenantContext(appDb, adminB, tenantB, (tx, context) =>
      createContact(tx, context, { ...base, name: "Gerai B" }));
    const numbers = (await admin.query<{ id: string; contact_number: number; tenant_id: string }>(
      "SELECT id, contact_number, tenant_id FROM contacts WHERE tenant_id = ANY($1::uuid[]) ORDER BY tenant_id, contact_number",
      [[tenantA, tenantB]],
    )).rows;
    expect(numbers.map((row) => [row.id, row.contact_number])).toEqual([
      [contactOne, 1],
      [contactTwo, 2],
      [tenantBContact, 1],
    ]);
  });

  it("ignores a caller-supplied number and keeps (tenant, number) unique", async () => {
    const forged = await admin.query<{ contact_number: number }>(
      "INSERT INTO contacts (tenant_id, name, phone, contact_number) VALUES ($1, 'Forged', '081224100099', 1) RETURNING contact_number",
      [tenantA],
    );
    expect(forged.rows[0].contact_number).toBe(3);
    await expect(admin.query("UPDATE contacts SET contact_number = 1 WHERE tenant_id = $1 AND contact_number = 3", [tenantA]))
      .rejects.toMatchObject({ constraint: "contacts_tenant_number_key" });
    await admin.query("DELETE FROM contacts WHERE tenant_id = $1 AND contact_number = 3", [tenantA]);
  });

  it("never lets the runtime role move a number, and never lets it touch the counters", async () => {
    await expect(withTenantContext(appDb, adminA, tenantA, (tx) =>
      tx.update(schema.contacts).set({ contactNumber: 99 }).where(eq(schema.contacts.id, contactOne))))
      .rejects.toMatchObject({ cause: expect.objectContaining({ code: "42501" }) });
    await expect(withTenantContext(appDb, adminA, tenantA, (tx) => tx.select().from(schema.tenantContactCounters)))
      .rejects.toMatchObject({ cause: expect.objectContaining({ code: "42501" }) });
  });

  it("resolves a number only inside its own tenant", async () => {
    const own = await withTenantContext(appDb, operatorA, tenantA, (tx, context) => getContactByNumber(tx, context, 1));
    expect(own).toMatchObject({ category: "PIC_UTAMA", contactNumber: 1, id: contactOne });
    const crossTenant = await withTenantContext(appDb, adminB, tenantB, (tx, context) => getContactByNumber(tx, context, 2));
    expect(crossTenant).toBeNull();
    const sameNumberOtherTenant = await withTenantContext(appDb, adminB, tenantB, (tx, context) => getContactByNumber(tx, context, 1));
    expect(sameNumberOtherTenant?.id).not.toBe(contactOne);
  });

  it("refuses a kategori outside the fixed list (CHECK) and lets the runtime role set or clear it", async () => {
    await expect(admin.query("UPDATE contacts SET category = 'SKOR_MENGANTAR' WHERE id = $1", [contactOne]))
      .rejects.toMatchObject({ constraint: "contacts_category_valid" });
    await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      updateContact(tx, context, contactOne, { category: "DROPSHIPPER", isRecipient: false, isSender: true, name: base.name, phone: base.phone }));
    expect((await withTenantContext(appDb, operatorA, tenantA, (tx, context) => getContactByNumber(tx, context, 1)))?.category).toBe("DROPSHIPPER");
    // `category` omitted leaves it (the Peran card); `null` clears it.
    await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      updateContact(tx, context, contactOne, { isRecipient: false, isSender: true, name: base.name, phone: base.phone }));
    expect((await withTenantContext(appDb, operatorA, tenantA, (tx, context) => getContactByNumber(tx, context, 1)))?.category).toBe("DROPSHIPPER");
    await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      updateContact(tx, context, contactOne, { category: "PIC_UTAMA", isRecipient: false, isSender: true, name: base.name, phone: base.phone }));
  });

  it("moves the primary mark to exactly one address (Jadikan utama), within the tenant", async () => {
    await admin.query(
      `INSERT INTO contact_addresses (tenant_id, contact_id, label, address, destination_area_id, destination_area_label)
       VALUES ($1, $2, 'Toko', 'Jl. Toko 2', 'area-toko', 'Kebon Jeruk, Kebon Jeruk, Kota Jakarta Barat, DKI Jakarta, 11530')`,
      [tenantA, contactOne],
    );
    const before = await withTenantContext(appDb, operatorA, tenantA, (tx, context) => listContactAddresses(tx, context, contactOne));
    const toko = before.find((address) => address.label === "Toko")!;
    await expect(withTenantContext(appDb, adminB, tenantB, (tx, context) => setPrimaryContactAddress(tx, context, contactOne, toko.id)))
      .rejects.toThrow("Contact is unavailable.");
    await withTenantContext(appDb, operatorA, tenantA, (tx, context) => setPrimaryContactAddress(tx, context, contactOne, toko.id));
    const after = await withTenantContext(appDb, operatorA, tenantA, (tx, context) => listContactAddresses(tx, context, contactOne));
    expect(after.filter((address) => address.isPrimary).map((address) => address.label)).toEqual(["Toko"]);
  });
});

describe("shipment attribution (T-241, CON-SHP-*)", () => {
  beforeAll(async () => {
    const now = Date.now();
    const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();
    // Contact 1 (sender 081224100001): the snapshot phone is stored as +62… on one row.
    await seedShipment({ cod: { amountIdr: 222_160, issued: true }, createdAt: daysAgo(2), phone: "+6281224100001", role: "SENDER", sequence: 1, status: "DELIVERED" });
    await seedShipment({ createdAt: daysAgo(3), phone: "081224100001", role: "SENDER", sequence: 2, status: "DELIVERED" });
    await seedShipment({ createdAt: daysAgo(5), phone: "0812-2410-0001", role: "SENDER", sequence: 3, status: "RTS_RECEIVED" });
    await seedShipment({ cod: { amountIdr: 222_160, issued: false }, createdAt: daysAgo(40), phone: "081224100001", role: "SENDER", sequence: 4, status: "FAILED" });
    // Not contact 1's: the same number as a recipient, and the same number in another tenant.
    await seedShipment({ createdAt: daysAgo(1), phone: "081224100001", role: "RECIPIENT", sequence: 5, status: "DELIVERED" });
    await seedShipment({ createdAt: daysAgo(1), phone: "081224100001", role: "SENDER", sequence: 6, status: "DELIVERED", tenantId: tenantB });
  });

  it("counts a contact's shipments by role and national number, never across tenants", async () => {
    const summary = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      loadContactShipmentSummary(tx, context, { contactId: contactOne, role: "SENDER" }));
    expect(summary).toEqual({
      codOrderCount: 1,
      codValueIdr: 222_160,
      deliveredCount: 2,
      last30DaysCount: 3,
      returnedCount: 1,
      shipmentCount: 4,
    });
    const rows = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      listContactDirectory(tx, context, { query: "", role: "sender", status: "active" }));
    expect(rows.find((row) => row.id === contactOne)).toMatchObject({ contactNumber: 1, deliveredCount: 2, shipmentCount: 4 });
    // The recipient list attributes only RECIPIENT parties: contact 2's number has none.
    const recipients = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      listContactDirectory(tx, context, { query: "", role: "recipient", status: "active" }));
    expect(recipients.find((row) => row.id === contactTwo)).toMatchObject({ contactNumber: 2, shipmentCount: 0 });
  });

  it("pages the history newest first with COD / Non-COD tabs and the counterpart", async () => {
    const all = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      loadContactShipmentHistory(tx, context, { contactId: contactOne, page: 1, payment: "all", role: "SENDER" }));
    expect(all.counts).toEqual({ all: 4, cod: 2, noncod: 2 });
    expect(all.rows.map((row) => row.shipmentId)).toEqual([1, 2, 3, 4].map(shipmentId));
    expect(all.rows[0]).toMatchObject({ awb: "AWB241001", counterpartName: "Penerima Snapshot", paymentMethod: "COD", providerCodAmountIdr: 222_160 });
    const noncod = await withTenantContext(appDb, operatorA, tenantA, (tx, context) =>
      loadContactShipmentHistory(tx, context, { contactId: contactOne, page: 9, payment: "noncod", role: "SENDER" }));
    expect(noncod).toMatchObject({ page: 1, totalPages: 1 });
    expect(noncod.rows.map((row) => row.shipmentId)).toEqual([2, 3].map(shipmentId));
  });

  it("renders the detail with GeraiCUAN-only KPIs, the history and no PII or provider score in URLs", async () => {
    state.principal = { role: "OPERATOR", scope: "tenant", tenantId: tenantA, userId: operatorA };
    const element = await ContactDetail({ params: Promise.resolve({ nomor: "1" }), role: "pengirim", searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element as ReactElement);
    expect(html).toContain("Gerai Satu");
    expect(html).toContain(">PIC Utama</span>");
    expect(html).toContain("2 alamat terdaftar");
    // Wilayah = city, province of the primary address (moved to Toko above).
    expect(html).toContain("Kota Jakarta Barat, DKI Jakarta");
    for (const label of ["Total kiriman", "Nilai COD", "Tingkat retur", "Kiriman 30 hari terakhir"]) expect(html).toContain(label);
    expect(html).toContain("50% terkirim");
    expect(html).toContain("33,3%");
    expect(html).toMatch(/Rp\s?222\.160/);
    expect(html).not.toMatch(/Skor|Mengantar SLA|DSR/);
    expect(html).toContain("Buat kiriman dari kontak ini");
    expect(html).toContain('href="/app/kontak/pengirim/1?riwayat=cod"');
    expect(html).toContain("Penerima Snapshot");
    // Operators see no archive zone (server rule stays in archiveContact).
    expect(html).not.toContain("Zona hati-hati");
    // T-250: two columns below the KPI row — main (Riwayat kiriman, then Alamat) before side
    // (Data kontak, then Zona hati-hati for a Tenant Admin); below 896px `order` stacks
    // Data kontak · Alamat · Riwayat kiriman · Zona hati-hati.
    const columns = (page: string) => {
      const main = page.indexOf('data-column="main"');
      const side = page.indexOf('data-column="side"');
      const at = (id: string) => page.indexOf(`id="${id}"`);
      return { at, main, side };
    };
    const operatorColumns = columns(html);
    expect(html).toContain('data-slot="contact-detail-columns"');
    expect(html).toContain("@4xl/detail:grid-cols-[minmax(0,1fr)_340px]");
    expect(operatorColumns.main).toBeGreaterThan(html.indexOf("Kiriman 30 hari terakhir"));
    expect(operatorColumns.main).toBeLessThan(operatorColumns.at("riwayat-kiriman"));
    expect(operatorColumns.at("riwayat-kiriman")).toBeLessThan(operatorColumns.at("alamat-kontak"));
    expect(operatorColumns.at("alamat-kontak")).toBeLessThan(operatorColumns.side);
    expect(operatorColumns.side).toBeLessThan(operatorColumns.at("data-kontak"));
    expect(html.slice(operatorColumns.side)).toMatch(/^data-column="side"[^>]*>\s*<div class="[^"]*@max-4xl\/detail:order-1"/);
    expect(html.match(/@max-4xl\/detail:order-\d/g)).toEqual(["@max-4xl/detail:order-3", "@max-4xl/detail:order-2", "@max-4xl/detail:order-1"]);
    expect(html.match(/Simpan data kontak/g)).toHaveLength(1);
    for (const href of html.match(/href="[^"]*"/g) ?? []) {
      expect(href).not.toContain(contactOne);
      expect(href).not.toMatch(/Gerai|0812241/);
    }
    state.principal = { role: "TENANT_ADMIN", scope: "tenant", tenantId: tenantA, userId: adminA };
    const adminHtml = renderToStaticMarkup(await ContactDetail({ params: Promise.resolve({ nomor: "1" }), role: "pengirim", searchParams: Promise.resolve({}) }) as ReactElement);
    expect(adminHtml).toContain("Zona hati-hati");
    const adminColumns = columns(adminHtml);
    expect(adminColumns.at("data-kontak")).toBeLessThan(adminColumns.at("zona-hati-hati"));
    expect(adminColumns.side).toBeLessThan(adminColumns.at("zona-hati-hati"));
    expect(adminHtml.match(/@max-4xl\/detail:order-\d/g)).toEqual(["@max-4xl/detail:order-3", "@max-4xl/detail:order-2", "@max-4xl/detail:order-1", "@max-4xl/detail:order-4"]);
  });

  it("sends a contact to the role it holds, and reads another tenant's or a malformed number as not found", async () => {
    state.principal = { role: "OPERATOR", scope: "tenant", tenantId: tenantA, userId: operatorA };
    const render = (nomor: string, role: "pengirim" | "penerima") =>
      ContactDetail({ params: Promise.resolve({ nomor }), role, searchParams: Promise.resolve({}) });
    await expect(render("1", "penerima")).rejects.toThrow(/^REDIRECT:\/app\/kontak\/pengirim\/1$/);
    // T-247 (review L10): the history tab, page and one-shot notice survive; unknown keys do not.
    await expect(ContactDetail({
      params: Promise.resolve({ nomor: "1" }),
      role: "penerima",
      searchParams: Promise.resolve({ diarsipkan: "1", halaman: "2", riwayat: "cod", sisip: "x" } as never),
    })).rejects.toThrow(/^REDIRECT:\/app\/kontak\/pengirim\/1\?riwayat=cod&halaman=2&diarsipkan=1$/);
    for (const bad of ["0", "01", "abc", contactOne]) await expect(render(bad, "pengirim")).rejects.toThrow("NOT_FOUND");
    await expect(render("99", "pengirim")).rejects.toThrow("NOT_FOUND");
    state.principal = { role: "TENANT_ADMIN", scope: "tenant", tenantId: tenantB, userId: adminB };
    await expect(render("2", "penerima")).rejects.toThrow("NOT_FOUND");
  });
});

describe("legacy /app/kontak/<uuid> (T-241)", () => {
  const legacy = (contactId: string, dari?: string) =>
    LegacyContactDetailPage({ params: Promise.resolve({ contactId }), searchParams: Promise.resolve({ dari }) });

  it("permanently redirects to the numbered URL, keeping a still-held `dari` role", async () => {
    state.principal = { role: "OPERATOR", scope: "tenant", tenantId: tenantA, userId: operatorA };
    await expect(legacy(contactOne, "pengirim")).rejects.toThrow("PERMANENT_REDIRECT:/app/kontak/pengirim/1");
    await expect(legacy(contactTwo)).rejects.toThrow("PERMANENT_REDIRECT:/app/kontak/penerima/2");
    // `dari` naming a role the contact does not hold falls back to the one it holds.
    await expect(legacy(contactTwo, "pengirim")).rejects.toThrow("PERMANENT_REDIRECT:/app/kontak/penerima/2");
  });

  it("reads another tenant's id and a malformed id as not found", async () => {
    state.principal = { role: "TENANT_ADMIN", scope: "tenant", tenantId: tenantB, userId: adminB };
    await expect(legacy(contactOne, "pengirim")).rejects.toThrow("NOT_FOUND");
    await expect(legacy("not-a-uuid")).rejects.toThrow("NOT_FOUND");
  });

  it("returns the archived contact's number for the post-archive redirect", async () => {
    const number = await withTenantContext(appDb, adminA, tenantA, (tx, context) => archiveContact(tx, context, contactTwo));
    expect(number).toBe(2);
  });
});
