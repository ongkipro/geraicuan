import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";

import {
  createShipmentDraft,
  DraftSubmissionConflictError,
  OutletUnavailableError,
} from "@/db/shipment-draft-repository";
import { withTenantContext } from "@/db/tenant-context";
import * as schema from "@/db/schema";
import { validateShipmentDraft } from "@/lib/shipment-draft";
import { BULK_TEMPLATE_HEADERS } from "@/lib/bulk-shipment-intake-contract";
import { deriveBulkRowSubmissionId, previewBulkShipmentCsv } from "@/lib/bulk-shipment-intake";
import {
  BulkImportRateLimitedError,
  enforceBulkImportRateLimit,
} from "@/lib/bulk-import-rate-limit";
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
const adminDb = drizzle({ client: adminPool, schema });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0000-0000-000000000101";
const tenantB = "00000000-0000-0000-0000-000000000102";
const outletA = "00000000-0000-0000-0000-000000000111";
const outletB = "00000000-0000-0000-0000-000000000112";

function submission(values: Record<string, string> = {}) {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    declaredValue: "150.000",
    destinationAreaId: "3171010",
    destinationAreaLabel: "Gambir, Jakarta Pusat",
    outletId: outletA,
    packageContent: "Pakaian",
    packageHeightCm: "",
    packageLengthCm: "",
    packageQuantity: "1",
    packageWeightGrams: "500",
    packageWidthCm: "",
    paymentType: "NON_COD",
    recipientAddress: "Jl. Medan Merdeka Barat 1",
    recipientName: "Penerima",
    recipientPhone: "+62 812-3456-7890",
    senderAddress: "Jl. Asia Afrika 8",
    senderName: "Pengirim",
    senderPhone: "0812 1234 5678",
    ...values,
  };

  for (const [key, value] of Object.entries(defaults)) formData.set(key, value);
  return formData;
}

function bulkCsv(rows: string[][]) {
  return [BULK_TEMPLATE_HEADERS.join(","), ...rows.map((row) => row.join(","))].join("\n");
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await adminPool.query(
    "TRUNCATE shipment_parties, shipment_drafts, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)",
    ["draft-user-a", "Draft User A", "draft-a@example.test", "draft-user-b", "Draft User B", "draft-b@example.test"],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE'), ($3, $4, 'ACTIVE')",
    [tenantA, "Draft Tenant A", tenantB, "Draft Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'OPERATOR'), ($3, $4, 'OPERATOR')",
    [tenantA, "draft-user-a", tenantB, "draft-user-b"],
  );
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
    [outletA, tenantA, "Draft Outlet A", "pickup-a", "origin-a", outletB, tenantB, "Draft Outlet B", "pickup-b", "origin-b"],
  );
});

afterAll(async () => {
  await appPool.end();
  await adminPool.end();
});

describe("tenant shipment drafts", () => {
  it("persists a valid tenant-scoped draft and immutable parties", async () => {
    const validated = validateShipmentDraft(submission());
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const shipmentId = await withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
      createShipmentDraft(tx, context, validated.input),
    );

    const [draft] = await adminDb
      .select()
      .from(schema.shipmentDrafts)
      .where(eq(schema.shipmentDrafts.shipmentId, shipmentId));
    const parties = await adminDb
      .select({
        destinationAreaId: schema.shipmentParties.destinationAreaId,
        destinationAreaLabel: schema.shipmentParties.destinationAreaLabel,
        phone: schema.shipmentParties.phone,
        role: schema.shipmentParties.role,
      })
      .from(schema.shipmentParties)
      .where(eq(schema.shipmentParties.shipmentId, shipmentId));

    expect(draft).toMatchObject({
      declaredValueIdr: 150000,
      destinationAreaId: "3171010",
      isCod: false,
      packageHeightCm: null,
      packageWeightGrams: 500,
      tenantId: tenantA,
    });
    expect(parties).toHaveLength(2);
    expect(parties).toEqual(expect.arrayContaining([
      {
        destinationAreaId: null,
        destinationAreaLabel: null,
        phone: "081212345678",
        role: "SENDER",
      },
      {
        destinationAreaId: "3171010",
        destinationAreaLabel: "Gambir, Jakarta Pusat",
        phone: "+6281234567890",
        role: "RECIPIENT",
      },
    ]));

    await expect(
      withTenantContext(appDb, "draft-user-a", tenantA, (tx) =>
        tx
          .update(schema.shipmentParties)
          .set({ address: "Tidak boleh berubah" })
          .where(eq(schema.shipmentParties.shipmentId, shipmentId)),
      ),
    ).rejects.toThrow();

    const blockedCrossTenantUpdate = await withTenantContext(
      appDb,
      "draft-user-b",
      tenantB,
      (tx) =>
        tx
          .update(schema.shipmentDrafts)
          .set({ packageContent: "Tampered" })
          .where(eq(schema.shipmentDrafts.tenantId, tenantA))
          .returning({ shipmentId: schema.shipmentDrafts.shipmentId }),
    );
    expect(blockedCrossTenantUpdate).toEqual([]);

    const otherTenantRows = await withTenantContext(appDb, "draft-user-b", tenantB, (tx) =>
      tx.select().from(schema.shipmentDrafts),
    );
    expect(otherTenantRows).toEqual([]);
  });

  it("replays one canonical submission without creating duplicate rows", async () => {
    const validated = validateShipmentDraft(submission());
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const submissionId = "00000000-0000-4000-8000-000000000140";

    const created = await Promise.all([
      withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
        createShipmentDraft(tx, context, validated.input, submissionId)),
      withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
        createShipmentDraft(tx, context, validated.input, submissionId)),
    ]);

    expect(created).toEqual([submissionId, submissionId]);
    const shipmentRows = await adminDb
      .select({ id: schema.shipments.id })
      .from(schema.shipments)
      .where(eq(schema.shipments.id, submissionId));
    const draftRows = await adminDb
      .select({ id: schema.shipmentDrafts.shipmentId })
      .from(schema.shipmentDrafts)
      .where(eq(schema.shipmentDrafts.shipmentId, submissionId));
    const partyRows = await adminDb
      .select({ role: schema.shipmentParties.role })
      .from(schema.shipmentParties)
      .where(eq(schema.shipmentParties.shipmentId, submissionId));
    expect(shipmentRows).toHaveLength(1);
    expect(draftRows).toHaveLength(1);
    expect(partyRows).toHaveLength(2);

    await adminDb
      .update(schema.shipments)
      .set({ status: "ESTIMATED" })
      .where(eq(schema.shipments.id, submissionId));
    await adminDb
      .update(schema.outlets)
      .set({ defaultOriginAreaId: null, defaultPickupAddressId: null })
      .where(eq(schema.outlets.id, outletA));
    await expect(
      withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
        createShipmentDraft(tx, context, validated.input, submissionId)),
    ).resolves.toBe(submissionId);

    const changed = validateShipmentDraft(submission({ packageContent: "Isi berbeda" }));
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    await expect(
      withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
        createShipmentDraft(tx, context, changed.input, submissionId)),
    ).rejects.toBeInstanceOf(DraftSubmissionConflictError);
    await expect(
      withTenantContext(appDb, "draft-user-b", tenantB, (tx, context) =>
        createShipmentDraft(tx, context, { ...validated.input, outletId: outletB }, submissionId)),
    ).rejects.toBeInstanceOf(DraftSubmissionConflictError);
    await adminDb
      .update(schema.outlets)
      .set({ defaultOriginAreaId: "origin-a", defaultPickupAddressId: "pickup-a" })
      .where(eq(schema.outlets.id, outletA));
  });

  it("rejects invalid input and a cross-tenant outlet without persisting a shipment", async () => {
    const invalid = validateShipmentDraft(
      submission({
        destinationAreaId: "x".repeat(161),
        outletId: "not-a-uuid",
        paymentType: "COD",
        declaredValue: "0",
        recipientPhone: "not-a-phone",
      }),
    );
    expect(invalid).toMatchObject({
      ok: false,
      errors: {
        declaredValue: expect.any(String),
        destinationAreaId: expect.any(String),
        outletId: expect.any(String),
        recipientPhone: expect.any(String),
      },
    });

    const valid = validateShipmentDraft(submission({ outletId: outletB }));
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;

    const before = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);
    await expect(
      withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
        createShipmentDraft(tx, context, valid.input),
      ),
    ).rejects.toBeInstanceOf(OutletUnavailableError);
    const after = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);

    expect(after).toEqual(before);
  });

  it("rejects a configured-looking outlet whose private connection needs attention", async () => {
    await adminPool.query(
      `INSERT INTO mengantar_connections (tenant_id, outlet_id, secret_reference)
       VALUES ($1, $2, 'vault://noncanonical-private-reference')`,
      [tenantA, outletA],
    );
    try {
      const validated = validateShipmentDraft(submission());
      expect(validated.ok).toBe(true);
      if (!validated.ok) return;

      const before = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);
      await expect(
        withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
          createShipmentDraft(tx, context, validated.input)),
      ).rejects.toBeInstanceOf(OutletUnavailableError);
      const after = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);
      expect(after).toEqual(before);
    } finally {
      await adminPool.query(
        "DELETE FROM mengantar_connections WHERE tenant_id = $1 AND outlet_id = $2",
        [tenantA, outletA],
      );
    }
  });

  it("creates only CSV rows that passed validation in the tenant transaction", async () => {
    const validRow = [
      "Pengirim", "081212345678", "Jl. Asia Afrika 8", "Penerima", "081234567890",
      "Jl. Medan Merdeka Barat 1", "Gambir Jakarta Pusat", "Pakaian", "500",
      "1", "", "", "", "150000", "NON_COD",
    ];
    const invalidRow = [...validRow];
    invalidRow[4] = "not-a-phone";
    const preview = await previewBulkShipmentCsv(
      new File([bulkCsv([validRow, invalidRow])], "kiriman.csv", { type: "text/csv" }),
      outletA,
      async () => ({
        option: { areaId: "3171010", areaLabel: "Gambir, Jakarta Pusat" },
        status: "resolved",
      }),
    );

    expect("code" in preview).toBe(false);
    if ("code" in preview) return;
    expect(preview.validRows).toHaveLength(1);
    const bulkSubmissionId = "00000000-0000-4000-8000-000000000142";
    const before = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);
    for (let replay = 0; replay < 2; replay += 1) {
      await withTenantContext(appDb, "draft-user-a", tenantA, async (tx, context) => {
        for (const row of preview.validRows) {
          await createShipmentDraft(
            tx,
            context,
            row.input,
            deriveBulkRowSubmissionId(bulkSubmissionId, row.row),
          );
        }
      });
    }
    const after = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);

    expect(after).toHaveLength(before.length + 1);
    expect(after).toContainEqual({ id: deriveBulkRowSubmissionId(bulkSubmissionId, 2) });
    const otherTenantRows = await withTenantContext(appDb, "draft-user-b", tenantB, (tx) =>
      tx.select({ id: schema.shipments.id }).from(schema.shipments),
    );
    expect(otherTenantRows).toEqual([]);
  });
  it("keeps shipment quota when Better Auth prunes expired auth limiter rows", async () => {
    await adminPool.query("DELETE FROM shipment_rate_limits");
    await adminPool.query("DELETE FROM rate_limits");

    const attemptAt = Date.now() - 90_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(attemptAt);
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
          enforceBulkImportRateLimit(tx, context),
        );
      }
    } finally {
      clock.mockRestore();
    }

    await adminPool.query(
      `INSERT INTO rate_limits (id, key, count, last_request)
       VALUES ('auth-prune-probe', 'auth-prune-probe', 1, $1)`,
      [attemptAt],
    );
    const pruned = await adminPool.query<{ key: string }>(
      "DELETE FROM rate_limits WHERE last_request < $1 RETURNING key",
      [Date.now() - 60_000],
    );
    expect(pruned.rows).toEqual([{ key: "auth-prune-probe" }]);

    const persisted = await adminPool.query<{ count: number }>(
      `SELECT count
       FROM shipment_rate_limits
       WHERE tenant_id = $1 AND actor_id = $2 AND operation = 'bulk-import'`,
      [tenantA, "draft-user-a"],
    );
    expect(persisted.rows).toEqual([{ count: 5 }]);
    await expect(
      withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
        enforceBulkImportRateLimit(tx, context),
      ),
    ).rejects.toBeInstanceOf(BulkImportRateLimitedError);

    const otherTenantLimits = await withTenantContext(
      appDb,
      "draft-user-b",
      tenantB,
      (tx) => tx.select().from(schema.shipmentRateLimits),
    );
    expect(otherTenantLimits).toEqual([]);
  });

  it("rejects a stale selected contact revision before writing a draft", async () => {
    const contactId = randomUUID();
    const addressId = randomUUID();
    const submissionId = randomUUID();
    const selectedAt = new Date("2026-09-01T00:00:00.000Z");
    await adminPool.query(
      `INSERT INTO contacts (id, tenant_id, name, phone, is_sender, is_recipient, updated_at)
       VALUES ($1, $2, 'Selected sender', '081212345678', true, false, $3)`,
      [contactId, tenantA, selectedAt],
    );
    await adminPool.query(
      `INSERT INTO contact_addresses (
         id, tenant_id, contact_id, label, address, is_primary, updated_at
       ) VALUES ($1, $2, $3, 'Primary', 'Selected sender address', true, $4)`,
      [addressId, tenantA, contactId, selectedAt],
    );
    await adminPool.query(
      "UPDATE contacts SET name = 'Updated sender', updated_at = $2 WHERE id = $1",
      [contactId, new Date("2026-09-01T00:01:00.000Z")],
    );

    vi.resetModules();
    vi.doMock("@/db/client", () => ({ db: appDb }));
    vi.doMock("@/lib/cms-auth", () => ({
      CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
      requireCmsScope: vi.fn(async () => ({
        scope: "tenant",
        userId: "draft-user-a",
        tenantId: tenantA,
        role: "OPERATOR",
      })),
    }));
    vi.doMock("next/navigation", () => ({ redirect: vi.fn() }));
    vi.doMock("@/app/app/location-actions", () => ({
      validateMengantarDestinationAreaSelection: vi.fn(async (_outletId, _query, areaId, areaLabel) => ({
        option: { areaId, areaLabel },
        success: true,
      })),
    }));
    const { saveShipmentDraft } = await import("@/app/app/actions");
    const formData = submission();
    formData.set("submissionId", submissionId);
    formData.set("destinationMode", "manual");
    formData.set("areaOutletId", outletA);
    formData.set("areaQuery", "Gambir Jakarta");
    formData.set("areaId", "3171010");
    formData.set("areaLabel", "Gambir, Jakarta Pusat");
    formData.set("senderContactId", contactId);
    formData.set("senderContactAddressId", addressId);
    formData.set("senderContactUpdatedAt", selectedAt.toISOString());
    formData.set("senderContactAddressUpdatedAt", selectedAt.toISOString());
    formData.set("senderContactSnapshotName", "Selected sender");
    formData.set("senderContactSnapshotPhone", "081212345678");
    formData.set("senderContactSnapshotAddress", "Selected sender address");
    formData.set("senderName", "Selected sender");
    formData.set("senderPhone", "081212345678");
    formData.set("senderAddress", "Manual sender address override");

    const before = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);
    await expect(saveShipmentDraft({}, formData)).resolves.toMatchObject({
      errors: { senderContactSelection: expect.any(String) },
    });
    const after = await adminDb.select({ id: schema.shipments.id }).from(schema.shipments);
    expect(after).toEqual(before);

    const validated = validateShipmentDraft(formData);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    await withTenantContext(appDb, "draft-user-a", tenantA, (tx, context) =>
      createShipmentDraft(tx, context, validated.input, submissionId),
    );
    await expect(saveShipmentDraft({}, formData)).resolves.toBeUndefined();
    const replayRows = await adminDb
      .select({ id: schema.shipments.id })
      .from(schema.shipments)
      .where(eq(schema.shipments.id, submissionId));
    expect(replayRows).toEqual([{ id: submissionId }]);
  });

  it("commits invalid-outlet bulk attempts before returning the generic error", async () => {
    await adminPool.query("DELETE FROM shipment_rate_limits");
    vi.resetModules();
    vi.doMock("@/db/client", () => ({ db: appDb }));
    vi.doMock("@/lib/cms-auth", () => ({
      CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
      requireCmsScope: vi.fn(async () => ({
        scope: "tenant",
        userId: "draft-user-a",
        tenantId: tenantA,
        role: "OPERATOR",
      })),
    }));
    vi.doMock("next/navigation", () => ({
      redirect: vi.fn(() => {
        throw new Error("Unexpected redirect.");
      }),
    }));
    const { uploadBulkIntake } = await import("@/app/app/impor/actions");

    async function invalidOutletAttempt() {
      const formData = new FormData();
      formData.set("csv", new File(["unused"], "kiriman.csv", { type: "text/csv" }));
      formData.set("outletId", outletB);
      return uploadBulkIntake({}, formData);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(invalidOutletAttempt()).resolves.toEqual({
        fileError: { code: "file", field: "outletId", message: "Pilih outlet asal." },
      });
    }

    const persisted = await adminPool.query<{ count: number }>(
      `SELECT count
       FROM shipment_rate_limits
       WHERE tenant_id = $1 AND actor_id = $2 AND operation = 'bulk-import'`,
      [tenantA, "draft-user-a"],
    );
    expect(persisted.rows).toEqual([{ count: 5 }]);
    await expect(invalidOutletAttempt()).resolves.toEqual({
      fileError: {
        code: "file",
        field: "csv",
        message: "Terlalu banyak percobaan impor. Coba lagi dalam beberapa menit.",
      },
    });

    const afterRejection = await adminPool.query<{ count: number }>(
      `SELECT count
       FROM shipment_rate_limits
       WHERE tenant_id = $1 AND actor_id = $2 AND operation = 'bulk-import'`,
      [tenantA, "draft-user-a"],
    );
    expect(afterRejection.rows).toEqual([{ count: 5 }]);
  });
});
