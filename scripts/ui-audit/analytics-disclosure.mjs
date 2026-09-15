// Read-only fixture browser regression; shortcut events are explicitly programmatic.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PROBE} from './probe.mjs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/analytics-disclosure/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr){for(let i=0;i<100;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function click(expr){assert(await s.evaluate(`(()=>{const e=${expr};if(!e)return false;e.click();return true})()`));await pause(250)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',out),Buffer.from(data,'base64'))}
async function login(role){await s.send('Network.clearBrowserCookies');await s.send('Network.setExtraHTTPHeaders',{headers:{}});await s.goto(origin+(role==='super'?'/login/super-admin':'/login/tenant'));await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email',${JSON.stringify(role+'@geraicuan.com')}],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await click(`document.querySelector('.auth-submit')`);try{await wait(`location.pathname===${JSON.stringify(role==='super'?'/platform':'/app')}`)}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}}
try {
for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});await login('tenant');
for(const width of [1440,390,320]){
 await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
 await s.send('Network.setExtraHTTPHeaders',{headers:{}});await s.goto(origin+'/app/analitik?rentang=30-hari');await wait(`document.querySelectorAll('[data-analytics-detail]').length===3&&!document.querySelector('[data-slot=skeleton]')`);await pause(350);
 const closed=await s.evaluate(`(()=>{const ds=[...document.querySelectorAll('[data-analytics-detail]')];return {height:document.documentElement.scrollHeight,allClosed:ds.every(d=>!d.open),counts:ds.map(d=>({type:d.dataset.analyticsDetail,rows:d.querySelectorAll('tbody tr').length,summaryHeight:d.querySelector('summary').getBoundingClientRect().height})),order:['analytics-summary-heading','analytics-reconciliation-heading','analytics-trend-heading','analytics-courier-heading','analytics-financial-heading','kiriman-analitik'].map(id=>document.getElementById(id).getBoundingClientRect().top)}})()`);
 assert(closed.allClosed);assert(closed.counts.every(d=>d.summaryHeight>=44));assert(closed.counts.find(d=>d.type==='trend').rows>=30);assert.deepEqual(closed.order,[...closed.order].sort((a,b)=>a-b));
 const probe=JSON.parse(await s.evaluate(PROBE));writeFileSync('/tmp/geraicuan-analytics-probe.json',JSON.stringify(probe,null,2));assert.equal(probe.overflow,0);assert.equal(probe.weakFocusRing,0);assert.equal(probe.contrastFails,0);await s.evaluate(`scrollTo({top:0,behavior:'instant'})`);await shot('overview-'+width);
 for(const type of ['trend','couriers','costs']){
  await s.evaluate(`(()=>{const d=document.querySelector('[data-analytics-detail="${type}"]');d.querySelector('summary').scrollIntoView({block:'center',behavior:'instant'});d.querySelector('summary').focus();d.querySelector('summary').click()})()`);await wait(`document.querySelector('[data-analytics-detail="${type}"]').open`);await pause(200);await shot(type+'-open-'+width);
  assert(await s.evaluate(`(()=>{const d=document.querySelector('[data-analytics-detail="${type}"]');return d.querySelector('summary')===document.activeElement&&d.querySelector('summary').getBoundingClientRect().height>=44})()`));
 }
 const expandedHeight=await s.evaluate(`document.documentElement.scrollHeight`);assert(expandedHeight>closed.height+500);
 await s.evaluate(`document.querySelectorAll('[data-analytics-detail] summary').forEach(s=>s.click())`);assert(await s.evaluate(`[...document.querySelectorAll('[data-analytics-detail]')].every(d=>!d.open)`));
 results.push({width,closed,expandedHeight,probe,openClose:true});
 // The KPI support target is always visible; its navigation keeps the selected period.
 await click(`Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('aria-label')?.startsWith('Kiriman dibuat:'))`);await wait(`location.hash==='#kiriman-analitik'`);assert(await s.evaluate(`new URL(location.href).searchParams.get('rentang')==='30-hari'&&document.getElementById('kiriman-analitik').getBoundingClientRect().height>0`));
 const pagination=await s.evaluate(`(()=>{const next=document.querySelector('a[aria-label="Halaman berikutnya"]');return {nextHref:next?.getAttribute('href')??null,control:!!document.querySelector('[aria-label="Halaman berikutnya"]')}})()`);assert(pagination.control);results.push({width,supportLink:true,pagination});
}
for(const [scenario,text] of [['analytics-first-run','Belum ada kiriman'],['analytics-trend-error','Tren tidak dapat dimuat'],['analytics-page-error','Analitik tidak dapat dimuat']]){
 await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':scenario}});await s.goto(origin+'/app/analitik?rentang=30-hari');await wait(`document.body.textContent.includes(${JSON.stringify(text)})`);await shot(scenario);results.push({scenario,visible:true});
}
writeFileSync(new URL('report.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify({observations:results.length,disclosures:3,programmaticActivation:true}));
}finally{s.close();await closeTab(target)}
