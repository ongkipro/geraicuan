import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";

export type TenantContext = {
  tenantId: string;
  userId: string;
  role: (typeof schema.membershipRoles)[number];
};

type Database = NodePgDatabase<typeof schema>;


const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TenantTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export class TenantContextDeniedError extends Error {
  constructor() {
    super("Tenant context is not authorized.");
  }
}

/**
 * PR-60 / D-8: the tenant is `PROVISIONING` — registered, not yet approved by a
 * Super Admin. A subclass, so every existing refusal path still refuses.
 */
export class TenantApprovalPendingError extends TenantContextDeniedError {}

export type TenantContextOptions = {
  /**
   * Store setup only: profile, outlet, pickup points and the tenant's own
   * Mengantar connection. Every other caller — every shipment path — omits it,
   * so a tenant awaiting approval is refused here before any work runs, and the
   * row-level security on the tables that ship still requires an ACTIVE tenant.
   */
  allowPendingApproval?: true;
};

export async function withTenantContext<T>(
  db: Database,
  principalId: string,
  requestedTenantId: string | undefined,
  work: (tx: TenantTransaction, context: TenantContext) => Promise<T>,
  options: TenantContextOptions = {},
): Promise<T> {
  if (requestedTenantId && !UUID_PATTERN.test(requestedTenantId)) {
    throw new TenantContextDeniedError();
  }


  return db.transaction(async (tx) => {
    const role = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );

    if (role.rows.length !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
      throw new TenantContextDeniedError();
    }
    await tx.execute(sql`select set_config('app.user_id', ${principalId}, true)`);

    const memberships = await tx
      .select({
        tenantId: schema.memberships.tenantId,
        role: schema.memberships.role,
        tenantStatus: schema.tenants.status,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id))
      .where(
        and(
          eq(schema.memberships.userId, principalId),
          inArray(schema.tenants.status, ["ACTIVE", "PROVISIONING"]),
          eq(schema.memberships.status, "ACTIVE"),
          eq(schema.users.status, "ACTIVE"),
          requestedTenantId
            ? eq(schema.memberships.tenantId, requestedTenantId)
            : undefined,
        ),
      );

    if (memberships.length !== 1) {
      throw new TenantContextDeniedError();
    }

    const membership = memberships[0];
    if (membership.tenantStatus !== "ACTIVE" && !options.allowPendingApproval) {
      throw new TenantApprovalPendingError();
    }
    await tx.execute(sql`select set_config('app.tenant_id', ${membership.tenantId}, true)`);

    return work(tx, {
      tenantId: membership.tenantId,
      userId: principalId,
      role: membership.role,
    });
  });
}
