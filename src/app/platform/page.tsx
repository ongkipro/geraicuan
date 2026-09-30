import { ChevronDown, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { DateRangePicker } from "@/components/app/date-range-picker";
import { FilterBar } from "@/components/app/filter-bar";
import { SectionHelp } from "@/components/app/help-hint";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { StatStrip, type StatItem } from "@/components/app/stat-strip";
import { StatusBadge } from "@/components/app/status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HealthTile, PlatformHealth } from "@/db/platform-monitoring-repository";
import { formatRangeLabel } from "@/lib/analytics-range";
import { buildPlatformHref } from "@/lib/platform-monitoring-filters";
import { formatCount, formatDuration } from "@/lib/platform-monitoring-format";

import { formatSeconds, formatWib, severityBadge } from "./_components/platform-format";
import { attentionItems, filtersChanged, platformTrendTotals } from "./_components/platform-logic";
import { PlatformTrendChart } from "./_components/platform-trend-chart";
import {
  ArrowLink,
  AuditFeed,
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

/**
 * T-257: the five health signals as one §4.6 stat strip instead of five 150 px cards. A badge
 * appears only above Normal (Perhatian / Kritis), where it changes a decision.
 */
function HealthRow({ health }: { health: PlatformHealth }) {
  const badge = (tile: HealthTile) => {
    if (tile.severity === "normal") return null;
    const { label, tone } = severityBadge(tile.severity);
    return <StatusBadge label={label} tone={tone} />;
  };
  const items: StatItem[] = [
    { badge: badge(health.queue), key: "queue", label: "Antrean pengajuan", metric: "OPS-QUEUE-STUCK", note: health.queue.count ? `Terlama ${formatDuration(health.queue.oldestMs)}` : "Tidak ada yang tertahan", value: formatCount(health.queue.count) },
    { badge: badge(health.failures), key: "failures", label: "Kegagalan provider", metric: "OPS-FAILURE-COUNT", note: `${Math.round(health.failures.share * 100)}% dari pengajuan`, value: formatCount(health.failures.count) },
    { badge: badge(health.unknown), key: "unknown", label: "Status tidak diketahui", metric: "OPS-UNKNOWN", note: `${formatCount(health.unknown.batches)} pengajuan · ${formatCount(health.unknown.orders)} pesanan`, value: formatCount(health.unknown.count) },
    { badge: badge(health.unpaid), key: "unpaid", label: "Menunggu pembayaran", metric: "OPS-UNPAID", note: `${formatCount(health.unpaid.recovering)} pemulihan berjalan`, value: formatCount(health.unpaid.count) },
    { key: "latency", label: "Durasi penyelesaian", metric: "OPS-BATCH-DURATION", note: `Median · 95% dalam ${formatSeconds(health.latency.p95Seconds)}`, value: formatSeconds(health.latency.p50Seconds) },
  ];
  return <StatStrip items={items} label="Kesehatan platform" />;
}

function HealthHelp() {
  return (
    <SectionHelp label="Cara membaca kesehatan platform">
      <p>Antrean pengajuan menghitung pengajuan ke Mengantar yang tertahan lebih dari 15 menit. Kritis bila 20 atau lebih, atau yang terlama lebih dari 60 menit.</p>
      <p>Kegagalan provider adalah pengajuan gagal pada periode ini; persennya dari semua pengajuan periode ini. Status tidak diketahui perlu rekonsiliasi sebelum dicoba lagi.</p>
      <p>Menunggu pembayaran adalah pesanan yang belum dibayar ke Mengantar. Durasi penyelesaian adalah median waktu pengajuan sampai selesai.</p>
      <p>Tanda Perhatian atau Kritis hanya muncul bila perlu tindakan.</p>
    </SectionHelp>
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
              <li className="flex items-start justify-between gap-3 px-6 py-4 max-md:px-4 sm:items-center" key={item.key}>
                <StackCell
                  primary={item.href ? <Link className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline md:min-h-6" href={item.href} prefetch={false}>{item.title}</Link> : <span className="font-semibold">{item.title}</span>}
                  secondary={item.detail}
                />
                <span className="shrink-0"><StatusBadge label={badge.label} tone={badge.tone} /></span>
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

/** A legend entry that also carries the series' period total (spec 19 PLT-TREND-TOTALS, as T-254). */
function LegendTotal({ children, label, metric, swatch }: { children: ReactNode; label: string; metric: string; swatch: string }) {
  return (
    <div className="flex items-baseline gap-2" data-metric-id={metric}>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true" className={`w-4 self-center ${swatch}`} />
        {label}
      </dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function Trend({ view }: { view: PlatformView }) {
  if (!view.trend) return <RegionError title="Tren kiriman" />;
  const totals = platformTrendTotals(view.trend);
  return (
    <PlatformCard
      action={(
        <SectionHelp label="Penjelasan tren kiriman">
          <p>Kiriman dibuat dihitung menurut waktu kiriman dibuat; resi diterbitkan menurut waktu Mengantar menerbitkan resi. Keduanya per hari (WIB), seluruh gerai.</p>
          <p>Angka di samping keterangan garis adalah total periode ini.</p>
        </SectionHelp>
      )}
      className="lg:col-span-2"
      id="tren-kiriman"
      title="Tren kiriman seluruh gerai"
    >
      <dl aria-label="Total periode ini" className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <LegendTotal label="Kiriman dibuat" metric="PLT-TREND-TOTALS" swatch="h-0.5 bg-chart-1">{formatCount(totals.created)}</LegendTotal>
        <LegendTotal label="Resi diterbitkan" metric="PLT-TREND-TOTALS" swatch="border-t-2 border-dashed border-chart-2">{formatCount(totals.issued)}</LegendTotal>
      </dl>
      {totals.created || totals.issued ? (
        <>
          <PlatformTrendChart data={view.trend.map(({ created, issued, label }) => ({ created, issued, label }))} />
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground md:min-h-6 [&::-webkit-details-marker]:hidden">
              Lihat tabel data tren
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <Table aria-label="Data tren kiriman" className="mt-2 text-xs [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0 [&_tr]:hover:bg-transparent">
              <TableCaption className="sr-only">Kiriman dibuat dan resi diterbitkan per hari, terbaru di atas.</TableCaption>
              <TableHeader>
                <TableRow><TableHead>Tanggal (WIB)</TableHead><TableHead className="text-right">Kiriman dibuat</TableHead><TableHead className="text-right">Resi diterbitkan</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {[...view.trend].reverse().map((bucket) => (
                  <TableRow className="h-auto" key={bucket.key}>
                    <TableCell className="h-auto py-1.5">{bucket.label}</TableCell>
                    <TableCell className="h-auto py-1.5 text-right tabular-nums">{formatCount(bucket.created)}</TableCell>
                    <TableCell className="h-auto py-1.5 text-right tabular-nums">{formatCount(bucket.issued)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </>
      ) : (
        <p className="py-12 text-center text-muted-foreground">Belum ada kiriman pada periode ini.</p>
      )}
    </PlatformCard>
  );
}

function Volume({ view }: { view: PlatformView }) {
  const counts = view.counts;
  const rows: [string, string, string][] = counts
    ? [
        ["Gerai aktif", formatCount(counts.tenants.active), "PLT-TENANT-ACTIVE"],
        ["Gerai ditangguhkan", formatCount(counts.tenants.suspended), "PLT-TENANT-SUSPENDED"],
        ["Gerai baru", formatCount(counts.tenants.newInRange), "PLT-TENANT-NEW"],
        ["Outlet lengkap", `${formatCount(counts.outlets.configured)} / ${formatCount(counts.outlets.total)}`, "PLT-OUTLET-CONFIGURED"],
        ["Anggota aktif", formatCount(counts.memberships.active), "PLT-MEMBER-ACTIVE"],
        ["Pengajuan selesai", `${formatCount(counts.lifecycle.batchesCompleted)} / ${formatCount(counts.lifecycle.batches)}`, "PLT-BATCH-COMPLETED"],
      ]
    : [];
  return (
    <PlatformCard id="volume-platform" title="Volume platform">
      {counts ? (
        <dl className="flex flex-col divide-y">
          {rows.map(([label, value, metric]) => (
            <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" data-metric-id={metric} key={label}>
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
            <TableCaption className="sr-only">Gerai dengan masalah pengajuan lebih dulu, lalu resi diterbitkan terbanyak.</TableCaption>
            <TableHeader>
              <TableRow><TableHead>Gerai</TableHead><TableHead>Status</TableHead><TableHead className="w-28 text-right">Kiriman</TableHead><TableHead className="w-32 text-right">Resi diterbitkan</TableHead><TableHead>Aktivitas terakhir</TableHead></TableRow>
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
                  <TableCell className="text-right font-semibold tabular-nums" data-metric-id="PLT-TENANT-SHIPMENTS">{formatCount(row.shipments)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums" data-metric-id="PLT-TENANT-ISSUED">{formatCount(row.issued)}</TableCell>
                  <TableCell className="text-muted-foreground">{row.lastActivityAt ? <TimeCell instant={row.lastActivityAt} now={view.now} /> : "—"}</TableCell>
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
                  subtitle={`${formatCount(row.shipments)} kiriman · ${formatCount(row.issued)} resi diterbitkan`}
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
      action={(
        <>
          <ArrowLink href={buildPlatformHref("/platform/audit", view.filters, { outcome: null, page: 1, query: null })}>Lihat semua audit</ArrowLink>
          <SectionHelp label="Penjelasan aktivitas audit terbaru">
            <p>Lima aktivitas terbaru pada periode ini. Membuka pemantauan platform tidak ditampilkan di sini agar perubahan tidak tertutup; semuanya ada di halaman Audit.</p>
          </SectionHelp>
        </>
      )}
      flush={rows.length > 0}
      id="aktivitas-audit"
      title="Aktivitas audit terbaru"
    >
      {rows.length ? (
        <AuditFeed label="Aktivitas audit terbaru" now={view.now} rows={rows} />
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
      <section aria-labelledby="kesehatan-platform" className="grid gap-3">
        {/* T-257: the card header's anatomy on the ground, as Laporan's Ringkasan (T-254). */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg leading-snug font-bold" id="kesehatan-platform">Kesehatan platform</h2>
          <HealthHelp />
        </div>
        {view.health ? <HealthRow health={view.health} /> : <RegionError title="Kesehatan platform" />}
      </section>
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
