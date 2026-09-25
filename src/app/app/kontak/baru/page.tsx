import { ArrowLeft, Check } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { ContactCreateForm } from "@/app/app/kontak/baru/contact-create-form";
import { firstValue } from "@/app/app/kontak/contact-directory-query";
import { requireContactPagePrincipal } from "@/app/app/kontak/contact-page-guard";
import { DataCard } from "@/components/app/data-card";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db/client";
import { listReadyShipmentOutlets } from "@/db/outlet-readiness-repository";
import { withTenantContext } from "@/db/tenant-context";
import { contactListHref, contactRoleLabel, DEFAULT_CONTACT_ROLE, parseContactRole } from "@/lib/contact-role-filter";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

type NewContactSearchParams = Promise<{ peran?: string | string[] }>;

/** `peran` preselects the role of the menu the form was opened from (T-188). */
async function requestedRole(searchParams: NewContactSearchParams) {
  return parseContactRole(firstValue((await searchParams).peran)) ?? DEFAULT_CONTACT_ROLE;
}

// The H1 and the document title repeat the "<Peran> baru" button that opens this form (V-7).
export async function generateMetadata({ searchParams }: { searchParams: NewContactSearchParams }): Promise<Metadata> {
  return { robots: { index: false }, title: `${contactRoleLabel(await requestedRole(searchParams))} baru` };
}

const CHECKLIST = [
  "Nomor telepon aktif dan bisa dihubungi kurir.",
  "Kecamatan dipilih dari daftar Mengantar agar tarif keluar.",
  "Alamat lain bisa ditambah setelah kontak tersimpan.",
];

export default async function NewContactPage({ searchParams }: { searchParams: NewContactSearchParams }) {
  const principal = await requireContactPagePrincipal();
  const scenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/kontak/baru")
    : null;
  if (scenario === "contacts-new-error") throw new Error("Intentional development-only new-contact form failure.");

  const role = await requestedRole(searchParams);
  const label = contactRoleLabel(role);
  const outlets = await withTenantContext(db, principal.userId, principal.tenantId, listReadyShipmentOutlets);

  return (
    <>
      <PageHeader
        back={(
          <Link className="inline-flex min-h-6 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline" href={contactListHref(role)}>
            <ArrowLeft aria-hidden="true" className="size-4" />Kembali ke daftar {label.toLowerCase()}
          </Link>
        )}
        description="Simpan sekali, lalu pilih saat membuat draf kiriman."
        eyebrow="Data"
        title={`${label} baru`}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ContactCreateForm canManageSettings={principal.role === "TENANT_ADMIN"} outlets={outlets} role={role} />
        <aside aria-label="Sebelum menyimpan">
          <DataCard title="Sebelum menyimpan" titleAs="h2">
            <ul className="grid gap-2 text-sm text-muted-foreground">
              {CHECKLIST.map((item) => (
                <li className="flex items-start gap-2" key={item}>
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ok" />{item}
                </li>
              ))}
            </ul>
          </DataCard>
        </aside>
      </div>
    </>
  );
}
