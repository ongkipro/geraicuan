import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { platformRegistrationQueue } from "@/db/platform-views";
import type { PlatformTransaction } from "@/db/platform-context";
import * as schema from "@/db/schema";

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * T-181 / T-182: the only two writers of self-service registration state. Both
 * call SECURITY DEFINER functions (migration 0051) whose bodies fix every value
 * that decides authority; the application supplies only the data a store owns.
 */
export type SelfRegistrationInput = {
  email: string;
  ownerName: string;
  passwordHash: string;
  /** D-21: 2–3 capitals or digits; stored unlocked, so Pengaturan can still change it before the first shipment. */
  shipmentPrefix: string;
  storeName: string;
  whatsapp: string;
};

export type SelfRegistrationResult = { created: true; tenantId: string } | { created: false };

async function assertRestrictedRole(tx: Transaction) {
  const role = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
    sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
  );
  if (role.rows.length !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
    throw new Error("Registration must run as the restricted application role.");
  }
}

function postgresError(error: unknown) {
  const candidate = error as { cause?: { code?: string; message?: string }; code?: string; message?: string };
  return {
    code: candidate?.cause?.code ?? candidate?.code,
    message: candidate?.cause?.message ?? candidate?.message ?? "",
  };
}

/**
 * Creates the user, credential account, PROVISIONING + PRIVATE_ONLY tenant, its
 * first outlet, the TENANT_ADMIN membership and the audit event in one
 * transaction, plus the chosen shipment prefix (migration 0060's wrapper, which
 * calls the 0051 function unchanged). An email that already has an account
 * creates nothing and reports `created: false`, including the concurrent case.
 */
export async function registerSelfServiceTenant(
  db: Database,
  input: SelfRegistrationInput,
): Promise<SelfRegistrationResult> {
  try {
    return await db.transaction(async (tx) => {
      await assertRestrictedRole(tx);
      const result = await tx.execute<{ tenant_id: string | null }>(sql`
        SELECT register_tenant_self_service_with_prefix(
          ${input.email}, ${input.ownerName}, ${input.passwordHash}, ${input.storeName}, ${input.whatsapp},
          ${input.shipmentPrefix}
        ) AS tenant_id
      `);
      const tenantId = result.rows[0]?.tenant_id;
      return tenantId ? { created: true as const, tenantId } : { created: false as const };
    });
  } catch (error) {
    if (postgresError(error).code === "23505") return { created: false };
    throw error;
  }
}

export type RegistrationQueueEntry = {
  ownerEmail: string;
  ownerEmailVerified: boolean;
  ownerName: string;
  privateOnly: boolean;
  registeredAt: Date;
  storeName: string;
  tenantId: string;
  whatsapp: string | null;
};

/** Stores awaiting approval, oldest first. Runs inside `withPlatformContext`. */
export async function listRegistrationQueue(tx: PlatformTransaction): Promise<RegistrationQueueEntry[]> {
  const rows = await tx
    .select()
    .from(platformRegistrationQueue)
    .orderBy(asc(platformRegistrationQueue.registeredAt), asc(platformRegistrationQueue.tenantId));
  return rows.map((row) => ({
    ownerEmail: row.ownerEmail,
    ownerEmailVerified: row.ownerEmailVerified,
    ownerName: row.ownerName,
    privateOnly: row.mengantarCredentialPolicy !== "PLATFORM_DEFAULT_ALLOWED",
    registeredAt: new Date(row.registeredAt),
    storeName: row.storeName,
    tenantId: row.tenantId,
    whatsapp: row.contactWhatsapp,
  }));
}

export class RegistrationReviewDeniedError extends Error {
  constructor() {
    super("Registration review requires an active Super Admin.");
  }
}

export class RegistrationReviewStateError extends Error {
  constructor(readonly reason: "invalid" | "not-pending" | "unverified") {
    super(`Registration review refused: ${reason}.`);
  }
}

export type RegistrationReviewResult = {
  ownerEmail: string;
  ownerName: string;
  status: "ACTIVE" | "ARCHIVED";
  storeName: string;
};

/**
 * Approves (PROVISIONING -> ACTIVE) or rejects (PROVISIONING -> ARCHIVED, with a
 * reason) through `review_tenant_registration`, which re-checks the Super Admin
 * role, the tenant's state and the owner's verification, and writes the audit
 * event in the same transaction.
 */
export async function reviewTenantRegistration(
  db: Database,
  userId: string,
  input: { decision: "APPROVE" | "REJECT"; reason?: string; tenantId: string },
): Promise<RegistrationReviewResult> {
  try {
    return await db.transaction(async (tx) => {
      await assertRestrictedRole(tx);
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      const role = await tx
        .select({ userId: schema.platformRoles.userId })
        .from(schema.platformRoles)
        .innerJoin(schema.users, eq(schema.platformRoles.userId, schema.users.id))
        .where(and(
          eq(schema.platformRoles.userId, userId),
          eq(schema.platformRoles.role, "SUPER_ADMIN"),
          eq(schema.users.status, "ACTIVE"),
        ))
        .limit(1);
      if (role.length !== 1) throw new RegistrationReviewDeniedError();
      await tx.execute(sql`select set_config('app.platform_admin', 'true', true)`);

      const result = await tx.execute<{
        owner_email: string;
        owner_name: string;
        tenant_name: string;
        to_status: "ACTIVE" | "ARCHIVED";
      }>(sql`
        SELECT * FROM review_tenant_registration(
          ${input.tenantId}::uuid, ${input.decision}, ${input.reason ?? null}, ${randomUUID()}::uuid
        )
      `);
      const row = result.rows[0];
      if (!row) throw new RegistrationReviewStateError("not-pending");
      return {
        ownerEmail: row.owner_email,
        ownerName: row.owner_name,
        status: row.to_status,
        storeName: row.tenant_name,
      };
    });
  } catch (error) {
    if (error instanceof RegistrationReviewDeniedError || error instanceof RegistrationReviewStateError) {
      throw error;
    }
    const { code, message } = postgresError(error);
    if (code === "42501") throw new RegistrationReviewDeniedError();
    if (code === "22023" || code === "22P02") throw new RegistrationReviewStateError("invalid");
    if (code === "55000") {
      throw new RegistrationReviewStateError(/not verified/.test(message) ? "unverified" : "not-pending");
    }
    throw error;
  }
}
