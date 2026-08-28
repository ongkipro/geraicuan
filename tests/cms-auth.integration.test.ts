import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { resolveCmsPrincipal } from "@/lib/cms-auth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("CMS authorization integration tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: databaseUrl });

const runtimeRole = "geraicuan_test_runtime";

beforeAll(async () => {
  await adminPool.query("TRUNCATE audit_events, platform_roles, shipments, outlets, memberships, tenants, users CASCADE");
  await adminPool.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
  await adminPool.query(`CREATE ROLE ${runtimeRole} LOGIN INHERIT IN ROLE geraicuan_app`);
  await adminPool.query(
    `INSERT INTO users (id, name, email, status) VALUES
      ('cms-super', 'CMS Super', 'cms-super@example.test', 'ACTIVE'),
      ('cms-super-suspended', 'Suspended CMS Super', 'cms-super-suspended@example.test', 'SUSPENDED'),
      ('cms-tenant', 'CMS Tenant', 'cms-tenant@example.test', 'ACTIVE'),
      ('cms-user-suspended', 'Suspended CMS User', 'cms-user-suspended@example.test', 'SUSPENDED'),
      ('cms-suspended-tenant', 'CMS Suspended Tenant', 'cms-suspended-tenant@example.test', 'ACTIVE')`,
  );
  await adminPool.query(
    "INSERT INTO platform_roles (user_id) VALUES ($1), ($2)",
    ["cms-super", "cms-super-suspended"],
  );
  const tenants = await adminPool.query(
    "INSERT INTO tenants (name, status) VALUES ($1, 'ACTIVE'), ($2, 'SUSPENDED') RETURNING id, status",
    ["Active CMS Tenant", "Suspended CMS Tenant"],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, 'cms-tenant', 'OPERATOR'),
      ($1, 'cms-user-suspended', 'OPERATOR'),
      ($2, 'cms-suspended-tenant', 'TENANT_ADMIN')`,
    [tenants.rows[0].id, tenants.rows[1].id],
  );
});

afterAll(async () => {
  await adminPool.query("TRUNCATE audit_events, platform_roles, shipments, outlets, memberships, tenants, users CASCADE");
  await adminPool.query(`DROP ROLE ${runtimeRole}`);
  await adminPool.end();
});

describe("CMS authorization", () => {
  it("resolves only active server-authorized platform and tenant scopes", async () => {
    await expect(resolveCmsPrincipal("cms-super")).resolves.toEqual({
      scope: "platform",
      userId: "cms-super",
    });
    await expect(resolveCmsPrincipal("cms-tenant")).resolves.toMatchObject({
      scope: "tenant",
      userId: "cms-tenant",
      role: "OPERATOR",
    });
    await expect(resolveCmsPrincipal("cms-super-suspended")).resolves.toBeNull();
    await expect(resolveCmsPrincipal("cms-user-suspended")).resolves.toBeNull();
    await expect(resolveCmsPrincipal("cms-suspended-tenant")).resolves.toBeNull();
    await expect(resolveCmsPrincipal("missing-user")).resolves.toBeNull();
  });

  it("denies a deactivated membership", async () => {
    await adminPool.query("UPDATE memberships SET status = 'SUSPENDED' WHERE user_id = $1", ["cms-tenant"]);
    await expect(resolveCmsPrincipal("cms-tenant")).resolves.toBeNull();
  });
});
