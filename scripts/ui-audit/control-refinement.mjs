// Read-only fixture browser regression; shortcut events are explicitly programmatic.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PROBE} from './probe.mjs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/control-refinement/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr){for(let i=0;i<100;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function click(expr){assert(await s.evaluate(`(()=>{const e=${expr};if(!e)return false;e.click();return true})()`));await pause(250)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',out),Buffer.from(data,'base64'))}
async function login(role){await s.send('Network.clearBrowserCookies');await s.send('Network.setExtraHTTPHeaders',{headers:{}});await s.goto(origin+(role==='super'?'/login/super-admin':'/login/tenant'));await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email',${JSON.stringify(role+'@geraicuan.com')}],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await click(`document.querySelector('.auth-submit')`);try{await wait(`location.pathname===${JSON.stringify(role==='super'?'/platform':'/app')}`)}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}}
try {
for(const d of ['Page','Runtime','Network','DOM','CSS'])await s.send(d+'.enable');
await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});await login('tenant');
for(const width of [1440,390]){
await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'settings-many'}});
await s.goto(origin+'/app/pengaturan?outlet=79000000-0000-4000-8000-000000000004');await wait(`!!document.getElementById('outlet-detail-title')&&!document.querySelector('[data-slot=skeleton]')`);await pause(400);
const probe=JSON.parse(await s.evaluate(PROBE));assert(probe.focusProbed>0);assert.equal(probe.weakFocusRing,0);assert.equal(probe.contrastFails,0);assert.equal(probe.overflow,0);
await s.evaluate(`window.scrollTo({top:0,behavior:'instant'})`);await shot('settings-'+width);
await click(`document.querySelector('button[aria-label="Cari halaman"]')`);await wait(`!!document.querySelector('[cmdk-input]')`);await pause(400);await shot('search-focus-'+width);
const search=await s.evaluate(`(()=>{const i=document.querySelector('[cmdk-input]'),g=i.parentElement;return {inputOutline:getComputedStyle(i).outline,inputShadow:getComputedStyle(i).boxShadow,groupOutline:getComputedStyle(g).outline,groupShadow:getComputedStyle(g).boxShadow}})()`);assert(search.inputOutline.includes('none'));assert(!search.inputShadow.includes('0px 0px 0px 2px'));assert(search.groupShadow.includes('0px 0px 0px 2px'));results.push({width,probe,search});
await click(`document.querySelector('button[aria-label="Tutup pencarian"]')`);
await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'contacts-area-results'}});
await s.goto(origin+'/app/kontak/baru');await wait(`!!document.getElementById('addressText')&&!document.querySelector('[data-slot=skeleton]')`);await pause(350);
for(const [selector,name] of [['#contactPhone','input'],['#addressText','textarea'],['#status-kiriman','select']]){
if(name==='select'){await s.goto(origin+'/app/pengiriman');await wait(`!!document.getElementById('status-kiriman')&&!document.querySelector('[data-slot=skeleton]')`);await pause(350)}
for(const state of ['idle','focus','invalid-focus','invalid-hover','disabled']){
await s.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});e.disabled=false;e.removeAttribute('aria-invalid');e.blur();if(${JSON.stringify(state)}.startsWith('invalid-'))e.setAttribute('aria-invalid','true');if(${JSON.stringify(state)}==='disabled')e.disabled=true;else if(${JSON.stringify(state)}!=='idle')e.focus()})()`);await pause(250);
if(state==='invalid-hover'){const{root}=await s.send('DOM.getDocument');const{nodeId}=await s.send('DOM.querySelector',{nodeId:root.nodeId,selector});await s.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover']});await pause(250)}
const sample=await s.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),c=getComputedStyle(e),r=(e.closest('[data-slot=field]')||e).getBoundingClientRect();return {border:c.borderTopWidth,borderColor:c.borderTopColor,invalid:e.getAttribute('aria-invalid'),hovered:e.matches(':hover'),outline:c.outlineStyle,shadow:c.boxShadow,opacity:c.opacity,focused:document.activeElement===e,clip:{x:Math.max(0,r.x-6),y:Math.max(0,r.y-6)+scrollY,width:Math.min(innerWidth-Math.max(0,r.x-6),r.width+12),height:Math.min(innerHeight-Math.max(0,r.y-6),r.height+12),scale:1}}})()`);
assert.equal(sample.border,'1px');if(state.includes('focus')||state==='invalid-hover'){assert(sample.focused);assert.equal(sample.outline,'none');assert(sample.shadow.includes('0px 0px 0px 2px'))}else{assert(!sample.shadow.includes('0px 0px 0px 2px'));if(state==='disabled')assert(!sample.focused)}
if(state==='invalid-focus')var invalidBorder=sample.borderColor;if(state==='invalid-hover'){assert.equal(sample.borderColor,invalidBorder)}
const{data}=await s.send('Page.captureScreenshot',{format:'png',clip:sample.clip});writeFileSync(new URL(name+'-'+state+'-'+width+'.png',out),Buffer.from(data,'base64'));results.push({width,name,state,...sample});if(state==='invalid-hover'){const{root}=await s.send('DOM.getDocument');const{nodeId}=await s.send('DOM.querySelector',{nodeId:root.nodeId,selector});await s.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]})}
}
await s.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.disabled=false;e.removeAttribute('aria-invalid')})()`);
}
await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'dashboard-period-demo'}});await s.goto(origin+'/app');await wait(`!!document.getElementById('dashboard-rentang')&&!document.querySelector('[data-slot=skeleton]')`);await s.evaluate(`document.getElementById('dashboard-rentang').focus()`);await pause(250);const native=await s.evaluate(`(()=>{const e=document.getElementById('dashboard-rentang'),c=getComputedStyle(e);return {focused:document.activeElement===e,outline:c.outlineStyle,shadow:c.boxShadow}})()`);assert(native.focused&&native.outline==='none'&&native.shadow.includes('0px 0px 0px 2px'));results.push({width,name:'native-select',...native});
}
writeFileSync(new URL('report.json',out),JSON.stringify(results,null,2));console.log(JSON.stringify({observations:results.length}));
}finally{s.close();await closeTab(target)}
