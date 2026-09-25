import { Plus } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";

import type { ContactSearchRow } from "@/app/app/kontak/actions";
import { ContactDirectoryList } from "@/app/app/kontak/contact-directory-list";
import {
  CONTACT_PAGE_SIZE,
  pageCount,
  parseContactDirectoryQuery,
  type ContactDirectorySearchParams,
} from "@/app/app/kontak/contact-directory-query";
import { requireContactPagePrincipal } from "@/app/app/kontak/contact-page-guard";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { loadContactDirectoryPage } from "@/db/contact-repository";
import { withTenantContext } from "@/db/tenant-context";
import {
  CONTACT_ROLE_DESCRIPTIONS,
  contactListHref,
  contactRoleLabel,
  contactRoleToRepositoryRole,
  type ContactRole,
} from "@/lib/contact-role-filter";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

/**
 * Spec 17 UX-v3.6 `/app/kontak/pengirim` and `/penerima` (ref pengirim.html, penerima.html): one
 * directory scoped to one role. Header with "<Peran> baru" → one card: Aktif/Diarsipkan/Semua tabs
 * + search → table (Nama · Telepon · Alamat · Aksi) → 20 per page.
 */
export async function ContactDirectory({ role, searchParams }: {
  role: ContactRole;
  searchParams: Promise<ContactDirectorySearchParams>;
}) {
  const principal = await requireContactPagePrincipal();
  const route = contactListHref(role) as "/app/kontak/pengirim" | "/app/kontak/penerima";
  const scenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), route)
    : null;
  if (scenario?.endsWith("-error")) throw new Error("Intentional development-only contact directory failure.");

  const { page: requestedPage, status } = parseContactDirectoryQuery(await searchParams);
  const repositoryRole = contactRoleToRepositoryRole(role);
  let loading = withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const load = (page: number) => loadContactDirectoryPage(tx, context, {
      limit: CONTACT_PAGE_SIZE, offset: (page - 1) * CONTACT_PAGE_SIZE, query: "", role: repositoryRole, status,
    });
    const first = await load(requestedPage);
    // A page past the end shows the last page instead of an empty list.
    const lastPage = pageCount(first.summary[status]);
    return requestedPage <= lastPage ? { ...first, page: requestedPage } : { ...(await load(lastPage)), page: lastPage };
  });
  if (scenario?.endsWith("-stream")) {
    loading = loading.then((value) => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 1_200)));
  }
  const { page, rows, summary } = await loading;

  const label = contactRoleLabel(role);
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
    <>
      <PageHeader
        actions={(
          <Button asChild>
            <Link href={`/app/kontak/baru?peran=${role}`}><Plus aria-hidden="true" />{label} baru</Link>
          </Button>
        )}
        description={CONTACT_ROLE_DESCRIPTIONS[role]}
        eyebrow="Data"
        title={label}
      />
      <ContactDirectoryList
        page={page}
        role={role}
        rows={contactRows}
        status={status}
        summary={summary}
        totalPages={pageCount(summary[status])}
      />
    </>
  );
}
