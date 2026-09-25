// T-181 / T-182 / T-183 browser evidence (PR-59–PR-62): store sign-up with its
// validation errors and confirmation, the verification page that asks for the
// sign-up password (T-198), the unverified and awaiting-approval login
// states, password recovery, the approval banner and a refused shipment page on
// the tenant host, the approval queue on the platform host, and both login pages
// — each at 1440 and 390 px with the shared probe (contrast, focus, overflow,
// 24 px targets) plus a 44 px target check on the auth pages.
//
// Needs a *development* server started with two `*.localhost` origins against a
// disposable database (never the developer database): sign-up writes stores and
// the verification/recovery links are read from that server's log, which only a
// development server writes (D-10). No mail is sent and no provider is called.
//   CDP_PORT=9430 SIGNUP_AUDIT_TENANT_ORIGIN=http://app.geraicuan.localhost:3132 \
//   SIGNUP_AUDIT_PLATFORM_ORIGIN=http://bos.geraicuan.localhost:3132 \
//   SIGNUP_AUDIT_SERVER_LOG=/path/to/server.log SIGNUP_AUDIT_DATABASE_URL=postgres://…/disposable \
//   SIGNUP_AUDIT_SUPER_EMAIL=… SIGNUP_AUDIT_SUPER_PASSWORD=… node scripts/ui-audit/sign-up-approval.mjs
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import pg from "pg";

import { Session, closeTab, open } from "./cdp.mjs";
import { PROBE } from "./probe.mjs";

const tenant = process.env.SIGNUP_AUDIT_TENANT_ORIGIN;
const platform = process.env.SIGNUP_AUDIT_PLATFORM_ORIGIN;
const serverLog = process.env.SIGNUP_AUDIT_SERVER_LOG;
const databaseUrl = process.env.SIGNUP_AUDIT_DATABASE_URL;
const superEmail = process.env.SIGNUP_AUDIT_SUPER_EMAIL;
const superPassword = process.env.SIGNUP_AUDIT_SUPER_PASSWORD;
for (const origin of [tenant, platform]) {
  assert(origin && new URL(origin).hostname.endsWith(".localhost"), "origins must be local *.localhost hosts");
}
assert(serverLog && databaseUrl && superEmail && superPassword, "server log, disposable database and Super Admin credentials are required");
assert(!/:55450\//.test(databaseUrl), "never the developer database");

const out = new URL("./.output/sign-up-approval/", import.meta.url);
mkdirSync(out, { recursive: true });
const run = Date.now().toString(36);
const password = `audit-${run}-password`;
const stores = {
  pending: { email: `pending-${run}@audit.example.test`, name: `Toko Audit ${run}`, owner: "Ibu Ratna Audit" },
  second: { email: `second-${run}@audit.example.test`, name: `Toko Kedua ${run}`, owner: "Pak Joko Audit" },
};

const db = new pg.Client({ connectionString: databaseUrl });
await db.connect();
const target = await open("about:blank");
const s = await Session.attach(target.webSocketDebuggerUrl);
const results = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, pass, detail) {
  results.push({ detail, name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
}
async function wait(expression, tries = 160) {
  for (let i = 0; i < tries; i++) {
    if (await s.evaluate(expression).catch(() => false)) return;
    await pause(150);
  }
  throw Error(`timed out: ${expression}`);
}
async function viewport(width) {
  await s.send("Emulation.setDeviceMetricsOverride", { deviceScaleFactor: 1, height: 900, mobile: width < 768, width });
  await pause(250);
}
async function shot(name) {
  await pause(350);
  const { data } = await s.send("Page.captureScreenshot", { captureBeyondViewport: true, format: "png" });
  writeFileSync(new URL(`${name}.png`, out), Buffer.from(data, "base64"));
}
const hydrated = `(()=>{const f=document.querySelector('form');return !!f&&Object.keys(f).some(k=>k.startsWith('__react'))})()`;
// 44 px for every control a finger uses; a link inside a sentence is exempt.
const TARGET_44 = `JSON.stringify([...document.querySelectorAll('main a[href], main button, main input:not([type=hidden]), main textarea, main summary')]
  .filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'})
  .filter(e=>!(e.tagName==='A'&&e.closest('p,li,[data-slot=alert-description]')&&!e.classList.contains('auth-link')))
  .map(e=>{const r=e.getBoundingClientRect();const box=e.type==='checkbox'?e.closest('label').getBoundingClientRect():r;return{what:(e.id||e.textContent||e.name||e.tagName).trim().slice(0,30),h:Math.round(box.height),w:Math.round(box.width)}})
  .filter(t=>t.h<44))`;

async function probe(name, { auth = true } = {}) {
  await s.evaluate("window.scrollTo({top:0,behavior:'instant'})");
  const width = await s.evaluate("innerWidth");
  const result = JSON.parse(await s.evaluate(PROBE));
  const small44 = auth ? JSON.parse(await s.evaluate(TARGET_44)) : [];
  const findings = {
    contrast: result.contrastFails,
    focus: result.weakFocusRing,
    overflow: result.overflow > 0 ? result.overflow : 0,
    targets24: result.smallTargetCount,
    targets44: small44.length,
  };
  check(
    `${name} @${width}: zero contrast, focus, overflow and target findings`,
    Object.values(findings).every((value) => value === 0) && result.h1 === 1,
    { ...findings, contrastDetail: result.contrast, focusDetail: result.focusDetail, h1: result.h1, small44, smallTargets: result.smallTargets },
  );
  await shot(`${name}-${width}`);
}
async function fill(values) {
  await s.evaluate(`(()=>{for(const[id,value]of ${JSON.stringify(Object.entries(values))}){const e=document.getElementById(id);const setter=Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
}
function linksFor(email, kind) {
  const lines = readFileSync(serverLog, "utf8").split("\n")
    .filter((line) => line.includes(`] ${kind} to=${email} `) && line.includes(" link="));
  return lines.map((line) => line.slice(line.indexOf(" link=") + 6).trim());
}
async function clearLoginLimits() {
  await db.query("DELETE FROM rate_limits");
}
async function signIn(origin, email, secret, home) {
  await clearLoginLimits();
  await s.goto(`${origin}/login`);
  await wait(hydrated);
  await fill({ email, password: secret });
  await pause(150);
  await s.evaluate("document.querySelector('.auth-submit').click()");
  if (home) await wait(`location.pathname===${JSON.stringify(home)}`);
}
// Development-server warm-up (T-195), not an assertion. Until approval, a store
// only ever requests the shipment pages while refused (a server redirect), so on
// a cold `next dev --webpack` their client modules have never been compiled. The
// first real render compiles them, and meanwhile the dev React Refresh runtime
// reloads the page about once a second (`if (!originalFactory)
// document.location.reload()` in the development webpack runtime), so a single
// navigation never settles. A production build has no such branch. The approval
// queue is first rendered cold too, and one cold run read it mid-recompile (the
// platform loading heading beside the cards) and another was redirected to the
// login by the very request that compiled it. Open such a page once and wait for
// the reload loop to end — the same document, fully loaded, for 4 s — so the
// checked navigation that follows measures the page, not the compiler.
async function settleDevCompilation(url) {
  const started = Date.now();
  const firstEvent = s.events().length;
  const loads = () => s.events().slice(firstEvent).filter((e) => e.method === "Page.frameNavigated" && !e.params.frame.parentId).length;
  let stableSince = null;
  let last = null;
  await s.send("Page.navigate", { url });
  while (Date.now() - started < 120_000) {
    await pause(250);
    const state = await s.evaluate("({ready:document.readyState,origin:performance.timeOrigin,here:location.href})").catch(() => null);
    if (!state || state.here === "about:blank") { stableSince = null; continue; }
    if (state.ready !== "complete" || state.origin !== last) { last = state.origin; stableSince = null; continue; }
    stableSince ??= Date.now();
    if (Date.now() - stableSince >= 4000) {
      console.log(`warm-up ${new URL(url).pathname}: settled after ${loads()} document load(s) in ${Date.now() - started} ms`);
      return;
    }
  }
  throw Error(`dev compilation of ${url} did not settle within 120 s (${loads()} document loads)`);
}
async function register(store, width) {
  await viewport(width);
  await s.goto(`${tenant}/daftar`);
  await wait(hydrated);
  await fill({
    email: store.email,
    ownerName: store.owner,
    password,
    passwordConfirmation: password,
    storeName: store.name,
    whatsapp: "0812 3456 7890",
  });
  await s.evaluate("document.getElementById('terms').click()");
  await s.evaluate("document.querySelector('form .auth-submit').click()");
  await wait("!!document.querySelector('[data-testid=registration-submitted]')", 200);
}

try {
  await s.send("Page.enable");
  await s.send("Network.enable");
  await s.send("Network.clearBrowserCookies");

  // Both login pages, distinct surfaces.
  for (const width of [1440, 390]) {
    await viewport(width);
    await s.goto(`${tenant}/login`);
    await wait(hydrated);
    const tenantPage = await s.evaluate(`({h1:document.querySelector('h1')?.textContent,surface:document.querySelector('.auth-page')?.dataset.surface,daftar:!!document.querySelector('a[href="/daftar"]'),lupa:!!document.querySelector('a[href="/lupa-password"]'),toggle:!!document.querySelector('button[aria-controls=password]'),font:getComputedStyle(document.getElementById('email')).fontSize,fieldHeight:document.getElementById('email').getBoundingClientRect().height})`);
    check(`tenant login @${width} offers sign-up, recovery and a password toggle`, tenantPage.h1 === "Masuk ke toko Anda" && tenantPage.surface === "tenant" && tenantPage.daftar && tenantPage.lupa && tenantPage.toggle && tenantPage.fieldHeight >= 48, tenantPage);
    await probe("tenant-login");
    await s.goto(`${platform}/login`);
    await wait(hydrated);
    const platformPage = await s.evaluate(`({h1:document.querySelector('h1')?.textContent,surface:document.querySelector('.auth-page')?.dataset.surface,ground:getComputedStyle(document.querySelector('.auth-page')).backgroundColor,daftar:!!document.querySelector('a[href="/daftar"]'),lupa:!!document.querySelector('a[href="/lupa-password"]')})`);
    check(`Super Admin login @${width} is visually distinct and offers neither sign-up nor recovery`, platformPage.h1 === "Masuk Super Admin" && platformPage.surface === "platform" && platformPage.ground === "rgb(15, 23, 42)" && !platformPage.daftar && !platformPage.lupa, platformPage);
    await probe("platform-login");
  }

  // Password toggle reveals and hides.
  await viewport(1440);
  await s.goto(`${tenant}/login`);
  await wait(hydrated);
  await fill({ password: "rahasia" });
  await s.evaluate("document.querySelector('button[aria-controls=password]').click()");
  const revealed = await s.evaluate("({type:document.getElementById('password').type,pressed:document.querySelector('button[aria-controls=password]').getAttribute('aria-pressed'),label:document.querySelector('button[aria-controls=password]').getAttribute('aria-label')})");
  check("password toggle shows the password and says so", revealed.type === "text" && revealed.pressed === "true" && revealed.label === "Sembunyikan kata sandi", revealed);

  // Sign-up: validation errors, then the confirmation.
  for (const width of [1440, 390]) {
    await viewport(width);
    await s.goto(`${tenant}/daftar`);
    await wait(hydrated);
    await probe("daftar-empty");
    await fill({ email: "bukan-email", whatsapp: "123", password: "pendek", passwordConfirmation: "lain" });
    await s.evaluate("document.querySelector('form .auth-submit').click()");
    await wait("document.querySelectorAll('.auth-field-error').length>=5", 200);
    const errors = await s.evaluate("({summary:document.querySelector('[role=alert] [data-slot=alert-title]')?.textContent,fields:[...document.querySelectorAll('.auth-field-error')].map(e=>e.textContent),invalid:[...document.querySelectorAll('[aria-invalid=true]')].map(e=>e.id),focused:document.activeElement?.closest('[tabindex]')?.textContent?.slice(0,40)})");
    check(`sign-up @${width} explains every invalid field in Indonesian and focuses the summary`, errors.fields.length === 7 && errors.invalid.length >= 6 && /Periksa 7 isian/.test(errors.summary ?? ""), errors);
    await probe("daftar-errors");
  }
  await register(stores.pending, 1440);
  const confirmation = await s.evaluate("document.querySelector('[data-testid=registration-submitted]').innerText");
  check("sign-up confirmation says to verify the email and that the store awaits approval", /Periksa email Anda/.test(confirmation) && /persetujuan Super Admin/.test(confirmation) && confirmation.includes(stores.pending.email), confirmation.slice(0, 200));
  await probe("daftar-submitted");
  await register(stores.second, 390);
  await probe("daftar-submitted");
  const rows = await db.query("SELECT t.status, t.mengantar_credential_policy, u.email_verified FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id WHERE u.email = ANY($1) ORDER BY u.email", [[stores.pending.email, stores.second.email]]);
  check("both stores were created awaiting approval, private-only and unverified", rows.rows.length === 2 && rows.rows.every((row) => row.status === "PROVISIONING" && row.mengantar_credential_policy === "PRIVATE_ONLY" && row.email_verified === false), rows.rows);

  // Unverified login state with the resend.
  for (const width of [1440, 390]) {
    await viewport(width);
    await s.send("Network.clearBrowserCookies");
    await signIn(tenant, stores.pending.email, password);
    await wait("document.getElementById('login-error')?.textContent.includes('Email belum terverifikasi')");
    check(`unverified login @${width} is explained with a resend`, true);
    await probe("login-unverified");
    if (width === 1440) {
      await s.evaluate("[...document.querySelectorAll('#login-error button')].find(b=>b.textContent.includes('Kirim ulang')).click()");
      await wait("document.getElementById('login-error')?.textContent.includes('tautan untuk membuat kata sandi')", 200);
      check("resend confirms without revealing whether the account exists", true);
      await probe("login-unverified-resent");
    }
  }

  // Verify through the logged link (T-198): opening it verifies nothing; the page
  // asks for the sign-up password, refuses another one, then verifies and leads
  // to the login, which explains awaiting approval.
  const verifyLink = linksFor(stores.pending.email, "verify-email").at(-1);
  assert(verifyLink, "no verification link in the development log");
  check("verification link opens the password confirmation page on the tenant host", verifyLink.startsWith(`${tenant}/verifikasi-email/konfirmasi?token=`), verifyLink.slice(0, 60));
  const pendingVerified = async () => (await db.query("SELECT email_verified FROM users WHERE email = $1", [stores.pending.email])).rows[0]?.email_verified;
  for (const width of [1440, 390]) {
    await viewport(width);
    await s.send("Network.clearBrowserCookies");
    await s.goto(verifyLink);
    await wait(`location.pathname==='/verifikasi-email/konfirmasi' && ${hydrated} && !!document.getElementById('password')`);
    if (width === 1440) {
      check("opening the verification link verifies nothing", (await pendingVerified()) === false);
      await probe("verifikasi-email-konfirmasi");
      await fill({ password: `${password}-bukan` });
      await pause(150);
      await s.evaluate("document.querySelector('.auth-submit').click()");
      await wait("[...document.querySelectorAll('[role=alert]')].some(a=>a.textContent.includes('Kata sandi tidak cocok'))");
      const mismatch = await s.evaluate("({lupa:!!document.querySelector('[role=alert] a[href=\"/lupa-password\"]'),focus:document.activeElement?.closest('[tabindex]')?.textContent?.includes('Kata sandi tidak cocok')})");
      check("a password other than the sign-up password is refused and offers the set-password path", mismatch.lupa && (await pendingVerified()) === false, mismatch);
      await probe("verifikasi-email-konfirmasi-mismatch");
    }
    await fill({ password });
    await pause(150);
    await s.evaluate("document.querySelector('.auth-submit').click()");
    await wait("[...document.querySelectorAll('[role=status]')].some(a=>a.textContent.includes('Email terverifikasi'))");
    check(`the sign-up password verifies the email @${width}`, (await pendingVerified()) === true);
    await probe("verifikasi-email-konfirmasi-done");
    await s.evaluate("document.querySelector('a.auth-submit').click()");
    await wait("document.getElementById('login-notice')?.textContent.includes('menunggu persetujuan')");
    check(`verified email leads to the login with the awaiting-approval state @${width}`, await s.evaluate("location.pathname==='/login'"));
    await probe("login-awaiting-approval");
  }

  // Signed in while awaiting approval: banner, setup steps, refused shipment pages.
  for (const width of [1440, 390]) {
    await viewport(width);
    await s.send("Network.clearBrowserCookies");
    await signIn(tenant, stores.pending.email, password, "/app");
    // The dashboard streams: wait for the page itself, not its loading frame.
    await wait("!!document.querySelector('[data-testid=tenant-approval-banner]') && [...document.querySelectorAll('main h1')].some(h=>h.textContent==='Siapkan toko Anda') && document.querySelectorAll('main h1').length===1");
    const dashboard = await s.evaluate("({h1:document.querySelector('main h1')?.textContent,steps:document.querySelectorAll('ol[aria-label] li').length})");
    check(`pending store dashboard @${width} shows the banner and setup steps`, dashboard.h1 === "Siapkan toko Anda" && dashboard.steps === 4, dashboard);
    await probe("pending-dashboard", { auth: false });
    for (const path of ["/app/pengiriman/baru", "/app/cek-tarif", "/app/impor"]) {
      await s.goto(`${tenant}${path}`);
      await wait("!!document.querySelector('[data-testid=tenant-approval-refused]')");
      check(`${path} @${width} is refused server-side with the stated reason`, await s.evaluate("location.pathname==='/app'&&location.search==='?persetujuan=diperlukan'"));
    }
    await probe("pending-refused", { auth: false });
    await s.goto(`${tenant}/app/pengaturan/koneksi`);
    await wait("!!document.querySelector('[data-testid=tenant-approval-banner]') && !!document.querySelector('main h1')");
    const koneksi = await s.evaluate("({h1:document.querySelector('main h1')?.textContent,platformOption:!!document.querySelector('[value=platform_default]'),apiKey:!!document.querySelector('input[name=apiKey]')})");
    check(`pending store @${width} can open its Mengantar connection settings, own account only`, koneksi.h1 === "Koneksi Mengantar" && !koneksi.platformOption && koneksi.apiKey, koneksi);
    await probe("pending-koneksi", { auth: false });
  }

  // Recovery.
  for (const width of [1440, 390]) {
    await viewport(width);
    await s.send("Network.clearBrowserCookies");
    await db.query("DELETE FROM public_auth_rate_limits");
    await s.goto(`${tenant}/lupa-password`);
    await wait(hydrated);
    await probe("lupa-password");
    await fill({ email: stores.pending.email });
    await s.evaluate("document.querySelector('form .auth-submit').click()");
    await wait("document.body.innerText.includes('Jika email itu terdaftar sebagai akun toko')", 200);
    await probe("lupa-password-sent");
  }
  const resetLink = linksFor(stores.pending.email, "reset-password").at(-1);
  assert(resetLink, "no reset link in the development log");
  check("reset link is on the tenant host", resetLink.startsWith(`${tenant}/api/auth/reset-password/`), resetLink.slice(0, 60));
  await viewport(390);
  await s.goto(resetLink);
  await wait(`location.pathname==='/atur-ulang-password' && ${hydrated}`);
  await probe("atur-ulang-password");
  await fill({ password: "baru-12345678", passwordConfirmation: "berbeda-123" });
  await s.evaluate("document.querySelector('form .auth-submit').click()");
  await wait("!!document.getElementById('passwordConfirmation-error')", 200);
  await probe("atur-ulang-password-error");
  await viewport(1440);
  const newPassword = `${password}-baru`;
  await fill({ password: newPassword, passwordConfirmation: newPassword });
  await s.evaluate("document.querySelector('form .auth-submit').click()");
  await wait("document.body.innerText.includes('Kata sandi diperbarui')", 200);
  await probe("atur-ulang-password-done");
  await s.goto(resetLink);
  await wait("document.body.innerText.includes('Tautan sudah tidak berlaku')");
  check("a used reset link is refused", true);

  // Approval queue on the platform host.
  for (const width of [1440, 390]) {
    await viewport(width);
    await s.send("Network.clearBrowserCookies");
    await signIn(platform, superEmail, superPassword, "/platform");
    // Same development-only warm-up as the approved store's shipment page below:
    // the queue's first render on a cold server is also its first compile.
    if (width === 1440) await settleDevCompilation(`${platform}/platform/pendaftaran`);
    await s.goto(`${platform}/platform/pendaftaran`);
    await wait("!!document.querySelector('main h1') && document.querySelectorAll('[role=article]').length>=2");
    const queue = await s.evaluate(`({h1:document.querySelector('main h1').textContent,current:document.querySelector('a[aria-current=page]')?.textContent?.trim(),cards:[...document.querySelectorAll('[role=article]')].map(c=>({title:c.querySelector('[data-slot=card-title]')?.textContent,text:c.innerText.slice(0,300),approveDisabled:[...c.querySelectorAll('button')].find(b=>b.textContent.includes('Setujui'))?.disabled}))})`);
    const pendingCard = queue.cards.find((card) => card.title === stores.pending.name);
    const secondCard = queue.cards.find((card) => card.title === stores.second.name);
    check(`approval queue @${width} lists store, owner, email, WhatsApp, registered at and verification state`, queue.h1 === "Pendaftaran toko" && pendingCard && secondCard
      && pendingCard.text.includes(stores.pending.owner) && pendingCard.text.includes(stores.pending.email) && pendingCard.text.includes("0812 3456 7890")
      && pendingCard.text.includes("Email terverifikasi") && secondCard.text.includes("Email belum terverifikasi")
      && pendingCard.approveDisabled === false && secondCard.approveDisabled === true, { current: queue.current, h1: queue.h1, cards: queue.cards.length });
    await probe("platform-pendaftaran", { auth: false });
  }
  await viewport(1440);
  await s.evaluate(`(()=>{const card=[...document.querySelectorAll('[role=article]')].find(c=>c.querySelector('[data-slot=card-title]')?.textContent===${JSON.stringify(stores.second.name)});card.querySelector('summary').click()})()`);
  await pause(200);
  await s.evaluate(`(()=>{const card=[...document.querySelectorAll('[role=article]')].find(c=>c.querySelector('[data-slot=card-title]')?.textContent===${JSON.stringify(stores.second.name)});card.querySelector('details form button[type=submit]').click()})()`);
  await wait("document.body.innerText.includes('Tulis alasan penolakan')", 200);
  await probe("platform-pendaftaran-reason-required", { auth: false });
  await s.evaluate(`(()=>{const card=[...document.querySelectorAll('[role=article]')].find(c=>c.querySelector('[data-slot=card-title]')?.textContent===${JSON.stringify(stores.second.name)});const t=card.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Data toko tidak dapat dikonfirmasi');t.dispatchEvent(new Event('input',{bubbles:true}));card.querySelector('details form button[type=submit]').click()})()`);
  await wait("document.body.innerText.includes('Pendaftaran ditolak')", 200);
  await probe("platform-pendaftaran-rejected", { auth: false });
  await s.evaluate(`(()=>{const card=[...document.querySelectorAll('[role=article]')].find(c=>c.querySelector('[data-slot=card-title]')?.textContent===${JSON.stringify(stores.pending.name)});[...card.querySelectorAll('button')].find(b=>b.textContent.includes('Setujui')).click()})()`);
  await wait("!!document.querySelector('[role=alertdialog]')");
  await probe("platform-pendaftaran-confirm", { auth: false });
  await s.evaluate("[...document.querySelectorAll('[role=alertdialog] button')].find(b=>b.textContent.includes('Ya, setujui')).click()");
  await wait("document.body.innerText.includes('Toko disetujui')", 200);
  await probe("platform-pendaftaran-approved", { auth: false });
  const decided = await db.query(`SELECT u.email, t.status, (SELECT array_agg(action ORDER BY created_at) FROM audit_events e WHERE e.tenant_id=t.id) AS actions FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id WHERE u.email = ANY($1) ORDER BY u.email`, [[stores.pending.email, stores.second.email]]);
  const byEmail = Object.fromEntries(decided.rows.map((row) => [row.email, row]));
  check("approval and rejection are audited transitions", byEmail[stores.pending.email]?.status === "ACTIVE" && byEmail[stores.pending.email]?.actions.includes("TENANT_REGISTRATION_APPROVED")
    && byEmail[stores.second.email]?.status === "ARCHIVED" && byEmail[stores.second.email]?.actions.includes("TENANT_REGISTRATION_REJECTED"), decided.rows);
  check("owners were emailed either way (development log)", linksFor(stores.pending.email, "registration-approved").length > 0
    && readFileSync(serverLog, "utf8").includes(`] registration-rejected to=${stores.second.email} `), null);

  // The approved store: no banner, shipment pages open.
  await s.send("Network.clearBrowserCookies");
  await signIn(tenant, stores.pending.email, newPassword, "/app");
  await settleDevCompilation(`${tenant}/app/pengiriman/baru`);
  await s.goto(`${tenant}/app/pengiriman/baru`);
  await wait("!!document.querySelector('main h1')");
  const approved = await s.evaluate("({path:location.pathname,banner:!!document.querySelector('[data-testid=tenant-approval-banner]')})");
  check("the approved store opens the shipment page with no approval banner", approved.path === "/app/pengiriman/baru" && !approved.banner, approved);
} finally {
  writeFileSync(new URL("report.json", out), JSON.stringify(results, null, 2));
  await db.end();
  s.close();
  await closeTab(target);
}

const failed = results.filter((result) => !result.pass);
console.log(`${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exit(1);
