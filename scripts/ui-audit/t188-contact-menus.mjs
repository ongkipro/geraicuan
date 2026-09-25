// T-188 browser regression: Pengirim and Penerima are separate contact menus.
// Read-only against the seeded developer tenant: logs in, navigates, types a
// search; the only contact form it submits is the T-199 Peran refusal below,
// which the server refuses before any write.
//
// Guards bound to the owner's request ("pengirim dan penerima beda menu"):
//   1. /app/kontak and ?peran=penerima land on the matching role list (server redirect);
//   2. each list shows only its role, counts only its role, and marks its own menu current;
//   3. search on a list never returns the other role's contacts, and (T-199) the
//      debounced auto-search keeps focus and caret in the search box;
//   4. "Penerima baru" opens the form with only Penerima ticked, Penerima current;
//   5. a contact opened from Penerima keeps Penerima current and links back to it;
//      a detail URL without `dari` lands on the contact's first role.
//   6. owner polish (same task): compact Aktif/Diarsipkan/Semua filter with inline counts,
//      Status column only on Semua, cards below md, an "also" badge with a tooltip,
//      role-specific empty state, detail header chips/actions, archived detail read-only.
//   7. T-199: unticking Pengirim on a store-named contact ("Toko 88") is refused on the
//      Peran card with "Ubah nama tanpa angka dulu di kartu Kontak" and a link that
//      focuses the Kontak card's name field. The seed holds no digit-named sender, so
//      the audit posts the stored name as "Toko 88" in the Peran form's hidden field;
//      the server refuses before any write (validation precedes the update).
// Every captured state also runs the shared probe (overflow, contrast, focus
// ring, target size, sticky column, one h1) and fails on any finding.
// Screenshots at 1440 and 390.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';
import {PROBE} from './probe.mjs';

const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/t188-contact-menus/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr,label=expr){for(let i=0;i<120;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error('timeout: '+label)}
const ready=`document.readyState==='complete'&&!!document.querySelector('main h1')&&!document.querySelector('[data-slot=skeleton]')`;
async function shot(name){await pause(300);const{data}=await s.send('Page.captureScreenshot',{format:'png'});const file=new URL(name+'.png',out);writeFileSync(file,Buffer.from(data,'base64'));return file.pathname}
// The sweep's own finding rules for a CMS page (scripts/ui-audit/sweep.mjs).
async function probe(name){
 const r=JSON.parse(await s.evaluate(PROBE));
 const bits=[];
 if(r.overflow>1)bits.push('overflow='+r.overflow);
 if(r.h1!==1)bits.push('h1='+r.h1);
 if(r.headingSkips.length)bits.push('headingSkips='+JSON.stringify(r.headingSkips));
 if(r.stickyIssues?.length)bits.push('sticky='+JSON.stringify(r.stickyIssues));
 if(r.unlabelledScroll)bits.push('unreachableScroll');
 if(r.nestedCards)bits.push('nestedCards='+r.nestedCards);
 if(r.smallTargetCount)bits.push('smallTargets='+JSON.stringify(r.smallTargets));
 if(r.contrastFails)bits.push('contrast='+JSON.stringify(r.contrast));
 if(r.contrastInspected<10)bits.push('contrastInspected='+r.contrastInspected);
 if(r.weakFocusRing)bits.push('weakFocus='+JSON.stringify(r.focusDetail));
 if(r.focusProbed<3)bits.push('focusProbed='+r.focusProbed);
 report.probes.push({name,contrastInspected:r.contrastInspected,focusProbed:r.focusProbed,stickyOk:r.stickyOk,findings:bits});
 assert.deepEqual(bits,[],`${name}: probe findings`);
}
async function viewport(width){await s.send('Emulation.setDeviceMetricsOverride',{width,height:width<768?900:1000,deviceScaleFactor:1,mobile:width<768});await pause(300)}
async function go(path){await s.goto(origin+path);await wait(ready,'ready '+path);await pause(400)}
const state=`JSON.stringify({path:location.pathname,search:location.search,h1:document.querySelector('main h1')?.textContent.trim(),current:[...document.querySelectorAll('a[aria-current="page"]')].map(a=>a.textContent.trim()),overflow:document.documentElement.scrollWidth-innerWidth})`;
// Below 768 the sidebar lives in a Sheet that is not mounted until opened, so
// the current item is read by opening it and closing it again (after any shot).
async function read(){
 const st=JSON.parse(await s.evaluate(state));
 if(st.current.length===0&&await s.evaluate('innerWidth<768')){
  await s.evaluate(`document.querySelector('button[aria-label="Buka atau tutup navigasi"]').click()`);
  await wait(`!!document.querySelector('[role=dialog] nav a[aria-current="page"]')`,'mobile nav open');
  st.current=JSON.parse(await s.evaluate(`JSON.stringify([...document.querySelectorAll('[role=dialog] a[aria-current="page"]')].map(a=>a.textContent.trim()))`));
  await s.evaluate(`document.querySelector('button[aria-label="Tutup navigasi"]').click()`);
  await wait(`!document.querySelector('[role=dialog]')`,'mobile nav closed');await pause(300);
 }
 return st;
}
const rows=`JSON.stringify([...document.querySelectorAll('main table tbody tr')].map(tr=>({name:tr.querySelector('td a')?.textContent.trim(),href:tr.querySelector('td a')?.getAttribute('href'),also:tr.querySelector('[data-also-role]')?.dataset.alsoRole??null})))`;
const metrics=`JSON.stringify([...document.querySelectorAll('[data-metric-id]')].map(e=>e.getAttribute('data-metric-id')))`;
// Which list presentation is on screen: the phone cards or the table.
const layout=`JSON.stringify({cards:[...document.querySelectorAll('main ul[aria-label^="Daftar"] > li')].filter(e=>e.getBoundingClientRect().height>0).length,table:!!document.querySelector('main [data-slot=table-container]')&&document.querySelector('main [data-slot=table-container]').getBoundingClientRect().height>0,statusHeader:[...document.querySelectorAll('main th')].some(th=>th.textContent.trim()==='Status'),toolbarTop:(()=>{const f=document.querySelector('form[data-slot=state-summary-panel]'),q=document.getElementById('contact-search');return f&&q?Math.abs(f.getBoundingClientRect().top-q.closest('form').getBoundingClientRect().top):null})()})`;
const report={shots:[],checks:[],probes:[]};
const check=(name,value)=>{report.checks.push({name,...value});console.log('ok',name,JSON.stringify(value))};

// No seeded names, ids or counts: every expectation is read from the pages
// themselves (a contact's roles from its "also" badge, counts from the
// metric-tagged filter), so the audit holds for any seed that has at least one
// sender-only, one recipient-only, one dual-role and one archived recipient.
const idOf=href=>href.split('?')[0].split('/').pop();
const count=id=>s.evaluate(`Number(document.querySelector('[data-metric-id="${id}"]').textContent.replace(/\\D+/g,' ').trim().split(' ')[0])`);

try{
 for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
 // Without focus emulation a headless tab never matches :focus-visible and the probe measures no focus ring.
 await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 await viewport(1440);
 await s.send('Network.clearBrowserCookies');
 await s.goto(origin+'/login/tenant');
 await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`,'login hydrated');
 await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
 await pause(200);await s.evaluate(`document.querySelector('.auth-submit').click()`);
 try{await wait(`location.pathname==='/app'`,'login')}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}

 // 1. Legacy URLs.
 await go('/app/kontak');
 let st=await read();assert.equal(st.path,'/app/kontak/pengirim','bare /app/kontak redirects to Pengirim');
 await go('/app/kontak?peran=penerima&status=all');
 st=await read();assert.equal(st.path,'/app/kontak/penerima','?peran=penerima redirects to Penerima');
 assert(st.search.includes('status=all'),'status survives the redirect');
 check('legacy redirects',{bare:'/app/kontak/pengirim',penerima:st.path+st.search});

 for(const width of [1440,390]){
  await viewport(width);
  // 2. Each list is its own role.
  const lists={};
  for(const [role,label,metricPrefix,other] of [['pengirim','Pengirim','CON-SENDER-','penerima'],['penerima','Penerima','CON-RECIPIENT-','pengirim']]){
   await go(`/app/kontak/${role}`);
   report.shots.push(await shot(`${role}-aktif-${width}`));
   await probe(`${role} aktif @${width}`);
   st=await read();
   assert.equal(st.h1,label,`${role} @${width}: title`);
   assert.deepEqual(st.current,[label],`${role} @${width}: exactly its own menu is current`);
   assert(st.overflow<=0,`${role} @${width}: no horizontal page overflow (${st.overflow})`);
   const list=JSON.parse(await s.evaluate(rows));
   assert(list.length>0,`${role} @${width}: seeded rows present`);
   assert(list.every(r=>r.href?.endsWith(`?dari=${role}`)),`${role} @${width}: detail links carry dari`);
   const ids=JSON.parse(await s.evaluate(metrics));
   assert.deepEqual(ids,[`${metricPrefix}ACTIVE`,`${metricPrefix}ARCHIVED`,`${metricPrefix}ALL`,`${metricPrefix}LISTED`],`${role} @${width}: role metric IDs, Aktif first`);
   const activeCount=await count(`${metricPrefix}ACTIVE`);
   assert.equal(activeCount,list.length,`${role} @${width}: Aktif count equals the rows listed`);
   assert.equal(await count(`${metricPrefix}LISTED`),list.length,`${role} @${width}: listed count equals the rows`);
   assert(list.some(r=>r.also===other),`${role} @${width}: a dual-role row carries the ${other} badge`);
   assert(!list.some(r=>r.also===role),`${role} @${width}: no badge repeats the page's own role`);
   const shape=JSON.parse(await s.evaluate(layout));
   if(width<768)assert(shape.cards===list.length&&!shape.table,`${role} @${width}: cards, not a table ${JSON.stringify(shape)}`);
   else{assert(shape.table&&shape.cards===0,`${role} @${width}: table ${JSON.stringify(shape)}`);assert.equal(shape.statusHeader,false,`${role} @${width}: no Status column on Aktif`);assert(shape.toolbarTop<=8,`${role} @${width}: filter and search share one row ${JSON.stringify(shape)}`)}
   assert.equal(await s.evaluate(`!!document.querySelector('nav[aria-label="Peran kontak"]')`),false,`${role} @${width}: no role tabs`);
   lists[role]=list;

   // Semua: archived rows join, and the Status column appears (table widths).
   await go(`/app/kontak/${role}?status=all`);
   report.shots.push(await shot(`${role}-semua-${width}`));
   await probe(`${role} semua @${width}`);
   const all=JSON.parse(await s.evaluate(layout));
   if(width>=768)assert.equal(all.statusHeader,true,`${role} @${width}: Status column on Semua`);
   assert.equal(await count(`${metricPrefix}LISTED`),await count(`${metricPrefix}ALL`),`${role} @${width}: Semua lists every contact of the role`);
  }

  // Archived senders: an empty state when there are none, else exactly the counted rows.
  await go('/app/kontak/pengirim?status=archived');
  const archivedSenders=await count('CON-SENDER-ARCHIVED');
  if(archivedSenders===0)assert.equal(await s.evaluate(`document.querySelector('main h3')?.textContent.trim()`),'Belum ada pengirim diarsipkan',`empty @${width}`);
  else assert.equal(JSON.parse(await s.evaluate(rows)).length,archivedSenders,`archived senders @${width}`);
  report.shots.push(await shot(`pengirim-diarsipkan-${width}`));
  await probe(`pengirim archived @${width}`);

  // A search with no match: the role-specific empty state, reachable on any seed.
  await s.evaluate(`(()=>{const e=document.getElementById('contact-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'zzqx-tidak-ada');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await wait(`document.querySelector('main h3')?.textContent.trim()==='Tidak ada pengirim yang cocok'`,`no-match empty state @${width}`);
  await pause(300);
  report.shots.push(await shot(`pengirim-pencarian-kosong-${width}`));
  await probe(`pengirim search empty @${width}`);

  // The badge explains itself on keyboard focus (tooltip) and by name.
  if(width===1440){
   await go('/app/kontak/penerima');
   await s.evaluate(`document.querySelector('main table [data-also-role="pengirim"]').focus()`);
   await wait(`!!document.querySelector('[data-slot=tooltip-content]')`,'badge tooltip');
   const tip=await s.evaluate(`document.querySelector('[data-slot=tooltip-content]').textContent`);
   assert(tip.includes('Kontak ini juga tersimpan sebagai pengirim'),'badge tooltip text');
   report.shots.push(await shot(`penerima-badge-tooltip-${width}`));
   check('badge tooltip',{tip});
  }
  // Membership agrees with the badges: a sender without the "also" badge is
  // absent from Penerima; a dual-role sender is present there, badged back.
  const senderOnly=lists.pengirim.find(r=>r.also===null), dualSender=lists.pengirim.find(r=>r.also==='penerima');
  assert(senderOnly&&dualSender,`seed needs a sender-only and a dual-role sender @${width}`);
  const ids=list=>new Set(list.map(r=>idOf(r.href)));
  assert(!ids(lists.penerima).has(idOf(senderOnly.href)),'sender-only contact not on Penerima');
  assert.equal(lists.penerima.find(r=>idOf(r.href)===idOf(dualSender.href))?.also,'pengirim','dual-role contact on Penerima, badged Juga pengirim');
  check(`lists @${width}`,{pengirim:lists.pengirim.length,penerima:lists.penerima.length,senderOnly:senderOnly.name});

  // 3. Role-scoped search (typeahead after 3 characters).
  if(width===1440){
   // Search by the sender-only contact's full name: found on Pengirim, never on Penerima.
   const found={};
   for(const role of ['penerima','pengirim']){
    await go(`/app/kontak/${role}`);
    // T-199: typed into the focused box with the caret moved inside the text;
    // the debounced auto-search must leave focus and caret where they are.
    await s.evaluate(`(()=>{const e=document.getElementById('contact-search');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(senderOnly.name)});e.dispatchEvent(new Event('input',{bubbles:true}));e.setSelectionRange(2,2)})()`);
    await wait(`/cocok dengan pencarian/.test(document.querySelector('main p[aria-live="polite"]')?.textContent??'')&&!!document.querySelector('main form[aria-busy="false"]')`,`search settled on ${role}`);
    await pause(600);
    const caret=JSON.parse(await s.evaluate(`JSON.stringify({focused:document.activeElement?.id??null,start:document.getElementById('contact-search').selectionStart,end:document.getElementById('contact-search').selectionEnd})`));
    assert.deepEqual(caret,{focused:'contact-search',start:2,end:2},`search on ${role}: focus and caret stay in the search box after results update`);
    found[role]=JSON.parse(await s.evaluate(rows)).filter(r=>idOf(r.href)===idOf(senderOnly.href)).length;
   }
   assert.deepEqual(found,{penerima:0,pengirim:1},`search "${senderOnly.name}" stays inside its role`);
   check('role-scoped search',{query:senderOnly.name,...found,focusAndCaretKept:true});
  }

  // 4. Create form preselected from Penerima (client navigation via the button).
  await go('/app/kontak/penerima');
  await s.evaluate(`[...document.querySelectorAll('main a')].find(a=>a.getAttribute('href')==='/app/kontak/baru?peran=penerima').click()`);
  await wait(`location.pathname==='/app/kontak/baru'&&!!document.querySelector('input[name=roleRecipient]')`,'create form');await pause(500);
  report.shots.push(await shot(`create-penerima-${width}`));
  await probe(`create penerima @${width}`);
  st=await read();
  assert.equal(st.search,'?peran=penerima');
  const roles=JSON.parse(await s.evaluate(`JSON.stringify({sender:document.querySelector('input[name=roleSender]').checked,recipient:document.querySelector('input[name=roleRecipient]').checked,hidden:document.querySelector('input[name=peran]').value})`));
  assert.deepEqual(roles,{sender:false,recipient:true,hidden:'penerima'},'Penerima preselected, Pengirim still offered');
  assert.deepEqual(st.current,['Penerima'],'create form keeps Penerima current');
  assert(st.overflow<=0,`create @${width}: no overflow`);
  check(`create preselected @${width}`,{...roles,current:st.current});

  // 5. Detail opened from Penerima.
  await go('/app/kontak/penerima');
  // Open a dual-role contact from Penerima (client navigation).
  await s.evaluate(`document.querySelector('main table tbody tr:has([data-also-role="pengirim"]) td a').click()`);
  await wait(`/^\\/app\\/kontak\\/[0-9a-f-]{36}$/.test(location.pathname)&&!!document.querySelector('#form-kontak')`,'detail');await pause(500);
  report.shots.push(await shot(`detail-from-penerima-${width}`));
  await probe(`detail from penerima @${width}`);
  const head=JSON.parse(await s.evaluate(`JSON.stringify({chips:[...document.querySelectorAll('main [class*="container/page"] > header [data-slot=badge]')].map(b=>b.textContent.trim()),actions:[...document.querySelectorAll('main [class*="container/page"] > header a')].map(a=>a.textContent.trim()),cards:[...document.querySelectorAll('main [data-slot=card-title]')].map(t=>t.textContent.trim())})`));
  assert.deepEqual(head.chips,['Pengirim','Penerima','Aktif'],`detail @${width}: role chips and status`);
  assert.deepEqual(head.actions,['Ubah','Arsipkan','Pakai di kiriman baru'],`detail @${width}: header actions`);
  for(const title of ['Kontak','Peran','Alamat'])assert(head.cards.includes(title),`detail @${width}: ${title} card`);
  st=await read();
  assert.equal(new URLSearchParams(st.search).get('dari'),'penerima','detail URL carries dari=penerima');
  assert.deepEqual(st.current,['Penerima'],'detail keeps Penerima current');
  const back=await s.evaluate(`[...document.querySelectorAll('main a')].find(a=>a.textContent.trim()==='Kembali ke daftar penerima')?.getAttribute('href')`);
  assert.equal(back,'/app/kontak/penerima','back link returns to Penerima');
  assert(st.overflow<=0,`detail @${width}: no overflow`);
  check(`detail @${width}`,{path:st.path,search:st.search,current:st.current,back,...head});

  // Archived contact: read-only, status marked, no edit or archive action.
  await go('/app/kontak/penerima?status=archived');
  const archivedRow=JSON.parse(await s.evaluate(rows))[0];
  assert(archivedRow,`seed needs an archived recipient @${width}`);
  await go(`/app/kontak/${idOf(archivedRow.href)}?dari=penerima`);
  report.shots.push(await shot(`detail-archived-${width}`));
  await probe(`detail archived @${width}`);
  const archived=JSON.parse(await s.evaluate(`JSON.stringify({chips:[...document.querySelectorAll('main [class*="container/page"] > header [data-slot=badge]')].map(b=>b.textContent.trim()),actions:[...document.querySelectorAll('main [class*="container/page"] > header a')].length,forms:document.querySelectorAll('#form-kontak,#form-peran,#alamat-baru').length,notice:document.querySelector('main [role=status]')?.textContent??''})`));
  assert.deepEqual(archived.chips,[...(archivedRow.also==='pengirim'?['Pengirim']:[]),'Penerima','Diarsipkan'],`archived @${width}: chips`);
  assert.equal(archived.actions,0,`archived @${width}: no header actions`);
  assert.equal(archived.forms,0,`archived @${width}: no edit forms`);
  assert(archived.notice.includes('Kontak ini diarsipkan'),`archived @${width}: notice`);
  check(`archived detail @${width}`,archived);
 }

 // A detail URL with no dari lands on the contact's first role.
 await viewport(1440);
 await go('/app/kontak/penerima');
 const recipientOnly=JSON.parse(await s.evaluate(rows)).find(r=>r.also===null);
 assert(recipientOnly,'seed needs a recipient-only contact');
 await go(`/app/kontak/${idOf(recipientOnly.href)}`);
 st=await read();
 assert.equal(st.search,'?dari=penerima','recipient-only contact canonicalised to dari=penerima');
 assert.deepEqual(st.current,['Penerima']);
 check('detail without dari',{search:st.search,current:st.current});

 // 7. T-199: the Peran card explains why Pengirim cannot be dropped from a store name.
 await go('/app/kontak/pengirim');
 const senderOnlyRow=JSON.parse(await s.evaluate(rows)).find(r=>r.also===null);
 assert(senderOnlyRow,'seed needs a sender-only contact');
 for(const width of [1440,390]){
  await viewport(width);
  await go(`/app/kontak/${idOf(senderOnlyRow.href)}?dari=pengirim`);
  await wait(`(()=>{const f=document.getElementById('form-peran');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$'))})()`,'peran form hydrated');
  await s.evaluate(`(()=>{const f=document.getElementById('form-peran');f.querySelector('input[name=contactName]').value='Toko 88';const sender=f.querySelector('input[name=roleSender]');if(sender.checked)sender.click();const recipient=f.querySelector('input[name=roleRecipient]');if(!recipient.checked)recipient.click()})()`);
  await pause(250);
  await s.evaluate(`[...document.querySelectorAll('#form-peran button[type=submit]')].pop().click()`);
  await wait(`!!document.querySelector('#roles-error a[href="#contactName"]')`,`peran conflict @${width}`);
  const conflict=JSON.parse(await s.evaluate(`JSON.stringify({error:document.getElementById('roles-error').textContent.replace(/\\s+/g,' ').trim(),summary:[...document.querySelectorAll('#form-peran [role=alert] li a')].map(a=>a.getAttribute('href')),storedName:document.getElementById('contactName').value})`));
  assert(conflict.error.includes('Ubah nama tanpa angka dulu di kartu Kontak'),`peran @${width}: says what to do ${JSON.stringify(conflict)}`);
  assert.deepEqual(conflict.summary,['#contactName'],`peran @${width}: the summary links the name field`);
  report.shots.push(await shot(`peran-name-conflict-${width}`));
  await s.evaluate(`document.querySelector('#roles-error a[href="#contactName"]').click()`);
  await pause(300);
  const focused=await s.evaluate(`document.activeElement?.id`);
  assert.equal(focused,'contactName',`peran @${width}: the link focuses the Kontak name field`);
  await go('/app/kontak/pengirim');
  assert(JSON.parse(await s.evaluate(rows)).some(r=>idOf(r.href)===idOf(senderOnlyRow.href)),`peran @${width}: contact still a sender (nothing written)`);
  check(`peran name conflict @${width}`,{...conflict,focused});
 }

 writeFileSync(new URL('report.json',out),JSON.stringify(report,null,1));
 console.log('T188 CONTACT MENUS PASS');
 console.log(report.shots.join('\n'));
}finally{s.close();await closeTab(target)}
