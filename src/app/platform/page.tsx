import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DateRangePicker } from "@/components/app/date-range-picker";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { StatusBadge } from "@/components/app/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HealthTile, PlatformHealth } from "@/db/platform-monitoring-repository";
import { formatRangeLabel } from "@/lib/analytics-range";
import { auditActionSentence } from "@/lib/labels/audit";
import { buildPlatformHref } from "@/lib/platform-monitoring-filters";
import { formatCount, formatDuration } from "@/lib/platform-monitoring-format";

import { auditActor, formatSeconds, formatWib, severityBadge } from "./_components/platform-format";
import { attentionItems, filtersChanged } from "./_components/platform-logic";
import { PlatformTrendChart } from "./_components/platform-trend-chart";
import {
  ArrowLink,
  AuditOutcomeBadge,
  DESKTOP_ONLY,
  FLUSH_TABLE,
  PHONE_ONLY,
  PlatformCard,
  RegionError,
  StackCell,
  TenantStatusBadge,
  TimeCell,
} from "./_components/platform-ui";
import { loadPlatformView, type PlatformView } from "./_components/platform-view";

export const metadata: Metadata = { robots: { index: false }, title: "Ringkasan" };
export const dynamic = "force-dynamic";

function HealthCard({ detail, label, tile, value }: {
  detail: string;
  label: string;
  tile?: HealthTile;
  value: string;
}) {
  const badge = tile ? severityBadge(tile.severity) : null;
  return (
    <Card className="gap-2 [--card-spacing:--spacing(5)] max-md:[--card-spacing:--spacing(4)]" data-slot="health-card">
      <p className="px-(--card-spacing) text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 px-(--card-spacing)">
        <p className="text-3xl font-bold tabular-nums">{value}</p>
        {badge ? <StatusBadge label={badge.label} tone={badge.tone} /> : null}
      </div>
      <p className="px-(--card-spacing) text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}

function HealthRow({ health }: { health: PlatformHealth }) {
  return (
    <section aria-label="Kesehatan platform" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <HealthCard detail={health.queue.count ? `Terlama ${formatDuration(health.queue.oldestMs)}` : "Tidak ada yang tertahan"} label="Antrean pengajuan" tile={health.queue} value={formatCount(health.queue.count)} />
      <HealthCard detail={`${Math.round(health.failures.share * 100)}% dari pengajuan`} label="Kegagalan provider" tile={health.failures} value={formatCount(health.failures.count)} />
      <HealthCard detail={`${formatCount(health.unknown.batches)} pengajuan · ${formatCount(health.unknown.orders)} pesanan`} label="Status tidak diketahui" tile={health.unknown} value={formatCount(health.unknown.count)} />
      <HealthCard detail={`${formatCount(health.unpaid.recovering)} pemulihan berjalan`} label="Menunggu pembayaran" tile={health.unpaid} value={formatCount(health.unpaid.count)} />
      <HealthCard detail={`Median · 95% selesai dalam ${formatSeconds(health.latency.p95Seconds)}`} label="Durasi penyelesaian" value={formatSeconds(health.latency.p50Seconds)} />
    </section>
  );
}

function Attention({ view }: { view: PlatformView }) {
  const items = attentionItems(view.health, view.usage?.rows ?? []);
  return (
    <PlatformCard count={items.length || undefined} flush={items.length > 0} id="perlu-perhatian" title="Perlu perhatian">
      {items.length ? (
        <ul className="divide-y">
          {items.map((item) => {
            const badge = severityBadge(item.severity);
            return (
              <li className="flex flex-col gap-2 px-6 py-4 max-md:px-4 sm:flex-row sm:items-center sm:justify-between" key={item.key}>
                <StackCell
                  primary={item.href ? <Link className="font-semibold text-primary hover:underline" href={item.href} prefetch={false}>{item.title}</Link> : <span className="font-semibold">{item.title}</span>}
                  secondary={item.detail}
                />
                <StatusBadge label={badge.label} tone={badge.tone} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground">
          <CircleCheck aria-hidden="true" className="size-5 text-ok" />
          Tidak ada yang perlu perhatian pada periode ini.
        </p>
      )}
    </PlatformCard>
  );
}

function Trend({ view }: { view: PlatformView }) {
  if (!view.trend) return <RegionError title="Tren kiriman" />;
  const total = view.trend.reduce((sum, bucket) => sum + bucket.created, 0);
  return (
    <PlatformCard
      action={<span className="text-sm font-bold tabular-nums">{formatCount(total)} kiriman</span>}
      className="lg:col-span-2"
      description={
        <span aria-hidden="true" className="flex flex-wrap gap-4">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-chart-1" />Kiriman dibuat</span>
          <span className="flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-chart-2" />Resi terbit</span>
        </span>
      }
      id="tren-kiriman"
      title="Tren kiriman seluruh gerai"
    >
      {total || view.trend.some((bucket) => bucket.issued) ? (
        <PlatformTrendChart data={view.trend.map(({ created, issued, label }) => ({ created, issued, label }))} />
      ) : (
        <p className="py-12 text-center text-muted-foreground">Belum ada kiriman pada periode ini.</p>
      )}
    </PlatformCard>
  );
}

function Volume({ view }: { view: PlatformView }) {
  const counts = view.counts;
  const rows: [string, string][] = counts
    ? [
        ["Gerai aktif", formatCount(counts.tenants.active)],
        ["Gerai ditangguhkan", formatCount(counts.tenants.suspended)],
        ["Gerai baru", formatCount(counts.tenants.newInRange)],
        ["Outlet lengkap", `${formatCount(counts.outlets.configured)} / ${formatCount(counts.outlets.total)}`],
        ["Anggota aktif", formatCount(counts.memberships.active)],
        ["Pengajuan selesai", `${formatCount(counts.lifecycle.batchesCompleted)} / ${formatCount(counts.lifecycle.batches)}`],
      ]
    : [];
  return (
    <PlatformCard id="volume-platform" title="Volume platform">
      {counts ? (
        <dl className="flex flex-col divide-y">
          {rows.map(([label, value]) => (
            <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <RegionError title="Volume platform" />
      )}
    </PlatformCard>
  );
}

function TopTenants({ view }: { view: PlatformView }) {
  if (!view.usage) return <RegionError title="Aktivitas gerai" />;
  const rows = view.usage.rows;
  return (
    <PlatformCard
      action={<ArrowLink href={buildPlatformHref("/platform/tenant", view.filters, { page: 1 })}>Lihat semua gerai</ArrowLink>}
      flush={rows.length > 0}
      id="aktivitas-tenant"
      title="Aktivitas gerai teratas"
    >
      {rows.length ? (
        <>
          <Table className={`${FLUSH_TABLE} ${DESKTOP_ONLY}`}>
            <TableCaption className="sr-only">Gerai dengan masalah pengajuan lebih dulu, lalu resi terbit terbanyak.</TableCaption>
            <TableHeader>
              <TableRow><TableHead>Gerai</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Kiriman</TableHead><TableHead className="text-right">Resi terbit</TableHead><TableHead>Aktivitas terakhir</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.tenantId}>
                  <TableCell>
                    <StackCell
                      primary={<Link className="font-semibold text-primary hover:underline" href={`/platform/tenant/${row.tenantId}`} prefetch={false}>{row.name}</Link>}
                      secondary={`Outlet lengkap ${row.outletConfigured}/${row.outletTotal}`}
                    />
                  </TableCell>
                  <TableCell><TenantStatusBadge status={row.status} /></TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCount(row.shipments)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCount(row.issued)}</TableCell>
                  <TableCell className="text-muted-foreground">{row.lastActivityAt ? formatWib(row.lastActivityAt) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className={PHONE_ONLY}>
            <RecordList label="Aktivitas gerai teratas">
              {rows.map((row) => (
                <RecordItem
                  href={`/platform/tenant/${row.tenantId}`}
                  key={row.tenantId}
                  status={<TenantStatusBadge status={row.status} />}
                  subtitle={`${formatCount(row.shipments)} kiriman · ${formatCount(row.issued)} resi terbit`}
                  time={row.lastActivityAt ? formatWib(row.lastActivityAt) : "Belum ada aktivitas"}
                  title={row.name}
                />
              ))}
            </RecordList>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Belum ada gerai.</p>
      )}
    </PlatformCard>
  );
}

function RecentAudit({ view }: { view: PlatformView }) {
  if (!view.audit) return <RegionError title="Aktivitas audit" />;
  const rows = view.audit.rows;
  return (
    <PlatformCard
      action={<ArrowLink href={buildPlatformHref("/platform/audit", view.filters, { outcome: null, page: 1, query: null })}>Lihat semua audit</ArrowLink>}
      flush={rows.length > 0}
      id="aktivitas-audit"
      title="Aktivitas audit terbaru"
    >
      {rows.length ? (
        <ul className="divide-y">
          {rows.map((row) => (
            <li className="flex flex-col gap-2 px-6 py-3 max-md:px-4 sm:flex-row sm:items-center sm:justify-between" key={row.id}>
              <StackCell
                primary={auditActionSentence(row)}
                secondary={`${row.tenantName ?? "Platform"} · ${auditActor(row)}`}
              />
              <div className="flex shrink-0 items-center gap-3 sm:flex-row-reverse">
                <AuditOutcomeBadge outcome={row.outcome} />
                <span className="text-xs text-muted-foreground"><TimeCell instant={row.createdAt} /></span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Belum ada aktivitas audit pada periode ini.</p>
      )}
    </PlatformCard>
  );
}

export default async function PlatformOverviewPage({ searchParams }: PageProps<"/platform">) {
  const view = await loadPlatformView("overview", await searchParams);
  const range = formatRangeLabel(view.filters.range);
  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Ringkasan"
      />
      <FilterBar
        clearHref={filtersChanged(view.filters) ? "/platform" : undefined}
        label="Filter ringkasan"
        summary={`${range.periodLabel} · ${range.timezoneLabel}`}
      >
        <DateRangePicker endDate={view.filters.range.lastIncludedDate} presetId={view.filters.range.presetId} startDate={view.filters.range.startDate} />
      </FilterBar>
      {view.health ? <HealthRow health={view.health} /> : <RegionError title="Kesehatan platform" />}
      <Attention view={view} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Trend view={view} />
        <Volume view={view} />
      </div>
      <TopTenants view={view} />
      <RecentAudit view={view} />
    </>
  );
}
