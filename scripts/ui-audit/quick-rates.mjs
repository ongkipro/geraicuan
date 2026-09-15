// Read-only fixture browser regression; shortcut events are explicitly programmatic.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PROBE} from './probe.mjs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/quick-rates/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr){for(let i=0;i<100;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function click(expr){assert(await s.evaluate(`(()=>{const e=${expr};if(!e)return false;e.click();return true})()`));await pause(250)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',out),Buffer.from(data,'base64'))}
async function login(role){await s.send('Network.clearBrowserCookies');await s.send('Network.setExtraHTTPHeaders',{headers:{}});await s.goto(origin+(role==='super'?'/login/super-admin':'/login/tenant'));await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email',${JSON.stringify(role+'@geraicuan.com')}],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await click(`document.querySelector('.auth-submit')`);try{await wait(`location.pathname===${JSON.stringify(role==='super'?'/platform':'/app')}`)}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}}
try {
for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});await login('tenant');
for(const width of [1440,1024,768,390,320]){
 await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
 await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'quick-rate-demo'}});
 await s.goto(origin+'/app/cek-tarif');await wait(`!!document.getElementById('rate-results-title')&&!document.querySelector('[data-slot=skeleton]')`);await pause(350);
 const probe=JSON.parse(await s.evaluate(PROBE));assert.equal(probe.overflow,0);assert.equal(probe.weakFocusRing,0);assert.equal(probe.contrastFails,0);
 const layout=await s.evaluate(`(()=>{const h=document.querySelector('[data-slot=cms-header]'),a=h.querySelector('a[href="/app/cek-tarif"]'),r=a.getBoundingClientRect(),t=h.querySelector('time').getBoundingClientRect();return {headerHeight:h.getBoundingClientRect().height,button:{width:r.width,height:r.height,right:r.right},clockLeft:t.left,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
 assert(layout.button.height>=44);assert(!layout.overflow);assert(layout.headerHeight<130);results.push({width,probe,layout});await s.evaluate(`scrollTo({top:0,behavior:'instant'})`);await shot('quote-'+width);
 if(width===320||width===390){await s.evaluate(`document.getElementById('rate-results-title').scrollIntoView({block:'start',behavior:'instant'})`);if(width===390)await s.evaluate(`(()=>{const t=document.querySelector('[data-slot=table-container]');t.scrollLeft=t.scrollWidth})()`);await shot('table-'+width);results.push({width,tableCapture:true})}
}
await s.send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'quick-rate-demo'}});await s.goto(origin+'/app/cek-tarif');await wait(`!!document.getElementById('rate-results-title')`);await pause(300);
await s.evaluate(`(()=>{const e=document.getElementById('rate-weight');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2000');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.getElementById('rate-weight').value==='2000'&&!document.getElementById('rate-results-title')`);results.push({staleFromInputBubbling:true});

for(const [scenario,text] of [['quick-rate-empty','Belum ada layanan untuk rute ini'],['quick-rate-provider-error','Tarif belum tersedia'],['quick-rate-stale','Rute atau berat berubah'],['quick-rate-error','Cek tarif belum dapat dimuat']]){
 await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':scenario}});await s.goto(origin+'/app/cek-tarif');await wait(`document.body.textContent.includes(${JSON.stringify(text)})`);await shot(scenario);results.push({scenario,visible:true});
}
// Exercise the actual action boundary: missing destination returns focusable field feedback before provider I/O.
await s.send('Network.setExtraHTTPHeaders',{headers:{}});await s.goto(origin+'/app/cek-tarif');await wait(`!!document.getElementById('rate-weight')`);await pause(350);
await click(`document.querySelector('button[type="submit"]')`);await wait(`document.getElementById('areaLabel')?.getAttribute('aria-invalid')==='true'`);
assert(await s.evaluate(`document.activeElement===document.getElementById('areaLabel')`));results.push({missingDestination:'focused server validation'});await shot('validation');
if(!process.env.QUICK_RATE_FIXTURES_ONLY){
// Read-only live provider lookup and estimate; never submits a shipment.
const input=`document.querySelector('input[placeholder="Contoh: Dago Bandung"]')`;
await s.evaluate(`(()=>{const e=${input};e.focus();const key=Object.keys(e).find(k=>k.startsWith('__reactProps$'));e[key].onChange({target:{value:'Kebayoran Baru'}})})()`);await pause(200);
await click(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Cari area')`);await wait(`!!document.querySelector('[cmdk-item]')`);
await click(`document.querySelector('[cmdk-item]')`);await wait(`document.querySelector('input[name="areaId"]')?.value`);
await click(`document.querySelector('button[type="submit"]')`);await wait(`!!document.getElementById('rate-results-title')`);await shot('live-quote-390');
const count=await s.evaluate(`document.querySelectorAll('tbody tr').length`);assert(count>0);results.push({liveQuote:true,services:count});
await s.evaluate(`(()=>{const e=document.getElementById('rate-weight');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2000');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.getElementById('rate-weight').value==='2000'&&!document.getElementById('rate-results-title')`);results.push({staleQuoteHidden:true});
}
writeFileSync(new URL(process.env.QUICK_RATE_FIXTURES_ONLY?'fixture-report.json':'report.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify({observations:results.length,liveProviderReadOnly:!process.env.QUICK_RATE_FIXTURES_ONLY}));
}finally{s.close();await closeTab(target)}
