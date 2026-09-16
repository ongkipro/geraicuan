import { Session, closeTab, open } from "./cdp.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const ORIGIN = process.env.UI_AUDIT_ORIGIN || "http://localhost:3000";
const t = await open("about:blank");
const s = await Session.attach(t.webSocketDebuggerUrl);
for (const d of ["Page","Runtime","Network","Log"]) await s.send(`${d}.enable`);
const vp = (w) => s.send("Emulation.setDeviceMetricsOverride",{width:w,height:900,deviceScaleFactor:1,mobile:w<768});
await vp(1280);
await s.send("Network.clearBrowserCookies");
await s.goto(`${ORIGIN}/login/tenant`);
await new Promise(r=>setTimeout(r,1600));
await s.evaluate(`(() => { const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(document.querySelector('#email'),'tenant@geraicuan.com'); set(document.querySelector('#password'),'admin123'); return true;})()`);
await new Promise(r=>setTimeout(r,300));
await s.evaluate(`document.querySelector('.auth-submit').click(), true`);
for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,250)); if(!(await s.evaluate("location.href")).includes("/login")) break;}

const measurements = {};
for (const w of [390, 768, 1280]) {
  await vp(w);
  await s.goto(`${ORIGIN}/app/pengiriman/rts`);
  // A fixed 800 ms is not a readiness signal: at 1280 the shell had not always
  // painted, so the run reported "no current-page marker" for a page whose nav
  // link does carry aria-current once it settles. Wait for the page, then pause.
  for (let i = 0; i < 140; i += 1) {
    if (await s.evaluate(`document.readyState==='complete'&&!!document.querySelector('main h1')&&!document.querySelector('[data-slot="skeleton"]')`).catch(() => false)) break;
    await new Promise(r=>setTimeout(r,150));
  }
  await new Promise(r=>setTimeout(r,600));
  const f = JSON.parse(await s.evaluate(`JSON.stringify((() => {
    const de = document.documentElement;
    const region = document.querySelector('[role="region"][tabindex="0"]');
    // T-162: the filter chips became the shared PR-52 state panel — real
    // submit buttons carrying aria-pressed, not links carrying aria-current.
    const panel = document.querySelector('[data-slot="state-summary-panel"] ul[aria-label="Ringkasan status retur"]');
    const pressed = panel ? [...panel.querySelectorAll('button[aria-pressed="true"]')] : [];
    const cur = [...document.querySelectorAll('[aria-current]')].map(e => e.getAttribute('aria-current') + ':' + e.textContent.trim().slice(0,22));
    let focusRing = null;
    if (region) { region.focus(); focusRing = getComputedStyle(document.activeElement).outlineStyle + '/' + getComputedStyle(document.activeElement, ':focus-visible').outlineWidth; }
    return {
      overflow: de.scrollWidth - de.clientWidth,
      scrollRegionLabelled: !!region && !!region.getAttribute('aria-label'),
      regionScrolls: region ? region.scrollWidth > region.clientWidth : null,
      regionKeyboardReachable: region ? document.activeElement === region : null,
      statePanel: !!panel,
      panelEntries: panel ? panel.querySelectorAll('button[aria-pressed]').length : 0,
      panelPressed: pressed.length,
      panelPressedValue: pressed[0] ? pressed[0].value : null,
      panelMinTarget: panel ? Math.min(...[...panel.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height)) : null,
      panelOverflows: panel ? panel.scrollWidth - panel.clientWidth : null,
      ariaCurrent: cur,
      kpiCards: document.querySelectorAll('[data-slot="card"]').length,
      navTrigger: !!document.querySelector('button[aria-label="Buka atau tutup navigasi"]'),
      rows: document.querySelectorAll('tbody tr').length,
      idLines: (document.body.textContent.match(/\\bID:\\s*[0-9A-Za-z-]{4,}/g) || []).length,
    };
  })())`));
  measurements[w] = f;
  console.log(`${String(w).padStart(4)}px`, JSON.stringify(f));
  const { data } = await s.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  mkdirSync(new URL(".output/", import.meta.url), { recursive: true });
  writeFileSync(new URL(`.output/rts-${w}.png`, import.meta.url), Buffer.from(data, "base64"));
}
const errs = s.events().filter(e => e.method === "Log.entryAdded" && e.params.entry.level === "error");
console.log("console errors:", errs.length ? errs.map(e=>e.params.entry.text) : "none");

// These numbers were printed and then discarded: the validation script gated
// only on console errors, so every measurement below could have regressed
// silently. Each one is a decision this task made, so each is asserted and the
// exit code carries it.
const failures = [];
for (const [w, f] of Object.entries(measurements)) {
  if (f.overflow > 1) failures.push(`${w}px document overflow ${f.overflow}px`);
  if (!f.scrollRegionLabelled) failures.push(`${w}px scroll region unlabelled`);
  if (!f.regionScrolls) failures.push(`${w}px scroll region does not scroll`);
  if (!f.regionKeyboardReachable) failures.push(`${w}px scroll region not keyboard reachable`);
  if (!f.statePanel) failures.push(`${w}px PR-52 state panel missing`);
  if (f.panelEntries !== 5) failures.push(`${w}px state panel entries ${f.panelEntries}, expected 5`);
  if (f.panelPressed !== 1) failures.push(`${w}px state panel pressed entries ${f.panelPressed}, expected 1`);
  if (f.panelPressedValue !== "ALL") failures.push(`${w}px state panel pressed "${f.panelPressedValue}", expected ALL`);
  if (!(f.panelMinTarget >= 44)) failures.push(`${w}px smallest state panel target ${f.panelMinTarget}px, expected >= 44`);
  if (f.panelOverflows > 1) failures.push(`${w}px state panel scrolls horizontally by ${f.panelOverflows}px`);
  if (f.idLines !== 0) failures.push(`${w}px truncated identifier printed ${f.idLines} times`);
  // T-149/T-150 moved the operational lists out of card wrappers onto the page
  // ground, so the old "exactly one table card" expectation described a layout
  // that no longer exists. What must not come back is a card around the list.
  if (f.kpiCards !== 0) failures.push(`${w}px card count ${f.kpiCards}, expected the list to sit on the page ground`);
  if (f.rows < 1) failures.push(`${w}px no rows rendered; the page was not populated`);
  const current = f.ariaCurrent.filter((v) => v.startsWith("page:"));
  const filters = f.ariaCurrent.filter((v) => v.startsWith("true:"));
  // The shell nav is duplicated in the DOM at the wider breakpoints and only
  // one copy is visible; what must never happen is a second *filter* claiming
  // to be the current page.
  // Below the sidebar breakpoint the navigation lives in a closed sheet (T-164),
  // so no nav link is in the document and `aria-current` legitimately is not
  // either. What must hold there is that the navigation is reachable at all —
  // its labelled trigger — and where the sidebar *is* rendered, that the route
  // marks itself current. Asserting the marker at every width asserted a layout
  // this shell stopped having.
  if (w >= 1024) {
    if (current.length < 1) failures.push(`${w}px no current-page marker`);
  } else if (!f.navTrigger) {
    failures.push(`${w}px navigation has neither a current-page marker nor its labelled trigger`);
  }
  // The panel marks itself with aria-pressed now, so no filter may claim
  // aria-current at all — the shell keeps the one truthful current page.
  if (filters.length !== 0) failures.push(`${w}px filters still claiming aria-current: ${filters.length}`);
}
if (errs.length) failures.push(`${errs.length} console errors`);
if (failures.length) {
  console.log("A11Y FAILURES:");
  for (const line of failures) console.log("  " + line);
} else {
  console.log("A11Y ASSERTIONS PASS");
}
s.close();
await closeTab(t);
process.exit(failures.length ? 1 : 0);
