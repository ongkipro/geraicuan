import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Session, open, closeTab } from './cdp.mjs';
import { PROBE } from './probe.mjs';

const origin = process.env.UI_AUDIT_ORIGIN;
assert(origin && (['localhost', '127.0.0.1'].includes(new URL(origin).hostname) || new URL(origin).hostname === process.env.UI_AUDIT_TAILNET_HOST), 'Pass an explicit local UI_AUDIT_ORIGIN or the configured development tailnet host');
const output = new URL('./.output/blue-ui/', import.meta.url);
mkdirSync(output, { recursive: true });
const target = await open('about:blank');
const session = await Session.attach(target.webSocketDebuggerUrl);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const phase = process.env.UI_AUDIT_PHASE || 'all';
assert(['all','roles','states','filters'].includes(phase));
const filterChecks = [];
const keyboardEvidence = [];
const paletteDiagnostics = process.env.UI_AUDIT_PALETTE_DIAGNOSTICS === '1';
const paletteFindings = [];
function checkPalette(probe, context) {
  if (paletteDiagnostics) {
    if (probe.contrastFails || probe.weakFocusRing) paletteFindings.push({context,contrast:probe.contrast,focus:probe.focusDetail});
  } else {
    assert.equal(probe.contrastFails,0,JSON.stringify(probe.contrast));
    assert.equal(probe.weakFocusRing,0,JSON.stringify(probe.focusDetail));
  }
}

async function visit(path, scenario) {
  await session.send('Network.setExtraHTTPHeaders', { headers: scenario ? { 'x-geraicuan-ui-audit': scenario } : {} });
  await session.goto(`${origin}${path}`);
  await pause(700);
  for (let i = 0; i < 40 && await session.evaluate(`Boolean(document.querySelector('[data-slot="skeleton"]'))`); i++) await pause(250);
  assert.equal(await session.evaluate('location.pathname'), path.split('?')[0], `Route reached: ${path}`);
}
async function login(role) {
  await session.send('Network.clearBrowserCookies');
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false });
  await visit(role === 'super' ? '/login/super-admin' : '/login/tenant');
  // Wait for React's submit handler, not only the server-rendered form.
  let hydrated = false;
  for (let i=0; i<80; i++) {
    hydrated = await session.evaluate(`(() => {const form=document.querySelector('form');return Boolean(form && Object.keys(form).some(key => key.startsWith('__reactProps$') && typeof form[key]?.onSubmit === 'function'));})()`);
    if (hydrated) break;
    await pause(250);
  }
  assert(hydrated, 'Login form hydrated before entering fixture values');
  await session.evaluate(`(() => {
    const set = (selector,value) => { const el=document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value); el.dispatchEvent(new Event('input',{bubbles:true})); };
    set('#email',${JSON.stringify(`${role}@geraicuan.com`)}); set('#password','admin123');
  })()`);
  await pause(300);
  await session.evaluate(`document.querySelector('.auth-submit').click()`);
  for (let i = 0; i < 80 && (await session.evaluate('location.pathname')).startsWith('/login'); i++) await pause(250);
  assert(!(await session.evaluate('location.pathname')).startsWith('/login'), `Local fixture login succeeded: ${await session.evaluate("document.querySelector('[role=alert]')?.textContent || ''")}`);
}
async function capture(name) {
  await session.evaluate('window.scrollTo(0,0)');
  await pause(100);
  const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(new URL(`${name}.png`, output), Buffer.from(data, 'base64'));
}
try {
  for (const domain of ['Page','Runtime','Network']) await session.send(`${domain}.enable`);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await session.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (phase === 'all' || phase === 'roles') {
  for (const role of ['operator','super','tenant']) {
    await login(role);
    const routes = role === 'super' ? ['/platform'] : role === 'tenant' ? ['/app?rentang=30-hari', '/app/laporan/pengiriman?rentang=30-hari'] : ['/app?rentang=30-hari'];
    for (const width of [390,768,1280]) {
      await session.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: width < 768 });
      for (const path of routes) {
        console.log(`Checking ${role} ${path} at ${width}px`);
        await visit(path, path.startsWith('/app?') ? 'dashboard-period-demo' : undefined);
        const probe = JSON.parse(await session.evaluate(PROBE));
        assert(probe.overflow <= 1, `${role} ${path} ${width}: overflow ${probe.overflow}`);
        assert.equal(probe.h1, 1);
        assert(probe.contrastInspected > 10 && probe.focusProbed > 0, 'Probe inspected real content');
        checkPalette(probe, {role,path,width});
        assert.deepEqual(probe.headingSkips, []);
        assert.deepEqual(probe.unreachableScroll, []);
        assert.equal(probe.nestedCards, 0);
        const visual = await session.evaluate(`(() => {
          const root=getComputedStyle(document.documentElement);
          const role=[...document.querySelectorAll('header [data-slot="badge"]')].find(el=>el.getClientRects().length);
          return {primary:root.getPropertyValue('--primary').trim(), role:role?.textContent,
            headings:[...document.querySelectorAll('main h2, main h3')].map(el=>el.textContent)};
        })()`);
        assert.equal(visual.primary.toLowerCase(), 'oklch(0.488 0.243 264.376)');
        assert(visual.role, 'Role remains visible at every viewport');
        if (width >= 768) {
          const selected=await session.evaluate(`(() => {
            const link=[...document.querySelectorAll('a[aria-current="page"]')].find(el=>el.getClientRects().length);
            const style=getComputedStyle(link); const mark=getComputedStyle(link,'::before');
            return {background:style.backgroundColor,color:style.color,markWidth:mark.width,markColor:mark.backgroundColor};
          })()`);
          assert.equal(selected.background,'oklch(0.97 0 0)');
          assert.equal(selected.color,'oklch(0.205 0 0)');
          assert.equal(selected.markColor,'oklch(0.546 0.245 262.881)');
          assert(parseFloat(selected.markWidth)>0, 'Selected route has non-colour marker');
        }
        if (path.startsWith('/app?')) {
          const order = await session.evaluate(`(() => {const text=document.querySelector('main').innerText;return {summary:text.indexOf('Ringkasan periode'), work:text.indexOf('Pekerjaan yang perlu diperhatikan'), trend:text.indexOf('Grafik kiriman')};})()`);
          assert(order.summary >= 0 && order.trend > order.summary && order.work > order.trend, JSON.stringify(order));
        }
        await capture(`${role}-${path.includes('laporan') ? 'report' : 'home'}-${width}`);
        results.push({role,path,width,contrastInspected:probe.contrastInspected,focusProbed:probe.focusProbed});
      }
      if (width === 390) {
        await session.evaluate(`document.querySelector('[aria-label="Buka atau tutup navigasi"]').click()`);
        await pause(350);
        assert(await session.evaluate(`Boolean(document.querySelector('[role="dialog"] [aria-current="page"]'))`), 'Mobile navigation marks current destination');
        await session.evaluate(`(() => {
          window.__blueEscapeDelivered=false;
          window.__blueEscapeListener=(event)=>{if(event.key==='Escape') window.__blueEscapeDelivered=true;};
          document.addEventListener('keydown',window.__blueEscapeListener,true);
        })()`);
        await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode:27, nativeVirtualKeyCode:27 });
        await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode:27, nativeVirtualKeyCode:27 });
        await pause(350);
        const nativeDelivered=await session.evaluate('window.__blueEscapeDelivered');
        const stillOpen=await session.evaluate(`Boolean(document.querySelector('[role="dialog"]'))`);
        if(!nativeDelivered && stillOpen) {
          // The headless browser can consume native keys without any DOM event.
          // Exercise the real app handler, but explicitly do not claim native input proof.
          await session.evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}))`);
          keyboardEvidence.push({role,mode:'DOM-dispatched Escape; native CDP key did not reach the document'});
        } else keyboardEvidence.push({role,mode:'native CDP Escape'});
        await session.evaluate(`document.removeEventListener('keydown',window.__blueEscapeListener,true)`);
        for(let i=0;i<20 && await session.evaluate(`Boolean(document.querySelector('[role="dialog"]'))`);i++) await pause(250);
        assert.equal(await session.evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Buka atau tutup navigasi', 'Sheet restores focus');
      }
    }
  }
  }
  if (phase !== 'all' && phase !== 'roles') await login('tenant');
  if (phase === 'all' || phase === 'states') {
  for (const width of [390,768,1280]) {
    await session.send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: width < 768 });
    for (const [path,scenario,text] of [
      ['/app?rentang=30-hari','dashboard-first-run','Belum ada kiriman'],
      ['/app?rentang=30-hari','dashboard-period-error','Ringkasan periode tidak dapat dimuat'],
    ]) {
      console.log(`Checking ${scenario} at ${width}px`);
      await visit(path,scenario);
      const probe=JSON.parse(await session.evaluate(PROBE));
      assert(probe.overflow<=1, `${scenario} ${width}: overflow`);
      checkPalette(probe, {scenario,width});
      assert((await session.evaluate('document.querySelector("main").innerText')).includes(text));
      results.push({scenario,width,contrastInspected:probe.contrastInspected});
    }
  }
  }
  if (phase === 'all' || phase === 'filters') {
  for (const width of [390,1280]) {
    await session.send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<768});
    for (const [path,selector,names] of [
      ['/app','#dashboard-rentang',['rentang','outlet','tz','dari','sampai']],
    ]) {
      await visit(path);
      let hydrated = false;
      for (let i=0; i<80; i++) {
        hydrated = await session.evaluate(`(() => {const field=document.querySelector('${selector}');return Boolean(field && Object.keys(field).some(key => key.startsWith('__reactProps$') && typeof field[key]?.onChange === 'function'));})()`);
        if (hydrated) break;
        await pause(250);
      }
      assert(hydrated, `Filter change handler hydrated: ${path}`);
      const before = await session.evaluate(`(() => {const field=document.querySelector('${selector}');const form=field.form;return {visible:field.getBoundingClientRect().height>0,keys:[...new FormData(form).keys()].sort(),open:form.querySelector('details').open};})()`);
      assert(before.visible); assert.equal(before.open,false); assert.deepEqual(before.keys,names.sort());
      await session.evaluate(`(() => {const field=document.querySelector('${selector}');field.value='kustom';field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert(await session.evaluate(`document.querySelector('${selector}').form.querySelector('details').open`),'Custom selection opens date controls');
      assert((await session.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth'))<=1);
      filterChecks.push({path,width,closedFieldsSubmitted:true,customDatesOpened:true});
    }
  }
  await visit('/app','dashboard-period-demo');
  assert.equal(await session.evaluate(`document.querySelector('#dashboard-rentang')?.value`),'7-hari');
  assert.equal(await session.evaluate(`document.querySelectorAll('#dashboard-trend-heading').length`),1);
  assert.equal(await session.evaluate(`document.querySelector('#dashboard-trend-heading').closest('section').querySelectorAll('tbody tr').length`),7);
  assert.equal(await session.evaluate(`document.querySelectorAll('.recharts-line').length`),2);
  await visit('/app?demo=grafik');
  assert((await session.evaluate('document.querySelector("main").innerText')).includes('Data demo'));
  await capture('dashboard-demo-1280');
  await session.send('Emulation.setDeviceMetricsOverride', { width:390,height:960,deviceScaleFactor:1,mobile:true });
  await capture('dashboard-demo-390');
  await visit('/app?rentang=7-hari','dashboard-period-empty');
  assert.equal(await session.evaluate(`document.querySelector('#dashboard-trend-heading').closest('section').querySelectorAll('tbody tr').length`),7);
  await visit('/app?rentang=30-hari','dashboard-period-demo');
  await session.send('Emulation.setDeviceMetricsOverride', { width:1280,height:960,deviceScaleFactor:1,mobile:false });
  await session.evaluate(`(() => {const field=document.querySelector('#dashboard-rentang');field.value='7-hari';field.form.requestSubmit();})()`);
  for(let i=0;i<60 && !(await session.evaluate('location.search')).includes('7-hari');i++) await pause(250);
  assert((await session.evaluate('location.search')).includes('7-hari'));
  const previousDocument=await session.evaluate('performance.timeOrigin');
  await session.send('Page.reload');
  let reloaded=false;
  for(let i=0;i<80;i++) {
    await pause(250);
    reloaded=await session.evaluate(`performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete' && Boolean(document.querySelector('#dashboard-rentang')) && !document.querySelector('[data-slot="skeleton"]')`).catch(()=>false);
    if(reloaded) break;
  }
  assert(reloaded, 'Reload completed in a new document with resolved regions');
  assert.equal(await session.evaluate(`document.querySelector('#dashboard-rentang')?.value`),'7-hari');
  const hover=await session.evaluate(`(() => {
    const button=document.querySelector('main [data-variant="default"]');
    const rules=[];
    function walk(list,parents='') { for(const rule of list) {
      const selector=parents+' '+(rule.selectorText||'');
      if(rule.style?.backgroundColor?.includes('--primary-hover')) rules.push(selector);
      if(rule.cssRules) walk(rule.cssRules,selector);
    }}
    for(const sheet of document.styleSheets) {try {walk(sheet.cssRules);} catch {}}
    return {token:getComputedStyle(document.documentElement).getPropertyValue('--primary-hover').trim(),
      buttonClass:button?.className, rule:rules.some(selector=>selector.includes('bg-primary-hover')&&selector.includes(':hover'))};
  })()`);
  assert.equal(hover.token.toLowerCase(),'oklch(0.424 0.199 265.638)');
  assert(hover.buttonClass?.includes('hover:bg-primary-hover') && hover.rule, `Primary button uses the compiled darker hover rule: ${JSON.stringify(hover)}`);
  const link=await session.evaluate(`document.querySelector('a[aria-label^="Kiriman dibuat:"]')?.getAttribute('href')`);
  assert(link && link.includes('7-hari') && link.includes('support=created'),'KPI link preserves period and basis');
  await capture('tenant-home-final-1280');
  }
  writeFileSync(new URL(`report-${phase}.json`,output),JSON.stringify({phase,origin,results,filterChecks,paletteDiagnostics,paletteProbed:results.length>0,paletteFindings,filterReload:phase==='all'||phase==='filters',mobileFocusReturn:phase==='all'||phase==='roles',keyboardEvidence,hoverEvidence:phase==='all'||phase==='filters'?"compiled CSS rule and resolved token; headless hover rendering not asserted":null},null,2));
  console.log(`${paletteDiagnostics ? "LAYOUT/FLOW PASS (palette diagnostics separate)" : "BLUE UI PASS"}: ${results.length} role/route/state/viewport checks; ${filterChecks.length} filter disclosure checks; phase ${phase} passed; input methods and palette findings recorded in report-${phase}.json.`);
} catch (error) {
  const exceptions=session.events().filter(event=>event.method==='Runtime.exceptionThrown').map(event=>event.params.exceptionDetails?.exception?.description?.slice(0,1800));
  const page=await session.evaluate(`({path:location.pathname,ready:document.readyState})`).catch(()=>null);
  const documents=session.events().filter(e=>e.method==='Network.requestWillBeSent' && e.params.type==='Document').map(e=>({url:e.params.request.url,initiator:e.params.initiator}));
  writeFileSync(new URL(`failure-${phase}.json`,output),JSON.stringify({page,exceptions,documents},null,2));
  console.error(JSON.stringify({page,exceptions}));
  throw error;
} finally { session.close(); await closeTab(target); }
