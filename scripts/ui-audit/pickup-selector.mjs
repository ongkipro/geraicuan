// Local pickup layout regression. Real saved labels yield geometry only;
// screenshots use existing read-only synthetic fixtures. No settings/provider writes.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/pickup-selector.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';
import {PROBE} from './probe.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const output=new URL('./.output/pickup-selector/',import.meta.url);
mkdirSync(output,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];
const outlet='79000000-0000-4000-8000-000000000004';
async function waitFor(expression){for(let i=0;i<100;i++){if(await s.evaluate(expression).catch(()=>false))return;await pause(150)}throw Error(`Did not settle: ${expression}`)}
async function viewport(width,height=900){await s.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});await pause(200)}
async function visit(scenario){await s.send('Network.setExtraHTTPHeaders',{headers:scenario?{'x-geraicuan-ui-audit':scenario}:{}});await s.goto(origin+'/app/pengaturan'+(scenario==='settings-many'?'?outlet='+outlet:''));await waitFor(`!!document.querySelector('button[id^="pickup-"]') && !document.querySelector('[data-slot=skeleton]')`);await pause(300)}
async function screenshot(name){await pause(350);await waitFor(`document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity).length===0`);const {data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',output),Buffer.from(data,'base64'))}
async function geometry(){return s.evaluate(`(()=>{const b=document.querySelector('button[id^="pickup-"]'),t=b.querySelector('span'),br=b.getBoundingClientRect(),tr=t.getBoundingClientRect();return {buttonHeight:br.height,labelHeight:tr.height,contained:tr.top>=br.top&&tr.bottom<=br.bottom&&tr.left>=br.left&&tr.right<=br.right,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}})()`)}
async function search(value){await s.evaluate(`(()=>{const e=document.querySelector('[cmdk-input]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await pause(250)}
try{
 for(const d of ['Page','Runtime','Network'])await s.send(`${d}.enable`);
 await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');
 await waitFor(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
 await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
 await pause(250);await s.evaluate(`document.querySelector('.auth-submit').click()`);await waitFor(`location.pathname==='/app'`);
 await visit(null);
 for(const width of [1440,768,390]){await viewport(width);const g=await geometry();assert(g.contained,`Real saved label outside trigger at${width}`);assert(g.overflow<=1);results.push({kind:'real-saved-label',width,...g})}
 for(const [width,height]of [[1440,900],[768,900],[390,900],[390,480]]){
  await viewport(width,height);await visit('settings-many');
  const longLabel='Gudang Audit Utama, Jalan Contoh dengan alamat penjemputan lengkap, Blok B Nomor 123, Kecamatan Audit, Kota Bandung, Jawa Barat, Catatan lokasi '+ 'Bangunan'.repeat(24);
  // Inject synthetic text into the real rendered elements to stress CSS without
  // inventing provider data or changing the stored/selected option contract.
  await s.evaluate(`document.querySelector('button[id^="pickup-"] span').textContent=${JSON.stringify(longLabel)}`);
  const g=await geometry();assert(g.contained,`Synthetic long label outside trigger at${width}/${height}`);assert(g.overflow<=1);
  await s.evaluate(`document.querySelector('button[id^="pickup-"]').scrollIntoView({block:'center',behavior:'instant'})`);
  await screenshot(`long-trigger-${width}-${height}`);
  await s.evaluate(`document.querySelector('button[id^="pickup-"]').click()`);await waitFor(`document.querySelectorAll('[role=option]').length===12`);
  assert.equal(await s.evaluate(`document.querySelector('[cmdk-input]').getAttribute('aria-label')`),'Cari alamat pickup');
  const checked=await s.evaluate(`(()=>{const e=document.querySelector('[role=option][data-checked=true]');return {count:document.querySelectorAll('[role=option][data-checked=true]').length,checkOpacity:getComputedStyle(e.querySelector('svg')).opacity}})()`);
  assert.equal(checked.count,1);assert.equal(checked.checkOpacity,'1');
  const accent=await s.evaluate(`(()=>{const e=document.createElement('div');e.className='bg-accent';document.body.append(e);const c=getComputedStyle(e).backgroundColor;e.remove();return c})()`);
  for(const selector of ['[role=option]:not([data-checked=true])','[role=option][data-checked=true]']){
   await s.evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse'}))`);
   await waitFor(`document.querySelector(${JSON.stringify(selector)}).getAttribute('data-selected')==='true'`);
   const styles=await s.evaluate(`(()=>{const checked=document.querySelector('[role=option][data-checked=true]'),active=document.querySelector('[role=option][data-selected=true]');return {checkedBackground:getComputedStyle(checked).backgroundColor,activeRing:getComputedStyle(active).boxShadow}})()`);
   assert.equal(styles.checkedBackground,accent,'Checked fill must survive active-option movement');
   assert.notEqual(styles.activeRing,'none','Active option needs a distinct ring');
  }
  await s.evaluate(`document.querySelector('[role=option] span.grid span').textContent=${JSON.stringify(longLabel)}`);
  await pause(150);
  const popup=await s.evaluate(`(()=>{const p=document.querySelector('[data-slot=popover-content]'),l=p.querySelector('[cmdk-list]'),i=p.querySelector('[cmdk-input]');l.scrollTop=l.scrollHeight;const r=p.getBoundingClientRect(),ir=i.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:innerHeight,width:innerWidth,scrolls:l.scrollHeight>l.clientHeight,listHeight:l.clientHeight,inputFits:ir.left>=r.left+3&&ir.right<=r.right-3,searchVisible:ir.top>=r.top&&ir.bottom<=r.bottom,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}})()`);
  assert(popup.top>=0&&popup.bottom<=height+1&&popup.left>=0&&popup.right<=width+1,`Popup outside viewport ${JSON.stringify(popup)}`);
  assert(popup.scrolls&&popup.searchVisible);assert(popup.overflow<=1);
  assert(popup.listHeight>=120,`Not enough readable result space ${JSON.stringify(popup)}`);
  assert(popup.inputFits,'Search focus outline must fit inside the popup');
  await s.evaluate(`document.querySelector('[cmdk-list]').scrollTop=0`);await screenshot(`open-long-options-${width}-${height}`);
  await search('no-match-xyz');await waitFor(`!!document.querySelector('[cmdk-empty]')`);await screenshot(`no-results-${width}-${height}`);
  await search('');await waitFor(`document.querySelectorAll('[role=option]').length===12`);
  await s.evaluate(`document.querySelectorAll('[role=option]')[1].click()`);
  await waitFor(`document.querySelector('output').textContent.includes('Kecamatan Audit 2') && !document.querySelector('[data-slot=popover-content]')`);
  assert(await s.evaluate(`document.activeElement?.id==='pickup-${outlet}'`));
  await s.evaluate(`document.querySelector('[role=radio][value=private]').click()`);await waitFor(`!!document.querySelector('input[name=apiKey]')`);
  assert(await s.evaluate(`document.getElementById('pickup-help-${outlet}').textContent.includes('Default GeraiCUAN')`));
  assert(await s.evaluate(`document.querySelector('label[for="connection-platform-${outlet}"]').textContent.includes('Digunakan')`));
  const probe=JSON.parse(await s.evaluate(PROBE));assert.equal(probe.overflow,0);assert.equal(probe.contrastFails,0);assert.equal(probe.weakFocusRing,0);
  results.push({kind:'synthetic-interaction',width,height,geometry:g,popup,probe});
 }
 await viewport(390);await visit('settings-provider-error');await s.evaluate(`document.querySelector('button[id^="pickup-"]').click()`);await waitFor(`document.body.textContent.includes('Daftar pickup Mengantar belum dapat dimuat')`);await screenshot('provider-error-mobile');
 assert.equal(s.events().filter(e=>e.method==='Runtime.exceptionThrown').length,0);
 assert(!s.events().some(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url.includes('/api/public/')));
 writeFileSync(new URL('report.json',output),JSON.stringify(results,null,2));console.log(JSON.stringify({observations:results.length,longLabelContained:true,searchAndSelection:'PASS',draftSource:'PASS',runtimeExceptions:0,providerRequests:0}));
}finally{s.close();await closeTab(target)}process.exit(0);
