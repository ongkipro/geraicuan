// Proves the shared probe binds, by importing it rather than re-implementing
// it. An earlier version was a third hand copy of the same logic, so it proved
// that *a copy* worked — which is exactly the drift the probe module exists to
// prevent.
//
// The probe must find nothing on the real page, find both injected failures
// when they exist, and have actually inspected the page rather than skipping
// it. The first version parsed only rgb(); Tailwind v4 emits oklch and Chrome
// reports lab(), so it silently inspected 12 of 278 elements and reported a
// clean sweep it never performed.
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
console.log("baseline:", JSON.stringify({
  contrastInspected: base.contrastInspected, contrastFails: base.contrastFails,
  focusProbed: base.focusProbed, weakFocusRing: base.weakFocusRing,
}));

// Inject one failure the probe must catch in each dimension it claims to
// measure: a low-contrast colour in a syntax the engine reports as lab(), and
// a focusable control whose focus ring is switched off.
await s.evaluate(`(() => {
  const a = document.createElement('p');
  a.textContent = 'PROBE oklch red on its own tint';
  a.style.cssText = 'color:oklch(0.577 0.245 27.325);background:color-mix(in oklab, oklch(0.577 0.245 27.325) 10%, white);font-size:14px';
  document.querySelector('main').appendChild(a);
  // Round 10 review found the focus check capped itself at the first 14
  // focusable elements, so on any real CMS page the persistent sidebar nav
  // (~10-13 links) consumed the whole window and page content was never
  // examined. Twenty harmless dummy links are inserted before the real test
  // button so it lands well past position 14 in tab order - proving the
  // fix checks past the old cap, not just that focus detection works at all.
  for (let i = 0; i < 20; i++) {
    const spacer = document.createElement('a');
    spacer.href = '#probe-spacer-' + i;
    spacer.textContent = 'spacer';
    spacer.style.cssText = 'position:fixed;top:-999px;left:-999px';
    document.body.appendChild(spacer);
  }
  const b = document.createElement('button');
  b.textContent = 'PROBE unfocusable past the old 14-element cap';
  b.style.cssText = 'outline:none!important;box-shadow:none!important;padding:12px';
  b.id = 'probe-no-ring';
  document.body.appendChild(b);
  return true;
})()`);
const mutated = JSON.parse(await s.evaluate(PROBE));
console.log("injected:", JSON.stringify({
  contrastInspected: mutated.contrastInspected, contrastFails: mutated.contrastFails,
  weakFocusRing: mutated.weakFocusRing, detail: mutated.focusDetail,
}));

const ok = base.contrastInspected > 150
  && base.contrastFails === 0
  && base.weakFocusRing === 0
  && base.focusProbed >= 3
  && mutated.contrastFails === 1
  && mutated.weakFocusRing === 1;
console.log(ok ? "SELFTEST PASS" : "SELFTEST FAIL");
s.close();
await closeTab(t);
process.exit(ok ? 0 : 1);
