import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ContactDirectoryBrowser } from "@/app/app/kontak/contact-directory-browser";
import type { ContactSearchRow } from "@/app/app/kontak/actions";
import { DataTablePagination } from "@/components/cms/data-table-pagination";
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
  CONTACT_ROLE_DESCRIPTIONS,
  contactListHref,
  contactRoleLabel,
  contactRoleToRepositoryRole,
  contactStatusEntries,
  parseContactStatusFilter,
  type ContactRole,
} from "@/lib/contact-role-filter";

type SearchValue = string | string[] | undefined;
export type ContactRoleDirectorySearchParams = Promise<{ halaman?: SearchValue; status?: SearchValue }>;

/** Contacts per directory page, the same as the shipment queue. */
const CONTACT_PAGE_SIZE = 20;

function firstValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export async function requireContactDirectoryPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}

/**
 * T-188: the Pengirim and Penerima menus are one directory scoped to one role.
 * The route page owns authentication and its own audit scenario; this renders
 * the role's rows, its role-scoped counts, and a create button that preselects
 * the role.
 */
export async function ContactRoleDirectory({
  principal,
  role,
  searchParams,
  stream = false,
}: {
  principal: Awaited<ReturnType<typeof requireContactDirectoryPrincipal>>;
  role: ContactRole;
  searchParams: ContactRoleDirectorySearchParams;
  stream?: boolean;
}) {
  const params = await searchParams;
  const { invalid: invalidStatus, status } = parseContactStatusFilter(firstValue(params.status));
  const requestedPage = Math.max(1, Number.parseInt(firstValue(params.halaman) ?? "1", 10) || 1);
  let pagePromise = withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const repositoryRole = contactRoleToRepositoryRole(role);
    const first = await loadContactDirectoryPage(tx, context, {
      limit: CONTACT_PAGE_SIZE, offset: (requestedPage - 1) * CONTACT_PAGE_SIZE, query: "", role: repositoryRole, status,
    });
    // A page past the end shows the last page instead of an empty list.
    const lastPage = Math.max(1, Math.ceil(first.summary[status] / CONTACT_PAGE_SIZE));
    if (requestedPage <= lastPage) return { ...first, page: requestedPage };
    const last = await loadContactDirectoryPage(tx, context, {
      limit: CONTACT_PAGE_SIZE, offset: (lastPage - 1) * CONTACT_PAGE_SIZE, query: "", role: repositoryRole, status,
    });
    return { ...last, page: lastPage };
  });
  if (stream) {
    pagePromise = pagePromise.then((value) => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 1_200)));
  }
  const { page, rows, summary } = await pagePromise;
  const totalCount = summary[status];
  const totalPages = Math.max(1, Math.ceil(totalCount / CONTACT_PAGE_SIZE));
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
  const label = contactRoleLabel(role);

  return (
    <PageContainer>
      <PageHeader
        actions={<Button asChild><Link href={`/app/kontak/baru?peran=${role}`}><Plus aria-hidden="true" />{label} baru</Link></Button>}
        description={CONTACT_ROLE_DESCRIPTIONS[role]}
        eyebrow="Data"
        title={label}
      />
      {invalidStatus ? <Alert role="status"><AlertTitle>Filter status disesuaikan</AlertTitle><AlertDescription>Status tidak dikenali; {label.toLowerCase()} aktif ditampilkan.</AlertDescription></Alert> : null}
      <ContactDirectoryBrowser
        filter={(
          <StateSummaryPanel
            action={contactListHref(role)}
            entries={contactStatusEntries(role).map((entry) => ({
              count: summary[entry.value],
              description: entry.description,
              label: entry.label,
              metricId: entry.metricId,
              value: entry.value,
            }))}
            label={`Status ${label.toLowerCase()}`}
            param="status"
            selected={status}
            variant="segmented"
          />
        )}
        initialRows={contactRows}
        pagination={totalPages > 1 ? (
          <DataTablePagination
            hrefForPage={(target) => `${contactListHref(role)}?status=${status}&halaman=${target}`}
            label={`Paginasi ${label.toLowerCase()}`}
            page={page}
            summary={<span className="tabular-nums">{totalCount} {label.toLowerCase()}</span>}
            totalCount={totalCount}
            totalPages={totalPages}
          />
        ) : null}
        role={role}
        status={status}
        totalCount={totalCount}
      />
    </PageContainer>
  );
}
