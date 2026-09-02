import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AlertRegion } from "@/app/_components/alert-region";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  ProvisionTenantForm,
  TenantLifecycleControls,
} from "@/app/platform/_components/tenant-lifecycle-controls";
import { resolvePlatformAccess } from "@/app/platform/platform-access";
import { db } from "@/db/client";
import { recordPlatformMonitoringAccess, withPlatformContext } from "@/db/platform-context";
import {
  listAuditEvents,
  listTenantUsage,
  readFilterOptions,
  readPlatformClock,
  readPlatformCounts,
  readPlatformHealth,
  readPreviousPeriodHeadline,
  readTenantDetail,
  readTrend,
  type AuditRow,
  type PlatformCounts,
  type PlatformHealth,
  type TenantUsageRow,
  type TrendBucket,
} from "@/db/platform-monitoring-repository";
import {
  readPlatformTenantFinanceSummary,
  type PlatformTenantFinanceSummary,
} from "@/db/platform-tenant-repository";
import { shipmentStatuses } from "@/db/schema";
import {
  ANALYTICS_PRESETS,
  ANALYTICS_TIMEZONES,
  formatInZone,
  formatRangeLabel,
} from "@/lib/analytics-range";
import {
  type PlatformFilters,
  type PlatformRoute,
} from "@/lib/platform-monitoring-filters";
import {
  buildPlatformHref,
  parsePlatformFilters,
  platformIssueMessage,
} from "@/lib/platform-monitoring-filters";
import { formatCount, formatDuration, formatShortId } from "@/lib/platform-monitoring-format";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

type SearchParams = Record<string, string | string[] | undefined>;
type PageKind = "overview" | "tenant-list" | "tenant-detail" | "audit";
type PageInput = { kind: PageKind; route: PlatformRoute; rawParams: SearchParams; tenantId?: string };

type Detail = NonNullable<Awaited<ReturnType<typeof readTenantDetail>>>;
type Finance = PlatformTenantFinanceSummary;

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const signedIdrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
  signDisplay: "always",
});

const statusLabels: Record<(typeof shipmentStatuses)[number], string> = {
  DRAFT: "Draf",
  ESTIMATED: "Sudah diestimasi",
  SUBMISSION_QUEUED: "Menunggu pengiriman",
  SUBMISSION_UNKNOWN: "Status tidak diketahui",
  ISSUED: "Resi terbit",
  AWAITING_UPSTREAM_PAYMENT: "Menunggu pembayaran upstream",
  FAILED: "Gagal",
};
const tenantStatusLabels: Record<string, string> = {
  ACTIVE: "Aktif",
  SUSPENDED: "Ditangguhkan",
  PROVISIONING: "Provisioning",
  ARCHIVED: "Diarsipkan",
};

const fieldClass = "grid min-w-0 gap-2 text-sm font-medium";
const controlClass = "min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";
const sectionClass = "grid min-w-0 gap-4 border-t pt-6";
const tableWrapClass = "w-full min-w-0 overflow-x-auto rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const tableClass = "w-full min-w-max caption-bottom text-sm [&_caption]:sr-only [&_thead]:border-b [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-20 [&_thead_th:first-child]:bg-card [&_tbody_tr]:border-b [&_tbody_tr:last-child]:border-0 [&_tbody_tr>*:first-child]:sticky [&_tbody_tr>*:first-child]:left-0 [&_tbody_tr>*:first-child]:z-10 [&_tbody_tr>*:first-child]:bg-background [&_th]:h-10 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_td]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2.5";
const hintClass = "text-sm leading-6 text-muted-foreground";
const metricClass = "grid gap-1 rounded-lg border bg-background p-3 [&_dt]:text-sm [&_dt]:text-muted-foreground [&_dd]:text-xl [&_dd]:font-semibold [&_dd]:tabular-nums";

function severityVariant(severity: string): "destructive" | "outline" | "secondary" {
  if (severity === "kritis") return "destructive";
  if (severity === "perhatian") return "outline";
  return "secondary";
}

function currentValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}


function FilterPanel({ filters, options, issues, route, actualRoute }: { filters:PlatformFilters;options:Awaited<ReturnType<typeof readFilterOptions>>;issues:string[];route:PlatformRoute;actualRoute:string }) {
  const nonDefault = filters.range.presetId!=="30-hari" || filters.range.timezone!=="Asia/Jakarta" || (route!=="/platform/tenant/[tenantId]" && filters.scope.kind==="tenant") || filters.outletId || filters.courier || filters.status || filters.outcome || filters.query;
  return <details className="group rounded-xl border bg-card" open={Boolean(nonDefault||issues.length)}>
    <summary className="min-h-11 cursor-pointer content-center px-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Filter &amp; periode</summary>
    <form action={actualRoute} method="get">
      <div className="grid gap-4 border-t p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className={fieldClass}>Periode<select className={controlClass} defaultValue={filters.range.presetId} name="rentang">{ANALYTICS_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className={fieldClass}>Dari<input className={controlClass} defaultValue={filters.range.startDate} name="dari" type="date" /></label>
        <label className={fieldClass}>Sampai<input className={controlClass} defaultValue={filters.range.lastIncludedDate} name="sampai" type="date" /></label>
        <label className={fieldClass}>Zona waktu<select className={controlClass} defaultValue={filters.range.timezone} name="tz">{ANALYTICS_TIMEZONES.map(z=><option key={z.id} value={z.id}>{z.label}</option>)}</select></label>
        {route!=="/platform/tenant/[tenantId]"?<label className={fieldClass}>Tenant<select className={controlClass} defaultValue={filters.scope.kind==="tenant"?filters.scope.tenantId:""} name="tenant"><option value="">Semua tenant</option>{options.tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>:null}
        <label className={fieldClass}>Outlet<select aria-describedby="outlet-hint" className={controlClass} defaultValue={filters.outletId??""} disabled={filters.scope.kind==="global"} name="outlet"><option value="">Semua outlet</option>{options.outlets.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><small className="font-normal text-muted-foreground" id="outlet-hint">Pilih tenant lalu terapkan sebelum memilih outlet.</small></label>
        <label className={fieldClass}>Kurir<select className={controlClass} defaultValue={filters.courier??""} name="kurir"><option value="">Semua kurir</option>{options.couriers.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        <label className={fieldClass}>Status<select className={controlClass} defaultValue={filters.status??""} name="status"><option value="">Semua status</option>{shipmentStatuses.map(s=><option key={s} value={s}>{statusLabels[s]} ({s})</option>)}</select></label>
        {route==="/platform/audit"?<label className={fieldClass}>Hasil<select className={controlClass} defaultValue={filters.outcome??""} name="hasil"><option value="">Semua hasil</option><option value="SUCCESS">Berhasil</option><option value="DENIED">Ditolak</option></select></label>:null}
        {route==="/platform/tenant"?<label className={fieldClass}>Cari tenant<input className={controlClass} defaultValue={filters.query??""} maxLength={80} minLength={2} name="q" type="search" /></label>:null}
      </div>
      <div className="flex flex-wrap gap-2 border-t p-4">
        <Button className="min-h-11" type="submit">Terapkan</Button>
        <Button className="min-h-11" name="khusus" type="submit" value="1" variant="outline">
          Terapkan rentang kustom
        </Button>
        <Button asChild className="min-h-11" variant="ghost">
          <Link href={`${actualRoute}?rentang=30-hari&tz=Asia%2FJakarta`} prefetch={false}>
            Hapus filter
          </Link>
        </Button>
      </div>
    </form>
  </details>;
}

function ScopeBar({filters,tenantName,generatedAt,actualRoute}:{filters:PlatformFilters;tenantName?:string;generatedAt:Date;actualRoute:string}){
  const label=formatRangeLabel(filters.range);const chips:{label:string;href:string}[]=[];
  if(filters.courier)chips.push({label:`Kurir: ${filters.courier}`,href:buildPlatformHref(actualRoute,filters,{courier:null,page:1})});
  if(filters.status)chips.push({label:`Status: ${statusLabels[filters.status]}`,href:buildPlatformHref(actualRoute,filters,{status:null,page:1})});
  if(filters.outcome)chips.push({label:`Hasil: ${filters.outcome}`,href:buildPlatformHref(actualRoute,filters,{outcome:null,page:1})});
  return <section aria-label="Lingkup data" className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/30 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 flex-col gap-1"><strong>Lingkup: {filters.scope.kind==="global"?"Global":tenantName??"Tenant"}</strong><span className="text-muted-foreground">Periode: {label.periodLabel} · {label.timezoneLabel}</span><span className="text-muted-foreground">Data per {formatInZone(generatedAt,filters.range.timezone)}</span></div>{chips.length?<div className="flex flex-wrap gap-2">{chips.map(c=><Button asChild className="min-h-11" key={c.label} size="sm" variant="outline"><Link aria-label={`Hapus filter ${c.label}`} href={c.href} prefetch={false}>{c.label} ×</Link></Button>)}</div>:null}</section>;
}

function Degraded({name}:{name:string}){return <Alert variant="destructive" role="alert"><AlertTitle>{name} tidak tersedia</AlertTitle><AlertDescription>Bagian ini gagal dimuat, tetapi data lain di halaman tetap dapat digunakan. Muat ulang untuk mencoba kembali.</AlertDescription></Alert>}
function TableRegion({caption,id,children}:{caption:string;id:string;children:ReactNode}){return <div aria-labelledby={id} className={tableWrapClass} role="region" tabIndex={0}><table className={tableClass}><caption id={id}>{caption}</caption>{children}</table></div>}

function Health({health,filters}:{health:PlatformHealth;filters:PlatformFilters}){
  const tiles=[
    {label:"Batch tertahan di antrean",tile:health.queue,detail:`Terlama ${formatDuration(health.queue.oldestMs)}`},
    {label:"Pesanan menunggu pembayaran upstream",tile:health.unpaid,detail:`${health.unpaid.recovering} pemulihan berjalan`},
    {label:"Status pengiriman tidak diketahui",tile:health.unknown,detail:`${health.unknown.batches} batch · ${health.unknown.orders} pesanan · ${health.unknown.recoveries} pemulihan`},
    {label:"Kegagalan provider",tile:health.failures,detail:`${Math.round(health.failures.share*100)}% dari batch dalam periode`},
  ];
  return <section className={sectionClass}><div><h2 className="text-xl font-semibold tracking-tight">Kesehatan provider dan antrean</h2><p className={hintClass}>Saat ini — tidak terpengaruh filter periode. Kegagalan dan durasi tetap mengikuti periode.</p></div><ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tiles.map(({label,tile,detail})=><li className="grid min-w-0 gap-2 rounded-xl border bg-card p-4" key={label}><Badge className="w-fit" variant={severityVariant(tile.severity)}>{tile.severity==="normal"?"Normal":tile.severity==="perhatian"?"Perhatian":"Kritis"}</Badge><h3 className="font-medium">{label}</h3><strong className="text-3xl tabular-nums">{formatCount(tile.count)}</strong><p className={hintClass}>{detail}</p>{filters.scope.kind==="global"?<p className={hintClass}>{formatCount(tile.affectedTenants)} tenant terdampak</p>:null}</li>)}</ul>
  <div className="grid min-w-0 gap-6 lg:grid-cols-2"><div className="grid content-start gap-3"><h3 className="font-medium">Durasi penyelesaian batch</h3><dl className="grid grid-cols-2 gap-3"><div className={metricClass}><dt>p50</dt><dd>{health.latency.p50Seconds===null?"—":formatDuration(health.latency.p50Seconds*1000)}</dd></div><div className={metricClass}><dt>p95</dt><dd>{health.latency.p95Seconds===null?"—":formatDuration(health.latency.p95Seconds*1000)}</dd></div></dl><p className={hintClass}>Dari percobaan kirim sampai batch selesai; bukan latensi HTTP provider.</p></div><div className="grid min-w-0 content-start gap-3"><h3 className="font-medium">Antrean per akun provider</h3>{health.accounts.length?<TableRegion caption="Antrean per akun provider" id="account-queue"><thead><tr><th scope="col">Akun</th><th scope="col">Kurir</th><th scope="col">Menunggu</th><th scope="col">Terlama</th></tr></thead><tbody>{health.accounts.map(a=><tr key={`${a.bucket}-${a.courier}`}><th scope="row">Akun provider #{a.bucket}</th><td>{a.courier}</td><td className="text-right tabular-nums">{formatCount(a.waiting)}</td><td>{formatDuration(a.oldestMs)}</td></tr>)}</tbody></TableRegion>:<p className={hintClass}>Tidak ada antrean provider.</p>}<p className={hintClass}>#N adalah nomor urut anonim; identitas akun provider tidak ditampilkan.</p></div></div></section>;
}

function Counts({counts,previous,filters}:{counts:PlatformCounts;previous:Awaited<ReturnType<typeof readPreviousPeriodHeadline>>|null;filters:PlatformFilters}){
  const groups=[
    ...(filters.scope.kind==="global"?[{title:"Tenant",rows:[["Aktif",counts.tenants.active],["Ditangguhkan",counts.tenants.suspended],["Provisioning",counts.tenants.provisioning],["Diarsipkan",counts.tenants.archived],["Tenant baru",counts.tenants.newInRange]] as [string,number][]}]:[]),
    {title:"Outlet",rows:[["Outlet",counts.outlets.total],["Konfigurasi lengkap",counts.outlets.configured],["Koneksi privat aktif",counts.outlets.privateConnections],["Default platform",counts.outlets.platformDefault],["Belum lengkap",counts.outlets.incomplete]] as [string,number][]},
    {title:"Keanggotaan",rows:[["Anggota aktif",counts.memberships.active],["Tenant Admin",counts.memberships.tenantAdmins],["Operator",counts.memberships.operators],["Ditangguhkan",counts.memberships.suspended]] as [string,number][]},
    {title:"Siklus kiriman",rows:[["Kiriman dibuat",counts.lifecycle.shipments],["Batch",counts.lifecycle.batches],["Batch selesai",counts.lifecycle.batchesCompleted],["Batch gagal",counts.lifecycle.batchesFailed],["Resi terbit",counts.lifecycle.issued],["Belum dibayar",counts.lifecycle.unpaid],["Status tidak diketahui",counts.lifecycle.unknown],["Pemulihan selesai",counts.lifecycle.recoveriesCompleted],["Permintaan estimasi",counts.lifecycle.estimates]] as [string,number][]},
  ];
  return <section className={sectionClass}><h2 className="text-xl font-semibold tracking-tight">Volume operasional</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{groups.map(g=><section className="grid content-start gap-3 rounded-xl border bg-card p-4" key={g.title}><h3 className="font-medium">{g.title}</h3><dl className="grid gap-2">{g.rows.map(([label,value])=><div className="flex min-h-11 items-center justify-between gap-4 border-t py-2 first:border-0" key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-right font-semibold tabular-nums">{formatCount(value)}{previous&&label==="Kiriman dibuat"?<small className="block text-xs font-normal text-muted-foreground">{value-previous.created>=0?"+":""}{formatCount(value-previous.created)} vs periode sebelumnya</small>:null}</dd></div>)}</dl></section>)}</div></section>;
}

function Trend({rows,filters}:{rows:TrendBucket[];filters:PlatformFilters}){const label=formatRangeLabel(filters.range);return <section className={sectionClass}><h2 className="text-xl font-semibold tracking-tight">Tren {filters.range.granularity}</h2><TableRegion caption={`Tren ${filters.range.granularity} · ${label.periodLabel} · ${label.timezoneLabel}`} id="trend-caption"><thead><tr><th scope="col">{filters.range.granularity==="harian"?"Tanggal":"Bulan"}</th><th scope="col">Kiriman dibuat</th><th scope="col">Resi terbit</th><th scope="col">Gagal</th><th scope="col">Belum dibayar</th></tr></thead><tbody>{rows.map(r=><tr key={r.key}><th scope="row">{r.label}</th><td className="text-right tabular-nums">{formatCount(r.created)}</td><td className="text-right tabular-nums">{formatCount(r.issued)}</td><td className="text-right tabular-nums">{formatCount(r.failed)}</td><td className="text-right tabular-nums">{formatCount(r.unpaid)}</td></tr>)}</tbody></TableRegion></section>}

function Usage({data,filters,overview}:{data:{rows:TenantUsageRow[];total:number};filters:PlatformFilters;overview:boolean}){const label=formatRangeLabel(filters.range);const filtered=Boolean(filters.query||filters.status||filters.courier||filters.outletId||filters.scope.kind==="tenant");return <section className={sectionClass}><div><h2 className="text-xl font-semibold tracking-tight">Penggunaan per tenant</h2><p className={hintClass}>Urutan memprioritaskan tenant dengan kegagalan atau status tidak diketahui.</p></div>{data.rows.length?<TableRegion caption={`Penggunaan tenant · ${label.periodLabel} · ${label.timezoneLabel}`} id="tenant-caption"><thead><tr><th scope="col">Tenant</th><th scope="col">Status</th><th scope="col">Outlet</th><th scope="col">Anggota</th><th scope="col">Kiriman</th><th scope="col">Batch</th><th scope="col">Resi</th><th scope="col">Belum dibayar</th><th scope="col">Gagal</th><th scope="col">Tidak diketahui</th><th scope="col">Aktivitas terakhir</th></tr></thead><tbody>{data.rows.map(r=><tr key={r.tenantId}><th scope="row"><Link className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline" href={`/platform/tenant/${r.tenantId}?rentang=${filters.range.presetId}&tz=${encodeURIComponent(filters.range.timezone)}`} prefetch={false}>{r.name}</Link></th><td><Badge variant="outline">{tenantStatusLabels[r.status]}</Badge></td><td className="text-right tabular-nums">{r.outletConfigured}/{r.outletTotal}</td><td className="text-right tabular-nums">{formatCount(r.members)}</td><td className="text-right tabular-nums">{formatCount(r.shipments)}</td><td className="text-right tabular-nums">{formatCount(r.batches)}</td><td className="text-right tabular-nums">{formatCount(r.issued)}</td><td className="text-right tabular-nums">{formatCount(r.unpaid)}</td><td className="text-right tabular-nums">{formatCount(r.failed)}</td><td className="text-right tabular-nums">{formatCount(r.unknown)}</td><td>{r.lastActivityAt?formatInZone(r.lastActivityAt,filters.range.timezone):"—"}</td></tr>)}</tbody></TableRegion>:<div className="rounded-xl border border-dashed p-6"><h3 className="font-medium">{filtered?"Tidak ada hasil filter":"Belum ada tenant"}</h3><p className={hintClass}>{filtered?"Ubah atau hapus filter untuk menampilkan tenant lain.":"Provision tenant pertama untuk memulai konfigurasi platform."}</p></div>}{overview?<Button asChild className="w-fit min-h-11" variant="outline"><Link href={buildPlatformHref("/platform/tenant",filters,{page:1,query:null})} prefetch={false}>Lihat semua tenant</Link></Button>:<Pager route="/platform/tenant" filters={filters} total={data.total}/>}</section>}

function Audit({data,filters,overview,route}:{data:{rows:AuditRow[];total:number};filters:PlatformFilters;overview:boolean;route:string}){const label=formatRangeLabel(filters.range);return <section className={sectionClass}><div><h2 className="text-xl font-semibold tracking-tight">Jejak audit</h2><p className={hintClass}>Append-only · detail dibatasi pada konteks operasional yang aman tanpa kredensial atau PII.</p></div>{data.rows.length?<TableRegion caption={`Jejak audit · ${label.periodLabel} · ${label.timezoneLabel}`} id="audit-caption"><thead><tr><th scope="col">Waktu</th><th scope="col">Aksi</th><th scope="col">Hasil</th><th scope="col">Tenant</th><th scope="col">Detail aman</th></tr></thead><tbody>{data.rows.map(r=><tr key={r.id}><td>{formatInZone(r.createdAt,filters.range.timezone)}</td><th scope="row">{r.action}</th><td><Badge variant={r.outcome==="SUCCESS"?"secondary":"destructive"}>{r.outcome==="SUCCESS"?"Berhasil":"Ditolak"}</Badge></td><td>{r.tenantName??"Platform"}</td><td><details><summary className="min-h-11 cursor-pointer content-center font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Lihat detail</summary><dl className="grid min-w-48 gap-2 pb-3 text-sm"><div><dt className="text-muted-foreground">Peran aktor</dt><dd>{r.actorRole??"Tidak tersedia"}</dd></div><div><dt className="text-muted-foreground">Perubahan status</dt><dd>{r.fromStatus||r.toStatus?`${r.fromStatus??"—"} → ${r.toStatus??"—"}`:"Tidak ada"}</dd></div></dl></details></td></tr>)}</tbody></TableRegion>:<div className="rounded-xl border border-dashed p-6"><h3 className="font-medium">Belum ada aktivitas audit</h3><p className={hintClass}>Tidak ada event yang cocok dengan periode dan hasil terpilih.</p></div>}{overview?<Button asChild className="w-fit min-h-11" variant="outline"><Link href={buildPlatformHref("/platform/audit",filters,{page:1,outcome:null,query:null})} prefetch={false}>Lihat semua aktivitas audit</Link></Button>:<Pager route={route} filters={filters} total={data.total}/>}</section>}
function Pager({route,filters,total}:{route:string;filters:PlatformFilters;total:number}){const pages=Math.max(1,Math.ceil(total/25));const page=Math.min(filters.page,pages);return <nav aria-label="Halaman" className="flex min-h-11 flex-wrap items-center justify-end gap-2 text-sm text-muted-foreground"><span className="mr-auto">Halaman {page} dari {pages}</span>{page>1?<Button asChild className="min-h-11" variant="outline"><Link href={buildPlatformHref(route,filters,{page:page-1})} prefetch={false}>Sebelumnya</Link></Button>:<Button className="min-h-11" disabled variant="outline">Sebelumnya</Button>}{page<pages?<Button asChild className="min-h-11" variant="outline"><Link href={buildPlatformHref(route,filters,{page:page+1})} prefetch={false}>Berikutnya</Link></Button>:<Button className="min-h-11" disabled variant="outline">Berikutnya</Button>}</nav>}

function TenantDetail({detail,filters}:{detail:Detail;filters:PlatformFilters}){return <><section className={sectionClass}><div><h2 className="text-xl font-semibold tracking-tight">Konfigurasi outlet</h2><p className={hintClass}>{detail.outlets.length} outlet · status koneksi ditampilkan tanpa nilai kredensial.</p></div>{detail.outlets.length?<TableRegion caption="Konfigurasi outlet tanpa nilai kredensial" id="outlet-caption"><thead><tr><th scope="col">Outlet</th><th scope="col">Alamat pickup</th><th scope="col">Area asal</th><th scope="col">Sumber kredensial</th><th scope="col">Diperbarui</th></tr></thead><tbody>{detail.outlets.map(o=><tr key={o.id}><th scope="row">{o.name}</th><td>{o.hasPickup?"Terisi":"Kosong"}</td><td>{o.hasOrigin?"Terisi":"Kosong"}</td><td>{o.hasPrivateConnection?"Privat aktif":"Default platform"}</td><td>{formatInZone(o.updatedAt,filters.range.timezone)}</td></tr>)}</tbody></TableRegion>:<div className="rounded-xl border border-dashed p-6"><h3 className="font-medium">Belum ada outlet</h3><p className={hintClass}>Tenant belum memiliki outlet untuk dikonfigurasi atau dipantau.</p></div>}</section><section className={sectionClass}><h2 className="text-xl font-semibold tracking-tight">Batch provider terbaru</h2>{detail.batches.length?<TableRegion caption="Batch provider terbaru; identitas akun dianonimkan" id="batch-caption"><thead><tr><th scope="col">Batch</th><th scope="col">Kurir</th><th scope="col">Sumber</th><th scope="col">Status</th><th scope="col">Kode aman</th><th scope="col">Akun</th><th scope="col">Dicoba</th><th scope="col">Selesai</th></tr></thead><tbody>{detail.batches.map(b=><tr key={b.id}><th scope="row">{formatShortId(b.id)}</th><td>{b.courier}</td><td>{b.credentialSource==="private"?"Privat aktif":"Default platform"}</td><td>{b.status}</td><td>{b.safeErrorCode??"—"}</td><td>Akun provider #{b.providerAccountBucket}</td><td>{b.submissionAttemptedAt?formatInZone(b.submissionAttemptedAt,filters.range.timezone):"—"}</td><td>{b.completedAt?formatInZone(b.completedAt,filters.range.timezone):"—"}</td></tr>)}</tbody></TableRegion>:<div className="rounded-xl border border-dashed p-6"><h3 className="font-medium">Belum ada batch</h3><p className={hintClass}>Tidak ada batch provider pada periode dan outlet terpilih.</p></div>}</section></>}

function FinanceSummary({ finance, filters }: { finance: Finance; filters: PlatformFilters }) {
  const label = formatRangeLabel(filters.range);
  const entryLabels: Record<string, string> = {
    COD_PRINCIPAL_COLLECTABLE: "Pokok COD",
    MENGANTAR_SHIPPING_COST: "Ongkir Mengantar",
    MENGANTAR_INSURANCE_COST: "Asuransi Mengantar",
    GERAICUAN_COD_SERVICE_FEE_REVENUE: "Pendapatan jasa COD",
    COD_SERVICE_FEE_VAT_PAYABLE: "PPN jasa COD",
    NON_COD_UPSTREAM_PAYMENT: "Pembayaran non-COD",
    COD_REMITTANCE: "Remitansi COD",
  };
  return <section className={sectionClass} aria-labelledby="finance-summary-title">
    <div><h2 className="text-xl font-semibold tracking-tight" id="finance-summary-title">Ledger dan rekonsiliasi</h2>
    <p className={hintClass}>Ringkasan agregat terotorisasi · {label.periodLabel} · {label.timezoneLabel}. Tidak memuat identitas kiriman, pihak penerima, atau kredensial.</p></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="grid content-start gap-3 rounded-xl border bg-card p-4"><h3 className="font-medium">Ledger operasional</h3><dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className={metricClass}><dt>Entri</dt><dd>{formatCount(finance.ledger.entryCount)}</dd></div>
        <div className={metricClass}><dt>Pokok COD — liabilitas</dt><dd>{idrFormatter.format(finance.ledger.codPrincipalLiabilityIdr)}<small className="block text-xs font-normal text-muted-foreground">Bukan pendapatan GeraiCUAN.</small></dd></div>
        <div className={metricClass}><dt>Biaya provider</dt><dd>{idrFormatter.format(finance.ledger.providerCostIdr)}</dd></div>
        <div className={metricClass}><dt>Pendapatan jasa COD</dt><dd>{idrFormatter.format(finance.ledger.revenueIdr)}</dd></div>
        <div className={metricClass}><dt>PPN terutang</dt><dd>{idrFormatter.format(finance.ledger.vatPayableIdr)}</dd></div>
        <div className={metricClass}><dt>Pemulihan non-COD</dt><dd>{idrFormatter.format(finance.ledger.upstreamRecoveryPaymentIdr)}</dd></div>
      </dl></section>
      <section className="grid content-start gap-3 rounded-xl border bg-card p-4"><h3 className="font-medium">Hasil rekonsiliasi terbaru</h3><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className={metricClass}><dt>Cocok</dt><dd>{formatCount(finance.reconciliations.filter(row=>row.status==="MATCHED").length)}</dd></div>
        <div className={metricClass}><dt>Variansi</dt><dd>{formatCount(finance.reconciliations.filter(row=>row.status==="VARIANCE").length)}</dd></div>
      </dl></section>
    </div>
    {finance.reconciliations.length ? <TableRegion caption={`Rekonsiliasi terbaru · ${label.periodLabel} · ${label.timezoneLabel}`} id="reconciliation-caption"><thead><tr><th scope="col">Periode</th><th scope="col">Klasifikasi</th><th scope="col">Irama</th><th scope="col">Sumber</th><th scope="col">Ledger</th><th scope="col">Variansi</th><th scope="col">Hasil</th></tr></thead><tbody>{finance.reconciliations.map((row,index)=><tr key={`${row.cadence}-${row.reconciledEntryType}-${row.periodStart.toISOString()}-${index}`}><td>{formatInZone(row.periodStart,filters.range.timezone)} – {formatInZone(row.periodEnd,filters.range.timezone)}</td><th scope="row">{entryLabels[row.reconciledEntryType]??row.reconciledEntryType}</th><td>{row.cadence==="DAILY"?"Harian":"Bulanan"}</td><td className="text-right tabular-nums">{idrFormatter.format(row.sourceTotalIdr)}</td><td className="text-right tabular-nums">{idrFormatter.format(row.ledgerTotalIdr)}</td><td className="text-right tabular-nums">{signedIdrFormatter.format(row.varianceIdr)}</td><td><Badge variant={row.status==="MATCHED"?"secondary":"destructive"}>{row.status==="MATCHED"?"Cocok":"Variansi"}</Badge></td></tr>)}</tbody></TableRegion> : <p className={hintClass}>Belum ada hasil rekonsiliasi pada periode dan outlet terpilih.</p>}
  </section>;
}


export async function MonitoringView({kind,route,rawParams,tenantId}:PageInput){
  const access=await resolvePlatformAccess();
  if(access.status==="anonymous")redirect("/login/super-admin");
  if(access.status==="forbidden")redirect("/login/super-admin");
  const principal=access.principal;
  const auditScenario=process.env.NODE_ENV==="development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER),route)
    : null;
  if(auditScenario==="platform-overview-error"||auditScenario==="platform-tenant-error"||auditScenario==="platform-tenant-detail-error"||auditScenario==="platform-audit-error")throw new Error("Intentional development-only platform route failure.");
  if(auditScenario?.endsWith("-stream"))await new Promise(resolve=>setTimeout(resolve,1_200));
  const data=await withPlatformContext(db,principal.userId,async tx=>{
    const now=await readPlatformClock(tx);
    const globalOptions=await readFilterOptions(tx,{kind:"global"});
    const rawTenant=tenantId??currentValue(rawParams.tenant);
    const knownTenant=rawTenant&&globalOptions.tenants.some(t=>t.id===rawTenant)?rawTenant:undefined;
    const options=knownTenant?await readFilterOptions(tx,{kind:"tenant",tenantId:knownTenant}):globalOptions;
    const parsed=parsePlatformFilters(rawParams,{route,now,knownTenantIds:globalOptions.tenants.map(t=>t.id),knownOutletIds:options.outlets.map(o=>o.id),knownCouriers:options.couriers,forcedTenantId:tenantId});
    const limit=kind==="overview"?10:25;
    const results=await Promise.allSettled([readPlatformHealth(tx,parsed.filters,now),readPlatformCounts(tx,parsed.filters),readPreviousPeriodHeadline(tx,parsed.filters),readTrend(tx,parsed.filters),listTenantUsage(tx,parsed.filters,limit),listAuditEvents(tx,parsed.filters,limit),kind==="tenant-detail"?readTenantDetail(tx,parsed.filters):Promise.resolve(null),kind==="tenant-detail"?readPlatformTenantFinanceSummary(tx,parsed.filters):Promise.resolve(null)] as const);
    return {now,options,parsed,results};
  });
  const [healthResult,countsResult,previousResult,trendResult,usageResult,auditResult,detailResult,financeResult]=data.results;
  let detail=fulfilled(detailResult);
  if(auditScenario==="platform-tenant-detail-not-found")notFound();
  if(kind==="tenant-detail"&&!detail)notFound();
  if(detail&&auditScenario==="platform-tenant-detail-zero-outlets")detail={...detail,outlets:[]};
  if(detail&&auditScenario==="platform-tenant-detail-one-outlet")detail={...detail,outlets:detail.outlets.slice(0,1)};
  if(detail&&auditScenario==="platform-tenant-detail-many-outlets"&&detail.outlets.length){
    const source=detail.outlets[0];
    detail={...detail,outlets:Array.from({length:12},(_,index)=>({...source,id:`${source.id}-${index}`,name:`${source.name} ${String(index+1).padStart(2,"0")}`}))};
  }
  const finance=fulfilled(financeResult);
  let health=fulfilled(healthResult);
  let counts=fulfilled(countsResult);
  let trend=fulfilled(trendResult);
  let usage=fulfilled(usageResult);
  let audit=fulfilled(auditResult);
  if(auditScenario==="platform-overview-empty"){
    if(health){
      const zeroTile={affectedTenants:0,count:0,oldestMs:null,severity:"normal" as const};
      health={...health,accounts:[],queue:zeroTile,unpaid:{...zeroTile,recovering:0},unknown:{...zeroTile,batches:0,orders:0,recoveries:0},failures:{...zeroTile,codes:[],share:0},latency:{...health.latency,p50Seconds:null,p95Seconds:null}};
    }
    if(counts)counts={...counts,tenants:{active:0,archived:0,newInRange:0,provisioning:0,suspended:0},outlets:{configured:0,incomplete:0,platformDefault:0,privateConnections:0,total:0},memberships:{active:0,operators:0,suspended:0,tenantAdmins:0},lifecycle:{...counts.lifecycle,batches:0,batchesCompleted:0,batchesFailed:0,estimates:0,issued:0,recoveriesCompleted:0,shipments:0,unknown:0,unpaid:0}};
    trend=[];usage={rows:[],total:0};audit={rows:[],total:0};
  }
  if(auditScenario==="platform-tenant-empty")usage={rows:[],total:0};
  if(auditScenario==="platform-tenant-paginated"&&usage)usage={...usage,total:Math.max(60,usage.total)};
  if(auditScenario==="platform-audit-empty")audit={rows:[],total:0};
  if(auditScenario==="platform-audit-paginated"&&audit)audit={...audit,total:Math.max(60,audit.total)};
  const filters=data.parsed.filters;const actualRoute=tenantId?`/platform/tenant/${tenantId}`:route;
  await recordPlatformMonitoringAccess(db,principal.userId,{route,scope:detail?"tenant":filters.scope.kind,tenantId:detail?detail.tenant.id:filters.scope.kind==="tenant"?filters.scope.tenantId:undefined});
  const canonical=`${actualRoute}?${data.parsed.canonicalQuery.toString()}`;
  const titles:Record<PageKind,{eyebrow:string;title:string;intro:string}>={overview:{eyebrow:"OPERASI PLATFORM",title:"Ringkasan operasional",intro:"Pantau antrean, kegagalan, volume, dan aktivitas lintas tenant."},"tenant-list":{eyebrow:"TENANT",title:"Daftar tenant",intro:"Temukan tenant dan bandingkan penggunaan operasional."},"tenant-detail":{eyebrow:"DETAIL TENANT",title:detail?.tenant.name??"Detail tenant",intro:"Kondisi operasional dan konfigurasi aman tenant."},audit:{eyebrow:"AUDIT",title:"Jejak audit",intro:"Tinjau tindakan platform dan hasil yang ditolak."}};
  const title=titles[kind];
  const stale=auditScenario?.endsWith("-stale");
  const presentedAt=stale?new Date(data.now.getTime()-10*60_000):data.now;
  const scenarioInvalid=auditScenario?.endsWith("-invalid-query");
  const provisionState=auditScenario==="platform-tenant-provision-success"?{outcome:"success" as const,message:"Tenant audit berhasil diprovisikan."}:auditScenario==="platform-tenant-provision-error"?{outcome:"error" as const,message:"Provisioning tenant gagal. Nilai aman dipertahankan.",values:{name:"Tenant audit"}}:undefined;
  const lifecycleState=auditScenario==="platform-tenant-detail-lifecycle-success"?{outcome:"success" as const,message:"Status tenant berhasil diperbarui."}:auditScenario==="platform-tenant-detail-lifecycle-error"?{outcome:"error" as const,message:"Perubahan status gagal. Nilai aman dipertahankan.",values:{expectedName:detail?.tenant.name}}:undefined;
  return <PageContainer width="wide"><PageHeader description={title.intro} eyebrow={title.eyebrow} title={title.title}/>{data.parsed.issues.length||scenarioInvalid?<AlertRegion className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><h2 className="font-medium">Filter disesuaikan</h2><ul className="mt-2 list-disc pl-5 text-muted-foreground">{data.parsed.issues.map((issue,index)=><li key={`${issue}-${index}`}>{platformIssueMessage(issue)}</li>)}{scenarioInvalid?<li>Parameter URL tidak dikenal; filter aman tetap digunakan.</li>:null}</ul><Button asChild className="mt-3 min-h-11" variant="outline"><Link href={canonical} prefetch={false}>Buka URL yang sudah dirapikan</Link></Button></AlertRegion>:null}<ScopeBar actualRoute={actualRoute} filters={filters} generatedAt={presentedAt} tenantName={detail?.tenant.name}/>
  {stale?<Alert role="alert" variant="destructive"><AlertTitle>Data platform mungkin sudah kedaluwarsa</AlertTitle><AlertDescription className="space-y-3"><p>Snapshot terakhir melewati batas kesegaran. Muat ulang sebelum mengambil keputusan siklus tenant.</p><Button asChild className="min-h-11" variant="outline"><Link href={canonical} prefetch={false}>Muat ulang data</Link></Button></AlertDescription></Alert>:null}
  {kind==="tenant-list"?<ProvisionTenantForm auditState={provisionState} initialAttemptId={randomUUID()}/>:null}
  {kind==="tenant-detail"&&detail?<TenantLifecycleControls auditState={lifecycleState} initialAttemptId={randomUUID()} status={detail.tenant.status} tenantId={detail.tenant.id} tenantName={detail.tenant.name}/>:null}
  <FilterPanel actualRoute={actualRoute} filters={filters} issues={data.parsed.issues} options={data.options} route={route}/>
  {kind==="overview"||kind==="tenant-detail"?(health?<Health filters={filters} health={health}/>:<Degraded name="Kesehatan provider dan antrean"/>):null}
  {kind==="overview"||kind==="tenant-detail"?(counts?<Counts counts={counts} filters={filters} previous={fulfilled(previousResult)}/>:<Degraded name="Volume operasional"/>):null}
  {kind==="tenant-detail"&&detail?<TenantDetail detail={detail} filters={filters}/>:null}
  {kind==="overview"||kind==="tenant-detail"?(trend?<Trend filters={filters} rows={trend}/>:<Degraded name="Tren"/>):null}
  {kind==="tenant-detail"?(finance?<FinanceSummary finance={finance} filters={filters}/>:<Degraded name="Ledger dan rekonsiliasi"/>):null}
  {kind==="overview"||kind==="tenant-list"?(usage?<Usage data={usage} filters={filters} overview={kind==="overview"}/>:<Degraded name="Penggunaan per tenant"/>):null}
  {kind==="overview"||kind==="audit"||kind==="tenant-detail"?(audit?<Audit data={audit} filters={filters} overview={kind==="overview"} route={actualRoute}/>:<Degraded name="Jejak audit"/>):null}</PageContainer>;
}
