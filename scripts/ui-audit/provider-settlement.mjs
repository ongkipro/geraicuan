// T-146 live read-only browser check: one real Mengantar settlement pull (GET invoices/orders only),
// then the throttle, result focus and responsive states. Never creates a provider order.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PROBE} from './probe.mjs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/provider-settlement/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr,tries=100){for(let i=0;i<tries;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',out),Buffer.from(data,'base64'))}
async function login(){await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await s.evaluate(`document.querySelector('.auth-submit').click()`);try{await wait(`location.pathname==='/app'`)}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}}
const hydratedPull=`(()=>{const f=document.querySelector('#settlement-outlet')?.closest('form');return !!f&&Object.keys(f).some(k=>k.startsWith('__reactProps$'))})()`;
const resultText=`(document.querySelector('#settlement-outlet')?.closest('form')?.querySelector('[data-slot=alert]')?.textContent??'')`;
async function submitPull(){await s.evaluate(`document.querySelector('#settlement-outlet').closest('form').querySelector('button[type=submit]').click()`);await wait(`${resultText}.length>0`,400)}
try {
 for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
 await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await s.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await login();
 await s.goto(origin+'/app/keuangan?rentang=30-hari');await wait(`!!document.getElementById('settlement-title')`);await wait(hydratedPull);
 const before=await s.evaluate(`document.getElementById('settlement-title').closest('section').textContent`);
 await s.evaluate(`document.getElementById('settlement-pull-title').scrollIntoView({block:'start',behavior:'instant'})`);await shot('before-pull-1440');

 await submitPull();
 const first=JSON.parse(await s.evaluate(`JSON.stringify({text:${resultText},focused:document.activeElement?.getAttribute('data-slot')==='alert',role:document.querySelector('#settlement-outlet').closest('form').querySelector('[data-slot=alert]').getAttribute('role')})`));
 results.push({step:'first-pull',...first});
 assert.match(first.text,/Data Mengantar ditarik \((akun platform bersama, total akun tidak ditampilkan|\d+ invoice dan \d+ order diperiksa)\): \d+ bukti pencairan dan \d+ status cocok/,first.text);
 assert.equal(first.role,'status');assert(first.focused,'result alert must receive focus');
 await shot('after-pull-result-1440');

 // revalidatePath refreshes the server section with the new pull summary.
 await wait(`/Tarikan terakhir/.test(document.getElementById('settlement-title').closest('section').textContent)`,200);
 const section=await s.evaluate(`document.getElementById('settlement-title').closest('section').textContent`);
 results.push({step:'section-after-pull',beforeHadPull:/Tarikan terakhir/.test(before),summary:section.match(/Tarikan terakhir[^.]*\./)?.[0]??null,empty:/Belum ada resi GeraiCUAN yang cocok|Data Mengantar belum pernah ditarik/.test(section)});
 await s.evaluate(`document.getElementById('settlement-title').scrollIntoView({block:'start',behavior:'instant'})`);await shot('section-1440');

 await s.goto(origin+'/app/keuangan?rentang=30-hari');await wait(hydratedPull);
 await submitPull();
 const throttled=await s.evaluate(resultText);results.push({step:'second-pull-throttled',text:throttled});
 assert.match(throttled,/baru saja ditarik/);

 const html=await s.evaluate(`document.documentElement.outerHTML`);
 assert(!/api\/public\//.test(html),'no credential-bearing provider path in the page');
 for(const width of [1440,390]){
  await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
  await s.goto(origin+'/app/keuangan?rentang=30-hari');await wait(hydratedPull);await pause(400);
  const probe=JSON.parse(await s.evaluate(PROBE));
  const layout=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const b=document.querySelector('#settlement-outlet').closest('form').querySelector('button[type=submit]').getBoundingClientRect();const sel=document.querySelector('#settlement-outlet').getBoundingClientRect();return {buttonHeight:b.height,selectHeight:sel.height,overflow:document.documentElement.scrollWidth>innerWidth}})())`));
  assert.equal(probe.overflow,0);assert.equal(probe.weakFocusRing,0);assert.equal(probe.contrastFails,0);
  assert(layout.buttonHeight>=44&&layout.selectHeight>=44&&!layout.overflow,JSON.stringify(layout));
  await s.evaluate(`document.getElementById('settlement-title').scrollIntoView({block:'start',behavior:'instant'})`);await shot('section-'+width);
  results.push({step:'responsive',width,layout,probe:{overflow:probe.overflow,weakFocusRing:probe.weakFocusRing,contrastFails:probe.contrastFails}});
 }
 writeFileSync(new URL('report.json',out),JSON.stringify(results,null,2));
 console.log(JSON.stringify({observations:results.length,firstPull:first.text,throttled:true}));
} finally {s.close();await closeTab(target)}
