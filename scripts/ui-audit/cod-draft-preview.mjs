// T-175 / T-193 draft-time COD preview: the grossed-up COD amount (formula version 2),
// Mengantar's 3.33% fee as its own deduction, and a seller payout that does not
// fall below the goods value when shipping is not discounted.
// Read-only: the `shipment-draft-saved` scenario renders a synthetic saved draft
// (goods 100 000, JNE REG price 14 000, no special price). No draft, estimate,
// COD total or provider write.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/cod-draft-preview.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';
import {PROBE} from './probe.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const output=new URL('./.output/cod-draft-preview/',import.meta.url);
mkdirSync(output,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(expression){for(let i=0;i<100;i++){if(await s.evaluate(expression).catch(()=>false))return;await pause(150)}throw Error(`Did not settle: ${expression}`)}
// Expected from the formula, computed here in integers independently of the
// application: COD = ceil(114 000 × 10000 / 9667) = 117 927 (9667 × 117 927 =
// 1 140 000 309 ≥ 1 140 000 000 > 9667 × 117 926); Mengantar keeps
// round(117 927 × 0.0333) = 3 927, VAT inside it round(3 927 × 11 / 111) = 389,
// no round-up left (T-193: one Biaya COD); payout 100 000.
const base=100000+14000;
const cod=Math.floor((base*10000+9666)/9667);
const mengantarFee=Math.floor((cod*333+5000)/10000);
const vatInside=Math.floor((mengantarFee*22+111)/222);
const rounding=cod-base-mengantarFee;
const payout=cod-14000-mengantarFee;
assert.equal(cod,117927);assert.equal(payout,100000);assert.equal(vatInside,389);assert.equal(rounding,0);
const idr=n=>new Intl.NumberFormat('id-ID',{currency:'IDR',maximumFractionDigits:0,style:'currency'}).format(n).replace(/\s/g,' ');
const results=[];
try{
 for(const d of ['Page','Runtime','Network'])await s.send(`${d}.enable`);
 await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');
 await waitFor(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
 await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
 await pause(250);await s.evaluate(`document.querySelector('.auth-submit').click()`);await waitFor(`location.pathname==='/app'`);
 await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'shipment-draft-saved'}});
 for(const width of [1440,390]){
  await s.send('Emulation.setDeviceMetricsOverride',{width,height:width<768?844:900,deviceScaleFactor:1,mobile:width<768});
  await s.goto(origin+'/app/pengiriman/baru');
  await waitFor(`document.readyState==='complete' && !!document.getElementById('draft-cod-explanation-title') && !document.querySelector('[data-slot=skeleton]')`);
  await pause(400);
  assert.equal(await s.evaluate('window.innerWidth'),width,`viewport applied at ${width}`);
  const rows=JSON.parse(await s.evaluate(`JSON.stringify([...document.querySelector('section[aria-labelledby=draft-cod-explanation-title] article dl').children].map(r=>[r.querySelector('dt').innerText.trim(),r.querySelector('dd').innerText.trim().replace(/\\s/g,' '),r.dataset.metricId??null]))`));
  const row=label=>rows.find(([dt])=>dt===label)?.[1];
  assert.equal(row('Total ditagih ke pelanggan'),idr(cod),`COD total at ${width}`);
  assert.equal(row(`Biaya COD Mengantar 3,33% (termasuk PPN ${idr(vatInside)})`),idr(mengantarFee),`one COD fee, VAT inside, at ${width}`);
  assert(!rows.some(([dt])=>/^PPN biaya COD|^Biaya COD$|^Pembulatan/.test(dt)),`no separate VAT, stored fee or zero round-up row at ${width}`);
  assert.equal(row('Biaya COD Mengantar (3,33% dari total COD)'),'−'+idr(mengantarFee),`Mengantar fee deduction at ${width}`);
  const payoutRow=rows.find(([dt])=>dt==='Estimasi diterima penjual');
  assert.equal(payoutRow?.[1],idr(payout),`payout at ${width}`);
  assert.equal(payoutRow?.[2],'COD-SELLER-PAYOUT-IDR');
  assert(!rows.some(([dt])=>/GeraiCUAN|referensi/.test(dt)),`no GeraiCUAN-fee or reference-fee label at ${width}`);
  const probe=JSON.parse(await s.evaluate(PROBE));
  assert(probe.overflow<=0,`overflow ${probe.overflow} at ${width}`);
  assert.equal(probe.contrastFails,0,`contrast at ${width}: ${JSON.stringify(probe.contrast)}`);
  assert.equal(probe.weakFocusRing,0,`focus at ${width}`);
  await s.evaluate(`document.getElementById('draft-cod-explanation-title').scrollIntoView({block:'start'})`);await pause(350);
  const {data}=await s.send('Page.captureScreenshot',{format:'png'});
  writeFileSync(new URL(`cod-draft-preview-${width}.png`,output),Buffer.from(data,'base64'));
  results.push({width,rows,overflow:probe.overflow,contrastFails:probe.contrastFails,weakFocusRing:probe.weakFocusRing});
 }
 writeFileSync(new URL('results.json',output),JSON.stringify(results,null,1));
 console.log(JSON.stringify(results));
 console.log('COD DRAFT PREVIEW PASS');
}finally{s.close();await closeTab(target)}process.exit(0);
