// T-157 Titik pickup regression: the outlet's pickup points as a list (add,
// set-default, remove) and the pickup choice in shipment creation.
// Real saved labels yield geometry only; every interaction runs on the existing
// read-only synthetic fixtures. No settings, pickup or provider writes.
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
async function visit(scenario,route='/app/pengaturan/pickup',settle=`!!document.getElementById('pickup-points-title')`){
 await s.send('Network.setExtraHTTPHeaders',{headers:scenario?{'x-geraicuan-ui-audit':scenario}:{}});
 await s.goto(origin+route);
 await waitFor(`document.readyState==='complete' && ${settle} && !document.querySelector('[data-slot=skeleton]')`);
 await pause(300);
}
async function screenshot(name){await pause(350);await waitFor(`document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.getTiming().iterations!==Infinity).length===0`);const {data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',output),Buffer.from(data,'base64'))}
const LIST_PROBE=`JSON.stringify((()=>{const list=document.querySelector('ul[aria-label="Daftar titik pickup"]');const rows=[...list.querySelectorAll('li')];const text=e=>e?.textContent?.trim()??'';return {rows:rows.length,defaults:rows.filter(r=>/Utama/.test(text(r))).length,promote:rows.filter(r=>[...r.querySelectorAll('button')].some(b=>text(b)==='Jadikan utama')).length,remove:rows.filter(r=>[...r.querySelectorAll('button')].some(b=>text(b)==='Hapus')).length,origins:rows.filter(r=>/Area asal:/.test(text(r))).length,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}})())`;
async function cleanProbe(name,width){
 const probe=JSON.parse(await s.evaluate(PROBE));
 assert(probe.overflow<=0,`${name}/${width} overflow ${probe.overflow}`);
 assert.equal(probe.contrastFails,0,`${name}/${width} contrast ${JSON.stringify(probe.contrast)}`);
 assert.equal(probe.weakFocusRing,0,`${name}/${width} focus`);
 return probe;
}
try{
 for(const d of ['Page','Runtime','Network'])await s.send(`${d}.enable`);
 await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');
 await waitFor(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
 await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
 await pause(250);await s.evaluate(`document.querySelector('.auth-submit').click()`);await waitFor(`location.pathname==='/app'`);

 // 1. The real saved outlet is NOT observed here: the developer database has
 // not been migrated to drizzle/0045 yet (the main session owns that sync), so
 // /app/pengaturan/pickup and /app/pengiriman/baru can only be observed through
 // the local fixtures below until it is.

 // 2. The synthetic list: three points, one default, promote only on the rest.
 for(const width of [1440,390]){
  await viewport(width,width<768?844:900);
  await visit('settings-pickup-list');
  const list=JSON.parse(await s.evaluate(LIST_PROBE));
  assert.equal(list.rows,3,`three pickup points at ${width}`);
  assert.equal(list.defaults,1,`one default at ${width}`);
  assert.equal(list.promote,2,`promotion offered on the two non-default rows at ${width}`);
  assert.equal(list.remove,3,`removal offered on every row at ${width}`);
  assert(list.overflow<=1,`list overflow at ${width}`);
  const probe=await cleanProbe('pickup-list',width);
  await screenshot(`pickup-list-${width}`);
  results.push({kind:'pickup-list',width,list,probe:{overflow:probe.overflow,contrastFails:probe.contrastFails,weakFocusRing:probe.weakFocusRing}});

  // Removal is a confirmation dialog, never a bare button. Cancel only.
  await s.evaluate(`[...document.querySelectorAll('ul[aria-label="Daftar titik pickup"] button')].find(b=>b.textContent.trim()==='Hapus').click()`);
  await waitFor(`!!document.querySelector('[role=alertdialog]')`);
  assert(await s.evaluate(`/Hapus titik pickup ini\\?/.test(document.querySelector('[role=alertdialog]').innerText)`));
  assert(await s.evaluate(`document.querySelector('[role=alertdialog] input[name=confirmation]')?.value==='remove-pickup-point'`),'removal carries its confirmation token');
  await screenshot(`pickup-remove-confirm-${width}`);
  await s.evaluate(`[...document.querySelectorAll('[role=alertdialog] button')].find(b=>b.textContent.trim()==='Batal').click()`);
  await waitFor(`!document.querySelector('[role=alertdialog]')`);

  // Adding: the provider list opens in the shared combobox and fills the area.
  await s.evaluate(`document.getElementById('pickup-${outlet}').click()`);
  await waitFor(`document.querySelectorAll('[role=option]').length===12`);
  assert.equal(await s.evaluate(`document.querySelector('[cmdk-input]').getAttribute('aria-label')`),'Cari alamat pickup');
  await s.evaluate(`document.querySelectorAll('[role=option]')[1].click()`);
  await waitFor(`document.querySelector('output').textContent.includes('Kecamatan Audit 2')`);
  assert.equal(await s.evaluate(`document.querySelector('input[name=pickupAddressId][type=hidden]').value`),'pickup-audit-2');
  assert(await s.evaluate(`!document.querySelector('#add-pickup-point-form ~ * button[type=submit], button[form=add-pickup-point-form]')?.disabled`),'the add control enables once a pickup is chosen');
  await screenshot(`pickup-add-selected-${width}`);
  // Never submit: adding would write a pickup point for a synthetic outlet.
 }

 // 3. The provider-error state keeps the saved list and offers no search.
 await viewport(390,844);await visit('settings-pickup-provider-error');
 await waitFor(`document.body.textContent.includes('Daftar pickup Mengantar belum dapat dimuat')`);
 assert.equal(await s.evaluate(`document.querySelectorAll('[role=combobox]').length`),0,'no search while the provider list is unavailable');
 assert(await s.evaluate(`document.querySelector('button[id^=pickup-]').disabled`));
 assert.equal(JSON.parse(await s.evaluate(LIST_PROBE)).rows,3,'the stored list survives a provider failure');
 await screenshot('pickup-provider-error-390');
 results.push({kind:'provider-error',width:390});

 // 4. The empty outlet says so instead of pretending it can ship.
 await visit('settings-pickup-empty');
 assert(await s.evaluate(`document.body.textContent.includes('Outlet ini belum dapat mengirim')`));
 await screenshot('pickup-empty-390');
 results.push({kind:'empty-outlet',width:390});

 // 5. Shipment creation: the choice defaults to the outlet's main point.
 for(const width of [1440,390]){
  await viewport(width,width<768?844:900);
  await visit('shipment-draft-pickup-choice','/app/pengiriman/baru',`!!document.getElementById('pickupAddressId')`);
  const choice=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const trigger=document.getElementById('pickupAddressId');const hidden=document.querySelector('input[name=pickupAddressId][type=hidden]');return {trigger:trigger.textContent.trim(),hidden:hidden.value,help:trigger.closest('[data-slot=field]')?.textContent??''}})())`));
  assert.match(choice.trigger,/Gudang Audit 1/,`the default point is preselected at ${width}`);
  assert.equal(choice.hidden,'pickup-audit-1',`the submitted pickup is the default at ${width}`);
  assert.match(choice.help,/Kecamatan Audit 1/,`the derived origin area is stated at ${width}`);
  // Buat kiriman carries two findings that pre-date this task and belong to the
  // T-159 screening pass: three weak focus rings on Radix's aria-hidden proxy
  // inputs (hazardous checkbox, two payment radios) and, at 390, the stepper's
  // clipped `span.sr-only` step label measured against `--primary`. They are
  // recorded, and anything the pickup choice itself adds still fails here.
  const probe=JSON.parse(await s.evaluate(PROBE));
  assert(probe.overflow<=0,`draft-pickup/${width} overflow ${probe.overflow}`);
  const newContrast=probe.contrast.filter(f=>f.where!=='span.sr-only');
  assert.equal(newContrast.length,0,`draft-pickup/${width} contrast ${JSON.stringify(newContrast)}`);
  const newFocus=(probe.focusDetail??[]).filter(f=>f.where!=='input:');
  assert.equal(newFocus.length,0,`draft-pickup/${width} focus ${JSON.stringify(newFocus)}`);
  assert(probe.weakFocusRing<=3,`draft-pickup/${width} new weak focus rings (${probe.weakFocusRing})`);
  await screenshot(`draft-pickup-default-${width}`);

  await s.evaluate(`document.getElementById('pickupAddressId').click()`);
  await waitFor(`document.querySelectorAll('[role=option]').length===3`);
  await s.evaluate(`document.querySelectorAll('[role=option]')[2].click()`);
  await waitFor(`document.querySelector('input[name=pickupAddressId][type=hidden]').value==='pickup-audit-3'`);
  const changed=await s.evaluate(`document.getElementById('pickupAddressId').closest('[data-slot=field]').textContent`);
  assert.match(changed,/Kecamatan Audit 3/,`the origin area follows the chosen point at ${width}`);
  await screenshot(`draft-pickup-chosen-${width}`);
  results.push({kind:'draft-pickup-choice',width,choice,preExisting:{contrast:probe.contrast,focusDetail:probe.focusDetail},probe:{overflow:probe.overflow,contrastFails:probe.contrastFails,weakFocusRing:probe.weakFocusRing}});
 }

 assert.equal(s.events().filter(e=>e.method==='Runtime.exceptionThrown').length,0);
 assert(!s.events().some(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url.includes('/api/public/')));
 writeFileSync(new URL('report.json',output),JSON.stringify(results,null,2));
 console.log(JSON.stringify({observations:results.length,pickupList:'PASS',draftChoice:'PASS',runtimeExceptions:0,providerRequests:0,pickupWrites:0}));
}finally{s.close();await closeTab(target)}process.exit(0);
