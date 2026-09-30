import { randomUUID } from "node:crypto";

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DateRangePicker } from "@/components/app/date-range-picker";
import { FilterBar } from "@/components/app/filter-bar";
import { SectionHelp } from "@/components/app/help-hint";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { StatStrip, type StatItem } from "@/components/app/stat-strip";
import { StatusBadge, type StatusTone } from "@/components/app/status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRangeLabel } from "@/lib/analytics-range";
import { PROVIDER_BATCH_STATUS_LABELS, providerResponseLabel } from "@/lib/labels/provider";
import { LEGACY_COD_FEE_VAT_LABEL } from "@/lib/mengantar-cod-fee";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import { buildPlatformHref } from "@/lib/platform-monitoring-filters";
import { formatCount, formatShortId } from "@/lib/platform-monitoring-format";
import { MONEY_LABELS } from "@/lib/shipment-money";

import { formatWib } from "../../_components/platform-format";
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
} from "../../_components/platform-ui";
import { loadPlatformView, type PlatformView } from "../../_components/platform-view";
import { PrefixUnlock } from "../_components/prefix-unlock";
import { TenantLifecycle } from "../_components/tenant-lifecycle";

export const metadata: Metadata = { robots: { index: false }, title: "Detail gerai" };
export const dynamic = "force-dynamic";

type Detail = NonNullable<PlatformView["detail"]>;
type Finance = NonNullable<PlatformView["finance"]>;

const DATE = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

function batchStatus(status: string): { label: string; tone: StatusTone } {
  const label = Object.hasOwn(PROVIDER_BATCH_STATUS_LABELS, status)
    ? PROVIDER_BATCH_STATUS_LABELS[status as keyof typeof PROVIDER_BATCH_STATUS_LABELS]
    : "Status lain";
  const tone: StatusTone = status === "FAILED" || status === "SUBMISSION_UNKNOWN" ? "danger" : status === "COMPLETED" ? "neutral" : "info";
  return { label, tone };
}

/** Ledger entry types as words; the stored code never reaches the page. */
const ENTRY_LABELS: Record<string, string> = {
  COD_PRINCIPAL_COLLECTABLE: "Pokok COD",
  COD_REMITTANCE: "Remitansi COD",
  COD_SERVICE_FEE_VAT_PAYABLE: `${LEGACY_COD_FEE_VAT_LABEL} · entri lama`,
  GERAICUAN_COD_SERVICE_FEE_REVENUE: "Pendapatan jasa COD (entri lama)",
  // T-269: the per-shipment words (MONEY_LABELS) for the same two quantities.
  MENGANTAR_COD_FEE_COST: MONEY_LABELS.codFee,
  MENGANTAR_INSURANCE_COST: "Asuransi Mengantar",
  MENGANTAR_SHIPPING_COST: MONEY_LABELS.shippingCost,
  NON_COD_UPSTREAM_PAYMENT: "Pembayaran non-COD",
};

function Outlets({ detail }: { detail: Detail }) {
  return (
    <PlatformCard count={detail.outlets.length} flush={detail.outlets.length > 0} id="outlet-tenant" title="Outlet">
      {detail.outlets.length ? (
        <ul className="divide-y">
          {detail.outlets.map((outlet) => {
            const ready = outlet.hasPickup && outlet.hasOrigin;
            return (
              <li className="flex flex-col gap-2 px-6 py-4 max-md:px-4 sm:flex-row sm:items-center sm:justify-between" key={outlet.id}>
                <StackCell
                  primary={<span className="font-semibold">{outlet.name}</span>}
                  secondary={`Titik pickup ${outlet.hasPickup ? "terisi" : "kosong"} · area asal ${outlet.hasOrigin ? "terisi" : "kosong"} · ${outlet.hasPrivateConnection ? "Akun Mengantar sendiri" : "Akun bawaan platform"}`}
                />
                <StatusBadge label={ready ? "Siap" : "Belum lengkap"} tone={ready ? "success" : "warning"} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">Gerai belum memiliki outlet.</p>
      )}
    </PlatformCard>
  );
}

const SUBMISSIONS_SHOWN = 8;

function Submissions({ detail }: { detail: Detail }) {
  const rows = detail.batches.slice(0, SUBMISSIONS_SHOWN);
  return (
    <PlatformCard flush={rows.length > 0} id="pengajuan-tenant" title="Pengajuan terbaru">
      {rows.length ? (
        <>
          <Table className={`${FLUSH_TABLE} ${DESKTOP_ONLY}`}>
            <TableCaption className="sr-only">Pengajuan terbaru; akun provider dianonimkan.</TableCaption>
            <TableHeader>
              <TableRow><TableHead>Pengajuan</TableHead><TableHead>Status</TableHead><TableHead>Respons</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((batch) => {
                const status = batchStatus(batch.status);
                const at = batch.completedAt ?? batch.submissionAttemptedAt;
                return (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <StackCell primary={<span className="font-mono">{formatShortId(batch.id)}</span>} secondary={`${courierDisplayName(batch.courier)} · akun #${batch.providerAccountBucket}`} />
                    </TableCell>
                    <TableCell>
                      <StackCell primary={<StatusBadge label={status.label} tone={status.tone} />} secondary={at ? formatWib(at) : undefined} />
                    </TableCell>
                    <TableCell className="min-w-40 whitespace-normal text-xs text-muted-foreground">{batch.safeErrorCode ? providerResponseLabel(batch.safeErrorCode) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className={PHONE_ONLY}>
            <RecordList label="Pengajuan ke Mengantar">
              {rows.map((batch) => {
                const status = batchStatus(batch.status);
                const at = batch.completedAt ?? batch.submissionAttemptedAt;
                return (
                  <RecordItem
                    key={batch.id}
                    meta={batch.safeErrorCode ? providerResponseLabel(batch.safeErrorCode) : undefined}
                    status={<StatusBadge label={status.label} tone={status.tone} />}
                    subtitle={`${courierDisplayName(batch.courier)} · akun #${batch.providerAccountBucket}`}
                    time={at ? formatWib(at) : undefined}
                    title={<span className="font-mono">{formatShortId(batch.id)}</span>}
                  />
                );
              })}
            </RecordList>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Belum ada pengajuan pada periode ini.</p>
      )}
    </PlatformCard>
  );
}

function FinanceSummary({ finance, timezone }: { finance: Finance; timezone: string }) {
  const ledger = [
    ["Entri", formatCount(finance.ledger.entryCount)],
    ["Pokok COD (titipan, bukan pendapatan)", <Money amount={finance.ledger.codPrincipalLiabilityIdr} key="cod" />],
    ["Biaya provider", <Money amount={finance.ledger.providerCostIdr} key="cost" />],
    ["Pemulihan non-COD", <Money amount={finance.ledger.upstreamRecoveryPaymentIdr} key="recovery" />],
    ["Pendapatan jasa COD (entri lama)", <Money amount={finance.ledger.revenueIdr} key="revenue" />],
    [LEGACY_COD_FEE_VAT_LABEL, <Money amount={finance.ledger.legacyCodFeeVatIdr} key="vat" />],
  ] as const;
  const rows = finance.reconciliations;
  const period = (start: Date, end: Date) => `${DATE.format(start)} – ${DATE.format(end)}`;
  return (
    <PlatformCard description="Hanya agregat; tanpa identitas kiriman, penerima, atau kredensial." id="keuangan-tenant" title="Keuangan & rekonsiliasi">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {ledger.map(([label, value]) => (
          <div className="flex flex-col gap-1" key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {rows.length ? (
        <>
          <Table className={`${DESKTOP_ONLY} [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0`}>
            <TableCaption className="sr-only">Hasil rekonsiliasi terbaru ({timezone})</TableCaption>
            <TableHeader>
              <TableRow><TableHead>Rekonsiliasi</TableHead><TableHead className="text-right">Sumber</TableHead><TableHead className="text-right">Tercatat</TableHead><TableHead className="text-right">Selisih</TableHead><TableHead>Hasil</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={`${row.cadence}-${row.reconciledEntryType}-${row.periodStart.toISOString()}-${index}`}>
                  <TableCell>
                    <StackCell primary={ENTRY_LABELS[row.reconciledEntryType] ?? "Entri lain"} secondary={`${row.cadence === "DAILY" ? "Harian" : "Bulanan"} · ${period(row.periodStart, row.periodEnd)}`} />
                  </TableCell>
                  <TableCell className="text-right"><Money amount={row.sourceTotalIdr} /></TableCell>
                  <TableCell className="text-right"><Money amount={row.ledgerTotalIdr} /></TableCell>
                  <TableCell className="text-right font-semibold"><Money amount={row.varianceIdr} /></TableCell>
                  <TableCell><StatusBadge label={row.status === "MATCHED" ? "Cocok" : "Ada selisih"} tone={row.status === "MATCHED" ? "success" : "warning"} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className={`${PHONE_ONLY} -mx-4 border-t`}>
            <RecordList label="Rekonsiliasi terbaru">
              {rows.map((row, index) => (
                <RecordItem
                  key={`${row.cadence}-${row.reconciledEntryType}-${row.periodStart.toISOString()}-${index}`}
                  meta={period(row.periodStart, row.periodEnd)}
                  status={<StatusBadge label={row.status === "MATCHED" ? "Cocok" : "Ada selisih"} tone={row.status === "MATCHED" ? "success" : "warning"} />}
                  title={ENTRY_LABELS[row.reconciledEntryType] ?? "Entri lain"}
                  value={<>Selisih <Money amount={row.varianceIdr} /></>}
                />
              ))}
            </RecordList>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Belum ada hasil rekonsiliasi pada periode ini.</p>
      )}
    </PlatformCard>
  );
}

function TenantAudit({ view }: { view: PlatformView }) {
  if (!view.audit) return <RegionError title="Jejak audit gerai" />;
  const rows = view.audit.rows;
  return (
    <PlatformCard
      action={(
        <>
          <ArrowLink href={buildPlatformHref("/platform/audit", { ...view.filters, page: 1 })}>Lihat semua</ArrowLink>
          <SectionHelp label="Penjelasan jejak audit gerai">
            <p>Sepuluh aktivitas terbaru gerai ini pada periode ini. Membuka pemantauan platform tidak ditampilkan di sini; semuanya ada di halaman Audit.</p>
          </SectionHelp>
        </>
      )}
      flush={rows.length > 0}
      id="audit-tenant"
      title="Jejak audit"
    >
      {rows.length ? (
        <AuditFeed label="Jejak audit gerai" now={view.now} rows={rows} showTenant={false} />
      ) : (
        <p className="text-muted-foreground">Belum ada aktivitas audit pada periode ini.</p>
      )}
    </PlatformCard>
  );
}

/**
 * T-257: the four 150 px KPI cards as one §4.6 stat strip, with the gerai's members (Pemilik gerai
 * and Operator counts, no names or emails) and outlet readiness, which the page did not show.
 */
function TenantStrip({ counts, finance }: { counts: NonNullable<PlatformView["counts"]>; finance: PlatformView["finance"] }) {
  const reconciliations = finance?.reconciliations ?? [];
  const variances = reconciliations.filter((row) => row.status === "VARIANCE").length;
  const { lifecycle, memberships, outlets } = counts;
  const items: StatItem[] = [
    { key: "shipments", label: "Kiriman dibuat", metric: "SHP-CREATED", value: formatCount(lifecycle.shipments) },
    { key: "issued", label: "Resi diterbitkan", metric: "SHP-ISSUED", value: formatCount(lifecycle.issued) },
    {
      badge: lifecycle.batchesFailed ? <StatusBadge label="Perlu dicek" tone="danger" /> : null,
      key: "failed",
      label: "Pengajuan gagal",
      metric: "PLT-TD-BATCH-FAILED",
      note: `dari ${formatCount(lifecycle.batches)} pengajuan`,
      value: formatCount(lifecycle.batchesFailed),
    },
    {
      key: "members",
      label: "Anggota aktif",
      metric: "PLT-TD-MEMBER-ACTIVE",
      note: `${formatCount(memberships.tenantAdmins)} pemilik · ${formatCount(memberships.operators)} operator`,
      value: formatCount(memberships.active),
    },
    { key: "outlets", label: "Outlet lengkap", metric: "PLT-OUTLET-CONFIGURED", note: `dari ${formatCount(outlets.total)} outlet`, value: formatCount(outlets.configured) },
    {
      badge: variances ? <StatusBadge label="Ada selisih" tone="warning" /> : null,
      key: "reconciliation",
      label: "Rekonsiliasi",
      metric: "PLT-TD-REC-VARIANCE",
      note: !finance ? "Tidak dapat dimuat" : reconciliations.length ? `dari ${formatCount(reconciliations.length)} hasil` : "Belum ada hasil",
      value: !finance || !reconciliations.length ? "—" : variances ? `${formatCount(variances)} selisih` : "Cocok",
    },
  ];
  return <StatStrip items={items} label="Ringkasan gerai" />;
}

function PrefixCard({ prefix, tenantId, tenantName }: { prefix: PlatformView["prefix"]; tenantId: string; tenantName: string }) {
  return (
    <PlatformCard id="awalan-tenant" title="Awalan nomor kiriman">
      <p>
        {prefix === null
          ? "Status awalan tidak dapat dimuat."
          : (
            <>
              Awalan <span className="font-mono font-semibold">{prefix.prefix}-</span>{" "}
              {prefix.lockedAt ? `terkunci sejak ${formatWib(prefix.lockedAt)}` : "belum terkunci; pemilik gerai masih dapat memilih."}
            </>
          )}
      </p>
      <PrefixUnlock initialAttemptId={randomUUID()} locked={Boolean(prefix?.lockedAt)} tenantId={tenantId} tenantName={tenantName} />
    </PlatformCard>
  );
}

export default async function PlatformTenantDetailPage({ params, searchParams }: PageProps<"/platform/tenant/[tenantId]">) {
  const { tenantId } = await params;
  const view = await loadPlatformView("tenant-detail", await searchParams, tenantId);
  const detail = view.detail!;
  const { tenant } = detail;
  const range = formatRangeLabel(view.filters.range);
  const counts = view.counts;
  const prefix = view.prefix;

  return (
    <>
      <PageHeader
        back={
          <Link className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline md:min-h-6" href="/platform/tenant">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Gerai
          </Link>
        }
        description={`Terdaftar sejak ${DATE.format(tenant.createdAt)}${prefix ? ` · Awalan nomor kiriman ${prefix.prefix}` : ""}`}
        eyebrow="Gerai"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {tenant.name}
            <TenantStatusBadge status={tenant.status} />
          </span>
        }
      />
      <FilterBar
        clearHref={view.filters.range.presetId !== "30-hari" ? `/platform/tenant/${tenant.id}` : undefined}
        label="Periode gerai"
        summary={`${range.periodLabel} · ${range.timezoneLabel}`}
      >
        <DateRangePicker endDate={view.filters.range.lastIncludedDate} presetId={view.filters.range.presetId} startDate={view.filters.range.startDate} />
      </FilterBar>
      <section aria-labelledby="ringkasan-gerai" className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg leading-snug font-bold" id="ringkasan-gerai">Ringkasan gerai</h2>
          <SectionHelp label="Cara membaca ringkasan gerai">
            <p>Kiriman dibuat dan resi diterbitkan mengikuti periode di atas, sama dengan Ringkasan platform. Pengajuan gagal dihitung dari semua pengajuan gerai ini ke Mengantar pada periode itu.</p>
            <p>Anggota aktif dan outlet lengkap adalah keadaan saat ini. Outlet lengkap berarti titik pickup dan area asal sudah terisi.</p>
            <p>Rekonsiliasi menunjukkan berapa hasil rekonsiliasi periode ini yang masih ada selisih.</p>
          </SectionHelp>
        </div>
        {counts ? <TenantStrip counts={counts} finance={view.finance} /> : <RegionError title="Ringkasan gerai" />}
      </section>
      {/* T-257: the two short regions share a row; Pengajuan runs full width instead of beside a one-outlet card. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>section>[data-slot=card]]:h-full">
        <Outlets detail={detail} />
        <PrefixCard prefix={prefix} tenantId={tenant.id} tenantName={tenant.name} />
      </div>
      <Submissions detail={detail} />
      {view.finance ? <FinanceSummary finance={view.finance} timezone={range.timezoneLabel} /> : <RegionError title="Keuangan & rekonsiliasi" />}
      <TenantAudit view={view} />
      <TenantLifecycle initialAttemptId={randomUUID()} status={tenant.status} tenantId={tenant.id} tenantName={tenant.name} />
    </>
  );
}
