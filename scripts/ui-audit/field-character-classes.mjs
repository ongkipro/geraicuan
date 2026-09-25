// T-196 browser regression: number fields take digits only, name fields take no
// digits, address fields take house-address punctuation, and a refused keystroke
// or paste shows a polite hint under the field.
// Read-only: types, pastes and composes into fields, never submits a form, so no
// draft, contact, registration or provider order is created.
//
// Guards bound to the owner's request ("field angka … tidak bisa diisi character
// dan sebaliknya untuk field nama hanya character"):
//   1. typed and pasted letters/symbols never land in weight, quantity, price,
//      phone, Cek tarif weight or the COD Ongkir charge; digits do;
//   2. typed and pasted digits never land in a recipient or owner name; Indonesian names
//      ("I Made Suardana", "Siti Nur'aini", "R.A. Kartini") do. Owner decision: a sender
//      may be a store, so "Toko 88" is accepted as a sender name (emoji still refused),
//      and a contact's name rule follows its Pengirim checkbox live;
//   3. an address keeps "Jl. Pajajaran No. 88", "Blok C2/5", "RT 03/RW 07", and (T-199)
//      "Ma’ruf", "Blok C&D", "km 5+200", and drops an emoji, a flag or a skin-toned emoji
//      whole; a store name keeps its digits; a pasted non-breaking space stays a space;
//   4. the caret stays where the operator typed; IME composition commits cleaned text;
//   5. a stored value already holding a digit is not rewritten by an unrelated edit;
//   6. the refusal hint is an aria-live=polite region with the class's text.
// Screenshots of the hints at 1440 and 390.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/field-character-classes.mjs
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session} from './cdp.mjs';

const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/field-character-classes/',import.meta.url);mkdirSync(out,{recursive:true});
// Other audits share this Chrome and clear or replace its cookies mid-run, so this
// one signs in inside its own browser context and disposes of it at the end.
const cdpBase=`http://127.0.0.1:${process.env.CDP_PORT||'9411'}`;
const browser=await Session.attach((await (await fetch(`${cdpBase}/json/version`)).json()).webSocketDebuggerUrl);
const {browserContextId}=await browser.send('Target.createBrowserContext',{disposeOnDetach:true});
const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId});
const s=await Session.attach(`${cdpBase.replace('http','ws')}/devtools/page/${targetId}`);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr,label=expr){for(let i=0;i<160;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error('timeout: '+label)}
const HINTS={
 NUMERIC_INTEGER:'Hanya angka.',RUPIAH:'Hanya angka.',PHONE:'Hanya angka, boleh diawali +.',
 PERSON_NAME:"Hanya huruf; tanda . ' - , boleh.",
 BUSINESS_NAME:'Emoji dan karakter tersembunyi tidak dapat dipakai.',
 ADDRESS:"Alamat hanya boleh huruf, angka, spasi, dan tanda baca; emoji tidak dapat dipakai.",
};
const report={checks:[],shots:[]};
const q=sel=>JSON.stringify(sel);

async function field(sel){
 return JSON.parse(await s.evaluate(`(()=>{const e=document.querySelector(${q(sel)});if(!e)return 'null';const h=e.id?document.getElementById(e.id+'-character-hint'):e.parentElement.querySelector('[data-character-hint]');return JSON.stringify({value:e.value,caret:e.selectionStart,cls:e.dataset.characterClass,type:e.type,inputMode:e.inputMode,hint:h?.textContent??null,live:h?.getAttribute('aria-live')??null,focused:document.activeElement===e,path:location.pathname})})()`));
}
async function focus(sel,{clear=true}={}){
 await s.evaluate(`(()=>{const e=document.querySelector(${q(sel)});e.scrollIntoView({block:'center'});e.focus();${clear?`const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value');d.set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));`:''}e.setSelectionRange(e.value.length,e.value.length)})()`);
 await pause(120);
}
// Real key events, one character at a time, as a keyboard would send them.
async function type(text){
 for(const ch of text){
  await s.send('Input.dispatchKeyEvent',{type:'keyDown',key:ch,text:ch,unmodifiedText:ch});
  await s.send('Input.dispatchKeyEvent',{type:'keyUp',key:ch});
 }
 await pause(150);
}
// A real paste: copy into the browser clipboard with a user gesture (the LAN origin is
// not a secure context, so navigator.clipboard is unavailable), then Ctrl+V runs the
// editing command on the focused field.
async function paste(text){
 const r=await s.send('Runtime.evaluate',{userGesture:true,returnByValue:true,expression:`(()=>{const active=document.activeElement,start=active.selectionStart,end=active.selectionEnd;const t=document.createElement('textarea');t.value=${q(text)};t.setAttribute('aria-hidden','true');t.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();active.focus();active.setSelectionRange(start,end);return ok})()`});
 assert.equal(r.result.value,true,'clipboard copy');
 await s.send('Input.dispatchKeyEvent',{type:'keyDown',key:'v',code:'KeyV',modifiers:2,windowsVirtualKeyCode:86,commands:['paste']});
 await s.send('Input.dispatchKeyEvent',{type:'keyUp',key:'v',code:'KeyV',modifiers:2,windowsVirtualKeyCode:86});
 await pause(200);
}
async function compose(text){
 await s.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
 await pause(80);
 await s.send('Input.insertText',{text});
 await pause(200);
}
function check(name,ok,detail){report.checks.push({name,ok,detail});assert(ok,`${name}: ${JSON.stringify(detail)}`)}
async function shot(name,sel){
 await s.evaluate(`document.querySelector(${q(sel)}).scrollIntoView({block:'center'})`);await pause(300);
 const{data}=await s.send('Page.captureScreenshot',{format:'png'});
 const file=new URL(name+'.png',out);writeFileSync(file,Buffer.from(data,'base64'));report.shots.push(file.pathname);
}

/** One field: forbidden typing and pasting stay out, allowed text goes in, the hint appears. */
async function exercise(label,sel,kind,{forbiddenTyped,forbiddenPasted,allowed,expectAfterForbidden,width}){
 await focus(sel);
 await type(forbiddenTyped);
 let f=await field(sel);
 check(`${label} @${width}: typed ${JSON.stringify(forbiddenTyped)} refused`,f.value===expectAfterForbidden.typed&&f.cls===kind,f);
 check(`${label} @${width}: polite hint "${HINTS[kind]}"`,f.hint===HINTS[kind]&&f.live==='polite',f);
 await focus(sel);
 await paste(forbiddenPasted);
 f=await field(sel);
 check(`${label} @${width}: pasted ${JSON.stringify(forbiddenPasted)} cleaned`,f.value===expectAfterForbidden.pasted,f);
 await shot(`${label.replace(/\W+/g,'-').toLowerCase()}-${width}`,sel);
 await focus(sel);
 await type(allowed);
 f=await field(sel);
 check(`${label} @${width}: ${JSON.stringify(allowed)} accepted`,f.value===allowed,f);
 await pause(3200);
 f=await field(sel);
 check(`${label} @${width}: hint clears after the refusal`,f.hint==='',f);
 if(kind==='NUMERIC_INTEGER'||kind==='RUPIAH')check(`${label} @${width}: numeric keyboard, no spinner`,f.inputMode==='numeric'&&f.type==='text',f);
 if(kind==='PHONE')check(`${label} @${width}: phone keyboard`,f.inputMode==='tel',f);
}

async function viewport(width){await s.send('Emulation.setDeviceMetricsOverride',{width,height:width<768?900:1000,deviceScaleFactor:1,mobile:width<768});await pause(300)}
async function go(path,ready){await s.goto(origin+path);await wait(`${ready}&&!document.querySelector('[data-slot=skeleton]')`,'ready '+path);await pause(2000)}
const hydrated=sel=>`(()=>{const e=document.querySelector(${q(sel)});return !!e&&Object.keys(e).some(k=>k.startsWith('__reactProps$')&&typeof e[k]?.onChange==='function')})()`;

try{
 for(const d of ['Page','Runtime','Network'])await s.send(`${d}.enable`);
 await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await s.send('Network.clearBrowserCookies');

 // Public sign-up: read before signing in. Nothing is submitted.
 for(const width of [1440,390]){
  await viewport(width);
  await go('/daftar',hydrated('#ownerName'));
  await exercise('Daftar nama pemilik','#ownerName','PERSON_NAME',{width,forbiddenTyped:'Andi2',forbiddenPasted:'Andi Saputra 99',expectAfterForbidden:{typed:'Andi',pasted:'Andi Saputra '},allowed:"Siti Nur'aini"});
  await exercise('Daftar WhatsApp','#whatsapp','PHONE',{width,forbiddenTyped:'08a12',forbiddenPasted:'+62 812-3456-7890 (WA)',expectAfterForbidden:{typed:'0812',pasted:'+6281234567890'},allowed:'+6281234567890'});
  await focus('#storeName');await type('Grosir Aksesoris HP 99');
  const store=await field('#storeName');
  check(`Daftar nama toko @${width}: digits stay in a store name without a hint`,store.value==='Grosir Aksesoris HP 99'&&store.hint==='',store);
 }

 await go('/login/tenant',`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);
 await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
 await pause(250);await s.evaluate(`document.querySelector('.auth-submit').click()`);
 try{await wait(`location.pathname==='/app'`,'login')}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}

 for(const width of [1440,390]){
  await viewport(width);
  await s.send('Network.setExtraHTTPHeaders',{headers:{}});
  await go('/app/pengiriman/baru',hydrated('#senderName'));
  await exercise('Draf nama pengirim','#senderName','BUSINESS_NAME',{width,forbiddenTyped:'Toko 88😀',forbiddenPasted:'Grosir HP 99 ❤️',expectAfterForbidden:{typed:'Toko 88',pasted:'Grosir HP 99 '},allowed:'Toko 88'});
  await exercise('Draf nama penerima','#recipientName','PERSON_NAME',{width,forbiddenTyped:'Budi 2',forbiddenPasted:'R.A. Kartini 1945 😊',expectAfterForbidden:{typed:'Budi ',pasted:'R.A. Kartini  '},allowed:'I Made Suardana'});
  await exercise('Draf telepon penerima','#recipientPhone','PHONE',{width,forbiddenTyped:'0812abc',forbiddenPasted:'0812-3456-7890',expectAfterForbidden:{typed:'0812',pasted:'081234567890'},allowed:'081234567890'});
  await exercise('Draf berat','#packageWeightGrams','NUMERIC_INTEGER',{width,forbiddenTyped:'1,5kg',forbiddenPasted:'1.500 gram',expectAfterForbidden:{typed:'15',pasted:'1500'},allowed:'1500'});
  await exercise('Draf jumlah paket','#packageQuantity','NUMERIC_INTEGER',{width,forbiddenTyped:'2x',forbiddenPasted:'dua 2',expectAfterForbidden:{typed:'2',pasted:'2'},allowed:'2'});
  await exercise('Draf nilai barang','#declaredValue','RUPIAH',{width,forbiddenTyped:'150rb',forbiddenPasted:'Rp 1.250.000,-',expectAfterForbidden:{typed:'150',pasted:'1250000'},allowed:'1250000'});
  await exercise('Draf alamat penerima','#recipientAddress','ADDRESS',{width,forbiddenTyped:'Jl. Mawar😀 5',forbiddenPasted:'Blok C&D 👍🏽 RT 03/RW 07',expectAfterForbidden:{typed:'Jl. Mawar 5',pasted:'Blok C&D  RT 03/RW 07'},allowed:'Jl. Ma\u2019ruf Blok C&D; km 5+200 (belakang masjid) #2'});
  // T-199: a pasted non-breaking space is a word boundary, not a refused character.
  await focus('#recipientName');await paste('Siti\u00A0Aminah');
  const nbsp=await field('#recipientName');
  check(`Draf nama penerima @${width}: pasted "Siti\\u00A0Aminah" keeps its space without a hint`,nbsp.value==='Siti Aminah'&&nbsp.hint==='',nbsp);
  // T-199: a pasted emoji with a skin tone leaves no orphan modifier behind.
  await focus('#senderName');await paste('Toko 88 👍🏽');
  const orphan=await field('#senderName');
  check(`Draf nama pengirim @${width}: pasted "👍🏽" leaves no orphan modifier`,orphan.value==='Toko 88 '&&!/\p{Emoji_Modifier}|\p{Regional_Indicator}/u.test(orphan.value),orphan);
  const content=await (async()=>{await focus('#packageContent');await type('Kaos 2 pcs');return field('#packageContent')})();
  check(`Draf isi paket @${width}: digits stay in free text`,content.value==='Kaos 2 pcs'&&content.hint==='',content);

  // Caret: a refused character typed mid-value leaves the caret where it was.
  await focus('#packageWeightGrams');await type('1200');
  await s.evaluate(`document.getElementById('packageWeightGrams').setSelectionRange(2,2)`);await type('x');
  let caret=await field('#packageWeightGrams');
  check(`Draf berat @${width}: caret stays at 2 after a refused key`,caret.value==='1200'&&caret.caret===2,caret);
  await type('5');caret=await field('#packageWeightGrams');
  check(`Draf berat @${width}: accepted key lands at the caret`,caret.value==='12500'&&caret.caret===3,caret);

  // The same refused key twice in a row is refused both times (React's value tracker stays in step).
  await focus('#packageWeightGrams');await type('12xx3');
  const repeated=await field('#packageWeightGrams');
  check(`Draf berat @${width}: a repeated refused key stays out`,repeated.value==='123',repeated);

  // IME composition commits only letters into a name.
  await focus('#recipientName');await compose('Dewi7');
  const composed=await field('#recipientName');
  check(`Draf nama penerima @${width}: composed text is cleaned on commit`,composed.value==='Dewi'&&composed.hint===HINTS.PERSON_NAME,composed);

  // A value set without an edit (a picked contact, an old record) is not rewritten by the next keystroke.
  await s.evaluate(`(()=>{const e=document.getElementById('recipientName');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Budi 2')})()`);
  await focus('#recipientName',{clear:false});await type('a');
  const stored=await field('#recipientName');
  check(`Draf nama penerima @${width}: an existing digit is left for the server to judge`,stored.value==='Budi 2a',stored);

  await go('/app/kontak/baru?peran=penerima',hydrated('#contactName'));
  await exercise('Kontak nama penerima','#contactName','PERSON_NAME',{width,forbiddenTyped:'Joko9',forbiddenPasted:'Joko Susanto 081234',expectAfterForbidden:{typed:'Joko',pasted:'Joko Susanto '},allowed:'Joko Susanto'});
  // Ticking Pengirim switches the name to the store rule at once; unticking switches back.
  await s.evaluate(`document.querySelector('input[name=roleSender]').click()`);await pause(250);
  await focus('#contactName');await type('Toko 88');
  let roleName=await field('#contactName');
  check(`Kontak nama @${width}: with Pengirim ticked, "Toko 88" is accepted`,roleName.cls==='BUSINESS_NAME'&&roleName.value==='Toko 88',roleName);
  await s.evaluate(`document.querySelector('input[name=roleSender]').click()`);await pause(250);
  await focus('#contactName');await type('Budi 2');
  roleName=await field('#contactName');
  check(`Kontak nama @${width}: with Pengirim unticked, "Budi 2" is blocked`,roleName.cls==='PERSON_NAME'&&roleName.value==='Budi '&&roleName.hint===HINTS.PERSON_NAME,roleName);
  await exercise('Kontak telepon','#contactPhone','PHONE',{width,forbiddenTyped:'+62++8a1',forbiddenPasted:'telp 0812 3456',expectAfterForbidden:{typed:'+6281',pasted:'08123456'},allowed:'+6281234567890'});
  await exercise('Kontak alamat','#addressText','ADDRESS',{width,forbiddenTyped:'Gg. Kober 🇮🇩21',forbiddenPasted:'Jl. Margonda Raya\nGg. Kober No. 21 ✨',expectAfterForbidden:{typed:'Gg. Kober 21',pasted:'Jl. Margonda Raya Gg. Kober No. 21 '},allowed:'RT 03/RW 07, Blok C2/5'});

  await go('/app/cek-tarif',hydrated('#rate-weight'));
  await exercise('Cek tarif berat','#rate-weight','NUMERIC_INTEGER',{width,forbiddenTyped:'2kg',forbiddenPasted:'2.000 g',expectAfterForbidden:{typed:'2',pasted:'2000'},allowed:'2000'});

  // COD Ongkir charge in the saved-draft scenario: read-only, nothing is confirmed.
  await s.send('Network.setExtraHTTPHeaders',{headers:{'x-geraicuan-ui-audit':'shipment-draft-saved-cod-ongkir'}});
  const charge='input[data-character-class="RUPIAH"][data-metric-id]';
  await go('/app/pengiriman/baru',hydrated(charge));
  await exercise('COD Ongkir ongkir ditagih',charge,'RUPIAH',{width,forbiddenTyped:'20rb',forbiddenPasted:'Rp20.000',expectAfterForbidden:{typed:'20',pasted:'20000'},allowed:'20000'});
  await s.send('Network.setExtraHTTPHeaders',{headers:{}});
 }
 writeFileSync(new URL('results.json',out),JSON.stringify(report,null,1));
 console.log(JSON.stringify({checks:report.checks.length,failed:report.checks.filter(c=>!c.ok).length,shots:report.shots}));
 console.log('FIELD CHARACTER CLASSES PASS');
}finally{s.close();await browser.send('Target.disposeBrowserContext',{browserContextId}).catch(()=>{});browser.close()}
process.exit(0);
