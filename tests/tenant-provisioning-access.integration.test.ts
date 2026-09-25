import { randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import {
  authorizeManagedMengantarCredentialMutation,
  replaceManagedMengantarApiKey,
} from "@/db/managed-secret-repository";
import { addOutletPickupPoint, listOutletPickupPoints } from "@/db/outlet-pickup-point-repository";
import { listOutletReadiness } from "@/db/outlet-readiness-repository";
import { loadTenantShipmentPrefix, saveTenantShipmentPrefix } from "@/db/shipment-number-repository";
import { withTenantContext, type TenantTransaction } from "@/db/tenant-context";
import { resolveMengantarAccountCredentials } from "@/lib/mengantar-credentials";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * T-182 step 2 (PR-60, DATA-11): row-level security lets a PROVISIONING tenant's
 * admin configure its outlet, pickup points, own Mengantar connection and
 * profile — and still refuses every write that ships, even when the application
 * gate is bypassed and the runtime role writes directly.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Provisioning access tests require geraicuan_test.");
}

const admin = new Pool({ connectionString: databaseUrl });
const tenantId = "18220000-0000-4000-8000-000000000001";
const outletId = "18220000-0000-4000-8000-000000000011";
const userId = "t182-provisioning-admin";
const setup = { allowPendingApproval: true } as const;

async function cleanup() {
  await admin.query("DELETE FROM audit_events WHERE tenant_id = $1 OR target_id = $2", [tenantId, tenantId]);
  for (const table of [
    "mengantar_credential_rate_limits", "managed_secret_payloads", "mengantar_connections",
    "outlet_pickup_points", "contacts", "shipment_rate_limits", "outlets", "memberships",
    "tenant_shipment_counters",
  ]) {
    await admin.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  }
  await admin.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
  await admin.query("DELETE FROM users WHERE id = $1", [userId]);
}

beforeAll(async () => {
  process.env.MENGANTAR_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 91).toString("base64");
  process.env.MENGANTAR_BASE_URL = "https://platform.example.test";
  await ensureIntegrationRuntimeRole(admin, process.env.APP_DATABASE_URL);
  await cleanup();
  await admin.query(
    "INSERT INTO users (id, name, email, email_verified) VALUES ($1, 'Provisioning Admin', 't182-provisioning@example.test', true)",
    [userId],
  );
  await admin.query(
    "INSERT INTO tenants (id, name, status, mengantar_credential_policy) VALUES ($1, 'T182 Provisioning Store', 'PROVISIONING', 'PRIVATE_ONLY')",
    [tenantId],
  );
  await admin.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN')", [tenantId, userId]);
  await admin.query("INSERT INTO outlets (id, tenant_id, name) VALUES ($1, $2, 'Provisioning Outlet')", [outletId, tenantId]);
});

afterAll(async () => {
  await cleanup();
  await admin.end();
});

function inSetup<T>(work: (tx: TenantTransaction) => Promise<T>) {
  return withTenantContext(db, userId, tenantId, (tx) => work(tx), setup);
}

async function refusal(work: (tx: TenantTransaction) => Promise<unknown>) {
  return inSetup(work).then(
    () => "accepted",
    (error: Error & { cause?: Error }) => (error.cause ?? error).message,
  );
}

describe("a PROVISIONING tenant configures its store (PR-60)", () => {
  it("reads and updates its own outlet", async () => {
    await inSetup((tx) => tx.execute(sql`UPDATE outlets SET name = 'Provisioning Outlet Renamed' WHERE id = ${outletId}`));
    const readiness = await withTenantContext(db, userId, tenantId, listOutletReadiness, setup);
    expect(readiness).toMatchObject([{ id: outletId, name: "Provisioning Outlet Renamed", privateConnectionRequired: true }]);
    expect(readiness[0].readinessStatus).toBe("needs_attention");
  });

  it("adds a pickup point", async () => {
    await withTenantContext(db, userId, tenantId, (tx, context) => addOutletPickupPoint(tx, context, {
      originAreaId: "prov-origin",
      originAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
      outletId,
      pickupAddressId: "prov-pickup",
      pickupAddressLabel: "Gudang Toko, Jalan Contoh 1",
    }), setup);
    const points = await withTenantContext(db, userId, tenantId, (tx, context) => listOutletPickupPoints(tx, context, outletId), setup);
    expect(points).toMatchObject([{ isDefault: true, pickupAddressId: "prov-pickup" }]);
  });

  it("stores its own Mengantar API key and resolves only that private account", async () => {
    const apiKey = randomBytes(24).toString("base64url");
    await withTenantContext(db, userId, tenantId, (tx, context) =>
      authorizeManagedMengantarCredentialMutation(tx, context, outletId), setup);
    await withTenantContext(db, userId, tenantId, (tx, context) =>
      replaceManagedMengantarApiKey(tx, context, outletId, () => apiKey), setup);
    const resolved = await withTenantContext(db, userId, tenantId, (tx, context) =>
      resolveMengantarAccountCredentials(tx, context, outletId), setup);
    expect(resolved.source).toBe("private");
    expect(resolved.credentials.apiKey).toBe(apiKey);
    const audit = await admin.query("SELECT action FROM audit_events WHERE tenant_id = $1 ORDER BY created_at", [tenantId]);
    expect(audit.rows.map((row) => row.action)).toContain("MENGANTAR_CREDENTIAL_CREATED");
  });

  it("saves its profile prefix", async () => {
    await withTenantContext(db, userId, tenantId, (tx, context) =>
      saveTenantShipmentPrefix(tx, context, "PRV", "18220000-0000-4000-8000-0000000000f1"), setup);
    await expect(withTenantContext(db, userId, tenantId, loadTenantShipmentPrefix, setup))
      .resolves.toMatchObject({ prefix: "PRV" });
  });
});

describe("no shipping-related policy lets a PROVISIONING tenant write (DATA-11)", () => {
  const shipmentId = "18220000-0000-4000-8000-000000000101";

  it.each([
    ["a shipment", sql`INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES (${shipmentId}, ${tenantId}, ${outletId}, 'DRAFT')`],
    ["a contact", sql`INSERT INTO contacts (tenant_id, name, phone) VALUES (${tenantId}, 'Kontak', '081234567890')`],
    ["a shipment rate limit", sql`INSERT INTO shipment_rate_limits (tenant_id, actor_id, operation, count, last_request) VALUES (${tenantId}, ${userId}, 'estimate', 1, 1)`],
    ["a private provider batch", sql`INSERT INTO provider_batches (tenant_id, outlet_id, pickup_address_id, courier, credential_source, provider_account_key, idempotency_key) VALUES (${tenantId}, ${outletId}, 'prov-pickup', 'JNE', 'private', ${"a".repeat(64)}, ${"c".repeat(64)})`],
    ["a settlement pull", sql`INSERT INTO provider_settlement_pulls (tenant_id, outlet_id, actor_user_id, credential_source, provider_account_key, period_start, period_end, matched_item_count, matched_status_count) VALUES (${tenantId}, ${outletId}, ${userId}, 'private', ${"a".repeat(64)}, now() - interval '1 day', now(), 0, 0)`],
  ])("refuses %s", async (_label, statement) => {
    expect(await refusal((tx) => tx.execute(statement))).toMatch(/row-level security|not authorized/);
  });

  it("left no shipment, draft, estimate, COD total, ledger entry or print event behind", async () => {
    const counts = await admin.query(`
      SELECT (SELECT count(*) FROM shipments WHERE tenant_id = $1)::int
        + (SELECT count(*) FROM shipment_drafts WHERE tenant_id = $1)::int
        + (SELECT count(*) FROM shipment_estimate_snapshots WHERE tenant_id = $1)::int
        + (SELECT count(*) FROM shipment_cod_totals WHERE tenant_id = $1)::int
        + (SELECT count(*) FROM ledger_entries WHERE tenant_id = $1)::int
        + (SELECT count(*) FROM print_events WHERE tenant_id = $1)::int AS n`, [tenantId]);
    expect(counts.rows[0].n).toBe(0);
  });

  it("cannot approve itself or relax its credential policy", async () => {
    // Without the platform-admin setting the update matches no row.
    await inSetup((tx) => tx.execute(sql`UPDATE tenants SET status = 'ACTIVE' WHERE id = ${tenantId}`));
    expect(await refusal((tx) => tx.execute(sql`UPDATE tenants SET mengantar_credential_policy = 'PLATFORM_DEFAULT_ALLOWED' WHERE id = ${tenantId}`)))
      .toMatch(/permission denied/);
    const tenant = await admin.query("SELECT status, mengantar_credential_policy FROM tenants WHERE id = $1", [tenantId]);
    expect(tenant.rows[0]).toEqual({ mengantar_credential_policy: "PRIVATE_ONLY", status: "PROVISIONING" });
    // Even with the platform-admin setting, the runtime role may not move it out of PROVISIONING.
    expect(await refusal(async (tx) => {
      await tx.execute(sql`select set_config('app.platform_admin', 'true', true)`);
      await tx.execute(sql`UPDATE tenants SET status = 'ACTIVE' WHERE id = ${tenantId}`);
    })).toMatch(/leaves PROVISIONING only through review/);
  });
});
