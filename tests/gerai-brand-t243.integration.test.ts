// T-243: Profil gerai & brand (logo, catatan resi, kategori, email CS, website), the label and
// invoice brand, Mitra kurir and pickup notes. Fixtures live in their own tenants.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GeraiBrandProvider, NO_GERAI_BRAND, type GeraiBrand } from "@/app/app/brand/gerai-brand";
import { InvoiceSheet } from "@/app/app/invoice/invoice-sheet";
import { LabelPrintContext } from "@/app/app/label/[shipmentId]/label-print-context";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import type { PrintableLabel } from "@/db/label-print-repository";
import { listOutletPickupPoints } from "@/db/outlet-pickup-point-repository";
import * as schema from "@/db/schema";
import type { ShipmentInvoice } from "@/db/shipment-invoice-repository";
import { withTenantContext } from "@/db/tenant-context";
import {
  loadPrintBrand,
  loadTenantBrand,
  loadTenantDisabledCouriers,
  loadTenantLabelFields,
  loadTenantLogo,
  saveTenantLogo,
} from "@/db/tenant-settings-repository";
import {
  courierPrintLogoSrc,
  filterTenantCourierServices,
  geraiLogoSrc,
  parseGeraiProfile,
  SELECTABLE_COURIERS,
  sniffLogo,
  validateLogoUpload,
} from "@/lib/gerai-settings";
import {
  DEFAULT_LABEL_FIELDS,
  DEFAULT_LABEL_FIELDS_BY_SIZE,
  LABEL_FIELD_KEYS,
  labelFieldInputName,
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

type Principal = { scope: "tenant"; userId: string; tenantId: string; role: "OPERATOR" | "TENANT_ADMIN"; tenantStatus: "ACTIVE" };
const principal = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/cms-auth", () => {
  class CmsAuthorizationDeniedError extends Error {}
  return {
    CmsAuthorizationDeniedError,
    requireCmsScope: vi.fn(async () => {
      if (!principal.current) throw new CmsAuthorizationDeniedError("anonymous");
      return principal.current;
    }),
  };
});
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

const tenantA = "00000000-0000-0243-0000-0000000000a1";
const tenantB = "00000000-0000-0243-0000-0000000000b1";
const outletA = "00000000-0000-0243-0000-0000000000a2";
const adminA = "t243-admin-a";
const operatorA = "t243-operator-a";
const adminB = "t243-admin-b";

const as = (userId: string, tenantId: string, role: Principal["role"]): Principal =>
  ({ scope: "tenant", userId, tenantId, role, tenantStatus: "ACTIVE" });

function asUser<T>(userId: string, tenantId: string, work: Parameters<typeof withTenantContext<T>>[3]) {
  return withTenantContext(appDb, userId, tenantId, work, { allowPendingApproval: true });
}

// ------------------------------------------------------------------ byte fixtures

function png(width: number, height: number) {
  const bytes = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return new Uint8Array(bytes);
}

function jpeg(width: number, height: number) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

function webp(width: number, height: number) {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(22, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return new Uint8Array(bytes);
}

const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

// ------------------------------------------------------------------ fixtures

const LABEL: PrintableLabel = {
  awb: "JX0012345243",
  codBreakdown: null,
  courier: "JNE",
  destinationAreaLabel: "Dago, Coblong, Kota Bandung, Jawa Barat, 40135",
  insuranceAmountIdr: null,
  isCod: false,
  issuedAt: new Date("2026-09-26T03:00:00.000Z"),
  lastPrintedAt: null,
  outletName: "Outlet T243",
  package: { content: "Kaos", declaredValueIdr: 150_000, heightCm: 10, lengthCm: 20, quantity: 1, weightGrams: 1_000, widthCm: 15 },
  paymentMethod: "NON_COD",
  printCount: 0,
  providerCodAmountIdr: null,
  providerService: "REG",
  publicReference: "GC-10243",
  recipient: { address: "Jl. Ir. H. Juanda No. 10 RT 02", name: "Budi Penerima", phone: "081299990243" },
  sender: { address: "Ruko Pengirim Blok C3", name: "Gerai Pengirim", phone: "081211110243" },
  shipmentId: "00000000-0000-4000-8000-000000000243",
  shippingAmountIdr: 18_000,
};

const BRAND: GeraiBrand = { defaultLabelSize: "10x15", logoSrc: "/app/brand/logo?v=abc", note: "Terima kasih sudah belanja" };

function renderLabel(size: LabelSize, brand: GeraiBrand, fields?: LabelFieldsBySize, label: PrintableLabel = LABEL) {
  return renderToStaticMarkup(createElement(
    GeraiBrandProvider,
    { value: brand },
    createElement(LabelPrintContext.Provider, { value: { printedAt: null, size } }, createElement(LabelSheet, { fields, label })),
  ));
}
const packageSection = (html: string) => html.match(/<section aria-label="Label paket 10 × 10 cm"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
/** The package grid's seven rows, by class, in order: what the geometry depends on. */
const packageRows = (html: string) => {
  const inner = packageSection(html).replace(/^<section[^>]*>/, "");
  const rows: string[] = [];
  let depth = 0;
  for (const match of inner.matchAll(/<(\/?)(div|dl)\b([^>]*)>/g)) {
    if (match[1] === "/") { depth -= 1; continue; }
    if (depth === 0) rows.push(/class="([^"]*)"/.exec(match[3])?.[1] ?? "");
    depth += 1;
  }
  return rows;
};
const off = (size: LabelSize, key: (typeof LABEL_FIELD_KEYS)[number]): LabelFieldsBySize => ({
  ...DEFAULT_LABEL_FIELDS_BY_SIZE,
  [size]: { ...DEFAULT_LABEL_FIELDS, [key]: false },
});

function labelForm(fields: LabelFieldsBySize, defaultSize?: string) {
  const form = new FormData();
  for (const size of ["10x15", "10x10"] as const) {
    for (const key of LABEL_FIELD_KEYS) form.set(labelFieldInputName(size, key), fields[size][key] ? "1" : "0");
  }
  if (defaultSize) form.set("defaultSize", defaultSize);
  return form;
}

function courierForm(disabled: readonly string[]) {
  const form = new FormData();
  for (const courier of SELECTABLE_COURIERS) form.set(`kurir.${courier}`, disabled.includes(courier) ? "0" : "1");
  return form;
}

async function clean() {
  const tenants = [tenantA, tenantB];
  await adminPool.query("DELETE FROM tenant_brand_settings WHERE tenant_id = ANY($1::uuid[])", [tenants]);
  await adminPool.query("DELETE FROM tenant_logo_versions WHERE tenant_id = ANY($1::uuid[])", [tenants]);
  await adminPool.query("DELETE FROM tenant_label_settings WHERE tenant_id = ANY($1::uuid[])", [tenants]);
  await adminPool.query("DELETE FROM outlet_pickup_points WHERE tenant_id = ANY($1::uuid[])", [tenants]);
  await adminPool.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])", [tenants]);
  await adminPool.query("DELETE FROM outlets WHERE tenant_id = ANY($1::uuid[])", [tenants]);
  await adminPool.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [tenants]);
  await adminPool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [tenants]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [[adminA, operatorA, adminB]]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  principal.current = null;
  await clean();
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'T243 Admin A', 't243-admin-a@example.test'),
      ($2, 'T243 Operator A', 't243-operator-a@example.test'),
      ($3, 'T243 Admin B', 't243-admin-b@example.test')`,
    [adminA, operatorA, adminB],
  );
  await adminPool.query("INSERT INTO tenants (id, name, status) VALUES ($1, 'Gerai Brand A', 'ACTIVE'), ($2, 'Gerai Brand B', 'ACTIVE')", [tenantA, tenantB]);
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await adminPool.query("INSERT INTO outlets (id, tenant_id, name) VALUES ($1, $2, 'Outlet Brand A')", [outletA, tenantA]);
  await adminPool.query(
    `INSERT INTO outlet_pickup_points (tenant_id, outlet_id, pickup_address_id, pickup_address_label, origin_area_id, origin_area_label, is_default)
     VALUES ($1, $2, 'pickup-243', 'Gudang T243', 'origin-243', 'Coblong, Kota Bandung', true)`,
    [tenantA, outletA],
  );
});

afterAll(async () => {
  await clean();
  const client = await import("@/db/client") as unknown as { pool: Pool };
  await Promise.all([adminPool.end(), appPool.end(), client.pool.end()]);
});

// ------------------------------------------------------------------ tests

describe("logo upload validation", () => {
  it("reads the type and size from the magic bytes of PNG, JPEG and WebP", () => {
    expect(sniffLogo(png(640, 320))).toEqual({ mime: "image/png", width: 640, height: 320 });
    expect(sniffLogo(jpeg(800, 600))).toEqual({ mime: "image/jpeg", width: 800, height: 600 });
    expect(sniffLogo(webp(1000, 250))).toEqual({ mime: "image/webp", width: 1000, height: 250 });
    expect(sniffLogo(new TextEncoder().encode("GIF89a........................"))).toBeNull();
  });

  it("refuses SVG, a mismatched type, an oversize file, oversize dimensions and non-images", () => {
    const check = (bytes: Uint8Array, declaredType: string, name = "logo") => validateLogoUpload({ bytes, declaredType, name });
    expect(check(png(500, 500), "image/png", "logo.png")).toMatchObject({ ok: true });
    expect(check(jpeg(500, 500), "image/jpg", "logo.jpg")).toMatchObject({ ok: true });
    expect(check(webp(500, 500), "", "logo.webp")).toMatchObject({ ok: true });
    expect(check(svg, "image/svg+xml", "logo.svg")).toEqual({ ok: false, reason: "SVG" });
    // An SVG claiming to be a PNG is still refused, by name or by content.
    expect(check(svg, "image/png", "logo.png")).toEqual({ ok: false, reason: "SVG" });
    expect(check(png(10, 10), "image/png", "logo.svg")).toEqual({ ok: false, reason: "SVG" });
    expect(check(png(500, 500), "image/jpeg", "logo.jpg")).toEqual({ ok: false, reason: "TYPE_MISMATCH" });
    expect(check(new Uint8Array([...png(10, 10), ...new Uint8Array(200 * 1024)]), "image/png")).toEqual({ ok: false, reason: "TOO_LARGE" });
    expect(check(png(1001, 200), "image/png")).toEqual({ ok: false, reason: "DIMENSIONS" });
    expect(check(webp(200, 1001), "image/webp")).toEqual({ ok: false, reason: "DIMENSIONS" });
    expect(check(new TextEncoder().encode("%PDF-1.7 not an image at all........"), "image/png")).toEqual({ ok: false, reason: "UNSUPPORTED" });
    expect(check(new Uint8Array(), "image/png")).toEqual({ ok: false, reason: "EMPTY" });
  });
});

describe("profile rules", () => {
  const raw = { businessCategory: "", csEmail: "", labelNote: "", website: "" };
  it("normalises and clears optional values", () => {
    expect(parseGeraiProfile({ businessCategory: "FASHION", csEmail: " CS@Gerai.ID ", labelNote: "  Terima   kasih ", website: "gerai.id" }))
      .toEqual({ ok: true, value: { businessCategory: "FASHION", csEmail: "cs@gerai.id", labelNote: "Terima kasih", website: "https://gerai.id/" } });
    expect(parseGeraiProfile(raw)).toEqual({ ok: true, value: { businessCategory: null, csEmail: null, labelNote: null, website: null } });
  });
  it("refuses http, a bad email, an unknown category and a catatan over 60 characters", () => {
    const result = parseGeraiProfile({ businessCategory: "SKINCARE", csEmail: "cs@", labelNote: "x".repeat(61), website: "http://gerai.id" });
    expect(result.ok).toBe(false);
    expect(result.ok ? {} : Object.keys(result.errors).sort()).toEqual(["businessCategory", "csEmail", "labelNote", "website"]);
    expect(parseGeraiProfile({ ...raw, website: "javascript:alert(1)" }).ok).toBe(false);
    expect(parseGeraiProfile({ ...raw, website: "https://user:pw@gerai.id" }).ok).toBe(false);
  });
});

describe("saving the brand (actions, repository, RLS)", () => {
  it("uploads, serves and removes the logo for the Tenant Admin; the Operator reads it", async () => {
    const { uploadGeraiLogo, removeGeraiLogo } = await import("@/app/app/pengaturan/actions");
    principal.current = as(adminA, tenantA, "TENANT_ADMIN");
    const form = new FormData();
    form.set("logo", new File([png(400, 200)], "logo.png", { type: "image/png" }));
    expect(await uploadGeraiLogo({}, form)).toMatchObject({ saved: "uploaded" });

    const brand = await asUser(operatorA, tenantA, loadTenantBrand);
    expect(brand.logo?.mime).toBe("image/png");
    expect(brand.logo?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await asUser(operatorA, tenantA, loadPrintBrand)).logoSrc).toBe(geraiLogoSrc(brand.logo!.sha256));
    // Another tenant's admin sees nothing of it.
    expect(await asUser(adminB, tenantB, loadTenantLogo)).toBeNull();
    expect((await asUser(adminB, tenantB, (tx) => tx.execute(sql`SELECT tenant_id FROM tenant_brand_settings`))).rows).toEqual([]);

    const svgForm = new FormData();
    svgForm.set("logo", new File([svg], "logo.svg", { type: "image/svg+xml" }));
    expect(await uploadGeraiLogo({}, svgForm)).toMatchObject({ error: expect.stringContaining("SVG") });
    // The stored logo is untouched by the refusal.
    expect((await asUser(adminA, tenantA, loadTenantBrand)).logo?.sha256).toBe(brand.logo!.sha256);

    const confirm = new FormData();
    confirm.set("confirmation", "remove-logo");
    expect(await removeGeraiLogo({}, confirm)).toMatchObject({ saved: "removed" });
    expect((await asUser(adminA, tenantA, loadTenantBrand)).logo).toBeNull();
  });

  it("refuses an Operator in the action, the repository and the database", async () => {
    const { uploadGeraiLogo, saveGeraiProfile } = await import("@/app/app/pengaturan/actions");
    principal.current = as(operatorA, tenantA, "OPERATOR");
    const form = new FormData();
    form.set("logo", new File([png(10, 10)], "logo.png", { type: "image/png" }));
    await expect(uploadGeraiLogo({}, form)).rejects.toThrow("REDIRECT:/app");
    await expect(saveGeraiProfile({}, new FormData())).rejects.toThrow("REDIRECT:/app");
    await expect(asUser(operatorA, tenantA, (tx, context) => saveTenantLogo(tx, context, { bytes: png(10, 10), declaredType: "image/png", name: "l.png" })))
      .rejects.toThrow("not authorized");
    await expect(asUser(operatorA, tenantA, (tx) => tx.execute(sql`INSERT INTO tenant_brand_settings (tenant_id, label_note, updated_by_user_id)
      VALUES (${tenantA}, 'Operator', ${operatorA})`))).rejects.toMatchObject({ cause: { code: "42501" } });
    // Admin B cannot write a row for tenant A.
    await expect(asUser(adminB, tenantB, (tx) => tx.execute(sql`INSERT INTO tenant_brand_settings (tenant_id, updated_by_user_id)
      VALUES (${tenantA}, ${adminB})`))).rejects.toMatchObject({ cause: { code: "42501" } });
    const { rows } = await adminPool.query("SELECT count(*)::int AS n FROM tenant_brand_settings WHERE tenant_id = $1", [tenantA]);
    expect(rows[0].n).toBe(0);
  });

  it("saves the profile, keeps the logo, and refuses invalid values", async () => {
    const { saveGeraiProfile } = await import("@/app/app/pengaturan/actions");
    principal.current = as(adminA, tenantA, "TENANT_ADMIN");
    await asUser(adminA, tenantA, (tx, context) => saveTenantLogo(tx, context, { bytes: png(64, 64), declaredType: "image/png", name: "l.png" }));
    const form = new FormData();
    form.set("businessCategory", "BEAUTY");
    form.set("csEmail", "cs@gerai.id");
    form.set("labelNote", "Terima kasih");
    form.set("website", "https://gerai.id");
    expect(await saveGeraiProfile({}, form)).toMatchObject({ saved: true });
    const brand = await asUser(operatorA, tenantA, loadTenantBrand);
    expect(brand).toMatchObject({ businessCategory: "BEAUTY", csEmail: "cs@gerai.id", labelNote: "Terima kasih", website: "https://gerai.id/" });
    expect(brand.logo).not.toBeNull();

    form.set("website", "http://gerai.id");
    expect(await saveGeraiProfile({}, form)).toMatchObject({ fieldErrors: { website: expect.any(String) } });
    expect((await asUser(adminA, tenantA, loadTenantBrand)).website).toBe("https://gerai.id/");
  });
});

describe("the logo route handler", () => {
  it("serves only the session tenant's logo, with private caching, an ETag and nosniff", async () => {
    const { GET } = await import("@/app/app/brand/logo/route");
    const request = (headers: Record<string, string> = {}) => new Request("http://127.0.0.1/app/brand/logo?v=x", { headers });

    expect((await GET(request())).status).toBe(401);

    principal.current = as(operatorA, tenantA, "OPERATOR");
    expect((await GET(request())).status).toBe(404);

    const bytes = png(120, 60);
    const { sha256 } = await asUser(adminA, tenantA, (tx, context) => saveTenantLogo(tx, context, { bytes, declaredType: "image/png", name: "l.png" }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(response.headers.get("etag")).toBe(`"${sha256}"`);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect((await GET(request({ "if-none-match": `"${sha256}"` }))).status).toBe(304);

    // Tenant B's session never reaches tenant A's logo, whatever the URL says.
    principal.current = as(adminB, tenantB, "TENANT_ADMIN");
    expect((await GET(request())).status).toBe(404);
  });

  it("T-247 (L3): serves a kept version by sha after the logo is replaced or removed, for its own tenant only", async () => {
    const { GET } = await import("@/app/app/brand/logo/route");
    const version = (sha: string) => GET(new Request(`http://127.0.0.1/app/brand/logo?sha=${sha}`));
    const first = png(120, 60);
    const { sha256 } = await asUser(adminA, tenantA, (tx, context) => saveTenantLogo(tx, context, { bytes: first, declaredType: "image/png", name: "l.png" }));
    await asUser(adminA, tenantA, (tx, context) => saveTenantLogo(tx, context, { bytes: png(200, 100), declaredType: "image/png", name: "l2.png" }));
    const { removeTenantLogo } = await import("@/db/tenant-settings-repository");
    await asUser(adminA, tenantA, removeTenantLogo);

    principal.current = as(operatorA, tenantA, "OPERATOR");
    const response = await version(sha256);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(first);
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // The current logo is gone; the versions are not.
    expect((await GET(new Request("http://127.0.0.1/app/brand/logo"))).status).toBe(404);
    const { rows } = await adminPool.query("SELECT count(*)::int AS n FROM tenant_logo_versions WHERE tenant_id = $1", [tenantA]);
    expect(rows[0].n).toBe(2);
    expect((await version("zz")).status).toBe(404);

    principal.current = as(adminB, tenantB, "TENANT_ADMIN");
    expect((await version(sha256)).status).toBe(404);
    // Append-only for the runtime role, and never written by an Operator or another tenant.
    const attempt = (user: string, tenant: string, statement: ReturnType<typeof sql>) =>
      asUser(user, tenant, (tx) => tx.execute(statement)).then(() => "accepted", (error) => error.cause?.code ?? error.code);
    expect(await attempt(adminA, tenantA, sql`UPDATE tenant_logo_versions SET mime = 'image/png'`)).toBe("42501");
    expect(await attempt(adminA, tenantA, sql`DELETE FROM tenant_logo_versions`)).toBe("42501");
    expect(await attempt(operatorA, tenantA, sql`INSERT INTO tenant_logo_versions (tenant_id, sha256, bytes, mime, created_by_user_id)
      VALUES (${tenantA}, ${"b".repeat(64)}, '\\x89'::bytea, 'image/png', ${operatorA})`)).toBe("42501");
    expect(await attempt(adminB, tenantB, sql`INSERT INTO tenant_logo_versions (tenant_id, sha256, bytes, mime, created_by_user_id)
      VALUES (${tenantA}, ${"b".repeat(64)}, '\\x89'::bytea, 'image/png', ${adminB})`)).toBe("42501");
  });
});

describe("label sheet brand", () => {
  it("prints the gerai logo and the catatan resi per switch without moving a row, at both sizes", () => {
    for (const size of ["10x15", "10x10"] as const) {
      const plain = renderLabel(size, NO_GERAI_BRAND);
      const branded = renderLabel(size, BRAND);
      expect(packageRows(branded)).toEqual(packageRows(plain));
      expect(packageRows(branded)).toHaveLength(7);
      expect(packageSection(branded)).toContain('class="label-logo" src="/app/brand/logo?v=abc"');
      expect(packageSection(branded)).toContain("filter:grayscale(1)");
      expect(packageSection(branded)).toContain('class="label-note"');
      expect(packageSection(branded)).toContain("Terima kasih sudah belanja");
      // The sender line gives up its second line to the catatan only.
      expect(packageSection(branded)).toContain("-webkit-line-clamp:1");
      expect(packageSection(plain)).not.toContain("label-logo");
      expect(packageSection(plain)).not.toContain("label-note");

      const noLogo = renderLabel(size, BRAND, off(size, "geraiLogo"));
      expect(packageSection(noLogo)).not.toContain("label-logo");
      expect(packageSection(noLogo)).toContain("label-note");
      const noNote = renderLabel(size, BRAND, off(size, "labelNote"));
      expect(packageSection(noNote)).toContain("label-logo");
      expect(packageSection(noNote)).not.toContain("label-note");
      expect(packageSection(noNote)).not.toContain("-webkit-line-clamp:1");
      // Courier, AWB, recipient and payment still print.
      for (const expected of ["JX0012345243", "Budi Penerima", "NON-COD"]) expect(packageSection(branded)).toContain(expected);
    }
    // The stub never carries the brand.
    expect(renderLabel("10x15", BRAND).match(/label-logo/g)).toHaveLength(1);
  });

  it("prints the courier's print logo per switch, and the name as text without one", () => {
    const withLogo = packageSection(renderLabel("10x15", NO_GERAI_BRAND));
    expect(withLogo).toContain('alt="JNE" class="label-courier-logo" src="/couriers/print/jne.svg"');
    expect(withLogo).toContain('<span class="label-service">REG</span>');
    const switchedOff = packageSection(renderLabel("10x10", NO_GERAI_BRAND, off("10x10", "courierLogo")));
    expect(switchedOff).not.toContain("label-courier-logo");
    expect(switchedOff).toContain('<p class="label-courier">JNE <span class="label-service">REG</span></p>');
    const unknown = packageSection(renderLabel("10x15", NO_GERAI_BRAND, undefined, { ...LABEL, courier: "KurirBaru", providerService: "EXPRESS" }));
    expect(unknown).not.toContain("label-courier-logo");
    expect(unknown).toContain('<p class="label-courier">KurirBaru <span class="label-service">EXPRESS</span></p>');
    expect(courierPrintLogoSrc("Ninja")).toBeNull();
    expect(courierPrintLogoSrc("SiCepat")).toBe("/couriers/print/sicepat.svg");
    expect(courierPrintLogoSrc("JNECargo")).toBe("/couriers/print/jne.svg");
    expect(packageRows(renderLabel("10x15", NO_GERAI_BRAND))).toEqual(packageRows(renderLabel("10x15", NO_GERAI_BRAND, off("10x15", "courierLogo"))));
  });

  it("saves the switches and the default size; a row without them reads everything on", async () => {
    const { saveLabelSettings } = await import("@/app/app/pengaturan/actions");
    expect(await asUser(operatorA, tenantA, loadTenantLabelFields)).toEqual(DEFAULT_LABEL_FIELDS_BY_SIZE);
    expect(DEFAULT_LABEL_FIELDS).toMatchObject({ courierLogo: true, geraiLogo: true, labelNote: true });
    principal.current = as(adminA, tenantA, "TENANT_ADMIN");
    const fields = off("10x10", "geraiLogo");
    expect(await saveLabelSettings({}, labelForm(fields, "A4"))).toMatchObject({ error: expect.any(String) });
    // A form without the default size (older editor) saves the switches and leaves the size.
    expect(await saveLabelSettings({}, labelForm(fields))).toMatchObject({ saved: true });
    expect((await asUser(operatorA, tenantA, loadPrintBrand)).defaultLabelSize).toBe("10x15");
    expect(await saveLabelSettings({}, labelForm(fields, "10x10"))).toMatchObject({ saved: true });
    expect(await asUser(operatorA, tenantA, loadTenantLabelFields)).toEqual(fields);
    expect((await asUser(operatorA, tenantA, loadPrintBrand)).defaultLabelSize).toBe("10x10");
  });
});

describe("invoice brand", () => {
  const invoice = {
    collectionMode: "NON_COD",
    courierCollectionIdr: null,
    declaredValueIdr: 150_000,
    document: {
      courierService: "JNE REG",
      deliveryEstimate: "1-2 hari",
      gerai: { address: "Jl. Kenanga 5", name: "Gerai Nota", whatsapp: "081234567890" },
      items: [{ name: "Kain batik", quantity: 2 }],
      recipient: { city: "Menteng", name: "Penerima" },
      resi: "JNE-T243-000001",
      sender: { city: "Menteng", name: "Gerai", phone: "081211110000" },
      weightGrams: 1_250,
    },
    id: "00000000-0000-4000-8000-000000000243",
    insuranceIdr: 0,
    invoiceNumber: "INV-GC-10243",
    issuedAt: new Date("2026-09-26T03:13:00.000Z"),
    issuedByUserId: "user-1",
    logoSha256: null,
    shipmentId: "00000000-0000-4000-8000-000000000244",
    shippingChargeIdr: 8_000,
    templateVersion: 1,
    totalIdr: 8_000,
  } as ShipmentInvoice;

  it("shows the logo version recorded at issuance, never the gerai's current logo (T-247 L3)", () => {
    const render = (brand: GeraiBrand, logoSha256: string | null) => renderToStaticMarkup(createElement(GeraiBrandProvider, { value: brand },
      createElement(InvoiceSheet, { invoice: { ...invoice, logoSha256 }, medium: "80mm" })));
    const sha = "a".repeat(64);
    expect(render(NO_GERAI_BRAND, sha)).toMatch(new RegExp(`<section class="invoice-block-gerai"><img alt="" class="invoice-logo" src="/app/brand/logo\\?sha=${sha}"/><p class="invoice-gerai-name">`));
    // An invoice issued without a logo (or before 0068) prints none, whatever the gerai has now.
    expect(render(BRAND, null)).not.toContain("invoice-logo");
    expect(render(BRAND, "not-a-sha")).not.toContain("invoice-logo");
  });
});

describe("Mitra kurir", () => {
  const services = [
    { providerService: "JNE" }, { providerService: "JNECargo" }, { providerService: "SiCepat" },
    { providerService: "SAPLite" }, { providerService: "KurirBaru" },
  ];

  it("hides switched-off couriers' services and keeps an unknown courier visible", () => {
    expect(filterTenantCourierServices(services, [])).toEqual(services);
    expect(filterTenantCourierServices(services, ["JNE", "SAP"]).map((service) => service.providerService)).toEqual(["SiCepat", "KurirBaru"]);
    expect(SELECTABLE_COURIERS as readonly string[]).not.toContain("Ninja");
  });

  it("saves per tenant, refuses switching every courier off and forged forms, and refuses an Operator", async () => {
    const { saveCourierPreferences } = await import("@/app/app/pengaturan/actions");
    principal.current = as(adminA, tenantA, "TENANT_ADMIN");
    expect(await saveCourierPreferences({}, courierForm(["JNE", "spx"]))).toMatchObject({ saved: true });
    expect(await asUser(operatorA, tenantA, loadTenantDisabledCouriers)).toEqual(["JNE", "spx"]);
    expect(await asUser(adminB, tenantB, loadTenantDisabledCouriers)).toEqual([]);

    expect(await saveCourierPreferences({}, courierForm(SELECTABLE_COURIERS))).toMatchObject({ error: "Aktifkan minimal satu kurir." });
    const forged = courierForm([]);
    forged.set("kurir.JNE", "off");
    expect(await saveCourierPreferences({}, forged)).toMatchObject({ error: expect.any(String) });
    expect(await asUser(adminA, tenantA, loadTenantDisabledCouriers)).toEqual(["JNE", "spx"]);

    principal.current = as(operatorA, tenantA, "OPERATOR");
    await expect(saveCourierPreferences({}, courierForm([]))).rejects.toThrow("REDIRECT:/app");
  });
});

describe("pickup notes", () => {
  const notesForm = (values: Record<string, string>, pickupAddressId = "pickup-243") => {
    const form = new FormData();
    form.set("outletId", outletA);
    form.set("pickupAddressId", pickupAddressId);
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    return form;
  };

  it("saves the Tenant Admin's internal notes, normalises the phone and shows them on the point", async () => {
    const { savePickupPointNotes } = await import("@/app/app/pengaturan/actions");
    principal.current = as(adminA, tenantA, "TENANT_ADMIN");
    expect(await savePickupPointNotes({}, notesForm({
      accessNote: "Pintu samping,\nhubungi PIC", picName: "Budi Santoso", picPhone: "+62 812-3456-7890", schedule: "Senin–Sabtu 11.30",
    }))).toMatchObject({ success: true });
    const [point] = await asUser(operatorA, tenantA, (tx, context) => listOutletPickupPoints(tx, context, outletA));
    expect(point.notes).toEqual({ accessNote: "Pintu samping, hubungi PIC", picName: "Budi Santoso", picPhone: "081234567890", schedule: "Senin–Sabtu 11.30" });

    expect(await savePickupPointNotes({}, notesForm({ picPhone: "12345" }))).toMatchObject({ errors: { picPhone: expect.any(String) } });
    expect(await savePickupPointNotes({}, notesForm({ picName: "x".repeat(81) }))).toMatchObject({ errors: { picName: expect.any(String) } });
    // A point of another outlet (or tenant) is refused, and nothing changes.
    expect(await savePickupPointNotes({}, notesForm({ picName: "X" }, "pickup-lain"))).not.toMatchObject({ success: true });
    // Emptied fields are cleared.
    expect(await savePickupPointNotes({}, notesForm({ picName: "Budi Santoso" }))).toMatchObject({ success: true });
    const [cleared] = await asUser(adminA, tenantA, (tx, context) => listOutletPickupPoints(tx, context, outletA));
    expect(cleared.notes).toEqual({ accessNote: null, picName: "Budi Santoso", picPhone: null, schedule: null });

    principal.current = as(operatorA, tenantA, "OPERATOR");
    await expect(savePickupPointNotes({}, notesForm({ picName: "Operator" }))).rejects.toThrow("REDIRECT:/app");
    principal.current = as(adminB, tenantB, "TENANT_ADMIN");
    expect(await savePickupPointNotes({}, notesForm({ picName: "Tenant B" }))).not.toMatchObject({ success: true });
    const { rows } = await adminPool.query("SELECT pic_name FROM outlet_pickup_points WHERE tenant_id = $1", [tenantA]);
    expect(rows).toEqual([{ pic_name: "Budi Santoso" }]);
  });
});
