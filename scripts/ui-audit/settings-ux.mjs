// Local presentation checks use the existing read-only audit fixtures.
// No provider, credential or membership writes; only login and invalid empty-email validation are submitted.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/settings-ux.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Session, open, closeTab } from './cdp.mjs';
import { PROBE } from './probe.mjs';
const origin = process.env.UI_AUDIT_ORIGIN;
assert(origin && ['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const output = new URL('./.output/settings-ux/', import.meta.url);
mkdirSync(output, {recursive:true});
const target = await open('about:blank'), s = await Session.attach(target.webSocketDebuggerUrl);
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const results = [];
const MENU_PROBE = `JSON.stringify((()=>{const nav=document.querySelector('nav[aria-label="Menu pengaturan"]');const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0};const rows=[...nav.querySelectorAll('a')];const back=[...document.querySelectorAll('a[aria-label="Kembali ke Pengaturan"]')].filter(visible);return {navVisible:visible(nav),labels:rows.map(a=>a.querySelectorAll('span span')[0]?.textContent),descriptionsVisible:rows.map(a=>visible(a.querySelectorAll('span span')[1])),chevronsVisible:rows.map(a=>visible(a.querySelector('svg.lucide-chevron-right'))),current:rows.filter(a=>a.getAttribute('aria-current')==='true').map(a=>a.getAttribute('href')),backLinks:back.length,rowHeights:rows.map(a=>a.getBoundingClientRect().height)}})())`;
const keyboard = {};
async function waitFor(expression) {
  for(let i=0;i<100;i++) { if(await s.evaluate(expression).catch(()=>false)) return; await pause(150); }
  throw Error(`UI did not settle: ${expression}`);
}
async function screenshot(name) {
  await pause(350);
  await waitFor(`document.getAnimations().filter(a=>a.playState==='running' && a.effect?.getTiming().iterations!==Infinity).length===0`);
  const {data} = await s.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:!name.endsWith('-mobile')});
  writeFileSync(new URL(`${name}.png`,output),Buffer.from(data,'base64'));
}
async function visit(scenario,route,width=1440) {
  await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
  await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':scenario}});
  await s.goto(origin+route);
  await waitFor(`document.readyState==='complete' && !!document.getElementById('${route.startsWith('/app/anggota')?'tenant-members-title':'outlet-detail-title'}') && !document.querySelector('[data-slot=skeleton]')`);
  await pause(350);
}
async function clickText(text, selector='button') {
  const found=await s.evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)return false;e.click();return true})()`);
  assert(found,`Missing control ${text}`);await pause(200);
}
async function setSelect(selector,value) {
  await s.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause(150);
}
const readyOutlet='79000000-0000-4000-8000-000000000004';
const privateOutlet='79000000-0000-4000-8000-000000000005';
try {
  for(const d of ['Page','Runtime','Network'])await s.send(`${d}.enable`);
  await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await s.send('Network.clearBrowserCookies');
  await s.goto(origin+'/login/tenant');
  await waitFor(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
  await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await pause(250);await s.evaluate(`document.querySelector('.auth-submit').click()`);await waitFor(`location.pathname==='/app'`);
  if(!process.argv.includes('--interactions-only')) for(const [name,scenario,route] of [
    ['outlet-ready','settings-many','/app/pengaturan/outlet?outlet='+readyOutlet],
    ['outlet-incomplete','settings-many','/app/pengaturan/outlet'],
    ['outlet-provider-error','settings-provider-error','/app/pengaturan/outlet'],
    ['koneksi-ready','settings-connection-many','/app/pengaturan/koneksi?outlet='+readyOutlet],
    ['koneksi-attention','settings-private-attention','/app/pengaturan/koneksi'],
    ['members','members-populated','/app/anggota'],
    ['members-inactive','members-inactive','/app/anggota'],
    ['members-last-admin','members-single-admin','/app/anggota'],
  ]) {
    for(const width of [1440,768,390]) {
      await visit(scenario,route,width);
      const probe=JSON.parse(await s.evaluate(PROBE));
      // <= 0: a short settings page leaves `scrollbar-gutter: stable` room.
      assert(probe.overflow<=0,`${name}/${width} overflow ${probe.overflow}`);
      assert.equal(probe.contrastFails,0,`${name}/${width} contrast`);
      assert.equal(probe.weakFocusRing,0,`${name}/${width} focus`);
      await s.evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
      await screenshot(`${name}-${width}`);
      results.push({name,width,probe});
    }
  }
  // T-156: the PR-46 settings menu — full rows on the Profil gerai index below
  // lg, one back link on every other settings page, the left rail from lg.
  for(const width of [1440,1024,390]) {
    const railWidth = width>=1024;
    await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
    await s.send('Network.setExtraHTTPHeaders',{headers:{}});
    await s.goto(origin+'/app/pengaturan');
    await waitFor(`document.readyState==='complete' && !!document.getElementById('shipment-prefix-title') && !document.querySelector('[data-slot=skeleton]')`);
    await pause(300);
    const index=JSON.parse(await s.evaluate(MENU_PROBE));
    assert(index.navVisible,`menu hidden on the settings index at ${width}`);
    assert.deepEqual(index.current,['/app/pengaturan'],`index current ${width}`);
    assert.equal(index.backLinks,0,`the index must not offer a back link (${width})`);
    assert.equal(index.descriptionsVisible.every(Boolean),!railWidth,`index descriptions ${width}`);
    assert.equal(index.chevronsVisible.every(Boolean),!railWidth,`index chevrons ${width}`);
    if(!railWidth) assert(index.rowHeights.every(h=>h>=44),`index rows below 44px: ${JSON.stringify(index.rowHeights)}`);
    const indexProbe=JSON.parse(await s.evaluate(PROBE));
    // <= 0: Profil gerai is short enough that `scrollbar-gutter: stable` leaves
    // the document narrower than the viewport. Only a positive value is overflow.
    assert(indexProbe.overflow<=0,`profil-toko/${width} overflow ${indexProbe.overflow}`);
    assert.equal(indexProbe.contrastFails,0,`profil-toko/${width} contrast`);
    assert.equal(indexProbe.weakFocusRing,0,`profil-toko/${width} focus`);
    await s.evaluate(`window.scrollTo({top:0,behavior:'instant'})`);
    await screenshot(`profil-toko-${width}`);
    results.push({name:'profil-toko',width,probe:indexProbe,menu:index});

    await visit('settings-many','/app/pengaturan/outlet',width);
    const sub=JSON.parse(await s.evaluate(MENU_PROBE));
    assert.equal(sub.navVisible,railWidth,`subpage menu visibility ${width}`);
    assert.equal(sub.backLinks,railWidth?0:1,`subpage back link ${width}`);
    assert.deepEqual(sub.current,['/app/pengaturan/outlet'],`subpage current ${width}`);
    const subProbe=JSON.parse(await s.evaluate(PROBE));
    assert(subProbe.overflow<=0,`settings-subpage/${width} overflow ${subProbe.overflow}`);
    assert.equal(subProbe.contrastFails,0,`settings-subpage/${width} contrast`);
    assert.equal(subProbe.weakFocusRing,0,`settings-subpage/${width} focus`);
    results.push({name:'settings-subpage',width,probe:subProbe,menu:sub});
  }
  await visit('settings-connection-many','/app/pengaturan/koneksi?outlet='+readyOutlet,390);
  // Record native key delivery on a control this page owns.
  await s.evaluate(`document.getElementById('connection-private-${readyOutlet}').focus()`);
  const beforeRadio=await s.evaluate(`document.activeElement?.id`);
  await s.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
  await s.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
  keyboard.nativeArrowMoved=await s.evaluate(`document.activeElement?.id`)!==beforeRadio;
  await s.evaluate(`document.querySelector('[role=radio][value=private]').click()`);
  await waitFor(`!!document.querySelector('input[name=apiKey]')`);
  assert.equal(await s.evaluate(`document.querySelector('input[name=apiKey]').value`),'');
  // The persisted source stays marked "Digunakan" while the radio shows a draft
  // choice. (The `connectionMode` hidden input went with T-157's location form.)
  assert(await s.evaluate(`document.querySelector('label[for="connection-platform-${readyOutlet}"]').textContent.includes('Digunakan')`),'Persisted source must remain distinct from draft choice');
  await screenshot('outlet-private-draft-mobile');
  await visit('settings-connection-many','/app/pengaturan/koneksi?outlet='+privateOutlet,390);
  await s.evaluate(`document.querySelector('[role=radio][value=platform_default]').click()`);
  await clickText('Gunakan koneksi bawaan GeraiCUAN');
  await waitFor(`!!document.querySelector('[role=alertdialog]')`);
  await screenshot('outlet-confirm-mobile');
  await clickText('Batal');
  await waitFor(`!document.querySelector('[role=alertdialog]') && document.activeElement?.id==='connection-private-${privateOutlet}'`);
  // T-157 moved the pickup picker (and its provider-error state) to
  // /app/pengaturan/pickup, where scripts/ui-audit/pickup-selector.mjs owns it.
  await visit('settings-provider-error','/app/pengaturan/outlet',390);
  assert.equal(await s.evaluate(`document.querySelectorAll('[role=combobox]').length`),0,'the Outlet page carries no picker');
  assert(await s.evaluate(`!!document.querySelector('a[href^="/app/pengaturan/pickup?outlet="]')`),'the Outlet page links to the page that owns pickup');
  await screenshot('outlet-location-summary-mobile');
  await visit('members-populated','/app/anggota',390);
  // V-23 (T-202): the header "Undang anggota" jump button was removed; the card's submit is the one CTA.
  await s.evaluate(`document.getElementById('member-invite-email').focus()`);
  await waitFor(`document.activeElement?.id==='member-invite-email'`);
  await s.send('Page.bringToFront');
  await pause(700);
  await s.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await s.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  keyboard.nativeTabMoved=await s.evaluate(`document.activeElement?.id==='member-invite-role'`);
  await s.evaluate(`document.getElementById('member-invite-role').focus()`);
  assert(await s.evaluate(`document.activeElement?.id==='member-invite-role'`));
  await setSelect('#member-invite-role','TENANT_ADMIN');
  await screenshot('member-invite-mobile');
  // Empty email is rejected before withTenantContext, so this exercises action
  // validation/focus without inviting an account or changing membership.
  assert.equal(await s.evaluate(`document.getElementById('member-invite-email').value`),'');
  await s.evaluate(`document.getElementById('member-invite-email').form.requestSubmit()`);
  await waitFor(`document.getElementById('member-invite-email')?.getAttribute('aria-invalid')==='true' && document.activeElement?.id==='member-invite-email'`);
  assert.equal(await s.evaluate(`document.getElementById('member-invite-role').value`),'TENANT_ADMIN');
  await screenshot('member-invite-error-mobile');
  await s.evaluate(`document.querySelector('button[aria-label^="Kelola akses"]').click()`);
  await waitFor(`!!document.querySelector('select[id^="member-role-"]')`);
  const roleSelector='select[id^="member-role-"]';
  const current=await s.evaluate(`document.querySelector('${roleSelector}').value`);
  await setSelect(roleSelector,current==='OPERATOR'?'TENANT_ADMIN':'OPERATOR');
  await clickText('Tinjau perubahan');
  await waitFor(`!!document.querySelector('[role=alertdialog]')`);
  await screenshot('member-role-confirm-mobile');
  await clickText('Batalkan');
  await waitFor(`!document.querySelector('[role=alertdialog]') && document.activeElement?.textContent.trim()==='Tinjau perubahan'`);
  await clickText('Nonaktifkan anggota');
  await waitFor(`!!document.querySelector('[role=alertdialog]')`);
  await clickText('Batalkan');
  await waitFor(`!document.querySelector('[role=alertdialog]') && document.activeElement?.textContent.trim()==='Nonaktifkan anggota'`);
  await s.evaluate(`document.querySelector('select[id^="member-role-"]').scrollIntoView({block:'center',behavior:'instant'})`);
  await screenshot('member-controls-mobile');
  await visit('members-single-admin','/app/anggota',390);
  assert.equal(await s.evaluate(`document.querySelectorAll('button[aria-label^="Kelola akses"]').length`),0);
  assert(await s.evaluate(`document.body.textContent.includes('Tenant Admin aktif terakhir')`));
  // Confirm the real local saved outlet still renders; never capture its PII.
  await s.send('Network.setExtraHTTPHeaders',{headers:{}});
  await s.goto(origin+'/app/pengaturan/outlet');
  await waitFor(`!!document.getElementById('outlet-detail-title')`);
  assert(await s.evaluate(`document.getElementById('outlet-location-title')!==null && document.querySelector('[id^=origin-]').textContent.trim().length>0`),'the real outlet still states its location pair');
  assert.equal(s.events().filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  assert(!s.events().some(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url.includes('/api/public/')));
  writeFileSync(new URL(process.argv.includes('--interactions-only')?'interactions-report.json':'report.json',output),JSON.stringify({observations:results,interactions:'PASS',keyboard,providerWrites:0,membershipWrites:0},null,2));
  console.log(JSON.stringify({observations:results.length,interactions:'PASS',keyboard,runtimeExceptions:0,providerRequests:0,membershipWrites:0}));
} finally {s.close();await closeTab(target)}
process.exit(0);
