import { randomUUID } from "node:crypto";

import { Building2, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DateRangePicker } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TenantUsageRow } from "@/db/platform-monitoring-repository";
import { formatRangeLabel } from "@/lib/analytics-range";
import { buildPlatformHref } from "@/lib/platform-monitoring-filters";
import { formatCount, formatShortId } from "@/lib/platform-monitoring-format";

import { PLATFORM_PAGE_SIZE, formatWib } from "../_components/platform-format";
import { filtersChanged } from "../_components/platform-logic";
import {
  DESKTOP_ONLY,
  FLUSH_TABLE,
  PHONE_ONLY,
  PlatformCard,
  PlatformPagination,
  RegionError,
  StackCell,
  TenantStatusBadge,
} from "../_components/platform-ui";
import { loadPlatformView } from "../_components/platform-view";
import { CreateTenant } from "./_components/create-tenant";

export const metadata: Metadata = { robots: { index: false }, title: "Tenant" };
export const dynamic = "force-dynamic";

/** The counts that ask for a look; a tenant without any reads plainly. */
function submissionIssues(row: TenantUsageRow) {
  return [
    [row.failed, "gagal"],
    [row.unknown, "tidak diketahui"],
    [row.unpaid, "belum dibayar"],
  ]
    .filter(([count]) => Number(count) > 0)
    .map(([count, word]) => `${formatCount(Number(count))} ${word}`)
    .join(" · ");
}

export default async function PlatformTenantsPage({ searchParams }: PageProps<"/platform/tenant">) {
  const view = await loadPlatformView("tenant-list", await searchParams);
  const { filters } = view;
  const range = formatRangeLabel(filters.range);
  const changed = filtersChanged(filters);
  const href = (id: string) => `/platform/tenant/${id}?rentang=${filters.range.presetId}&tz=${encodeURIComponent(filters.range.timezone)}`;
  const rows = view.usage?.rows ?? [];

  return (
    <>
      <PageHeader
        actions={<CreateTenant initialAttemptId={randomUUID()} />}
        description="Status, penggunaan, dan kesiapan outlet setiap tenant."
        eyebrow="Platform"
        title="Tenant"
      />
      <FilterBar clearHref={changed ? "/platform/tenant" : undefined} label="Filter tenant" summary={`${range.periodLabel} · ${range.timezoneLabel}`}>
        <label className="w-full sm:w-72">
          <span className="sr-only">Cari nama tenant</span>
          <Input defaultValue={filters.query ?? ""} maxLength={80} minLength={2} name="q" placeholder="Cari nama tenant…" type="search" />
        </label>
        <DateRangePicker endDate={filters.range.lastIncludedDate} label={range.presetLabel} presetId={filters.range.presetId} startDate={filters.range.startDate} />
      </FilterBar>
      {!view.usage ? (
        <RegionError title="Daftar tenant" />
      ) : (
        <PlatformCard
          count={view.usage.total}
          countNoun="tenant"
          flush
          footer={rows.length ? (
            <PlatformPagination
              hrefForPage={(page) => buildPlatformHref("/platform/tenant", filters, { page })}
              label="Halaman tenant"
              noun="tenant"
              page={filters.page}
              pageSize={PLATFORM_PAGE_SIZE}
              total={view.usage.total}
            />
          ) : undefined}
          id="daftar-tenant"
          title="Daftar tenant"
        >
          {rows.length ? (
            <>
              <Table className={`${FLUSH_TABLE} ${DESKTOP_ONLY}`}>
                <TableCaption className="sr-only">Tenant dengan masalah pengajuan tampil lebih dulu · {range.periodLabel}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Kiriman / resi</TableHead>
                    <TableHead>Pengajuan</TableHead>
                    <TableHead className="text-right">Outlet lengkap</TableHead>
                    <TableHead className="text-right">Anggota</TableHead>
                    <TableHead>Aktivitas terakhir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const issues = submissionIssues(row);
                    return (
                      <TableRow key={row.tenantId}>
                        <TableCell className="min-w-52 whitespace-normal">
                          <StackCell
                            primary={<Link className="font-semibold text-primary hover:underline" href={href(row.tenantId)} prefetch={false}>{row.name}</Link>}
                            secondary={<>ID <span className="font-mono">{formatShortId(row.tenantId)}</span></>}
                          />
                        </TableCell>
                        <TableCell><TenantStatusBadge status={row.status} /></TableCell>
                        <TableCell className="text-right tabular-nums">
                          <StackCell primary={<span className="font-semibold">{formatCount(row.shipments)}</span>} secondary={`${formatCount(row.issued)} resi terbit`} />
                        </TableCell>
                        <TableCell>
                          <StackCell primary={`${formatCount(row.batches)} pengajuan`} secondary={issues ? <span className="font-medium text-danger">{issues}</span> : undefined} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.outletConfigured}/{row.outletTotal}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCount(row.members)}</TableCell>
                        <TableCell className="text-muted-foreground">{row.lastActivityAt ? formatWib(row.lastActivityAt) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className={PHONE_ONLY}>
                <RecordList label="Daftar tenant">
                  {rows.map((row) => (
                    <RecordItem
                      href={href(row.tenantId)}
                      key={row.tenantId}
                      meta={`Outlet lengkap ${row.outletConfigured}/${row.outletTotal} · ${formatCount(row.members)} anggota`}
                      status={<TenantStatusBadge status={row.status} />}
                      subtitle={`${formatCount(row.shipments)} kiriman · ${formatCount(row.issued)} resi terbit`}
                      time={row.lastActivityAt ? formatWib(row.lastActivityAt) : "Belum ada aktivitas"}
                      title={row.name}
                      value={submissionIssues(row) || undefined}
                    />
                  ))}
                </RecordList>
              </div>
            </>
          ) : changed ? (
            <EmptyState
              action={<Button asChild variant="outline"><Link href="/platform/tenant">Hapus filter</Link></Button>}
              icon={SearchX}
              title="Tidak ada tenant yang cocok"
            />
          ) : (
            <EmptyState description="Buat tenant pertama, atau setujui pendaftaran gerai." icon={Building2} title="Belum ada tenant" />
          )}
        </PlatformCard>
      )}
    </>
  );
}
