import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { platformMonitoringAuditEvent } from "@/db/platform-views";
import * as schema from "@/db/schema";

export type PlatformTransaction = Parameters<
  Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]
>[0];

type Database = NodePgDatabase<typeof schema>;
type MonitoringRoute =
  | "/platform"
  | "/platform/tenant"
  | "/platform/tenant/[tenantId]"
  | "/platform/audit";
type MonitoringScope = "global" | "tenant";

const denied = Symbol("platform-context-denied");
const monitoringRoutes: Record<MonitoringRoute, true> = {
  "/platform": true,
  "/platform/tenant": true,
  "/platform/tenant/[tenantId]": true,
  "/platform/audit": true,
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PlatformContextDeniedError extends Error {
  constructor() {
    super("Platform super-admin authorization is required.");
  }
}

async function assertRestrictedApplicationRole(tx: PlatformTransaction) {
  const role = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
    sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
  );

  if (role.rows.length !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
    throw new PlatformContextDeniedError();
  }
}

async function hasActivePlatformRole(
  tx: PlatformTransaction,
  userId: string | undefined,
) {
  if (!userId) return false;

  const rows = await tx
    .select({ userId: schema.platformRoles.userId })
    .from(schema.platformRoles)
    .innerJoin(schema.users, eq(schema.platformRoles.userId, schema.users.id))
    .where(
      and(
        eq(schema.platformRoles.userId, userId),
        eq(schema.platformRoles.role, "SUPER_ADMIN"),
        eq(schema.users.status, "ACTIVE"),
      ),
    )
    .limit(1);
  return rows.length === 1;
}

async function appendDeniedAccess(db: Database, userId: string) {
  await db.transaction(async (tx) => {
    await assertRestrictedApplicationRole(tx);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    const platformRole = await tx
      .select({ userId: schema.platformRoles.userId })
      .from(schema.platformRoles)
      .where(eq(schema.platformRoles.userId, userId))
      .limit(1);
    await tx.insert(schema.auditEvents).values({
      actorId: userId,
      actorRole: platformRole.length === 1 ? "SUPER_ADMIN" : "TENANT_MEMBER",
      action: "PLATFORM_MONITORING_VIEWED",
      targetType: "PLATFORM",
      targetId: "GLOBAL",
      outcome: "DENIED",
      metadata: { route: "authorization", scope: "global" },
    });
  });
}

export async function withPlatformContext<T>(
  db: Database,
  userId: string | undefined,
  work: (tx: PlatformTransaction) => Promise<T>,
): Promise<T> {
  const result = await db.transaction(
    async (tx) => {
      await assertRestrictedApplicationRole(tx);
      await tx.execute(
        sql`select set_config('app.user_id', ${userId ?? ""}, true)`,
      );

      if (!(await hasActivePlatformRole(tx, userId))) return denied;

      await tx.execute(sql`select set_config('app.platform_admin', 'true', true)`);
      const setting = await tx.execute<{ value: string | null }>(
        sql`select current_setting('app.platform_admin', true) as value`,
      );
      if (setting.rows[0]?.value !== "true") {
        throw new PlatformContextDeniedError();
      }

      return work(tx);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );

  if (result === denied) {
    if (userId) await appendDeniedAccess(db, userId);
    throw new PlatformContextDeniedError();
  }

  return result;
}

export async function recordPlatformMonitoringAccess(
  db: Database,
  userId: string,
  input: {
    route: MonitoringRoute;
    scope: MonitoringScope;
    tenantId?: string;
  },
): Promise<void> {
  if (!monitoringRoutes[input.route]) {
    throw new TypeError("Monitoring route is not allowlisted.");
  }
  if (
    (input.scope === "tenant" &&
      (!input.tenantId || !UUID_PATTERN.test(input.tenantId))) ||
    (input.scope === "global" && input.tenantId !== undefined)
  ) {
    throw new TypeError("Monitoring scope is invalid.");
  }

  await db.transaction(async (tx) => {
    await assertRestrictedApplicationRole(tx);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    if (!(await hasActivePlatformRole(tx, userId))) {
      throw new PlatformContextDeniedError();
    }

    await tx.execute(sql`select set_config('app.platform_admin', 'true', true)`);
    const targetId = input.scope === "tenant" ? input.tenantId! : "GLOBAL";
    const tenantId = input.scope === "tenant" ? input.tenantId! : null;
    const targetType = input.scope === "tenant" ? "TENANT" : "PLATFORM";
    const metadata = JSON.stringify({ route: input.route, scope: input.scope });

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${input.route}:${targetId}`}, 0))`,
    );

    await tx.execute(sql`
      INSERT INTO audit_events (
        actor_id,
        actor_role,
        tenant_id,
        action,
        target_type,
        target_id,
        outcome,
        metadata
      )
      SELECT
        ${userId},
        'SUPER_ADMIN',
        ${tenantId}::uuid,
        'PLATFORM_MONITORING_VIEWED',
        ${targetType},
        ${targetId},
        'SUCCESS',
        ${metadata}::jsonb
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${platformMonitoringAuditEvent}
        WHERE ${platformMonitoringAuditEvent.actorId} = ${userId}
          AND ${platformMonitoringAuditEvent.action} = 'PLATFORM_MONITORING_VIEWED'
          AND ${platformMonitoringAuditEvent.targetId} = ${targetId}
          AND ${platformMonitoringAuditEvent.createdAt} >= now() - interval '5 minutes'
      )
    `);
  });
}
