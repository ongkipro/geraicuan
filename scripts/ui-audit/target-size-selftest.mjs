// T-174: synthetic cases for the probe's WCAG 2.5.8 target-size count. A label
// that activates a control is part of that control's pointer target; a label
// that does not activate it is not. No app navigation or credentials.
import assert from "node:assert/strict";
import { Session, closeTab, open } from "./cdp.mjs";
import { PROBE } from "./probe.mjs";

const tiny = 'style="width:16px;height:16px;margin:0"';
const wideLabel = 'style="display:flex;align-items:center;gap:4px;width:176px;height:36px;flex:none"';
const wideLabelEndAligned = 'style="display:flex;align-items:center;justify-content:flex-end;gap:4px;width:176px;height:36px;flex:none"';
const cases = [
  // [name, markup, expected smallTargetCount]
  // Each pair sits within 24px of each other, so without the label every one
  // of these controls fails the spacing exemption too.
  ["tiny radio inside the label that activates it", `<div style="display:flex"><label ${wideLabelEndAligned}>7 hari terakhir<input type="radio" name="a" ${tiny}></label><label ${wideLabel}><input type="radio" name="a" ${tiny}>30 hari terakhir</label></div>`, 0],
  ["tiny radio activated by a sibling label[for]", `<div style="display:flex;align-items:center"><label for="p1" ${wideLabel}>Hari ini</label><input type="radio" id="p1" name="b" ${tiny}><input type="radio" id="p2" name="b" ${tiny}><label for="p2" ${wideLabel}>Kemarin</label></div>`, 0],
  ["tiny radio activated by a Radix-style button with a label[for]", `<div style="display:flex;align-items:center"><label for="r1" ${wideLabel}>COD</label><button role="radio" id="r1" ${tiny}></button><button role="radio" id="r2" ${tiny}></button><label for="r2" ${wideLabel}>Non-COD</label></div>`, 0],
  // The rule is not weakened: a genuinely tiny control with a tiny label fails.
  ["tiny controls whose labels are tiny too", `<div style="display:flex;gap:2px"><label style="display:block;width:16px;height:16px"><input type="checkbox" ${tiny}></label><label style="display:block;width:16px;height:16px"><input type="checkbox" ${tiny}></label></div>`, 2],
  // A label that does not activate the control adds nothing to its target.
  ["label[for] that points at a different control", `<label for="elsewhere" style="display:flex;gap:2px;width:176px;height:36px"><input type="checkbox" ${tiny}><input type="checkbox" ${tiny}></label><div style="height:80px"></div><input id="elsewhere" aria-label="Elsewhere" style="width:160px;height:40px">`, 2],
  ["second control inside one label is not that label's control", `<label style="display:flex;gap:2px;width:176px;height:36px"><input type="checkbox" ${tiny}><input type="checkbox" ${tiny}></label>`, 1],
  ["hidden label adds nothing", `<div style="display:flex;gap:2px"><input type="checkbox" id="h1" ${tiny}><label for="h1" style="display:none">One</label><input type="checkbox" id="h2" ${tiny}><label for="h2" style="display:none">Two</label></div>`, 2],
];

const target = await open("about:blank");
const session = await Session.attach(target.webSocketDebuggerUrl);
try {
  await session.send("Runtime.enable");
  await session.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const [name, markup, expected] of cases) {
    await session.evaluate(`(() => {
      document.head.innerHTML = '<style>html,body{background:white;color:black}body{padding:24px;font:14px sans-serif}</style>';
      document.body.innerHTML = ${JSON.stringify(markup)};
    })()`);
    const result = JSON.parse(await session.evaluate(PROBE));
    assert.equal(result.smallTargetCount, expected, `${name}: ${JSON.stringify(result.smallTargets)}`);
  }
  console.log(`TARGET SIZE SELFTEST PASS: ${cases.length} cases`);
} finally {
  session.close();
  await closeTab(target);
}
