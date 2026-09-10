import { Session, closeTab, open } from "./cdp.mjs";
import { PROBE } from "./probe.mjs";
const ORIGIN = process.env.UI_AUDIT_ORIGIN || "http://localhost:3000";
const t=await open("about:blank"); const s=await Session.attach(t.webSocketDebuggerUrl);
for(const d of ["Page","Runtime","Network","Log"]) await s.send(`${d}.enable`);
await s.send("Emulation.setFocusEmulationEnabled",{enabled:true});
await s.send("Network.clearBrowserCookies");
await s.send("Emulation.setDeviceMetricsOverride",{width:390,height:900,deviceScaleFactor:1,mobile:true});
await s.goto(`${ORIGIN}/login/tenant`); await new Promise(r=>setTimeout(r,1600));
await s.evaluate(`(() => { const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(document.querySelector('#email'),'tenant@geraicuan.com'); set(document.querySelector('#password'),'admin123'); return true;})()`);
await new Promise(r=>setTimeout(r,300));
await s.evaluate(`document.querySelector('.auth-submit').click(), true`);
for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,250)); if(!(await s.evaluate("location.href")).includes("/login")) break;}
for (const [w,paths] of [[390,["/app/pengiriman/rts"]]]) {
  await s.send("Emulation.setDeviceMetricsOverride",{width:w,height:900,deviceScaleFactor:1,mobile:w<768});
  for (const p of paths) {
    await s.goto(`${ORIGIN}${p}`); await new Promise(r=>setTimeout(r,700));
    const d=JSON.parse(await s.evaluate(PROBE));
    if (d.stickyIssues.length || d.stickyOk) console.log(w+'px', p, 'ok='+d.stickyOk, JSON.stringify(d.stickyIssues));
  }
}
s.close(); await closeTab(t);
