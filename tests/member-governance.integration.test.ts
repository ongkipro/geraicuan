import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { db } from "@/db/client";
import {
  changeTenantMemberRole,
  deactivateTenantMember,
  inviteTenantMember,
  listTenantMembers,
} from "@/db/member-governance-repository";
import { auditEvents } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";
import { resolveCmsPrincipal } from "@/lib/cms-auth";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("Member governance integration tests require isolated database URLs.");
}
if (
  new URL(adminDatabaseUrl).pathname !== "/geraicuan_test"
  || new URL(appDatabaseUrl).pathname !== "/geraicuan_test"
) {
  throw new Error("Member governance integration tests require geraicuan_test.");
}

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const runId = randomUUID();
const tenantA = randomUUID();
const tenantB = randomUUID();
const adminA = `member-governance-${runId}-admin-a`;
const operatorA = `member-governance-${runId}-operator-a`;
const adminB = `member-governance-${runId}-admin-b`;
const invitedUser = `member-governance-${runId}-invited`;
const invitedEmail = `member-governance-${runId}@example.test`;
const fixtureTenantIds = [tenantA, tenantB];
const fixtureUserIds = [adminA, operatorA, adminB, invitedUser];

async function removeFixtureRows() {
  await adminPool.query(
    "DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[]) OR actor_id = ANY($2::text[])",
    [fixtureTenantIds, fixtureUserIds],
  );
  await adminPool.query(
    "DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[]) OR user_id = ANY($2::text[])",
    [fixtureTenantIds, fixtureUserIds],
  );
  await adminPool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [fixtureTenantIds]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [fixtureUserIds]);
}

async function seedBaseMemberships() {
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role, status) VALUES
      ($1, $2, 'TENANT_ADMIN', 'ACTIVE'),
      ($1, $3, 'OPERATOR', 'ACTIVE'),
      ($4, $5, 'TENANT_ADMIN', 'ACTIVE')`,
    [tenantA, adminA, operatorA, tenantB, adminB],
  );
}

async function membershipId(userId: string) {
  const result = await adminPool.query<{ id: string }>(
    "SELECT id FROM memberships WHERE user_id = $1",
    [userId],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`Fixture membership is missing for ${userId}.`);
  return id;
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
  await removeFixtureRows();
  await adminPool.query(
    `INSERT INTO users (id, name, email, status) VALUES
      ($1, 'Admin Anggota A', $2, 'ACTIVE'),
      ($3, 'Operator Anggota A', $4, 'ACTIVE'),
      ($5, 'Admin Anggota B', $6, 'ACTIVE'),
      ($7, 'Anggota Undangan', $8, 'ACTIVE')`,
    [
      adminA,
      `admin-a-${runId}@example.test`,
      operatorA,
      `operator-a-${runId}@example.test`,
      adminB,
      `admin-b-${runId}@example.test`,
      invitedUser,
      invitedEmail,
    ],
  );
  await adminPool.query(
    `INSERT INTO tenants (id, name, status) VALUES
      ($1, 'Tenant Anggota A', 'ACTIVE'),
      ($2, 'Tenant Anggota B', 'ACTIVE')`,
    fixtureTenantIds,
  );
});

beforeEach(async () => {
  await adminPool.query("DELETE FROM audit_events WHERE tenant_id = ANY($1::uuid[])", [fixtureTenantIds]);
  await adminPool.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [fixtureTenantIds]);
  await seedBaseMemberships();
});

afterAll(async () => {
  await removeFixtureRows();
  await adminPool.end();
});

describe("tenant member governance", () => {
  it("lets a Tenant Admin invite, change role, deactivate, and list only own members", async () => {
    const invited = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      inviteTenantMember(tx, context, { attemptId: randomUUID(), email: invitedEmail, role: "OPERATOR" }));
    expect(invited).toMatchObject({
      ok: true,
      member: { email: invitedEmail, role: "OPERATOR", status: "ACTIVE" },
    });
    if (!invited.ok) throw new Error("Expected invitation success.");

    const roleChanged = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      changeTenantMemberRole(tx, context, {
        attemptId: randomUUID(),
        membershipId: invited.member.id,
        role: "TENANT_ADMIN",
      }));
    expect(roleChanged).toMatchObject({
      ok: true,
      member: { id: invited.member.id, role: "TENANT_ADMIN", status: "ACTIVE" },
    });

    const deactivated = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      deactivateTenantMember(tx, context, { attemptId: randomUUID(), membershipId: invited.member.id }));
    expect(deactivated).toMatchObject({
      ok: true,
      member: { id: invited.member.id, role: "TENANT_ADMIN", status: "SUSPENDED" },
    });

    const members = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      listTenantMembers(tx, context));
    expect(members.map((member) => member.userId).sort()).toEqual(
      [adminA, invitedUser, operatorA].sort(),
    );
    expect(JSON.stringify(members)).not.toContain(adminB);
  });

  it("audits an Operator denial without changing the target", async () => {
    const targetId = await membershipId(adminA);
    const result = await withTenantContext(db, operatorA, tenantA, (tx, context) =>
      changeTenantMemberRole(tx, context, { attemptId: randomUUID(), membershipId: targetId, role: "OPERATOR" }));
    expect(result).toEqual({ ok: false, reason: "NOT_AUTHORIZED" });

    const target = await adminPool.query<{ role: string; status: string }>(
      "SELECT role, status FROM memberships WHERE id = $1",
      [targetId],
    );
    expect(target.rows).toEqual([{ role: "TENANT_ADMIN", status: "ACTIVE" }]);

    const audits = await adminPool.query<{ action: string; outcome: string; metadata: unknown }>(
      `SELECT action, outcome, metadata
       FROM audit_events
       WHERE actor_id = $1 AND tenant_id = $2
       ORDER BY created_at`,
      [operatorA, tenantA],
    );
    expect(audits.rows).toEqual([
      {
        action: "MEMBER_ROLE_CHANGED",
        outcome: "DENIED",
        metadata: { attemptId: expect.any(String), reason: "NOT_AUTHORIZED" },
      },
    ]);
  });

  it("denies a Tenant Admin targeting another tenant and records the denial in actor scope", async () => {
    const targetId = await membershipId(adminB);
    const result = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      deactivateTenantMember(tx, context, { attemptId: randomUUID(), membershipId: targetId }));
    expect(result).toEqual({ ok: false, reason: "MEMBER_NOT_FOUND" });

    const target = await adminPool.query<{ role: string; status: string }>(
      "SELECT role, status FROM memberships WHERE id = $1",
      [targetId],
    );
    expect(target.rows).toEqual([{ role: "TENANT_ADMIN", status: "ACTIVE" }]);

    const audits = await adminPool.query<{
      tenant_id: string;
      target_id: string;
      action: string;
      outcome: string;
    }>(
      `SELECT tenant_id, target_id, action, outcome
       FROM audit_events
       WHERE actor_id = $1 AND action = 'MEMBER_DEACTIVATED'`,
      [adminA],
    );
    expect(audits.rows).toEqual([
      {
        tenant_id: tenantA,
        target_id: "UNRESOLVED_MEMBER",
        action: "MEMBER_DEACTIVATED",
        outcome: "DENIED",
      },
    ]);
  });

  it("preserves the last active Tenant Admin for role change and deactivation", async () => {
    const soleAdminId = await membershipId(adminB);
    const roleResult = await withTenantContext(db, adminB, tenantB, (tx, context) =>
      changeTenantMemberRole(tx, context, {
        attemptId: randomUUID(),
        membershipId: soleAdminId,
        role: "OPERATOR",
      }));
    const deactivateResult = await withTenantContext(db, adminB, tenantB, (tx, context) =>
      deactivateTenantMember(tx, context, { attemptId: randomUUID(), membershipId: soleAdminId }));

    expect(roleResult).toEqual({ ok: false, reason: "LAST_ACTIVE_ADMIN" });
    expect(deactivateResult).toEqual({ ok: false, reason: "LAST_ACTIVE_ADMIN" });
    const persisted = await adminPool.query<{ role: string; status: string }>(
      "SELECT role, status FROM memberships WHERE id = $1",
      [soleAdminId],
    );
    expect(persisted.rows).toEqual([{ role: "TENANT_ADMIN", status: "ACTIVE" }]);

    const audits = await adminPool.query<{ action: string; outcome: string; metadata: unknown }>(
      `SELECT action, outcome, metadata
       FROM audit_events
       WHERE actor_id = $1 AND tenant_id = $2
       ORDER BY created_at`,
      [adminB, tenantB],
    );
    expect(audits.rows).toEqual([
      {
        action: "MEMBER_ROLE_CHANGED",
        outcome: "DENIED",
        metadata: expect.objectContaining({
          attemptId: expect.any(String),
          reason: "LAST_ACTIVE_ADMIN",
        }),
      },
      {
        action: "MEMBER_DEACTIVATED",
        outcome: "DENIED",
        metadata: expect.objectContaining({
          attemptId: expect.any(String),
          reason: "LAST_ACTIVE_ADMIN",
        }),
      },
    ]);
  });

  it("records each successful governed outcome without invitation or session material", async () => {
    const invited = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      inviteTenantMember(tx, context, { attemptId: randomUUID(), email: invitedEmail, role: "OPERATOR" }));
    if (!invited.ok) throw new Error("Expected invitation success.");
    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      changeTenantMemberRole(tx, context, {
        attemptId: randomUUID(),
        membershipId: invited.member.id,
        role: "TENANT_ADMIN",
      }));
    await withTenantContext(db, adminA, tenantA, (tx, context) =>
      deactivateTenantMember(tx, context, { attemptId: randomUUID(), membershipId: invited.member.id }));

    const audits = await adminPool.query<{
      action: string;
      outcome: string;
      target_type: string;
      metadata: unknown;
    }>(
      `SELECT action, outcome, target_type, metadata
       FROM audit_events
       WHERE actor_id = $1 AND tenant_id = $2
       ORDER BY created_at`,
      [adminA, tenantA],
    );
    expect(audits.rows.map(({ action, outcome, target_type }) => ({ action, outcome, target_type })))
      .toEqual([
        { action: "MEMBER_INVITED", outcome: "SUCCESS", target_type: "MEMBERSHIP" },
        { action: "MEMBER_ROLE_CHANGED", outcome: "SUCCESS", target_type: "MEMBERSHIP" },
        { action: "MEMBER_DEACTIVATED", outcome: "SUCCESS", target_type: "MEMBERSHIP" },
      ]);

    const serialized = JSON.stringify(audits.rows).toLocaleLowerCase("en-US");
    expect(serialized).not.toContain(invitedEmail.toLocaleLowerCase("en-US"));
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("session");
    expect(serialized).not.toContain("token");
  });

  it("returns the original invitation result for sequential and concurrent replay", async () => {
    const attemptId = randomUUID();
    const invite = () => withTenantContext(db, adminA, tenantA, (tx, context) =>
      inviteTenantMember(tx, context, { attemptId, email: invitedEmail, role: "OPERATOR" }));

    const [first, concurrentReplay] = await Promise.all([invite(), invite()]);
    const sequentialReplay = await invite();
    expect(first).toEqual(concurrentReplay);
    expect(first).toEqual(sequentialReplay);
    expect(first.ok).toBe(true);

    const collision = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      inviteTenantMember(tx, context, {
        attemptId,
        email: invitedEmail,
        role: "TENANT_ADMIN",
      }));
    expect(collision).toEqual({ ok: false, reason: "ATTEMPT_CONFLICT" });

    const receipts = await adminPool.query<{ count: string }>(
      `SELECT count(*)
       FROM audit_events
       WHERE actor_id = $1 AND tenant_id = $2
         AND action = 'MEMBER_INVITED' AND metadata ->> 'attemptId' = $3`,
      [adminA, tenantA, attemptId],
    );
    expect(receipts.rows[0]?.count).toBe("1");
  });

  it("replays role and deactivation attempts without duplicate transitions", async () => {
    const invited = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      inviteTenantMember(tx, context, {
        attemptId: randomUUID(), email: invitedEmail, role: "OPERATOR",
      }));
    if (!invited.ok) throw new Error("Expected invitation success.");

    const roleAttemptId = randomUUID();
    const changeRole = () => withTenantContext(db, adminA, tenantA, (tx, context) =>
      changeTenantMemberRole(tx, context, {
        attemptId: roleAttemptId,
        membershipId: invited.member.id,
        role: "TENANT_ADMIN",
      }));
    const roleResults = await Promise.all([changeRole(), changeRole()]);
    expect(roleResults[0]).toEqual(roleResults[1]);
    expect(roleResults[0].ok).toBe(true);

    const deactivateAttemptId = randomUUID();
    const deactivate = () => withTenantContext(db, adminA, tenantA, (tx, context) =>
      deactivateTenantMember(tx, context, {
        attemptId: deactivateAttemptId,
        membershipId: invited.member.id,
      }));
    const deactivateResults = await Promise.all([deactivate(), deactivate()]);
    expect(deactivateResults[0]).toEqual(deactivateResults[1]);
    expect(deactivateResults[0].ok).toBe(true);

    const receipts = await adminPool.query<{ action: string; count: string }>(
      `SELECT action, count(*)
       FROM audit_events
       WHERE actor_id = $1 AND tenant_id = $2
         AND metadata ->> 'attemptId' = ANY($3::text[])
       GROUP BY action ORDER BY action`,
      [adminA, tenantA, [roleAttemptId, deactivateAttemptId]],
    );
    expect(receipts.rows).toEqual([
      { action: "MEMBER_DEACTIVATED", count: "1" },
      { action: "MEMBER_ROLE_CHANGED", count: "1" },
    ]);
  });

  it("allows only one tenant to win concurrent invitation of the same user", async () => {
    const inviteA = withTenantContext(db, adminA, tenantA, (tx, context) =>
      inviteTenantMember(tx, context, {
        attemptId: randomUUID(), email: invitedEmail, role: "OPERATOR",
      }));
    const inviteB = withTenantContext(db, adminB, tenantB, (tx, context) =>
      inviteTenantMember(tx, context, {
        attemptId: randomUUID(), email: invitedEmail, role: "OPERATOR",
      }));
    const results = await Promise.all([inviteA, inviteB]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, reason: "INVITATION_NOT_ALLOWED" },
    ]);

    const persisted = await adminPool.query<{ count: string }>(
      "SELECT count(*) FROM memberships WHERE user_id = $1",
      [invitedUser],
    );
    expect(persisted.rows[0]?.count).toBe("1");
  });

  it("preflights duplicate users before installing the global membership constraint", async () => {
    const migration = await readFile(
      new URL("../drizzle/0023_member_governance_idempotency.sql", import.meta.url),
      "utf8",
    );
    const preflight = migration.indexOf("memberships.user_id contains duplicates");
    const constraint = migration.indexOf("memberships_user_key");
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(constraint).toBeGreaterThan(preflight);

    await adminPool.query(
      `INSERT INTO memberships (tenant_id, user_id, role, status)
       VALUES ($1, $2, 'OPERATOR', 'ACTIVE')`,
      [tenantA, invitedUser],
    );
    await expect(adminPool.query(
      `INSERT INTO memberships (tenant_id, user_id, role, status)
       VALUES ($1, $2, 'OPERATOR', 'ACTIVE')`,
      [tenantB, invitedUser],
    )).rejects.toMatchObject({ code: "23505" });
  });

  it("preserves one active admin across competing admin deactivations", async () => {
    const operatorMembershipId = await membershipId(operatorA);
    const adminMembershipId = await membershipId(adminA);
    const promoted = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      changeTenantMemberRole(tx, context, {
        attemptId: randomUUID(),
        membershipId: operatorMembershipId,
        role: "TENANT_ADMIN",
      }));
    expect(promoted.ok).toBe(true);

    const outcomes = await Promise.all([
      withTenantContext(db, adminA, tenantA, (tx, context) =>
        deactivateTenantMember(tx, context, {
          attemptId: randomUUID(), membershipId: operatorMembershipId,
        })),
      withTenantContext(db, operatorA, tenantA, (tx, context) =>
        deactivateTenantMember(tx, context, {
          attemptId: randomUUID(), membershipId: adminMembershipId,
        })),
    ]);
    expect(outcomes.filter((result) => result.ok)).toHaveLength(1);

    const activeAdmins = await adminPool.query<{ count: string }>(
      `SELECT count(*) FROM memberships
       WHERE tenant_id = $1 AND role = 'TENANT_ADMIN' AND status = 'ACTIVE'`,
      [tenantA],
    );
    expect(activeAdmins.rows[0]?.count).toBe("1");
  });

  it("denies an ambiguous case-insensitive email match", async () => {
    const ambiguousUser = `member-governance-${runId}-ambiguous`;
    await adminPool.query(
      "INSERT INTO users (id, name, email, status) VALUES ($1, 'Ambiguous', $2, 'ACTIVE')",
      [ambiguousUser, invitedEmail.toLocaleUpperCase("en-US")],
    );
    try {
      const result = await withTenantContext(db, adminA, tenantA, (tx, context) =>
        inviteTenantMember(tx, context, {
          attemptId: randomUUID(), email: invitedEmail, role: "OPERATOR",
        }));
      expect(result).toEqual({ ok: false, reason: "INVITATION_NOT_ALLOWED" });
    } finally {
      await adminPool.query("DELETE FROM users WHERE id = $1", [ambiguousUser]);
    }
  });

  it("rejects a fabricated member-governance SUCCESS audit from an Operator", async () => {
    const targetId = await membershipId(adminA);
    await expect(withTenantContext(db, operatorA, tenantA, async (tx, context) => {
      await tx.insert(auditEvents).values({
        actorId: context.userId,
        actorRole: "TENANT_MEMBER",
        tenantId: context.tenantId,
        action: "MEMBER_ROLE_CHANGED",
        targetType: "MEMBERSHIP",
        targetId,
        outcome: "SUCCESS",
        metadata: { attemptId: randomUUID() },
      });
    })).rejects.toThrow();
  });

  it("applies role and deactivation changes to subsequent CMS authorization", async () => {
    const operatorMembershipId = await membershipId(operatorA);
    const changed = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      changeTenantMemberRole(tx, context, {
        attemptId: randomUUID(),
        membershipId: operatorMembershipId,
        role: "TENANT_ADMIN",
      }));
    expect(changed.ok).toBe(true);
    await expect(resolveCmsPrincipal(operatorA)).resolves.toMatchObject({
      scope: "tenant",
      role: "TENANT_ADMIN",
    });

    const deactivated = await withTenantContext(db, adminA, tenantA, (tx, context) =>
      deactivateTenantMember(tx, context, {
        attemptId: randomUUID(),
        membershipId: operatorMembershipId,
      }));
    expect(deactivated.ok).toBe(true);
    await expect(resolveCmsPrincipal(operatorA)).resolves.toBeNull();
  });
});
