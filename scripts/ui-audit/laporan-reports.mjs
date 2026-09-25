// T-165 / T-166 (PR-55) read-only browser evidence for the two Laporan pages.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/laporan-reports.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PROBE} from './probe.mjs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/laporan-reports/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr,tries=120){for(let i=0;i<tries;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',out),Buffer.from(data,'base64'))}
const ready=`document.readyState==='complete'&&!document.querySelector('[data-slot="skeleton"]')&&!!document.querySelector('main h1')`;
async function viewport(width){await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768})}
async function header(value){await s.send('Network.setExtraHTTPHeaders',{headers:value?{'x-geraicuan-ui-audit':value}:{}})}
async function login(){await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await s.evaluate(`document.querySelector('.auth-submit').click()`);await wait(`location.pathname==='/app'`)}

// PR-55 columns, in the order `src/lib/shipment-report.ts` declares them.
const REPORT_COLUMNS=['Nomor kiriman','Dibuat','Resi terbit','Area penerima','Kurir','Layanan','Status','Pembayaran','Biaya kirim Mengantar (IDR)','Biaya COD (IDR)','Estimasi dana dicairkan Mengantar (IDR)','Status cetak'];
const HISTORY_COLUMNS=['Nomor kiriman','Waktu cetak','Peran pelaku','Hasil','Alasan','Urutan cetak','Cetak ulang'];

// One GET form on the route, one range control, and the table this page owns.
const INSPECT=(route,columns)=>`JSON.stringify((()=>{
 const forms=[...document.querySelectorAll('form[method="get" i]')].filter(f=>new URL(f.getAttribute('action')||location.pathname,location.origin).pathname===${JSON.stringify(route)});
 const rangeControls=document.querySelectorAll('.cms-range-filter').length;
 const wanted=${JSON.stringify(columns)};
 const table=[...document.querySelectorAll('table')].find(t=>{
  const heads=[...t.querySelectorAll('thead th')].map(th=>th.innerText.trim());
  return heads.length===wanted.length&&heads.every((h,i)=>h===wanted[i]);
 });
 const scroller=table?(table.closest('[data-slot="table-container"]')||table.parentElement):null;
 const rows=table?[...table.querySelectorAll('tbody tr')]:[];
 const alpha=c=>{
  if(!c||c==='transparent')return 0;
  const rgba=c.match(/^rgba?\\(([^)]+)\\)$/);
  if(rgba){const parts=rgba[1].split(/[,\\s/]+/).filter(Boolean);return parts.length>3?Number(parts[3]):1}
  const slash=c.match(/\\/\\s*([0-9.]+%?)\\s*\\)$/);
  if(slash)return slash[1].endsWith('%')?parseFloat(slash[1])/100:Number(slash[1]);
  return 1;
 };
 const pinned=rows.slice(0,2).map((row,index)=>{
  const cell=row.querySelector(':scope > .sticky');
  if(!cell)return {index,missing:true};
  const cellBg=getComputedStyle(cell).backgroundColor,rowBg=getComputedStyle(row).backgroundColor;
  return {index,cellBg,rowBg,alpha:alpha(cellBg),matchesRow:cellBg===rowBg};
 });
 const exportLink=[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).find(h=>h.includes('export.csv'))||null;
 return {forms:forms.length,rangeControls,tableFound:Boolean(table),rows:rows.length,
  tableOverflowX:scroller?scroller.scrollWidth-scroller.clientWidth:null,pinned,exportLink,
  text:document.querySelector('main').innerText};
})())`;

const ROUTES=[
 {columns:REPORT_COLUMNS,emptyScenario:'shipment-report-empty',emptyText:'Belum ada kiriman pada periode ini.',
  filteredEmptyText:'Tidak ada kiriman yang cocok dengan filter ini.',name:'pengiriman',route:'/app/laporan/pengiriman'},
 {columns:HISTORY_COLUMNS,emptyScenario:'print-history-empty',emptyText:'Belum ada permintaan cetak pada periode ini.',
  filteredEmptyText:'Belum ada permintaan cetak pada periode ini.',name:'cetak-resi',route:'/app/laporan/cetak-resi'},
];
// A window before the product existed: every report is legitimately empty in it.
const EMPTY_WINDOW='?rentang=kustom&dari=2025-01-01&sampai=2025-01-02';

try {
 for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
 await viewport(1440);
 await login();

 for(const width of [1440,390]){
  await viewport(width);
  for(const page of ROUTES){
   await s.goto(origin+page.route);await wait(ready);await pause(600);
   const t=JSON.parse(await s.evaluate(INSPECT(page.route,page.columns)));
   assert.equal(t.forms,1,`${page.route}@${width}: ${t.forms} GET filter forms, expected exactly one`);
   assert.equal(t.rangeControls,1,`${page.route}@${width}: ${t.rangeControls} range controls, expected exactly one`);
   const probe=JSON.parse(await s.evaluate(PROBE));
   assert(probe.overflow<=1,`${page.route}@${width} page overflow ${probe.overflow}`);
   assert.equal(probe.weakFocusRing,0,`${page.route}@${width} weak focus ring`);
   assert.equal(probe.contrastFails,0,`${page.route}@${width} contrast`);
   if(t.tableFound&&t.rows>=2){
    // A pinned first column inherits its row's fill, and every fill must be opaque
    // or the cells scrolling underneath show through it (T-172).
    for(const cell of t.pinned){
     assert(!cell.missing,`${page.route}@${width} row ${cell.index} has no pinned cell`);
     assert.equal(cell.alpha,1,`${page.route}@${width} pinned cell ${cell.index} is translucent: ${cell.cellBg}`);
     assert.equal(cell.matchesRow,true,`${page.route}@${width} pinned cell ${cell.index} does not match its row`);
    }
    assert.notEqual(t.pinned[0].cellBg,t.pinned[1].cellBg,`${page.route}@${width}: the stripe does not reach the pinned column`);
   }
   await shot(`${page.name}-${width}`);
   results.push({width,route:page.route,forms:t.forms,rangeControls:t.rangeControls,tableFound:t.tableFound,rows:t.rows,
    tableOverflowX:t.tableOverflowX,pinnedAlpha:t.pinned.map(c=>c.alpha),exportLink:Boolean(t.exportLink),
    probe:{overflow:probe.overflow,weakFocusRing:probe.weakFocusRing,contrastFails:probe.contrastFails}});
  }
 }

 // The export link carries the filters the table is showing, never a bare path.
 await viewport(1440);
 const filtered='?rentang=kustom&dari=2026-08-01&sampai=2026-09-16';
 await s.goto(origin+'/app/laporan/pengiriman'+filtered);await wait(ready);await pause(600);
 const filteredView=JSON.parse(await s.evaluate(INSPECT('/app/laporan/pengiriman',REPORT_COLUMNS)));
 if(filteredView.rows>0){
  assert(filteredView.exportLink,'a populated report offers an export');
  for(const param of ['rentang=kustom','dari=2026-08-01','sampai=2026-09-16'])assert(filteredView.exportLink.includes(param),`export link missing ${param}: ${filteredView.exportLink}`);
  assert(!filteredView.exportLink.includes('halaman'),'the export is the filtered set, not one page of it');
 }
 assert(/Total per kurir/.test(filteredView.text),'the report states its per-courier totals');
 assert(/Total per status/.test(filteredView.text),'the report states its per-status totals');
 await shot('pengiriman-filtered-1440');
 results.push({step:'export-link',exportLink:filteredView.exportLink,rows:filteredView.rows});

 // Empty and filtered-empty, at both widths.
 for(const width of [1440,390]){
  await viewport(width);
  for(const page of ROUTES){
   await header(page.emptyScenario);
   await s.goto(origin+page.route);await wait(ready);await pause(500);
   const empty=JSON.parse(await s.evaluate(INSPECT(page.route,page.columns)));
   assert(empty.text.includes(page.emptyText),`${page.route}@${width} empty state missing: ${page.emptyText}`);
   if(page.route==='/app/laporan/pengiriman')assert(!empty.text.includes('Ekspor CSV'),'an empty report offers no export');
   await shot(`${page.name}-empty-${width}`);
   await header(null);

   await s.goto(origin+page.route+EMPTY_WINDOW);await wait(ready);await pause(500);
   const filteredEmpty=JSON.parse(await s.evaluate(INSPECT(page.route,page.columns)));
   assert(filteredEmpty.text.includes(page.filteredEmptyText),`${page.route}@${width} filtered-empty state missing: ${page.filteredEmptyText}`);
   assert.equal(filteredEmpty.rows,0,`${page.route}@${width} filtered-empty still lists rows`);
   const probe=JSON.parse(await s.evaluate(PROBE));
   assert(probe.overflow<=1,`${page.route}@${width} filtered-empty overflow ${probe.overflow}`);
   assert.equal(probe.contrastFails,0,`${page.route}@${width} filtered-empty contrast`);
   await shot(`${page.name}-filtered-empty-${width}`);
   results.push({width,route:page.route,step:'empty-states',filteredEmptyRows:filteredEmpty.rows});
  }
 }

 writeFileSync(new URL('report.json',out),JSON.stringify(results,null,2));
 const listed=results.filter(r=>!r.step);
 console.log(JSON.stringify({observations:results.length,
  routes:[...new Set(listed.map(r=>r.route))],
  widths:[...new Set(listed.map(r=>r.width))],
  rows:listed.map(r=>`${r.route}@${r.width}:rows=${r.rows},tableOverflowX=${r.tableOverflowX},pinnedAlpha=${JSON.stringify(r.pinnedAlpha)}`),
  exportLink:results.find(r=>r.step==='export-link')?.exportLink}));
 console.log('LAPORAN REPORTS PASS');
} finally {s.close();await closeTab(target)}
