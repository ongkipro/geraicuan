import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ContactDirectoryBrowser } from "@/app/app/kontak/contact-directory-browser";
import type { SafeContactSearchRow } from "@/app/app/kontak/actions";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { listContacts } from "@/db/contact-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

type SearchValue = string | string[] | undefined;
type ContactDirectoryPageProps = { searchParams: Promise<{ status?: SearchValue }> };

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function maskPhone(phone: string) {
  return phone.length <= 7
    ? `${"•".repeat(Math.max(0, phone.length - 2))}${phone.slice(-2)}`
    : `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
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

  const requestedStatus = firstValue((await searchParams).status);
  const status = requestedStatus === "archived" ? "archived" : "active";
  const invalidStatus = Boolean(requestedStatus && requestedStatus !== "active" && requestedStatus !== "archived");
  let rowsPromise = withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    listContacts(tx, context, "", status),
  );
  if (auditScenario === "contacts-stream") {
    rowsPromise = rowsPromise.then((value) => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 1_200)));
  }
  const rows = await rowsPromise;
  const safeRows: SafeContactSearchRow[] = rows.map((contact) => ({
    archived: Boolean(contact.archivedAt),
    id: contact.id,
    isRecipient: contact.isRecipient,
    isSender: contact.isSender,
    name: contact.name,
    phoneMasked: maskPhone(contact.phone),
  }));

  return (
    <PageContainer>
      <PageHeader actions={<Button asChild className="min-h-11"><Link href="/app/kontak/baru"><Plus aria-hidden="true" />Kontak baru</Link></Button>} description="Simpan data pengirim dan penerima sekali, lalu gunakan kembali pada draf berikutnya." eyebrow="Data" title="Kontak" />
      {invalidStatus ? <Alert role="status"><AlertTitle>Filter status disesuaikan</AlertTitle><AlertDescription>Status tidak dikenali; kontak aktif ditampilkan.</AlertDescription></Alert> : null}
      <ContactDirectoryBrowser initialRows={safeRows} status={status} />
    </PageContainer>
  );
}
