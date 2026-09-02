import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { db } from "@/db/client";
import {
  listReadyShipmentOutlets,
  listOutletReadiness,
  listOutletReadinessSummary,
  mengantarSecretReference,
  OutletConnectionModeUnavailableError,
  OutletSettingsDeniedError,
  OutletSettingsInvalidError,
  requireReadyShipmentOutlet,
  updateOutletReadiness,
} from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { auditEvents } from "@/db/schema";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("Outlet readiness integration tests require isolated database URLs.");
}
if (
  new URL(adminDatabaseUrl).pathname !== "/geraicuan_test"
  || new URL(appDatabaseUrl).pathname !== "/geraicuan_test"
) {
  throw new Error("Outlet readiness integration tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const tenantA = "20000000-0000-4000-8000-000000002001";
const tenantB = "20000000-0000-4000-8000-000000002002";
const outletA = "20000000-0000-4000-8000-000000002011";
const outletB = "20000000-0000-4000-8000-000000002012";
const adminA = "outlet-settings-admin-a";
const adminB = "outlet-settings-admin-b";
const operatorA = "outlet-settings-operator-a";
const fixtureTenantIds = [tenantA, tenantB];
const fixtureUserIds = [adminA, adminB, operatorA];

async function removeFixtureRows() {
  await adminPool.query(
    "DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM mengantar_connections WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM outlets WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM tenants WHERE id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM users WHERE id = ANY($1::text[])",
    [fixtureUserIds],
  );
}

beforeAll(async () => {
  await removeFixtureRows();
  await adminPool.query(
    `INSERT INTO users (id, name, email) VALUES
      ($1, 'Admin Outlet A', 'outlet-admin-a@example.test'),
      ($2, 'Operator Outlet A', 'outlet-operator-a@example.test'),
      ($3, 'Admin Outlet B', 'outlet-admin-b@example.test')`,
    [adminA, operatorA, adminB],
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'Fixture Outlet A', 'ACTIVE'),
      ($2, 'Fixture Outlet B', 'ACTIVE')`,
    fixtureTenantIds,
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'),
      ($1, $3, 'OPERATOR'),
      ($4, $5, 'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
  await adminPool.query(
    `INSERT INTO outlets (id, tenant_id, name) VALUES
      ($1, $2, 'Outlet Utama A'),
      ($3, $4, 'Outlet Utama B')`,
    [outletA, tenantA, outletB, tenantB],
  );
});

beforeEach(async () => {
  await adminPool.query(
    "DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    "DELETE FROM mengantar_connections WHERE tenant_id = ANY($1::uuid[])",
    [fixtureTenantIds],
  );
  await adminPool.query(
    `UPDATE outlets
      SET default_pickup_address_id = NULL,
          default_pickup_address_label = NULL,
          default_origin_area_id = NULL,
          default_origin_area_label = NULL,
          updated_at = now()
      WHERE tenant_id = ANY($1::uuid[])`,
    [fixtureTenantIds],
  );
});

afterAll(async () => {
  await removeFixtureRows();
  await adminPool.end();
});

describe("tenant outlet readiness", () => {
  it("updates platform-default pickup/origin once and emits one redacted audit for identical concurrent replay", async () => {
    const pickup = "pickup-sensitive-sentinel";
    const origin = "origin-sensitive-sentinel";
    const authorityBefore = await adminPool.query<{ mengantar_authority_version: number }>(
      "SELECT mengantar_authority_version FROM outlets WHERE tenant_id = $1 AND id = $2",
      [tenantA, outletA],
    );
    await withTenantContext(db, adminA, tenantA, async (tx, context) => {
      const initial = await listOutletReadiness(tx, context);
      expect(initial).toHaveLength(1);
      expect(initial[0]).toMatchObject({
        id: outletA,
        defaultPickupAddressId: null,
        defaultOriginAreaId: null,
        connectionSource: "platform_default",
        connectionStatus: "platform_default",
        readinessStatus: "needs_attention",
      });
      expect(initial[0].updatedAt).toBeInstanceOf(Date);
    });

    await Promise.all(Array.from({ length: 4 }, () =>
      withTenantContext(db, adminA, tenantA, (tx, context) =>
        updateOutletReadiness(tx, context, {
          outletId: outletA,
          defaultPickupAddressId: pickup,
          defaultPickupAddressLabel: "Gudang utama",
          defaultOriginAreaId: origin,
          defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
          connectionMode: "platform_default",
          expectedConnectionUpdatedAt: null,
        }))),
    );

    const result = await withTenantContext(db, adminA, tenantA, async (tx, context) => {
      const updated = await listOutletReadiness(tx, context);
      expect(updated).toHaveLength(1);
      expect(updated[0]).toMatchObject({
        id: outletA,
        defaultPickupAddressId: pickup,
        defaultPickupAddressLabel: "Gudang utama",
        defaultOriginAreaId: origin,
        defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
        connectionSource: "platform_default",
        connectionStatus: "platform_default",
        readinessStatus: "ready",
      });
      return updated[0];
    });

    const stored = await adminPool.query<{
      action: string;
      target_type: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, target_type, metadata
       FROM audit_events
       WHERE tenant_id = $1 AND target_id = $2`,
      [tenantA, outletA],
    );
    expect(stored.rows).toEqual([{
      action: "OUTLET_SETTINGS_CHANGED",
      target_type: "OUTLET",
      metadata: {
        changedFields: [
          "defaultPickupAddressId",
          "defaultPickupAddressLabel",
          "defaultOriginAreaId",
          "defaultOriginAreaLabel",
        ],
        connectionSource: "platform_default",
      },
    }]);

    const clientPayload = JSON.stringify(result);
    const auditPayload = JSON.stringify(stored.rows);
    expect(Object.keys(result)).not.toContain("secretReference");
    expect(clientPayload).not.toContain("managed://");
    expect(clientPayload).not.toContain(tenantB);
    expect(auditPayload).not.toContain(pickup);
    expect(auditPayload).not.toContain(origin);
    expect(auditPayload).not.toContain("managed://");
    const authorityAfter = await adminPool.query<{ mengantar_authority_version: number }>(
      "SELECT mengantar_authority_version FROM outlets WHERE tenant_id = $1 AND id = $2",
      [tenantA, outletA],
    );
    expect(authorityAfter.rows[0].mengantar_authority_version)
      .toBe(authorityBefore.rows[0].mengantar_authority_version + 1);
  });

  it("uses but never creates, repairs, overwrites, or downgrades an authoritative private reference", async () => {
    const canonicalReference = mengantarSecretReference(tenantA, outletA);
    await adminPool.query(
      `INSERT INTO mengantar_connections (tenant_id, outlet_id, secret_reference)
       VALUES ($1, $2, $3)`,
      [tenantA, outletA, canonicalReference],
    );
    const privateAuthority = await adminPool.query<{ updated_at: Date }>(
      "SELECT updated_at FROM mengantar_connections WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    );
    const expectedConnectionUpdatedAt = privateAuthority.rows[0].updated_at;

    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      updateOutletReadiness(tx, context, {
        outletId: outletA,
        defaultPickupAddressId: "private-pickup",
        defaultPickupAddressLabel: "Gudang privat",
        defaultOriginAreaId: "private-origin",
        defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
        connectionMode: "private",
        expectedConnectionUpdatedAt,
      }));

    await expect(
      withTenantContext(db, adminA, tenantA, (tx, context) =>
        updateOutletReadiness(tx, context, {
          outletId: outletA,
          defaultPickupAddressId: "downgrade-pickup",
          defaultPickupAddressLabel: "Gudang downgrade",
          defaultOriginAreaId: "downgrade-origin",
          defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
          connectionMode: "platform_default",
          expectedConnectionUpdatedAt,
        })),
    ).rejects.toBeInstanceOf(OutletConnectionModeUnavailableError);

    const stored = await adminPool.query<{
      secret_reference: string;
      default_pickup_address_id: string | null;
      default_origin_area_id: string | null;
    }>(
      `SELECT c.secret_reference, o.default_pickup_address_id, o.default_origin_area_id
       FROM mengantar_connections c
       JOIN outlets o ON o.id = c.outlet_id AND o.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND c.outlet_id = $2`,
      [tenantA, outletA],
    );
    expect(stored.rows).toEqual([{
      secret_reference: canonicalReference,
      default_pickup_address_id: "private-pickup",
      default_origin_area_id: "private-origin",
    }]);
  });

  it("rejects a forged private selection when no authoritative private connection exists", async () => {
    await expect(
      withTenantContext(db, adminA, tenantA, (tx, context) =>
        updateOutletReadiness(tx, context, {
          outletId: outletA,
          defaultPickupAddressId: "forged-pickup",
          defaultPickupAddressLabel: "Gudang forged",
          defaultOriginAreaId: "forged-origin",
          defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
          connectionMode: "private",
          expectedConnectionUpdatedAt: null,
        })),
    ).rejects.toBeInstanceOf(OutletConnectionModeUnavailableError);

    const state = await adminPool.query(
      `SELECT default_pickup_address_id, default_origin_area_id
       FROM outlets WHERE id = $1`,
      [outletA],
    );
    expect(state.rows).toEqual([{
      default_pickup_address_id: null,
      default_origin_area_id: null,
    }]);
  });

  it("rejects a pickup verified before the private account authority changed", async () => {
    const canonicalReference = mengantarSecretReference(tenantA, outletA);
    const inserted = await adminPool.query<{ updated_at: Date }>(
      `INSERT INTO mengantar_connections (tenant_id, outlet_id, secret_reference)
       VALUES ($1, $2, $3)
       RETURNING updated_at`,
      [tenantA, outletA, canonicalReference],
    );
    await adminPool.query(
      `UPDATE mengantar_connections
       SET updated_at = updated_at + interval '1 second'
       WHERE tenant_id = $1 AND outlet_id = $2`,
      [tenantA, outletA],
    );

    await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
      updateOutletReadiness(tx, context, {
        outletId: outletA,
        defaultPickupAddressId: "stale-account-pickup",
        defaultPickupAddressLabel: "Gudang akun lama",
        defaultOriginAreaId: "stale-account-origin",
        defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
        connectionMode: "private",
        expectedConnectionUpdatedAt: inserted.rows[0].updated_at,
      }))).rejects.toBeInstanceOf(OutletConnectionModeUnavailableError);

    const stored = await adminPool.query(
      `SELECT default_pickup_address_id, default_origin_area_id
       FROM outlets WHERE tenant_id = $1 AND id = $2`,
      [tenantA, outletA],
    );
    expect(stored.rows).toEqual([{
      default_pickup_address_id: null,
      default_origin_area_id: null,
    }]);
  });

  it("returns actionable private-attention state without the stored reference", async () => {
    const privateReference = "vault://fixture/credential-material-must-never-render";
    await adminPool.query(
      `INSERT INTO mengantar_connections (tenant_id, outlet_id, secret_reference)
       VALUES ($1, $2, $3)`,
      [tenantA, outletA, privateReference],
    );
    const privateAuthority = await adminPool.query<{ updated_at: Date }>(
      "SELECT updated_at FROM mengantar_connections WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    );
    await adminPool.query(
      `UPDATE outlets
       SET default_pickup_address_id = 'pickup-ready',
           default_origin_area_id = 'origin-ready'
       WHERE id = $1 AND tenant_id = $2`,
      [outletA, tenantA],
    );

    const result = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      listOutletReadiness(tx, context));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: outletA,
      connectionSource: "private",
      connectionStatus: "private_attention",
      readinessStatus: "needs_attention",
    });
    const clientPayload = JSON.stringify(result);
    expect(clientPayload).not.toContain(privateReference);
    expect(clientPayload).not.toContain("credential-material");
    expect(Object.keys(result[0])).not.toContain("secretReference");

    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      updateOutletReadiness(tx, context, {
        outletId: outletA,
        defaultPickupAddressId: "pickup-amended",
        defaultPickupAddressLabel: "Gudang amended",
        defaultOriginAreaId: "origin-amended",
        defaultOriginAreaLabel: "Coblong, Kota Bandung, Jawa Barat",
        connectionMode: "private",
        expectedConnectionUpdatedAt: privateAuthority.rows[0].updated_at,
      }));
    const preserved = await adminPool.query<{ secret_reference: string }>(
      "SELECT secret_reference FROM mengantar_connections WHERE tenant_id = $1 AND outlet_id = $2",
      [tenantA, outletA],
    );
    expect(preserved.rows).toEqual([{ secret_reference: privateReference }]);

    const operatorSummary = await withTenantContext(
      db,
      operatorA,
      tenantA,
      listOutletReadinessSummary,
    );
    expect(operatorSummary).toEqual([{
      id: outletA,
      name: "Outlet Utama A",
      ready: false,
    }]);
    expect(Object.keys(operatorSummary[0])).toEqual(["id", "name", "ready"]);
    expect(JSON.stringify(operatorSummary)).not.toContain(outletB);

    const readyOutlets = await withTenantContext(
      db,
      operatorA,
      tenantA,
      listReadyShipmentOutlets,
    );
    expect(readyOutlets).toEqual([]);
    await expect(withTenantContext(db, operatorA, tenantA, (tx, context) =>
      requireReadyShipmentOutlet(tx, context, outletA))).resolves.toBeNull();
  });

  it("rejects malformed identifiers and connection modes without writes or audit", async () => {
    const invalidInputs = [
      { outletId: "not-a-uuid", defaultPickupAddressId: "pickup", defaultPickupAddressLabel: "Pickup", defaultOriginAreaId: "origin", defaultOriginAreaLabel: "Area", connectionMode: "platform_default", expectedConnectionUpdatedAt: null },
      { outletId: outletA, defaultPickupAddressId: " ", defaultPickupAddressLabel: "Pickup", defaultOriginAreaId: "origin", defaultOriginAreaLabel: "Area", connectionMode: "platform_default", expectedConnectionUpdatedAt: null },
      { outletId: outletA, defaultPickupAddressId: "pickup\u0000", defaultPickupAddressLabel: "Pickup", defaultOriginAreaId: "origin", defaultOriginAreaLabel: "Area", connectionMode: "platform_default", expectedConnectionUpdatedAt: null },
      { outletId: outletA, defaultPickupAddressId: "x".repeat(161), defaultPickupAddressLabel: "Pickup", defaultOriginAreaId: "origin", defaultOriginAreaLabel: "Area", connectionMode: "platform_default", expectedConnectionUpdatedAt: null },
      { outletId: outletA, defaultPickupAddressId: "pickup", defaultPickupAddressLabel: "Pickup", defaultOriginAreaId: "origin", defaultOriginAreaLabel: "Area", connectionMode: "forged", expectedConnectionUpdatedAt: null },
    ] as const;

    for (const input of invalidInputs) {
      await expect(withTenantContext(db, adminA, tenantA, (tx, context) =>
        updateOutletReadiness(tx, context, input as Parameters<typeof updateOutletReadiness>[2])))
        .rejects.toBeInstanceOf(OutletSettingsInvalidError);
    }

    const writes = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE tenant_id = $1 AND action = 'OUTLET_SETTINGS_CHANGED'`,
      [tenantA],
    );
    expect(writes.rows[0]?.count).toBe("0");
  });

  it("denies Operator reads/updates and a Tenant Admin update of another tenant", async () => {
    await expect(
      withTenantContext(db, operatorA, tenantA, (tx, context) =>
        listOutletReadiness(tx, context)),
    ).rejects.toBeInstanceOf(OutletSettingsDeniedError);

    await expect(
      withTenantContext(db, operatorA, tenantA, (tx, context) =>
        updateOutletReadiness(tx, context, {
          outletId: outletA,
          defaultPickupAddressId: "operator-pickup",
          defaultPickupAddressLabel: "Operator pickup",
          defaultOriginAreaId: "operator-origin",
          defaultOriginAreaLabel: "Operator area",
          connectionMode: "platform_default",
          expectedConnectionUpdatedAt: null,
        })),
    ).rejects.toBeInstanceOf(OutletSettingsDeniedError);

    await expect(
      withTenantContext(db, adminA, tenantA, (tx, context) =>
        updateOutletReadiness(tx, context, {
          outletId: outletB,
          defaultPickupAddressId: "cross-tenant-pickup",
          defaultPickupAddressLabel: "Cross-tenant pickup",
          defaultOriginAreaId: "cross-tenant-origin",
          defaultOriginAreaLabel: "Cross-tenant area",
          connectionMode: "platform_default",
          expectedConnectionUpdatedAt: null,
        })),
    ).rejects.toBeInstanceOf(OutletSettingsDeniedError);

    await expect(
      withTenantContext(db, adminA, tenantA, (tx) =>
        tx.insert(auditEvents).values({
          actorId: adminA,
          actorRole: "TENANT_MEMBER",
          tenantId: tenantB,
          action: "OUTLET_SETTINGS_CHANGED",
          targetType: "OUTLET",
          targetId: outletB,
          outcome: "SUCCESS",
          metadata: {},
        })),
    ).rejects.toThrow();

    const persisted = await adminPool.query<{
      id: string;
      default_pickup_address_id: string | null;
      default_origin_area_id: string | null;
    }>(
      `SELECT id, default_pickup_address_id, default_origin_area_id
       FROM outlets
       WHERE tenant_id = ANY($1::uuid[])
       ORDER BY id`,
      [fixtureTenantIds],
    );
    expect(persisted.rows).toEqual([
      {
        id: outletA,
        default_pickup_address_id: null,
        default_origin_area_id: null,
      },
      {
        id: outletB,
        default_pickup_address_id: null,
        default_origin_area_id: null,
      },
    ]);
    const connections = await adminPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM mengantar_connections WHERE tenant_id = ANY($1::uuid[])",
      [fixtureTenantIds],
    );
    expect(connections.rows[0]?.count).toBe("0");
  });
});
