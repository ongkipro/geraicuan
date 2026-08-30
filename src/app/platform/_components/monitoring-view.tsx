import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AlertRegion } from "@/app/_components/alert-region";
import { db } from "@/db/client";
import { recordPlatformMonitoringAccess, withPlatformContext } from "@/db/platform-context";
import {
  listAuditEvents,
  listTenantUsage,
  readFilterOptions,
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
import { shipmentStatuses } from "@/db/schema";
import {
  ANALYTICS_PRESETS,
  ANALYTICS_TIMEZONES,
  formatInZone,
  formatRangeLabel,
} from "@/lib/analytics-range";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import {
  buildPlatformHref,
  parsePlatformFilters,
  platformIssueMessage,
  type PlatformFilters,
  type PlatformRoute,
} from "@/lib/platform-monitoring-filters";
import { formatCount, formatDuration, formatShortId } from "@/lib/platform-monitoring-format";

type SearchParams = Record<string, string | string[] | undefined>;
type PageKind = "overview" | "tenant-list" | "tenant-detail" | "audit";
type PageInput = { kind: PageKind; route: PlatformRoute; rawParams: SearchParams; tenantId?: string };

type Detail = NonNullable<Awaited<ReturnType<typeof readTenantDetail>>>;

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

function currentValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function PlatformNav({ current }: { current: PageKind }) {
  const items = [
    { href: "/platform", label: "Ringkasan", active: current === "overview" },
    { href: "/platform/tenant", label: "Tenant", active: current === "tenant-list" || current === "tenant-detail" },
    { href: "/platform/audit", label: "Audit", active: current === "audit" },
  ];
  return <nav aria-label="CMS Platform" className="ops-nav">{items.map((item)=><Link aria-current={item.active?"page":undefined} href={item.href} key={item.href} prefetch={false}>{item.label}</Link>)}</nav>;
}

function FilterPanel({ filters, options, issues, route, actualRoute }: { filters:PlatformFilters;options:Awaited<ReturnType<typeof readFilterOptions>>;issues:string[];route:PlatformRoute;actualRoute:string }) {
  const nonDefault = filters.range.presetId!=="30-hari" || filters.range.timezone!=="Asia/Jakarta" || filters.scope.kind==="tenant" || filters.outletId || filters.courier || filters.status || filters.outcome || filters.query;
  return <details className="ops-filter" open={Boolean(nonDefault||issues.length)}>
    <summary>Filter &amp; periode</summary>
    <form action={actualRoute} method="get">
      <div className="ops-filter-grid">
        <label>Periode<select defaultValue={filters.range.presetId} name="rentang">{ANALYTICS_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label>Dari<input defaultValue={filters.range.startDate} name="dari" type="date" /></label>
        <label>Sampai<input defaultValue={filters.range.lastIncludedDate} name="sampai" type="date" /></label>
        <label>Zona waktu<select defaultValue={filters.range.timezone} name="tz">{ANALYTICS_TIMEZONES.map(z=><option key={z.id} value={z.id}>{z.label}</option>)}</select></label>
        {route!=="/platform/tenant/[tenantId]"?<label>Tenant<select defaultValue={filters.scope.kind==="tenant"?filters.scope.tenantId:""} name="tenant"><option value="">Semua tenant</option>{options.tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>:null}
        <label>Outlet<select aria-describedby="outlet-hint" defaultValue={filters.outletId??""} disabled={filters.scope.kind==="global"} name="outlet"><option value="">Semua outlet</option>{options.outlets.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><small id="outlet-hint">Pilih tenant lalu terapkan sebelum memilih outlet.</small></label>
        <label>Kurir<select defaultValue={filters.courier??""} name="kurir"><option value="">Semua kurir</option>{options.couriers.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        <label>Status<select defaultValue={filters.status??""} name="status"><option value="">Semua status</option>{shipmentStatuses.map(s=><option key={s} value={s}>{statusLabels[s]} ({s})</option>)}</select></label>
        {route==="/platform/audit"?<label>Hasil<select defaultValue={filters.outcome??""} name="hasil"><option value="">Semua hasil</option><option value="SUCCESS">Berhasil</option><option value="DENIED">Ditolak</option></select></label>:null}
        {route==="/platform/tenant"?<label>Cari tenant<input defaultValue={filters.query??""} maxLength={80} minLength={2} name="q" type="search" /></label>:null}
      </div>
      <div className="ops-filter-actions"><button className="sales-primary" type="submit">Terapkan</button><button className="sales-secondary" name="khusus" type="submit" value="1">Terapkan rentang kustom</button><Link className="sales-secondary" href={`${actualRoute}?rentang=30-hari&tz=Asia%2FJakarta`} prefetch={false}>Hapus filter</Link></div>
    </form>
  </details>;
}

function ScopeBar({filters,tenantName,generatedAt,actualRoute}:{filters:PlatformFilters;tenantName?:string;generatedAt:Date;actualRoute:string}){
  const label=formatRangeLabel(filters.range);const chips:{label:string;href:string}[]=[];
  if(filters.courier)chips.push({label:`Kurir: ${filters.courier}`,href:buildPlatformHref(actualRoute,filters,{courier:null,page:1})});
  if(filters.status)chips.push({label:`Status: ${statusLabels[filters.status]}`,href:buildPlatformHref(actualRoute,filters,{status:null,page:1})});
  if(filters.outcome)chips.push({label:`Hasil: ${filters.outcome}`,href:buildPlatformHref(actualRoute,filters,{outcome:null,page:1})});
  return <section aria-label="Lingkup data" className="ops-scope"><div><strong>Lingkup: {filters.scope.kind==="global"?"Global":tenantName??"Tenant"}</strong><span>Periode: {label.periodLabel} · {label.timezoneLabel}</span><span>Data per {formatInZone(generatedAt,filters.range.timezone)}</span></div>{chips.length?<div className="ops-chips">{chips.map(c=><Link aria-label={`Hapus filter ${c.label}`} className="ops-chip" href={c.href} key={c.label} prefetch={false}>{c.label} ×</Link>)}</div>:null}</section>;
}

function Degraded({name}:{name:string}){return <section className="ops-degraded" role="alert"><h2>{name}</h2><p>Data {name.toLocaleLowerCase("id-ID")} tidak dapat dimuat. Muat ulang halaman.</p></section>}
function TableRegion({caption,id,children}:{caption:string;id:string;children:ReactNode}){return <div aria-labelledby={id} className="bulk-scroll" role="region" tabIndex={0}><table className="bulk-table ops-table"><caption id={id}>{caption}</caption>{children}</table></div>}

function Health({health,filters}:{health:PlatformHealth;filters:PlatformFilters}){
  const tiles=[
    {label:"Batch tertahan di antrean",tile:health.queue,detail:`Terlama ${formatDuration(health.queue.oldestMs)}`},
    {label:"Pesanan menunggu pembayaran upstream",tile:health.unpaid,detail:`${health.unpaid.recovering} pemulihan berjalan`},
    {label:"Status pengiriman tidak diketahui",tile:health.unknown,detail:`${health.unknown.batches} batch · ${health.unknown.orders} pesanan · ${health.unknown.recoveries} pemulihan`},
    {label:"Kegagalan provider",tile:health.failures,detail:`${Math.round(health.failures.share*100)}% dari batch dalam periode`},
  ];
  return <section className="ops-section"><h2>Kesehatan provider dan antrean</h2><p className="bulk-hint">Saat ini — tidak terpengaruh filter periode. Kegagalan dan durasi tetap mengikuti periode.</p><ul className="ops-health">{tiles.map(({label,tile,detail})=><li className={`ops-tile ops-tile-${tile.severity}`} key={label}><span className={`ops-badge ops-badge-${tile.severity}`}>{tile.severity==="normal"?"Normal":tile.severity==="perhatian"?"Perhatian":"Kritis"}</span><h3>{label}</h3><strong>{formatCount(tile.count)}</strong><p>{detail}</p>{filters.scope.kind==="global"?<p>{formatCount(tile.affectedTenants)} tenant terdampak</p>:null}</li>)}</ul>
  <div className="ops-health-detail"><div><h3>Durasi penyelesaian batch</h3><dl><div><dt>p50</dt><dd>{health.latency.p50Seconds===null?"—":formatDuration(health.latency.p50Seconds*1000)}</dd></div><div><dt>p95</dt><dd>{health.latency.p95Seconds===null?"—":formatDuration(health.latency.p95Seconds*1000)}</dd></div></dl><p className="bulk-hint">Dari percobaan kirim sampai batch selesai; bukan latensi HTTP provider.</p></div><div><h3>Antrean per akun provider</h3>{health.accounts.length?<TableRegion caption="Antrean per akun provider" id="account-queue"><thead><tr><th scope="col">Akun</th><th scope="col">Kurir</th><th scope="col">Menunggu</th><th scope="col">Terlama</th></tr></thead><tbody>{health.accounts.map(a=><tr key={`${a.bucket}-${a.courier}`}><th scope="row">Akun provider #{a.bucket}</th><td>{a.courier}</td><td className="bulk-num">{formatCount(a.waiting)}</td><td>{formatDuration(a.oldestMs)}</td></tr>)}</tbody></TableRegion>:<p>Tidak ada antrean provider.</p>}<p className="bulk-hint">#N adalah nomor urut anonim; identitas akun provider tidak ditampilkan.</p></div></div></section>;
}

function Counts({counts,previous,filters}:{counts:PlatformCounts;previous:Awaited<ReturnType<typeof readPreviousPeriodHeadline>>|null;filters:PlatformFilters}){
  const groups=[
    ...(filters.scope.kind==="global"?[{title:"Tenant",rows:[["Aktif",counts.tenants.active],["Ditangguhkan",counts.tenants.suspended],["Provisioning",counts.tenants.provisioning],["Diarsipkan",counts.tenants.archived],["Tenant baru",counts.tenants.newInRange]] as [string,number][]}]:[]),
    {title:"Outlet",rows:[["Outlet",counts.outlets.total],["Konfigurasi lengkap",counts.outlets.configured],["Koneksi privat aktif",counts.outlets.privateConnections],["Default platform",counts.outlets.platformDefault],["Belum lengkap",counts.outlets.incomplete]] as [string,number][]},
    {title:"Keanggotaan",rows:[["Anggota aktif",counts.memberships.active],["Tenant Admin",counts.memberships.tenantAdmins],["Operator",counts.memberships.operators],["Ditangguhkan",counts.memberships.suspended]] as [string,number][]},
    {title:"Siklus kiriman",rows:[["Kiriman dibuat",counts.lifecycle.shipments],["Batch",counts.lifecycle.batches],["Batch selesai",counts.lifecycle.batchesCompleted],["Batch gagal",counts.lifecycle.batchesFailed],["Resi terbit",counts.lifecycle.issued],["Belum dibayar",counts.lifecycle.unpaid],["Status tidak diketahui",counts.lifecycle.unknown],["Pemulihan selesai",counts.lifecycle.recoveriesCompleted],["Permintaan estimasi",counts.lifecycle.estimates]] as [string,number][]},
  ];
  return <section className="ops-section"><h2>Volume operasional</h2><div className="ops-counts">{groups.map(g=><section className="ops-count-group" key={g.title}><h3>{g.title}</h3><dl>{g.rows.map(([label,value])=><div className="ops-figure" key={label}><dt>{label}</dt><dd>{formatCount(value)}{previous&&label==="Kiriman dibuat"?<small className="ops-delta">{value-previous.created>=0?"+":""}{formatCount(value-previous.created)} vs periode sebelumnya</small>:null}</dd></div>)}</dl></section>)}</div></section>;
}

function Trend({rows,filters}:{rows:TrendBucket[];filters:PlatformFilters}){const label=formatRangeLabel(filters.range);const max=Math.max(0,...rows.map(r=>r.issued));return <section className="ops-section"><h2>Tren {filters.range.granularity}</h2><TableRegion caption={`Tren ${filters.range.granularity} · ${label.periodLabel} · ${label.timezoneLabel}`} id="trend-caption"><thead><tr><th scope="col">{filters.range.granularity==="harian"?"Tanggal":"Bulan"}</th><th scope="col">Kiriman dibuat</th><th scope="col">Resi terbit</th><th scope="col">Gagal</th><th scope="col">Belum dibayar</th></tr></thead><tbody>{rows.map(r=><tr key={r.key}><th scope="row">{r.label}</th><td className="bulk-num">{formatCount(r.created)}</td><td className="bulk-num ops-bar" style={{"--ops-bar":max===0?0:r.issued/max} as CSSProperties}>{formatCount(r.issued)}</td><td className="bulk-num">{formatCount(r.failed)}</td><td className="bulk-num">{formatCount(r.unpaid)}</td></tr>)}</tbody></TableRegion></section>}

function Usage({data,filters,overview}:{data:{rows:TenantUsageRow[];total:number};filters:PlatformFilters;overview:boolean}){const label=formatRangeLabel(filters.range);return <section className="ops-section"><h2>Penggunaan per tenant</h2>{data.rows.length?<TableRegion caption={`Penggunaan tenant · ${label.periodLabel} · ${label.timezoneLabel}`} id="tenant-caption"><thead><tr><th scope="col">Tenant</th><th scope="col">Status</th><th scope="col">Outlet</th><th scope="col">Anggota</th><th scope="col">Kiriman</th><th scope="col">Batch</th><th scope="col">Resi</th><th scope="col">Belum dibayar</th><th scope="col">Gagal</th><th scope="col">Tidak diketahui</th><th scope="col">Aktivitas terakhir</th></tr></thead><tbody>{data.rows.map(r=><tr key={r.tenantId}><th scope="row"><Link href={`/platform/tenant/${r.tenantId}?rentang=${filters.range.presetId}&tz=${encodeURIComponent(filters.range.timezone)}`} prefetch={false}>{r.name}</Link></th><td><span className="ops-status">{tenantStatusLabels[r.status]}</span></td><td className="bulk-num">{r.outletConfigured}/{r.outletTotal}</td><td className="bulk-num">{formatCount(r.members)}</td><td className="bulk-num">{formatCount(r.shipments)}</td><td className="bulk-num">{formatCount(r.batches)}</td><td className="bulk-num">{formatCount(r.issued)}</td><td className="bulk-num">{formatCount(r.unpaid)}</td><td className="bulk-num">{formatCount(r.failed)}</td><td className="bulk-num">{formatCount(r.unknown)}</td><td>{r.lastActivityAt?formatInZone(r.lastActivityAt,filters.range.timezone):"—"}</td></tr>)}</tbody></TableRegion>:<p>Tidak ada tenant yang cocok dengan filter aktif.</p>}{overview?<Link href={buildPlatformHref("/platform/tenant",filters,{page:1,query:null})} prefetch={false}>Lihat semua tenant</Link>:<Pager route="/platform/tenant" filters={filters} total={data.total}/>}</section>}

function Audit({data,filters,overview,route}:{data:{rows:AuditRow[];total:number};filters:PlatformFilters;overview:boolean;route:string}){const label=formatRangeLabel(filters.range);return <section className="ops-section"><h2>Jejak audit</h2>{data.rows.length?<TableRegion caption={`Jejak audit · ${label.periodLabel} · ${label.timezoneLabel}`} id="audit-caption"><thead><tr><th scope="col">Waktu</th><th scope="col">Aksi</th><th scope="col">Hasil</th><th scope="col">Tenant</th><th scope="col">Peran aktor</th><th scope="col">Perubahan status</th></tr></thead><tbody>{data.rows.map(r=><tr key={r.id}><td>{formatInZone(r.createdAt,filters.range.timezone)}</td><th scope="row">{r.action}</th><td><span className={`ops-badge ops-badge-${r.outcome==="SUCCESS"?"normal":"kritis"}`}>{r.outcome==="SUCCESS"?"Berhasil":"Ditolak"}</span></td><td>{r.tenantName??"Platform"}</td><td>{r.actorRole??"—"}</td><td>{r.fromStatus||r.toStatus?`${r.fromStatus??"—"} → ${r.toStatus??"—"}`:"—"}</td></tr>)}</tbody></TableRegion>:<p>Belum ada aktivitas audit pada periode ini.</p>}{overview?<Link href={buildPlatformHref("/platform/audit",filters,{page:1,outcome:null,query:null})} prefetch={false}>Lihat semua aktivitas audit</Link>:<Pager route={route} filters={filters} total={data.total}/>}</section>}
function Pager({route,filters,total}:{route:string;filters:PlatformFilters;total:number}){const pages=Math.max(1,Math.ceil(total/25));const page=Math.min(filters.page,pages);return <nav aria-label="Halaman" className="ops-pager"><span>Halaman {page} dari {pages}</span>{page>1?<Link href={buildPlatformHref(route,filters,{page:page-1})} prefetch={false}>Sebelumnya</Link>:<span aria-disabled="true">Sebelumnya</span>}{page<pages?<Link href={buildPlatformHref(route,filters,{page:page+1})} prefetch={false}>Berikutnya</Link>:<span aria-disabled="true">Berikutnya</span>}</nav>}

function TenantDetail({detail,filters}:{detail:Detail;filters:PlatformFilters}){return <><section className="ops-section"><h2>Konfigurasi outlet</h2><TableRegion caption="Konfigurasi outlet tanpa nilai kredensial" id="outlet-caption"><thead><tr><th scope="col">Outlet</th><th scope="col">Alamat pickup</th><th scope="col">Area asal</th><th scope="col">Sumber kredensial</th><th scope="col">Diperbarui</th></tr></thead><tbody>{detail.outlets.map(o=><tr key={o.id}><th scope="row">{o.name}</th><td>{o.hasPickup?"Terisi":"Kosong"}</td><td>{o.hasOrigin?"Terisi":"Kosong"}</td><td>{o.hasPrivateConnection?"Privat aktif":"Default platform"}</td><td>{formatInZone(o.updatedAt,filters.range.timezone)}</td></tr>)}</tbody></TableRegion></section><section className="ops-section"><h2>Batch provider terbaru</h2>{detail.batches.length?<TableRegion caption="Batch provider terbaru; identitas akun dianonimkan" id="batch-caption"><thead><tr><th scope="col">Batch</th><th scope="col">Kurir</th><th scope="col">Sumber</th><th scope="col">Status</th><th scope="col">Kode aman</th><th scope="col">Akun</th><th scope="col">Dicoba</th><th scope="col">Selesai</th></tr></thead><tbody>{detail.batches.map(b=><tr key={b.id}><th scope="row">{formatShortId(b.id)}</th><td>{b.courier}</td><td>{b.credentialSource==="private"?"Privat aktif":"Default platform"}</td><td>{b.status}</td><td>{b.safeErrorCode??"—"}</td><td>Akun provider #{b.providerAccountBucket}</td><td>{b.submissionAttemptedAt?formatInZone(b.submissionAttemptedAt,filters.range.timezone):"—"}</td><td>{b.completedAt?formatInZone(b.completedAt,filters.range.timezone):"—"}</td></tr>)}</tbody></TableRegion>:<p>Tidak ada batch pada periode ini.</p>}</section></>}

export async function MonitoringView({kind,route,rawParams,tenantId}:PageInput){
  let principal;try{principal=await requireCmsScope("platform");}catch(error){if(error instanceof CmsAuthorizationDeniedError)redirect("/login/super-admin");throw error;}
  if(principal.scope!=="platform")redirect("/login/super-admin");
  const now=new Date();
  const data=await withPlatformContext(db,principal.userId,async tx=>{
    const globalOptions=await readFilterOptions(tx,{kind:"global"});
    const rawTenant=tenantId??currentValue(rawParams.tenant);
    const knownTenant=rawTenant&&globalOptions.tenants.some(t=>t.id===rawTenant)?rawTenant:undefined;
    const options=knownTenant?await readFilterOptions(tx,{kind:"tenant",tenantId:knownTenant}):globalOptions;
    const parsed=parsePlatformFilters(rawParams,{route,now,knownTenantIds:globalOptions.tenants.map(t=>t.id),knownOutletIds:options.outlets.map(o=>o.id),knownCouriers:options.couriers,forcedTenantId:tenantId});
    const limit=kind==="overview"?10:25;
    const results=await Promise.allSettled([readPlatformHealth(tx,parsed.filters,now),readPlatformCounts(tx,parsed.filters),readPreviousPeriodHeadline(tx,parsed.filters),readTrend(tx,parsed.filters),listTenantUsage(tx,parsed.filters,limit),listAuditEvents(tx,parsed.filters,limit),kind==="tenant-detail"?readTenantDetail(tx,parsed.filters):Promise.resolve(null)] as const);
    return {options,parsed,results};
  });
  const [healthResult,countsResult,previousResult,trendResult,usageResult,auditResult,detailResult]=data.results;
  const detail=fulfilled(detailResult);if(kind==="tenant-detail"&&!detail)notFound();
  const filters=data.parsed.filters;const actualRoute=tenantId?`/platform/tenant/${tenantId}`:route;
  await recordPlatformMonitoringAccess(db,principal.userId,{route,scope:detail?"tenant":filters.scope.kind,tenantId:detail?detail.tenant.id:filters.scope.kind==="tenant"?filters.scope.tenantId:undefined});
  const canonical=`${actualRoute}?${data.parsed.canonicalQuery.toString()}`;
  const titles:Record<PageKind,{eyebrow:string;title:string;intro:string}>={overview:{eyebrow:"OPERASI PLATFORM",title:"Ringkasan operasional",intro:"Pantau antrean, kegagalan, volume, dan aktivitas lintas tenant."},"tenant-list":{eyebrow:"TENANT",title:"Daftar tenant",intro:"Temukan tenant dan bandingkan penggunaan operasional."},"tenant-detail":{eyebrow:"DETAIL TENANT",title:detail?.tenant.name??"Detail tenant",intro:"Kondisi operasional dan konfigurasi aman tenant."},audit:{eyebrow:"AUDIT",title:"Jejak audit",intro:"Tinjau tindakan platform dan hasil yang ditolak."}};
  const title=titles[kind];
  return <><PlatformNav current={kind}/><header className="ops-intro"><p className="sales-eyebrow">{title.eyebrow}</p><h1>{title.title}</h1><p>{title.intro}</p></header>{data.parsed.issues.length?<AlertRegion className="ops-degraded"><h2>Filter disesuaikan</h2><ul>{data.parsed.issues.map((issue,index)=><li key={`${issue}-${index}`}>{platformIssueMessage(issue)}</li>)}</ul><Link href={canonical} prefetch={false}>Buka URL yang sudah dirapikan</Link></AlertRegion>:null}<ScopeBar actualRoute={actualRoute} filters={filters} generatedAt={now} tenantName={detail?.tenant.name}/><FilterPanel actualRoute={actualRoute} filters={filters} issues={data.parsed.issues} options={data.options} route={route}/>
  {kind==="overview"||kind==="tenant-detail"?(fulfilled(healthResult)?<Health filters={filters} health={fulfilled(healthResult)!}/>:<Degraded name="Kesehatan provider dan antrean"/>):null}
  {kind==="tenant-detail"&&detail?<TenantDetail detail={detail} filters={filters}/>:null}
  {kind==="overview"||kind==="tenant-detail"?(fulfilled(countsResult)?<Counts counts={fulfilled(countsResult)!} filters={filters} previous={fulfilled(previousResult)}/>:<Degraded name="Volume operasional"/>):null}
  {kind==="overview"||kind==="tenant-detail"?(fulfilled(trendResult)?<Trend filters={filters} rows={fulfilled(trendResult)!}/>:<Degraded name="Tren"/>):null}
  {kind==="overview"||kind==="tenant-list"?(fulfilled(usageResult)?<Usage data={fulfilled(usageResult)!} filters={filters} overview={kind==="overview"}/>:<Degraded name="Penggunaan per tenant"/>):null}
  {kind==="overview"||kind==="audit"||kind==="tenant-detail"?(fulfilled(auditResult)?<Audit data={fulfilled(auditResult)!} filters={filters} overview={kind==="overview"} route={actualRoute}/>:<Degraded name="Jejak audit"/>):null}</>;
}
