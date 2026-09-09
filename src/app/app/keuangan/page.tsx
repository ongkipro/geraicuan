import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { CircleAlert, Clock3 } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { reverseLedgerEntry, runLedgerReconciliation } from "@/app/app/keuangan/actions";
import { ReconciliationActionPanel, ReversalActionPanel } from "@/app/app/keuangan/components/finance-action-panels";
import { FinanceFilters } from "@/app/app/keuangan/components/finance-filters";
import { QueryFocusTarget } from "@/app/app/keuangan/components/query-focus-target";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { listLedgerEntries, listLedgerReconciliations, listLatestReconciliationVariances, summarizeLedger, type LedgerReconciliationRow, type LedgerWorkspaceEntry } from "@/db/ledger-repository";
import { withTenantContext } from "@/db/tenant-context";
import { listTenantOutlets } from "@/db/tenant-repository";
import { ANALYTICS_PRESETS, ANALYTICS_TIMEZONES, analyticsIssueMessage, formatInZone, formatRangeLabel, parseAnalyticsRange, parsePageNumber, serializeAnalyticsRange, type AnalyticsRange } from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

const PAGE_SIZE = 50;
const sectionClass = "grid min-w-0 gap-4 border-t pt-6";
const emptyClass = "rounded-xl border border-dashed bg-muted/20 p-5 text-sm [&>h3]:font-medium [&>p]:mt-1 [&>p]:leading-6 [&>p]:text-muted-foreground";
const countFormatter = new Intl.NumberFormat("id-ID");
const idrFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const signedIdrFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0, signDisplay: "always" });

const entryTypeLabel: Record<LedgerWorkspaceEntry["entryType"], string> = {
  COD_PRINCIPAL_COLLECTABLE: "Pokok COD tertagih", MENGANTAR_SHIPPING_COST: "Biaya kirim Mengantar", MENGANTAR_INSURANCE_COST: "Biaya asuransi Mengantar", GERAICUAN_COD_SERVICE_FEE_REVENUE: "Pendapatan jasa COD", COD_SERVICE_FEE_VAT_PAYABLE: "PPN jasa COD terutang", NON_COD_UPSTREAM_PAYMENT: "Pembayaran pemulihan non-COD", COD_REMITTANCE: "Setoran COD", ADJUSTMENT: "Penyesuaian pembalik", RECONCILIATION: "Memo rekonsiliasi",
};
const financialClassLabel: Record<LedgerWorkspaceEntry["financialClass"], string> = { LIABILITY: "Liabilitas", EXPENSE: "Beban", REVENUE: "Pendapatan", MEMO: "Memo" };
const reconciliationStatus: Record<LedgerReconciliationRow["status"], { label: string; variant: "destructive" | "secondary" }> = { MATCHED: { label: "Cocok", variant: "secondary" }, VARIANCE: { label: "Ada selisih", variant: "destructive" } };

type FinancePageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const firstValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

function workspaceHref(range: AnalyticsRange, outletId: string | undefined, status: string | undefined, page?: number) {
  const params = serializeAnalyticsRange(range);
  if (outletId) params.set("outlet", outletId);
  if (status) params.set("status", status);
  if (page && page > 1) params.set("halaman", String(page));
  return `/app/keuangan?${params.toString()}`;
}

function reconciliationPeriodLabel(row: LedgerReconciliationRow, timezone: string) {
  return `${formatInZone(row.periodStart, timezone)} – ${formatInZone(new Date(row.periodEnd.getTime() - 1), timezone)}`;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  let principal;
  try { principal = await requireCmsScope("tenant"); }
  catch (error) { if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant"); throw error; }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  if (principal.role !== "TENANT_ADMIN") redirect("/app");

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/keuangan")
    : null;
  if (auditScenario === "finance-error") {
    throw new Error("Intentional development-only finance route failure.");
  }
  if (auditScenario === "finance-stream") {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }

  const now = new Date();
  const rawParams = await searchParams;
  const range = parseAnalyticsRange(rawParams, now);
  const parsedPage = parsePageNumber(rawParams.halaman);
  const requestedOutletId = firstValue(rawParams.outlet);
  const rawStatus = firstValue(rawParams.status);
  const invalidStatus = Boolean(rawStatus && rawStatus !== "VARIANCE");
  const varianceOnly = rawStatus === "VARIANCE";
  const requestedReconciliationId = firstValue(rawParams.rekonsiliasiId);
  const requestedOffset = (parsedPage.page - 1) * PAGE_SIZE;

  let data = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const outlets = await listTenantOutlets(tx, context);
    const outletId = outlets.some((outlet) => outlet.id === requestedOutletId) ? requestedOutletId : undefined;
    const ledgerRange = { start: range.startInclusive, end: range.endExclusive, ...(outletId ? { outletId } : {}) };
    const summary = await summarizeLedger(tx, context, ledgerRange);
    const entries = await listLedgerEntries(tx, context, ledgerRange, { limit: PAGE_SIZE, offset: requestedOffset });
    const reconciliations = invalidStatus ? [] : varianceOnly ? (await listLatestReconciliationVariances(tx, context, { limit: 100, offset: 0 })).rows : await listLedgerReconciliations(tx, context, ledgerRange);
    return { entries, outletId, outlets, reconciliations, summary };
  });
  if (auditScenario === "finance-empty") {
    data = {
      ...data,
      entries: { rows: [], totalCount: 0 },
      reconciliations: [],
      summary: {
        codPrincipalLiabilityIdr: 0,
        providerCostIdr: 0,
        revenueIdr: 0,
        upstreamRecoveryPaymentIdr: 0,
        vatPayableIdr: 0,
      },
    };
  }
  const reconciliationUnavailable = auditScenario === "finance-partial-error";
  if (reconciliationUnavailable) data = { ...data, reconciliations: [] };
  const staleData = auditScenario === "finance-stale";

  const totalPages = Math.max(1, Math.ceil(data.entries.totalCount / PAGE_SIZE));
  const page = Math.min(parsedPage.page, totalPages);
  const { periodLabel, timezoneLabel, presetLabel } = formatRangeLabel(range);
  const todayLocalDate = parseAnalyticsRange({ rentang: "hari-ini", tz: range.timezone }, now).startDate;
  const invalidOutlet = Boolean(requestedOutletId && !data.outletId);
  const issues = [...range.issues, ...parsedPage.issues];
  const pageAdjusted = parsedPage.page > totalPages;
  const isNotDefault = range.presetId !== "30-hari" || range.timezone !== "Asia/Jakarta" || Boolean(data.outletId) || Boolean(rawStatus) || issues.length > 0 || invalidOutlet;
  const selectedOutletName = data.outletId ? data.outlets.find((outlet) => outlet.id === data.outletId)?.name : undefined;
  const filterSummary = `${periodLabel} · ${timezoneLabel} · ${selectedOutletName ?? "Semua outlet"} · ${varianceOnly ? "Hanya selisih" : invalidStatus ? "Status tidak valid" : "Semua status"}`;
  const exactRow = requestedReconciliationId ? data.reconciliations.find((row) => row.id === requestedReconciliationId) : undefined;
  const focusTargetId = requestedReconciliationId ? exactRow ? `reconciliation-${exactRow.id}` : "reconciliation-history-title" : undefined;
  const actionContext = { attemptId: randomUUID(), range: { presetId: range.presetId, timezone: range.timezone, startDate: range.startDate, lastIncludedDate: range.lastIncludedDate }, ...(data.outletId ? { outletFilter: data.outletId } : {}) };

  return <PageContainer width="data">
    <PageHeader description="Putuskan dari selisih, telusuri sumber nilai, lalu simpan koreksi sebagai catatan pembalik append-only." eyebrow="Keuangan" title="Ledger & rekonsiliasi" />
    <FinanceFilters isNotDefault={isNotDefault} outletId={data.outletId} outlets={data.outlets} presets={ANALYTICS_PRESETS} range={actionContext.range} rawStatus={rawStatus} summary={filterSummary} timezones={ANALYTICS_TIMEZONES} todayLocalDate={todayLocalDate} />
    <div aria-live="polite" className="flex min-h-11 flex-wrap items-center gap-x-2 rounded-lg border bg-muted/30 px-4 py-2 text-sm leading-6 text-muted-foreground" role="status"><Clock3 aria-hidden="true" className="size-4" /><span>Data dimuat {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: range.timezone }).format(now)}. {presetLabel}; batas waktu mengikuti {timezoneLabel}.</span></div>
    {staleData ? <Alert role="alert" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Data keuangan mungkin sudah kedaluwarsa</AlertTitle><AlertDescription className="max-w-2xl space-y-3"><p>Snapshot terakhir belum diperbarui. Jangan mengambil keputusan rekonsiliasi sampai data dimuat ulang.</p><Button asChild className="min-h-11" variant="outline"><Link href={workspaceHref(range, data.outletId, rawStatus)}>Muat ulang data</Link></Button></AlertDescription></Alert> : null}

    {issues.length || invalidOutlet || invalidStatus || pageAdjusted || (requestedReconciliationId && !exactRow) ? <Alert role={invalidStatus ? "alert" : "status"} variant={invalidStatus ? "destructive" : "default"}><CircleAlert aria-hidden="true" /><AlertTitle>{invalidStatus ? "Status filter tidak dikenal" : "Permintaan disesuaikan"}</AlertTitle><AlertDescription><ul className="list-disc pl-4">
      {issues.map((issue, index) => <li key={`${issue}-${index}`}>{analyticsIssueMessage(issue)}</li>)}
      {invalidOutlet ? <li>Outlet tidak tersedia pada tenant ini; semua outlet ditampilkan.</li> : null}
      {invalidStatus ? <li>Antrean rekonsiliasi dikosongkan agar status yang tidak valid tidak memperluas data tanpa sengaja. Pilih status yang tersedia.</li> : null}
      {pageAdjusted ? <li>Halaman yang diminta melewati hasil terakhir; halaman {page} ditampilkan.</li> : null}
      {requestedReconciliationId && !exactRow ? <li>Rekonsiliasi yang dituju tidak ada dalam hasil tervalidasi; fokus dipindahkan ke antrean.</li> : null}
    </ul></AlertDescription></Alert> : null}

    <section aria-labelledby="finance-summary-title" className={sectionClass}>
      <div><h2 className="text-xl font-semibold tracking-tight" id="finance-summary-title">Ringkasan keputusan</h2><p className="mt-1 text-sm text-muted-foreground">Nilai dalam periode workspace; pokok COD tetap liabilitas, bukan pendapatan.</p></div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[["Pokok COD — liabilitas", data.summary.codPrincipalLiabilityIdr, "Bukan pendapatan GeraiCUAN."], ["Biaya provider", data.summary.providerCostIdr], ["Pendapatan jasa COD", data.summary.revenueIdr], ["PPN terutang", data.summary.vatPayableIdr], ["Pemulihan non-COD", data.summary.upstreamRecoveryPaymentIdr]].map(([label, value, note]) => <div className="rounded-xl border bg-card p-4" key={String(label)}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{idrFormatter.format(Number(value))}</dd>{note ? <small className="mt-1 block text-xs text-muted-foreground">{note}</small> : null}</div>)}
      </dl>
    </section>

    <section aria-labelledby="reconciliation-history-title" className={sectionClass}>
      {focusTargetId ? <QueryFocusTarget targetId={focusTargetId} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="scroll-mt-6 rounded-sm text-xl font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" id="reconciliation-history-title" tabIndex={-1}>{varianceOnly ? "Antrean selisih rekonsiliasi" : "Riwayat rekonsiliasi"}</h2><p className="mt-1 text-sm text-muted-foreground">{varianceOnly ? "Snapshot tenant-wide terbaru; periode dan outlet workspace tidak membatasi antrean ini." : `Snapshot untuk ${periodLabel}.`}</p></div>{varianceOnly ? <Button asChild className="min-h-11" variant="outline"><Link href={workspaceHref(range, data.outletId, undefined)}>Tampilkan semua</Link></Button> : null}</div>
      {reconciliationUnavailable ? <Alert role="alert" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Antrean rekonsiliasi tidak dapat dimuat</AlertTitle><AlertDescription>Ringkasan dan entri ledger tetap tersedia. Muat ulang halaman sebelum menindaklanjuti selisih.</AlertDescription></Alert> : data.reconciliations.length === 0 ? <div className={emptyClass} role="status"><h3>{invalidStatus ? "Status perlu diperbaiki." : varianceOnly ? "Tidak ada selisih aktif." : "Belum ada rekonsiliasi pada periode ini."}</h3><p>{invalidStatus ? "Gunakan filter status yang tersedia untuk memuat antrean." : varianceOnly ? "Semua hasil terbaru sudah cocok." : "Jalankan rekonsiliasi untuk satu outlet dan periode kalender yang tepat."}</p></div> : <Table className="min-w-[1040px]" containerClassName="rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" containerProps={{ "aria-label": "Tabel rekonsiliasi", role: "region", tabIndex: 0 }}>
        <TableCaption className="sr-only">Total sumber, ledger, dan selisih rekonsiliasi</TableCaption><TableHeader><TableRow><TableHead className="sticky left-0 z-20 bg-card">Periode</TableHead><TableHead>Outlet</TableHead><TableHead>Frekuensi</TableHead><TableHead>Jenis</TableHead><TableHead className="text-right">Total sumber</TableHead><TableHead className="text-right">Total ledger</TableHead><TableHead className="text-right">Selisih</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>{data.reconciliations.map((row) => { const status = reconciliationStatus[row.status]; return <TableRow id={`reconciliation-${row.id}`} key={row.id} tabIndex={-1}><TableCell className="sticky left-0 z-10 bg-background font-medium">{reconciliationPeriodLabel(row, range.timezone)}</TableCell><TableCell>{row.outletName}</TableCell><TableCell>{row.cadence === "DAILY" ? "Harian" : "Bulanan"}</TableCell><TableCell>{entryTypeLabel[row.reconciledEntryType]}</TableCell><TableCell className="text-right tabular-nums">{idrFormatter.format(row.sourceTotalIdr)}</TableCell><TableCell className="text-right tabular-nums">{idrFormatter.format(row.ledgerTotalIdr)}</TableCell><TableCell className="text-right font-medium tabular-nums">{signedIdrFormatter.format(row.varianceIdr)}</TableCell><TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell></TableRow>; })}</TableBody>
      </Table>}
    </section>

    <Card aria-labelledby="reconcile-title"><CardHeader><CardTitle id="reconcile-title">Jalankan rekonsiliasi</CardTitle><CardDescription>Pilih outlet dan tanggal atau bulan kalender yang tepat. Server menghitung nilai; browser hanya mengirim konteks keputusan.</CardDescription></CardHeader><CardContent>{data.outlets.length === 0 ? <div className={emptyClass} role="status"><h3>Outlet belum tersedia.</h3><p>Lengkapi outlet sebelum menjalankan rekonsiliasi.</p></div> : <ReconciliationActionPanel action={runLedgerReconciliation} context={actionContext} outlets={data.outlets} periodLabel={periodLabel} />}</CardContent></Card>

    <section aria-labelledby="ledger-entries-title" className={sectionClass}>
      <div><h2 className="text-xl font-semibold tracking-tight" id="ledger-entries-title">Entri ledger</h2><p className="max-w-2xl mt-1 text-sm text-muted-foreground">Jejak append-only untuk {periodLabel}; nilai bertanda menunjukkan arah pencatatan.</p></div>
      {data.entries.rows.length === 0 ? <div className={emptyClass} role="status"><h3>Tidak ada entri pada {periodLabel}.</h3><p>Ubah periode atau outlet untuk melihat catatan lain.</p></div> : <Table className="min-w-[1120px]" containerClassName="rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" containerProps={{ "aria-label": "Tabel entri ledger", role: "region", tabIndex: 0 }}>
        <TableCaption className="sr-only">Entri efektif pada {periodLabel} ({timezoneLabel})</TableCaption><TableHeader><TableRow><TableHead className="sticky left-0 z-20 bg-card">Efektif</TableHead><TableHead>Outlet</TableHead><TableHead>Jenis</TableHead><TableHead>Kelas</TableHead><TableHead className="text-right">Nilai</TableHead><TableHead>Sumber</TableHead><TableHead>Penyesuaian</TableHead></TableRow></TableHeader>
        <TableBody>{data.entries.rows.map((entry) => <TableRow key={entry.id}><TableCell className="sticky left-0 z-10 bg-background font-medium">{formatInZone(entry.effectiveAt, range.timezone)}</TableCell><TableCell>{entry.outletName}</TableCell><TableCell>{entryTypeLabel[entry.entryType]}</TableCell><TableCell>{financialClassLabel[entry.financialClass]}</TableCell><TableCell className="text-right font-medium tabular-nums">{signedIdrFormatter.format(entry.amountIdr)}</TableCell><TableCell>{entry.shipmentId ? <Button asChild className="min-h-11" variant="link"><Link href={`/app/pengiriman/${entry.shipmentId}`}>Kiriman {entry.shipmentId.slice(0, 8).toUpperCase()}</Link></Button> : <span>Rekonsiliasi {entry.sourceEventId.slice(0, 12)}</span>}</TableCell><TableCell>{entry.adjustmentState === "AVAILABLE" ? <ReversalActionPanel action={reverseLedgerEntry} amountLabel={signedIdrFormatter.format(entry.amountIdr)} context={{ ...actionContext, attemptId: randomUUID() }} entryId={entry.id} entryType={entryTypeLabel[entry.entryType]} /> : entry.adjustmentState === "ADJUSTED" ? <Badge variant="outline">Sudah dibalik</Badge> : <span aria-label="Tidak dapat disesuaikan">—</span>}</TableCell></TableRow>)}</TableBody>
      </Table>}
      <nav aria-label="Navigasi halaman ledger" className="flex min-h-11 flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-end [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded-lg [&_a]:border [&_a]:px-3 [&_a]:text-foreground"><span>Halaman {page} dari {totalPages} · {countFormatter.format(data.entries.totalCount)} entri</span>{page > 1 ? <Link href={workspaceHref(range, data.outletId, rawStatus, page - 1)}>Sebelumnya</Link> : <span aria-hidden="true">Sebelumnya</span>}{page < totalPages ? <Link href={workspaceHref(range, data.outletId, rawStatus, page + 1)}>Berikutnya</Link> : <span aria-hidden="true">Berikutnya</span>}</nav>
    </section>
  </PageContainer>;
}
