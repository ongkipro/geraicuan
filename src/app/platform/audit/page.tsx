import { ScrollText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DateRangePicker } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRangeLabel } from "@/lib/analytics-range";
import { auditActionSentence } from "@/lib/labels/audit";
import { buildPlatformHref } from "@/lib/platform-monitoring-filters";

import { FilterSelect } from "../_components/filter-select";
import { PLATFORM_PAGE_SIZE, auditActor, formatWib, tenantStatusChange } from "../_components/platform-format";
import { filtersChanged } from "../_components/platform-logic";
import {
  AuditOutcomeBadge,
  DESKTOP_ONLY,
  FLUSH_TABLE,
  PHONE_ONLY,
  PlatformCard,
  PlatformPagination,
  RegionError,
  StackCell,
  TimeCell,
} from "../_components/platform-ui";
import { loadPlatformView } from "../_components/platform-view";

export const metadata: Metadata = { robots: { index: false }, title: "Audit" };
export const dynamic = "force-dynamic";

export default async function PlatformAuditPage({ searchParams }: PageProps<"/platform/audit">) {
  const view = await loadPlatformView("audit", await searchParams);
  const { filters } = view;
  const range = formatRangeLabel(filters.range);
  const changed = filtersChanged(filters);
  const rows = view.audit?.rows ?? [];

  return (
    <>
      <PageHeader eyebrow="Platform" title="Audit" />
      <FilterBar clearHref={changed ? "/platform/audit" : undefined} label="Filter audit" summary={`${range.periodLabel} · ${range.timezoneLabel}`}>
        <DateRangePicker endDate={filters.range.lastIncludedDate} label={range.presetLabel} presetId={filters.range.presetId} startDate={filters.range.startDate} />
        <FilterSelect
          allLabel="Semua tenant"
          label="Tenant"
          name="tenant"
          options={view.tenants.map((tenant) => ({ label: tenant.name, value: tenant.id }))}
          value={filters.scope.kind === "tenant" ? filters.scope.tenantId : null}
        />
        <FilterSelect
          allLabel="Semua hasil"
          label="Hasil"
          name="hasil"
          options={[{ label: "Berhasil", value: "SUCCESS" }, { label: "Ditolak", value: "DENIED" }]}
          value={filters.outcome}
        />
      </FilterBar>
      {!view.audit ? (
        <RegionError title="Jejak audit" />
      ) : (
        <PlatformCard
          count={view.audit.total}
          countNoun="entri"
          flush
          footer={rows.length ? (
            <PlatformPagination
              hrefForPage={(page) => buildPlatformHref("/platform/audit", filters, { page })}
              label="Halaman audit"
              noun="entri"
              page={filters.page}
              pageSize={PLATFORM_PAGE_SIZE}
              total={view.audit.total}
            />
          ) : undefined}
          id="jejak-audit"
          title="Jejak audit"
        >
          {rows.length ? (
            <>
              <Table className={`${FLUSH_TABLE} ${DESKTOP_ONLY}`}>
                <TableCaption className="sr-only">Jejak audit · {range.periodLabel} · {range.timezoneLabel}</TableCaption>
                <TableHeader>
                  <TableRow><TableHead>Waktu</TableHead><TableHead>Aksi</TableHead><TableHead>Pelaku</TableHead><TableHead>Tenant</TableHead><TableHead>Hasil</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell><TimeCell instant={row.createdAt} /></TableCell>
                      <TableCell className="whitespace-normal"><StackCell primary={<span className="font-medium">{auditActionSentence(row)}</span>} secondary={tenantStatusChange(row)} /></TableCell>
                      <TableCell>{auditActor(row)}</TableCell>
                      <TableCell className="whitespace-normal">
                        {row.tenantId && row.tenantName ? (
                          <Link className="text-primary hover:underline" href={`/platform/tenant/${row.tenantId}`} prefetch={false}>{row.tenantName}</Link>
                        ) : (
                          <span className="text-muted-foreground">Platform</span>
                        )}
                      </TableCell>
                      <TableCell><AuditOutcomeBadge outcome={row.outcome} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className={PHONE_ONLY}>
                <RecordList label="Jejak audit">
                  {rows.map((row) => (
                    <RecordItem
                      key={row.id}
                      meta={tenantStatusChange(row)}
                      status={<AuditOutcomeBadge outcome={row.outcome} />}
                      subtitle={`${row.tenantName ?? "Platform"} · ${auditActor(row)}`}
                      time={formatWib(row.createdAt)}
                      title={<span className="whitespace-normal">{auditActionSentence(row)}</span>}
                    />
                  ))}
                </RecordList>
              </div>
            </>
          ) : changed ? (
            <EmptyState
              action={<Button asChild variant="outline"><Link href="/platform/audit">Hapus filter</Link></Button>}
              icon={SearchX}
              title="Tidak ada entri yang cocok"
            />
          ) : (
            <EmptyState icon={ScrollText} title="Belum ada aktivitas audit pada periode ini" />
          )}
        </PlatformCard>
      )}
    </>
  );
}
