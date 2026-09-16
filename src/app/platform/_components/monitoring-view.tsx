import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  Building2,
  ChevronDown,
  SlidersHorizontal,
  CircleQuestionMark,
  Hourglass,
  Landmark,
  Package,
  ReceiptText,
  Scale,
  Store,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { AlertRegion } from "@/app/_components/alert-region";
import { DataTablePagination } from "@/components/cms/data-table-pagination";
import { ToneBadge, type StatusTone } from "@/components/cms/shipment-status-badge";
import { DataTableToolbar, type DataTableFacet } from "@/components/cms/data-table-toolbar";
import { ShipmentPrefixUnlockControl } from "@/app/platform/_components/shipment-prefix-unlock";
import { loadPlatformTenantShipmentPrefix } from "@/db/shipment-number-repository";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { StatCard } from "@/components/cms/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  ProvisionTenantForm,
  TenantLifecycleControls,
} from "@/app/platform/_components/tenant-lifecycle-controls";
import { PlatformPeriodSelect } from "@/app/platform/_components/platform-period-select";
import { PlatformTrendChart } from "@/app/platform/_components/platform-trend-chart";
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
import { SHIPMENT_STATUS_PRESENTATION } from "@/lib/shipment-queue";
import {
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
import { DATA_STALE_AFTER_MS } from "@/lib/data-freshness";
import { formatCount, formatDuration, formatShortId } from "@/lib/platform-monitoring-format";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

type SearchParams = Record<string, string | string[] | undefined>;
type PageKind = "overview" | "tenant-list" | "tenant-detail" | "audit";
type PageInput = { kind: PageKind; route: PlatformRoute; rawParams: SearchParams; tenantId?: string };

type Detail = NonNullable<Awaited<ReturnType<typeof readTenantDetail>>>;
type Finance = PlatformTenantFinanceSummary;
type FilterOptions = Awaited<ReturnType<typeof readFilterOptions>>;

const PAGE_SIZE = 25;

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

// One vocabulary for one lifecycle. A super admin filtering on a status must
// read the same words the tenant sees on the shipment itself; this used to be a
// second map, so the same stored value read "Antre retur" in one scope and
// "RTS (Antrean)" in the other.
const statusLabels: Record<(typeof shipmentStatuses)[number], string> =
  Object.fromEntries(
    shipmentStatuses.map((status) => [status, SHIPMENT_STATUS_PRESENTATION[status].label]),
  ) as Record<(typeof shipmentStatuses)[number], string>;
const tenantStatusLabels: Record<string, string> = {
  ACTIVE: "Aktif",
  SUSPENDED: "Ditangguhkan",
  PROVISIONING: "Provisioning",
  ARCHIVED: "Diarsipkan",
};

const fieldClass = "grid min-w-0 gap-1.5 text-xs font-medium";
const controlClass = "h-11 md:h-8 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
// Capped like every other description in the CMS: uncapped, these run to 102ch
// on the wide platform container.
const hintClass = "max-w-2xl text-sm leading-6 text-muted-foreground";
const numericClass = "text-right tabular-nums";
const emptyClass = "rounded-md border border-dashed p-6";
const secondaryLinkClass = "min-h-11 md:min-h-8";

// T-155: "Perhatian" now carries the amber tone the palette always had; red stays
// reserved for "Kritis", per spec 10's status vocabulary.
function severityTone(severity: string): StatusTone {
  if (severity === "kritis") return "danger";
  if (severity === "perhatian") return "warn";
  if (severity === "nonaktif") return "neutral";
  return "ok";
}
function severityLabel(severity: string) {
  return severity === "normal" ? "Normal" : severity === "perhatian" ? "Perhatian" : "Kritis";
}

function currentValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}


/**
 * Filters the table toolbar owns on each route. On those routes the toolbar
 * facets are the only control for that URL parameter: the GET form drops
 * its select and carries the current value as a hidden input, so applying a
 * period never disagrees with, or silently clears, a facet.
 */
// `hasil` is accepted only on /platform/audit, where the Hasil facet owns it.
type FacetOwned={tenant:boolean;status:boolean;courier:boolean;outcome:boolean};
function facetOwnership(route:PlatformRoute):FacetOwned{
  if(route==="/platform/tenant")return {tenant:true,status:true,courier:true,outcome:false};
  if(route==="/platform/audit")return {tenant:true,status:false,courier:false,outcome:true};
  return {tenant:false,status:false,courier:false,outcome:false};
}
const facetOwnerLabel:Record<PlatformRoute,string>={"/platform":"","/platform/tenant":"Tenant, status, dan kurir","/platform/tenant/[tenantId]":"","/platform/audit":"Tenant dan hasil"};

function FilterPanel({ filters, options, issues, route, actualRoute }: { filters:PlatformFilters;options:FilterOptions;issues:string[];route:PlatformRoute;actualRoute:string }) {
  const owned=facetOwnership(route);
  const tenantField=route!=="/platform/tenant/[tenantId]";
  const tenantValue=filters.scope.kind==="tenant"?filters.scope.tenantId:"";
  const advancedOpen = filters.range.presetId === "kustom" || (!owned.courier && filters.courier) || (!owned.status && filters.status) || filters.query || issues.length;
  const hidden:[string,string][]=[
    ...(owned.tenant&&tenantValue?[["tenant",tenantValue] as [string,string]]:[]),
    ...(owned.courier&&filters.courier?[["kurir",filters.courier] as [string,string]]:[]),
    ...(owned.status&&filters.status?[["status",filters.status] as [string,string]]:[]),
    ...(owned.outcome&&filters.outcome?[["hasil",filters.outcome] as [string,string]]:[]),
  ];
  const ownerLabel=facetOwnerLabel[route];
  return <form action={actualRoute} aria-label="Filter & periode" className="cms-filter-bar" method="get">
    <div>
      <div className={cn("grid grid-cols-2 gap-3",tenantField&&!owned.tenant?"md:grid-cols-3":"md:grid-cols-[repeat(2,minmax(0,14rem))]")}>
        <label className={fieldClass}>Periode<PlatformPeriodSelect className={controlClass} presetId={filters.range.presetId}/></label>
        <label className={fieldClass}>Outlet<select aria-describedby="outlet-hint" className={controlClass} defaultValue={filters.outletId??""} disabled={filters.scope.kind==="global"} name="outlet"><option value="">Semua outlet</option>{options.outlets.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        {tenantField&&!owned.tenant?<label className={cn(fieldClass,"col-span-2 md:col-span-1")}>Tenant<select className={controlClass} defaultValue={tenantValue} name="tenant"><option value="">Semua tenant</option>{options.tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>:null}
      </div>
      <details className="cms-filter-advanced" data-advanced data-filter-disclosure open={Boolean(advancedOpen)}>
        <summary><SlidersHorizontal aria-hidden="true" className="size-4"/>Filter lanjutan<ChevronDown aria-hidden="true" className="ml-auto size-4"/></summary>
        <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className={fieldClass}>Dari<input className={controlClass} defaultValue={filters.range.startDate} name="dari" type="date" /></label>
          <label className={fieldClass}>Sampai<input className={controlClass} defaultValue={filters.range.lastIncludedDate} name="sampai" type="date" /></label>
          {!owned.courier?<label className={fieldClass}>Kurir<select className={controlClass} defaultValue={filters.courier??""} name="kurir"><option value="">Semua kurir</option>{options.couriers.map(c=><option key={c} value={c}>{c}</option>)}</select></label>:null}
          {!owned.status?<label className={fieldClass}>Status<select className={controlClass} defaultValue={filters.status??""} name="status"><option value="">Semua status</option>{shipmentStatuses.map(s=><option key={s} value={s}>{statusLabels[s]} ({s})</option>)}</select></label>:null}
          {route==="/platform/tenant"?<label className={fieldClass}>Cari tenant<input className={controlClass} defaultValue={filters.query??""} maxLength={80} minLength={2} name="q" type="search" /></label>:null}
        </div>
      </details>
    </div>
    {hidden.map(([name,value])=><input key={name} name={name} type="hidden" value={value}/>)}
    <div className="col-span-full max-w-2xl text-xs text-muted-foreground" id="outlet-hint">
      {filters.scope.kind==="global"?(owned.tenant?"Pilih tenant dari filter Tenant di atas tabel sebelum memilih outlet.":"Pilih tenant lalu terapkan sebelum memilih outlet."):null}
      {ownerLabel?<p>{ownerLabel} diatur dari tombol filter di atas tabel; pilihan itu tetap dipakai saat periode diterapkan.</p>:null}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button className="min-h-11 md:min-h-8" type="submit">Terapkan</Button>
      <Button asChild className="min-h-11 md:min-h-8" variant="ghost"><Link href={`${actualRoute}?rentang=30-hari&tz=Asia%2FJakarta`} prefetch={false}>Reset</Link></Button>
    </div>
  </form>;
}

function ScopeBar({filters,tenantName,generatedAt,actualRoute}:{filters:PlatformFilters;tenantName?:string;generatedAt:Date;actualRoute:string}){
  const label=formatRangeLabel(filters.range);const chips:{label:string;href:string}[]=[];
  if(filters.courier)chips.push({label:`Kurir: ${filters.courier}`,href:buildPlatformHref(actualRoute,filters,{courier:null,page:1})});
  if(filters.status)chips.push({label:`Status: ${statusLabels[filters.status]}`,href:buildPlatformHref(actualRoute,filters,{status:null,page:1})});
  if(filters.outcome)chips.push({label:`Hasil: ${filters.outcome}`,href:buildPlatformHref(actualRoute,filters,{outcome:null,page:1})});
  return (
    <section aria-label="Lingkup data" className="flex min-w-0 flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <strong className="font-medium">Lingkup: {filters.scope.kind==="global"?"Global":tenantName??"Tenant"}</strong>
        <span className="text-muted-foreground">Periode: {label.periodLabel} · {label.timezoneLabel}</span>
        <span className="text-muted-foreground">Data per {formatInZone(generatedAt,filters.range.timezone)}</span>
      </div>
      {chips.length?<div className="flex flex-wrap gap-2">{chips.map(c=><Button asChild className="min-h-11 md:min-h-8" key={c.label} size="sm" variant="outline"><Link aria-label={`Hapus filter ${c.label}`} href={c.href} prefetch={false}>{c.label} ×</Link></Button>)}</div>:null}
    </section>
  );
}

function Degraded({name}:{name:string}){return <Alert variant="destructive" role="alert"><AlertTitle>{name} tidak tersedia</AlertTitle><AlertDescription>Bagian ini gagal dimuat, tetapi data lain di halaman tetap dapat digunakan. Muat ulang untuk mencoba kembali.</AlertDescription></Alert>}

/**
 * shadcn Table in a named, keyboard-scrollable bordered region. The first
 * column stays pinned while the rest scrolls, so it needs the ground it sits
 * on as an opaque background.
 */
function TableRegion({caption,id,children,surface="background"}:{caption:string;id:string;children:ReactNode;surface?:"background"|"card"}){
  return (
    <Table
      data-pin-first-column=""
      className={cn(
        "[&_th]:px-3 [&_td]:px-3 [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-20 [&_tbody_tr>*:first-child]:sticky [&_tbody_tr>*:first-child]:left-0 [&_tbody_tr>*:first-child]:z-10",
        surface==="card"?"[&_thead_th:first-child]:bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] [&_tbody_tr>*:first-child]:bg-card":"[&_thead_th:first-child]:bg-[color-mix(in_oklab,var(--muted)_40%,var(--background))] [&_tbody_tr>*:first-child]:bg-background",
      )}
      containerClassName="min-w-0 rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      containerProps={{"aria-labelledby":id,role:"region",tabIndex:0}}
    >
      <TableCaption className="sr-only" id={id}>{caption}</TableCaption>
      {children}
    </Table>
  );
}
/** Raw provider enums and codes have no spaces; let them break so the batch table fits at 1440. */
const wrapCellClass="min-w-24 max-w-40 whitespace-normal wrap-anywhere font-mono text-xs";
function Head({children,numeric}:{children:ReactNode;numeric?:boolean}){return <TableHead className={numeric?"text-right whitespace-normal":undefined} scope="col">{children}</TableHead>}
function RowHead({children}:{children:ReactNode}){return <TableHead className="h-auto py-3 text-sm font-medium" scope="row">{children}</TableHead>}
function HeaderRow({children}:{children:ReactNode}){return <TableHeader className="bg-muted/40"><TableRow className="hover:bg-transparent">{children}</TableRow></TableHeader>}

/** Page-level section: an h2 with its muted description, spaced rather than ruled. */
function Section({id,title,description,children,className}:{id:string;title:ReactNode;description?:ReactNode;children:ReactNode;className?:string}){
  return (
    <section aria-labelledby={id} className={cn("grid min-w-0 gap-4",className)}>
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight" id={id}>{title}</h2>
        {description?<p className={hintClass}>{description}</p>:null}
      </div>
      {children}
    </section>
  );
}

/** The same section as a shadcn Card: CardTitle is the section's h2. */
function CardSection({id,title,description,action,children}:{id:string;title:ReactNode;description?:ReactNode;action?:ReactNode;children:ReactNode}){
  return (
    <section aria-labelledby={id} className="min-w-0">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle id={id}>{title}</CardTitle>
          {description?<CardDescription className="max-w-2xl leading-6">{description}</CardDescription>:null}
          {action?<CardAction>{action}</CardAction>:null}
        </CardHeader>
        <CardContent className="grid min-w-0 gap-4">{children}</CardContent>
      </Card>
    </section>
  );
}

/** A card inside an h2 section, so its title is an h3. */
function SubCard({title,className,children}:{title:string;className?:string;children:ReactNode}){
  return (
    <Card className={cn("min-w-0 gap-4",className)}>
      <CardHeader><h3 className="font-heading text-base leading-snug font-medium" data-slot="card-title">{title}</h3></CardHeader>
      <CardContent className="grid min-w-0 gap-3">{children}</CardContent>
    </Card>
  );
}

function Empty({title,description}:{title:string;description:string}){return <div className={emptyClass}><h3 className="font-medium">{title}</h3><p className={hintClass}>{description}</p></div>}

function Health({health,filters}:{health:PlatformHealth;filters:PlatformFilters}){
  const tiles:{label:string;icon:LucideIcon;tile:{count:number;severity:string;affectedTenants:number};detail:string}[]=[
    {label:"Batch tertahan di antrean",icon:Hourglass,tile:health.queue,detail:`Terlama ${formatDuration(health.queue.oldestMs)}`},
    {label:"Pesanan menunggu pembayaran upstream",icon:Wallet,tile:health.unpaid,detail:`${health.unpaid.recovering} pemulihan berjalan`},
    {label:"Status pengiriman tidak diketahui",icon:CircleQuestionMark,tile:health.unknown,detail:`${health.unknown.batches} batch · ${health.unknown.orders} pesanan · ${health.unknown.recoveries} pemulihan`},
    {label:"Kegagalan provider",icon:TriangleAlert,tile:health.failures,detail:`${Math.round(health.failures.share*100)}% dari batch dalam periode`},
  ];
  return (
    <Section description="Saat ini — tidak terpengaruh filter periode. Kegagalan dan durasi tetap mengikuti periode." id="platform-health-title" title="Kesehatan provider dan antrean">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({label,icon,tile,detail})=>(
          <StatCard
            className="[&_[data-slot=card-header]]:items-start [&_[data-slot=card-title]]:min-h-20 md:[&_[data-slot=card-title]]:min-h-10"
            description={<span className="grid gap-0.5"><span>{detail}</span>{filters.scope.kind==="global"?<span>{formatCount(tile.affectedTenants)} tenant terdampak</span>:null}</span>}
            icon={icon}
            key={label}
            title={label}
            value={<span className="flex flex-wrap items-center justify-between gap-2">{formatCount(tile.count)}<ToneBadge label={severityLabel(tile.severity)} tone={severityTone(tile.severity)} /></span>}
          />
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-7">
        <SubCard className="lg:col-span-3" title="Durasi penyelesaian batch">
          <dl className="grid grid-cols-2 gap-3">
            <div className="grid gap-1 rounded-md border p-3"><dt className="text-sm text-muted-foreground">p50</dt><dd className="text-2xl font-bold tabular-nums">{health.latency.p50Seconds===null?"—":formatDuration(health.latency.p50Seconds*1000)}</dd></div>
            <div className="grid gap-1 rounded-md border p-3"><dt className="text-sm text-muted-foreground">p95</dt><dd className="text-2xl font-bold tabular-nums">{health.latency.p95Seconds===null?"—":formatDuration(health.latency.p95Seconds*1000)}</dd></div>
          </dl>
          <p className={hintClass}>Dari percobaan kirim sampai batch selesai; bukan latensi HTTP provider.</p>
        </SubCard>
        <SubCard className="lg:col-span-4" title="Antrean per akun provider">
          {health.accounts.length?(
            <TableRegion caption="Antrean per akun provider" id="account-queue" surface="card">
              <HeaderRow><Head>Akun</Head><Head>Kurir</Head><Head numeric>Menunggu</Head><Head>Terlama</Head></HeaderRow>
              <TableBody>{health.accounts.map(a=><TableRow key={`${a.bucket}-${a.courier}`}><RowHead>Akun provider #{a.bucket}</RowHead><TableCell>{a.courier}</TableCell><TableCell className={numericClass}>{formatCount(a.waiting)}</TableCell><TableCell>{formatDuration(a.oldestMs)}</TableCell></TableRow>)}</TableBody>
            </TableRegion>
          ):<p className={hintClass}>Tidak ada antrean provider.</p>}
          <p className={hintClass}>#N adalah nomor urut anonim; identitas akun provider tidak ditampilkan.</p>
        </SubCard>
      </div>
    </Section>
  );
}

function Counts({counts,previous,filters}:{counts:PlatformCounts;previous:Awaited<ReturnType<typeof readPreviousPeriodHeadline>>|null;filters:PlatformFilters}){
  const groups:{title:string;icon:LucideIcon;rows:[string,number][]}[]=[
    ...(filters.scope.kind==="global"?[{title:"Tenant",icon:Building2,rows:[["Aktif",counts.tenants.active],["Ditangguhkan",counts.tenants.suspended],["Provisioning",counts.tenants.provisioning],["Diarsipkan",counts.tenants.archived],["Tenant baru",counts.tenants.newInRange]] as [string,number][]}]:[]),
    {title:"Outlet",icon:Store,rows:[["Outlet",counts.outlets.total],["Konfigurasi lengkap",counts.outlets.configured],["Koneksi privat aktif",counts.outlets.privateConnections],["Default platform",counts.outlets.platformDefault],["Belum lengkap",counts.outlets.incomplete]] as [string,number][]},
    {title:"Keanggotaan",icon:Users,rows:[["Anggota aktif",counts.memberships.active],["Tenant Admin",counts.memberships.tenantAdmins],["Operator",counts.memberships.operators],["Ditangguhkan",counts.memberships.suspended]] as [string,number][]},
    {title:"Siklus kiriman",icon:Package,rows:[["Kiriman dibuat",counts.lifecycle.shipments],["Batch",counts.lifecycle.batches],["Batch selesai",counts.lifecycle.batchesCompleted],["Batch gagal",counts.lifecycle.batchesFailed],["Resi terbit",counts.lifecycle.issued],["Belum dibayar",counts.lifecycle.unpaid],["Status tidak diketahui",counts.lifecycle.unknown],["Pemulihan selesai",counts.lifecycle.recoveriesCompleted],["Permintaan estimasi",counts.lifecycle.estimates]] as [string,number][]},
  ];
  const comparison=(label:string,value:number)=>previous&&label==="Kiriman dibuat"?<span className="block">{value-previous.created>=0?"+":""}{formatCount(value-previous.created)} vs periode sebelumnya</span>:null;
  return (
    <Section id="platform-volume-title" title="Volume operasional">
      <div className={cn("grid items-start gap-4 sm:grid-cols-2",filters.scope.kind==="global"?"lg:grid-cols-4":"lg:grid-cols-3")}>
        {groups.map(({title,icon,rows:[[headlineLabel,headline],...rest]})=>(
          <StatCard
            className="h-auto"
            description={<>{headlineLabel}{comparison(headlineLabel,headline)}</>}
            footer={<dl className="grid w-full text-sm">{rest.map(([label,value])=><div className="flex items-center justify-between gap-4 border-t py-2 first:border-0" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-semibold text-foreground tabular-nums">{formatCount(value)}</dd></div>)}</dl>}
            icon={icon}
            key={title}
            title={title}
            value={formatCount(headline)}
          />
        ))}
      </div>
    </Section>
  );
}

function Trend({rows,filters}:{rows:TrendBucket[];filters:PlatformFilters}){
  const label=formatRangeLabel(filters.range);
  return (
    <CardSection description={`${label.periodLabel} · ${label.timezoneLabel}`} id="platform-trend-title" title={`Tren ${filters.range.granularity}`}>
      {rows.length?<>
        <PlatformTrendChart data={rows.map(({key,label:bucketLabel,created,issued,failed})=>({key,label:bucketLabel,created,issued,failed}))} granularity={filters.range.granularity} periodLabel={`${label.periodLabel} · ${label.timezoneLabel}`}/>
        {/* Command-center route: the complete table may start collapsed (spec 19 M-3). */}
        <details className="min-w-0 rounded-md border">
          <summary className="min-h-11 cursor-pointer content-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-8">Lihat tabel data ({formatCount(rows.length)} baris)</summary>
          <div className="border-t p-3">
            <TableRegion caption={`Tren ${filters.range.granularity} · ${label.periodLabel} · ${label.timezoneLabel}`} id="trend-caption" surface="card">
              <HeaderRow><Head>{filters.range.granularity==="harian"?"Tanggal":"Bulan"}</Head><Head numeric>Kiriman dibuat</Head><Head numeric>Resi terbit</Head><Head numeric>Gagal</Head><Head numeric>Belum dibayar</Head></HeaderRow>
              <TableBody>{rows.map(r=><TableRow key={r.key}><RowHead>{r.label}</RowHead><TableCell className={numericClass}>{formatCount(r.created)}</TableCell><TableCell className={numericClass}>{formatCount(r.issued)}</TableCell><TableCell className={numericClass}>{formatCount(r.failed)}</TableCell><TableCell className={numericClass}>{formatCount(r.unpaid)}</TableCell></TableRow>)}</TableBody>
            </TableRegion>
          </div>
        </details>
      </>:<p className={hintClass}>Belum ada data tren pada periode ini.</p>}
    </CardSection>
  );
}

/** Option search only pays for itself on long lists (more than 8 options). */
const facetSearch=(count:number,placeholder:string)=>count>8?placeholder:undefined;
/** Toggle one single-valued URL filter; every facet change returns to page 1. */
function facetOption(route:string,filters:PlatformFilters,label:string,selected:boolean,overrides:Parameters<typeof buildPlatformHref>[2],clear:Parameters<typeof buildPlatformHref>[2]){
  return {label,selected,href:buildPlatformHref(route,filters,{...(selected?clear:overrides),page:1})};
}
function tenantFacet(route:string,filters:PlatformFilters,options:FilterOptions):DataTableFacet{
  const clear={scope:{kind:"global"} as const,outletId:null};
  return {
    title:"Tenant",
    searchPlaceholder:facetSearch(options.tenants.length,"Cari tenant"),
    clearHref:buildPlatformHref(route,filters,{...clear,page:1}),
    options:options.tenants.map(t=>facetOption(route,filters,t.name,filters.scope.kind==="tenant"&&filters.scope.tenantId===t.id,{scope:{kind:"tenant",tenantId:t.id},outletId:null},clear)),
  };
}

function Usage({data,filters,overview,options}:{data:{rows:TenantUsageRow[];total:number};filters:PlatformFilters;overview:boolean;options:FilterOptions}){
  const label=formatRangeLabel(filters.range);
  const filtered=Boolean(filters.query||filters.status||filters.courier||filters.outletId||filters.scope.kind==="tenant");
  const route="/platform/tenant";
  const table=data.rows.length?(
    <TableRegion caption={`Penggunaan tenant · ${label.periodLabel} · ${label.timezoneLabel}`} id="tenant-caption" surface={overview?"card":"background"}>
      <HeaderRow><Head>Tenant</Head><Head>Status</Head><Head numeric>Outlet</Head><Head numeric>Anggota</Head><Head numeric>Kiriman</Head><Head numeric>Batch</Head><Head numeric>Resi</Head><Head numeric>Belum dibayar</Head><Head numeric>Gagal</Head><Head numeric>Tidak diketahui</Head><Head>Aktivitas terakhir</Head></HeaderRow>
      <TableBody>{data.rows.map(r=><TableRow key={r.tenantId}><RowHead><Link className="inline-flex min-h-11 min-w-28 max-w-48 items-center whitespace-normal wrap-anywhere text-primary underline-offset-4 hover:underline focus-visible:underline" href={`/platform/tenant/${r.tenantId}?rentang=${filters.range.presetId}&tz=${encodeURIComponent(filters.range.timezone)}`} prefetch={false}>{r.name}</Link></RowHead><TableCell><Badge variant="outline">{tenantStatusLabels[r.status]}</Badge></TableCell><TableCell className={numericClass}>{r.outletConfigured}/{r.outletTotal}</TableCell><TableCell className={numericClass}>{formatCount(r.members)}</TableCell><TableCell className={numericClass}>{formatCount(r.shipments)}</TableCell><TableCell className={numericClass}>{formatCount(r.batches)}</TableCell><TableCell className={numericClass}>{formatCount(r.issued)}</TableCell><TableCell className={numericClass}>{formatCount(r.unpaid)}</TableCell><TableCell className={numericClass}>{formatCount(r.failed)}</TableCell><TableCell className={numericClass}>{formatCount(r.unknown)}</TableCell><TableCell>{r.lastActivityAt?formatInZone(r.lastActivityAt,filters.range.timezone):"—"}</TableCell></TableRow>)}</TableBody>
    </TableRegion>
  ):<Empty description={filtered?"Ubah atau hapus filter untuk menampilkan tenant lain.":"Provision tenant pertama untuk memulai konfigurasi platform."} title={filtered?"Tidak ada hasil filter":"Belum ada tenant"}/>;
  const description="Urutan memprioritaskan tenant dengan kegagalan atau status tidak diketahui.";
  if(overview){
    return (
      <CardSection action={<Button asChild className={secondaryLinkClass} size="sm" variant="outline"><Link href={buildPlatformHref(route,filters,{page:1,query:null})} prefetch={false}>Lihat semua tenant</Link></Button>} description={description} id="platform-usage-title" title="Penggunaan per tenant">
        {table}
      </CardSection>
    );
  }
  const clearStatus={status:null};const clearCourier={courier:null};
  const facets:DataTableFacet[]=[
    tenantFacet(route,filters,options),
    {title:"Status",searchPlaceholder:facetSearch(shipmentStatuses.length,"Cari status"),clearHref:buildPlatformHref(route,filters,{...clearStatus,page:1}),options:shipmentStatuses.map(s=>facetOption(route,filters,statusLabels[s],filters.status===s,{status:s},clearStatus))},
    {title:"Kurir",searchPlaceholder:facetSearch(options.couriers.length,"Cari kurir"),clearHref:buildPlatformHref(route,filters,{...clearCourier,page:1}),options:options.couriers.map(c=>facetOption(route,filters,c,filters.courier===c,{courier:c},clearCourier))},
  ];
  const pages=Math.max(1,Math.ceil(data.total/PAGE_SIZE));
  return (
    <Section description={description} id="platform-usage-title" title="Penggunaan per tenant">
      <DataTableToolbar facets={facets} isFiltered={filtered} resetHref={buildPlatformHref(route,filters,{courier:null,outletId:null,page:1,query:null,scope:{kind:"global"},status:null})}/>
      {table}
      <DataTablePagination hrefForPage={page=>buildPlatformHref(route,filters,{page})} label="Navigasi halaman tenant" page={filters.page} summary={`${formatCount(data.total)} tenant`} totalCount={data.total} totalPages={pages}/>
    </Section>
  );
}

function Audit({data,filters,overview,route,options}:{data:{rows:AuditRow[];total:number};filters:PlatformFilters;overview:boolean;route:string;options:FilterOptions}){
  const label=formatRangeLabel(filters.range);
  const table=data.rows.length?(
    <TableRegion caption={`Jejak audit · ${label.periodLabel} · ${label.timezoneLabel}`} id="audit-caption" surface={overview?"card":"background"}>
      <HeaderRow><Head>Waktu</Head><Head>Aksi</Head><Head>Hasil</Head><Head>Tenant</Head><Head>Detail aman</Head></HeaderRow>
      <TableBody>{data.rows.map(r=><TableRow key={r.id}><TableCell>{formatInZone(r.createdAt,filters.range.timezone)}</TableCell><RowHead>{r.action}</RowHead><TableCell><Badge variant={r.outcome==="SUCCESS"?"secondary":"destructive"}>{r.outcome==="SUCCESS"?"Berhasil":"Ditolak"}</Badge></TableCell><TableCell>{r.tenantName??"Platform"}</TableCell><TableCell><details><summary className="min-h-11 cursor-pointer content-center font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Lihat detail</summary><dl className="grid min-w-48 gap-2 pb-3 text-sm"><div><dt className="text-muted-foreground">Peran aktor</dt><dd>{r.actorRole??"Tidak tersedia"}</dd></div><div><dt className="text-muted-foreground">Perubahan status</dt><dd>{r.fromStatus||r.toStatus?`${r.fromStatus??"—"} → ${r.toStatus??"—"}`:"Tidak ada"}</dd></div></dl></details></TableCell></TableRow>)}</TableBody>
    </TableRegion>
  ):<Empty description="Tidak ada event yang cocok dengan periode dan hasil terpilih." title="Belum ada aktivitas audit"/>;
  const description="Append-only · detail dibatasi pada konteks operasional yang aman tanpa kredensial atau PII.";
  if(overview){
    return (
      <CardSection action={<Button asChild className={secondaryLinkClass} size="sm" variant="outline"><Link href={buildPlatformHref("/platform/audit",filters,{page:1,outcome:null,query:null})} prefetch={false}>Lihat semua aktivitas audit</Link></Button>} description={description} id="platform-audit-title" title="Jejak audit">
        {table}
      </CardSection>
    );
  }
  // Only the audit route accepts `hasil` and a tenant choice; on a tenant's
  // detail page the scope is the route itself, so there is nothing to facet.
  const auditRoute=route==="/platform/audit";
  const clearOutcome={outcome:null};
  const facets:DataTableFacet[]=auditRoute?[
    {title:"Hasil",clearHref:buildPlatformHref(route,filters,{...clearOutcome,page:1}),options:([["SUCCESS","Berhasil"],["DENIED","Ditolak"]] as const).map(([value,text])=>facetOption(route,filters,text,filters.outcome===value,{outcome:value},clearOutcome))},
    tenantFacet(route,filters,options),
  ]:[];
  const pages=Math.max(1,Math.ceil(data.total/PAGE_SIZE));
  return (
    <Section description={description} id="platform-audit-title" title="Jejak audit">
      {auditRoute?<DataTableToolbar facets={facets} isFiltered={Boolean(filters.outcome||filters.scope.kind==="tenant")} resetHref={buildPlatformHref(route,filters,{outcome:null,outletId:null,page:1,scope:{kind:"global"}})}/>:null}
      {table}
      <DataTablePagination hrefForPage={page=>buildPlatformHref(route,filters,{page})} label="Navigasi halaman audit" page={filters.page} summary={`${formatCount(data.total)} aktivitas`} totalCount={data.total} totalPages={pages}/>
    </Section>
  );
}

function TenantDetail({detail,filters}:{detail:Detail;filters:PlatformFilters}){
  return <>
    <CardSection description={`${detail.outlets.length} outlet · status koneksi ditampilkan tanpa nilai kredensial.`} id="tenant-outlet-title" title="Konfigurasi outlet">
      {detail.outlets.length?(
        <TableRegion caption="Konfigurasi outlet tanpa nilai kredensial" id="outlet-caption" surface="card">
          <HeaderRow><Head>Outlet</Head><Head>Alamat pickup</Head><Head>Area asal</Head><Head>Sumber kredensial</Head><Head>Diperbarui</Head></HeaderRow>
          <TableBody>{detail.outlets.map(o=><TableRow key={o.id}><RowHead>{o.name}</RowHead><TableCell>{o.hasPickup?"Terisi":"Kosong"}</TableCell><TableCell>{o.hasOrigin?"Terisi":"Kosong"}</TableCell><TableCell>{o.hasPrivateConnection?"Privat aktif":"Default platform"}</TableCell><TableCell>{formatInZone(o.updatedAt,filters.range.timezone)}</TableCell></TableRow>)}</TableBody>
        </TableRegion>
      ):<Empty description="Tenant belum memiliki outlet untuk dikonfigurasi atau dipantau." title="Belum ada outlet"/>}
    </CardSection>
    <CardSection id="tenant-batch-title" title="Batch provider terbaru">
      {detail.batches.length?(
        <TableRegion caption="Batch provider terbaru; identitas akun dianonimkan" id="batch-caption" surface="card">
          <HeaderRow><Head>Batch</Head><Head>Kurir</Head><Head>Sumber</Head><Head>Status</Head><Head>Kode aman</Head><Head>Akun</Head><Head>Waktu</Head></HeaderRow>
          <TableBody>{detail.batches.map(b=><TableRow key={b.id}><RowHead>{formatShortId(b.id)}</RowHead><TableCell>{b.courier}</TableCell><TableCell>{b.credentialSource==="private"?"Privat aktif":"Default platform"}</TableCell><TableCell className={wrapCellClass}>{b.status}</TableCell><TableCell className={wrapCellClass}>{b.safeErrorCode??"—"}</TableCell><TableCell>Akun provider #{b.providerAccountBucket}</TableCell><TableCell className="text-xs leading-5"><span className="block">Dicoba {b.submissionAttemptedAt?formatInZone(b.submissionAttemptedAt,filters.range.timezone):"—"}</span><span className="block text-muted-foreground">Selesai {b.completedAt?formatInZone(b.completedAt,filters.range.timezone):"—"}</span></TableCell></TableRow>)}</TableBody>
        </TableRegion>
      ):<Empty description="Tidak ada batch provider pada periode dan outlet terpilih." title="Belum ada batch"/>}
    </CardSection>
  </>;
}

function FinanceSummary({ finance, filters }: { finance: Finance; filters: PlatformFilters }) {
  const label = formatRangeLabel(filters.range);
  const entryLabels: Record<string, string> = {
    COD_PRINCIPAL_COLLECTABLE: "Pokok COD",
    MENGANTAR_SHIPPING_COST: "Ongkir Mengantar",
    MENGANTAR_INSURANCE_COST: "Asuransi Mengantar",
    MENGANTAR_COD_FEE_COST: "Biaya COD Mengantar",
    GERAICUAN_COD_SERVICE_FEE_REVENUE: "Pendapatan jasa COD (entri lama)",
    COD_SERVICE_FEE_VAT_PAYABLE: "PPN jasa COD",
    NON_COD_UPSTREAM_PAYMENT: "Pembayaran non-COD",
    COD_REMITTANCE: "Remitansi COD",
  };
  return (
    <Section description={`Ringkasan agregat terotorisasi · ${label.periodLabel} · ${label.timezoneLabel}. Tidak memuat identitas kiriman, pihak penerima, atau kredensial.`} id="finance-summary-title" title="Ledger dan rekonsiliasi">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="finance-ledger-title" className="grid content-start gap-3">
          <h3 className="font-medium" id="finance-ledger-title">Ledger operasional</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard icon={ReceiptText} title="Entri" value={formatCount(finance.ledger.entryCount)}/>
            <StatCard description="Bukan pendapatan GeraiCUAN." icon={Landmark} title="Pokok COD — liabilitas" value={idrFormatter.format(finance.ledger.codPrincipalLiabilityIdr)}/>
            <StatCard title="Biaya provider" value={idrFormatter.format(finance.ledger.providerCostIdr)}/>
            <StatCard description="Entri lama. Biaya COD kini dicatat sebagai biaya provider karena dipotong Mengantar." title="Pendapatan jasa COD (entri lama)" value={idrFormatter.format(finance.ledger.revenueIdr)}/>
            <StatCard title="PPN terutang" value={idrFormatter.format(finance.ledger.vatPayableIdr)}/>
            <StatCard title="Pemulihan non-COD" value={idrFormatter.format(finance.ledger.upstreamRecoveryPaymentIdr)}/>
          </div>
        </section>
        <section aria-labelledby="finance-reconciliation-title" className="grid content-start gap-3">
          <h3 className="font-medium" id="finance-reconciliation-title">Hasil rekonsiliasi terbaru</h3>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <StatCard icon={Scale} title="Cocok" value={formatCount(finance.reconciliations.filter(row=>row.status==="MATCHED").length)}/>
            <StatCard icon={TriangleAlert} title="Variansi" value={formatCount(finance.reconciliations.filter(row=>row.status==="VARIANCE").length)}/>
          </div>
        </section>
      </div>
      {finance.reconciliations.length ? (
        <TableRegion caption={`Rekonsiliasi terbaru · ${label.periodLabel} · ${label.timezoneLabel}`} id="reconciliation-caption">
          <HeaderRow><Head>Periode</Head><Head>Klasifikasi</Head><Head>Irama</Head><Head numeric>Sumber</Head><Head numeric>Ledger</Head><Head numeric>Variansi</Head><Head>Hasil</Head></HeaderRow>
          <TableBody>{finance.reconciliations.map((row,index)=><TableRow key={`${row.cadence}-${row.reconciledEntryType}-${row.periodStart.toISOString()}-${index}`}><TableCell>{formatInZone(row.periodStart,filters.range.timezone)} – {formatInZone(row.periodEnd,filters.range.timezone)}</TableCell><RowHead>{entryLabels[row.reconciledEntryType]??row.reconciledEntryType}</RowHead><TableCell>{row.cadence==="DAILY"?"Harian":"Bulanan"}</TableCell><TableCell className={numericClass}>{idrFormatter.format(row.sourceTotalIdr)}</TableCell><TableCell className={numericClass}>{idrFormatter.format(row.ledgerTotalIdr)}</TableCell><TableCell className={numericClass}>{signedIdrFormatter.format(row.varianceIdr)}</TableCell><TableCell><Badge variant={row.status==="MATCHED"?"secondary":"destructive"}>{row.status==="MATCHED"?"Cocok":"Variansi"}</Badge></TableCell></TableRow>)}</TableBody>
        </TableRegion>
      ) : <p className={hintClass}>Belum ada hasil rekonsiliasi pada periode dan outlet terpilih.</p>}
    </Section>
  );
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
  const shipmentPrefix=kind==="tenant-detail"&&detail?await loadPlatformTenantShipmentPrefix(db,principal.userId,detail.tenant.id).catch(()=>null):null;
  const titles:Record<PageKind,{eyebrow:string;title:string;intro:string}>={overview:{eyebrow:"Operasi platform",title:"Ringkasan operasional",intro:"Pantau antrean, kegagalan, volume, dan aktivitas lintas tenant."},"tenant-list":{eyebrow:"Tenant",title:"Daftar tenant",intro:"Temukan tenant dan bandingkan penggunaan operasional."},"tenant-detail":{eyebrow:"Detail tenant",title:detail?.tenant.name??"Detail tenant",intro:"Kondisi operasional dan konfigurasi aman tenant. Hanya konfigurasi aman yang ditampilkan; nilai kredensial tidak pernah ditampilkan."},audit:{eyebrow:"Audit",title:"Jejak audit",intro:"Tinjau tindakan platform dan hasil yang ditolak."}};
  const title=titles[kind];
  const stale=auditScenario?.endsWith("-stale");
  const presentedAt=stale?new Date(data.now.getTime()-10*60_000):data.now;
  const scenarioInvalid=auditScenario?.endsWith("-invalid-query");
  const provisionState=auditScenario==="platform-tenant-provision-success"?{outcome:"success" as const,message:"Tenant audit berhasil diprovisikan."}:auditScenario==="platform-tenant-provision-error"?{outcome:"error" as const,message:"Provisioning tenant gagal. Nilai aman dipertahankan.",values:{name:"Tenant audit"}}:undefined;
  const lifecycleState=auditScenario==="platform-tenant-detail-lifecycle-success"?{outcome:"success" as const,message:"Status tenant berhasil diperbarui."}:auditScenario==="platform-tenant-detail-lifecycle-error"?{outcome:"error" as const,message:"Perubahan status gagal. Nilai aman dipertahankan.",values:{expectedName:detail?.tenant.name}}:undefined;
  return <PageContainer><PageHeader description={title.intro} eyebrow={title.eyebrow} title={title.title}/>{data.parsed.issues.length||scenarioInvalid?<AlertRegion className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm"><h2 className="font-medium">Filter disesuaikan</h2><ul className="mt-2 list-disc pl-5 text-muted-foreground">{data.parsed.issues.map((issue,index)=><li key={`${issue}-${index}`}>{platformIssueMessage(issue)}</li>)}{scenarioInvalid?<li>Parameter URL tidak dikenal; filter aman tetap digunakan.</li>:null}</ul><Button asChild className="mt-3 min-h-11" variant="outline"><Link href={canonical} prefetch={false}>Buka URL yang sudah dirapikan</Link></Button></AlertRegion>:null}<ScopeBar actualRoute={actualRoute} filters={filters} generatedAt={presentedAt} tenantName={detail?.tenant.name}/>
  {stale?<Alert role="alert" variant="destructive"><AlertTitle>Data platform mungkin sudah kedaluwarsa</AlertTitle><AlertDescription className="space-y-3"><p>Snapshot terakhir melewati batas kesegaran. Data dianggap perlu diperbarui setelah {DATA_STALE_AFTER_MS/60_000} menit. Muat ulang sebelum mengambil keputusan siklus tenant.</p><Button asChild className="min-h-11" variant="outline"><Link href={canonical} prefetch={false}>Muat ulang data</Link></Button></AlertDescription></Alert>:null}
  {kind==="tenant-list"?<ProvisionTenantForm auditState={provisionState} initialAttemptId={randomUUID()}/>:null}
  {kind==="tenant-detail"&&detail?<TenantLifecycleControls auditState={lifecycleState} initialAttemptId={randomUUID()} status={detail.tenant.status} tenantId={detail.tenant.id} tenantName={detail.tenant.name}/>:null}
  {kind==="tenant-detail"&&detail?<ShipmentPrefixUnlockControl initialAttemptId={randomUUID()} state={shipmentPrefix} tenantId={detail.tenant.id} tenantName={detail.tenant.name}/>:null}
  <FilterPanel actualRoute={actualRoute} filters={filters} issues={data.parsed.issues} options={data.options} route={route}/>
  {kind==="overview"||kind==="tenant-detail"?(health?<Health filters={filters} health={health}/>:<Degraded name="Kesehatan provider dan antrean"/>):null}
  {kind==="overview"||kind==="tenant-detail"?(counts?<Counts counts={counts} filters={filters} previous={fulfilled(previousResult)}/>:<Degraded name="Volume operasional"/>):null}
  {kind==="tenant-detail"&&detail?<TenantDetail detail={detail} filters={filters}/>:null}
  {kind==="overview"||kind==="tenant-detail"?(trend?<Trend filters={filters} rows={trend}/>:<Degraded name="Tren"/>):null}
  {kind==="tenant-detail"?(finance?<FinanceSummary finance={finance} filters={filters}/>:<Degraded name="Ledger dan rekonsiliasi"/>):null}
  {kind==="overview"||kind==="tenant-list"?(usage?<Usage data={usage} filters={filters} options={data.options} overview={kind==="overview"}/>:<Degraded name="Penggunaan per tenant"/>):null}
  {kind==="overview"||kind==="audit"||kind==="tenant-detail"?(audit?<Audit data={audit} filters={filters} options={data.options} overview={kind==="overview"} route={actualRoute}/>:<Degraded name="Jejak audit"/>):null}</PageContainer>;
}
