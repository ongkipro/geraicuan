// T-148 read-only browser regression: stacked shipment table cells on the seeded dev tenant.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/table-compact.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PROBE} from './probe.mjs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/table-compact/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr,tries=120){for(let i=0;i<tries;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',out),Buffer.from(data,'base64'))}
async function login(){await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await s.evaluate(`document.querySelector('.auth-submit').click()`);await wait(`location.pathname==='/app'`)}

// Each page names the table (by a header) that must carry stacked cells.
const PAGES=[
 {path:'/app/pengiriman',header:'Ekspedisi / Resi',recipient:true,time:true},
 {path:'/app/label',header:'Terbit',recipient:true,time:true},
 {path:'/app/pengiriman/rts',header:'Penerima',recipient:true,time:true,optional:true},
];
const INSPECT=header=>`JSON.stringify((()=>{
 const table=[...document.querySelectorAll('table')].find(t=>[...t.querySelectorAll('th')].some(th=>th.innerText.trim()===${JSON.stringify(header)}));
 if(!table)return {found:false};
 const rows=[...table.querySelectorAll('tbody tr')].filter(r=>r.querySelectorAll('td').length>1);
 const scroller=table.closest('[data-slot="table-container"]')||table.parentElement;
 // A full Mengantar area label is "subdistrict, district, city, province, zip"; the table may show only district, city.
 const fullAddress=[...table.querySelectorAll('td')].filter(td=>/(?:[^,\\n]+,){3,}[^,\\n]*\\b\\d{5}\\b/.test(td.innerText)).length;
 const times=[...table.querySelectorAll('tbody time')];
 const twoLineTimes=times.filter(t=>t.children.length===2&&t.children[1].getBoundingClientRect().top>=t.children[0].getBoundingClientRect().bottom-1).length;
 const refs=[...table.querySelectorAll('tbody a[href]')].filter(a=>/^[A-Z0-9]{2,5}-\\d{5,}$/.test(a.innerText.trim()));
 const wrappedRefs=refs.filter(a=>getComputedStyle(a).whiteSpace!=='nowrap'||a.getClientRects().length>1).length;
 const recipientCells=[...table.querySelectorAll('td')].filter(td=>td.querySelectorAll(':scope > span.block, :scope > div > span.block').length>=3);
 return {found:true,rows:rows.length,fullAddress,times:times.length,twoLineTimes,refs:refs.length,wrappedRefs,recipientStacks:recipientCells.length,
  overflowX:scroller.scrollWidth-scroller.clientWidth};
})())`;
try {
 for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
 await s.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await login();
 for(const width of [1440,390]){
  await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
  for(const page of PAGES){
   await s.goto(origin+page.path);await wait(`document.readyState==='complete'&&!document.querySelector('[data-slot="skeleton"]')&&!!document.querySelector('main h1')`);await pause(500);
   const t=JSON.parse(await s.evaluate(INSPECT(page.header)));
   if(!t.found||t.rows===0){assert(page.optional,`${page.path}: table "${page.header}" has no rows`);results.push({width,path:page.path,skipped:'no rows'});continue}
   assert.equal(t.fullAddress,0,`${page.path} shows a full address`);
   assert.equal(t.wrappedRefs,0,`${page.path} wraps a shipment number`);
   if(page.time){assert(t.times>0,`${page.path} has no stacked time`);assert.equal(t.twoLineTimes,t.times,`${page.path} time not on two lines`)}
   if(page.recipient)assert(t.recipientStacks>0,`${page.path} has no stacked recipient`);
   if(page.noScroll&&width===1440)assert(t.overflowX<=1,`${page.path} table overflows its container by ${t.overflowX}px`);
   const probe=JSON.parse(await s.evaluate(PROBE));
   // `scrollbar-gutter: stable` (T-155) reserves the gutter, so scrollWidth can sit
   // under clientWidth. The sweep's rule is an overflow of more than 1px.
   assert(probe.overflow<=1,`${page.path}@${width} page overflow ${probe.overflow}`);assert.equal(probe.weakFocusRing,0);assert.equal(probe.contrastFails,0,`${page.path}@${width} contrast`);
   await s.evaluate(`(()=>{const th=[...document.querySelectorAll('th')].find(th=>th.innerText.trim()===${JSON.stringify(page.header)});th?.closest('table')?.scrollIntoView({block:'start',behavior:'instant'})})()`);
   await shot(`${page.path.slice(1).replaceAll('/','-')}-${width}`);
   results.push({width,path:page.path,...t,probe:{overflow:probe.overflow,weakFocusRing:probe.weakFocusRing,contrastFails:probe.contrastFails}});
  }
 }
 writeFileSync(new URL('report.json',out),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(r=>r.skipped?`${r.path}@${r.width}:skipped`:`${r.path}@${r.width}:rows=${r.rows},times=${r.twoLineTimes}/${r.times},refs=${r.refs},stacks=${r.recipientStacks},overflowX=${r.overflowX}`)));
} finally {s.close();await closeTab(target)}
