import { Session, closeTab, open } from "./cdp.mjs";
import { PROBE } from "./probe.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ORIGIN = process.env.UI_AUDIT_ORIGIN || "http://localhost:3000";
const VIEWPORTS = [390, 768, 1280];
const SHIPMENT = "72000000-0000-4000-8000-000000000012";
const LABELABLE = "72000000-0000-4000-8000-000000000014";
const CONTACT = "71000000-0000-4000-8000-000000000001";
const TENANT_ID = "70000000-0000-4000-8000-000000000001";
const AUDIT_HEADER = "x-geraicuan-ui-audit";

const CONCRETE = {
  "/app/pengiriman/[shipmentId]": `/app/pengiriman/${SHIPMENT}`,
  "/app/label/[shipmentId]": `/app/label/${LABELABLE}`,
  // T-188: a detail URL names the menu it was opened from, or it redirects.
  "/app/kontak/[contactId]": `/app/kontak/${CONTACT}?dari=pengirim`,
  "/platform/tenant/[tenantId]": `/platform/tenant/${TENANT_ID}`,
};

const TENANT = [
  "/app", "/app/pengiriman", "/app/pengiriman/rts", "/app/pengiriman/baru",
  CONCRETE["/app/pengiriman/[shipmentId]"], "/app/kontak/pengirim", "/app/kontak/penerima", "/app/kontak/baru",
  CONCRETE["/app/kontak/[contactId]"], "/app/label", CONCRETE["/app/label/[shipmentId]"],
  "/app/pengaturan", "/app/anggota",
];
const PLATFORM = ["/platform", "/platform/tenant", CONCRETE["/platform/tenant/[tenantId]"], "/platform/audit"];
const PUBLIC = ["/", "/login/tenant", "/login/super-admin"];
const requestedRoutes = process.env.UI_AUDIT_ROUTES?.split(',');
if (requestedRoutes?.some(path => ![...TENANT,...PLATFORM,...PUBLIC].includes(path))) throw new Error('Unknown UI_AUDIT_ROUTES path');
const selected = paths => requestedRoutes ? paths.filter(path => requestedRoutes.includes(path)) : paths;
const reportName = process.env.UI_AUDIT_REPORT || 'sweep-output';
if (!/^[a-z0-9-]+$/.test(reportName)) throw new Error('Invalid UI_AUDIT_REPORT');


const scenarios = JSON.parse(readFileSync(new URL("scenarios.json", import.meta.url), "utf8"));

/**
 * Scenarios a page load cannot reach.
 *
 * `contacts-area-*` are implemented inside a Server Action
 * (`src/app/app/location-actions.ts:103`) and only take effect when a search is
 * performed. Loading the route with the header set renders the base page, so
 * counting them as screened states was false: nine pairs were identical to the
 * base route and reported as covered. They are excluded here and named as
 * unscreened rather than quietly included.
 */
const SERVER_ACTION_ONLY = new Set([
  "contacts-area-error", "contacts-area-no-result", "contacts-area-results",
]);
const PLATFORM_ROUTES = new Set(["/platform", "/platform/tenant", "/platform/tenant/[tenantId]", "/platform/audit"]);

const t = await open("about:blank");
const s = await Session.attach(t.webSocketDebuggerUrl);
for (const d of ["Page", "Runtime", "Network", "Log"]) await s.send(`${d}.enable`);
// Without this a headless page is never focused, :focus-visible never matches,
// and the focus-ring probe reports nothing while looking like it passed.
await s.send("Emulation.setFocusEmulationEnabled", { enabled: true });

const vp = (w) => s.send("Emulation.setDeviceMetricsOverride",
  { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 768 });
const setScenario = (scenario) =>
  s.send("Network.setExtraHTTPHeaders", { headers: scenario ? { [AUDIT_HEADER]: scenario } : {} });

let currentLogin = null;
async function login(email, path) {
  currentLogin = { email, path };
  await setScenario(null);
  await s.send("Network.clearBrowserCookies");
  await vp(1280);
  await s.goto(`${ORIGIN}${path}`);
  let hydrated = false;
  for (let i=0;i<80;i++) {
    hydrated = await s.evaluate(`(() => {const form=document.querySelector('form');return Boolean(form && Object.keys(form).some(key => key.startsWith('__reactProps$') && typeof form[key]?.onSubmit === 'function'));})()`);
    if (hydrated) break;
    await new Promise(r=>setTimeout(r,250));
  }
  if (!hydrated) throw new Error('Local login form did not hydrate');
  await s.evaluate(`(() => { const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
    set(document.querySelector('#email'),'${email}'); set(document.querySelector('#password'),'admin123'); return true;})()`);
  await new Promise(r => setTimeout(r, 300));
  await s.evaluate(`document.querySelector('.auth-submit').click(), true`);
  for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 250)); if (!(await s.evaluate("location.href")).includes("/login")) break; }
  if ((await s.evaluate("location.href")).includes("/login")) throw new Error(`login failed: ${email}: ${await s.evaluate("document.querySelector('#login-error')?.textContent || 'no rendered error'")}`);
}

// A skeleton on screen *and* the stylesheet applied. Stopping at the first
// frame carrying a skeleton can catch it before CSS lands: one run measured
// `outline: 1px auto` (the user-agent default), a 0px shell gutter and two
// visible nav copies, all of which are the unstyled document rather than the
// loading state. `--ring` resolving is the cheapest proof the tokens are live.
const SKELETON = `Boolean(document.querySelector('[data-slot="skeleton"]'))
  && getComputedStyle(document.documentElement).getPropertyValue('--ring').trim() !== ''`;

// T-195: at 768 the CMS sidebar is the icon rail. Its group triggers are menu
// buttons, and the aria-current link lives in a flyout that is not rendered
// until opened, so the probe's aria-current count is 0 there by construction.
// The rail names the current section on the trigger's accessible description
// instead; read what Chrome computes for assistive technology, not the markup,
// so a description that never reaches the accessibility tree does not count.
async function railCurrentSections() {
  const { result } = await s.send("Runtime.evaluate", {
    expression: `[...document.querySelectorAll('nav[aria-label^="Navigasi "] button[aria-haspopup="menu"]')].filter(b => b.getBoundingClientRect().width > 0)`,
  });
  const { result: entries } = await s.send("Runtime.getProperties", { objectId: result.objectId, ownProperties: true });
  const sections = [];
  for (const entry of entries.filter(e => /^\d+$/.test(e.name))) {
    const { nodes } = await s.send("Accessibility.getPartialAXTree", { objectId: entry.value.objectId, fetchRelatives: false });
    const description = nodes[0]?.description?.value ?? "";
    if (/^Halaman saat ini: \S/.test(description)) sections.push(`${nodes[0].name?.value}: ${description}`);
  }
  await s.send("Runtime.releaseObject", { objectId: result.objectId });
  return sections;
}

const rows = [];
async function visit(scope, path, w, scenario = null, state = null) {
  await vp(w);
  await setScenario(scenario);
  let skeletonSeen = null;
  if (state === "loading") {
    // Stop at the first frame carrying a skeleton. Waiting for readyState
    // complete means waiting for the very stream the skeleton covers, so the
    // loading state is gone by the time a normal navigation returns.
    skeletonSeen = await s.gotoUntil(`${ORIGIN}${path}`, SKELETON);
    await new Promise(r => setTimeout(r, 120));
  } else {
    await s.goto(`${ORIGIN}${path}`);
    await new Promise(r => setTimeout(r, scenario ? 800 : 650));
  }
  let landed = await s.evaluate("location.pathname");
  // A long sweep outlives its session: one run lost the Super Admin cookie
  // partway through and reported 35 pairs redirected to the login page. The
  // redirect gate caught it, but a sweep that silently degrades wastes the run,
  // so re-authenticate once and retry the surface rather than recording it.
  if (landed.startsWith("/login") && !path.startsWith("/login") && currentLogin) {
    await login(currentLogin.email, currentLogin.path);
    await vp(w);
    await setScenario(scenario);
    await s.goto(`${ORIGIN}${path}`);
    await new Promise(r => setTimeout(r, 800));
    landed = await s.evaluate("location.pathname");
  }
  // The server renders the sidebar expanded; the shell collapses it to the rail
  // after hydration. A slow page probed before that shows the expanded tree,
  // and the rail check below would pass without ever seeing the rail.
  if (scope !== "public" && w === 768 && state !== "loading") {
    for (let i = 0; i < 20 && !(await s.evaluate(`!!document.querySelector('[data-slot="sidebar"][data-state="collapsed"]')`)); i++) await new Promise(r => setTimeout(r, 250));
  }
  const probe = JSON.parse(await s.evaluate(PROBE));
  const railCurrent = scope !== "public" && w === 768 ? await railCurrentSections() : null;
  if (process.env.UI_AUDIT_SCREENSHOTS === "1" && !scenario && w !== 768) {
    const directory = new URL(".output/pages/", import.meta.url);
    mkdirSync(directory, { recursive: true });
    const name = `${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}-${w}`;
    await s.evaluate("window.scrollTo(0,0); document.querySelectorAll('*').forEach(el => { if (el.scrollLeft) el.scrollLeft = 0; })");
    const layout = await s.send("Page.getLayoutMetrics");
    const { data } = await s.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(layout.cssContentSize.height, 4000), scale: 1 } });
    writeFileSync(new URL(`${name}.png`, directory), Buffer.from(data, "base64"));
    const text = await s.evaluate("document.querySelector('main')?.innerText ?? document.body.innerText");
    writeFileSync(new URL(`${name}.txt`, directory), text);
  }
  rows.push({ scope, path, w, scenario, state, landed, skeletonSeen, railCurrent, ...probe });
  mkdirSync(new URL('.output/', import.meta.url), {recursive:true});
  writeFileSync(new URL(`.output/${reportName}.json`, import.meta.url),JSON.stringify({partial:true,rows},null,2));
  console.log(`Screened ${path} ${w}px`);
}

async function sweep(scope, paths) {
  for (const path of paths) for (const w of VIEWPORTS) await visit(scope, path, w);
}

// T-197: a shipment detail or label URL carrying a seed UUID redirects to the
// shipment's public number, which is allocated when the seed runs, so a fixed
// UUID path screened only a redirect. The seed keeps the UUIDs fixed
// (scripts/seed-local-dev-users.mjs, 72…012 and 72…014); follow the app's own
// redirect once per run and screen the numbered page it lands on. An id that no
// longer resolves to a numbered page stops the run instead of screening a list,
// a login or a not-found page.
const CANONICAL = new Map();
async function resolveNumberedPage(path, pattern) {
  await setScenario(null);
  await s.goto(`${ORIGIN}${path}`);
  await new Promise(r => setTimeout(r, 650));
  const landed = await s.evaluate("location.pathname");
  if (!pattern.test(landed)) throw new Error(`${path} did not resolve to a numbered page (landed on ${landed})`);
  CANONICAL.set(path, landed);
}
const screenPath = (path) => CANONICAL.get(path) ?? path;

await sweep("public", selected(PUBLIC));
if (selected(TENANT).length) {
await login("tenant@geraicuan.com", "/login/tenant");
await resolveNumberedPage(CONCRETE["/app/pengiriman/[shipmentId]"], /^\/app\/pengiriman\/\d+$/);
await resolveNumberedPage(CONCRETE["/app/label/[shipmentId]"], /^\/app\/label\/\d+$/);
await sweep("tenant", selected(TENANT).map(screenPath));
}

// Every declared UI-audit scenario: the empty, loading, error, invalid-query
// and stale states the task's scope names and the route sweep cannot reach.
const stateRows = [];
const skippedScenarios = [];
async function sweepStates(scope, routes) {
  for (const route of routes) {
    const path = screenPath(CONCRETE[route] ?? route);
    for (const { scenario, state } of scenarios[route] ?? []) {
      if (SERVER_ACTION_ONLY.has(scenario)) { skippedScenarios.push(scenario); continue; }
      for (const w of VIEWPORTS) {
        const before = rows.length;
        await visit(scope, path, w, scenario, state);
        const row = rows.pop();
        stateRows.push(row);
        if (rows.length !== before) throw new Error("row bookkeeping");
      }
    }
  }
}
if (!process.env.T77_ROUTES_ONLY) await sweepStates("tenant", Object.keys(scenarios).filter(r => !PLATFORM_ROUTES.has(r)));

if (selected(PLATFORM).length) {
await login("super@geraicuan.com", "/login/super-admin");
await sweep("platform", selected(PLATFORM));
}
if (!process.env.T77_ROUTES_ONLY) await sweepStates("platform", Object.keys(scenarios).filter(r => PLATFORM_ROUTES.has(r)));
await setScenario(null);

mkdirSync(new URL(".output/", import.meta.url), { recursive: true });
writeFileSync(new URL(`.output/${reportName}.json`, import.meta.url), JSON.stringify({ partial:false, rows, stateRows }, null, 2));

const TIERS = [896, 1024, 1152, 1280, 1408]; // legacy widths plus T113 form/standard1024, data1280, wide1408
const GUTTER = { 390: 16, 768: 24, 1280: 32 };

function findings(r, { states = false } = {}) {
  const bits = [];
  if (r.overflow > 1) bits.push(`overflow=${r.overflow}px ${JSON.stringify(r.wide)}`);
  if (r.mains !== 1) bits.push(`main=${r.mains}`);
  if (r.h1 !== 1) bits.push(`h1=${r.h1}`);
  if (r.headingSkips.length) bits.push(`headingSkips=${JSON.stringify(r.headingSkips)}`);
  if (r.titlesNotHeadings.length) bits.push(`cardTitlesNotHeadings=${r.titlesNotHeadings.length} ${JSON.stringify(r.titlesNotHeadings.slice(0, 3))}`);
  if (r.longLineCount) bits.push(`longLines=${r.longLineCount} ${JSON.stringify(r.longLines)}`);
  // Exactly one on a surface whose navigation is on screen. Below 600px the
  // CMS nav is off-canvas and carries the marker with it, so zero there is the
  // shell's design rather than a missing indicator; `> 1` is always wrong.
  const navVisible = r.scope !== "public" && r.w >= 768;
  // At 768 (the icon rail) the current page is exposed either by a top-level
  // link's aria-current (Dasbor) or by one group trigger's description.
  const exposed = r.w === 768 ? r.current + (r.railCurrent?.length ?? 0) : r.current;
  if (r.current > 1 || (navVisible && exposed !== 1)) bits.push(`current=${r.current}${r.w === 768 ? ` railCurrent=${JSON.stringify(r.railCurrent)}` : ""}`);
  if (r.state === "loading" && r.skeletonSeen === false) bits.push("skeletonNeverRendered");
  if (r.stickyIssues?.length) bits.push(`stickyColumn=${JSON.stringify(r.stickyIssues)}`);
  if (r.unlabelledScroll) bits.push(`unreachableScroll=${JSON.stringify(r.unreachableScroll)}`);
  if (r.imgNoAlt) bits.push(`imgNoAlt=${r.imgNoAlt}`);
  if (r.tablistLinks) bits.push(`tablistOverLinks=${r.tablistLinks}`);
  if (r.nestedCards) bits.push(`nestedCards=${r.nestedCards}`);
  if (r.smallTargetCount) bits.push(`smallTargets=${r.smallTargetCount} ${JSON.stringify(r.smallTargets)}`);
  if (r.contrastFails) bits.push(`contrast=${r.contrastFails} ${JSON.stringify(r.contrast)}`);
  // A route-error boundary or a loading skeleton legitimately holds only a
  // handful of text nodes; a populated page holding four means the probe
  // measured nothing. The floor tracks what the state can contain.
  const floor = states && ["route-error", "loading", "not-found", "healthy-empty", "first-run"].includes(r.state) ? 4 : 10;
  if (r.contrastInspected < floor) bits.push(`contrastInspected=${r.contrastInspected} (vacuous, floor ${floor})`);
  if (r.weakFocusRing) bits.push(`weakFocusRing=${r.weakFocusRing}/${r.focusProbed} ${JSON.stringify(r.focusDetail)}`);
  // A loading skeleton legitimately has almost nothing focusable.
  if (r.focusProbed < 3 && !(states && r.state === "loading")) bits.push(`focusProbed=${r.focusProbed}`);
  if (r.shellKind === "cms" && r.gutter !== GUTTER[r.w]) bits.push(`gutter=${r.gutter}px expected ${GUTTER[r.w]}px`);
  // The marketing page carries the same 16/24/32 rhythm on its own centred
  // containers; the auth page is a centred card with one fixed page padding at
  // every width, which is a different layout rather than a broken gutter.
  if (r.shellKind === "page" && r.gutter !== GUTTER[r.w]) bits.push(`publicGutter=${r.gutter}px expected ${GUTTER[r.w]}px`);
  if (r.shellKind === "auth" && r.gutter !== 24) bits.push(`authPagePadding=${r.gutter}px expected 24px`);
  if (r.tier !== null && !TIERS.includes(r.tier) && r.tier < 2000) bits.push(`containerTier=${r.tier}px`);
  return bits;
}

// Exact match only. Any prefix rule accepts a real redirect: /app is a prefix
// of every tenant route, and a 6-character floor still accepts
// /app/pengiriman/rts -> /app/pengiriman and /platform/audit -> /platform.
const redirected = [...rows, ...stateRows].filter(r => r.landed !== r.path.split("?")[0]);

const problems = rows.map(r => [r, findings(r)]).filter(([, b]) => b.length);
const stateProblems = stateRows.map(r => [r, findings(r, { states: true })]).filter(([, b]) => b.length);

console.log(`route sweep: ${rows.length} surface/viewport pairs; ${problems.length} with findings`);
console.log(`state sweep: ${stateRows.length} scenario/viewport pairs; ${stateProblems.length} with findings`);
console.log("contrast elements inspected:", [...rows, ...stateRows].reduce((a, r) => a + r.contrastInspected, 0));
console.log("focus rings probed:", [...rows, ...stateRows].reduce((a, r) => a + r.focusProbed, 0));
const loadingRows = stateRows.filter(r => r.state === "loading");
// A scenario that renders exactly what the base route renders did not take
// effect, and must not be counted as a screened state.
const baseDigest = new Map(rows.map(r => [`${r.path}|${r.w}`, r.domDigest]));
/**
 * Scenarios that legitimately render what the base route renders.
 *
 * Each asks for a populated state, and the seeded database is already in one,
 * so identical output is the scenario working rather than failing. Declared by
 * name so a scenario that stops taking effect cannot hide among them.
 */
const SAME_AS_BASE_BY_DESIGN = new Set([
  "platform-audit-populated", "platform-audit-redacted",
  "platform-tenant-detail-one-outlet", "platform-tenant-populated",
]);
const ineffective = stateRows.filter(r => baseDigest.get(`${r.path}|${r.w}`) === r.domDigest
  && !SAME_AS_BASE_BY_DESIGN.has(r.scenario));
console.log("scenarios excluded as server-action-only:", [...new Set(skippedScenarios)].join(", ") || "none");
console.log("scenarios declared identical to their base route:",
  [...SAME_AS_BASE_BY_DESIGN].join(", "));
console.log("scenario pairs indistinguishable from their base route:", ineffective.length);
for (const r of [...new Set(ineffective.map(r => r.scenario))]) console.log(`  ${r}`);
console.log("loading skeletons captured:", loadingRows.filter(r => r.skeletonSeen).length, "of", loadingRows.length);
console.log("scrolling tables with a sticky first column:", [...rows, ...stateRows].reduce((a, r) => a + (r.stickyOk ?? 0), 0));
console.log("gutters seen:", [...new Set(rows.filter(r => r.shellKind === "cms").map(r => `${r.w}px:${r.gutter}`))].sort().join(" "));
console.log("container tiers seen:", [...new Set(rows.map(r => r.tier))].sort((a, b) => a - b).join(" "));
if (redirected.length) {
  console.log(`REDIRECTED (not actually screened): ${redirected.length}`);
  for (const r of redirected.slice(0, 10)) console.log(`  ${r.scenario ?? "-"} ${r.path} -> ${r.landed}`);
}
for (const [p, bits] of problems) console.log(`  ${String(p.w).padStart(4)}px ${p.path.padEnd(46)} ${bits.join(" | ")}`);
for (const [p, bits] of stateProblems) console.log(`  ${String(p.w).padStart(4)}px ${p.scenario.padEnd(38)} ${bits.join(" | ")}`);

const errs = s.events().filter(e => e.method === "Log.entryAdded" && e.params.entry.level === "error");
console.log("console errors:", errs.length ? errs.slice(0, 5).map(e => e.params.entry.text) : "none");
s.close();
await closeTab(t);
