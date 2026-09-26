import { eq } from "drizzle-orm";
import { Clock } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { countUnreadAnnouncements } from "@/db/announcement-repository";
import { db } from "@/db/client";
import { outlets, tenants, users } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { TENANT_APPROVAL_COPY } from "@/lib/tenant-approval";

/**
 * Tenant CMS frame. The guard is the pre-v3 one unchanged: tenant scope, a gerai still awaiting
 * approval allowed in (PR-60), anyone else sent to the tenant login with a notice. Every page and
 * action re-checks its own authorization; this only decides whether the frame renders.
 */
export default async function TenantLayout({ children }: { children: ReactNode }) {
  let principal;
  try {
    principal = await requireCmsScope("tenant", { allowPendingApproval: true });
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
      const [tenant] = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);
      const outletRows = await tx
        .select({ id: outlets.id })
        .from(outlets)
        .where(eq(outlets.tenantId, context.tenantId));
      const [user] = await tx
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, context.userId))
        .limit(1);
      if (!tenant || !user) {
        throw new Error("Tenant CMS shell scope could not be resolved.");
      }
      return { outletCount: outletRows.length, tenant, user };
    },
    { allowPendingApproval: true },
  );
  // T-244: the Info terbaru badge — published announcements this member has not read. Its own
  // transaction, so a failed count only hides the badge and never the frame.
  const unreadAnnouncements = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => countUnreadAnnouncements(tx, context.userId),
    { allowPendingApproval: true },
  ).catch((error: unknown) => {
    console.error("Info terbaru unread count failed.", error);
    return 0;
  });

  return (
    <AppShell
      account={{ email: shell.user.email, name: shell.user.name }}
      badges={{ announcements: unreadAnnouncements }}
      notice={principal.tenantStatus === "PROVISIONING" ? (
        <Alert className="border-warn bg-warn-surface" role="status">
          <Clock aria-hidden="true" className="text-warn" />
          <AlertTitle className="text-sm font-semibold text-warn">{TENANT_APPROVAL_COPY.title}</AlertTitle>
          <AlertDescription className="text-sm text-foreground">{TENANT_APPROVAL_COPY.body}</AlertDescription>
        </Alert>
      ) : undefined}
      scope={{ kind: "tenant", role: principal.role }}
      subtitle={shell.outletCount === 0 ? "Belum ada outlet" : `${shell.outletCount} outlet terdaftar`}
      title={shell.tenant.name}
    >
      {children}
    </AppShell>
  );
}
