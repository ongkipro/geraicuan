import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { CmsShell } from "@/app/_components/cms-shell";
import { db } from "@/db/client";
import { outlets, tenants, users } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import {
  CmsAuthorizationDeniedError,
  requireCmsScope,
} from "@/lib/cms-auth";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("id-ID"))
    .join("");
}

export default async function TenantLayout({
  children,
}: {
  children: ReactNode;
}) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect(
        `/login/tenant?notice=${error.reason === "anonymous" ? "session-required" : "access-unavailable"}`,
      );
    }
    throw error;
  }

  if (principal.scope !== "tenant") {
    redirect("/login/tenant?notice=access-unavailable");
  }

  const shell = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    async (tx, context) => {
      const tenantRows = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);
      const outletRows = await tx
        .select({ name: outlets.name })
        .from(outlets)
        .where(eq(outlets.tenantId, context.tenantId))
        .orderBy(outlets.name);
      const userRows = await tx
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, context.userId))
        .limit(1);

      const tenant = tenantRows[0];
      const user = userRows[0];
      if (!tenant || !user) {
        throw new Error("Tenant CMS shell scope could not be resolved.");
      }

      return { outlets: outletRows, tenant, user };
    },
  );

  const roleLabel =
    principal.role === "TENANT_ADMIN" ? "Tenant Admin" : "Operator";
  const outletLabel =
    shell.outlets.length === 0
      ? "Belum ada outlet terdaftar"
      : `${shell.outlets.length} outlet terdaftar`;

  return (
    <CmsShell
      account={{
        initials: initials(shell.user.name) || "AK",
        label: shell.user.name,
        secondary: shell.user.email,
      }}
      destination="/login/tenant"
      navigationRole={principal.role}
      roleLabel={roleLabel}
      scope="tenant"
      scopeDescription={`Data tenant · ${outletLabel}`}
      scopeTitle={shell.tenant.name}
    >
      {children}
    </CmsShell>
  );
}
