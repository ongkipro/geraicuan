import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import {
  configureMengantarConnection,
  mengantarSecretReference,
  MengantarConfigurationDeniedError,
} from "@/lib/mengantar-configuration";
import { resolveMengantarCredentials } from "@/lib/mengantar-credentials";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Credential resolver integration tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: databaseUrl });
const tenantA = "10000000-0000-0000-0000-000000000001";
const tenantB = "10000000-0000-0000-0000-000000000002";
const outletA = "10000000-0000-0000-0000-000000000011";
const outletB = "10000000-0000-0000-0000-000000000012";

beforeAll(async () => {
  process.env.MENGANTAR_API_KEY = "platform-test-key";
  process.env.MENGANTAR_BASE_URL = "https://platform.example.test";
  process.env.MENGANTAR_ORIGIN_AREA_ID = "platform-origin";
  process.env.MENGANTAR_PICKUP_ADDRESS_ID = "platform-pickup";
  await adminPool.query("DROP ROLE IF EXISTS geraicuan_test_runtime");
  await adminPool.query("CREATE ROLE geraicuan_test_runtime LOGIN INHERIT IN ROLE geraicuan_app");
  await adminPool.query("TRUNCATE mengantar_connections, audit_events, shipments, outlets, memberships, tenants, users CASCADE");
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)",
    ["admin-a", "Admin A", "admin-a@example.test", "operator-a", "Operator A", "operator-a@example.test", "admin-b", "Admin B", "admin-b@example.test"],
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE'), ($3, $4, 'ACTIVE')",
    [tenantA, "Tenant A", tenantB, "Tenant B"],
  );
  await adminPool.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')",
    [tenantA, "admin-a", "operator-a", tenantB, "admin-b"],
  );
  await adminPool.query(
    "INSERT INTO outlets (id, tenant_id, name) VALUES ($1, $2, 'Outlet A'), ($3, $4, 'Outlet B')",
    [outletA, tenantA, outletB, tenantB],
  );
});

afterAll(async () => {
  await adminPool.query("TRUNCATE mengantar_connections, audit_events, shipments, outlets, memberships, tenants, users CASCADE");
  await adminPool.query("DROP ROLE geraicuan_test_runtime");
  await adminPool.end();
});

describe("Mengantar credential resolution", () => {
  it("uses a complete private connection before platform defaults", async () => {
    await configureMengantarConnection("admin-a", tenantA, {
      outletId: outletA,
      pickupAddressId: "private-pickup",
      originAreaId: "private-origin",
    });
    await adminPool.query(
      "INSERT INTO mengantar_connections (tenant_id, outlet_id, secret_reference) VALUES ($1, $2, $3)",
      [tenantA, outletA, mengantarSecretReference(tenantA, outletA)],
    );

    await withTenantContext(db, "admin-a", tenantA, async (tx, context) => {
      const resolved = await resolveMengantarCredentials(tx, context, outletA, async (reference) => {
        expect(reference).toBe(`managed://mengantar/${tenantA}/${outletA}`);
        return {
          apiKey: "private-test-key",
          baseUrl: "https://private.example.test",
          originAreaId: "private-origin",
          pickupAddressId: "private-pickup",
        };
      });
      expect(resolved.source).toBe("private");
      expect(resolved.credentials.baseUrl).toBe("https://private.example.test");
    });
  });

  it("uses only platform defaults when no private connection exists", async () => {
    await withTenantContext(db, "admin-b", tenantB, async (tx, context) => {
      const resolved = await resolveMengantarCredentials(tx, context, outletB, async () => {
        throw new Error("private loader must not run");
      });
      expect(resolved.source).toBe("platform_default");
      expect(resolved.credentials.baseUrl).toBe("https://platform.example.test");
    });
  });

  it("denies an operator and cross-tenant outlet configuration", async () => {
    await expect(configureMengantarConnection("operator-a", tenantA, {
      outletId: outletA,
      pickupAddressId: "pickup",
      originAreaId: "origin",
    })).rejects.toBeInstanceOf(MengantarConfigurationDeniedError);
    await expect(configureMengantarConnection("admin-a", tenantA, {
      outletId: outletB,
      pickupAddressId: "pickup",
      originAreaId: "origin",
    })).rejects.toBeInstanceOf(MengantarConfigurationDeniedError);
  });
});
