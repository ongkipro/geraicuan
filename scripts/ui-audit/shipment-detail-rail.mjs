// T-151 read-only browser evidence: Detail kiriman in the PR-45 detail pattern
// at 1440/390 across every shipment-detail state the UI audit scenarios reach
// (`src/lib/ui-audit-scenario.ts`), plus the seeded shipment's own state.
// No provider call, no Server Action, no mutation.
//
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/shipment-detail-rail.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PROBE } from './probe.mjs';
import { Session, open, closeTab } from './cdp.mjs';

const origin = process.env.UI_AUDIT_ORIGIN;
assert(origin && ['localhost', '127.0.0.1', '100.127.67.86'].includes(new URL(origin).hostname));
const out = new URL('./.output/shipment-detail-rail/', import.meta.url);
mkdirSync(out, { recursive: true });
const target = await open('about:blank');
const s = await Session.attach(target.webSocketDebuggerUrl);
const results = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(expr, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (await s.evaluate(expr).catch(() => false)) return;
    await pause(150);
  }
  throw Error(expr);
}
async function shot(name) {
  await pause(300);
  const { data } = await s.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL(name + '.png', out), Buffer.from(data, 'base64'));
}
async function viewport(width) {
  await s.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
  await pause(200);
}

// [scenario header, what the rail must hold, if anything beyond status and resi]
const STATES = [
  [null, null],
  ['shipment-detail-stale', null],
  ['shipment-detail-stream', null],
  ['shipment-detail-submitting', '#periksa-upaya-tersendat'],
  ['shipment-detail-payment-paying', '#periksa-upaya-tersendat'],
  ['shipment-detail-error', 'error'],
];
const RAIL = 'aside[aria-label="Status kiriman"]';

try {
  for (const d of ['Page', 'Runtime', 'Network']) await s.send(d + '.enable');
  await s.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await viewport(1440);
  await s.send('Network.clearBrowserCookies');
  await s.goto(origin + '/login/tenant');
  await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
  await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await pause(200);
  await s.evaluate(`document.querySelector('.auth-submit').click()`);
  await wait(`location.pathname==='/app'`);

  await s.goto(origin + '/app/pengiriman');
  await wait(`!!document.querySelector('main h1')&&!document.querySelector('[data-slot="skeleton"]')`);
  const detail = await s.evaluate(`[...document.querySelectorAll('main a[href^="/app/pengiriman/"]')].map(a=>a.getAttribute('href').split('?')[0]).find(h=>/^\\/app\\/pengiriman\\/\\d+$/.test(h))`);
  assert(detail, 'no numbered shipment detail link on Histori kiriman');

  for (const width of [1440, 390]) {
    for (const [scenario, expected] of STATES) {
      await viewport(width);
      await s.send('Network.setExtraHTTPHeaders', { headers: scenario ? { 'x-geraicuan-ui-audit': scenario } : {} });
      await s.goto(origin + detail);
      const name = `${width}-${scenario ?? 'seeded'}`;
      if (expected === 'error') {
        await wait(`/tidak dapat dimuat|Coba lagi|Muat ulang/i.test(document.body.innerText)`);
        const probe = JSON.parse(await s.evaluate(PROBE));
        assert(probe.overflow <= 1, `${name}: overflow ${probe.overflow}`);
        assert.equal(probe.contrastFails, 0, `${name}: ${JSON.stringify(probe.contrast)}`);
        await shot(name);
        results.push({ width, scenario, state: 'route-error', overflow: probe.overflow, contrastFails: probe.contrastFails });
        continue;
      }
      await wait(`!!document.querySelector('${RAIL}')&&!document.querySelector('[data-slot="skeleton"]')`, 200);
      await pause(400);
      const layout = JSON.parse(await s.evaluate(`JSON.stringify((()=>{
        const rail=document.querySelector('${RAIL}');
        const main=rail.previousElementSibling;
        const railBox=rail.getBoundingClientRect(),mainBox=main.getBoundingClientRect();
        const inRail=(sel)=>!!rail.querySelector(sel);
        const inMain=(sel)=>!!main.querySelector(sel);
        return {
          sideBySide: railBox.left >= mainBox.right,
          railBelow: railBox.top >= mainBox.bottom - 1,
          railPosition: getComputedStyle(rail).position,
          statusInRail: inRail('#status-lifecycle-heading'),
          resiInRail: inRail('#riwayat-label-heading'),
          dataInMain: ['#konteks-heading','#snapshot-pihak-heading','#hasil-penyedia-heading'].every(inMain),
          dataInRail: ['#konteks-heading','#snapshot-pihak-heading','#hasil-penyedia-heading'].some(inRail),
          expectedInRail: ${expected ? `inRail(${JSON.stringify(expected)})` : 'null'},
          expectedInMain: ${expected ? `inMain(${JSON.stringify(expected)})` : 'null'},
        };
      })())`));
      assert(layout.statusInRail && layout.resiInRail, `${name}: ${JSON.stringify(layout)}`);
      assert(layout.dataInMain && !layout.dataInRail, `${name}: ${JSON.stringify(layout)}`);
      if (expected) assert(layout.expectedInRail && !layout.expectedInMain, `${name}: ${expected} not on the rail — ${JSON.stringify(layout)}`);
      if (width === 1440) assert(layout.sideBySide && layout.railPosition === 'sticky', `${name}: ${JSON.stringify(layout)}`);
      else assert(layout.railBelow, `${name}: one column below the split — ${JSON.stringify(layout)}`);
      const probe = JSON.parse(await s.evaluate(PROBE));
      assert(probe.overflow <= 1, `${name}: overflow ${probe.overflow}`);
      assert.equal(probe.h1, 1, `${name}: h1`);
      assert.deepEqual(probe.headingSkips, [], `${name}: heading skips`);
      assert.equal(probe.weakFocusRing, 0, `${name}: ${JSON.stringify(probe.focusDetail)}`);
      assert.equal(probe.contrastFails, 0, `${name}: ${JSON.stringify(probe.contrast)}`);
      assert.equal(probe.smallTargetCount, 0, `${name}: ${JSON.stringify(probe.smallTargets)}`);
      await s.evaluate(`scrollTo({top:0,behavior:'instant'})`);
      await shot(name);
      results.push({ width, scenario, ...layout, overflow: probe.overflow, weakFocusRing: probe.weakFocusRing, contrastFails: probe.contrastFails, smallTargetCount: probe.smallTargetCount, focusProbed: probe.focusProbed });
    }
  }
  await s.send('Network.setExtraHTTPHeaders', { headers: {} });
  writeFileSync(new URL('report.json', out), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ detail, observations: results.length }));
  console.log('SHIPMENT DETAIL RAIL PASS');
} finally {
  s.close();
  await closeTab(target);
}
