import "server-only";

import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@/db/schema";
import type { TenantContext, TenantTransaction } from "@/db/tenant-context";
import type { ShipmentRouteKey } from "@/lib/shipment-number";

export class ShipmentPrefixLockedError extends Error {
  constructor() {
    super("Shipment prefix is locked.");
  }
}

export class ShipmentPrefixInvalidError extends Error {
  constructor() {
    super("Shipment prefix is invalid.");
  }
}

export class ShipmentPrefixDeniedError extends Error {
  constructor() {
    super("Shipment prefix change is not authorized.");
  }
}

/** Resolves a route key inside the current tenant only; another tenant's number is simply absent. */
export async function resolveShipmentRouteKey(
  tx: TenantTransaction,
  context: TenantContext,
  key: ShipmentRouteKey,
) {
  const [row] = await tx
    .select({ shipmentId: schema.shipments.id, tenantNumber: schema.shipments.tenantNumber })
    .from(schema.shipments)
    .where(and(
      eq(schema.shipments.tenantId, context.tenantId),
      key.kind === "uuid"
        ? eq(schema.shipments.id, key.shipmentId)
        : eq(schema.shipments.tenantNumber, key.tenantNumber),
    ))
    .limit(1);
  return row ?? null;
}

export async function loadTenantShipmentPrefix(tx: TenantTransaction, context: TenantContext) {
  const [tenant] = await tx.select({ tenantName: schema.tenants.name }).from(schema.tenants)
    .where(eq(schema.tenants.id, context.tenantId)).limit(1);
  if (!tenant) throw new ShipmentPrefixDeniedError();
  // Numbering state has no runtime-role privilege; the definer function checks membership.
  const state = await tx.execute<{ prefix: string; locked_at: Date | string | null }>(
    sql`SELECT prefix, locked_at FROM public.tenant_shipment_prefix_state()`,
  );
  const row = state.rows[0];
  if (!row) throw new ShipmentPrefixDeniedError();
  return { prefix: row.prefix, lockedAt: row.locked_at === null ? null : new Date(row.locked_at), tenantName: tenant.tenantName };
}

/** Platform tenant detail: the definer function requires an active Super Admin in app.user_id. */
export async function loadPlatformTenantShipmentPrefix(
  db: NodePgDatabase<typeof schema>,
  actorUserId: string,
  tenantId: string,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${actorUserId}, true)`);
    const state = await tx.execute<{ prefix: string; locked_at: Date | string | null }>(
      sql`SELECT prefix, locked_at FROM public.tenant_shipment_prefix_state(${tenantId}::uuid)`,
    );
    const row = state.rows[0];
    return row ? { prefix: row.prefix, lockedAt: row.locked_at === null ? null : new Date(row.locked_at) } : null;
  });
}

function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function mapPrefixError(error: unknown): never {
  const state = sqlState(error);
  if (state === "55000") throw new ShipmentPrefixLockedError();
  if (state === "22023") throw new ShipmentPrefixInvalidError();
  if (state === "42501") throw new ShipmentPrefixDeniedError();
  throw error;
}

/** One-time save: the database function checks Tenant Admin, locks the prefix, rewrites references and audits. */
export async function saveTenantShipmentPrefix(
  tx: TenantTransaction,
  context: TenantContext,
  prefix: string,
  attemptId: string,
) {
  if (context.role !== "TENANT_ADMIN") throw new ShipmentPrefixDeniedError();
  try {
    await tx.execute(sql`SELECT public.set_tenant_shipment_prefix(${prefix}, ${attemptId}::uuid)`);
  } catch (error) {
    mapPrefixError(error);
  }
}

/** Super Admin escape hatch for a mistaken prefix. The database function checks the platform role and audits. */
export async function unlockTenantShipmentPrefix(
  db: NodePgDatabase<typeof schema>,
  actorUserId: string,
  tenantId: string,
  attemptId: string,
) {
  await db.transaction(async (tx) => {
    const role = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    if (role.rows.length !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
      throw new ShipmentPrefixDeniedError();
    }
    await tx.execute(sql`select set_config('app.user_id', ${actorUserId}, true)`);
    try {
      await tx.execute(sql`SELECT public.unlock_tenant_shipment_prefix(${tenantId}::uuid, ${attemptId}::uuid)`);
    } catch (error) {
      mapPrefixError(error);
    }
  });
}
