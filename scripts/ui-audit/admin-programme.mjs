// T-149/T-152/T-160/T-161 read-only browser regression on the seeded dev tenant.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/admin-programme.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PROBE} from './probe.mjs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/admin-programme/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr,tries=120){for(let i=0;i<tries;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});const file=new URL(name+'.png',out);mkdirSync(new URL('.',file),{recursive:true});writeFileSync(file,Buffer.from(data,'base64'))}
async function viewport(width){await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await pause(200)}
async function login(){await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await s.evaluate(`document.querySelector('.auth-submit').click()`);await wait(`location.pathname==='/app'`)}
const ready=`document.readyState==='complete'&&!!document.querySelector('main h1')&&!document.querySelector('[data-slot="skeleton"]')`;
// T-159 screening pass. Every /app page shares one frame, so the title starts at
// the same x on every route — and the same sweep that proves it is the one that
// screens each page for overflow, heading hierarchy, focus visibility, contrast
// and (below `md`) target size. It is the whole authenticated tenant inventory,
// not a sample: the eight routes this loop used to carry were the ones that had
// a frame defect once, which is not the same as the ones that can have one.
// T-150's data pattern pages, and the frame measurement the screening loop reads:
// the title's x and the x of the first card or table scroll region below the
// page header.
const DATA_ROUTES=['/app','/app/pengiriman','/app/pengiriman/rts','/app/kontak/pengirim','/app/kontak/penerima','/app/label','/app/keuangan','/app/analitik'];
const FRAME_EDGES=`JSON.stringify((()=>{const h=document.querySelector('main h1');const frame=document.querySelector('[class*="container/page"]');const header=frame?.querySelector(':scope > header');const surface=[...(frame?.querySelectorAll('[data-slot=card],[data-slot=table-container]')??[])].find(e=>!header?.contains(e)&&e.getBoundingClientRect().width>0);return {x:Math.round(h.getBoundingClientRect().left),surfaceX:surface?Math.round(surface.getBoundingClientRect().left):null}})())`;
const STATIC_ROUTES=[
 '/app','/app/pengiriman','/app/pengiriman/rts','/app/pengiriman/baru','/app/impor',
 '/app/kontak/pengirim','/app/kontak/penerima','/app/kontak/baru','/app/label','/app/analitik','/app/keuangan',
 '/app/cek-resi','/app/cek-tarif',
 // T-165/T-166 (PR-55): the two Laporan pages join the screening inventory in
 // the change that created them, not a later round.
 '/app/laporan/pengiriman','/app/laporan/cetak-resi',
 '/app/pengaturan','/app/pengaturan/pickup','/app/pengaturan/outlet','/app/pengaturan/koneksi','/app/anggota',
];
// The three detail routes are discovered from the list that owns them rather
// than pinned to a seed id, so reseeding the developer database cannot quietly
// drop three pages out of the screening pass.
async function discover(listRoute,prefix){
 await s.goto(origin+listRoute);await wait(ready);await pause(400);
 // Not merely "the first link under the prefix": `/app/kontak` carries a
 // "Kontak baru" link and `/app/pengiriman` carries "Buat kiriman" and the RTS
 // link, so that rule silently screened three static routes a second time and
 // the three detail pages not at all — a mutation that broke a detail page's
 // focus ring passed the sweep. A discovered route must be one the static list
 // does not already own, and must be a single extra path segment.
 const excluded=JSON.stringify(STATIC_ROUTES);
 const href=await s.evaluate(`(()=>{const skip=new Set(${excluded});const a=[...document.querySelectorAll('main a[href^="${prefix}"]')].map(a=>a.getAttribute('href')).filter(Boolean).map(h=>h.split('?')[0]).find(h=>!skip.has(h)&&h.length>'${prefix}'.length&&!h.slice('${prefix}'.length).includes('/'));return a??null})()`);
 assert(href,`no detail link under ${prefix} on ${listRoute} outside the static inventory`);
 return href;
}
try {
 for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
 await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await viewport(1440);await login();

 const SCREENING_ROUTES=[...STATIC_ROUTES,
  await discover('/app/pengiriman','/app/pengiriman/'),
  await discover('/app/kontak/pengirim','/app/kontak/'),
  await discover('/app/label','/app/label/'),
 ];
 assert.equal(new Set(SCREENING_ROUTES).size,SCREENING_ROUTES.length,`the screening inventory repeats a route: ${JSON.stringify(SCREENING_ROUTES)}`);
 console.log('screening inventory:',JSON.stringify(SCREENING_ROUTES));
 for(const width of [1920,1440,1024,390]){
  await viewport(width);
  const seen=[];
  for(const route of SCREENING_ROUTES){
   // Re-applied per route, and then verified. `Page.captureScreenshot` drops
   // the device-metrics override often enough that two runs of this loop
   // measured three pages at the browser's real 2684px window and reported the
   // h1 at x=798 — a frame "defect" on a different page each time, which is the
   // signature of a measurement fault rather than a layout one.
   await viewport(width);
   await s.goto(origin+route);await wait(ready);await pause(250);
   const innerWidth=await s.evaluate('window.innerWidth');
   assert.equal(innerWidth,width,`${route}: measured at ${innerWidth}px, not ${width}px`);
   const frame=JSON.parse(await s.evaluate(FRAME_EDGES));
   const p=JSON.parse(await s.evaluate(PROBE));
   const where=`${route}@${width}`;
   // `scrollbar-gutter: stable` reserves the gutter, so scrollWidth can sit
   // under clientWidth; the sweep's rule is an overflow of more than 1px.
   assert(p.overflow<=1,`${where}: document overflow ${p.overflow} via ${JSON.stringify(p.wide)}`);
   assert.equal(p.h1,1,`${where}: ${p.h1} visible h1`);
   assert.deepEqual(p.headingSkips,[],`${where}: skipped heading level`);
   assert.deepEqual(p.titlesNotHeadings,[],`${where}: card title outside the outline`);
   assert.equal(p.nestedCards,0,`${where}: nested card`);
   assert.deepEqual(p.unreachableScroll,[],`${where}: scroll container neither announced nor reachable`);
   assert.equal(p.weakFocusRing,0,`${where}: focus indicator under 3:1 — ${JSON.stringify(p.focusDetail)}`);
   assert.equal(p.contrastFails,0,`${where}: text under AA — ${JSON.stringify(p.contrast)}`);
   // WCAG 2.5.8 at every width (T-174). The probe now counts the <label> that
   // activates a control as part of its target, which is what cleared the
   // DateRangeFilter preset radios at 1920/1440/1024; below `md` PR-45's
   // 44px rule is carried by the controls themselves.
   assert.equal(p.smallTargetCount,0,`${where}: ${JSON.stringify(p.smallTargets)}`);
   // The 672px prose cap, read from the probe rather than measured again here.
   // This loop used to carry its own copy: `main p, main li, main dd` with
   // textContent of 90+ characters. The probe's version adds the rule that the
   // element's own direct text must be the bulk of it, because textContent on a
   // container concatenates its descendants — extended to the whole inventory
   // the old copy flagged the member row on /app/anggota and the pickup-point
   // row on /app/pengaturan/pickup, both stacks of short lines inside a 726px
   // layout row that nobody reads as one line, while the probe's own
   // longLineCount on those same pages is 0. One rule in one place.
   assert.equal(p.longLineCount,0,`${where}: prose over the 672px cap — ${JSON.stringify(p.longLines)}`);
   // T-150: on the seven data pages the first content surface (a card or a
   // table's own scroll region) starts on the frame edge the title starts on.
   if(DATA_ROUTES.includes(route)&&width>=1024)assert.equal(frame.surfaceX,frame.x,`${where}: first surface at x=${frame.surfaceX}, title at x=${frame.x}`);
   await shot(`screening/${width}${route.replaceAll('/','-')}`);
   seen.push({route,...frame,focusProbed:p.focusProbed,contrastInspected:p.contrastInspected});
  }
  const xs=[...new Set(seen.map(entry=>entry.x))];
  assert.equal(xs.length,1,`page title x differs at ${width}: ${JSON.stringify(seen.map(e=>[e.route,e.x]))}`);
  results.push({step:'screening',width,x:xs[0],routes:seen.length,
   focusProbed:seen.reduce((sum,e)=>sum+e.focusProbed,0),
   contrastInspected:seen.reduce((sum,e)=>sum+e.contrastInspected,0)});
 }

 // Dashboard: automatic freshness, the two new regions, and no snapshot block.
 await viewport(1440);await s.goto(origin+'/app');await wait(ready);await pause(800);
 const dash=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const text=document.querySelector('main').innerText;return {refreshButtons:[...document.querySelectorAll('main button')].filter(b=>/Muat ulang/.test(b.textContent)).length,outcome:/Hasil pengiriman/.test(text),recap:/Rekap per kurir/.test(text),inProgress:/Masih berjalan/.test(text),snapshotBlock:/Pekerjaan yang perlu diperhatikan/.test(text),bandedHeadings:[...document.querySelectorAll('[data-slot=card-header]')].filter(h=>getComputedStyle(h).borderBottomWidth!=='0px'&&getComputedStyle(h).backgroundColor!=='rgba(0, 0, 0, 0)').length}})())`));
 // T-171: a stale column span on a full-width region made the page container invent
 // implicit tracks and collapse its siblings to a few pixels. Bind the real geometry.
 const collapsed=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const frame=document.querySelector('[class*="container/page"]');const cols=getComputedStyle(frame).gridTemplateColumns.split(' ').length;const narrow=[...frame.children].filter(c=>c.getBoundingClientRect().width<200).length;return {cols,narrow,children:frame.children.length}})())`));
 assert.equal(collapsed.cols,1,`page frame must keep one column, saw ${collapsed.cols}`);
 assert.equal(collapsed.narrow,0,'no dashboard region may collapse below 200px');
 assert.equal(dash.refreshButtons,0,'refresh buttons remain');assert(dash.outcome&&dash.recap&&dash.inProgress,JSON.stringify(dash));
 assert.equal(dash.snapshotBlock,false,'the removed snapshot block is back');assert(dash.bandedHeadings>0,'no banded card heading');
 const dashProbe=JSON.parse(await s.evaluate(PROBE));
 // `scrollbar-gutter: stable` reserves the gutter, so scrollWidth can sit under
 // clientWidth; the sweep's rule is an overflow of more than 1px.
 assert(dashProbe.overflow<=1,`dashboard overflow ${dashProbe.overflow}`);assert.equal(dashProbe.weakFocusRing,0);assert.equal(dashProbe.contrastFails,0);
 await shot('dashboard-1440');results.push({step:'dashboard',...dash,probe:{overflow:dashProbe.overflow,weakFocusRing:dashProbe.weakFocusRing,contrastFails:dashProbe.contrastFails}});

 // Cek resi: a foreign or unknown key must read exactly like nothing found, with no PII.
 for(const width of [1440,390]){
  await viewport(width);await s.goto(origin+'/app/cek-resi');await wait(ready);await pause(400);
  const field=`document.querySelector('main input[type=search], main input[type=text]')`;
  await s.evaluate(`(()=>{const i=${field};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'ZZ9999999999');i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await s.evaluate(`document.querySelector('main form').requestSubmit()`);
  await wait(`/tidak ditemukan|Tidak ditemukan/.test(document.querySelector('main').innerText)`);
  const missing=await s.evaluate(`document.querySelector('main').innerText`);
  await s.evaluate(`(()=>{const i=${field};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'10024');i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await s.evaluate(`document.querySelector('main form').requestSubmit()`);
  await wait(`/GC-10024/.test(document.querySelector('main').innerText)`);
  const found=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const text=document.querySelector('main').innerText;return {hasNumber:/GC-10024/.test(text),phone:/08\\d{8,}/.test(text),detailLink:!!document.querySelector('main a[href="/app/pengiriman/10024"]')}})())`));
  assert(found.hasNumber&&found.detailLink,JSON.stringify(found));
  assert.equal(found.phone,false,'cek resi must not print a recipient phone');
  const probe=JSON.parse(await s.evaluate(PROBE));
  assert(probe.overflow<=1,`cek-resi@${width} overflow ${probe.overflow}`);assert.equal(probe.weakFocusRing,0);assert.equal(probe.contrastFails,0);
  await shot('cek-resi-'+width);
  results.push({step:'cek-resi',width,missingSaysNotFound:/tidak ditemukan/i.test(missing),...found,probe:{overflow:probe.overflow,weakFocusRing:probe.weakFocusRing,contrastFails:probe.contrastFails}});
 }

 // T-155: the ground steps down, cards lift, and status carries tone plus an icon.
 await viewport(1440);await s.goto(origin+'/app');await wait(ready);await pause(700);
 const tone=JSON.parse(await s.evaluate(`JSON.stringify((()=>{
  const inset=document.querySelector('[data-slot="sidebar-inset"]');
  const card=document.querySelector('main [data-slot="card"]');
  // A real navigation destination, not the brand block at the top of the rail.
  const nav=document.querySelector('[data-slot="sidebar"] a[href^="/app"]');
  const outcomeRow=[...document.querySelectorAll('main td')].find(td=>/Terkirim|Retur|Gagal|Masih berjalan/.test(td.innerText));
  return {
   ground:getComputedStyle(inset).backgroundColor,
   cardBg:getComputedStyle(card).backgroundColor,
   cardShadow:getComputedStyle(card).boxShadow,
   navFontPx:nav?Math.round(parseFloat(getComputedStyle(nav).fontSize)):0,
   outcomeIcon:!!outcomeRow?.querySelector('svg'),
  }})())`));
 assert.notEqual(tone.ground,tone.cardBg,'the card must not share the page ground');
 assert(tone.cardShadow&&tone.cardShadow!=='none','a resting card carries one elevation');
 assert(tone.navFontPx>=15,`sidebar label ${tone.navFontPx}px is below the 15px floor`);
 assert(tone.outcomeIcon,'outcome rows carry a tone icon');
 const toneProbe=JSON.parse(await s.evaluate(PROBE));
 assert.equal(toneProbe.contrastFails,0,'contrast on the new ground');
 assert.equal(toneProbe.weakFocusRing,0);assert(toneProbe.overflow<=1);
 await shot('tone-1440');results.push({step:'tone',...tone,probe:{contrastFails:toneProbe.contrastFails,weakFocusRing:toneProbe.weakFocusRing}});

 // T-172 review: a pinned first column takes `bg-inherit` from its row. While the
 // stripe was `bg-muted/40` the pinned cell was translucent and the cells scrolling
 // underneath it showed through on every second row. Measure the rendered fill.
 // Every route that pins a column, not one sample: the defect was per-file.
 await viewport(1440);
 for(const route of ['/app/pengiriman','/app/pengiriman/rts','/app/kontak/pengirim','/app/kontak/penerima','/app/analitik','/app/keuangan','/app/label','/app/laporan/pengiriman','/app/laporan/cetak-resi']){
 await s.goto(origin+route);await wait(ready);await pause(700);
 const pinned=JSON.parse(await s.evaluate(`JSON.stringify((()=>{
  // Chrome serializes an oklch fill as lab()/oklch(), so the alpha is the value
  // after the slash, and rgba() keeps it as the fourth component.
  const alpha=c=>{
   if(!c||c==='transparent')return 0;
   const rgba=c.match(/^rgba?\\(([^)]+)\\)$/);
   if(rgba){const parts=rgba[1].split(/[,\\s/]+/).filter(Boolean);return parts.length>3?Number(parts[3]):1}
   const slash=c.match(/\\/\\s*([0-9.]+%?)\\s*\\)$/);
   if(slash)return slash[1].endsWith('%')?parseFloat(slash[1])/100:Number(slash[1]);
   return 1;
  };
  const out=[];
  for(const table of document.querySelectorAll('table')){
   const rows=[...table.querySelectorAll('tbody tr')].filter(r=>r.querySelector(':scope > .sticky'));
   if(rows.length<2)continue;
   for(const index of [0,1]){
    const row=rows[index],cell=row.querySelector(':scope > .sticky');
    out.push({index,cellBg:getComputedStyle(cell).backgroundColor,rowBg:getComputedStyle(row).backgroundColor,alpha:alpha(getComputedStyle(cell).backgroundColor)});
   }
   break;
  }
  return {cells:out};
 })())`));
 assert.equal(pinned.cells.length,2,`${route}: no table with a pinned first column and two rows`);
 for(const cell of pinned.cells)assert.equal(cell.alpha,1,`${route} pinned cell row ${cell.index} is translucent: ${cell.cellBg}`);
 assert.notEqual(pinned.cells[0].cellBg,pinned.cells[1].cellBg,`${route}: the zebra stripe does not reach the pinned column`);
 for(const cell of pinned.cells)assert.equal(cell.cellBg,cell.rowBg,`${route} pinned cell row ${cell.index} does not match its row`);
 await shot('pinned-column'+route.replaceAll('/','-'));results.push({step:'pinned-column',route,...pinned});
 }

 writeFileSync(new URL('report.json',out),JSON.stringify(results,null,2));
 const screening=results.filter(r=>r.step==='screening');
 console.log(JSON.stringify({observations:results.length,
  screenedRoutes:screening[0]?.routes,
  frameX:screening.map(r=>`${r.width}:${r.x}`),
  focusProbed:screening.map(r=>`${r.width}:${r.focusProbed}`),
  contrastInspected:screening.map(r=>`${r.width}:${r.contrastInspected}`),
  dashboardClean:dash.refreshButtons===0}));
 console.log('ADMIN PROGRAMME PASS');
} finally {s.close();await closeTab(target)}
