import { createHash, randomUUID } from "node:crypto";

import "server-only";

import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";

export type VerifiedPrincipal = { userId: string };
export type TenantLifecycleAction = "create" | "suspend" | "reactivate";

type Database = NodePgDatabase<typeof schema>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class TenantLifecycleDeniedError extends Error {
  constructor() {
    super("Platform super-admin authorization is required.");
  }
}

export class TenantLifecycleInputError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class TenantLifecycleAttemptConflictError extends Error {
  constructor() {
    super("The lifecycle attempt identifier was already used for different input.");
  }
}

function actionName(action: TenantLifecycleAction) {
  return `TENANT_${action === "create" ? "CREATED" : action === "suspend" ? "SUSPENDED" : "REACTIVATED"}` as const;
}

async function appendAudit(
  tx: Transaction,
  actorId: string | undefined,
  actorRole: "SUPER_ADMIN" | "TENANT_MEMBER" | null,
  action: TenantLifecycleAction,
  outcome: "SUCCESS" | "DENIED",
  tenantId: string | undefined,
  targetId: string | undefined,
  fromStatus: (typeof schema.tenantStatuses)[number] | undefined,
  toStatus: (typeof schema.tenantStatuses)[number] | undefined,
  metadata: { attemptId: string; fingerprint: string } | undefined,
) {
  await tx.insert(schema.auditEvents).values({
    actorId,
    actorRole,
    tenantId,
    action: actionName(action),
    targetType: "TENANT",
    targetId: targetId ?? "UNSPECIFIED",
    outcome,
    fromStatus,
    toStatus,
    metadata,
  });
}

function lifecycleFingerprint(
  action: TenantLifecycleAction,
  input: { name?: string; tenantId?: string; expectedName?: string },
) {
  return createHash("sha256")
    .update(JSON.stringify({
      action,
      expectedName: input.expectedName?.trim() ?? null,
      name: input.name?.trim() ?? null,
      tenantId: input.tenantId ?? null,
    }))
    .digest("hex");
}

async function loadAttemptReceipt(
  tx: Transaction,
  actorId: string,
  action: TenantLifecycleAction,
  attemptId: string,
) {
  const receipt = await tx.execute<{
    fingerprint: string | null;
    outcome: "SUCCESS" | "DENIED";
    target_id: string;
    to_status: (typeof schema.tenantStatuses)[number] | null;
  }>(sql`
    SELECT
      metadata ->> 'fingerprint' AS fingerprint,
      outcome,
      target_id,
      to_status
    FROM audit_events
    WHERE actor_id = ${actorId}
      AND action = ${actionName(action)}
      AND metadata ->> 'attemptId' = ${attemptId}
    LIMIT 1
  `);
  return receipt.rows[0];
}

export async function executeTenantLifecycle(
  db: Database,
  principal: VerifiedPrincipal | undefined,
  action: TenantLifecycleAction,
  input: {
    attemptId?: string;
    name?: string;
    tenantId?: string;
    expectedName?: string;
  },
) {
  const result = await db.transaction(async (tx) => {
    const role = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    if (role.rows.length !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
      throw new TenantLifecycleDeniedError();
    }

    await tx.execute(
      sql`select set_config('app.user_id', ${principal?.userId ?? ""}, true)`,
    );

    const platformRole = principal
      ? await tx
          .select({
            userId: schema.platformRoles.userId,
            userStatus: schema.users.status,
          })
          .from(schema.platformRoles)
          .innerJoin(schema.users, eq(schema.platformRoles.userId, schema.users.id))
          .where(eq(schema.platformRoles.userId, principal.userId))
          .limit(1)
      : [];
    if (
      !principal
      || platformRole.length !== 1
      || platformRole[0].userStatus !== "ACTIVE"
    ) {
      await appendAudit(
        tx,
        principal?.userId,
        platformRole.length === 1 ? "SUPER_ADMIN" : principal ? "TENANT_MEMBER" : null,
        action,
        "DENIED",
        undefined,
        input.tenantId,
        undefined,
        undefined,
        undefined,
      );
      return { denied: true } as const;
    }

    const actor = principal;
    await tx.execute(sql`select set_config('app.platform_admin', 'true', true)`);
    const platformSetting = await tx.execute<{ value: string | null }>(
      sql`select current_setting('app.platform_admin', true) as value`,
    );
    if (platformSetting.rows[0]?.value !== "true") {
      throw new Error("Platform authorization context was not established.");
    }

    const attemptId = input.attemptId ?? randomUUID();
    if (!UUID_PATTERN.test(attemptId)) {
      throw new TenantLifecycleInputError("Lifecycle attempt identifier is invalid.");
    }

    const fingerprint = lifecycleFingerprint(action, input);
    const attempt = { attemptId, fingerprint };
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.userId}:${attemptId}`}, 0))`,
    );
    const receipt = await loadAttemptReceipt(
      tx,
      actor.userId,
      action,
      attemptId,
    );
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) {
        throw new TenantLifecycleAttemptConflictError();
      }
      if (receipt.outcome === "DENIED" || !receipt.to_status) {
        return { denied: true } as const;
      }
      return {
        tenant: { id: receipt.target_id, status: receipt.to_status },
      };
    }

    if (input.tenantId && !UUID_PATTERN.test(input.tenantId)) {
      await appendAudit(
        tx,
        actor.userId,
        "SUPER_ADMIN",
        action,
        "DENIED",
        undefined,
        input.tenantId,
        undefined,
        undefined,
        attempt,
      );
      return { denied: true } as const;
    }

    if (action === "create") {
      const name = input.name?.trim();
      if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/u.test(name)) {
        throw new TenantLifecycleInputError("Tenant name is invalid.");
      }

      const tenant = { id: randomUUID(), status: "ACTIVE" as const };
      await tx.insert(schema.tenants).values({
        id: tenant.id,
        name,
        status: tenant.status,
      });
      await appendAudit(
        tx,
        actor.userId,
        "SUPER_ADMIN",
        action,
        "SUCCESS",
        tenant.id,
        tenant.id,
        undefined,
        tenant.status,
        attempt,
      );
      return { tenant };
    }

    if (!input.tenantId) {
      throw new TenantLifecycleInputError("Tenant ID is required.");
    }

    const transition = action === "suspend"
      ? { from: "ACTIVE" as const, to: "SUSPENDED" as const }
      : { from: "SUSPENDED" as const, to: "ACTIVE" as const };
    const targetResult = await tx.execute<{
      id: string;
      name: string;
      status: (typeof schema.tenantStatuses)[number];
    }>(sql`
      SELECT id, name, status
      FROM tenants
      WHERE id = ${input.tenantId}::uuid
      FOR UPDATE
    `);
    const target = targetResult.rows[0];

    if (
      !target
      || target.status !== transition.from
      || (input.expectedName !== undefined
        && input.expectedName.trim() !== target.name)
    ) {
      await appendAudit(
        tx,
        actor.userId,
        "SUPER_ADMIN",
        action,
        "DENIED",
        target?.id,
        input.tenantId,
        target?.status,
        transition.to,
        attempt,
      );
      return { denied: true } as const;
    }

    const update = await tx.execute(
      sql`UPDATE tenants
        SET status = ${transition.to}, updated_at = now()
        WHERE id = ${target.id}::uuid
          AND status = ${transition.from}`,
    );
    if (update.rowCount !== 1) {
      await appendAudit(
        tx,
        actor.userId,
        "SUPER_ADMIN",
        action,
        "DENIED",
        target.id,
        target.id,
        target.status,
        transition.to,
        attempt,
      );
      return { denied: true } as const;
    }

    const tenant = { id: target.id, status: transition.to };
    await appendAudit(
      tx,
      actor.userId,
      "SUPER_ADMIN",
      action,
      "SUCCESS",
      tenant.id,
      tenant.id,
      transition.from,
      tenant.status,
      attempt,
    );
    return { tenant };
  });

  if ("denied" in result) {
    throw new TenantLifecycleDeniedError();
  }

  return result.tenant;
}
