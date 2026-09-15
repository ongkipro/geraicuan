// Read-only fixture browser regression; shortcut events are explicitly programmatic.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/shipment-references/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr){for(let i=0;i<100;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function click(expr){assert(await s.evaluate(`(()=>{const e=${expr};if(!e)return false;e.click();return true})()`));await pause(250)}
async function login(role){await s.send('Network.clearBrowserCookies');await s.send('Network.setExtraHTTPHeaders',{headers:{}});await s.goto(origin+(role==='super'?'/login/super-admin':'/login/tenant'));await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email',${JSON.stringify(role+'@geraicuan.com')}],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await click(`document.querySelector('.auth-submit')`);try{await wait(`location.pathname===${JSON.stringify(role==='super'?'/platform':'/app')}`)}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}}
try {
for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');await login('tenant');
for(const width of [1440,390]){
await s.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
for(const route of ['/app/pengiriman','/app','/app/analitik','/app/keuangan','/app/pengiriman/72000000-0000-4000-8000-000000000013','/app/label/72000000-0000-4000-8000-000000000013']){
 await s.goto(origin+route);await wait(`document.readyState==='complete'&&!document.querySelector('[data-slot=skeleton]')`);await pause(300);
 const check=await s.evaluate(`(()=>{const m=document.querySelector('main'),text=m.innerText;return {publicCount:(text.match(/\\b[0-9]{5,}-[0-9]{6}-[0-9]{3,}\\b/g)||[]).length,uuidCount:(text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)||[]).length,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
 assert(check.publicCount>0,route+' public reference');assert.equal(check.uuidCount,0,route+' visible UUID');assert(!check.overflow,route+' overflow');results.push({route,width,...check});
 if(route.endsWith('000000000013')){
  const selector=route.includes('/label/')?'.label-footer':'main h1';await s.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);await pause(100);
  const clip=await s.evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.max(0,r.x-4),y:Math.max(0,r.y-4)+scrollY,width:Math.min(innerWidth-Math.max(0,r.x-4),r.width+8),height:r.height+8,scale:1}})()`);const{data}=await s.send('Page.captureScreenshot',{format:'png',clip});writeFileSync(new URL((route.includes('/label/')?'label':'detail')+'-'+width+'.png',out),Buffer.from(data,'base64'));
 }
}
}
writeFileSync(new URL('report.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify({observations:results.length,publicReferences:true,visibleUuids:0}));
}finally{s.close();await closeTab(target)}
