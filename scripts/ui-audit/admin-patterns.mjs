// T-162 (PR-52 state summary panel) and T-163 (PR-53 date-range control),
// measured in the browser on the seeded dev tenant. Read-only: it navigates,
// opens the range panel, and clicks one panel entry per page, which is a GET
// navigation. No provider call, no mutation, no reseed.
//
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/admin-patterns.mjs
//
// Focus evidence is programmatic and says so: CDP Tab key events do not move
// focus in headless Chrome, so the shared PROBE focuses each control from
// script (with Emulation.setFocusEmulationEnabled on) and measures the painted
// ring. That proves the ring exists and meets contrast; it does not prove the
// tab order, which the render tests bind instead.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PROBE } from './probe.mjs';
import { Session, open, closeTab } from './cdp.mjs';

const origin = process.env.UI_AUDIT_ORIGIN;
assert(origin && ['localhost', '127.0.0.1', '100.127.67.86'].includes(new URL(origin).hostname));
const out = new URL('./.output/admin-patterns/', import.meta.url);
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
async function login() {
  await s.send('Network.clearBrowserCookies');
  await s.goto(origin + '/login/tenant');
  await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
  await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await pause(200);
  await s.evaluate(`document.querySelector('.auth-submit').click()`);
  await wait(`location.pathname==='/app'`);
}
const ready = `document.readyState==='complete'&&!!document.querySelector('main h1')&&!document.querySelector('[data-slot="skeleton"]')`;

const PANEL_ROUTES = [
  { entries: 6, param: 'status', route: '/app/pengiriman' },
  { entries: 5, param: 'status', route: '/app/pengiriman/rts' },
  { entries: 3, param: 'cetak', route: '/app/label' },
  { entries: 3, param: 'status', route: '/app/kontak/pengirim' },
  { entries: 3, param: 'status', route: '/app/kontak/penerima' },
];
const RANGE_ROUTES = ['/app', '/app/pengiriman', '/app/pengiriman/rts', '/app/label'];

const PANEL_MEASURE = `JSON.stringify((()=>{
  const form=document.querySelector('form[data-slot="state-summary-panel"]');
  if(!form) return {present:false};
  const list=form.querySelector('ul[aria-label]');
  const buttons=[...form.querySelectorAll('button[aria-pressed]')];
  const pressed=buttons.filter(b=>b.getAttribute('aria-pressed')==='true');
  const de=document.documentElement;
  return {
    present:true,
    label:list?list.getAttribute('aria-label'):null,
    entries:buttons.length,
    pressed:pressed.length,
    pressedValue:pressed[0]?pressed[0].value:null,
    pressedHasGlyph:pressed[0]?pressed[0].querySelectorAll('svg').length:0,
    glyphsInPanel:form.querySelectorAll('svg').length,
    minTarget:Math.round(Math.min(...buttons.map(b=>b.getBoundingClientRect().height))),
    panelOverflow:list?list.scrollWidth-list.clientWidth:null,
    ariaCurrentInPanel:form.querySelectorAll('[aria-current]').length,
    documentOverflow:de.scrollWidth-de.clientWidth,
    secondValue:buttons[1]?buttons[1].value:null,
  };
})())`;

const RANGE_MEASURE = `JSON.stringify((()=>{
  const panels=[...document.querySelectorAll('details[data-slot="date-range-filter"]')];
  if(panels.length!==1) return {count:panels.length};
  const d=panels[0];
  const summary=d.querySelector('summary');
  // The panel is a labelled group inside the disclosure, not a dialog: it never
  // unmounts, traps no focus and has no modality, and a permanently mounted
  // dialog role collided with the command palette's own.
  const dialog=d.querySelector('[role="group"][aria-label="Pilih rentang tanggal"]');
  const radios=[...d.querySelectorAll('input[type="radio"]')];
  const checked=radios.filter(r=>r.checked);
  const select=d.querySelector('select');
  const days=[...d.querySelectorAll('[data-day]')];
  const weekdays=[...d.querySelectorAll('th')].map(n=>n.textContent.trim()).filter(Boolean);
  const caption=d.querySelector('.rdp-caption_label');
  const de=document.documentElement;
  const sr=summary.getBoundingClientRect();
  const dr=dialog?dialog.getBoundingClientRect():null;
  return {
    count:1,
    open:d.open,
    haspopup:summary.getAttribute('aria-haspopup'),
    expanded:summary.getAttribute('aria-expanded'),
    triggerLabel:summary.innerText.trim(),
    triggerHeight:Math.round(sr.height),
    dialogVisible:!!dr&&dr.width>0&&dr.height>0,
    dialogWidth:dr?Math.round(dr.width):null,
    dialogRightEdge:dr?Math.round(dr.right):null,
    dialogOverflow:dialog?dialog.scrollWidth-dialog.clientWidth:null,
    viewportWidth:de.clientWidth,
    dateInputs:d.querySelectorAll('input[type="date"]').length,
    submittedPreset:(d.querySelector('input[name="rentang"]:checked')||{}).value??null,
    radios:radios.length,
    checked:checked.length,
    checkedValue:checked[0]?checked[0].value:null,
    radioName:radios[0]?radios[0].name:null,
    selectValue:select?select.value:null,
    dayCells:days.length,
    minDayTarget:days.length?Math.round(Math.min(...days.map(n=>n.querySelector('button')?.getBoundingClientRect().height??0))):null,
    weekdays:weekdays.slice(0,7),
    caption:caption?caption.textContent.trim():null,
    resolvedText:(d.querySelector('[id$="-range-resolved"]')||{}).textContent??null,
    documentOverflow:de.scrollWidth-de.clientWidth,
  };
})())`;

try {
  for (const d of ['Page', 'Runtime', 'Network', 'Log']) await s.send(d + '.enable');
  await s.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await viewport(1440);
  await login();

  // --- T-162: the state summary panel --------------------------------------
  for (const width of [1440, 390]) {
    await viewport(width);
    for (const { entries, param, route } of PANEL_ROUTES) {
      await s.goto(origin + route);
      await wait(ready);
      await pause(350);
      const m = JSON.parse(await s.evaluate(PANEL_MEASURE));
      assert(m.present, `${route} @${width}: no PR-52 state panel`);
      assert.equal(m.entries, entries, `${route} @${width}: ${m.entries} entries, expected ${entries}`);
      assert.equal(m.pressed, 1, `${route} @${width}: ${m.pressed} pressed entries`);
      assert.equal(m.ariaCurrentInPanel, 0, `${route} @${width}: a filter still claims aria-current`);
      assert(m.pressedHasGlyph >= 1, `${route} @${width}: the pressed entry is marked by colour alone`);
      assert.equal(m.glyphsInPanel, m.pressedHasGlyph, `${route} @${width}: a check glyph on an unpressed entry`);
      assert(m.minTarget >= 44, `${route} @${width}: smallest entry ${m.minTarget}px, expected >= 44`);
      assert(m.panelOverflow <= 1, `${route} @${width}: the panel scrolls horizontally by ${m.panelOverflow}px`);
      assert(m.documentOverflow <= 1, `${route} @${width}: document overflow ${m.documentOverflow}px`);

      // An entry is a filter: clicking it writes this page's own URL state.
      await s.evaluate(`document.querySelectorAll('form[data-slot="state-summary-panel"] button[aria-pressed]')[1].click()`);
      await wait(`new URL(location.href).searchParams.get(${JSON.stringify(param)})!==null`);
      await wait(ready);
      await pause(300);
      const after = JSON.parse(await s.evaluate(PANEL_MEASURE));
      const applied = await s.evaluate(`new URL(location.href).searchParams.get(${JSON.stringify(param)})`);
      assert.equal(applied, m.secondValue, `${route} @${width}: clicking wrote ${applied}, expected ${m.secondValue}`);
      assert.equal(after.pressed, 1, `${route} @${width}: ${after.pressed} pressed after applying`);
      assert.equal(after.pressedValue, m.secondValue, `${route} @${width}: the applied entry is not the pressed one`);
      // The range the page was on must survive the filter.
      const keptRange = await s.evaluate(`new URL(location.href).searchParams.get('rentang')`);
      if (!route.startsWith('/app/kontak/')) {
        assert(keptRange, `${route} @${width}: applying a panel entry dropped the range`);
      }
      results.push({ step: 'panel', route, width, entries: m.entries, minTarget: m.minTarget, applied, keptRange });
      await s.evaluate(`document.querySelector('form[data-slot="state-summary-panel"]').scrollIntoView({block:'center'})`);
      await shot(`panel-${route.replaceAll('/', '_')}-${width}`);
    }
  }

  // --- T-163: the one date-range control ------------------------------------
  for (const width of [1440, 390]) {
    await viewport(width);
    for (const route of RANGE_ROUTES) {
      await s.goto(origin + route);
      await wait(ready);
      await pause(400);
      const closed = JSON.parse(await s.evaluate(RANGE_MEASURE));
      assert.equal(closed.count, 1, `${route} @${width}: ${closed.count} range controls, expected exactly 1`);
      assert(!closed.haspopup, `${route} @${width}: the disclosure must not claim aria-haspopup=${closed.haspopup}`);
      assert.equal(closed.expanded, 'false', `${route} @${width}: trigger starts expanded`);
      assert(closed.triggerHeight >= (width < 768 ? 44 : 36), `${route} @${width}: trigger ${closed.triggerHeight}px`);
      assert(/\d{4}/.test(closed.triggerLabel), `${route} @${width}: trigger does not name the resolved range ("${closed.triggerLabel}")`);
      assert.equal(closed.dateInputs, 2, `${route} @${width}: ${closed.dateInputs} native date inputs`);
      assert(closed.submittedPreset, `${route} @${width}: no checked rentang radio while the panel was closed`);
      assert.equal(closed.radioName, 'rentang', `${route} @${width}: the preset radios are named ${closed.radioName}`);
      assert.equal(closed.dayCells, 0, `${route} @${width}: the calendar is mounted while the panel is closed`);
      assert(closed.documentOverflow <= 1, `${route} @${width}: document overflow ${closed.documentOverflow}px`);

      await s.evaluate(`document.querySelector('details[data-slot="date-range-filter"] > summary').click()`);
      await wait(`!!document.querySelector('details[data-slot="date-range-filter"] [data-day]')`);
      await pause(400);
      const open_ = JSON.parse(await s.evaluate(RANGE_MEASURE));
      assert.equal(open_.open, true, `${route} @${width}: the panel did not open`);
      assert.equal(open_.expanded, 'true', `${route} @${width}: aria-expanded did not follow the panel`);
      assert(open_.dialogVisible, `${route} @${width}: the panel group is not visible`);
      assert(open_.dayCells >= 55, `${route} @${width}: ${open_.dayCells} day cells, expected two months`);
      assert(open_.minDayTarget >= (width < 768 ? 44 : 32), `${route} @${width}: smallest day cell ${open_.minDayTarget}px`);
      assert.deepEqual(open_.weekdays, ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'], `${route} @${width}: weekday names ${JSON.stringify(open_.weekdays)}`);
      assert(/^[A-Z][a-z]+ \d{4}$/.test(open_.caption ?? ''), `${route} @${width}: caption "${open_.caption}" is not an Indonesian month and year`);
      assert.equal(open_.checked, 1, `${route} @${width}: ${open_.checked} presets marked`);
      assert.equal(open_.selectValue, open_.checkedValue, `${route} @${width}: the collapsed select and the preset list disagree`);
      assert(/Rentang aktif/.test(open_.resolvedText ?? ''), `${route} @${width}: the resolved range is not stated in text`);
      assert(open_.documentOverflow <= 1, `${route} @${width}: document overflow ${open_.documentOverflow}px with the panel open`);
      assert(open_.dialogRightEdge <= open_.viewportWidth + 1, `${route} @${width}: the panel overhangs the viewport by ${open_.dialogRightEdge - open_.viewportWidth}px`);
      assert(open_.dialogOverflow <= 1, `${route} @${width}: the panel scrolls horizontally by ${open_.dialogOverflow}px, clipping the second month`);

      // Screenshot before the probe: the probe focuses every control in turn,
      // which scrolls the page away from the panel it is meant to show.
      await s.evaluate(`document.querySelector('details[data-slot="date-range-filter"]').scrollIntoView({block:'center'})`);
      await shot(`range-${route.replaceAll('/', '_')}-${width}`);

      // Programmatic focus only — CDP Tab does not move focus in headless
      // Chrome. This measures the painted ring, not the tab order.
      const probe = JSON.parse(await s.evaluate(PROBE));
      assert.equal(probe.weakFocusRing, 0, `${route} @${width}: ${probe.weakFocusRing} controls without a measurable focus ring: ${JSON.stringify(probe.focusDetail)}`);
      assert.equal(probe.contrastFails, 0, `${route} @${width}: ${probe.contrastFails} contrast failures with the range panel open: ${JSON.stringify(probe.contrast)}`);
      // The real pointer target for a preset is its row, not the 16px dot the
      // probe measures, so the row is what is asserted here.
      const rows = JSON.parse(await s.evaluate(`JSON.stringify([...document.querySelectorAll('details[data-slot="date-range-filter"] [role="radiogroup"] label')].map(n=>Math.round(n.getBoundingClientRect().height)))`));
      if (width >= 1024) {
        assert.equal(rows.length, 8, `${route} @${width}: ${rows.length} preset rows, expected 8`);
        assert(Math.min(...rows) >= 36, `${route} @${width}: smallest preset row ${Math.min(...rows)}px`);
      }

      results.push({ step: 'range', route, width, trigger: closed.triggerLabel, triggerHeight: closed.triggerHeight, dayCells: open_.dayCells, minDayTarget: open_.minDayTarget, preset: open_.checkedValue, weakFocusRing: probe.weakFocusRing, contrastFails: probe.contrastFails });
    }
  }

  const errors = s.events().filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error');
  assert.equal(errors.length, 0, 'console errors: ' + JSON.stringify(errors.map((e) => e.params.entry.text)));

  writeFileSync(new URL('results.json', out), JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results, null, 1));
  console.log('ADMIN PATTERNS PASS');
} finally {
  s.close();
  await closeTab(target);
}
