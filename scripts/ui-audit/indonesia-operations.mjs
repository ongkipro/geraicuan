// Read-only fixture browser regression; shortcut events are explicitly programmatic.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/indonesia-operations/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr){for(let i=0;i<100;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function click(expr){assert(await s.evaluate(`(()=>{const e=${expr};if(!e)return false;e.click();return true})()`));await pause(250)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',out),Buffer.from(data,'base64'))}
async function login(role){await s.send('Network.clearBrowserCookies');await s.send('Network.setExtraHTTPHeaders',{headers:{}});await s.goto(origin+(role==='super'?'/login/super-admin':'/login/tenant'));await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email',${JSON.stringify(role+'@geraicuan.com')}],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await click(`document.querySelector('.auth-submit')`);try{await wait(`location.pathname===${JSON.stringify(role==='super'?'/platform':'/app')}`)}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}}
try {
for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
await login('tenant');
for(const width of [1440,390]){
await s.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
for(const [route,scenario] of [['/app','dashboard-period-demo'],['/app/analitik','analytics-first-run'],['/app/keuangan','finance-empty']]){
await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':scenario}});
await s.goto(origin+route+'?rentang=kustom&dari=2026-08-01&sampai=2026-08-31&tz=Asia%2FJayapura');await wait(`document.readyState==='complete'&&!document.querySelector('[data-slot=skeleton]')`);await pause(350);
assert.equal(await s.evaluate(`document.querySelectorAll('select[name=tz]').length`),0);
assert(await s.evaluate(`document.querySelector('main').textContent.includes('WIB')`));
assert(await s.evaluate(`document.documentElement.scrollWidth<=innerWidth`));
const dateValues=await s.evaluate(`Array.from(document.querySelectorAll('input[type=date]')).map(e=>e.value)`);assert(dateValues.includes('2026-08-01')&&dateValues.includes('2026-08-31'));
await shot(route.replaceAll('/','-')+'-'+width);results.push({route,width,wib:true,dateValues});
}
await s.send('Network.setExtraHTTPHeaders',{headers:{}});
for(const route of ['/app/pengiriman','/app/analitik','/app']){
await s.goto(origin+route);await wait(`document.readyState==='complete'&&!document.querySelector('[data-slot=skeleton]')`);await pause(350);
const references=await s.evaluate(`Array.from(document.querySelectorAll('main a[href^="/app/pengiriman/"]')).filter(e=>/^[0-9]{5,}-[0-9]{6}-[0-9]{3,}$/.test(e.textContent.trim())).map(e=>{const r=e.getBoundingClientRect(),c=e.closest('td')?.getBoundingClientRect();return {width:r.width,cellWidth:c?.width,clipped:e.scrollWidth>e.clientWidth+1}})`);
assert(references.length>0,route+' populated public reference');assert(references.every(r=>r.width<=161&&!r.clipped&&(!r.cellWidth||r.cellWidth<=200)),route+' bounded public reference');
results.push({route,width,references});
}
for(const [route,expected] of [['/app/kontak','081290000001'],['/app/pengiriman/rts','08129000'],['/app/label','08129000']]){
await s.goto(origin+route);await wait(`document.readyState==='complete'&&!document.querySelector('[data-slot=skeleton]')`);await pause(300);
const check=await s.evaluate(`(()=>{const m=document.querySelector('main');return {full:new RegExp(${JSON.stringify(expected)}+'[0-9]{'+${expected.length===8?4:0}+'}').test(m.textContent),masked:/••••/.test(m.textContent),overflow:document.documentElement.scrollWidth>innerWidth}})()`);
assert(check.full,route+' synthetic full phone');assert(!check.masked,route+' masking');assert(!check.overflow,route+' overflow');
// Geometry and synthetic-number assertions only: no operational page screenshots.
results.push({route,width,...check});
}
}
writeFileSync(new URL('report.json',out),JSON.stringify({results},null,2));console.log(JSON.stringify({observations:results.length,allPassed:true}));
}finally{s.close();await closeTab(target)}
