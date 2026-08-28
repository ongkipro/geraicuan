import { randomUUID } from "node:crypto";

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
  });
}

export async function executeTenantLifecycle(
  db: Database,
  principal: VerifiedPrincipal | undefined,
  action: TenantLifecycleAction,
  input: { name?: string; tenantId?: string },
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

    const isSuperAdmin = principal
      ? await tx
          .select({ userId: schema.platformRoles.userId })
          .from(schema.platformRoles)
          .where(eq(schema.platformRoles.userId, principal.userId))
          .limit(1)
      : [];
    if (!principal || isSuperAdmin.length !== 1) {
      await appendAudit(
        tx,
        principal?.userId,
        principal ? "TENANT_MEMBER" : null,
        action,
        "DENIED",
        undefined,
        input.tenantId,
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
      );
      return { denied: true } as const;
    }


    if (action === "create") {
      const name = input.name?.trim();
      if (!name) {
        throw new Error("Tenant name is required.");
      }

      const tenant = { id: randomUUID(), status: "ACTIVE" as const };
      await tx.insert(schema.tenants).values({
        id: tenant.id,
        name,
        status: tenant.status,
      });
      await appendAudit(tx, actor.userId, "SUPER_ADMIN", action, "SUCCESS", tenant.id, tenant.id, undefined, tenant.status);
      return { tenant };
    }

    if (!input.tenantId) {
      throw new Error("Tenant ID is required.");
    }

    const transition = action === "suspend"
      ? { from: "ACTIVE" as const, to: "SUSPENDED" as const }
      : { from: "SUSPENDED" as const, to: "ACTIVE" as const };
    const update = await tx.execute(
      sql`UPDATE tenants
        SET status = ${transition.to}, updated_at = now()
        WHERE id = ${input.tenantId}::uuid
          AND status = ${transition.from}`,
    );

    if (update.rowCount !== 1) {
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
      );
      return { denied: true } as const;
    }

    const tenant = { id: input.tenantId, status: transition.to };
    await appendAudit(tx, actor.userId, "SUPER_ADMIN", action, "SUCCESS", tenant.id, tenant.id, transition.from, tenant.status);
    return { tenant };
  });

  if ("denied" in result) {
    throw new TenantLifecycleDeniedError();
  }

  return result.tenant;
}
