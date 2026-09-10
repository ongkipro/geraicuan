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
  await new Promise(r=>setTimeout(r,800));
  const f = JSON.parse(await s.evaluate(`JSON.stringify((() => {
    const de = document.documentElement;
    const region = document.querySelector('[role="region"][tabindex="0"]');
    const nav = document.querySelector('nav[aria-label="Filter status retur"]');
    const cur = [...document.querySelectorAll('[aria-current]')].map(e => e.getAttribute('aria-current') + ':' + e.textContent.trim().slice(0,22));
    let focusRing = null;
    if (region) { region.focus(); focusRing = getComputedStyle(document.activeElement).outlineStyle + '/' + getComputedStyle(document.activeElement, ':focus-visible').outlineWidth; }
    return {
      overflow: de.scrollWidth - de.clientWidth,
      scrollRegionLabelled: !!region && !!region.getAttribute('aria-label'),
      regionScrolls: region ? region.scrollWidth > region.clientWidth : null,
      regionKeyboardReachable: region ? document.activeElement === region : null,
      filterNav: !!nav,
      ariaCurrent: cur,
      kpiCards: document.querySelectorAll('[data-slot="card"]').length,
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
  if (!f.filterNav) failures.push(`${w}px filter navigation landmark missing`);
  if (f.idLines !== 0) failures.push(`${w}px truncated identifier printed ${f.idLines} times`);
  if (f.kpiCards !== 1) failures.push(`${w}px card count ${f.kpiCards}, expected the single table card`);
  if (f.rows < 1) failures.push(`${w}px no rows rendered; the page was not populated`);
  const current = f.ariaCurrent.filter((v) => v.startsWith("page:"));
  const filters = f.ariaCurrent.filter((v) => v.startsWith("true:"));
  // The shell nav is duplicated in the DOM at the wider breakpoints and only
  // one copy is visible; what must never happen is a second *filter* claiming
  // to be the current page.
  if (current.length < 1) failures.push(`${w}px no current-page marker`);
  if (filters.length !== 1) failures.push(`${w}px active filter markers: ${filters.length}`);
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
