// Synthetic computed-style checks for the shared probe. No app navigation,
// credentials, cookie changes, or interaction with another tab is required.
import assert from "node:assert/strict";
import { Session, closeTab, open } from "./cdp.mjs";
import { PROBE } from "./probe.mjs";

const control = '<button>Focus fixture</button>';
const group = (slot = "input-group-control") => `<div data-slot="input-group"><input data-slot="${slot}" aria-label="Fixture input"></div>`;
const cases = [
  ["2px outline", control, "button:focus-visible{outline:2px solid black;outline-offset:2px}", 0],
  ["2px ring", control, "button:focus-visible{box-shadow:0 0 0 2px black}", 0],
  ["shadcn shadow stack", control, "button:focus-visible{box-shadow:0 0 0 0 transparent,0 0 0 0 transparent,0 0 0 2px black,0 1px 2px 0 #0001}", 0],
  ["ring with offset layer", control, "button:focus-visible{box-shadow:0 0 0 1px white,0 0 0 3px black}", 0],
  ["input group ring", group(), '[data-slot="input-group"]:has(>input:focus-visible){box-shadow:0 0 0 2px black}', 0],
  ["command input group ring", group("command-input"), '[data-slot="input-group"]:has(>input:focus-visible){box-shadow:0 0 0 2px black}', 0],
  ["no indicator", control, "", 1],
  ["transparent control", control, "button{opacity:0}button:focus-visible{box-shadow:0 0 0 2px black}", 1],
  ["transparent ancestor", `<section>${control}</section>`, "section{opacity:0}button:focus-visible{outline:2px solid black}", 1],
  ["transparent outline", control, "button:focus-visible{outline:2px solid transparent}", 1],
  ["hairline outline", control, "button:focus-visible{outline:0.5px solid black}", 1],
  ["offscreen outline", control, "button:focus-visible{outline:2px solid black;outline-offset:-9999px}", 1],
  ["inset outline on dark control", control, "button{background:black}button:focus-visible{outline:2px solid white;outline-offset:-2px}", 0],
  ["inset outline uses control backdrop", control, "button{background:black}button:focus-visible{outline:2px solid black;outline-offset:-2px}", 1],
  ["low contrast outline", control, "button:focus-visible{outline:2px solid #ddd}", 1],
  ["transparent ring", control, "button:focus-visible{box-shadow:0 0 0 2px transparent}", 1],
  ["hairline ring", control, "button:focus-visible{box-shadow:0 0 0 1px black}", 1],
  ["low contrast ring", control, "button:focus-visible{box-shadow:0 0 0 2px #ddd}", 1],
  ["low alpha ring", control, "button:focus-visible{box-shadow:0 0 0 2px rgb(0 0 0 / 10%)}", 1],
  ["2px inset ring", control, "button:focus-visible{box-shadow:inset 0 0 0 2px black}", 0],
  ["inset on dark control", control, "button{background:black}button:focus-visible{box-shadow:inset 0 0 0 2px white}", 0],
  ["inset contrast uses control backdrop", control, "button{background:black}button:focus-visible{box-shadow:inset 0 0 0 2px black}", 1],
  ["hairline inset", control, "button:focus-visible{box-shadow:inset 0 0 0 1px black}", 1],
  ["transparent inset", control, "button:focus-visible{box-shadow:inset 0 0 0 2px transparent}", 1],
  ["blurred inset", control, "button:focus-visible{box-shadow:inset 0 0 2px 2px black}", 1],
  ["permanent inset", control, "button{box-shadow:inset 0 0 0 2px black}", 1],
  ["covered inset", control, "button:focus-visible{box-shadow:inset 0 0 0 2px white,inset 0 0 0 2px black}", 1],
  ["inset only 1px exposed", control, "button:focus-visible{box-shadow:inset 0 0 0 2px white,inset 0 0 0 3px black}", 1],
  ["transition-all ring", control, "button{transition:all 2s}button:focus-visible{box-shadow:0 0 0 2px black}", 0],
  ["transition-all inset", control, "button{transition:all 2s}button:focus-visible{box-shadow:inset 0 0 0 2px black}", 0],
  ["transition-all no ring", control, "button{transition:all 2s}", 1],
  ["group transition", group(), '[data-slot="input-group"]{transition:all 2s}[data-slot="input-group"]:has(>input:focus-visible){box-shadow:0 0 0 2px black}', 0],
  ["inline transition", '<button style="transition-duration:2s!important;transition-property:all;color:black">Focus fixture</button>', 'button:focus-visible{box-shadow:0 0 0 2px black}', 0],
  ["blurred shadow", control, "button:focus-visible{box-shadow:0 0 3px 2px black}", 1],
  ["offset shadow", control, "button:focus-visible{box-shadow:1px 0 0 2px black}", 1],
  ["permanent shadow", control, "button{box-shadow:0 0 0 2px black}", 1],
  ["covered ring", control, "button:focus-visible{box-shadow:0 0 0 2px white,0 0 0 2px black}", 1],
  ["only 1px exposed", control, "button:focus-visible{box-shadow:0 0 0 2px white,0 0 0 3px black}", 1],
  ["permanent group ring", group(), '[data-slot="input-group"]{box-shadow:0 0 0 2px black}', 1],
  ["unmarked input", group("input"), '[data-slot="input-group"]:has(>input:focus-visible){box-shadow:0 0 0 2px black}', 1],
  ["group addon button", `<div data-slot="input-group">${control}</div>`, '[data-slot="input-group"]:focus-within{box-shadow:0 0 0 2px black}', 1],
  ["arbitrary ancestor", `<section>${control}</section>`, "section:focus-within{box-shadow:0 0 0 2px black}", 1],
  ["non-immediate group", '<div data-slot="input-group"><div><input data-slot="input-group-control" aria-label="Fixture input"></div></div>', '[data-slot="input-group"]:focus-within{box-shadow:0 0 0 2px black}', 1],
];
const target = await open("about:blank");
const session = await Session.attach(target.webSocketDebuggerUrl);
try {
  await session.send("Runtime.enable");
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await session.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const [name, markup, css, expected] of cases) {
    await session.evaluate(`(() => {
      document.head.innerHTML = '';
      document.body.innerHTML = ${JSON.stringify(markup)};
      const style = document.createElement('style');
      style.textContent = ${JSON.stringify('html,body{background:white;color:black}body{padding:24px}button,input{width:160px;height:40px;outline:none;border:0;background:white;color:black;box-shadow:none}[data-slot="input-group"],section{display:inline-flex;padding:4px}' )} + ${JSON.stringify(css)};
      document.head.append(style);
    })()`);
    const stylesBefore = await session.evaluate(`JSON.stringify([...document.querySelectorAll('button,input,[data-slot="input-group"]')].map(el => [[...el.style].sort().map(key => [key, el.style.getPropertyValue(key), el.style.getPropertyPriority(key)]), getComputedStyle(el).transition]))`);
    const result = JSON.parse(await session.evaluate(PROBE));
    const stylesAfter = await session.evaluate(`JSON.stringify([...document.querySelectorAll('button,input,[data-slot="input-group"]')].map(el => [[...el.style].sort().map(key => [key, el.style.getPropertyValue(key), el.style.getPropertyPriority(key)]), getComputedStyle(el).transition]))`);
    assert.equal(stylesAfter, stylesBefore, `${name}: transition declarations were not restored`);
    assert.equal(result.focusProbed, 1, `${name}: control was not inspected`);
    assert.equal(result.weakFocusRing, expected, `${name}: ${JSON.stringify(result.focusDetail)}`);
  }
  console.log(`FOCUS SELFTEST PASS: ${cases.length} computed-style cases`);
} finally {
  session.close();
  await closeTab(target);
}
