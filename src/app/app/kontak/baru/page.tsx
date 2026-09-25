import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ContactForm } from "@/app/app/kontak/contact-form";
import { FormLayout, PageAside } from "@/components/cms/cms-layouts";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { contactRoleLabel, DEFAULT_CONTACT_ROLE, parseContactRole } from "@/lib/contact-role-filter";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

type SearchValue = string | string[] | undefined;

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ peran?: SearchValue }> }) {
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

  // T-188: `peran` preselects the role of the menu the form was opened from.
  const requestedPeran = (await searchParams).peran;
  const role = parseContactRole(Array.isArray(requestedPeran) ? requestedPeran[0] : requestedPeran) ?? DEFAULT_CONTACT_ROLE;
  const outlets = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    listReadyShipmentOutlets,
  );

  return (
    <PageContainer>
      <PageHeader description={`${contactRoleLabel(role)} baru. Simpan sekali, lalu pilih saat membuat draf kiriman.`} eyebrow="Data" title="Buat kontak" />
      <FormLayout
        aside={(
          <PageAside label="Bantuan kontak baru">
            <Card>
              <CardHeader>
                <CardTitle>Sebelum menyimpan</CardTitle>
                <CardDescription>Data yang benar mempercepat pembuatan kiriman berikutnya.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm text-muted-foreground">
                <p>Nomor telepon dipakai untuk konfirmasi kurir; pastikan formatnya aktif.</p>
                <p>Alamat pertama langsung tersedia sebagai pilihan saat membuat draf kiriman.</p>
              </CardContent>
            </Card>
          </PageAside>
        )}
      >
        <ContactForm outlets={outlets} role={role} />
      </FormLayout>
    </PageContainer>
  );
}
