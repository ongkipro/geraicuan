import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { auth } from "@/lib/auth";

export type CmsPrincipal =
  | { scope: "platform"; userId: string }
  | {
      scope: "tenant";
      userId: string;
      tenantId: string;
      role: (typeof schema.membershipRoles)[number];
    };

export class CmsAuthorizationDeniedError extends Error {
  constructor() {
    super("CMS authorization is required.");
  }
}

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
        userStatus: schema.users.status,
      })
      .from(schema.memberships)
      .innerJoin(schema.tenants, eq(schema.memberships.tenantId, schema.tenants.id))
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(
        and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.status, "ACTIVE"),
          eq(schema.tenants.status, "ACTIVE"),
        ),
      )
      .limit(2);

    return memberships.length === 1 && memberships[0].userStatus === "ACTIVE"
      ? {
          scope: "tenant",
          userId,
          tenantId: memberships[0].tenantId,
          role: memberships[0].role,
        }
      : null;
  });
}

export async function requireCmsScope(scope: CmsPrincipal["scope"]) {
  const session = await auth.api.getSession({ headers: await headers() });
  const principal = session ? await resolveCmsPrincipal(session.user.id) : null;

  if (!principal || principal.scope !== scope) {
    throw new CmsAuthorizationDeniedError();
  }

  return principal;
}
