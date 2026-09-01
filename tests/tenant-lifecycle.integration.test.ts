import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  executeTenantLifecycle,
  TenantLifecycleDeniedError,
} from "@/db/tenant-lifecycle";
import * as schema from "@/db/schema";
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
const appDb = drizzle({ client: appPool, schema });

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await adminPool.query(
    "TRUNCATE audit_events, platform_roles, shipments, outlets, memberships, tenants, users CASCADE",
  );
  await adminPool.query(
    "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)",
    ["super-user", "Super User", "super@example.test", "tenant-user", "Tenant User", "tenant@example.test"],
  );
  await adminPool.query("INSERT INTO platform_roles (user_id) VALUES ($1)", ["super-user"]);
});

afterAll(async () => {
  await adminPool.query("TRUNCATE audit_events, platform_roles, shipments, outlets, memberships, tenants, users CASCADE");
  await Promise.all([adminPool.end(), appPool.end()]);
});

describe("super-admin tenant lifecycle", () => {

  it("creates, suspends, and reactivates a tenant with immutable audit outcomes", async () => {


    const created = await executeTenantLifecycle(appDb, { userId: "super-user" }, "create", {
      name: "Lifecycle Tenant",
    });
    expect(created.status).toBe("ACTIVE");

    await expect(
      executeTenantLifecycle(appDb, { userId: "super-user" }, "suspend", { tenantId: created.id }),
    ).resolves.toMatchObject({ id: created.id, status: "SUSPENDED" });
    await expect(
      executeTenantLifecycle(appDb, { userId: "super-user" }, "reactivate", { tenantId: created.id }),
    ).resolves.toMatchObject({ id: created.id, status: "ACTIVE" });

    const audits = await adminPool.query(
      "SELECT action, outcome, from_status, to_status FROM audit_events WHERE tenant_id = $1 ORDER BY created_at",
      [created.id],
    );
    expect(audits.rows).toEqual([
      { action: "TENANT_CREATED", outcome: "SUCCESS", from_status: null, to_status: "ACTIVE" },
      { action: "TENANT_SUSPENDED", outcome: "SUCCESS", from_status: "ACTIVE", to_status: "SUSPENDED" },
      { action: "TENANT_REACTIVATED", outcome: "SUCCESS", from_status: "SUSPENDED", to_status: "ACTIVE" },
    ]);
  });

  it("denies anonymous and tenant actors while recording denials", async () => {
    await expect(executeTenantLifecycle(appDb, undefined, "create", { name: "Denied" })).rejects.toBeInstanceOf(TenantLifecycleDeniedError);
    await expect(executeTenantLifecycle(appDb, { userId: "tenant-user" }, "create", { name: "Denied" })).rejects.toBeInstanceOf(TenantLifecycleDeniedError);
    await expect(
      executeTenantLifecycle(appDb, { userId: "super-user" }, "suspend", {
        tenantId: "not-a-uuid",
      }),
    ).rejects.toBeInstanceOf(TenantLifecycleDeniedError);
    await adminPool.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", ["super-user"]);
    await expect(
      executeTenantLifecycle(appDb, { userId: "super-user" }, "create", { name: "Denied" }),
    ).rejects.toBeInstanceOf(TenantLifecycleDeniedError);


    const audits = await adminPool.query(
      "SELECT actor_id, action, outcome FROM audit_events WHERE outcome = 'DENIED' ORDER BY created_at",
    );
    expect(audits.rows).toEqual([
      { actor_id: null, action: "TENANT_CREATED", outcome: "DENIED" },
      { actor_id: "tenant-user", action: "TENANT_CREATED", outcome: "DENIED" },
      { actor_id: "super-user", action: "TENANT_SUSPENDED", outcome: "DENIED" },
      { actor_id: "super-user", action: "TENANT_CREATED", outcome: "DENIED" },
    ]);
  });

  it("enforces app-role audit attribution and platform-role self visibility", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true)", ["tenant-user"]);
      await expect(
        client.query(
          `INSERT INTO audit_events (actor_id, action, target_type, target_id, outcome)
           VALUES ('super-user', 'TENANT_CREATED', 'TENANT', 'forged', 'SUCCESS')`,
        ),
      ).rejects.toThrow();
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true)", ["tenant-user"]);
      expect(
        (await client.query("SELECT user_id FROM platform_roles ORDER BY user_id")).rows,
      ).toEqual([]);
      await client.query("SELECT set_config('app.user_id', $1, true)", ["super-user"]);
      expect(
        (await client.query("SELECT user_id FROM platform_roles ORDER BY user_id")).rows,
      ).toEqual([{ user_id: "super-user" }]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
