import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ContactForm } from "@/app/app/kontak/contact-form";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

export default async function NewContactPage() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
    if (principal.scope !== "tenant") redirect("/login/tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/kontak/baru")
    : null;
  if (auditScenario === "contacts-new-error") throw new Error("Intentional development-only new-contact form failure.");

  const outlets = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    listReadyShipmentOutlets,
  );

  return <PageContainer width="form"><PageHeader description="Satu kontak dapat dipakai sebagai pengirim, penerima, atau keduanya." eyebrow="Data" title="Buat kontak" /><ContactForm outlets={outlets} /></PageContainer>;
}
