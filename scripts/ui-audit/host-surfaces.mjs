// PR-58 / D-7 browser evidence: two CMS hosts from one deployment.
// Needs a server started with GERAICUAN_TENANT_ORIGIN / GERAICUAN_PLATFORM_ORIGIN
// set to two `*.localhost` origins (Chrome resolves `*.localhost` to loopback,
// so no host mapping is needed), and the local demo users.
//   CDP_PORT=9430 HOST_AUDIT_TENANT_ORIGIN=http://app.geraicuan.localhost:3130 \
//   HOST_AUDIT_PLATFORM_ORIGIN=http://bos.geraicuan.localhost:3130 node scripts/ui-audit/host-surfaces.mjs
// Read-only apart from signing in; logs in once per host (login is limited to 5 per 60 s).
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

import { Session, closeTab, open } from "./cdp.mjs";

const tenant = process.env.HOST_AUDIT_TENANT_ORIGIN;
const platform = process.env.HOST_AUDIT_PLATFORM_ORIGIN;
for (const origin of [tenant, platform]) {
  assert(origin && new URL(origin).hostname.endsWith(".localhost"), "origins must be local *.localhost hosts");
}
const out = new URL("./.output/host-surfaces/", import.meta.url);
mkdirSync(out, { recursive: true });

const target = await open("about:blank");
const s = await Session.attach(target.webSocketDebuggerUrl);
const results = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(expression, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (await s.evaluate(expression).catch(() => false)) return;
    await pause(150);
  }
  throw Error(`timed out: ${expression}`);
}
async function shot(name) {
  await pause(300);
  const { data } = await s.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(new URL(`${name}.png`, out), Buffer.from(data, "base64"));
}
function check(name, pass, detail) {
  results.push({ detail, name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}
async function sessionCookies(origin) {
  const { cookies } = await s.send("Network.getCookies", { urls: [`${origin}/`] });
  return cookies.filter((cookie) => cookie.name.endsWith("better-auth.session_token"));
}
async function signIn(origin, email, home) {
  await s.goto(`${origin}/login`);
  await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
  await s.evaluate(`(()=>{for(const[id,value]of[['email',${JSON.stringify(email)}],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await pause(200);
  await s.evaluate(`document.querySelector('.auth-submit').click()`);
  await wait(`location.pathname===${JSON.stringify(home)}`);
}
const here = () => s.evaluate("({href:location.href,h1:document.querySelector('h1')?.textContent?.trim()??null,body:document.body.innerText.slice(0,40)})");

try {
  await s.send("Page.enable");
  await s.send("Network.enable");
  await s.send("Emulation.setDeviceMetricsOverride", { deviceScaleFactor: 1, height: 900, mobile: false, width: 1440 });
  await s.send("Network.clearBrowserCookies");

  await s.goto(`${tenant}/`);
  let page = await here();
  check("tenant / lands on the tenant login", page.href === `${tenant}/login` && page.h1 === "Masuk ke gerai Anda", page);
  await shot("tenant-login-1440");

  await s.goto(`${platform}/`);
  page = await here();
  check("platform / lands on the Super Admin login", page.href === `${platform}/login` && page.h1 === "Masuk Super Admin", page);
  await shot("platform-login-1440");

  await s.goto(`${tenant}/login/super-admin`);
  page = await here();
  check("old /login/super-admin on the tenant host redirects to the platform login", page.href === `${platform}/login`, page);

  await signIn(tenant, "tenant@geraicuan.com", "/app");
  await shot("tenant-home-1440");
  const tenantCookies = await sessionCookies(tenant);
  check(
    "tenant session cookie is host-only on the tenant host",
    tenantCookies.length === 1 && tenantCookies[0].domain === new URL(tenant).hostname,
    tenantCookies.map(({ domain, httpOnly, path, sameSite }) => ({ domain, httpOnly, path, sameSite })),
  );
  check("the tenant session cookie is not sent to the platform host", (await sessionCookies(platform)).length === 0);

  await s.goto(`${platform}/app`);
  page = await here();
  check("platform host refuses /app", page.body.startsWith("Not Found"), page);
  await s.goto(`${platform}/platform`);
  page = await here();
  check("platform host has no session after the tenant signed in", page.href.startsWith(`${platform}/login`) && page.h1 === "Masuk Super Admin", page);

  await signIn(platform, "super@geraicuan.com", "/platform");
  await shot("platform-home-1440");
  const platformCookies = await sessionCookies(platform);
  check(
    "Super Admin session cookie is host-only on the platform host",
    platformCookies.length === 1 && platformCookies[0].domain === new URL(platform).hostname,
    platformCookies.map(({ domain }) => domain),
  );
  const tenantAfter = await sessionCookies(tenant);
  check("the Super Admin sign-in did not replace the tenant host's cookie", tenantAfter.length === 1 && tenantAfter[0].value === tenantCookies[0].value);

  await s.goto(`${tenant}/platform`);
  page = await here();
  check("tenant host refuses /platform", page.body.startsWith("Not Found"), page);
  await s.goto(`${tenant}/app`);
  page = await here();
  check("tenant host still serves the tenant workspace", page.href === `${tenant}/app`, page);
  await s.goto(`${platform}/`);
  page = await here();
  check("platform / with a session goes to the platform home", page.href === `${platform}/platform`, page);
} finally {
  writeFileSync(new URL("results.json", out), JSON.stringify(results, null, 2));
  s.close();
  await closeTab(target);
}

const failed = results.filter((result) => !result.pass);
console.log(`${results.length - failed.length}/${results.length} host-surface checks passed`);
process.exit(failed.length ? 1 : 0);
