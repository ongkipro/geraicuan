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
  Package,
  Store,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { AlertRegion } from "@/app/_components/alert-region";
import { DataTablePagination } from "@/components/cms/data-table-pagination";
import { dataTableSurfaceClassName } from "@/components/cms/data-table-shell";
import { DateRangeFilter } from "@/components/cms/date-range-filter";
import { HelpHint } from "@/components/cms/help-hint";
import { ToneBadge, type StatusTone } from "@/components/cms/shipment-status-badge";
import { DataTableToolbar, type DataTableFacet } from "@/components/cms/data-table-toolbar";
import { ShipmentPrefixUnlockControl } from "@/app/platform/_components/shipment-prefix-unlock";
import { loadPlatformTenantShipmentPrefix } from "@/db/shipment-number-repository";
import { PageContainer } from "@/components/cms/page-container";
import { desktopTableClassName, RecordItem, RecordList } from "@/components/cms/record-list";
import { PageHeader } from "@/components/cms/page-header";
import { DefinitionGrid } from "@/components/cms/detail-section";
import { StatCard } from "@/components/cms/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  ProvisionTenantForm,
  TenantLifecycleControls,
} from "@/app/platform/_components/tenant-lifecycle-controls";
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
  parseAnalyticsRange,
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
import { PROVIDER_BATCH_STATUS_LABELS, providerResponseLabel } from "@/lib/labels/provider";
import { LEGACY_COD_FEE_VAT_LABEL, LEGACY_COD_FEE_VAT_NOTE } from "@/lib/mengantar-cod-fee";
import { courierDisplayName } from "@/lib/mengantar-couriers";
import {
  auditActionSentence,
  auditActorLabel,
  auditOutcomeLabel,
  tenantStatusLabel,
  tenantStatusTone,
} from "@/lib/labels/audit";

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
  // Spec 10 §5: an exact zero variance reads neutral, never "+Rp 0".
  signDisplay: "exceptZero",
});

// One vocabulary for one lifecycle. A super admin filtering on a status must
// read the same words the tenant sees on the shipment itself; this used to be a
// second map, so the same stored value read "Antre retur" in one scope and
// "RTS (Antrean)" in the other.
const statusLabels: Record<(typeof shipmentStatuses)[number], string> =
  Object.fromEntries(
    shipmentStatuses.map((status) => [status, SHIPMENT_STATUS_PRESENTATION[status].label]),
  ) as Record<(typeof shipmentStatuses)[number], string>;

const fieldClass = "grid min-w-0 gap-1.5 text-sm font-medium";
const controlClass = "h-11 md:h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
// Capped like every other description in the CMS: uncapped, these run to 102ch
// on the wide platform container.
const hintClass = "max-w-2xl text-sm leading-6 text-muted-foreground";
const numericClass = "text-right tabular-nums";
// Spec 10 §1.6: an empty region states itself in plain text; no dashed box.
const emptyClass = "grid gap-1 py-6";
const secondaryLinkClass = "min-h-11 md:min-h-10";

// T-155: "Perhatian" now carries the amber tone the palette always had; red stays
// reserved for "Kritis", per spec 10's status vocabulary. T-203 colour budget (§1.9):
// "Normal" asks for no decision, so it reads neutral; only real signals carry a tone.
function severityTone(severity: string): StatusTone {
  if (severity === "kritis") return "danger";
  if (severity === "perhatian") return "warn";
  return "neutral";
}
// Mobile record badge for a provider submission: only the states that need a look carry a tone.
function batchTone(status: string): StatusTone {
  if (status === "FAILED") return "danger";
  if (status === "SUBMISSION_UNKNOWN") return "warn";
  return "neutral";
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
/** Settles one reader. Callers await these in turn: every reader shares the transaction's one connection (T-197). */
async function settle<T>(read: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await read() };
  } catch (reason) {
    return { reason, status: "rejected" };
  }
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

function FilterPanel({ filters, options, issues, route, actualRoute, now }: { filters:PlatformFilters;options:FilterOptions;issues:string[];route:PlatformRoute;actualRoute:string;now:Date }) {
  const owned=facetOwnership(route);
  const tenantField=route!=="/platform/tenant/[tenantId]";
  const tenantValue=filters.scope.kind==="tenant"?filters.scope.tenantId:"";
  // Custom dates live in the shared range control now, so only the secondary facets open this.
  const advancedOpen = (!owned.courier && filters.courier) || (!owned.status && filters.status) || filters.query || issues.length;
  const range = formatRangeLabel(filters.range);
  const todayLocalDate = parseAnalyticsRange({ rentang: "hari-ini", tz: filters.range.timezone }, now).startDate;
  const hidden:[string,string][]=[
    ...(owned.tenant&&tenantValue?[["tenant",tenantValue] as [string,string]]:[]),
    ...(owned.courier&&filters.courier?[["kurir",filters.courier] as [string,string]]:[]),
    ...(owned.status&&filters.status?[["status",filters.status] as [string,string]]:[]),
    ...(owned.outcome&&filters.outcome?[["hasil",filters.outcome] as [string,string]]:[]),
  ];
  const ownerLabel=facetOwnerLabel[route];
  const outletHint=filters.scope.kind==="global"?(owned.tenant?"Pilih tenant dari filter Tenant di atas tabel untuk memilih outlet.":"Pilih tenant lalu terapkan untuk memilih outlet."):null;
  // T-206: "Hapus filter" only when something differs from the default window, as on the tenant pages.
  const filtered=filters.range.presetId!=="30-hari"||Boolean(filters.outletId)||Boolean(tenantField&&!owned.tenant&&tenantValue)||Boolean(!owned.courier&&filters.courier)||Boolean(!owned.status&&filters.status)||Boolean(filters.query);
  // T-206 reference filter row: one line of controls whose names are sr-only (the range trigger
  // names the period itself), an outline "Terapkan" and the plain underlined "Hapus filter" link.
  return <div className="grid min-w-0 gap-2">
    <form action={actualRoute} aria-label="Filter & periode" className="cms-filter-bar" method="get">
      <div>
        <div>
          <div aria-labelledby="platform-range-label" className={fieldClass} role="group">
            <span className="sr-only" id="platform-range-label">Periode</span>
            <DateRangeFilter endDate={filters.range.lastIncludedDate} idPrefix="platform" presetId={filters.range.presetId} rangeLabel={range.periodLabel} startDate={filters.range.startDate} timezoneLabel={range.timezoneLabel} todayLocalDate={todayLocalDate}/>
          </div>
          <label className={fieldClass}><span className="sr-only">Outlet</span><select aria-describedby={outletHint?"outlet-hint":undefined} className={controlClass} defaultValue={filters.outletId??""} disabled={filters.scope.kind==="global"} name="outlet"><option value="">Semua outlet</option>{options.outlets.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          {tenantField&&!owned.tenant?<label className={fieldClass}><span className="sr-only">Tenant</span><select className={controlClass} defaultValue={tenantValue} name="tenant"><option value="">Semua tenant</option>{options.tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>:null}
        </div>
        <details className="cms-filter-advanced" data-filter-disclosure open={Boolean(advancedOpen)}>
          <summary><SlidersHorizontal aria-hidden="true" className="size-4"/>Filter lanjutan<ChevronDown aria-hidden="true" className="ml-auto size-4"/></summary>
          <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">
            {!owned.courier?<label className={fieldClass}>Kurir<select className={controlClass} defaultValue={filters.courier??""} name="kurir"><option value="">Semua kurir</option>{options.couriers.map(c=><option key={c} value={c}>{courierDisplayName(c)}</option>)}</select></label>:null}
            {!owned.status?<label className={fieldClass}>Status<select className={controlClass} defaultValue={filters.status??""} name="status"><option value="">Semua status</option>{shipmentStatuses.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>:null}
            {route==="/platform/tenant"?<label className={fieldClass}>Cari tenant<input className={controlClass} defaultValue={filters.query??""} maxLength={80} minLength={2} name="q" type="search" /></label>:null}
          </div>
        </details>
      </div>
      {hidden.map(([name,value])=><input key={name} name={name} type="hidden" value={value}/>)}
      <div className="flex items-center gap-3">
        <Button className="max-md:min-h-11" type="submit" variant="outline">Terapkan</Button>
        {filtered?<Button asChild className="h-10 px-1 text-xs font-normal text-muted-foreground underline hover:text-foreground max-md:min-h-11" variant="link"><Link href={`${actualRoute}?rentang=30-hari&tz=Asia%2FJakarta`} prefetch={false}>Hapus filter</Link></Button>:null}
      </div>
    </form>
    {outletHint||ownerLabel?<div className="flex min-w-0 items-center gap-1">
      {outletHint?<p className="min-w-0 text-xs text-muted-foreground" id="outlet-hint">{outletHint}</p>:null}
      {ownerLabel?<HelpHint label="Penjelasan filter tabel"><p>{ownerLabel} diatur dari tombol filter di atas tabel; pilihan itu tetap dipakai saat periode diterapkan.</p></HelpHint>:null}
    </div>:null}
  </div>;
}

function ScopeBar({filters,tenantName,tenantStatus,generatedAt,actualRoute}:{filters:PlatformFilters;tenantName?:string;tenantStatus?:string;generatedAt:Date;actualRoute:string}){
  const label=formatRangeLabel(filters.range);const chips:{label:string;href:string}[]=[];
  if(filters.courier)chips.push({label:`Kurir: ${courierDisplayName(filters.courier)}`,href:buildPlatformHref(actualRoute,filters,{courier:null,page:1})});
  if(filters.status)chips.push({label:`Status: ${statusLabels[filters.status]}`,href:buildPlatformHref(actualRoute,filters,{status:null,page:1})});
  if(filters.outcome)chips.push({label:`Hasil: ${auditOutcomeLabel(filters.outcome).label}`,href:buildPlatformHref(actualRoute,filters,{outcome:null,page:1})});
  return (
    <section aria-label="Lingkup data" className="flex min-w-0 flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <strong className="font-medium">Lingkup: {filters.scope.kind==="global"?"Global":tenantName??"Tenant"}</strong>
        {tenantStatus?<ToneBadge label={tenantStatusLabel(tenantStatus)} tone={tenantStatusTone(tenantStatus)}/>:null}
        <span className="text-muted-foreground">Periode: {label.periodLabel} · {label.timezoneLabel}</span>
        <span className="text-muted-foreground">Data per {formatInZone(generatedAt,filters.range.timezone)}</span>
      </div>
      {chips.length?<div className="flex flex-wrap gap-2">{chips.map(c=><Button asChild className="min-h-11 md:min-h-10" key={c.label} variant="outline"><Link aria-label={`Hapus filter ${c.label}`} href={c.href} prefetch={false}>{c.label} ×</Link></Button>)}</div>:null}
    </section>
  );
}

function Degraded({name}:{name:string}){return <Alert variant="destructive" role="alert"><AlertTitle>{name} tidak tersedia</AlertTitle><AlertDescription>Bagian ini gagal dimuat, tetapi data lain di halaman tetap dapat digunakan. Muat ulang untuk mencoba kembali.</AlertDescription></Alert>}

/**
 * shadcn Table in a named, keyboard-scrollable region (spec 10 §1.6). On the
 * ground it is the white card surface; inside a Card it has no outer frame.
 * The first column stays pinned while the rest scrolls, so it needs an opaque
 * card background (the header row is already opaque `--muted`).
 */
function TableRegion({caption,id,children,surface="background",desktopOnly}:{caption:string;id:string;children:ReactNode;surface?:"background"|"card";desktopOnly?:boolean}){
  return (
    <Table
      data-pin-first-column=""
      className="[&_th]:px-3 [&_td]:px-3 [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-20 [&_tbody_tr>*:first-child]:sticky [&_tbody_tr>*:first-child]:left-0 [&_tbody_tr>*:first-child]:z-10 [&_tbody_tr>*:first-child]:bg-card"
      containerClassName={cn("min-w-0",surface==="card"?"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring":dataTableSurfaceClassName,desktopOnly&&desktopTableClassName)}
      containerProps={{"aria-labelledby":id,role:"region",tabIndex:0}}
    >
      <TableCaption className="sr-only" id={id}>{caption}</TableCaption>
      {children}
    </Table>
  );
}
const batchStatusLabel=(status:string)=>Object.hasOwn(PROVIDER_BATCH_STATUS_LABELS,status)?PROVIDER_BATCH_STATUS_LABELS[status as keyof typeof PROVIDER_BATCH_STATUS_LABELS]:"Status lain";
/** Provider response sentences may carry an unbroken code; let them break so the submission table fits at 1440. */
const wrapCellClass="min-w-24 max-w-40 whitespace-normal wrap-anywhere";
function Head({children,numeric}:{children:ReactNode;numeric?:boolean}){return <TableHead className={numeric?"text-right whitespace-normal":undefined} scope="col">{children}</TableHead>}
function RowHead({children}:{children:ReactNode}){return <TableHead className="h-auto py-3 text-sm font-medium" scope="row">{children}</TableHead>}
function HeaderRow({children}:{children:ReactNode}){return <TableHeader><TableRow className="hover:bg-transparent">{children}</TableRow></TableHeader>}

/** Page-level section: an h2 with its muted description, spaced rather than ruled. */
function Section({id,title,description,badge,children,className}:{id:string;title:ReactNode;description?:ReactNode;badge?:ReactNode;children:ReactNode;className?:string}){
  return (
    <section aria-labelledby={id} className={cn("grid min-w-0 gap-4",className)}>
      <div className="grid gap-1">
        {/* T-206 reference: a list heading carries its count as a neutral badge. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold" id={id}>{title}</h2>
          {badge}
        </div>
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
      <CardHeader><h3 className="font-heading text-base leading-snug font-semibold" data-slot="card-title">{title}</h3></CardHeader>
      <CardContent className="grid min-w-0 gap-3">{children}</CardContent>
    </Card>
  );
}

function Empty({title,description}:{title:string;description:string}){return <div className={emptyClass}><h3 className="text-sm font-medium">{title}</h3><p className={hintClass}>{description}</p></div>}

/** Labelled native disclosure for secondary content (T-203): collapsed rows stay in the document and reachable. */
function Disclosure({summary,children,open}:{summary:ReactNode;children:ReactNode;open?:boolean}){
  return (
    <details className="min-w-0" open={open}>
      <summary className="min-h-11 w-fit cursor-pointer content-center rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-10">{summary}</summary>
      <div className="grid min-w-0 gap-4 pt-3">{children}</div>
    </details>
  );
}

/** Inside a Card the record list is not a second card (spec 10 §1.6): no fill or shadow, rules run edge to edge. */
const inCardRecordListClassName="-mx-(--card-spacing) rounded-none bg-transparent shadow-none";

/**
 * Spec 10 §6/§9: below `md` the rows render as a RecordList; the caller's table carries `desktopOnly`.
 * `visible` caps the rows shown before a labelled disclosure (tenant detail length, T-203).
 */
function MobileRecords<T>({label,rows,render,inCard,visible,moreLabel}:{label:string;rows:readonly T[];render:(row:T,index:number)=>ReactNode;inCard?:boolean;visible?:number;moreLabel?:(count:number)=>string}){
  const head=visible===undefined?rows:rows.slice(0,visible);
  const rest=visible===undefined?[]:rows.slice(visible);
  const listClass=inCard?inCardRecordListClassName:undefined;
  return <>
    <RecordList className={listClass} label={label}>{head.map((row,index)=>render(row,index))}</RecordList>
    {rest.length?<div className="min-w-0 md:hidden"><Disclosure summary={moreLabel?moreLabel(rest.length):`Tampilkan ${formatCount(rest.length)} lainnya`}><RecordList className={listClass} label={`${label} lainnya`}>{rest.map((row,index)=>render(row,head.length+index))}</RecordList></Disclosure></div>:null}
  </>;
}
/** Rows shown on a phone before "Tampilkan … lainnya" on the tenant detail page. */
const DETAIL_MOBILE_ROWS=5;
const recordTitleLinkClass="inline-flex min-h-11 items-center wrap-anywhere text-primary underline-offset-4 hover:underline focus-visible:underline";

/** On the tenant detail page secondary regions sit behind a labelled disclosure; elsewhere they render as is. */
function wrapSecondary(collapse:boolean|undefined,summary:string,children:ReactNode){return collapse?<Disclosure summary={summary}>{children}</Disclosure>:children}

function Health({health,filters,collapse}:{health:PlatformHealth;filters:PlatformFilters;collapse?:boolean}){
  const tiles:{label:string;icon:LucideIcon;tile:{count:number;severity:string;affectedTenants:number};detail:string}[]=[
    {label:"Pengajuan tertahan",icon:Hourglass,tile:health.queue,detail:`Terlama ${formatDuration(health.queue.oldestMs)}`},
    {label:"Menunggu pembayaran",icon:Wallet,tile:health.unpaid,detail:`${health.unpaid.recovering} pemulihan berjalan`},
    {label:"Status tidak diketahui",icon:CircleQuestionMark,tile:health.unknown,detail:`${health.unknown.batches} pengajuan · ${health.unknown.orders} pesanan · ${health.unknown.recoveries} pemulihan`},
    {label:"Kegagalan provider",icon:TriangleAlert,tile:health.failures,detail:`${Math.round(health.failures.share*100)}% dari pengajuan dalam periode`},
  ];
  return (
    <Section description="Antrean saat ini; kegagalan dan durasi mengikuti periode." id="platform-health-title" title="Kesehatan provider dan antrean">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({label,icon,tile,detail})=>(
          <StatCard
            description={<span className="grid justify-items-start gap-1.5"><span>{detail}{filters.scope.kind==="global"?` · ${formatCount(tile.affectedTenants)} tenant terdampak`:""}</span><ToneBadge label={severityLabel(tile.severity)} tone={severityTone(tile.severity)} /></span>}
            icon={icon}
            key={label}
            title={label}
            value={formatCount(tile.count)}
          />
        ))}
      </div>
      {wrapSecondary(collapse,"Durasi penyelesaian dan antrean per akun",<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-7">
        <SubCard className="lg:col-span-3" title="Durasi penyelesaian pengajuan">
          <dl className="grid grid-cols-2 gap-3">
            <div className="grid gap-1"><dt className="text-xs font-medium text-muted-foreground">Median</dt><dd className="text-2xl font-bold tabular-nums">{health.latency.p50Seconds===null?"—":formatDuration(health.latency.p50Seconds*1000)}</dd></div>
            <div className="grid gap-1"><dt className="text-xs font-medium text-muted-foreground">95% selesai dalam</dt><dd className="text-2xl font-bold tabular-nums">{health.latency.p95Seconds===null?"—":formatDuration(health.latency.p95Seconds*1000)}</dd></div>
          </dl>
          <p className={hintClass}>Dari percobaan kirim sampai pengajuan selesai; bukan waktu respons provider.</p>
        </SubCard>
        <SubCard className="lg:col-span-4" title="Antrean per akun provider">
          {health.accounts.length?(
            <TableRegion caption="Antrean per akun provider" id="account-queue" surface="card">
              <HeaderRow><Head>Akun</Head><Head>Kurir</Head><Head numeric>Menunggu</Head><Head>Terlama</Head></HeaderRow>
              <TableBody>{health.accounts.map(a=><TableRow key={`${a.bucket}-${a.courier}`}><RowHead>Akun provider #{a.bucket}</RowHead><TableCell>{courierDisplayName(a.courier)}</TableCell><TableCell className={numericClass}>{formatCount(a.waiting)}</TableCell><TableCell>{formatDuration(a.oldestMs)}</TableCell></TableRow>)}</TableBody>
            </TableRegion>
          ):<p className={hintClass}>Tidak ada antrean provider.</p>}
          <p className={hintClass}>#N adalah nomor urut anonim; identitas akun provider tidak ditampilkan.</p>
        </SubCard>
      </div>)}
    </Section>
  );
}

function Counts({counts,previous,filters,collapse}:{counts:PlatformCounts;previous:Awaited<ReturnType<typeof readPreviousPeriodHeadline>>|null;filters:PlatformFilters;collapse?:boolean}){
  const groups:{title:string;icon:LucideIcon;rows:[string,number][]}[]=[
    ...(filters.scope.kind==="global"?[{title:"Tenant",icon:Building2,rows:[["Aktif",counts.tenants.active],["Ditangguhkan",counts.tenants.suspended],["Disiapkan",counts.tenants.provisioning],["Diarsipkan",counts.tenants.archived],["Tenant baru",counts.tenants.newInRange]] as [string,number][]}]:[]),
    {title:"Outlet",icon:Store,rows:[["Outlet",counts.outlets.total],["Konfigurasi lengkap",counts.outlets.configured],["Koneksi privat aktif",counts.outlets.privateConnections],["Bawaan platform",counts.outlets.platformDefault],["Belum lengkap",counts.outlets.incomplete]] as [string,number][]},
    {title:"Keanggotaan",icon:Users,rows:[["Anggota aktif",counts.memberships.active],["Tenant Admin",counts.memberships.tenantAdmins],["Operator",counts.memberships.operators],["Ditangguhkan",counts.memberships.suspended]] as [string,number][]},
    {title:"Siklus kiriman",icon:Package,rows:[["Kiriman dibuat",counts.lifecycle.shipments],["Pengajuan",counts.lifecycle.batches],["Pengajuan selesai",counts.lifecycle.batchesCompleted],["Pengajuan gagal",counts.lifecycle.batchesFailed],["Resi terbit",counts.lifecycle.issued],["Belum dibayar",counts.lifecycle.unpaid],["Status tidak diketahui",counts.lifecycle.unknown],["Pemulihan selesai",counts.lifecycle.recoveriesCompleted],["Permintaan estimasi",counts.lifecycle.estimates]] as [string,number][]},
  ];
  const comparison=(label:string,value:number)=>previous&&label==="Kiriman dibuat"?<span className="block">{value-previous.created>=0?"+":""}{formatCount(value-previous.created)} vs periode sebelumnya</span>:null;
  return (
    <Section id="platform-volume-title" title="Volume operasional">
      <div className={cn("grid items-start gap-4 sm:grid-cols-2",filters.scope.kind==="global"?"lg:grid-cols-4":"lg:grid-cols-3")}>
        {groups.map(({title,icon,rows:[[headlineLabel,headline],...rest]})=>(
          <StatCard
            className="h-auto"
            description={<>{headlineLabel}{comparison(headlineLabel,headline)}</>}
            footer={<div className="w-full">{wrapSecondary(collapse,`Rincian ${title.toLowerCase()} (${rest.length})`,<dl className="grid w-full text-sm">{rest.map(([label,value])=><div className="flex items-center justify-between gap-4 border-t py-2 first:border-0" key={label}><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-semibold text-foreground tabular-nums">{formatCount(value)}</dd></div>)}</dl>)}</div>}
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
        <Disclosure summary={`Lihat tabel data (${formatCount(rows.length)} baris)`}>
            <TableRegion caption={`Tren ${filters.range.granularity} · ${label.periodLabel} · ${label.timezoneLabel}`} id="trend-caption" surface="card">
              <HeaderRow><Head>{filters.range.granularity==="harian"?"Tanggal":"Bulan"}</Head><Head numeric>Kiriman dibuat</Head><Head numeric>Resi terbit</Head><Head numeric>Pengajuan gagal</Head><Head numeric>Belum dibayar</Head></HeaderRow>
              <TableBody>{rows.map(r=><TableRow key={r.key}><RowHead>{r.label}</RowHead><TableCell className={numericClass}>{formatCount(r.created)}</TableCell><TableCell className={numericClass}>{formatCount(r.issued)}</TableCell><TableCell className={numericClass}>{formatCount(r.failed)}</TableCell><TableCell className={numericClass}>{formatCount(r.unpaid)}</TableCell></TableRow>)}</TableBody>
            </TableRegion>
        </Disclosure>
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
  const tenantHref=(r:TenantUsageRow)=>`/platform/tenant/${r.tenantId}?rentang=${filters.range.presetId}&tz=${encodeURIComponent(filters.range.timezone)}`;
  // The counts that ask for a look; a tenant without any reads plainly.
  const issues=(r:TenantUsageRow)=>[[r.failed,"gagal"],[r.unknown,"tidak diketahui"],[r.unpaid,"belum dibayar"]].filter(([count])=>Number(count)>0).map(([count,word])=>`${formatCount(Number(count))} ${word}`).join(" · ");
  const table=data.rows.length?(<>
    <MobileRecords inCard={overview} label={`Penggunaan tenant · ${label.periodLabel}`} render={r=><RecordItem
      key={r.tenantId}
      meta={r.lastActivityAt?formatInZone(r.lastActivityAt,filters.range.timezone):"Belum ada aktivitas"}
      primary={`${formatCount(r.shipments)} kiriman · ${formatCount(r.issued)} resi terbit · ${formatCount(r.batches)} pengajuan`}
      secondary={`Outlet lengkap ${r.outletConfigured}/${r.outletTotal} · ${formatCount(r.members)} anggota`}
      status={<ToneBadge label={tenantStatusLabel(r.status)} tone={tenantStatusTone(r.status)}/>}
      title={<Link className={recordTitleLinkClass} href={tenantHref(r)} prefetch={false}>{r.name}</Link>}
      value={issues(r)||undefined}
    />} rows={data.rows}/>
    <TableRegion caption={`Penggunaan tenant · ${label.periodLabel} · ${label.timezoneLabel}`} desktopOnly id="tenant-caption" surface={overview?"card":"background"}>
      <HeaderRow><Head>Tenant</Head><Head>Status</Head><Head numeric>Outlet</Head><Head numeric>Anggota</Head><Head numeric>Kiriman</Head><Head numeric>Pengajuan</Head><Head numeric>Resi</Head><Head numeric>Belum dibayar</Head><Head numeric>Gagal</Head><Head numeric>Tidak diketahui</Head><Head>Aktivitas terakhir</Head></HeaderRow>
      <TableBody>{data.rows.map(r=><TableRow key={r.tenantId}><RowHead><Link className="inline-flex min-h-11 min-w-28 max-w-48 items-center whitespace-normal wrap-anywhere text-primary underline-offset-4 hover:underline focus-visible:underline" href={tenantHref(r)} prefetch={false}>{r.name}</Link></RowHead><TableCell><ToneBadge label={tenantStatusLabel(r.status)} tone={tenantStatusTone(r.status)}/></TableCell><TableCell className={numericClass}>{r.outletConfigured}/{r.outletTotal}</TableCell><TableCell className={numericClass}>{formatCount(r.members)}</TableCell><TableCell className={numericClass}>{formatCount(r.shipments)}</TableCell><TableCell className={numericClass}>{formatCount(r.batches)}</TableCell><TableCell className={numericClass}>{formatCount(r.issued)}</TableCell><TableCell className={numericClass}>{formatCount(r.unpaid)}</TableCell><TableCell className={numericClass}>{formatCount(r.failed)}</TableCell><TableCell className={numericClass}>{formatCount(r.unknown)}</TableCell><TableCell>{r.lastActivityAt?formatInZone(r.lastActivityAt,filters.range.timezone):"—"}</TableCell></TableRow>)}</TableBody>
    </TableRegion>
  </>):<Empty description={filtered?"Ubah atau hapus filter untuk menampilkan tenant lain.":"Buat tenant pertama untuk memulai konfigurasi platform."} title={filtered?"Tidak ada hasil filter":"Belum ada tenant"}/>;
  const description="Tenant dengan kegagalan atau status tidak diketahui tampil lebih dulu.";
  if(overview){
    return (
      <CardSection action={<Button asChild className={secondaryLinkClass} variant="outline"><Link href={buildPlatformHref(route,filters,{page:1,query:null})} prefetch={false}>Lihat semua tenant</Link></Button>} description={description} id="platform-usage-title" title="Penggunaan per tenant">
        {table}
      </CardSection>
    );
  }
  const clearStatus={status:null};const clearCourier={courier:null};
  const facets:DataTableFacet[]=[
    tenantFacet(route,filters,options),
    {title:"Status",searchPlaceholder:facetSearch(shipmentStatuses.length,"Cari status"),clearHref:buildPlatformHref(route,filters,{...clearStatus,page:1}),options:shipmentStatuses.map(s=>facetOption(route,filters,statusLabels[s],filters.status===s,{status:s},clearStatus))},
    {title:"Kurir",searchPlaceholder:facetSearch(options.couriers.length,"Cari kurir"),clearHref:buildPlatformHref(route,filters,{...clearCourier,page:1}),options:options.couriers.map(c=>facetOption(route,filters,courierDisplayName(c),filters.courier===c,{courier:c},clearCourier))},
  ];
  const pages=Math.max(1,Math.ceil(data.total/PAGE_SIZE));
  return (
    <Section badge={<Badge variant="secondary"><span className="tabular-nums">{formatCount(data.total)}</span> tenant</Badge>} description={description} id="platform-usage-title" title="Penggunaan per tenant">
      <DataTableToolbar facets={facets} isFiltered={filtered} resetHref={buildPlatformHref(route,filters,{courier:null,outletId:null,page:1,query:null,scope:{kind:"global"},status:null})}/>
      {table}
      <DataTablePagination hrefForPage={page=>buildPlatformHref(route,filters,{page})} label="Navigasi halaman tenant" page={filters.page} summary={`${formatCount(data.total)} tenant`} totalCount={data.total} totalPages={pages}/>
    </Section>
  );
}

function Audit({data,filters,overview,route,options}:{data:{rows:AuditRow[];total:number};filters:PlatformFilters;overview:boolean;route:string;options:FilterOptions}){
  const label=formatRangeLabel(filters.range);
  // Only the audit route accepts `hasil` and a tenant choice; on a tenant's
  // detail page the scope is the route itself, so there is nothing to facet.
  const auditRoute=route==="/platform/audit";
  const tenantDetail=!overview&&!auditRoute;
  const statusChange=(r:AuditRow)=>r.fromStatus||r.toStatus?`${tenantStatusLabel(r.fromStatus)} → ${tenantStatusLabel(r.toStatus)}`:null;
  const table=data.rows.length?(<>
    <MobileRecords inCard={overview} label={`Jejak audit · ${label.periodLabel}`} moreLabel={count=>`Tampilkan ${formatCount(count)} aktivitas lainnya`} render={r=>{const outcome=auditOutcomeLabel(r.outcome);return <RecordItem
      key={r.id}
      meta={formatInZone(r.createdAt,filters.range.timezone)}
      primary={statusChange(r)??undefined}
      secondary={`${r.actorRole?auditActorLabel(r.actorRole):"Peran pelaku tidak tersedia"} · ${r.tenantName??"Platform"}`}
      status={<ToneBadge label={outcome.label} tone={outcome.tone}/>}
      title={auditActionSentence(r)}
    />;}} rows={data.rows} visible={tenantDetail?DETAIL_MOBILE_ROWS:undefined}/>
    <TableRegion caption={`Jejak audit · ${label.periodLabel} · ${label.timezoneLabel}`} desktopOnly id="audit-caption" surface={overview?"card":"background"}>
      <HeaderRow><Head>Waktu</Head><Head>Aksi</Head><Head>Hasil</Head><Head>Tenant</Head><Head>Detail aman</Head></HeaderRow>
      <TableBody>{data.rows.map(r=>{const outcome=auditOutcomeLabel(r.outcome);return <TableRow key={r.id}><TableCell>{formatInZone(r.createdAt,filters.range.timezone)}</TableCell><RowHead>{auditActionSentence(r)}</RowHead><TableCell><ToneBadge label={outcome.label} tone={outcome.tone}/></TableCell><TableCell>{r.tenantName??"Platform"}</TableCell><TableCell><details><summary className="min-h-11 cursor-pointer content-center font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Lihat detail</summary><dl className="grid min-w-48 gap-2 pb-3 text-sm"><div><dt className="text-muted-foreground">Peran pelaku</dt><dd>{r.actorRole?auditActorLabel(r.actorRole):"Tidak tersedia"}</dd></div><div><dt className="text-muted-foreground">Perubahan status tenant</dt><dd>{statusChange(r)??"Tidak ada"}</dd></div></dl></details></TableCell></TableRow>;})}</TableBody>
    </TableRegion>
  </>):<Empty description="Tidak ada event yang cocok dengan periode dan hasil terpilih." title="Belum ada aktivitas audit"/>;
  const description="Tidak dapat diubah; tanpa kredensial atau data pribadi.";
  if(overview){
    return (
      <CardSection action={<Button asChild className={secondaryLinkClass} variant="outline"><Link href={buildPlatformHref("/platform/audit",filters,{page:1,outcome:null,query:null})} prefetch={false}>Lihat semua aktivitas audit</Link></Button>} description={description} id="platform-audit-title" title="Jejak audit">
        {table}
      </CardSection>
    );
  }
  const clearOutcome={outcome:null};
  const facets:DataTableFacet[]=auditRoute?[
    {title:"Hasil",clearHref:buildPlatformHref(route,filters,{...clearOutcome,page:1}),options:([["SUCCESS","Berhasil"],["DENIED","Ditolak"]] as const).map(([value,text])=>facetOption(route,filters,text,filters.outcome===value,{outcome:value},clearOutcome))},
    tenantFacet(route,filters,options),
  ]:[];
  const pages=Math.max(1,Math.ceil(data.total/PAGE_SIZE));
  return (
    <Section badge={<Badge variant="secondary"><span className="tabular-nums">{formatCount(data.total)}</span> entri</Badge>} description={description} id="platform-audit-title" title="Jejak audit">
      {auditRoute?<DataTableToolbar facets={facets} isFiltered={Boolean(filters.outcome||filters.scope.kind==="tenant")} resetHref={buildPlatformHref(route,filters,{outcome:null,outletId:null,page:1,scope:{kind:"global"}})}/>:null}
      {table}
      <DataTablePagination hrefForPage={page=>buildPlatformHref(route,filters,{page})} label="Navigasi halaman audit" page={filters.page} summary={`${formatCount(data.total)} aktivitas`} totalCount={data.total} totalPages={pages}/>
    </Section>
  );
}

function TenantDetail({detail,filters}:{detail:Detail;filters:PlatformFilters}){
  return <>
    <CardSection description={`${detail.outlets.length} outlet · status koneksi ditampilkan tanpa nilai kredensial.`} id="tenant-outlet-title" title="Konfigurasi outlet">
      {detail.outlets.length?(<>
        <MobileRecords inCard label="Konfigurasi outlet" moreLabel={count=>`Tampilkan ${formatCount(count)} outlet lainnya`} render={o=><RecordItem
          key={o.id}
          meta={`Diperbarui ${formatInZone(o.updatedAt,filters.range.timezone)}`}
          primary={`Alamat pickup ${o.hasPickup?"terisi":"kosong"} · area asal ${o.hasOrigin?"terisi":"kosong"}`}
          secondary={`Kredensial: ${o.hasPrivateConnection?"Privat aktif":"Bawaan platform"}`}
          title={o.name}
        />} rows={detail.outlets} visible={DETAIL_MOBILE_ROWS}/>
        <TableRegion caption="Konfigurasi outlet tanpa nilai kredensial" desktopOnly id="outlet-caption" surface="card">
          <HeaderRow><Head>Outlet</Head><Head>Alamat pickup</Head><Head>Area asal</Head><Head>Sumber kredensial</Head><Head>Diperbarui</Head></HeaderRow>
          <TableBody>{detail.outlets.map(o=><TableRow key={o.id}><RowHead>{o.name}</RowHead><TableCell>{o.hasPickup?"Terisi":"Kosong"}</TableCell><TableCell>{o.hasOrigin?"Terisi":"Kosong"}</TableCell><TableCell>{o.hasPrivateConnection?"Privat aktif":"Bawaan platform"}</TableCell><TableCell>{formatInZone(o.updatedAt,filters.range.timezone)}</TableCell></TableRow>)}</TableBody>
        </TableRegion>
      </>):<Empty description="Tenant belum memiliki outlet untuk dikonfigurasi atau dipantau." title="Belum ada outlet"/>}
    </CardSection>
    <CardSection id="tenant-batch-title" title="Pengajuan ke provider terbaru">
      {detail.batches.length?(<>
        <MobileRecords inCard label="Pengajuan ke provider terbaru" moreLabel={count=>`Tampilkan ${formatCount(count)} pengajuan lainnya`} render={b=><RecordItem
          key={b.id}
          meta={b.completedAt?`Selesai ${formatInZone(b.completedAt,filters.range.timezone)}`:`Dicoba ${b.submissionAttemptedAt?formatInZone(b.submissionAttemptedAt,filters.range.timezone):"—"}`}
          primary={`${courierDisplayName(b.courier)} · ${b.credentialSource==="private"?"Privat aktif":"Bawaan platform"}`}
          secondary={`Akun provider #${b.providerAccountBucket}${b.safeErrorCode?` · ${providerResponseLabel(b.safeErrorCode)}`:""}`}
          status={<ToneBadge label={batchStatusLabel(b.status)} tone={batchTone(b.status)}/>}
          title={<>Pengajuan <span className="font-mono">{formatShortId(b.id)}</span></>}
        />} rows={detail.batches} visible={DETAIL_MOBILE_ROWS}/>
        <TableRegion caption="Pengajuan ke provider terbaru; identitas akun dianonimkan" desktopOnly id="batch-caption" surface="card">
          <HeaderRow><Head>Pengajuan</Head><Head>Kurir</Head><Head>Sumber</Head><Head>Status</Head><Head>Kode aman</Head><Head>Akun</Head><Head>Waktu</Head></HeaderRow>
          <TableBody>{detail.batches.map(b=><TableRow key={b.id}><RowHead>{formatShortId(b.id)}</RowHead><TableCell>{courierDisplayName(b.courier)}</TableCell><TableCell>{b.credentialSource==="private"?"Privat aktif":"Bawaan platform"}</TableCell><TableCell className="min-w-24 max-w-40 whitespace-normal">{batchStatusLabel(b.status)}</TableCell><TableCell className={wrapCellClass}>{b.safeErrorCode?providerResponseLabel(b.safeErrorCode):"—"}</TableCell><TableCell>Akun provider #{b.providerAccountBucket}</TableCell><TableCell className="text-xs leading-5"><span className="block">Dicoba {b.submissionAttemptedAt?formatInZone(b.submissionAttemptedAt,filters.range.timezone):"—"}</span><span className="block text-muted-foreground">Selesai {b.completedAt?formatInZone(b.completedAt,filters.range.timezone):"—"}</span></TableCell></TableRow>)}</TableBody>
        </TableRegion>
      </>):<Empty description="Tidak ada pengajuan ke provider pada periode dan outlet terpilih." title="Belum ada pengajuan"/>}
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
    COD_SERVICE_FEE_VAT_PAYABLE: `${LEGACY_COD_FEE_VAT_LABEL} · entri lama`,
    NON_COD_UPSTREAM_PAYMENT: "Pembayaran non-COD",
    COD_REMITTANCE: "Remitansi COD",
  };
  const reconciliationKey=(row:Finance["reconciliations"][number],index:number)=>`${row.cadence}-${row.reconciledEntryType}-${row.periodStart.toISOString()}-${index}`;
  const matched=finance.reconciliations.filter(row=>row.status==="MATCHED").length;
  const variance=finance.reconciliations.filter(row=>row.status==="VARIANCE").length;
  const money=(value:number)=><span className="tabular-nums">{idrFormatter.format(value)}</span>;
  const withNote=(value:ReactNode,note:ReactNode)=><span className="grid gap-0.5">{value}<span className="text-xs font-normal text-muted-foreground">{note}</span></span>;
  // V-16: one card of labelled values instead of six stacked KPI cards (about 1,000px at 390).
  const ledger=[
    {label:"Entri",value:formatCount(finance.ledger.entryCount)},
    {label:"Pokok COD — liabilitas",value:withNote(money(finance.ledger.codPrincipalLiabilityIdr),"Bukan pendapatan GeraiCUAN.")},
    {label:"Biaya provider",value:money(finance.ledger.providerCostIdr)},
    {label:"Pendapatan jasa COD (entri lama)",value:withNote(money(finance.ledger.revenueIdr),"Entri lama. Biaya COD kini dicatat sebagai biaya provider karena dipotong Mengantar.")},
    {label:LEGACY_COD_FEE_VAT_LABEL,value:withNote(money(finance.ledger.legacyCodFeeVatIdr),LEGACY_COD_FEE_VAT_NOTE)},
    {label:"Pemulihan non-COD",value:money(finance.ledger.upstreamRecoveryPaymentIdr)},
  ];
  return (
    <Section description={`${label.periodLabel} · ${label.timezoneLabel}. Hanya agregat; tanpa identitas kiriman, penerima, atau kredensial.`} id="finance-summary-title" title="Keuangan dan rekonsiliasi">
      <Card className="min-w-0 gap-2">
        <CardHeader><h3 className="font-heading text-base leading-snug font-semibold" data-slot="card-title" id="finance-ledger-title">Catatan keuangan operasional</h3></CardHeader>
        <CardContent className="min-w-0"><DefinitionGrid items={ledger}/></CardContent>
      </Card>
      <section aria-labelledby="finance-reconciliation-title" className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-2 text-sm font-medium" id="finance-reconciliation-title">Hasil rekonsiliasi terbaru</h3>
          <ToneBadge label={`Cocok ${formatCount(matched)}`} tone="neutral"/>
          <ToneBadge label={`Selisih ${formatCount(variance)}`} tone={variance?"warn":"neutral"}/>
        </div>
        {finance.reconciliations.length ? (<>
          <MobileRecords label="Rekonsiliasi terbaru" moreLabel={count=>`Tampilkan ${formatCount(count)} hasil lainnya`} render={(row,index)=><RecordItem
            key={reconciliationKey(row,index)}
            primary={`${formatInZone(row.periodStart,filters.range.timezone)} – ${formatInZone(row.periodEnd,filters.range.timezone)}`}
            secondary={`${row.cadence==="DAILY"?"Harian":"Bulanan"} · sumber ${idrFormatter.format(row.sourceTotalIdr)} · tercatat ${idrFormatter.format(row.ledgerTotalIdr)}`}
            status={row.status==="MATCHED"?<ToneBadge label="Cocok" tone="ok"/>:<ToneBadge label="Selisih" tone="warn"/>}
            title={entryLabels[row.reconciledEntryType]??"Entri lain"}
            value={`Selisih ${signedIdrFormatter.format(row.varianceIdr)}`}
          />} rows={finance.reconciliations} visible={DETAIL_MOBILE_ROWS}/>
          <TableRegion caption={`Rekonsiliasi terbaru · ${label.periodLabel} · ${label.timezoneLabel}`} desktopOnly id="reconciliation-caption">
            <HeaderRow><Head>Periode</Head><Head>Klasifikasi</Head><Head>Irama</Head><Head numeric>Sumber</Head><Head numeric>Tercatat</Head><Head numeric>Selisih</Head><Head>Hasil</Head></HeaderRow>
            <TableBody>{finance.reconciliations.map((row,index)=><TableRow key={reconciliationKey(row,index)}><TableCell>{formatInZone(row.periodStart,filters.range.timezone)} – {formatInZone(row.periodEnd,filters.range.timezone)}</TableCell><RowHead>{entryLabels[row.reconciledEntryType]??"Entri lain"}</RowHead><TableCell>{row.cadence==="DAILY"?"Harian":"Bulanan"}</TableCell><TableCell className={numericClass}>{idrFormatter.format(row.sourceTotalIdr)}</TableCell><TableCell className={numericClass}>{idrFormatter.format(row.ledgerTotalIdr)}</TableCell><TableCell className={numericClass}>{signedIdrFormatter.format(row.varianceIdr)}</TableCell><TableCell>{row.status==="MATCHED"?<ToneBadge label="Cocok" tone="ok"/>:<ToneBadge label="Selisih" tone="warn"/>}</TableCell></TableRow>)}</TableBody>
          </TableRegion>
        </>) : <p className={hintClass}>Belum ada hasil rekonsiliasi pada periode dan outlet terpilih.</p>}
      </section>
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
    const results=[await settle(()=>readPlatformHealth(tx,parsed.filters,now)),await settle(()=>readPlatformCounts(tx,parsed.filters)),await settle(()=>readPreviousPeriodHeadline(tx,parsed.filters)),await settle(()=>readTrend(tx,parsed.filters)),await settle(()=>listTenantUsage(tx,parsed.filters,limit)),await settle(()=>listAuditEvents(tx,parsed.filters,limit)),await settle(async()=>kind==="tenant-detail"?readTenantDetail(tx,parsed.filters):null),await settle(async()=>kind==="tenant-detail"?readPlatformTenantFinanceSummary(tx,parsed.filters):null)] as const;
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
  // Ten pages past whatever the database holds, so the scenario always differs from the base
  // route: a `Math.max(60, total)` floor stopped taking effect once the seed held 72 events.
  if(auditScenario==="platform-audit-paginated"&&audit)audit={...audit,total:audit.total+PAGE_SIZE*10};
  const filters=data.parsed.filters;const actualRoute=tenantId?`/platform/tenant/${tenantId}`:route;
  await recordPlatformMonitoringAccess(db,principal.userId,{route,scope:detail?"tenant":filters.scope.kind,tenantId:detail?detail.tenant.id:filters.scope.kind==="tenant"?filters.scope.tenantId:undefined});
  const canonical=`${actualRoute}?${data.parsed.canonicalQuery.toString()}`;
  const shipmentPrefix=kind==="tenant-detail"&&detail?await loadPlatformTenantShipmentPrefix(db,principal.userId,detail.tenant.id).catch(()=>null):null;
  const titles:Record<PageKind,{eyebrow:string;title:string;intro:string}>={overview:{eyebrow:"Platform",title:"Ringkasan",intro:"Pantau antrean, kegagalan, volume, dan aktivitas lintas tenant."},"tenant-list":{eyebrow:"Platform",title:"Tenant",intro:"Temukan tenant dan bandingkan penggunaan operasional."},"tenant-detail":{eyebrow:"Tenant",title:detail?.tenant.name??"Detail tenant",intro:"Kondisi operasional dan konfigurasi aman tenant. Hanya konfigurasi aman yang ditampilkan; nilai kredensial tidak pernah ditampilkan."},audit:{eyebrow:"Platform",title:"Audit",intro:"Tinjau tindakan platform dan hasil yang ditolak."}};
  const title=titles[kind];
  const stale=auditScenario?.endsWith("-stale");
  const presentedAt=stale?new Date(data.now.getTime()-10*60_000):data.now;
  const scenarioInvalid=auditScenario?.endsWith("-invalid-query");
  const provisionState=auditScenario==="platform-tenant-provision-success"?{outcome:"success" as const,message:"Tenant audit berhasil dibuat."}:auditScenario==="platform-tenant-provision-error"?{outcome:"error" as const,message:"Pembuatan tenant gagal. Nilai aman dipertahankan.",values:{name:"Tenant audit"}}:undefined;
  const lifecycleState=auditScenario==="platform-tenant-detail-lifecycle-success"?{outcome:"success" as const,message:"Status tenant berhasil diperbarui."}:auditScenario==="platform-tenant-detail-lifecycle-error"?{outcome:"error" as const,message:"Perubahan status gagal. Nilai aman dipertahankan.",values:{expectedName:detail?.tenant.name}}:undefined;
  return <PageContainer><PageHeader description={title.intro} eyebrow={title.eyebrow} title={title.title}/>{data.parsed.issues.length||scenarioInvalid?<AlertRegion className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Alert role="presentation"><TriangleAlert aria-hidden="true"/><AlertTitle><h2>Filter disesuaikan</h2></AlertTitle><AlertDescription className="grid gap-3"><ul className="list-disc pl-5">{data.parsed.issues.map((issue,index)=><li key={`${issue}-${index}`}>{platformIssueMessage(issue)}</li>)}{scenarioInvalid?<li>Parameter URL tidak dikenal; filter aman tetap digunakan.</li>:null}</ul><Button asChild className="min-h-11 w-fit md:min-h-10" variant="outline"><Link href={canonical} prefetch={false}>Buka URL yang sudah dirapikan</Link></Button></AlertDescription></Alert></AlertRegion>:null}<ScopeBar actualRoute={actualRoute} filters={filters} generatedAt={presentedAt} tenantName={detail?.tenant.name} tenantStatus={detail?.tenant.status}/>
  {stale?<Alert role="alert" variant="destructive"><AlertTitle>Data platform mungkin sudah kedaluwarsa</AlertTitle><AlertDescription className="space-y-3"><p>Data terakhir melewati batas kesegaran. Data dianggap perlu diperbarui setelah {DATA_STALE_AFTER_MS/60_000} menit. Muat ulang sebelum mengambil keputusan siklus tenant.</p><Button asChild className="min-h-11 md:min-h-10" variant="outline"><Link href={canonical} prefetch={false}>Muat ulang data</Link></Button></AlertDescription></Alert>:null}
  {kind==="tenant-list"?<ProvisionTenantForm auditState={provisionState} initialAttemptId={randomUUID()}/>:null}
  <FilterPanel actualRoute={actualRoute} filters={filters} issues={data.parsed.issues} now={data.now} options={data.options} route={route}/>
  {kind==="overview"||kind==="tenant-detail"?(health?<Health collapse={kind==="tenant-detail"} filters={filters} health={health}/>:<Degraded name="Kesehatan provider dan antrean"/>):null}
  {kind==="overview"||kind==="tenant-detail"?(counts?<Counts collapse={kind==="tenant-detail"} counts={counts} filters={filters} previous={fulfilled(previousResult)}/>:<Degraded name="Volume operasional"/>):null}
  {kind==="tenant-detail"&&detail?<TenantDetail detail={detail} filters={filters}/>:null}
  {kind==="overview"||kind==="tenant-detail"?(trend?<Trend filters={filters} rows={trend}/>:<Degraded name="Tren"/>):null}
  {kind==="tenant-detail"?(finance?<FinanceSummary finance={finance} filters={filters}/>:<Degraded name="Keuangan dan rekonsiliasi"/>):null}
  {kind==="overview"||kind==="tenant-list"?(usage?<Usage data={usage} filters={filters} options={data.options} overview={kind==="overview"}/>:<Degraded name="Penggunaan per tenant"/>):null}
  {kind==="overview"||kind==="audit"||kind==="tenant-detail"?(audit?<Audit data={audit} filters={filters} options={data.options} overview={kind==="overview"} route={actualRoute}/>:<Degraded name="Jejak audit"/>):null}
  {/* Pattern 3 / V-36: tenant administration and the destructive lifecycle change close the page. */}
  {kind==="tenant-detail"&&detail?<ShipmentPrefixUnlockControl initialAttemptId={randomUUID()} state={shipmentPrefix} tenantId={detail.tenant.id} tenantName={detail.tenant.name}/>:null}
  {kind==="tenant-detail"&&detail?<TenantLifecycleControls auditState={lifecycleState} initialAttemptId={randomUUID()} status={detail.tenant.status} tenantId={detail.tenant.id} tenantName={detail.tenant.name}/>:null}</PageContainer>;
}
