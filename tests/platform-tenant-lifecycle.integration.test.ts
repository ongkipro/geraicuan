import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
  executeTenantLifecycle,
  TenantLifecycleAttemptConflictError,
  TenantLifecycleDeniedError,
} from "@/db/tenant-lifecycle";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Platform tenant lifecycle tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });
const suffix = randomUUID();
const superAdminId = `t25-admin-${suffix}`;
const tenantActorId = `t25-member-${suffix}`;
const tenantName = `T25 Tenant ${suffix}`;
const replayTenantName = `T47 Replay ${suffix}`;
const conflictTenantName = `T47 Conflict ${suffix}`;
const deniedAnonymousTarget = randomUUID();
const deniedTenantTarget = randomUUID();
// T-279: members of the gerai being archived, to prove neither role can archive it.
const memberAdminId = `t279-admin-${suffix}`;
const memberOperatorId = `t279-operator-${suffix}`;
const archiveTenantName = `T279 Arsip ${suffix}`;

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await adminPool.query(
    `INSERT INTO users (id, name, email, status) VALUES
      ($1, 'T25 Super Admin', $2, 'ACTIVE'),
      ($3, 'T25 Tenant Actor', $4, 'ACTIVE'),
      ($5, 'T279 Tenant Admin', $6, 'ACTIVE'),
      ($7, 'T279 Operator', $8, 'ACTIVE')`,
    [
      superAdminId,
      `${superAdminId}@example.test`,
      tenantActorId,
      `${tenantActorId}@example.test`,
      memberAdminId,
      `${memberAdminId}@example.test`,
      memberOperatorId,
      `${memberOperatorId}@example.test`,
    ],
  );
  await adminPool.query(
    "INSERT INTO platform_roles (user_id, role) VALUES ($1, 'SUPER_ADMIN')",
    [superAdminId],
  );
});

afterAll(async () => {
  await adminPool.query(
    `DELETE FROM audit_events
     WHERE actor_id = ANY($1::text[])
        OR target_id = ANY($2::text[])
        OR tenant_id IN (SELECT id FROM tenants WHERE name LIKE $3)`,
    [
      [superAdminId, tenantActorId, memberAdminId, memberOperatorId],
      [deniedAnonymousTarget, deniedTenantTarget],
      `%${suffix}%`,
    ],
  );
  await adminPool.query("DELETE FROM memberships WHERE user_id = ANY($1::text[])", [[memberAdminId, memberOperatorId]]);
  await adminPool.query("DELETE FROM platform_roles WHERE user_id = $1", [superAdminId]);
  await adminPool.query("DELETE FROM tenants WHERE name LIKE $1", [`%${suffix}%`]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [
    [superAdminId, tenantActorId, memberAdminId, memberOperatorId],
  ]);
  await Promise.all([appPool.end(), adminPool.end()]);
});

describe("platform tenant lifecycle workspace boundary", () => {
  it("validates the named target and audit-backs every lifecycle outcome", async () => {
    const created = await executeTenantLifecycle(
      appDb,
      { userId: superAdminId },
      "create",
      { attemptId: randomUUID(), name: tenantName },
    );

    await expect(
      executeTenantLifecycle(appDb, { userId: superAdminId }, "suspend", {
        attemptId: randomUUID(),
        tenantId: created.id,
        expectedName: `${tenantName} salah`,
      }),
    ).rejects.toBeInstanceOf(TenantLifecycleDeniedError);
    expect(
      (await adminPool.query("SELECT status FROM tenants WHERE id = $1", [created.id])).rows,
    ).toEqual([{ status: "ACTIVE" }]);

    await expect(
      executeTenantLifecycle(appDb, { userId: superAdminId }, "suspend", {
        attemptId: randomUUID(),
        tenantId: created.id,
        expectedName: tenantName,
      }),
    ).resolves.toMatchObject({ id: created.id, status: "SUSPENDED" });
    await expect(
      executeTenantLifecycle(appDb, { userId: superAdminId }, "reactivate", {
        attemptId: randomUUID(),
        tenantId: created.id,
        expectedName: tenantName,
      }),
    ).resolves.toMatchObject({ id: created.id, status: "ACTIVE" });

    const audit = await adminPool.query(
      `SELECT action, outcome, from_status, to_status
       FROM audit_events WHERE tenant_id = $1`,
      [created.id],
    );
    expect(audit.rows).toHaveLength(4);
    expect(audit.rows).toEqual(expect.arrayContaining([
      { action: "TENANT_CREATED", outcome: "SUCCESS", from_status: null, to_status: "ACTIVE" },
      { action: "TENANT_SUSPENDED", outcome: "DENIED", from_status: "ACTIVE", to_status: "SUSPENDED" },
      { action: "TENANT_SUSPENDED", outcome: "SUCCESS", from_status: "ACTIVE", to_status: "SUSPENDED" },
      { action: "TENANT_REACTIVATED", outcome: "SUCCESS", from_status: "SUSPENDED", to_status: "ACTIVE" },
    ]));
  });

  it("replays one concurrent attempt exactly once and rejects attempt reuse with changed input", async () => {
    const attemptId = randomUUID();
    const input = { attemptId, name: replayTenantName };
    const [first, replay] = await Promise.all([
      executeTenantLifecycle(appDb, { userId: superAdminId }, "create", input),
      executeTenantLifecycle(appDb, { userId: superAdminId }, "create", input),
    ]);
    expect(replay).toEqual(first);

    expect(
      (await adminPool.query("SELECT count(*)::int AS total FROM tenants WHERE name = $1", [
        replayTenantName,
      ])).rows[0].total,
    ).toBe(1);
    expect(
      (await adminPool.query(
        `SELECT count(*)::int AS total
         FROM audit_events
         WHERE actor_id = $1
           AND action = 'TENANT_CREATED'
           AND metadata ->> 'attemptId' = $2`,
        [superAdminId, attemptId],
      )).rows[0].total,
    ).toBe(1);

    await expect(
      executeTenantLifecycle(appDb, { userId: superAdminId }, "create", {
        attemptId,
        name: conflictTenantName,
      }),
    ).rejects.toBeInstanceOf(TenantLifecycleAttemptConflictError);
    expect(
      (await adminPool.query("SELECT count(*)::int AS total FROM tenants WHERE name = $1", [
        conflictTenantName,
      ])).rows[0].total,
    ).toBe(0);
  });

  it("serializes a target transition and replays its successful receipt", async () => {
    const created = await executeTenantLifecycle(
      appDb,
      { userId: superAdminId },
      "create",
      { attemptId: randomUUID(), name: `T47 Target ${suffix}` },
    );
    const attemptId = randomUUID();
    const input = {
      attemptId,
      tenantId: created.id,
      expectedName: `T47 Target ${suffix}`,
    };
    const [first, replay] = await Promise.all([
      executeTenantLifecycle(appDb, { userId: superAdminId }, "suspend", input),
      executeTenantLifecycle(appDb, { userId: superAdminId }, "suspend", input),
    ]);
    expect(first).toEqual({ id: created.id, status: "SUSPENDED" });
    expect(replay).toEqual(first);
    expect(
      (await adminPool.query(
        `SELECT count(*)::int AS total
         FROM audit_events
         WHERE actor_id = $1
           AND action = 'TENANT_SUSPENDED'
           AND metadata ->> 'attemptId' = $2`,
        [superAdminId, attemptId],
      )).rows[0].total,
    ).toBe(1);
  });

  it("denies anonymous and non-platform actors without lifecycle side effects", async () => {
    await expect(
      executeTenantLifecycle(appDb, undefined, "suspend", {
        attemptId: randomUUID(),
        tenantId: deniedAnonymousTarget,
        expectedName: "Tidak tersedia",
      }),
    ).rejects.toBeInstanceOf(TenantLifecycleDeniedError);
    await expect(
      executeTenantLifecycle(appDb, { userId: tenantActorId }, "reactivate", {
        attemptId: randomUUID(),
        tenantId: deniedTenantTarget,
        expectedName: "Tidak tersedia",
      }),
    ).rejects.toBeInstanceOf(TenantLifecycleDeniedError);

    const audits = await adminPool.query(
      `SELECT actor_id, action, outcome, target_id
       FROM audit_events WHERE target_id = ANY($1::text[])`,
      [[deniedAnonymousTarget, deniedTenantTarget]],
    );
    expect(audits.rows).toEqual(expect.arrayContaining([
      { actor_id: null, action: "TENANT_SUSPENDED", outcome: "DENIED", target_id: deniedAnonymousTarget },
      { actor_id: tenantActorId, action: "TENANT_REACTIVATED", outcome: "DENIED", target_id: deniedTenantTarget },
    ]));
    expect(
      (await adminPool.query("SELECT count(*)::int AS total FROM tenants WHERE id = ANY($1::uuid[])", [
        [deniedAnonymousTarget, deniedTenantTarget],
      ])).rows[0].total,
    ).toBe(0);
  });

  it("rejects a fabricated lifecycle success that has no exact attempt receipt", async () => {
    const targetId = randomUUID();
    await adminPool.query(
      "INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'ACTIVE')",
      [targetId, `T47 Forgery ${suffix}`],
    );
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.user_id', $1, true)", [superAdminId]);
      await client.query("SELECT set_config('app.platform_admin', 'true', true)");
      await expect(
        client.query(
          `INSERT INTO audit_events (
             actor_id, actor_role, tenant_id, action, target_type, target_id,
             outcome, to_status
           ) VALUES (
             $1, 'SUPER_ADMIN', $2, 'TENANT_CREATED', 'TENANT', $2,
             'SUCCESS', 'ACTIVE'
           )`,
          [superAdminId, targetId],
        ),
      ).rejects.toThrow();
    } finally {
      await client.query("ROLLBACK");
      client.release();
      await adminPool.query("DELETE FROM tenants WHERE id = $1", [targetId]);
    }
  });
});

describe("T-279 archive a gerai (spec 17 UX-v3.1, UX-v3.3)", () => {
  const archive = (actor: string | undefined, tenantId: string, expectedName?: string, attemptId = randomUUID()) =>
    executeTenantLifecycle(appDb, actor ? { userId: actor } : undefined, "archive", { attemptId, expectedName, tenantId });

  async function seedTenant(name: string, status: "ACTIVE" | "SUSPENDED" | "PROVISIONING" | "ARCHIVED") {
    const id = randomUUID();
    await adminPool.query("INSERT INTO tenants (id, name, status) VALUES ($1, $2, $3)", [id, name, status]);
    return id;
  }

  async function statusOf(id: string) {
    return (await adminPool.query("SELECT status FROM tenants WHERE id = $1", [id])).rows[0]?.status;
  }

  async function archiveAudits(id: string) {
    return (await adminPool.query(
      `SELECT actor_id, outcome, from_status, to_status FROM audit_events
       WHERE action = 'TENANT_ARCHIVED' AND (tenant_id = $1 OR target_id = $2) ORDER BY created_at`,
      [id, id],
    )).rows;
  }

  it("refuses the gerai's own Tenant Admin and Operator, another role and an anonymous caller", async () => {
    const id = await seedTenant(archiveTenantName, "ACTIVE");
    await adminPool.query(
      `INSERT INTO memberships (tenant_id, user_id, role, status) VALUES ($1, $2, 'TENANT_ADMIN', 'ACTIVE'), ($1, $3, 'OPERATOR', 'ACTIVE')`,
      [id, memberAdminId, memberOperatorId],
    );
    for (const actor of [memberAdminId, memberOperatorId, tenantActorId, undefined]) {
      await expect(archive(actor, id, archiveTenantName), String(actor)).rejects.toBeInstanceOf(TenantLifecycleDeniedError);
    }
    expect(await statusOf(id)).toBe("ACTIVE");
    const audits = await archiveAudits(id);
    expect(audits).toHaveLength(4);
    expect(audits.every((row) => row.outcome === "DENIED" && row.to_status === null)).toBe(true);
  });

  it("refuses a wrong or missing typed name and changes nothing", async () => {
    const name = `T279 Nama ${suffix}`;
    const id = await seedTenant(name, "ACTIVE");
    await expect(archive(superAdminId, id, `${name} salah`)).rejects.toMatchObject({ reason: "name" });
    await expect(archive(superAdminId, id, name.toUpperCase())).rejects.toMatchObject({ reason: "name" });
    await expect(archive(superAdminId, id)).rejects.toMatchObject({ reason: "name" });
    expect(await statusOf(id)).toBe("ACTIVE");
    expect((await archiveAudits(id)).map((row) => row.outcome)).toEqual(["DENIED", "DENIED", "DENIED"]);
  });

  it("refuses a gerai awaiting approval and one already archived", async () => {
    const pendingName = `T279 Pending ${suffix}`;
    const archivedName = `T279 Archived ${suffix}`;
    const pending = await seedTenant(pendingName, "PROVISIONING");
    const archived = await seedTenant(archivedName, "ARCHIVED");
    await expect(archive(superAdminId, pending, pendingName)).rejects.toMatchObject({ reason: "status" });
    await expect(archive(superAdminId, archived, archivedName)).rejects.toMatchObject({ reason: "status" });
    expect(await statusOf(pending)).toBe("PROVISIONING");
    expect(await statusOf(archived)).toBe("ARCHIVED");
    expect(await archiveAudits(pending)).toEqual([{ actor_id: superAdminId, outcome: "DENIED", from_status: "PROVISIONING", to_status: "ARCHIVED" }]);
    expect(await archiveAudits(archived)).toEqual([{ actor_id: superAdminId, outcome: "DENIED", from_status: "ARCHIVED", to_status: "ARCHIVED" }]);
  });

  it("archives an ACTIVE and a SUSPENDED gerai with one audit row each, replays the receipt, and offers no way back", async () => {
    const activeName = `T279 Aktif ${suffix}`;
    const suspendedName = `T279 Tangguh ${suffix}`;
    const active = await seedTenant(activeName, "ACTIVE");
    const suspended = await seedTenant(suspendedName, "SUSPENDED");
    const attemptId = randomUUID();
    const [first, replay] = await Promise.all([
      archive(superAdminId, active, `  ${activeName}  `, attemptId),
      archive(superAdminId, active, `  ${activeName}  `, attemptId),
    ]);
    expect(first).toEqual({ id: active, status: "ARCHIVED" });
    expect(replay).toEqual(first);
    await expect(archive(superAdminId, suspended, suspendedName)).resolves.toEqual({ id: suspended, status: "ARCHIVED" });

    expect(await statusOf(active)).toBe("ARCHIVED");
    expect(await statusOf(suspended)).toBe("ARCHIVED");
    expect(await archiveAudits(active)).toEqual([{ actor_id: superAdminId, outcome: "SUCCESS", from_status: "ACTIVE", to_status: "ARCHIVED" }]);
    expect(await archiveAudits(suspended)).toEqual([{ actor_id: superAdminId, outcome: "SUCCESS", from_status: "SUSPENDED", to_status: "ARCHIVED" }]);

    for (const action of ["reactivate", "suspend"] as const) {
      await expect(executeTenantLifecycle(appDb, { userId: superAdminId }, action, {
        attemptId: randomUUID(), expectedName: activeName, tenantId: active,
      })).rejects.toBeInstanceOf(TenantLifecycleDeniedError);
    }
    expect(await statusOf(active)).toBe("ARCHIVED");
  });

  it("refuses a forged TENANT_ARCHIVED row at the database (audit_events_tenant_archived_guard)", async () => {
    const liveId = await seedTenant(`T279 Forged ${suffix}`, "ACTIVE");
    const archivedId = await seedTenant(`T279 Forged Archived ${suffix}`, "ARCHIVED");
    const attempt = JSON.stringify({ attemptId: randomUUID(), fingerprint: "f" });
    const tryInsert = async (setup: string[], values: unknown[]) => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        for (const statement of setup) await client.query(statement, statement.includes("$1") ? [superAdminId] : []);
        await client.query(
          `INSERT INTO audit_events (actor_id, actor_role, tenant_id, action, target_type, target_id, outcome, from_status, to_status, metadata)
           VALUES ($1, $2, $3::uuid, 'TENANT_ARCHIVED', 'TENANT', $3::text, 'SUCCESS', $4, 'ARCHIVED', $5::jsonb)`,
          values,
        );
        return "ok";
      } catch (error) {
        return (error as { code?: string }).code ?? String(error);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    };
    const asSuperAdmin = ["SELECT set_config('app.user_id', $1, true)", "SELECT set_config('app.platform_admin', 'true', true)"];
    // A gerai that is not archived.
    expect(await tryInsert(asSuperAdmin, [superAdminId, "SUPER_ADMIN", liveId, "ACTIVE", attempt])).toBe("42501");
    // Outside the platform context.
    expect(await tryInsert(["SELECT set_config('app.user_id', $1, true)"], [superAdminId, "SUPER_ADMIN", archivedId, "ACTIVE", attempt])).toBe("42501");
    // As a tenant member.
    expect(await tryInsert(asSuperAdmin, [superAdminId, "TENANT_MEMBER", archivedId, "ACTIVE", attempt])).toBe("42501");
    // From a status archive never leaves.
    expect(await tryInsert(asSuperAdmin, [superAdminId, "SUPER_ADMIN", archivedId, "PROVISIONING", attempt])).toBe("42501");
    // Without an attempt receipt.
    expect(await tryInsert(asSuperAdmin, [superAdminId, "SUPER_ADMIN", archivedId, "ACTIVE", "{}"])).toBe("42501");
    // The exact shape the repository writes is accepted.
    expect(await tryInsert(asSuperAdmin, [superAdminId, "SUPER_ADMIN", archivedId, "ACTIVE", attempt])).toBe("ok");
  });
});
