import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db/client";
import { restorePlatformDefaultMengantarConnection } from "@/db/managed-secret-repository";
import {
  TenantApprovalPendingError,
  TenantContextDeniedError,
  withTenantContext,
} from "@/db/tenant-context";
import {
  assertPlatformDefaultMengantarCredentialsAvailable,
  lockMengantarAccountAuthority,
  MengantarConfigurationError,
  MengantarPlatformCredentialsRefusedError,
  resolveMengantarAccountCredentials,
} from "@/lib/mengantar-credentials";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

/**
 * T-182 step 1 (PR-60, D-8, D-9). A tenant awaiting approval is refused by the
 * tenant context itself unless the caller is a store-setup path, and a
 * PRIVATE_ONLY tenant never resolves the platform-default Mengantar account.
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Tenant approval gate tests require geraicuan_test.");
}

const admin = new Pool({ connectionString: databaseUrl });
const ids = {
  pendingTenant: "18200000-0000-4000-8000-000000000001",
  legacyTenant: "18200000-0000-4000-8000-000000000002",
  privateActiveTenant: "18200000-0000-4000-8000-000000000003",
  pendingOutlet: "18200000-0000-4000-8000-000000000011",
  legacyOutlet: "18200000-0000-4000-8000-000000000012",
  privateActiveOutlet: "18200000-0000-4000-8000-000000000013",
  pendingUser: "t182-pending-admin",
  legacyUser: "t182-legacy-admin",
  privateActiveUser: "t182-private-admin",
};
const tenantIds = [ids.pendingTenant, ids.legacyTenant, ids.privateActiveTenant];
const userIds = [ids.pendingUser, ids.legacyUser, ids.privateActiveUser];

async function cleanup() {
  await admin.query("DELETE FROM audit_events WHERE tenant_id = ANY($1) OR target_id = ANY($2)", [tenantIds, tenantIds]);
  await admin.query("DELETE FROM mengantar_credential_rate_limits WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM managed_secret_payloads WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM mengantar_connections WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM shipment_estimate_snapshots WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM shipment_drafts WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM shipments WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM outlet_pickup_points WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM outlets WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM memberships WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM tenant_shipment_counters WHERE tenant_id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM tenants WHERE id = ANY($1)", [tenantIds]);
  await admin.query("DELETE FROM users WHERE id = ANY($1)", [userIds]);
}

async function setTenantStatus(tenantId: string, status: "ACTIVE" | "PROVISIONING") {
  // The migration owner may move a tenant; the runtime role may not (see
  // tenant-registration.integration.test.ts).
  await admin.query("UPDATE tenants SET status = $2 WHERE id = $1", [tenantId, status]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(admin, process.env.APP_DATABASE_URL);
  await cleanup();
  await admin.query(
    `INSERT INTO users (id, name, email, email_verified) VALUES
      ($1, 'Pending Admin', 't182-pending@example.test', true),
      ($2, 'Legacy Admin', 't182-legacy@example.test', true),
      ($3, 'Private Admin', 't182-private@example.test', true)`,
    userIds,
  );
  await admin.query(
    `INSERT INTO tenants (id, name, status, mengantar_credential_policy) VALUES
      ($1, 'T182 Pending Store', 'PROVISIONING', 'PRIVATE_ONLY'),
      ($2, 'T182 Legacy Store', 'ACTIVE', 'PLATFORM_DEFAULT_ALLOWED'),
      ($3, 'T182 Private Store', 'ACTIVE', 'PRIVATE_ONLY')`,
    tenantIds,
  );
  await admin.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $4, 'TENANT_ADMIN'), ($2, $5, 'TENANT_ADMIN'), ($3, $6, 'TENANT_ADMIN')`,
    [...tenantIds, ...userIds],
  );
  await admin.query(
    `INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id) VALUES
      ($1, $4, 'Pending Outlet', 'pending-pickup', 'pending-origin'),
      ($2, $5, 'Legacy Outlet', 'legacy-pickup', 'legacy-origin'),
      ($3, $6, 'Private Outlet', 'private-pickup', 'private-origin')`,
    [ids.pendingOutlet, ids.legacyOutlet, ids.privateActiveOutlet, ...tenantIds],
  );
});

beforeEach(async () => {
  vi.stubEnv("MENGANTAR_API_KEY", "platform-key-for-t182-tests-only");
  vi.stubEnv("MENGANTAR_BASE_URL", "https://platform.example.test");
  vi.stubEnv("MENGANTAR_ORIGIN_AREA_ID", "platform-origin");
  vi.stubEnv("MENGANTAR_PICKUP_ADDRESS_ID", "platform-pickup");
  await setTenantStatus(ids.pendingTenant, "PROVISIONING");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await setTenantStatus(ids.pendingTenant, "PROVISIONING");
  await cleanup();
  await admin.end();
});

describe("tenant context approval gate (PR-60, D-8)", () => {
  it("refuses a tenant awaiting approval by default, before any work runs", async () => {
    const work = vi.fn(async () => "ran");

    await expect(withTenantContext(db, ids.pendingUser, ids.pendingTenant, work))
      .rejects.toBeInstanceOf(TenantApprovalPendingError);
    await expect(withTenantContext(db, ids.pendingUser, undefined, work))
      .rejects.toBeInstanceOf(TenantContextDeniedError);
    expect(work).not.toHaveBeenCalled();
  });

  it("lets only an explicit store-setup caller reach a tenant awaiting approval", async () => {
    const result = await withTenantContext(
      db,
      ids.pendingUser,
      ids.pendingTenant,
      async (_tx, context) => context,
      { allowPendingApproval: true },
    );
    expect(result).toMatchObject({ role: "TENANT_ADMIN", tenantId: ids.pendingTenant });
  });

  it("accepts the same tenant by default once it is approved", async () => {
    await setTenantStatus(ids.pendingTenant, "ACTIVE");
    await expect(
      withTenantContext(db, ids.pendingUser, ids.pendingTenant, async (_tx, context) => context.tenantId),
    ).resolves.toBe(ids.pendingTenant);
  });

  it("still refuses a suspended or archived tenant even for store setup", async () => {
    for (const status of ["SUSPENDED", "ARCHIVED"] as const) {
      await admin.query("UPDATE tenants SET status = $2 WHERE id = $1", [ids.legacyTenant, status]);
      await expect(
        withTenantContext(db, ids.legacyUser, ids.legacyTenant, async () => "ran", { allowPendingApproval: true }),
      ).rejects.toBeInstanceOf(TenantContextDeniedError);
    }
    await admin.query("UPDATE tenants SET status = 'ACTIVE' WHERE id = $1", [ids.legacyTenant]);
  });
});

describe("Mengantar credential policy (D-9)", () => {
  it("refuses the platform-default credentials for a PRIVATE_ONLY tenant", async () => {
    await expect(
      withTenantContext(db, ids.privateActiveUser, ids.privateActiveTenant, (tx, context) =>
        resolveMengantarAccountCredentials(tx, context, ids.privateActiveOutlet)),
    ).rejects.toBeInstanceOf(MengantarPlatformCredentialsRefusedError);
    await expect(
      withTenantContext(db, ids.privateActiveUser, ids.privateActiveTenant, (tx, context) =>
        lockMengantarAccountAuthority(tx, context, ids.privateActiveOutlet)),
    ).rejects.toBeInstanceOf(MengantarPlatformCredentialsRefusedError);
    // Callers that already treat an unconfigured outlet as not ready keep refusing.
    expect(new MengantarPlatformCredentialsRefusedError()).toBeInstanceOf(MengantarConfigurationError);
  });

  it("refuses them for a PRIVATE_ONLY store awaiting approval during setup too", async () => {
    await expect(
      withTenantContext(
        db,
        ids.pendingUser,
        ids.pendingTenant,
        (tx, context) => resolveMengantarAccountCredentials(tx, context, ids.pendingOutlet),
        { allowPendingApproval: true },
      ),
    ).rejects.toBeInstanceOf(MengantarPlatformCredentialsRefusedError);
  });

  it("still resolves the platform default for an existing tenant", async () => {
    const resolved = await withTenantContext(db, ids.legacyUser, ids.legacyTenant, (tx, context) =>
      resolveMengantarAccountCredentials(tx, context, ids.legacyOutlet));
    expect(resolved.source).toBe("platform_default");
    expect(resolved.credentials.baseUrl).toBe("https://platform.example.test");
  });

  it("refuses restoring the platform default for a PRIVATE_ONLY tenant", async () => {
    await expect(
      withTenantContext(db, ids.privateActiveUser, ids.privateActiveTenant, (tx, context) =>
        restorePlatformDefaultMengantarConnection(
          tx,
          context,
          ids.privateActiveOutlet,
          assertPlatformDefaultMengantarCredentialsAvailable,
        )),
    ).rejects.toBeInstanceOf(MengantarPlatformCredentialsRefusedError);
  });

  it("refuses a platform-default estimate row for a PRIVATE_ONLY tenant in the database", async () => {
    const insertEstimate = (userId: string, tenantId: string, outletId: string, suffix: string) =>
      withTenantContext(db, userId, tenantId, async (tx) => {
        const shipmentId = `18200000-0000-4000-8000-0000000001${suffix}`;
        await tx.execute(sql`INSERT INTO shipments (id, tenant_id, outlet_id, status) VALUES (${shipmentId}, ${tenantId}, ${outletId}, 'DRAFT')`);
        await tx.execute(sql`
          INSERT INTO shipment_drafts (shipment_id, tenant_id, destination_area_id, destination_area_label, package_content, package_weight_grams, package_quantity, declared_value_idr, is_cod)
          VALUES (${shipmentId}, ${tenantId}, 'area-1', 'Area 1', 'Paket', 1000, 1, 10000, false)`);
        await tx.execute(sql`
          INSERT INTO shipment_estimate_snapshots (tenant_id, shipment_id, outlet_id, origin_area_id, destination_area_id, destination_area_label, weight_grams, is_cod_requested, credential_source)
          VALUES (${tenantId}, ${shipmentId}, ${outletId}, ${`${suffix === "01" ? "private" : "legacy"}-origin`}, 'area-1', 'Area 1', 1000, false, 'platform_default')`);
        throw new Error("rollback");
      });

    const refused = await insertEstimate(ids.privateActiveUser, ids.privateActiveTenant, ids.privateActiveOutlet, "01")
      .catch((error: Error & { cause?: Error }) => error);
    expect((refused as Error & { cause?: Error }).cause?.message).toMatch(
      /row-level security policy "shipment_estimate_snapshots_credential_policy"|row-level security policy for table "shipment_estimate_snapshots"/,
    );
    // The same row is accepted up to the rollback for a tenant allowed the default.
    await expect(insertEstimate(ids.legacyUser, ids.legacyTenant, ids.legacyOutlet, "02"))
      .rejects.toThrow("rollback");
  });
});

describe("store setup is the only caller allowed to reach a pending tenant", () => {
  // Every file under src/app/app that opens a tenant context or requires the
  // tenant scope. Only these store-setup files may pass allowPendingApproval;
  // every shipment path relies on the default refusal.
  const SETUP_FILES = new Set([
    // Where the option is defined, not used.
    "src/db/tenant-context.ts",
    "src/lib/cms-auth.ts",
    "src/app/app/layout.tsx",
    "src/app/app/page.tsx",
    "src/app/app/pengaturan/actions.ts",
    // T-211: renders only the PR-60 read-only notice for a pending gerai and returns
    // before loading anything; its actions (listed below) still refuse it.
    "src/app/app/pengiriman/baru/page.tsx",
    // T-217: the settings pages share one guard and STORE_SETUP from here.
    "src/app/app/pengaturan/_components/settings-data.ts",
    "src/app/app/pengaturan/koneksi/page.tsx",
    "src/app/app/pengaturan/outlet/page.tsx",
    "src/app/app/pengaturan/page.tsx",
    "src/app/app/pengaturan/pickup/page.tsx",
    // T-243: serves the gerai's own logo bytes (tenant_brand_settings only), which the
    // Pengaturan (store setup) previews for a pending gerai; it reads no shipment row.
    "src/app/app/brand/logo/route.ts",
    // T-244: Info terbaru reads platform announcements and the member's own read receipts,
    // which a gerai awaiting approval must also see; no shipment row.
    "src/app/app/info/page.tsx",
    // T-244: marks those announcements read for the caller only; no shipment row.
    "src/app/app/info/actions.ts",
  ]);

  function walk(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  it("names no shipment path among the callers that allow a pending tenant", () => {
    const root = process.cwd();
    const files = [...walk(join(root, "src/app")), ...walk(join(root, "src/lib")), ...walk(join(root, "src/db"))]
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .map((file) => relative(root, file));
    const allowing = files.filter((file) =>
      /allowPendingApproval/.test(readFileSync(join(root, file), "utf8")));

    expect(allowing.filter((file) => !SETUP_FILES.has(file))).toEqual([]);
    for (const shipmentPath of [
      "src/app/app/actions.ts",
      "src/app/app/estimate-actions.ts",
      "src/app/app/pengiriman/[shipmentId]/actions.ts",
      "src/app/app/pengiriman/[shipmentId]/unpaid-recovery-actions.ts",
      "src/app/app/pengiriman/status-sync-actions.ts",
      "src/app/app/cek-tarif/actions.ts",
      "src/app/app/location-actions.ts",
      "src/lib/mengantar-order.ts",
      "src/lib/shipment-issuance.ts",
      "src/lib/shipment-unpaid-recovery.ts",
    ]) {
      expect(allowing).not.toContain(shipmentPath);
    }
  });
});
