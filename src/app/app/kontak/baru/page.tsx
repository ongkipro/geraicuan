import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Check } from "lucide-react";

import { ContactForm } from "@/app/app/kontak/contact-form";
import { BackLink } from "@/components/cms/back-link";
import { FormLayout, PageAside } from "@/components/cms/cms-layouts";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { contactListHref, contactRoleLabel, DEFAULT_CONTACT_ROLE, parseContactRole } from "@/lib/contact-role-filter";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

type SearchValue = string | string[] | undefined;

function requestedRole(peran: SearchValue) {
  return parseContactRole(Array.isArray(peran) ? peran[0] : peran) ?? DEFAULT_CONTACT_ROLE;
}

// V-7: the H1 and the document title repeat the "<Peran> baru" button that opens this form.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ peran?: SearchValue }> }): Promise<Metadata> {
  return { title: `${contactRoleLabel(requestedRole((await searchParams).peran))} baru · GeraiCUAN`, robots: { index: false } };
}

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
  const role = requestedRole((await searchParams).peran);
  const outlets = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    listReadyShipmentOutlets,
  );

  return (
    <PageContainer>
      <div className="grid gap-1">
        <BackLink href={contactListHref(role)}>Kembali ke daftar {contactRoleLabel(role).toLowerCase()}</BackLink>
        <PageHeader description="Simpan sekali, lalu pilih saat membuat draf kiriman." eyebrow="Data" title={`${contactRoleLabel(role)} baru`} />
      </div>
      <FormLayout
        aside={(
          <PageAside label="Bantuan kontak baru">
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Sebelum menyimpan</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-3 text-sm text-muted-foreground">
                  {[
                    "Nomor telepon aktif dan bisa dihubungi kurir.",
                    "Area tujuan dipilih dari daftar Mengantar agar tarif keluar.",
                    "Alamat lain bisa ditambah setelah kontak tersimpan.",
                  ].map((tip) => (
                    <li className="flex items-start gap-2" key={tip}><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{tip}</li>
                  ))}
                </ul>
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
