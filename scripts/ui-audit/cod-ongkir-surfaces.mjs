// T-190: every shipment surface names COD Ongkir as "COD Ongkir" with the
// shipping charge collected ("Ongkir ditagih"), never as "COD" or a goods value.
// Read-only: navigates list pages, the dashboard COD drill-down, Cetak resi and
// the Cek resi `resi-lookup-found-cod-ongkir` scenario. Nothing is written.
// A surface whose data has no COD Ongkir row is reported as `absent`, not failed:
// the developer database may predate COD Ongkir seed data.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/cod-ongkir-surfaces.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';
import {PROBE} from './probe.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const output=new URL('./.output/cod-ongkir-surfaces/',import.meta.url);
mkdirSync(output,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(expression){for(let i=0;i<160;i++){if(await s.evaluate(expression).catch(()=>false))return;await pause(150)}throw Error(`Did not settle: ${expression}`)}
const CELLS=`JSON.stringify([...document.querySelectorAll('[data-payment-method]')].map(e=>({method:e.dataset.paymentMethod,text:e.innerText.replace(/\\s+/g,' ').trim()})))`;
const results=[];
async function surface(name,url,{header,maxPages=1,pageParam='page'}={}){
 await s.send('Network.setExtraHTTPHeaders',{headers:header?{'x-geraicuan-ui-audit':header}:{}});
 for(let page=1;page<=maxPages;page++){
  const u=new URL(url,origin);if(page>1)u.searchParams.set(pageParam,String(page));
  await s.goto(u.href);
  await waitFor(`document.readyState==='complete' && !!document.querySelector('main h1')`);
  await pause(1500);
  const cells=JSON.parse(await s.evaluate(CELLS));
  const ongkir=cells.filter(c=>c.method==='COD_ONGKIR');
  for(const c of cells){
   if(c.method==='COD_ONGKIR')assert.match(c.text,/^COD Ongkir( Ongkir ditagih Rp\s?[\d.]+)?$/,`${name}: ${c.text}`);
   if(c.method==='COD')assert.match(c.text,/^COD( Total COD Rp\s?[\d.]+)?$/,`${name}: ${c.text}`);
   if(c.method==='NON_COD')assert.match(c.text,/^Non-COD( Nilai asuransi Rp\s?[\d.]+)?$/,`${name}: ${c.text}`);
  }
  if(ongkir.length||page===maxPages||cells.length===0){
   const p=JSON.parse(await s.evaluate(PROBE));
   const width=await s.evaluate('window.innerWidth');
   let shot=null;
   // Without a COD Ongkir row, still capture the payment cell layout (as `-layout`).
   if(cells.length){
    await s.evaluate(`document.querySelector(${JSON.stringify(ongkir.length?'[data-payment-method=COD_ONGKIR]':'[data-payment-method]')}).scrollIntoView({block:'center'})`);await pause(350);
    const {data}=await s.send('Page.captureScreenshot',{format:'png'});
    shot=`${name}-${width}${ongkir.length?'':'-layout'}.png`;writeFileSync(new URL(shot,output),Buffer.from(data,'base64'));
   }
   results.push({name,width,url:u.pathname+u.search,page,cells:cells.length,codOngkir:ongkir.map(c=>c.text),status:ongkir.length?'shown':'absent',overflow:p.overflow,contrastFails:p.contrastFails,screenshot:shot});
   assert(p.overflow<=0,`overflow ${p.overflow} on ${name} at ${width}`);
   return;
  }
 }
}
try{
 for(const d of ['Page','Runtime','Network'])await s.send(`${d}.enable`);
 await s.send('Page.bringToFront');
 await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');
 await waitFor(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
 await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
 await pause(250);await s.evaluate(`document.querySelector('.auth-submit').click()`);await waitFor(`location.pathname==='/app'`);
 for(const width of [1440,390]){
  await s.send('Emulation.setDeviceMetricsOverride',{width,height:width<768?844:900,deviceScaleFactor:1,mobile:width<768});
  await surface('queue','/app/pengiriman?rentang=30-hari',{maxPages:3});
  await surface('rts','/app/pengiriman/rts?rentang=30-hari',{maxPages:2});
  await surface('dashboard','/app?rentang=30-hari&support=cod');
  await surface('label','/app/label?rentang=30-hari');
  await surface('cek-resi','/app/cek-resi',{header:'resi-lookup-found-cod-ongkir'});
 }
 writeFileSync(new URL('report.json',output),JSON.stringify(results,null,1));
 console.table(results.map(({name,width,page,cells,status,codOngkir,overflow,contrastFails,screenshot})=>({name,width,page,cells,status,codOngkir:codOngkir[0]??'',overflow,contrastFails,screenshot})));
 const cek=results.filter(r=>r.name==='cek-resi');
 assert(cek.length===2&&cek.every(r=>r.status==='shown'&&r.codOngkir[0]==='COD Ongkir Ongkir ditagih Rp 20.000'),'Cek resi scenario shows COD Ongkir and its charge');
 console.log('COD ONGKIR SURFACES PASS');
}finally{await s.send('Network.setExtraHTTPHeaders',{headers:{}}).catch(()=>{});s.close?.();await closeTab(target)}
