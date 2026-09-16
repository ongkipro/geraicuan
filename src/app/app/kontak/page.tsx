import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ContactDirectoryBrowser } from "@/app/app/kontak/contact-directory-browser";
import type { ContactSearchRow } from "@/app/app/kontak/actions";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { StateSummaryPanel } from "@/components/cms/state-summary-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { loadContactDirectoryPage } from "@/db/contact-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  CONTACT_STATUS_ENTRIES,
  contactRoleFilterToRepositoryRole,
  parseContactRoleFilter,
  parseContactStatusFilter,
} from "@/lib/contact-role-filter";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

type SearchValue = string | string[] | undefined;
type ContactDirectoryPageProps = { searchParams: Promise<{ peran?: SearchValue; status?: SearchValue }> };

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ContactDirectoryPage({ searchParams }: ContactDirectoryPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/kontak")
    : null;
  if (auditScenario === "contacts-error") throw new Error("Intentional development-only contact directory failure.");

  const { invalid: invalidStatus, status } = parseContactStatusFilter(firstValue((await searchParams).status));
  const { invalid: invalidPeran, peran } = parseContactRoleFilter(firstValue((await searchParams).peran));
  const role = contactRoleFilterToRepositoryRole(peran);
  let pagePromise = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    loadContactDirectoryPage(tx, context, { query: "", role, status }),
  );
  if (auditScenario === "contacts-stream") {
    pagePromise = pagePromise.then((value) => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 1_200)));
  }
  const { rows, summary } = await pagePromise;
  const contactRows: ContactSearchRow[] = rows.map((contact) => ({
    address: contact.address,
    addressCount: contact.addressCount,
    archived: Boolean(contact.archivedAt),
    destinationAreaLabel: contact.destinationAreaLabel,
    id: contact.id,
    isRecipient: contact.isRecipient,
    isSender: contact.isSender,
    name: contact.name,
    phone: contact.phone,
  }));

  return (
    <PageContainer>
      <PageHeader
        actions={<Button asChild className="min-h-11"><Link href="/app/kontak/baru"><Plus aria-hidden="true" />Kontak baru</Link></Button>}
        description="Simpan data pengirim dan penerima sekali, lalu gunakan kembali pada draf berikutnya."
        eyebrow="Data"
        title="Kontak"
      />
      {invalidStatus ? <Alert role="status"><AlertTitle>Filter status disesuaikan</AlertTitle><AlertDescription>Status tidak dikenali; kontak aktif ditampilkan.</AlertDescription></Alert> : null}
      {invalidPeran ? <Alert role="status"><AlertTitle>Filter peran disesuaikan</AlertTitle><AlertDescription>Peran tidak dikenali; semua kontak ditampilkan.</AlertDescription></Alert> : null}
      {/* PR-52: replaces the browser's own Aktif/Diarsipkan chips, so the page
          has one control for `status` and each entry states its count. */}
      <StateSummaryPanel
        action="/app/kontak"
        entries={CONTACT_STATUS_ENTRIES.map((entry) => ({
          count: summary[entry.metricId],
          description: entry.description,
          label: entry.label,
          metricId: entry.metricId,
          value: entry.value,
        }))}
        label="Ringkasan status kontak"
        param="status"
        preserved={{ peran: peran === "semua" ? undefined : peran }}
        selected={status}
      />
      <ContactDirectoryBrowser initialRows={contactRows} peran={peran} status={status} />
    </PageContainer>
  );
}
