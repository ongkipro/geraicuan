// T-229 / PR-86: Pengaturan → Informasi label — per-size field choices, applied by the
// real label sheet. Fixtures live in their own tenants and are removed by tenant.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LabelPrintContext } from "@/app/app/label/[shipmentId]/label-print-context";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import type { PrintableLabel } from "@/db/label-print-repository";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantLabelFields, saveTenantLabelFields } from "@/db/tenant-settings-repository";
import {
  DEFAULT_LABEL_FIELDS,
  DEFAULT_LABEL_FIELDS_BY_SIZE,
  formatCityProvince,
  LABEL_FIELD_KEYS,
  labelFieldInputName,
  parseLabelFieldsForm,
  RETURN_WARNING_TEXT,
  type LabelFieldsBySize,
} from "@/lib/label-fields";
import type { LabelSize } from "@/lib/label-size";
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

const tenantA = "00000000-0000-0229-0000-0000000000a1";
const tenantB = "00000000-0000-0229-0000-0000000000b1";
const adminA = "t229-admin-a";
const operatorA = "t229-operator-a";
const adminB = "t229-admin-b";

const AREA = "Dago, Coblong, Kota Bandung, Jawa Barat, 40135";
const LABEL: PrintableLabel = {
  awb: "JX0012345678",
  codBreakdown: null,
  courier: "JNE",
  destinationAreaLabel: AREA,
  insuranceAmountIdr: null,
  isCod: false,
  issuedAt: new Date("2026-09-26T03:00:00.000Z"),
  lastPrintedAt: null,
  outletName: "Outlet T229",
  package: { content: "Kaos", declaredValueIdr: 150_000, heightCm: 10, lengthCm: 20, quantity: 1, weightGrams: 1_000, widthCm: 15 },
  paymentMethod: "NON_COD",
  printCount: 0,
  providerCodAmountIdr: null,
  providerService: "REG",
  publicReference: "GC-10229",
  recipient: { address: "Jl. Ir. H. Juanda No. 10 RT 02", name: "Budi Penerima", phone: "081299990229" },
  sender: { address: "Ruko Pengirim Blok C3", name: "Gerai Pengirim", phone: "081211110229" },
  shipmentId: "00000000-0000-4000-8000-000000000229",
  shippingAmountIdr: 18_000,
};

function render(size: LabelSize, fields?: LabelFieldsBySize) {
  return renderToStaticMarkup(createElement(
    LabelPrintContext.Provider,
    { value: { printedAt: null, size } },
    createElement(LabelSheet, { fields, label: LABEL }),
  ));
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const packageOf = (html: string) => text(html.match(/<section aria-label="Label paket 10 × 10 cm"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "");
const withOff = (size: LabelSize, key: (typeof LABEL_FIELD_KEYS)[number], on = false): LabelFieldsBySize => ({
  ...DEFAULT_LABEL_FIELDS_BY_SIZE,
  [size]: { ...DEFAULT_LABEL_FIELDS, [key]: on },
});

function asUser<T>(userId: string, tenantId: string, work: Parameters<typeof withTenantContext<T>>[3]) {
  return withTenantContext(appDb, userId, tenantId, work, { allowPendingApproval: true });
}

function formFor(fields: LabelFieldsBySize) {
  const form = new FormData();
  for (const size of ["10x15", "10x10"] as const) {
    for (const key of LABEL_FIELD_KEYS) form.set(labelFieldInputName(size, key), fields[size][key] ? "1" : "0");
  }
  return form;
}

async function clean() {
  const tenantIds = [tenantA, tenantB];
  await adminPool.query("DELETE FROM tenant_label_settings WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenantIds]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [[adminA, operatorA, adminB]]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await clean();
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'T229 Admin A', 't229-admin-a@example.test'),
      ($2, 'T229 Operator A', 't229-operator-a@example.test'),
      ($3, 'T229 Admin B', 't229-admin-b@example.test')`,
    [adminA, operatorA, adminB],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Gerai Label A', 'ACTIVE'), ($2, 'Gerai Label B', 'ACTIVE')",
    [tenantA, tenantB],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
});

afterAll(async () => {
  await clean();
  const client = await import("@/db/client") as unknown as { pool: Pool };
  await Promise.all([adminPool.end(), appPool.end(), client.pool.end()]);
});

describe("label sheet with the Informasi label choice", () => {
  it("prints exactly the pre-T-229 label with the defaults, at both sizes", () => {
    for (const size of ["10x15", "10x10"] as const) {
      const html = render(size);
      expect(render(size, DEFAULT_LABEL_FIELDS_BY_SIZE)).toBe(html);
      const pkg = packageOf(html);
      for (const expected of [
        LABEL.sender.name, LABEL.sender.phone, LABEL.sender.address, LABEL.recipient.name, LABEL.recipient.phone,
        LABEL.recipient.address, AREA, "Nomor kiriman GC-10229 · Terbit",
      ]) expect(pkg, `${size}: ${expected}`).toContain(expected);
      expect(pkg).toContain(`${LABEL.sender.phone} · ${LABEL.sender.address}`);
      expect(pkg).not.toContain(RETURN_WARNING_TEXT);
    }
  });

  it("hides each field when its switch is off, only at the size it was set for", () => {
    const cases = [
      ["senderAddress", LABEL.sender.address],
      ["senderPhone", LABEL.sender.phone],
      ["recipientName", LABEL.recipient.name],
      ["recipientPhone", LABEL.recipient.phone],
      ["recipientAddressDetail", LABEL.recipient.address],
    ] as const;
    for (const [key, value] of cases) {
      const fields = withOff("10x10", key);
      expect(packageOf(render("10x10", fields)), key).not.toContain(value);
      expect(packageOf(render("10x15", fields)), key).toContain(value);
    }
    // The sender separator goes with the address.
    expect(packageOf(render("10x10", withOff("10x10", "senderAddress")))).not.toContain(" · Ruko");
  });

  it("prints only the city and province when the address detail is off", () => {
    const pkg = packageOf(render("10x15", withOff("10x15", "recipientAddressDetail")));
    expect(formatCityProvince(AREA)).toBe("Kota Bandung, Jawa Barat");
    expect(pkg).toContain("Kota Bandung, Jawa Barat");
    expect(pkg).not.toContain("Dago");
    expect(pkg).not.toContain("40135");
    expect(pkg).not.toContain(LABEL.recipient.address);
    // Name and phone stay unless switched off themselves.
    expect(pkg).toContain(LABEL.recipient.name);
  });

  it("prints the return warning in the footer row instead of the issue time", () => {
    const html = render("10x15", withOff("10x15", "returnWarning", true));
    const pkg = packageOf(html);
    expect(pkg).toContain(`${RETURN_WARNING_TEXT} · Nomor kiriman GC-10229`);
    expect(pkg).not.toContain("Terbit");
    expect(html.match(/class="label-footer"/g)).toHaveLength(1);
    expect(packageOf(render("10x10", withOff("10x15", "returnWarning", true)))).not.toContain(RETURN_WARNING_TEXT);
  });

  it("never offers the Mengantar pickup identity as a field", () => {
    expect([...LABEL_FIELD_KEYS]).toEqual([
      "senderAddress", "senderPhone", "recipientName", "recipientPhone", "recipientAddressDetail", "returnWarning",
    ]);
  });

  it("accepts a complete form only", () => {
    const fields = withOff("10x10", "recipientPhone");
    expect(parseLabelFieldsForm(formFor(fields), ["10x15", "10x10"])).toEqual(fields);
    const partial = formFor(fields);
    partial.delete(labelFieldInputName("10x15", "senderPhone"));
    expect(parseLabelFieldsForm(partial, ["10x15", "10x10"])).toBeNull();
    const forged = formFor(fields);
    forged.set(labelFieldInputName("10x15", "senderPhone"), "true");
    expect(parseLabelFieldsForm(forged, ["10x15", "10x10"])).toBeNull();
  });
});

describe("saving Informasi label", () => {
  it("defaults without a row, and the Tenant Admin saves both sizes that both roles then read", async () => {
    expect(await asUser(operatorA, tenantA, loadTenantLabelFields)).toEqual(DEFAULT_LABEL_FIELDS_BY_SIZE);

    const { saveLabelSettings } = await import("@/app/app/pengaturan/actions");
    principal.current = { scope: "tenant", userId: adminA, tenantId: tenantA, role: "TENANT_ADMIN", tenantStatus: "ACTIVE" };
    const fields: LabelFieldsBySize = {
      "10x15": { ...DEFAULT_LABEL_FIELDS, returnWarning: true },
      "10x10": { ...DEFAULT_LABEL_FIELDS, recipientPhone: false, recipientAddressDetail: false },
    };
    expect(await saveLabelSettings({}, formFor(fields))).toMatchObject({ saved: true });
    expect(await asUser(operatorA, tenantA, loadTenantLabelFields)).toEqual(fields);

    // A second save updates in place.
    const next = { ...fields, "10x15": DEFAULT_LABEL_FIELDS };
    expect(await saveLabelSettings({}, formFor(next))).toMatchObject({ saved: true });
    expect(await asUser(adminA, tenantA, loadTenantLabelFields)).toEqual(next);
    const { rows } = await adminPool.query("SELECT label_size, updated_by_user_id FROM tenant_label_settings WHERE tenant_id = $1 ORDER BY label_size", [tenantA]);
    expect(rows).toEqual([{ label_size: "10x10", updated_by_user_id: adminA }, { label_size: "10x15", updated_by_user_id: adminA }]);
  });

  it("refuses an Operator in the action, the repository and the database", async () => {
    const { saveLabelSettings } = await import("@/app/app/pengaturan/actions");
    principal.current = { scope: "tenant", userId: operatorA, tenantId: tenantA, role: "OPERATOR", tenantStatus: "ACTIVE" };
    await expect(saveLabelSettings({}, formFor(withOff("10x10", "senderPhone")))).rejects.toThrow("REDIRECT:/app");
    await expect(asUser(operatorA, tenantA, (tx, context) => saveTenantLabelFields(tx, context, withOff("10x10", "senderPhone"))))
      .rejects.toThrow("not authorized");
    // Row-level security refuses the write even when the application check is skipped.
    await expect(asUser(operatorA, tenantA, (tx) => tx.execute(sql`INSERT INTO tenant_label_settings (tenant_id, label_size, show_sender_phone, updated_by_user_id)
      VALUES (${tenantA}, '10x10', false, ${operatorA})`))).rejects.toMatchObject({ cause: { code: "42501" } });
    const { rows } = await adminPool.query("SELECT count(*)::int AS n FROM tenant_label_settings WHERE tenant_id = $1", [tenantA]);
    expect(rows[0].n).toBe(0);
  });

  it("keeps each tenant's choice to itself", async () => {
    await asUser(adminA, tenantA, (tx, context) => saveTenantLabelFields(tx, context, withOff("10x15", "recipientName")));

    expect(await asUser(adminB, tenantB, loadTenantLabelFields)).toEqual(DEFAULT_LABEL_FIELDS_BY_SIZE);
    const visible = await asUser(adminB, tenantB, (tx) => tx.execute(sql`SELECT tenant_id FROM tenant_label_settings`));
    expect(visible.rows).toEqual([]);
    // B's admin cannot write a row for A, nor update A's rows.
    await expect(asUser(adminB, tenantB, (tx) => tx.execute(sql`INSERT INTO tenant_label_settings (tenant_id, label_size, updated_by_user_id)
      VALUES (${tenantA}, '10x10', ${adminB})`))).rejects.toMatchObject({ cause: { code: "42501" } });
    const updated = await asUser(adminB, tenantB, (tx) => tx.execute(sql`UPDATE tenant_label_settings SET show_recipient_name = true, updated_by_user_id = ${adminB} WHERE tenant_id = ${tenantA}`));
    expect(updated.rowCount).toBe(0);
    expect((await asUser(adminA, tenantA, loadTenantLabelFields))["10x15"].recipientName).toBe(false);
  });
});
