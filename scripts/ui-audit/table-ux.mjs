// Local seeded UI regression: no provider calls or database writes beyond fixture login.
// Add --interactions-only to rerun changed behavior without repeating the viewport sweep.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/table-ux.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Session, open, closeTab } from './cdp.mjs';
import { PROBE } from './probe.mjs';

const origin = process.env.UI_AUDIT_ORIGIN;
assert(origin && ['localhost', '127.0.0.1', '100.127.67.86'].includes(new URL(origin).hostname), 'Explicit local fixture origin required');
const output = new URL('./.output/table-ux/', import.meta.url);
mkdirSync(output, { recursive: true });
const target = await open('about:blank');
const session = await Session.attach(target.webSocketDebuggerUrl);
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) {
    if (await session.evaluate(expression).catch(() => false)) return;
    await pause(150);
  }
  throw new Error(`Did not settle: ${expression}`);
}
async function ready() {
  await waitFor(`document.readyState === 'complete' && !document.querySelector('[data-slot="skeleton"]')`);
  await pause(250);
}
async function viewport(width) {
  await session.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
  await pause(250);
}
async function screenshot(name) {
  await pause(100);
  const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL(`${name}.png`, output), Buffer.from(data, 'base64'));
}
async function login(role) {
  await session.send('Network.clearBrowserCookies');
  await viewport(1440);
  await session.goto(`${origin}/login/${role === 'super' ? 'super-admin' : 'tenant'}`);
  await waitFor(`(()=>{const f=document.querySelector('form');return f && Object.keys(f).some(k=>k.startsWith('__reactProps$') && typeof f[k]?.onSubmit==='function')})()`);
  await session.evaluate(`(()=>{for(const [id,value] of [['email','${role}@geraicuan.com'],['password','admin123']]){const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await pause(250);
  await session.evaluate(`document.querySelector('.auth-submit').click()`);
  try {
    await waitFor(`location.pathname === '${role === 'super' ? '/platform' : '/app'}'`);
  } catch {
    const message = await session.evaluate(`document.querySelector('#login-error')?.textContent || 'No rendered login error'`);
    throw new Error(`Local fixture login did not finish: ${message}`);
  }
  await ready();
}
async function observe(route, width) {
  await viewport(width);
  await session.goto(origin + route);
  await ready();
  await waitFor(`(()=>{return [...document.querySelectorAll('[data-slot="table-scroll-shell"]')].filter(shell=>shell.getBoundingClientRect().height>0).every(shell=>{const r=shell.querySelector(':scope > [role="region"]'),p=shell.querySelector(':scope > p');return p.hidden === (r.scrollWidth-r.clientWidth<=1)})})()`);
  const tables = await session.evaluate(`(()=>{
    return [...document.querySelectorAll('[data-slot="table-scroll-shell"]')].filter(shell => shell.getBoundingClientRect().height > 0).map(shell => {
      const region=shell.querySelector(':scope > [role="region"]'), hint=shell.querySelector(':scope > p'), table=region.querySelector('table');
      const heads=[...table.querySelectorAll('thead tr:first-child th')];
      return {width:region.clientWidth,scrollWidth:region.scrollWidth,hintVisible:getComputedStyle(hint).display!=='none',
        named:!!(region.getAttribute('aria-label')||region.getAttribute('aria-labelledby')),tabIndex:region.tabIndex,
        described:region.getAttribute('aria-describedby')?.split(' ').includes(hint.id)||false,
        regionCount:table.closest('[role="region"]').querySelectorAll('[role="region"]').length,
        headers:heads.map(h=>getComputedStyle(h).backgroundColor)};
    });
  })()`);
  // T-188: the contact directories render a table only from md; below md the same rows are cards.
  const cardsBelowMd = route.startsWith('/app/kontak/');
  const cards = cardsBelowMd ? await session.evaluate(`[...document.querySelectorAll('main ul[aria-label^="Daftar "]')].map(list=>({height:list.getBoundingClientRect().height,items:list.children.length}))`) : [];
  if (cardsBelowMd && width < 768) {
    assert.equal(tables.length, 0, `${route}/${width} table must not render below md`);
    assert(cards.length === 1 && cards[0].height > 0 && cards[0].items > 0, `${route}/${width} card list ${JSON.stringify(cards)}`);
  } else {
    assert(tables.length, `No rendered table at ${route}`);
    if (cardsBelowMd) assert(cards.every(list => list.height === 0), `${route}/${width} card list must be hidden from md ${JSON.stringify(cards)}`);
  }
  for (const table of tables) {
    assert.equal(table.hintVisible, table.scrollWidth - table.width > 1, `${route}/${width} overflow hint ${JSON.stringify(table)}`);
    assert.equal(table.described, table.hintVisible);
    assert(table.named && table.tabIndex === 0);
    assert.equal(table.regionCount, 0, 'One region per table');
    assert.equal(new Set(table.headers).size, 1, 'Pinned and ordinary header surfaces agree');
  }
  const probe = JSON.parse(await session.evaluate(PROBE));
  // `scrollbar-gutter: stable` reserves the gutter, so a short page such as an
  // empty /app/label reports a negative scrollWidth − clientWidth (−15). The rule
  // is horizontal overflow of more than 1px, as in admin-programme.mjs.
  assert(probe.overflow <= 1, `${route}/${width} document overflow ${probe.overflow}`);
  for (const key of ['unreachableScroll','unlabelledScroll','stickyIssues']) {
    assert.equal((Array.isArray(probe[key]) ? probe[key].length : probe[key]), 0, `${route}/${width} ${key}: ${JSON.stringify(probe[key])}`);
  }
  assert.equal(probe.contrastFails, 0);
  assert.equal(probe.weakFocusRing, 0);
  // Keep the table and its hint in frame instead of recording only the page header.
  await session.evaluate(`(()=>{const shell=[...document.querySelectorAll('[data-slot="table-scroll-shell"]')].find(e=>e.getBoundingClientRect().height>0)||document.querySelector('main ul[aria-label^="Daftar "]');shell.scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-80,behavior:'instant'})})()`);
  await screenshot(`${route.replace(/[^a-z0-9]+/gi,'-')}-${width}`);
  results.push({route,width,tables,cards,probe});
  writeFileSync(new URL('partial-report.json',output),JSON.stringify(results,null,2));
  console.log(`Screened ${route} ${width}px`);
}
try {
  for (const domain of ['Page','Runtime','Network','Log']) await session.send(`${domain}.enable`);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await session.send('Page.bringToFront');
  for (const role of ['tenant','super']) {
    await login(role);
    const routes = role === 'tenant'
      ? ['/app?support=created','/app/pengiriman','/app/pengiriman/rts','/app/kontak/pengirim','/app/kontak/penerima','/app/label']
      : ['/platform','/platform/tenant','/platform/audit'];
    if (!process.argv.includes('--interactions-only')) {
      for (const route of routes) for (const width of [390,768,1440]) await observe(route,width);
    }
    if (role === 'tenant') {
      await session.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'shipment-queue-paginated'}});
      await viewport(390);
      await session.goto(origin+'/app/pengiriman');await ready();
      const pager = await session.evaluate(`(()=>{const nav=document.querySelector('nav[aria-label="Paginasi histori kiriman"]');return [...nav.querySelectorAll(':scope > div > a,:scope > div > button')].map(e=>({y:e.getBoundingClientRect().y,h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width}))})()`);
      assert.equal(pager.length,4);assert.equal(new Set(pager.map(p=>p.y)).size,1);assert(pager.every(p=>p.h>=44&&p.w>=44));
      await session.evaluate(`document.querySelector('a[aria-label="Halaman berikutnya"]').click()`);
      await waitFor(`new URLSearchParams(location.search).get('page') === '2'`);await ready();
      assert((await session.evaluate(`document.querySelector('nav[aria-label="Paginasi histori kiriman"]').textContent`)).includes('Halaman 2'));
      await session.goto(await session.evaluate('location.href'));await ready();
      assert.equal(await session.evaluate(`new URLSearchParams(location.search).get('page')`),'2');
      await session.evaluate(`document.querySelector('a[aria-label="Halaman sebelumnya"]').click()`);
      await waitFor(`new URLSearchParams(location.search).get('page') !== '2'`);await ready();
      await session.evaluate(`document.querySelector('nav[aria-label="Paginasi histori kiriman"]').scrollIntoView({block:'end',behavior:'instant'})`);
      await screenshot('pagination-mobile');
      // Attempt native keyboard input, recording a programmatic scroll fallback when unavailable.
      await session.send('Page.bringToFront');
      await session.evaluate(`(()=>{const r=document.querySelector('[data-slot="table-container"]');r.scrollLeft=0;r.focus()})()`);
      await pause(200);
      const left = await session.evaluate(`document.querySelector('tbody tr > :first-child').getBoundingClientRect().left`);
      for(let i=0;i<8;i++) {await session.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39,nativeVirtualKeyCode:39});await session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39,nativeVirtualKeyCode:39});await pause(80);}
      await pause(350);
      const nativeArrowScroll = await session.evaluate(`document.querySelector('[data-slot="table-container"]').scrollLeft > 0`);
      if (!nativeArrowScroll) {
        // Some headless sessions do not deliver native keys. Record this limitation.
        await session.evaluate(`document.querySelector('[data-slot="table-container"]').scrollBy({left:160})`);
        await pause(200);
      }
      assert(await session.evaluate(`document.querySelector('[data-slot="table-container"]').scrollLeft > 0`), 'Native scroll region moves');
      assert(Math.abs(left-await session.evaluate(`document.querySelector('tbody tr > :first-child').getBoundingClientRect().left`))<1,'Pinned reference stays in place');
      await session.evaluate(`document.querySelector('[data-slot="table-scroll-shell"]').scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-80,behavior:'instant'});document.querySelector('tbody a').focus({preventScroll:true})`);await pause(200);
      const focus = await session.evaluate(`(()=>{const a=document.activeElement,c=a.closest('td'),r=a.closest('tr');return {row:getComputedStyle(r).backgroundColor,cell:getComputedStyle(c).backgroundColor,outline:getComputedStyle(a).outlineWidth,divider:getComputedStyle(c).boxShadow}})()`);
      assert.equal(focus.row,focus.cell);assert.notEqual(focus.divider,'none');assert.notEqual(focus.outline,'0px');
      await screenshot('keyboard-row-mobile');
      await session.evaluate(`document.querySelector('tbody tr').dataset.state='selected'`);
      await pause(250);
      const selected = await session.evaluate(`(()=>{const r=document.querySelector('tbody tr');return {row:getComputedStyle(r).backgroundColor,cell:getComputedStyle(r.firstElementChild).backgroundColor}})()`);
      assert.equal(selected.row,selected.cell);
      assert.notEqual(selected.row,focus.row,'Selected fill takes precedence over focus highlight');
      await session.evaluate(`delete document.querySelector('tbody tr').dataset.state`);
      await session.send('Network.setExtraHTTPHeaders',{headers:{}});
      results.push({interaction:'pagination reload/previous, mobile controls, scroll, row focus and selected CSS fixture',pager,focus,nativeArrowScroll});
      await session.evaluate(`document.getElementById('status-kiriman').click()`);
      await waitFor(`!!document.querySelector('[role=option]')`);
      await session.evaluate(`[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.trim()==='Draf').click()`);
      await waitFor(`new URLSearchParams(location.search).get('status') === 'DRAFT'`);await ready();
      await session.goto(await session.evaluate('location.href'));await ready();
      assert.equal(await session.evaluate(`document.getElementById('status-kiriman').textContent.trim()`),'Draf');
      await session.evaluate(`[...document.querySelectorAll('a')].find(e=>e.textContent.trim()==='Hapus filter').click()`);
      await waitFor(`!new URLSearchParams(location.search).has('status')`);await ready();
      await session.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'shipment-queue-empty'}});
      await session.goto(origin+'/app/pengiriman');await ready();
      assert.equal(await session.evaluate(`document.querySelectorAll('[data-slot=table-scroll-shell]').length`),0);
      assert(await session.evaluate(`document.body.textContent.includes('Belum ada kiriman tersimpan.')`));
      await session.send('Network.setExtraHTTPHeaders',{headers:{}});
      // T-204: /app/impor (the native CSV disclosure check) was removed with Impor CSV.
      results.push({interaction:'status filter, reload, reset and empty state'});
    } else {
      await session.goto(origin+'/platform/tenant');await ready();await viewport(390);
      const name='Gerai Nusantara Cabang Jakarta Selatan dengan Nama Tenant Sangat Panjang';
      await session.evaluate(`document.querySelector('table tbody a').textContent=${JSON.stringify(name)}`);await pause(300);
      const longName=await session.evaluate(`(()=>{const a=document.querySelector('table tbody a');return {text:a.textContent,width:a.getBoundingClientRect().width,scroll:a.scrollWidth,client:a.clientWidth,whiteSpace:getComputedStyle(a).whiteSpace}})()`);
      assert.equal(longName.text,name);assert(longName.width<=192);assert(longName.scroll<=longName.client+1);assert.equal(longName.whiteSpace,'normal');
      await session.evaluate(`document.querySelector('table').scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-80,behavior:'instant'})`);await screenshot('long-tenant-mobile');
      await session.evaluate(`(()=>{const a=document.querySelector('table tbody a'),r=a.closest('[role=region]');r.scrollLeft=100;a.focus({preventScroll:true})})()`);await pause(200);
      const platformFocus=await session.evaluate(`(()=>{const a=document.activeElement,r=a.closest('tr');return {row:getComputedStyle(r).backgroundColor,cell:getComputedStyle(r.firstElementChild).backgroundColor}})()`);
      assert.equal(platformFocus.row,platformFocus.cell);await screenshot('platform-focus-mobile');
      // Resize the actual table region to prove observer-driven hint removal and restoration.
      await viewport(1440);
      await session.evaluate(`(()=>{const t=document.querySelector('table');t.style.width='240px';t.style.minWidth='0';for(const row of t.rows)for(const cell of [...row.cells].slice(1))cell.hidden=true})()`);
      await waitFor(`document.querySelector('[data-slot="table-scroll-shell"]').querySelector(':scope > p').hidden`);
      await session.evaluate(`(()=>{const t=document.querySelector('table');t.style.width='1800px';for(const cell of t.querySelectorAll('[hidden]'))cell.hidden=false})()`);
      await waitFor(`!document.querySelector('[data-slot="table-scroll-shell"]').querySelector(':scope > p').hidden`);
      results.push({interaction:'complete long tenant name and ResizeObserver hint transitions',longName});
    }
  }
  const exceptions=session.events().filter(event=>event.method==='Runtime.exceptionThrown');
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  const reportName=process.argv.includes('--interactions-only')?'interactions-report.json':'report.json';
  writeFileSync(new URL(reportName,output),JSON.stringify(results,null,2));
  console.log(`PASS ${results.filter(row=>row.route).length} table route/viewport observations plus pagination, scroll-region, focus, long-name and resize checks`);
  if (results.some(row=>row.nativeArrowScroll===false)) console.log('LIMIT: native ArrowRight did not scroll in this headless session; programmatic scroll and focus were verified.');
} finally {session.close();await closeTab(target)}
process.exit(0);
