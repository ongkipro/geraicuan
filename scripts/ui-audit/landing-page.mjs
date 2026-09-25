// T-184 landing page audit: the built Astro site in apps/landing, served statically.
//
//   LANDING_ORIGIN=http://127.0.0.1:4391 CDP_PORT=9430 node scripts/ui-audit/landing-page.mjs
//
// EXPECT_APP_ORIGIN is the tenant origin the build was configured with
// (PUBLIC_APP_ORIGIN; default https://app.geraicuan.com). Every failure is reported
// under a check name, so a mutation can be matched to the check that caught it.
// Read-only: it never builds, edits or calls an application API.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Session, closeTab, open } from "./cdp.mjs";
import { PROBE } from "./probe.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const origin = process.env.LANDING_ORIGIN;
if (!origin || !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) {
  throw new Error("LANDING_ORIGIN must be a local origin, e.g. http://127.0.0.1:4391");
}
const appOrigin = new URL(process.env.EXPECT_APP_ORIGIN || "https://app.geraicuan.com").origin;
const dist = join(root, "apps/landing/dist");
const out = join(root, "scripts/ui-audit/.output/landing-page");
mkdirSync(out, { recursive: true });

const failures = [];
const fail = (check, detail) => failures.push({ check, detail });
const report = { appOrigin, static: {}, viewports: [] };

// --- token-parity: the landing copy of the brand tokens equals globals.css ----
{
  const declarations = (css) => new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.replace(/\s+/g, " ").trim()]));
  const cms = readFileSync(join(root, "src/app/globals.css"), "utf8");
  // The CMS's literal palette is the plain `:root {` block (the `:root, .dark` block holds aliases only).
  const cmsTokens = new Map([...cms.matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)].flatMap(([, body]) => [...declarations(body)]));
  const landing = readFileSync(join(root, "apps/landing/src/styles/landing.css"), "utf8");
  const block = landing.match(/:root\s*\{([^}]*)\}\s*\/\* End of copied tokens\. \*\//);
  if (!block) fail("token-parity", "landing.css has no copied token block");
  const landingTokens = declarations(block?.[1] ?? "");
  if (landingTokens.size < 10) fail("token-parity", `only ${landingTokens.size} tokens copied`);
  for (const [name, value] of landingTokens) {
    if (!cmsTokens.has(name)) fail("token-parity", `${name} is not a CMS token`);
    else if (cmsTokens.get(name) !== value) fail("token-parity", `${name}: landing ${value} != globals.css ${cmsTokens.get(name)}`);
  }
  // No token redefined anywhere else in the landing stylesheet.
  const outside = landing.replace(block?.[0] ?? "", "");
  for (const name of landingTokens.keys()) {
    if (new RegExp(`${name}\\s*:`).test(outside)) fail("token-parity", `${name} redefined outside the copied block`);
  }
  report.static.tokens = landingTokens.size;
}

// --- no-secret: nothing shaped like a credential, and no environment value -----
{
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else files.push(path); } };
  walk(dist);
  const shapes = [
    ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["database URL", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<]+/i],
    ["credential in URL", /\bhttps?:\/\/[^\s/"'<@]+:[^\s/"'<@]+@/i],
    ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
    ["Stripe/Resend-style key", /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}|\bre_[A-Za-z0-9_]{20,}/],
    ["GitHub/Slack token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,})/],
    ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
    ["secret variable name", /\b(?:DATABASE_URL|BETTER_AUTH_SECRET|RESEND_API_KEY|MENGANTAR_[A-Z_]+|[A-Z_]*(?:SECRET|PASSWORD|API_KEY|TOKEN)[A-Z_]*)\b/],
    ["import.meta.env reference", /import\.meta\.env|process\.env/],
  ];
  // Every value of this process's environment (the build runs in the same shell),
  // except the one public value the site is allowed to carry. Names only are reported.
  const allowed = new Set([appOrigin, process.env.PUBLIC_APP_ORIGIN].filter(Boolean));
  const envValues = Object.entries(process.env).filter(([, value]) => value && value.length >= 12 && !allowed.has(value));
  let bytes = 0;
  for (const file of files) {
    const text = readFileSync(file).toString("latin1");
    bytes += text.length;
    const where = file.slice(dist.length + 1);
    for (const [label, pattern] of shapes) if (pattern.test(text)) fail("no-secret", `${where}: ${label}`);
    for (const [name, value] of envValues) if (text.includes(value)) fail("no-secret", `${where}: value of environment variable ${name}`);
  }
  if (files.length === 0) fail("no-secret", "dist/ is empty: build first");
  report.static.secretScan = { files: files.length, bytes, patterns: shapes.length, envValuesChecked: envValues.length };
}

// --- seo-files ------------------------------------------------------------------
{
  const robots = await fetch(`${origin}/robots.txt`);
  const robotsText = await robots.text();
  if (!robots.ok || !/Sitemap: https:\/\/geraicuan\.com\/sitemap\.xml/.test(robotsText)) fail("seo-files", `robots.txt ${robots.status}`);
  const sitemap = await fetch(`${origin}/sitemap.xml`);
  if (!sitemap.ok || !(await sitemap.text()).includes("<loc>https://geraicuan.com/</loc>")) fail("seo-files", `sitemap.xml ${sitemap.status}`);
  const favicon = await fetch(`${origin}/favicon.svg`);
  if (!favicon.ok) fail("seo-files", `favicon.svg ${favicon.status}`);
}

// --- browser ------------------------------------------------------------------------
const PAGE_FACTS = `(() => {
  const meta = (selector) => document.querySelector(selector)?.getAttribute('content') ?? null;
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const links = [...document.querySelectorAll('a[href]')];
  const cta = (kind) => links.filter(a => a.dataset.cta === kind).map(a => ({ href: a.href, visible: visible(a) }));
  const narrow = innerWidth < 768;
  const smallTargets = [...document.querySelectorAll('a[href], button, summary, input, select, textarea')]
    .filter(visible)
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => narrow && (r.width < 44 || r.height < 44))
    .map(({ el, r }) => el.tagName.toLowerCase() + ':' + (el.textContent || '').trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  const skip = document.querySelector('body a[href]');
  const td = (key) => Number((document.querySelector('[data-cod="' + key + '"]')?.textContent || '').replace(/[^0-9]/g, ''));
  return {
    lang: document.documentElement.lang,
    title: document.title,
    description: meta('meta[name="description"]'),
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    og: { title: meta('meta[property="og:title"]'), description: meta('meta[property="og:description"]'), url: meta('meta[property="og:url"]'), locale: meta('meta[property="og:locale"]') },
    twitter: meta('meta[name="twitter:card"]'),
    icon: document.querySelector('link[rel="icon"]')?.getAttribute('href') ?? null,
    landmarks: { header: document.querySelectorAll('body > header').length, nav: document.querySelectorAll('nav[aria-label]').length, main: document.querySelectorAll('main').length, footer: document.querySelectorAll('body > footer').length },
    skip: { text: skip?.textContent.trim(), href: skip?.getAttribute('href'), target: !!document.querySelector(skip?.getAttribute('href') || 'x') },
    daftar: cta('daftar'), masuk: cta('masuk'),
    outbound: links.map(a => a.href).filter(h => !h.startsWith(location.origin)).map(h => new URL(h).origin),
    scripts: document.scripts.length,
    foreignRequests: performance.getEntriesByType('resource').map(e => e.name).filter(n => !n.startsWith(location.origin)),
    unlabelledSvgImages: [...document.querySelectorAll('svg')].filter(s => !s.closest('[aria-hidden="true"]') && !s.getAttribute('aria-label') && s.getAttribute('role') !== 'img').length,
    smallTargets,
    cod: { goods: td('goods'), shipping: td('shipping'), cod: td('cod'), fee: td('fee'), disbursement: td('disbursement') },
    codOngkir: Object.fromEntries(['shipping', 'break-even', 'charge', 'fee', 'difference'].map(key => [key, Number((document.querySelector('[data-cod-ongkir="' + key + '"]')?.textContent || '').replace(/[^0-9]/g, ''))])),
    paymentMethods: (() => {
      const section = document.getElementById('pembayaran');
      const items = section ? [...section.querySelectorAll('[data-payment-method]')] : [];
      return { section: !!section, labelledBy: section?.getAttribute('aria-labelledby') ?? null,
        items: items.map(li => ({ key: li.dataset.paymentMethod, name: li.querySelector('h3')?.textContent.trim() ?? '', visible: visible(li) })),
        navLink: [...document.querySelectorAll('nav a[href="#pembayaran"]')].length };
    })(),
    fontLoaded: [...document.fonts].some(f => /^"?Inter-/.test(f.family) && f.status === 'loaded'),
  };
})()`;

const target = await open("about:blank");
const s = await Session.attach(target.webSocketDebuggerUrl);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (const domain of ["Page", "Runtime", "Network"]) await s.send(`${domain}.enable`);
  await s.send("Network.setCacheDisabled", { cacheDisabled: true });
  await s.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await s.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await s.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await s.goto(`${origin}/`);
    await s.evaluate("document.fonts.ready.then(() => true)");
    await pause(200);
    const at = `${width}px`;
    const probe = JSON.parse(await s.evaluate(PROBE));
    const facts = await s.evaluate(PAGE_FACTS);

    if (probe.h1 !== 1) fail("h1-count", `${at}: ${probe.h1} visible h1`);
    if (probe.headingSkips.length) fail("heading-order", `${at}: ${probe.headingSkips.join("; ")}`);
    if (probe.contrastInspected < 20) fail("contrast", `${at}: only ${probe.contrastInspected} text nodes inspected`);
    if (probe.contrastFails) fail("contrast", `${at}: ${JSON.stringify(probe.contrast)}`);
    if (probe.focusProbed < 5) fail("focus-ring", `${at}: only ${probe.focusProbed} focus rings probed`);
    if (probe.weakFocusRing) fail("focus-ring", `${at}: ${JSON.stringify(probe.focusDetail)}`);
    if (probe.overflow > 0 || probe.wide.length) fail("overflow", `${at}: document overflow ${probe.overflow}px ${probe.wide.join(",")}`);
    if (probe.imgNoAlt || facts.unlabelledSvgImages) fail("images", `${at}: ${probe.imgNoAlt} img without alt, ${facts.unlabelledSvgImages} exposed unlabelled svg`);
    if (probe.smallTargetCount) fail("target-size-24", `${at}: ${JSON.stringify(probe.smallTargets)}`);
    if (facts.smallTargets.length) fail("target-size-44", `${at}: ${facts.smallTargets.join("; ")}`);

    const { landmarks } = facts;
    if (landmarks.header !== 1 || landmarks.nav < 1 || landmarks.main !== 1 || landmarks.footer !== 1) fail("landmarks", `${at}: ${JSON.stringify(landmarks)}`);
    if (facts.skip.href !== "#utama" || !facts.skip.target) fail("skip-link", `${at}: ${JSON.stringify(facts.skip)}`);

    for (const [kind, path] of [["daftar", "/daftar"], ["masuk", "/login"]]) {
      const expected = `${appOrigin}${path}`;
      const found = facts[kind];
      if (found.length === 0) fail("cta-origin", `${at}: no ${kind} call to action`);
      for (const link of found) if (link.href !== expected) fail("cta-origin", `${at}: ${kind} -> ${link.href}, expected ${expected}`);
      if (!found.some((link) => link.visible)) fail("cta-origin", `${at}: no visible ${kind} call to action`);
    }
    const strayOutbound = facts.outbound.filter((o) => o !== appOrigin);
    if (strayOutbound.length) fail("cta-origin", `${at}: links to other origins ${[...new Set(strayOutbound)].join(", ")}`);

    if (facts.scripts !== 0) fail("no-client-js", `${at}: ${facts.scripts} script elements`);
    if (facts.foreignRequests.length) fail("no-third-party", `${at}: ${facts.foreignRequests.join(", ")}`);

    if (facts.lang !== "id" || !facts.title || !facts.description || facts.canonical !== "https://geraicuan.com/"
      || !facts.og.title || !facts.og.description || facts.og.url !== "https://geraicuan.com/" || facts.twitter !== "summary" || !facts.icon) {
      fail("seo-meta", `${at}: ${JSON.stringify({ lang: facts.lang, canonical: facts.canonical, og: facts.og, twitter: facts.twitter, icon: facts.icon })}`);
    }

    // The COD proof point is recomputed here from PR-9, not read back from the page's own code.
    const { goods, shipping, cod, fee, disbursement } = facts.cod;
    const expectedCod = Math.ceil(((goods + shipping) * 10000) / 9667);
    const feeOf = (amount) => Math.floor((amount * 333 + 5000) / 10000);
    if (cod !== expectedCod || fee !== feeOf(cod) || disbursement !== cod - shipping - fee || disbursement < goods
      // Minimal: one rupiah less would not cover goods + shipping after the exact (unrounded) 3.33%.
      || (cod - 1) * 9667 >= (goods + shipping) * 10000) {
      fail("cod-example", `${at}: ${JSON.stringify(facts.cod)} expected COD ${expectedCod}`);
    }
    // T-191: the payment-methods section names exactly the product's three methods
    // (src/lib/payment-method.ts PAYMENT_METHODS and PAYMENT_METHOD_LABELS), in that order, all visible.
    {
      const { paymentMethods: pm } = facts;
      const expected = [["NON_COD", "Non-COD"], ["COD", "COD"], ["COD_ONGKIR", "COD Ongkir"]];
      const found = pm.items.map((item) => [item.key, item.name]);
      if (!pm.section || pm.labelledBy !== "judul-pembayaran" || JSON.stringify(found) !== JSON.stringify(expected)
        || pm.items.some((item) => !item.visible)) {
        fail("payment-methods", `${at}: ${JSON.stringify(pm)} expected ${JSON.stringify(expected)}`);
      }
    }
    // COD Ongkir example recomputed from T-186: break-even ceil(S × 10000 / 9667), difference C − S − round(3.33% × C).
    {
      const { shipping, "break-even": breakEven, charge, fee, difference } = facts.codOngkir;
      const expectedBreakEven = Math.max(1, Math.ceil((shipping * 10000) / 9667));
      const feeOf = (amount) => Math.floor((amount * 333 + 5000) / 10000);
      if (!shipping || breakEven !== expectedBreakEven || (breakEven - 1) * 9667 >= shipping * 10000
        || charge < breakEven || fee !== feeOf(charge) || difference !== charge - shipping - fee || difference < 0) {
        fail("cod-ongkir-example", `${at}: ${JSON.stringify(facts.codOngkir)} expected break-even ${expectedBreakEven}`);
      }
    }
    if (!facts.fontLoaded) fail("font", `${at}: Inter not loaded`);

    // Reduced motion: nothing animates and smooth scrolling is off.
    await s.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const motion = await s.evaluate(`({ scroll: getComputedStyle(document.documentElement).scrollBehavior, transition: getComputedStyle(document.querySelector('.btn')).transitionDuration, animations: document.getAnimations().length })`);
    if (motion.scroll !== "auto" || motion.transition !== "0s" || motion.animations) fail("reduced-motion", `${at}: ${JSON.stringify(motion)}`);
    await s.send("Emulation.setEmulatedMedia", { features: [] });

    const size = await s.evaluate("({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })");
    const { data } = await s.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.w, height: size.h, scale: 1 } });
    writeFileSync(join(out, `landing-${width}.png`), Buffer.from(data, "base64"));

    report.viewports.push({
      width, h1: probe.h1, contrastInspected: probe.contrastInspected, contrastFails: probe.contrastFails,
      focusProbed: probe.focusProbed, weakFocusRing: probe.weakFocusRing, overflow: probe.overflow,
      smallTargets24: probe.smallTargetCount, smallTargets44: facts.smallTargets.length,
      ctas: { daftar: facts.daftar.length, masuk: facts.masuk.length }, scripts: facts.scripts,
      foreignRequests: facts.foreignRequests.length, cod: facts.cod, codOngkir: facts.codOngkir, paymentMethods: facts.paymentMethods.items.map((item) => item.key), motion, pageHeight: size.h,
    });
  }
} finally {
  s.close();
  await closeTab(target);
}

report.failures = failures;
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(`FAIL ${[...new Set(failures.map((f) => f.check))].join(", ")}`);
  process.exit(1);
}
console.log("PASS landing-page");
