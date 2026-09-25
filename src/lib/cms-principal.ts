import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import * as schema from "@/db/schema";

export type CmsPrincipal =
  | { scope: "platform"; userId: string }
  | {
      scope: "tenant";
      userId: string;
      tenantId: string;
      role: (typeof schema.membershipRoles)[number];
      /**
       * `PROVISIONING` is a registered store awaiting Super Admin approval
       * (PR-60): it may sign in and set itself up, and ships nothing.
       */
      tenantStatus: "ACTIVE" | "PROVISIONING";
    };

export async function resolveCmsPrincipal(
  userId: string,
): Promise<CmsPrincipal | null> {
  return db.transaction(async (tx) => {
    const role = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    if (role.rows.length !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
      return null;
    }

    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);

    const platformRole = await tx
      .select({ userId: schema.platformRoles.userId, userStatus: schema.users.status })
      .from(schema.platformRoles)
      .innerJoin(schema.users, eq(schema.platformRoles.userId, schema.users.id))
      .where(eq(schema.platformRoles.userId, userId))
      .limit(1);

    if (platformRole.length === 1 && platformRole[0].userStatus === "ACTIVE") {
      return { scope: "platform", userId } as const;
    }

    const memberships = await tx
      .select({
        tenantId: schema.memberships.tenantId,
        role: schema.memberships.role,
        membershipStatus: schema.memberships.status,
        tenantStatus: schema.tenants.status,
        userStatus: schema.users.status,
      })
      .from(schema.memberships)
      .innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id))
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.status, "ACTIVE"),
          inArray(schema.tenants.status, ["ACTIVE", "PROVISIONING"]),
        ),
      )
      .limit(2);

    const membership = memberships.length === 1 ? memberships[0] : null;
    return membership
      && membership.userStatus === "ACTIVE"
      && (membership.tenantStatus === "ACTIVE" || membership.tenantStatus === "PROVISIONING")
      ? {
          scope: "tenant",
          userId,
          tenantId: membership.tenantId,
          role: membership.role,
          tenantStatus: membership.tenantStatus,
        }
      : null;
  });
}
