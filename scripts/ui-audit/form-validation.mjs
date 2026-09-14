// Run with DATABASE_URL for the seeded disposable DB on 55450, CDP_PORT,
// and UI_AUDIT_ORIGIN. Only a temporary outlet is inserted/deleted; no upload
// or provider request is needed for these guards.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { Session, closeTab, open } from "./cdp.mjs";

const origin = process.env.UI_AUDIT_ORIGIN;
assert(origin && ["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Pass an explicit local UI_AUDIT_ORIGIN");
const database = new URL(process.env.DATABASE_URL);
assert(database.hostname === "127.0.0.1" && database.port === "55450" && database.pathname === "/geraicuan_test", "Use only the isolated local test database on port 55450");
const pool = new pg.Pool({ connectionString: database.href });
const fixtureOutlet = randomUUID();
const target = await open("about:blank");
const session = await Session.attach(target.webSocketDebuggerUrl);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];

async function waitFor(expression, message) {
  for (let i = 0; i < 80; i++) {
    if (await session.evaluate(expression)) return;
    await pause(100);
  }
  throw new Error(message);
}

async function key(key, code, virtualCode) {
  const params = { key, code, windowsVirtualKeyCode: virtualCode, nativeVirtualKeyCode: virtualCode };
  await session.send("Input.dispatchKeyEvent", { ...params, type: "rawKeyDown" });
  await pause(100);
  await session.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
}

try {
  // The ordinary seed has one ready outlet, which is auto-selected. Add only
  // this test's temporary second choice, then remove that exact row in finally.
  await pool.query(`INSERT INTO outlets (id, tenant_id, name, default_pickup_address_id, default_origin_area_id)
    VALUES ($1, '70000000-0000-4000-8000-000000000001', 'Local validation fixture', 'local-pickup', 'local-origin')`, [fixtureOutlet]);
  for (const domain of ["Page", "Runtime", "Network"]) await session.send(`${domain}.enable`);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await session.send("Page.bringToFront");
  await session.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await session.goto(`${origin}/app`);
  if ((await session.evaluate("location.pathname")).startsWith("/login")) {
    await session.goto(`${origin}/login/tenant`);
    await waitFor(`(() => {
      const form = document.querySelector('form');
      return form && Object.keys(form).some(key => key.startsWith('__reactProps$') && typeof form[key]?.onSubmit === 'function');
    })()`, "Local login must hydrate");
    await session.evaluate(`(() => {
      for (const [id, value] of [['email', 'tenant@geraicuan.com'], ['password', 'admin123']]) {
        const input = document.getElementById(id);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await pause(200);
    await session.evaluate("document.querySelector('.auth-submit').click()");
    await waitFor("location.pathname === '/app'", "Seeded Tenant Admin login must succeed");
  }
  await waitFor(`Boolean(document.querySelector('nav[aria-label="Navigasi tenant"] a[href="/app/pengiriman"]'))`, "Shipment queue must be discoverable in the tenant navigation");
  await session.evaluate(`document.querySelector('nav[aria-label="Navigasi tenant"] a[href="/app/pengiriman"]').click()`);
  await waitFor(`location.pathname === '/app/pengiriman' && Boolean(document.querySelector('main a[href="/app/impor"]'))`, "Import must be discoverable from the shipment queue");
  await session.evaluate(`document.querySelector('main a[href="/app/impor"]').click()`);
  await waitFor(`location.pathname === '/app/impor' && Boolean(document.querySelector('#form-impor'))`, "Import form must render");
  await waitFor(`(() => {
    const form = document.querySelector('#form-impor');
    return Object.keys(form).some(key => key.startsWith('__reactProps$') && typeof form[key]?.onSubmit === 'function');
  })()`, "Import form must hydrate");

  // Observe attempted Server Actions without allowing a broken client guard to
  // upload anything. The real submit handler still runs; attempted POSTs fail.
  await session.evaluate(`(() => {
    window.auditPostAttempts = 0;
    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      if (method.toUpperCase() === 'POST') {
        window.auditPostAttempts++;
        return Promise.reject(new Error('Audit blocked a form POST'));
      }
      return originalFetch(input, init);
    };
  })()`);

  assert.equal(await session.evaluate(`document.querySelector('#form-impor input[name="outletId"]').value`), "", "Use the many-outlet seed, with no selected origin");
  // Repeated blocked submissions must recover focus, not only the first one.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await session.evaluate(`document.querySelector('#form-impor button[type="submit"]').focus()`);
    await session.evaluate(`document.querySelector('#form-impor button[type="submit"]').click()`);
    await waitFor(`document.activeElement?.id === 'outletId' && document.querySelector('#outlet-error')?.textContent === 'Pilih outlet asal.'`, "Missing outlet must block submit, announce its reason, and recover focus");
    const recovery = await session.evaluate(`(() => {
      const trigger = document.querySelector('#outletId'), error = document.querySelector('#outlet-error');
      return { focused: document.activeElement === trigger, invalid: trigger.getAttribute('aria-invalid'), describedBy: trigger.getAttribute('aria-describedby'), errorRole: error.getAttribute('role'), postAttempts: window.auditPostAttempts };
    })()`);
    assert.equal(recovery.invalid, "true");
    assert.equal(recovery.describedBy, "outlet-error");
    assert.equal(recovery.errorRole, "alert");
    assert.equal(recovery.postAttempts, 0);
    results.push({ scenario: "missing-outlet", attempt, ...recovery });
  }

  for (const width of [390, 767]) {
    await session.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: true });
    await pause(300);
    await session.evaluate("document.querySelector('#outletId').focus()");
    await key(" ", "Space", 32);
    await waitFor(`Boolean(document.querySelector('[role="option"]'))`, "Outlet choices must open by keyboard");
    const sizes = await session.evaluate(`Array.from(document.querySelectorAll('[role="option"]'), option => option.getBoundingClientRect().height)`);
    assert(sizes.length > 1, "Measure actual many-outlet SelectItems");
    assert(sizes.every(height => height >= 44), `SelectItems must be at least 44px below md: ${JSON.stringify(sizes)}`);
    results.push({ scenario: "select-touch-target", width, heights: sizes });
    await key("Escape", "Escape", 27);
    await waitFor(`!document.querySelector('[role="option"]') && document.activeElement?.id === 'outletId'`, "Select must close and return focus");
  }
  assert.equal(await session.evaluate("window.auditPostAttempts"), 0);
  assert.equal(session.events().filter(event => event.method === "Runtime.exceptionThrown").length, 0);
  const directory = new URL("./.output/", import.meta.url);
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL("form-validation.json", directory), JSON.stringify({ origin, results }, null, 2));
  console.log(`FORM VALIDATION PASS: ${results.length} observations; no form POST attempted`);
} finally {
  try {
    session.close();
    await closeTab(target);
  } finally {
    try {
      await pool.query("DELETE FROM outlets WHERE id = $1 AND tenant_id = '70000000-0000-4000-8000-000000000001'", [fixtureOutlet]);
    } finally {
      await pool.end();
    }
  }
}
// All observations and cleanup are awaited. The shared CDP helper otherwise
// retains already-resolved request timers for another minute.
process.exit(0);
