// Round 14 review found that contrast-selftest.mjs and sticky-check.mjs
// (via mutate-sticky.sh) prove only two of the probe's ~11 measurements
// actually catch a live-injected violation. The other eight existed, were
// summed into the sweep's headline numbers, and had never once been
// deliberately triggered and confirmed caught - the same "the guard's own
// hardening is unproven" pattern round 13 found in the two vitest guards,
// one level further into the browser probe itself.
import { Session, closeTab, open } from "./cdp.mjs";
import { PROBE } from "./probe.mjs";

const ORIGIN = process.env.UI_AUDIT_ORIGIN || "http://localhost:3000";
const t = await open("about:blank");
const s = await Session.attach(t.webSocketDebuggerUrl);
for (const d of ["Page", "Runtime", "Network", "Log"]) await s.send(`${d}.enable`);
await s.send("Emulation.setFocusEmulationEnabled", { enabled: true });
await s.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await s.send("Network.clearBrowserCookies");
await s.goto(`${ORIGIN}/login/tenant`);
await new Promise(r => setTimeout(r, 1600));
await s.evaluate(`(() => { const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(document.querySelector('#email'),'tenant@geraicuan.com'); set(document.querySelector('#password'),'admin123'); return true;})()`);
await new Promise(r => setTimeout(r, 300));
await s.evaluate(`document.querySelector('.auth-submit').click(), true`);
for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 250)); if (!(await s.evaluate("location.href")).includes("/login")) break; }
await s.goto(`${ORIGIN}/app/pengiriman`);
await new Promise(r => setTimeout(r, 1200));

const base = JSON.parse(await s.evaluate(PROBE));
// Independent navigation sets and scalar labels are valid, while duplicate
// current items within one set and missing section headings must still fail.
await s.evaluate(`(() => {
  const main = document.querySelector('main');
  for (const name of ['one', 'two']) {
    const nav = document.createElement('nav');
    nav.id = 'probe-nav-' + name;
    nav.setAttribute('aria-label', 'Probe pagination ' + name);
    nav.innerHTML = '<a href="#probe" aria-current="page">Page 1</a>';
    main.appendChild(nav);
  }
  const metric = document.createElement('div');
  metric.id = 'probe-stat'; metric.setAttribute('data-slot', 'card');
  metric.innerHTML = '<div data-slot="card-title">Probe count</div><div data-slot="stat-value">12</div>';
  main.appendChild(metric);
})()`);
const independent = JSON.parse(await s.evaluate(PROBE));
if (independent.current !== 1 || independent.titlesNotHeadings.length !== base.titlesNotHeadings.length) {
  throw new Error('Independent current sets or scalar KPI labels were incorrectly rejected');
}
await s.evaluate(`document.querySelector('nav[aria-label="Navigasi tenant"] [aria-current="page"]').removeAttribute('aria-current')`);
const missing = JSON.parse(await s.evaluate(PROBE));
if (missing.current !== 0) throw new Error('Pagination masked the missing current CMS destination');
await s.evaluate(`document.querySelector('nav[aria-label="Navigasi tenant"] a[href="/app/pengiriman"]').setAttribute('aria-current', 'page')`);
await s.evaluate(`document.querySelector('#probe-nav-one').insertAdjacentHTML('beforeend', '<a href="#other" aria-current="page">Page 2</a>')`);
const duplicate = JSON.parse(await s.evaluate(PROBE));
if (duplicate.current !== 2) throw new Error('Duplicate current pages within one navigation set were missed');
await s.evaluate(`document.querySelectorAll('#probe-nav-one, #probe-nav-two, #probe-stat').forEach(el => el.remove())`);
console.log("baseline:", JSON.stringify({
  headingSkips: base.headingSkips.length, titlesNotHeadings: base.titlesNotHeadings.length,
  imgNoAlt: base.imgNoAlt, tablistLinks: base.tablistLinks, nestedCards: base.nestedCards,
  smallTargetCount: base.smallTargetCount, unlabelledScroll: base.unlabelledScroll,
  longLineCount: base.longLineCount,
}));

// One violation per dimension, injected into the real page's <main>.
await s.evaluate(`(() => {
  const main = document.querySelector('main');

  // headingSkips: h1 -> h3 with no h2 between.
  const h3 = document.createElement('h3');
  h3.id = 'probe-coverage-h3';
  h3.textContent = 'PROBE skipped heading level';
  document.querySelector('h1').insertAdjacentElement('afterend', h3);

  // titlesNotHeadings: a card-title that is a div, not a heading.
  const fakeTitle = document.createElement('div');
  fakeTitle.setAttribute('data-slot', 'card-title');
  fakeTitle.id = 'probe-coverage-fake-title';
  fakeTitle.textContent = 'PROBE card title as a div';
  main.appendChild(fakeTitle);

  // imgNoAlt: an <img> with no alt attribute at all.
  const img = document.createElement('img');
  img.id = 'probe-coverage-img';
  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';
  main.appendChild(img);

  // tablistLinks: role=tablist wrapping a real link.
  const tablist = document.createElement('div');
  tablist.id = 'probe-coverage-tablist';
  tablist.setAttribute('role', 'tablist');
  const a = document.createElement('a');
  a.href = '#probe-coverage-tab';
  a.textContent = 'PROBE tab link';
  tablist.appendChild(a);
  main.appendChild(tablist);

  // nestedCards: a card inside a card.
  const outer = document.createElement('div');
  outer.id = 'probe-coverage-nested-outer';
  outer.setAttribute('data-slot', 'card');
  const inner = document.createElement('div');
  inner.setAttribute('data-slot', 'card');
  inner.textContent = 'PROBE nested card';
  outer.appendChild(inner);
  main.appendChild(outer);

  // smallTargetCount: two adjacent undersized buttons - a single isolated one
  // is exempt under the WCAG 2.5.8 spacing rule, confirmed live in round 14.
  const wrap = document.createElement('div');
  wrap.id = 'probe-coverage-small-targets';
  wrap.style.cssText = 'display:flex;gap:2px';
  for (let i = 0; i < 2; i++) {
    const b = document.createElement('button');
    b.style.cssText = 'width:16px;height:16px;padding:0';
    b.textContent = String(i);
    wrap.appendChild(b);
  }
  main.appendChild(wrap);

  // unlabelledScroll: an overflow-x:auto region with scrollable content, no
  // label and nothing focusable inside it.
  const scroller = document.createElement('div');
  scroller.id = 'probe-coverage-scroller';
  scroller.style.cssText = 'overflow-x:auto;width:100px;white-space:nowrap';
  scroller.textContent = 'PROBE unlabelled unreachable horizontal scroll region padded wide enough to actually overflow its 100px box';
  main.appendChild(scroller);

  // longLineCount: a paragraph well past the design system's max-w-2xl cap.
  const p = document.createElement('p');
  p.id = 'probe-coverage-long-line';
  p.style.cssText = 'width:900px';
  p.textContent = 'PROBE prose line deliberately wider than the six hundred seventy two pixel cap the design system enforces on every other paragraph in this application, long enough that its rendered box width alone should trip the check regardless of font metrics or character count assumptions.';
  main.appendChild(p);

  return true;
})()`);

const mutated = JSON.parse(await s.evaluate(PROBE));
console.log("injected:", JSON.stringify({
  headingSkips: mutated.headingSkips.length, titlesNotHeadings: mutated.titlesNotHeadings.length,
  imgNoAlt: mutated.imgNoAlt, tablistLinks: mutated.tablistLinks, nestedCards: mutated.nestedCards,
  smallTargetCount: mutated.smallTargetCount, unlabelledScroll: mutated.unlabelledScroll,
  longLineCount: mutated.longLineCount,
}));

const grew = (before, after) => after > before;
const checks = [
  ["headingSkips", grew(base.headingSkips.length, mutated.headingSkips.length)],
  ["titlesNotHeadings", grew(base.titlesNotHeadings.length, mutated.titlesNotHeadings.length)],
  ["imgNoAlt", grew(base.imgNoAlt, mutated.imgNoAlt)],
  ["tablistLinks", grew(base.tablistLinks, mutated.tablistLinks)],
  ["nestedCards", grew(base.nestedCards, mutated.nestedCards)],
  ["smallTargetCount", grew(base.smallTargetCount, mutated.smallTargetCount)],
  ["unlabelledScroll", grew(base.unlabelledScroll, mutated.unlabelledScroll)],
  ["longLineCount", grew(base.longLineCount, mutated.longLineCount)],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) console.log("DID NOT CATCH:", failed.join(", "));
console.log(failed.length ? "SELFTEST FAIL" : "PROBE COVERAGE SELFTEST PASS");

s.close();
await closeTab(t);
process.exit(failed.length ? 1 : 0);
