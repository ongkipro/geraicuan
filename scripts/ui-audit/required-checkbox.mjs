// Verify the local seeded reversal confirmation without submitting an action.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Session, closeTab, open } from "./cdp.mjs";
const origin = process.env.UI_AUDIT_ORIGIN;
// Same local allowlist as the sibling audits: the dev server is audited on its LAN origin (auth trusts it, not 127.0.0.1).
assert(origin && ["localhost", "127.0.0.1", "100.127.67.86"].includes(new URL(origin).hostname), "Pass an explicit local UI_AUDIT_ORIGIN");
const target = await open("about:blank");
const session = await Session.attach(target.webSocketDebuggerUrl);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
async function waitFor(expression, message) {
  for (let i = 0; i < 120; i++) {
    if (await session.evaluate(expression)) return;
    await pause(100);
  }
  throw new Error(message);
}
async function key(key, code, virtualCode) {
  const params = { key, code, windowsVirtualKeyCode: virtualCode, nativeVirtualKeyCode: virtualCode };
  await session.send("Input.dispatchKeyEvent", { ...params, type: key === "Enter" ? "keyDown" : "rawKeyDown", ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}) });
  await session.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
  await pause(150);
}
try {
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
  await session.send("Accessibility.enable");
  await waitFor(`Boolean(document.querySelector('nav a[href="/app/keuangan"]'))`, "Finance navigation must exist");
  await session.evaluate(`document.querySelector('nav a[href="/app/keuangan"]').click()`);
  await waitFor(`location.pathname === '/app/keuangan' && [...document.querySelectorAll('button')].some(b => b.textContent === 'Buat pembalik')`, "Seeded finance entries must expose the reversal dialog");
  await session.evaluate(`(() => {
    window.auditPosts = 0;
    const original = window.fetch;
    window.fetch = (input, init) => {
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      if (method.toUpperCase() === 'POST') { window.auditPosts++; return Promise.reject(new Error('Audit blocks all POSTs')); }
      return original(input, init);
    };
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Buat pembalik').click();
  })()`);
  await waitFor(`Boolean(document.querySelector('[role="alertdialog"] input[name="confirmation"]'))`, "Reversal dialog must open");
  await session.evaluate(`(() => {
    const form = document.querySelector('[role="alertdialog"] form');
    window.auditSubmits = [];
    form.addEventListener('submit', event => {
      event.preventDefault(); event.stopImmediatePropagation();
      window.auditSubmits.push(new FormData(form).get('confirmation'));
    }, true);
  })()`);
  for (const width of [1440, 390]) {
    await session.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await pause(200);
    await session.evaluate(`document.querySelector('[role="alertdialog"] button[type="submit"]').focus()`);
    await key("Enter", "Enter", 13);
    const invalid = await session.evaluate(`(() => {
      const input = document.querySelector('[role="alertdialog"] input[name="confirmation"]');
      return { missing: input.validity.valueMissing, message: input.validationMessage, focused: document.activeElement === input,
        label: [...input.labels].map(l => l.textContent.trim()).join(' '), submits: window.auditSubmits.length, posts: window.auditPosts,
        focusVisible: input.matches(':focus-visible'), shadow: getComputedStyle(input).boxShadow };
    })()`);
    assert(invalid.missing && invalid.focused && invalid.focusVisible, `Invalid confirmation must own visible keyboard focus: ${JSON.stringify(invalid)}`);
    assert(invalid.message.length > 0); assert.equal(invalid.label, "Saya memahami pembalikan penuh ini.");
    assert.equal(invalid.submits, results.length); assert.equal(invalid.posts, 0);
    assert.notEqual(invalid.shadow, "none");
    const ax = (await session.send("Accessibility.getFullAXTree")).nodes.find(node => node.role?.value === "checkbox" && node.properties?.some(p => p.name === "focused" && p.value.value === true));
    assert.equal(ax?.name?.value, invalid.label, "The focused invalid checkbox must retain its full accessible name");
    assert.equal(ax.properties.find(p => p.name === "invalid")?.value.value, "true");
    const output = new URL("./.output/", import.meta.url); mkdirSync(output, { recursive: true });
    const { data } = await session.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(new URL(`required-checkbox-${width}.png`, output), Buffer.from(data, "base64"));
    await key(" ", "Space", 32);
    assert(await session.evaluate(`document.querySelector('[role="alertdialog"] input[name="confirmation"]').checked`), "Space must check consent");
    await session.evaluate(`document.querySelector('[role="alertdialog"] button[type="submit"]').focus()`);
    await key("Enter", "Enter", 13);
    assert.deepEqual(await session.evaluate("window.auditSubmits"), Array(results.length + 1).fill("confirmed"));
    assert.equal(await session.evaluate("window.auditPosts"), 0);
    // Reset through the same native keyboard interaction for the next viewport.
    await session.evaluate(`document.querySelector('[role="alertdialog"] input[name="confirmation"]').focus()`);
    await key(" ", "Space", 32);
    results.push({ width, ...invalid, accessibleName: ax.name.value, checkedValue: "confirmed" });
  }
  assert.equal(session.events().filter(e => e.method === "Runtime.exceptionThrown").length, 0);
  writeFileSync(new URL("./.output/required-checkbox.json", import.meta.url), JSON.stringify({ results, exceptions: 0 }, null, 2));
  console.log("PASS required checkbox: native keyboard, named invalid focus, checked form value, zero POSTs at 1440/390");
} finally { session.close(); await closeTab(target); }
process.exit(0);
