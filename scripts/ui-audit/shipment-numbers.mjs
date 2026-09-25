// PR-44 read-only browser regression: one-time prefix setting, Super Admin unlock state, and label fit.
// Never saves a prefix or unlocks one; the label fit uses a programmatic worst-case text substitution.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {PROBE} from './probe.mjs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/shipment-numbers/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr,tries=100){for(let i=0;i<tries;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync(new URL(name+'.png',out),Buffer.from(data,'base64'))}
async function login(role){await s.send('Network.clearBrowserCookies');await s.goto(origin+(role==='super'?'/login/super-admin':'/login/tenant'));await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email',${JSON.stringify(role+'@geraicuan.com')}],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await s.evaluate(`document.querySelector('.auth-submit').click()`);try{await wait(`location.pathname===${JSON.stringify(role==='super'?'/platform':'/app')}`)}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}}
const hydrated=`(()=>{const f=document.getElementById('shipment-prefix-form');return !!f&&Object.keys(f).some(k=>k.startsWith('__reactProps$'))})()`;
try {
 for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
 await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await login('tenant');
 for(const width of [1440,390]){
  await s.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
  await s.goto(origin+'/app/pengaturan');await wait(hydrated);await pause(300);
  const form=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const i=document.getElementById('shipment-prefix'),section=document.getElementById('shipment-prefix-title').closest('section'),button=[...section.querySelectorAll('button[type=submit]')].find(b=>/kunci awalan/.test(b.textContent));return {value:i.value,maxLength:i.maxLength,preview:/[A-Z0-9]{2,5}-10013/.test(section.innerText),inputHeight:i.getBoundingClientRect().height,buttonHeight:button.getBoundingClientRect().height,locked:/Awalan terkunci/.test(section.innerText)}})())`));
  assert.equal(form.locked,false,'dev tenant prefix is still choosable');assert.equal(form.value,'SBN');assert.equal(form.maxLength,5);assert(form.preview);assert(form.buttonHeight>=44||width>=768&&form.buttonHeight>=36,JSON.stringify(form));
  const probe=JSON.parse(await s.evaluate(PROBE));
  // T-156: Profil gerai is short, so `scrollbar-gutter: stable` can leave the
  // document narrower than the viewport. Only a positive value is overflow.
  assert(probe.overflow<=0,'overflow '+probe.overflow);assert.equal(probe.weakFocusRing,0);assert.equal(probe.contrastFails,0,JSON.stringify(probe.contrast));
  await s.evaluate(`document.getElementById('shipment-prefix-title').scrollIntoView({block:'start',behavior:'instant'})`);await shot('prefix-unlocked-'+width);
  // Typing an invalid value shows the inline error and disables saving.
  await s.evaluate(`(()=>{const i=document.getElementById('shipment-prefix');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'t k');i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await wait(`[...document.getElementById('shipment-prefix-title').closest('section').querySelectorAll('button[type=submit]')].some(b=>b.disabled)`);
  await s.evaluate(`(()=>{const i=document.getElementById('shipment-prefix');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'SBN');i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  // The page submit opens the confirmation dialog instead of saving; cancel leaves the prefix unlocked.
  await s.evaluate(`[...document.getElementById('shipment-prefix-title').closest('section').querySelectorAll('button[type=submit]')].find(b=>/kunci awalan/.test(b.textContent)).click()`);
  await wait(`!!document.querySelector('[role=alertdialog]')`);
  const dialog=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const d=document.querySelector('[role=alertdialog]'),confirm=[...d.querySelectorAll('button')].find(b=>/Ya, kunci awalan/.test(b.textContent));return {title:d.querySelector('h2')?.innerText,warns:/tidak dapat diubah lagi/.test(d.innerText),confirmName:confirm?.getAttribute('name'),confirmValue:confirm?.getAttribute('value'),confirmForm:confirm?.getAttribute('form'),focusInside:d.contains(document.activeElement)}})())`));
  assert.match(dialog.title,/Kunci awalan SBN-\?/);assert(dialog.warns);assert.deepEqual([dialog.confirmName,dialog.confirmValue,dialog.confirmForm],['confirmation','locked','shipment-prefix-form']);assert(dialog.focusInside);
  await shot('prefix-confirm-'+width);
  await s.evaluate(`[...document.querySelector('[role=alertdialog]').querySelectorAll('button')].find(b=>/Batal/.test(b.textContent)).click()`);await wait(`!document.querySelector('[role=alertdialog]')`);
  assert.equal(await s.evaluate(`/Awalan terkunci/.test(document.getElementById('shipment-prefix-title').closest('section').innerText)`),false);
  results.push({step:'prefix-setting',width,form,dialog,probe:{overflow:probe.overflow,weakFocusRing:probe.weakFocusRing,contrastFails:probe.contrastFails}});
 }

 // Worst-case label: 5-character prefix and a 6-digit number must stay inside the 100×150 mm footer band.
 await s.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await s.goto(origin+'/app/label/10044');await wait(`!!document.querySelector('.label-footer p')`);await pause(300);
 const fit=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const footer=document.querySelector('.label-footer'),p=footer.querySelector('p');for(const node of p.childNodes){if(node.nodeType===3&&/[A-Z0-9]{2,5}-[0-9]{5,}/.test(node.textContent))node.textContent=node.textContent.replace(/[A-Z0-9]{2,5}-[0-9]{5,}/,'ABCDE-100000')}const f=footer.getBoundingClientRect(),r=p.getBoundingClientRect();return {text:p.innerText.split('\\n')[0],fitsHeight:r.bottom<=f.bottom+0.5&&p.scrollHeight<=footer.clientHeight+1,fitsWidth:p.scrollWidth<=footer.clientWidth+1}})())`));
 assert.match(fit.text,/ABCDE-100000/);assert(fit.fitsHeight&&fit.fitsWidth,JSON.stringify(fit));
 await s.evaluate(`document.querySelector('.label-footer').scrollIntoView({block:'center',behavior:'instant'})`);await shot('label-worst-case');
 results.push({step:'label-fit',...fit});

 await login('super');
 await s.goto(origin+'/platform/tenant/70000000-0000-4000-8000-000000000001');await wait(`!!document.getElementById('shipment-prefix-unlock-title')`);await pause(400);
 const unlock=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const section=document.getElementById('shipment-prefix-unlock-title').closest('section'),button=[...section.querySelectorAll('button')].find(b=>/Buka kunci awalan/.test(b.textContent));return {state:section.querySelector('[role=status]')?.innerText,disabled:button?.disabled}})())`));
 assert.match(unlock.state,/GC- · belum terkunci/);assert.equal(unlock.disabled,true);
 await s.evaluate(`document.getElementById('shipment-prefix-unlock-title').scrollIntoView({block:'start',behavior:'instant'})`);await shot('platform-unlock-state');
 results.push({step:'platform-unlock-state',...unlock});

 writeFileSync(new URL('report.json',out),JSON.stringify(results,null,2));
 console.log(JSON.stringify({observations:results.length,prefixDialog:true,labelFit:fit.fitsHeight&&fit.fitsWidth,unlockDisabledWhileUnlocked:true}));
} finally {s.close();await closeTab(target)}
