// T-186 / PR-64: three payment methods on the draft form, and the COD Ongkir
// charge with its break-even refusal.
// Part A drives the live draft form (no draft is saved: the form is never
// submitted). Part B reads the read-only `shipment-draft-saved-cod-ongkir`
// scenario (a synthetic saved draft; JNE REG price 14 000 with no special
// price, SAP REG price 12 000 with special price 9 800). No draft, estimate,
// COD total or provider write. Neither part reads a column added by 0050.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/payment-methods.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';
import {PROBE} from './probe.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const output=new URL('./.output/payment-methods/',import.meta.url);
mkdirSync(output,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(expression){for(let i=0;i<120;i++){if(await s.evaluate(expression).catch(()=>false))return;await pause(150)}throw Error(`Did not settle: ${expression}`)}
const idr=n=>new Intl.NumberFormat('id-ID',{currency:'IDR',maximumFractionDigits:0,style:'currency'}).format(n).replace(/\s/g,' ');
// Expected money, computed here in integers independently of the application:
// break-even = ceil(S × 10000 / 9667); Mengantar keeps round_half_up(C × 333 / 10000).
const breakEven=S=>Math.max(1,Math.floor((S*10000+9666)/9667));
const fee=C=>Math.floor((C*333+5000)/10000);
assert.equal(breakEven(14000),14483);assert.equal(breakEven(9800),10138);
assert(9667*14483>=140000000&&9667*14482<140000000);
const setValue=(selector,value)=>s.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
const shot=async(name,selector)=>{await s.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`);await pause(350);const {data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(`${name}.png`,output),Buffer.from(data,'base64'))};
const probe=async(label)=>{const p=JSON.parse(await s.evaluate(PROBE));assert(p.overflow<=0,`overflow ${p.overflow} ${label}`);assert.equal(p.contrastFails,0,`contrast ${label}: ${JSON.stringify(p.contrast)}`);assert.equal(p.weakFocusRing,0,`focus ${label}: ${JSON.stringify(p.focusDetail)}`);return {overflow:p.overflow,contrastFails:p.contrastFails,contrastInspected:p.contrastInspected,weakFocusRing:p.weakFocusRing,smallTargetCount:p.smallTargetCount}};
const results=[];
try{
 for(const d of ['Page','Runtime','Network'])await s.send(`${d}.enable`);
 await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});await s.send('Page.bringToFront');
 await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');
 await waitFor(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
 await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
 await pause(250);await s.evaluate(`document.querySelector('.auth-submit').click()`);await waitFor(`location.pathname==='/app'`);

 for(const width of [1440,390]){
  await s.send('Emulation.setDeviceMetricsOverride',{width,height:width<768?844:900,deviceScaleFactor:1,mobile:width<768});
  // ---- Part A: the draft form ----
  await s.send('Network.setExtraHTTPHeaders',{headers:{}});
  await s.goto(origin+'/app/pengiriman/baru');
  await waitFor(`document.readyState==='complete' && !!document.querySelector('[data-payment-panel]') && Object.keys(document.getElementById('paymentType-COD')||{}).some(k=>k.startsWith('__reactProps$'))`);
  await pause(400);
  assert.equal(await s.evaluate('window.innerWidth'),width,`viewport ${width}`);
  const choices=JSON.parse(await s.evaluate(`JSON.stringify([...document.querySelectorAll('#paymentType [role=radio]')].map(r=>{const l=r.closest('label');const b=l.getBoundingClientRect();return {value:r.getAttribute('value'),checked:r.getAttribute('aria-checked'),label:l.innerText.split('\\n')[0].trim(),height:Math.round(b.height),width:Math.round(b.width)}}))`));
  assert.deepEqual(choices.map(c=>c.label),['Non-COD','COD','COD Ongkir'],`three labelled choices at ${width}`);
  assert.deepEqual(choices.map(c=>c.checked),['true','false','false'],`Non-COD default at ${width}`);
  for(const c of choices)assert(c.height>=44&&c.width>=44,`choice ${c.value} ${c.width}x${c.height} at ${width}`);
  const panelState=async()=>JSON.parse(await s.evaluate(`JSON.stringify((()=>{const p=document.querySelector('[data-payment-panel]');return {method:p.dataset.paymentPanel,label:p.querySelector('label[for=declaredValue]')?.innerText.trim(),inputs:document.querySelectorAll('input[name=declaredValue]').length,value:document.getElementById('declaredValue')?.value,notes:[...p.querySelectorAll('.border-dashed p.font-medium')].map(n=>n.innerText.trim()),live:document.querySelector('#paymentType ~ [aria-live=polite][role=status]')?.innerText.trim()??null,chargeInputs:document.querySelectorAll('input[name=codShippingChargeIdr]').length}})())`));
  const nonCod=await panelState();
  assert.deepEqual({method:nonCod.method,label:nonCod.label,inputs:nonCod.inputs,notes:nonCod.notes,chargeInputs:nonCod.chargeInputs},{method:'NON_COD',label:'Nilai barang untuk asuransi (Rp)',inputs:1,notes:[],chargeInputs:0},`Non-COD panel at ${width}`);
  await setValue('#declaredValue','150000');
  const methodRows=[{method:'NON_COD',probe:await probe(`draft NON_COD ${width}`)}];
  await shot(`draft-non-cod-${width}`,'#draft-payment-heading');
  for(const [value,label,note,announce] of [
   ['COD','Nilai barang (Rp)','Total COD dihitung otomatis','Kolom nilai barang ditampilkan. Total COD dihitung otomatis setelah layanan dipilih.'],
   ['COD_ONGKIR','Nilai barang yang sudah dibayar (Rp)','Ongkir yang ditagih kurir diatur saat memilih layanan','Kolom nilai barang yang sudah dibayar ditampilkan. Ongkir yang ditagih diatur saat memilih layanan.'],
  ]){
   await s.evaluate(`document.getElementById('paymentType-${value}').click()`);
   await waitFor(`document.querySelector('[data-payment-panel]').dataset.paymentPanel==='${value}'`);
   await pause(200);
   const state=await panelState();
   assert.deepEqual({method:state.method,label:state.label,inputs:state.inputs,notes:state.notes,chargeInputs:state.chargeInputs},{method:value,label,inputs:1,notes:[note],chargeInputs:0},`${value} panel at ${width}`);
   assert.equal(state.value,'150000',`goods value carried into ${value} at ${width}`);
   assert.equal(state.live,announce,`${value} field announced at ${width}`);
   methodRows.push({method:value,announced:state.live,probe:await probe(`draft ${value} ${width}`)});
   await shot(`draft-${value.toLowerCase().replace('_','-')}-${width}`,'#draft-payment-heading');
  }
  // Keyboard selection is not driven here: on the shared CDP browser,
  // Input.dispatchKeyEvent reached no keydown listener on this page (checked
  // 2026-09-17), so a key-driven assertion would prove nothing either way.

  // ---- Part B: the COD Ongkir charge (read-only scenario) ----
  await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'shipment-draft-saved-cod-ongkir'}});
  await s.goto(origin+'/app/pengiriman/baru');
  await waitFor(`document.readyState==='complete' && !!document.getElementById('draft-cod-ongkir-title') && Object.keys(document.getElementById('draft-cod-ongkir-0-charge')||{}).some(k=>k.startsWith('__reactProps$'))`);
  await pause(400);
  assert(!(await s.evaluate(`!!document.getElementById('draft-cod-explanation-title')`)),`no full-COD breakdown for COD Ongkir at ${width}`);
  const card=async(i)=>JSON.parse(await s.evaluate(`JSON.stringify((()=>{const a=document.getElementById('draft-cod-ongkir-${i}-title').closest('article');const row=id=>a.querySelector('[data-metric-id="'+id+'"] dd')?.innerText.trim().replace(/\\s/g,' ');const input=document.getElementById('draft-cod-ongkir-${i}-charge');return {service:a.querySelector('h4').innerText.trim(),deducted:row('COD-ONGKIR-SHIPPING-DEDUCTED-IDR'),breakEven:row('COD-ONGKIR-BREAK-EVEN-IDR'),value:input.value,invalid:input.getAttribute('aria-invalid'),alert:a.querySelector('[role=alert]')?.innerText.trim().replace(/\\s/g,' ')??null,error:document.getElementById('draft-cod-ongkir-${i}-charge-error')?.innerText.trim().replace(/\\s/g,' ')??null,describedBy:input.getAttribute('aria-describedby'),refusalLive:a.querySelector('[data-cod-ongkir-announcement=refusal]')?.textContent.replace(/\\s/g,' ')??null,settledLive:a.querySelector('[data-cod-ongkir-announcement=settled]')?.textContent.replace(/\\s/g,' ')??null,chattyResults:a.querySelectorAll('dl[aria-live],[role=alert]').length,feeRow:row('COD-ONGKIR-MENGANTAR-FEE-IDR'),difference:row('COD-ONGKIR-SELLER-DIFFERENCE-IDR'),height:Math.round(input.getBoundingClientRect().height)}})())`));
  const services=[['JNE REG',14000],['SAP REG',9800]];
  const cards=[];
  for(const [i,[service,S]] of services.entries()){
   const B=breakEven(S);
   const initial=await card(i);
   assert.deepEqual({service:initial.service,deducted:initial.deducted,breakEven:initial.breakEven,value:initial.value,invalid:initial.invalid,alert:initial.alert,difference:initial.difference},{service,deducted:idr(S),breakEven:idr(B),value:String(B),invalid:'false',alert:null,difference:idr(B-S-fee(B))},`${service} starts at break-even at ${width}`);
   if(width<768)assert(initial.height>=44,`${service} charge input ${initial.height}px at ${width}`);
   // Layout, not just colour and overflow: two cards were once squeezed side by
   // side into the 22rem form rail (a viewport breakpoint on a narrow panel), so
   // each label ran into its own amount and the refusal message was cut off, and
   // every probe above still passed. Bind the geometry that went wrong.
   const layout=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const a=document.getElementById('draft-cod-ongkir-${i}-title').closest('article');const overlaps=[...a.querySelectorAll('dl > div')].filter(row=>{const dt=row.querySelector('dt'),dd=row.querySelector('dd');if(!dt||!dd)return false;const x=dt.getBoundingClientRect(),y=dd.getBoundingClientRect();return x.right>y.left+0.5&&x.top<y.bottom-0.5&&y.top<x.bottom-0.5}).length;const input=a.querySelector('input');return {cardWidth:Math.round(a.getBoundingClientRect().width),overlaps,inputFits:input.getBoundingClientRect().right<=a.getBoundingClientRect().right+0.5}})())`));
   assert(layout.cardWidth>=280,`${service} card is ${layout.cardWidth}px wide at ${width}; labels cannot sit beside their amounts`);
   assert.equal(layout.overlaps,0,`${service}: a label collides with its amount at ${width}`);
   assert(layout.inputFits,`${service}: the charge input overflows its card at ${width}`);
   await setValue(`#draft-cod-ongkir-${i}-charge`,String(B-1));
   await waitFor(`!!document.getElementById('draft-cod-ongkir-${i}-charge-error')`);
   const refused=await card(i);
   const message=`Ongkir tidak boleh di bawah titik impas ${idr(B)}. ${idr(B-1)} kurang ${idr(1)} dan membuat penjual rugi.`;
   // T-199: the refusal is visible and described, never an assertive alert while typing,
   // and the polite refusal region stays silent until the field loses focus.
   assert.deepEqual({invalid:refused.invalid,alert:refused.alert,error:refused.error,describedBy:refused.describedBy,refusalLive:refused.refusalLive,chattyResults:refused.chattyResults,difference:refused.difference},{invalid:'true',alert:null,error:message,describedBy:`draft-cod-ongkir-${i}-charge-hint draft-cod-ongkir-${i}-charge-error`,refusalLive:'',chattyResults:0,difference:'—'},`${service} refuses ${B-1} at ${width}`);
   await s.evaluate(`(()=>{const e=document.getElementById('draft-cod-ongkir-${i}-charge');e.focus();e.blur()})()`);
   await waitFor(`document.getElementById('draft-cod-ongkir-${i}-title').closest('article').querySelector('[data-cod-ongkir-announcement=refusal]').textContent.length>0`);
   const blurred=await card(i);
   assert.equal(blurred.refusalLive,message,`${service} refusal announced once on blur at ${width}`);
   if(i===0){await shot(`cod-ongkir-refused-${width}`,'#draft-cod-ongkir-title');cards.push({probeRefused:await probe(`cod ongkir refused ${width}`)})}
   await setValue(`#draft-cod-ongkir-${i}-charge`,'20.000');
   await waitFor(`!document.getElementById('draft-cod-ongkir-${i}-charge-error')`);
   const raised=await card(i);
   assert.deepEqual({invalid:raised.invalid,difference:raised.difference,feeRow:raised.feeRow},{invalid:'false',difference:idr(20000-S-fee(20000)),feeRow:`−${idr(fee(20000))}`},`${service} raised to 20 000 at ${width}`);
   // T-199: the results are announced once the charge has settled, not per keystroke.
   await waitFor(`document.getElementById('draft-cod-ongkir-${i}-title').closest('article').querySelector('[data-cod-ongkir-announcement=settled]').textContent.length>0`);
   const settled=await card(i);
   assert.equal(settled.settledLive,`Biaya COD Mengantar ${idr(fee(20000))}. Selisih diterima penjual ${idr(20000-S-fee(20000))}.`,`${service} settled announcement at ${width}`);
   cards.push({service,S,breakEven:B,initial,refused,raised});
  }
  await shot(`cod-ongkir-raised-${width}`,'#draft-cod-ongkir-title');
  const raisedProbe=await probe(`cod ongkir raised ${width}`);
  results.push({width,choices,methodRows,cards,raisedProbe});
 }
 writeFileSync(new URL('results.json',output),JSON.stringify(results,null,1));
 console.log(JSON.stringify(results));
 console.log('PAYMENT METHODS PASS');
}finally{await s.send('Network.setExtraHTTPHeaders',{headers:{}}).catch(()=>{});s.close();await closeTab(target)}process.exit(0);
