import { ArrowRight, ChevronDown, Megaphone, PackageSearch, Plus, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DataCard } from "@/components/app/data-card";
import { DateRangePicker } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { countUnreadAnnouncements } from "@/db/announcement-repository";
import { db } from "@/db/client";
import { listOutletReadiness, listOutletReadinessSummary, OutletSettingsDeniedError } from "@/db/outlet-readiness-repository";
import {
  loadTenantDashboardCourierRecap,
  loadTenantDashboardMetrics,
  loadTenantDashboardOutcomeSummary,
  loadTenantDashboardPeriodSummary,
  loadTenantDashboardPeriodTrend,
  loadTenantDashboardShipments,
} from "@/db/tenant-dashboard-repository";
import { withTenantContext, type TenantContext, type TenantTransaction } from "@/db/tenant-context";
import { buildAnalyticsDecisionContext } from "@/lib/analytics-decision-context";
import { analyticsIssueMessage, buildTrendBuckets, parseAnalyticsRange, previousAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatWibDateTime } from "@/lib/label-format";
import { providerDeliveryBasisSentence } from "@/lib/provider-delivery-status";
import { TENANT_APPROVAL_COPY } from "@/lib/tenant-approval";
import { cn } from "@/lib/utils";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

import { DASHBOARD_DEFAULT_PRESET, mergeRecentShipments, RECENT_ROWS } from "./_dashboard/dashboard-logic";
import { OutletSelect } from "./_dashboard/outlet-select";
import {
  arrowLink,
  CourierRecapTable,
  DashboardCard,
  KpiRow,
  OutcomeHelp,
  OutcomeTable,
  RecentList,
  RegionError,
  TrendBody,
  TrendLegend,
} from "./_dashboard/sections";
import { SetupSteps } from "./_dashboard/setup-steps";

export const metadata: Metadata = { robots: { index: false }, title: "Dasbor" };

const clock = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function settle<T>(promise: Promise<T>) {
  try {
    return { ok: true as const, value: await promise };
  } catch (error) {
    console.error("Dashboard region failed to load.", error);
    return { ok: false as const };
  }
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const draftId = first(params.draft);
  if (draftId && UUID.test(draftId)) redirect(`/app/pengiriman/baru?draft=${encodeURIComponent(draftId)}`);

  let principal;
  try {
    principal = await requireCmsScope("tenant", { allowPendingApproval: true });
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  const { role, tenantId, userId } = principal;
  const isAdmin = role === "TENANT_ADMIN";
  // T-244: one line to Info terbaru while this member has unread announcements (a failed count hides it).
  const unreadInfo = await withTenantContext(db, userId, tenantId, (tx, context) => countUnreadAnnouncements(tx, context.userId), { allowPendingApproval: true }).catch(() => 0);
  const infoNotice = unreadInfo > 0 ? (
    <Alert className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5" data-testid="dashboard-info-notice" role="status">
      <Megaphone aria-hidden="true" className="size-4 text-primary" />
      <span className="font-semibold">{unreadInfo} info baru</span>
      <Link className={arrowLink} href="/app/info">Lihat info terbaru<ArrowRight aria-hidden="true" /></Link>
    </Alert>
  ) : null;

  // PR-60: a gerai awaiting approval sees its setup steps, not shipment figures; every shipment
  // read below stays behind the default approval refusal.
  if (principal.tenantStatus === "PROVISIONING") {
    const outlets = await withTenantContext(db, userId, tenantId, (tx, context) => listOutletReadiness(tx, context), { allowPendingApproval: true })
      .catch((error: unknown) => {
        if (error instanceof OutletSettingsDeniedError) return [];
        throw error;
      });
    return (
      <>
        <PageHeader description="Pengiriman terbuka setelah gerai disetujui." eyebrow="Utama" title="Dasbor" />
        {infoNotice}
        {first(params.persetujuan) === "diperlukan" ? (
          <Alert data-testid="tenant-approval-refused" role="status">
            <AlertTitle>Pengiriman belum terbuka</AlertTitle>
            <AlertDescription>{TENANT_APPROVAL_COPY.refused}</AlertDescription>
          </Alert>
        ) : null}
        <SetupSteps
          progress={{
            hasOwnConnection: outlets.some((outlet) => outlet.connectionSource === "private"),
            hasPickupPoint: outlets.some((outlet) => Boolean(outlet.defaultPickupAddressId)),
            isTenantAdmin: isAdmin,
          }}
        />
      </>
    );
  }

  const audit = parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app");
  if (audit === "dashboard-page-error") throw new Error("Intentional development-only dashboard page failure.");
  const firstRun = audit === "dashboard-first-run";
  const periodEmpty = firstRun || audit === "dashboard-period-empty";
  const read = <T,>(load: (tx: TenantTransaction, context: TenantContext) => Promise<T>) => withTenantContext(db, userId, tenantId, load);

  const outlets = await read(listOutletReadinessSummary);
  const requestedOutlet = first(params.outlet);
  const outlet = outlets.find((row) => row.id === requestedOutlet);
  const invalidOutlet = Boolean(requestedOutlet && !outlet);
  const filters = outlet ? { outletId: outlet.id } : {};
  const outletReady = outlets.some((row) => row.ready);

  const range = parseAnalyticsRange({ ...params, rentang: params.rentang ?? DASHBOARD_DEFAULT_PRESET }, new Date());
  const period = buildAnalyticsDecisionContext(range);
  const compare = range.granularity === "harian";
  const showTrend = range.spanDays > 1;
  const trend = (trendRange: typeof range) => read((tx, context) => loadTenantDashboardPeriodTrend(tx, context, trendRange, filters));

  const [metrics, summary, outcome, recap, currentTrend, previousTrend, actionable, recent] = await Promise.all([
    settle(read(loadTenantDashboardMetrics)),
    invalidOutlet ? null : settle(read((tx, context) => loadTenantDashboardPeriodSummary(tx, context, period.currentRange, period.previousRange, filters)).then((value) => {
      if (audit === "dashboard-period-error") throw new Error("Intentional development-only dashboard period failure.");
      return periodEmpty ? { ...value, current: { codCount: 0, createdCount: 0, issuedCount: 0, nonCodCount: 0 } } : value;
    })),
    invalidOutlet ? null : settle(read((tx, context) => loadTenantDashboardOutcomeSummary(tx, context, period.currentRange, filters))),
    invalidOutlet ? null : settle(read((tx, context) => loadTenantDashboardCourierRecap(tx, context, period.currentRange, filters))),
    invalidOutlet || !showTrend ? null : settle(trend(period.currentRange)),
    invalidOutlet || !showTrend || !compare ? null : settle(trend(period.previousRange)),
    settle(read((tx, context) => loadTenantDashboardShipments(tx, context, { limit: RECENT_ROWS, mode: "actionable" })).then((rows) => {
      if (audit === "dashboard-action-error") throw new Error("Intentional development-only dashboard action-region failure.");
      return rows;
    })),
    settle(read((tx, context) => loadTenantDashboardShipments(tx, context, { limit: RECENT_ROWS, mode: "recent" }))),
  ]);

  const header = (
    <PageHeader
      actions={outletReady ? (
        <Button asChild><Link href="/app/pengiriman/baru"><Plus aria-hidden="true" />Buat kiriman</Link></Button>
      ) : isAdmin ? (
        <Button asChild variant="outline"><Link href="/app/pengaturan/outlet"><Settings2 aria-hidden="true" />Siapkan outlet</Link></Button>
      ) : undefined}
      eyebrow="Utama"
      title="Dasbor"
    />
  );
  const readiness = outletReady ? null : (
    <Alert role="status">
      <Settings2 aria-hidden="true" />
      <AlertTitle>{outlets.length === 0 ? "Belum ada outlet" : "Belum ada outlet yang siap mengirim"}</AlertTitle>
      <AlertDescription>{isAdmin ? "Lengkapi titik pickup dan koneksi Mengantar di Pengaturan outlet." : "Hubungi pemilik gerai untuk melengkapi outlet."}</AlertDescription>
    </Alert>
  );

  // A gerai with no shipment at all: one empty state instead of a page of zeros.
  if (firstRun || (metrics.ok && metrics.value.summary.total === 0)) {
    return (
      <>
        {header}
        {infoNotice}
        {readiness}
        <DataCard>
          <EmptyState description="Ringkasan, grafik dan rekap kurir tampil setelah kiriman pertama dibuat." icon={PackageSearch} title="Belum ada kiriman" />
        </DataCard>
      </>
    );
  }

  const filtered = range.presetId !== DASHBOARD_DEFAULT_PRESET || Boolean(outlet);
  const query = serializeAnalyticsRange(range);
  if (outlet) query.set("outlet", outlet.id);
  const clearFilter = filtered ? <Link className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" href="/app">Hapus filter</Link> : null;
  const periodIsEmpty = summary?.ok && summary.value.current.createdCount === 0;

  const trendRows = (() => {
    if (!currentTrend?.ok || (previousTrend && !previousTrend.ok)) return null;
    const current = new Map(currentTrend.value.map((point) => [point.key, point.codCount + point.nonCodCount]));
    const previous = new Map((previousTrend?.ok ? previousTrend.value : []).map((point) => [point.key, point.codCount + point.nonCodCount]));
    const previousBuckets = compare ? buildTrendBuckets(previousAnalyticsRange(range)) : [];
    return buildTrendBuckets(range).map((bucket, index) => ({
      current: periodEmpty ? 0 : current.get(bucket.key) ?? 0,
      label: bucket.label,
      previous: previousBuckets[index] ? previous.get(previousBuckets[index].key) ?? 0 : null,
      previousLabel: previousBuckets[index]?.label ?? "—",
    }));
  })();

  const recentRows = actionable.ok || recent.ok
    ? mergeRecentShipments(actionable.ok ? actionable.value : [], recent.ok ? recent.value : [], role)
    : null;

  return (
    <>
      {header}
      {infoNotice}
      {readiness}

      <FilterBar
        action="/app"
        clearHref={filtered ? "/app" : undefined}
        label="Filter dasbor"
        summary={`${period.periodLabel} · ${period.timezoneLabel} · ${period.presetLabel}${outlet ? ` · ${outlet.name}` : ""}`}
      >
        <DateRangePicker endDate={range.lastIncludedDate} presetId={range.presetId} startDate={range.startDate} />
        <OutletSelect outlets={outlets} value={outlet?.id} />
      </FilterBar>

      {range.issues.length > 0 ? (
        <Alert role="status">
          <AlertTitle>Filter disesuaikan</AlertTitle>
          <AlertDescription><ul className="list-disc pl-5">{range.issues.map((issue) => <li key={issue}>{analyticsIssueMessage(issue)}</li>)}</ul></AlertDescription>
        </Alert>
      ) : null}
      {invalidOutlet ? (
        <Alert variant="destructive">
          <AlertTitle>Outlet tidak ditemukan</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>Outlet pada alamat halaman ini tidak tersedia untuk gerai Anda.</p>
            <div><Button asChild variant="outline"><Link href="/app">Tampilkan semua outlet</Link></Button></div>
          </AlertDescription>
        </Alert>
      ) : null}

      {summary ? (
        summary.ok ? (
          <div className="grid gap-4">
            <KpiRow comparison={range.presetId === "7-hari" ? "vs 7 hari sebelumnya" : "vs periode sebelumnya"} summary={summary.value} />
            <div className="flex flex-col justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-start">
              <details className="group max-w-lg">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium hover:text-foreground md:min-h-6 [&::-webkit-details-marker]:hidden">
                  Cara menghitung KPI
                  <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </summary>
                <p className="pt-2">Kiriman dibuat, COD dan non-COD dihitung saat kiriman dibuat (COD termasuk COD Ongkir); resi terbit dihitung saat Mengantar menerbitkan resi. Pembanding: {period.previousPeriodLabel}.</p>
              </details>
              <div className="flex flex-wrap items-center gap-x-4">
                {isAdmin ? <Link className={arrowLink} href={`/app/laporan/pengiriman?${query.toString()}`}>Laporan pengiriman<ArrowRight aria-hidden="true" /></Link> : null}
                <span className="inline-flex min-h-11 items-center md:min-h-6">Diperbarui {clock.format(summary.value.generatedAt)} WIB</span>
              </div>
            </div>
          </div>
        ) : <RegionError title="Ringkasan periode tidak dapat dimuat" />
      ) : null}

      {outcome ? (
        <div className={cn("grid grid-cols-1 gap-6", showTrend && "lg:grid-cols-2")}>
          <DashboardCard
            action={outcome.ok ? <OutcomeHelp basisSentence={providerDeliveryBasisSentence({
              formattedObservedAt: outcome.value.basis.lastObservedAt ? formatWibDateTime(outcome.value.basis.lastObservedAt) : null,
              observationVisible: outcome.value.basis.observationVisible,
              subject: "Terkirim, retur dan gagal",
            })} /> : undefined}
            description={`Periode ${period.periodLabel}`}
            id="hasil-pengiriman"
            title="Hasil pengiriman"
          >
            {!outcome.ok ? <RegionError title="Hasil pengiriman tidak dapat dimuat" />
              : outcome.value.cohortCount === 0 || periodIsEmpty ? (
                <EmptyState action={clearFilter} icon={PackageSearch} title="Tidak ada kiriman pada periode ini" />
              ) : <OutcomeTable outcome={outcome.value} />}
          </DashboardCard>
          {showTrend ? (
            <DashboardCard
              action={trendRows ? <TrendLegend compare={compare} /> : undefined}
              description={compare ? "Kiriman dibuat per hari vs periode lalu" : "Kiriman dibuat per bulan"}
              id="grafik-kiriman"
              title="Grafik kiriman"
            >
              {trendRows ? <TrendBody compare={compare} data={trendRows} /> : <RegionError title="Grafik kiriman tidak dapat dimuat" />}
            </DashboardCard>
          ) : null}
        </div>
      ) : null}

      {/* Two columns from xl: at 1024 a half-width card cannot hold the admin's five-column courier table. */}
      <div className={cn("grid grid-cols-1 gap-6", recap && "xl:grid-cols-2")}>
        <DashboardCard description={`${RECENT_ROWS} kiriman terakhir; yang perlu tindakan tampil lebih dulu`} id="kiriman-terbaru" title="Kiriman terbaru">
          {recentRows === null ? <RegionError title="Kiriman terbaru tidak dapat dimuat" /> : (
            <>
              {actionable.ok !== recent.ok ? <RegionError title="Sebagian kiriman terbaru tidak dapat dimuat" /> : null}
              <RecentList multipleOutlets={outlets.length > 1} role={role} rows={recentRows} />
            </>
          )}
          <div className="mt-auto border-t pt-2 text-right">
            <Link className={arrowLink} href="/app/pengiriman">Lihat semua kiriman<ArrowRight aria-hidden="true" /></Link>
          </div>
        </DashboardCard>
        {recap ? (
          <DashboardCard
            description={`Kiriman yang sudah dikirim ke Mengantar${recap.ok && recap.value.shippingCostVisible ? ", dengan biaya kirim" : ""} · ${period.periodLabel}`}
            id="rekap-kurir"
            title="Rekap per kurir"
          >
            {!recap.ok ? <RegionError title="Rekap per kurir tidak dapat dimuat" />
              : recap.value.rows.every((row) => row.shipmentCount === 0) || periodIsEmpty ? (
                <EmptyState action={clearFilter} icon={PackageSearch} title="Tidak ada kiriman pada periode ini" />
              ) : <CourierRecapTable recap={recap.value} />}
          </DashboardCard>
        ) : null}
      </div>
    </>
  );
}
