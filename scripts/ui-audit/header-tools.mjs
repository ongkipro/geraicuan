// Read-only fixture browser regression; shortcut events are explicitly programmatic.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/header-tools/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr){for(let i=0;i<100;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function click(expr){assert(await s.evaluate(`(()=>{const e=${expr};if(!e)return false;e.click();return true})()`));await pause(250)}
async function input(value){await s.evaluate(`(()=>{const e=document.querySelector('[cmdk-input]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await pause(250)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',out),Buffer.from(data,'base64'))}
async function login(role){await s.send('Network.clearBrowserCookies');await s.send('Network.setExtraHTTPHeaders',{headers:{}});await s.goto(origin+(role==='super'?'/login/super-admin':'/login/tenant'));await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email',${JSON.stringify(role+'@geraicuan.com')}],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await click(`document.querySelector('.auth-submit')`);try{await wait(`location.pathname===${JSON.stringify(role==='super'?'/platform':'/app')}`)}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}}
try{
for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
for(const [role,count] of [['tenant',9],['operator',6],['super',3]].filter(([role])=>!process.env.AUDIT_ROLE||process.env.AUDIT_ROLE===role)){
await login(role);
await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':role==='super'?'platform-overview-empty':role==='operator'?'shipment-rts-paginated':'members-populated'}});
await s.goto(origin+(role==='super'?'/platform':role==='operator'?'/app/pengiriman/rts':'/app/anggota'));
for(const [width,height] of [[1440,900],[768,900],[390,900],[320,480]]){
await s.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});await pause(350);
await wait(`!!document.querySelector('[data-slot=cms-header] time[datetime]')`);
const geometry=await s.evaluate(`(()=>{const h=document.querySelector('[data-slot=cms-header]'),t=h.querySelector('time'),r=h.getBoundingClientRect();return {height:r.height,overflow:document.documentElement.scrollWidth-innerWidth,time:t.textContent,date:t.dateTime}})()`);assert(geometry.overflow<=0);assert(geometry.time.includes('GMT+7'));assert(await s.evaluate(`(()=>{const b=document.querySelector('button[aria-label="Cari halaman"]'),r=b.getBoundingClientRect();return [...b.children].filter(e=>e.getBoundingClientRect().width>0).every(e=>{const c=e.getBoundingClientRect();return c.left>=r.left&&c.right<=r.right})})()`),'Search trigger child bounds');
const before=geometry.date;await pause(1100);assert.notEqual(await s.evaluate(`document.querySelector('[data-slot=cms-header] time').dateTime`),before);
await shot(role+'-header-'+width);
await click(`document.querySelector('button[aria-label="Cari halaman"]')`);await wait(`!!document.querySelector('[cmdk-input]')`);
assert(await s.evaluate(`document.activeElement===document.querySelector('[cmdk-input]')`));assert.equal(await s.evaluate(`document.querySelectorAll('[cmdk-item]').length`),count);
const modal=await s.evaluate(`(()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,title:document.getElementById(d.getAttribute('aria-labelledby'))?.textContent}})()`);assert(modal.left>=0&&modal.right<=width&&modal.top>=0&&modal.bottom<=height);assert.equal(modal.title,'Cari halaman');
await shot(role+'-search-'+width);
await input('zzzz-nothing');assert.equal(await s.evaluate(`document.querySelectorAll('[cmdk-item]').length`),0);assert(await s.evaluate(`document.querySelector('[cmdk-empty]').textContent.includes('tidak ditemukan')`));await input('');
await click(`document.querySelector('button[aria-label="Tutup pencarian"]')`);await wait(`!document.querySelector('[role=dialog]')`);assert(await s.evaluate(`document.activeElement?.getAttribute('aria-label')==='Cari halaman'`));
results.push({role,width,height,geometry,modal});
}
if(role==='tenant'){
for(const mode of ['', 'plaintext-only','true']){
assert.equal(await s.evaluate(`(()=>{const e=document.createElement('div');e.id='shortcut-editable-fixture';e.setAttribute('contenteditable',${JSON.stringify(mode)});e.innerHTML='<span>editable fixture</span>';document.body.append(e);const event=new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true});e.querySelector('span').dispatchEvent(event);return event.defaultPrevented})()`),false);
await pause(200);assert.equal(await s.evaluate(`!!document.querySelector('[role=dialog]')`),false);await s.evaluate(`document.getElementById('shortcut-editable-fixture').remove()`);
}
assert.equal(await s.evaluate(`(()=>{const d=document.createElement('div');d.id='shortcut-modal-fixture';d.setAttribute('role','dialog');document.body.append(d);const event=new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true});window.dispatchEvent(event);return event.defaultPrevented})()`),false);await pause(200);assert.equal(await s.evaluate(`document.querySelectorAll('[role=dialog]').length`),1);await s.evaluate(`document.getElementById('shortcut-modal-fixture').remove()`);
await s.evaluate(`(()=>{const event=new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true});event.preventDefault();window.dispatchEvent(event)})()`);await pause(200);assert.equal(await s.evaluate(`!!document.querySelector('[role=dialog]')`),false);
await s.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}))`);await wait(`!!document.querySelector('[cmdk-input]')`);await input('histori');assert.equal(await s.evaluate(`document.querySelectorAll('[cmdk-item]').length`),1);
await click(`document.querySelector('[cmdk-item] a')`);await wait(`location.pathname==='/app/pengiriman'&&!document.querySelector('[role=dialog]')`);await click(`document.querySelector('button[aria-label="Cari halaman"]')`);await wait(`!!document.querySelector('[cmdk-item] a[href="/app/pengiriman"]')`);assert(await s.evaluate(`document.querySelector('[cmdk-item] a[href="/app/pengiriman"]').textContent.includes('Saat ini')`));await click(`document.querySelector('button[aria-label="Tutup pencarian"]')`);
await s.goto(origin+'/app/anggota');await wait(`(()=>{const b=document.querySelector('button[aria-label="Cari halaman"]');return location.pathname==='/app/anggota'&&b&&Object.keys(b).some(k=>k.startsWith('__reactProps$')&&typeof b[k]?.onClick==='function')})()`);
await click(`document.querySelector('button[aria-label="Cari halaman"]')`);await wait(`!!document.querySelector('[cmdk-input]')`);await input('kiriman');
const activeBefore=await s.evaluate(`document.querySelector('[cmdk-item][data-selected=true] a')?.getAttribute('href')`);
await s.evaluate(`document.querySelector('[cmdk-input]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',bubbles:true,cancelable:true}))`);await pause(200);
const activeAfter=await s.evaluate(`document.querySelector('[cmdk-item][data-selected=true] a')?.getAttribute('href')`);assert(activeAfter&&activeAfter!==activeBefore,'DOM ArrowDown changes active result');assert.notEqual(activeAfter,await s.evaluate('location.pathname'),'Enter must navigate to another page');
await s.evaluate(`document.querySelector('[cmdk-input]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}))`);await wait(`location.pathname===${JSON.stringify(activeAfter)}&&!document.querySelector('[role=dialog]')`);
await click(`document.querySelector('button[aria-label="Cari halaman"]')`);await wait(`!!document.querySelector('[cmdk-input]')`);await s.evaluate(`document.querySelector('[cmdk-input]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}))`);await wait(`!document.querySelector('[role=dialog]')`);assert(await s.evaluate(`document.activeElement?.getAttribute('aria-label')==='Cari halaman'`));
}
}
writeFileSync(new URL(process.env.AUDIT_ROLE?process.env.AUDIT_ROLE+'-report.json':'report.json',out),JSON.stringify({results,shortcut:'programmatic DOM events; native keyboard delivery not claimed'},null,2));console.log(JSON.stringify({observations:results.length,searchRoles:new Set(results.map(r=>r.role)).size,clockTick:true,editableGuard:results.some(r=>r.role==='tenant'),navigation:results.some(r=>r.role==='tenant')}));
}finally{s.close();await closeTab(target)}
