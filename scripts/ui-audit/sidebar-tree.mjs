// T-187 browser regression for the CMS sidebar tree. Read-only fixture run:
// logs in as the seeded tenant, never submits a form beyond login.
//
// Guards bound to the owner's defect ("only the icon toggled the group"):
//   1. a real pointer click on the group LABEL text flips aria-expanded;
//   2. with no stored state every group starts expanded;
//   3. Enter and Space on the focused row toggle it;
//   4. a stored collapse survives reload, but the current-page group is forced open.
// Also measures row height, label size, hit width, and the tree guide geometry,
// and captures light/dark screenshots at 1440 (expanded) and 390 (mobile sheet).
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';

const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/sidebar-tree/',import.meta.url);mkdirSync(out,{recursive:true});
let target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr,label=expr){for(let i=0;i<100;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error('timeout: '+label)}
async function shot(name){await s.send('Page.bringToFront');await pause(400);const{data}=await s.send('Page.captureScreenshot',{format:'png'});const file=new URL(name+'.png',out);writeFileSync(file,Buffer.from(data,'base64'));return file.pathname}
const STORE='geraicuan.cms-nav-groups.v2';
const expanded=label=>s.evaluate(`document.querySelector('[data-nav-group-trigger=${JSON.stringify(label)}]')?.getAttribute('aria-expanded')`);
const hydrated=`(()=>{const b=document.querySelector('[data-nav-group-trigger]');return !!b&&Object.keys(b).some(k=>k.startsWith('__reactProps$')&&typeof b[k]?.onClick==='function')})()`;

async function login(){
  await s.send('Network.clearBrowserCookies');
  await s.goto(origin+'/login/tenant');
  await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`,'login form hydrated');
  await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);
  await pause(200);await s.evaluate(`document.querySelector('.auth-submit').click()`);
  try{await wait(`location.pathname==='/app'`)}catch{throw Error(await s.evaluate(`document.querySelector('#login-error')?.textContent||'Login did not settle'`))}
}

// Real pointer input at the centre of the label <span> — not element.click(),
// so the hit-test decides which element receives it.
async function pointerClickLabel(label){
  const p=JSON.parse(await s.evaluate(`JSON.stringify((()=>{const b=document.querySelector('[data-nav-group-trigger=${JSON.stringify(label)}]');b.scrollIntoView({block:'center'});const t=[...b.closest('[data-slot=sidebar-group]').querySelectorAll('span')].find(e=>e.textContent.trim()===${JSON.stringify(label)}&&!e.closest('[data-nav-tree-item]'));const r=t.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)===t}})())`));
  assert(p.hit,`label span of ${label} is the hit-test target at its centre`);
  // Chrome drops synthesized input for a tab that is not in front (the audit
  // browser is shared), so raise this tab first.
  await s.send('Page.bringToFront');
  await s.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});
  for(const type of ['mousePressed','mouseReleased'])await s.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});
  await pause(300);
}
async function key(k){
  const code=k===' '?'Space':k;
  await s.send('Page.bringToFront');
  await s.send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:k==='Enter'?13:32,text:k===' '?' ':'\r'});
  await s.send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:k==='Enter'?13:32});
  await pause(300);
}

const measure=`JSON.stringify((()=>{const rows=[...document.querySelectorAll('[data-nav-group-trigger]')].filter(b=>b.getBoundingClientRect().width>0);return rows.map(b=>{const r=b.getBoundingClientRect(),label=[...b.querySelectorAll('span')].at(-1),icon=b.querySelector('svg'),ir=icon.getBoundingClientRect(),content=document.getElementById(b.getAttribute('aria-controls'));const items=content?[...content.querySelectorAll('[data-nav-tree-item]')]:[];const tree=items.map((li,i)=>{const lr=li.getBoundingClientRect(),v=getComputedStyle(li,'::before'),h=getComputedStyle(li,'::after'),a=li.querySelector('a'),ar=a.getBoundingClientRect(),text=a.querySelector('span:last-child');return {label:text.textContent,lineX:lr.left+parseFloat(v.left),lineTop:lr.top+parseFloat(v.top),lineBottom:lr.top+parseFloat(v.top)+parseFloat(v.height),lineWidth:parseFloat(v.width),connectorY:lr.top+parseFloat(h.top),connectorLeft:lr.left+parseFloat(h.left),connectorWidth:parseFloat(h.width),connectorColor:h.backgroundColor,lineColor:v.backgroundColor,liTop:lr.top,liBottom:lr.bottom,itemHeight:ar.height,itemLeft:ar.left,itemFont:getComputedStyle(a).fontSize,current:a.getAttribute('aria-current'),dataState:a.hasAttribute('data-state'),hasIcon:!!a.querySelector('svg'),truncated:text.scrollWidth>text.clientWidth,last:i===items.length-1}});return {group:b.dataset.navGroupTrigger,tag:b.tagName,type:b.type,expanded:b.getAttribute('aria-expanded'),controls:b.getAttribute('aria-controls'),name:b.textContent.trim(),height:r.height,width:r.width,left:r.left,right:r.right,labelFont:getComputedStyle(label).fontSize,labelWeight:getComputedStyle(label).fontWeight,iconCenterX:ir.left+ir.width/2,tree}})})())`;

function checkTree(groups,minRow,context){
  for(const g of groups){
    assert.equal(g.tag,'BUTTON',context);assert.equal(g.type,'button',context);
    assert(g.height>=minRow,`${context} ${g.group}: row ${g.height}px < ${minRow}`);
    assert(g.width>=200,`${context} ${g.group}: hit width ${g.width}px spans the sidebar`);
    assert.equal(parseFloat(g.labelFont),15,`${context} ${g.group}: label is 15px like the items`);
    for(const t of g.tree){
      assert(Math.abs(t.lineX+t.lineWidth/2-g.iconCenterX)<=1,`${context} ${t.label}: guide x ${t.lineX} under icon centre ${g.iconCenterX}`);
      assert(Math.abs(t.connectorY-(t.liTop+t.liBottom)/2)<=1,`${context} ${t.label}: connector at row centre`);
      assert(Math.abs(t.connectorLeft-t.lineX)<=0.5,`${context} ${t.label}: connector starts on the guide`);
      assert(t.connectorWidth>=8,`${context} ${t.label}: connector visible`);
      if(t.last)assert(Math.abs(t.lineBottom-t.connectorY)<=1,`${context} ${t.label}: last guide ends at its connector (${t.lineBottom} vs ${t.connectorY})`);
      else assert(Math.abs(t.lineBottom-t.liBottom)<=1,`${context} ${t.label}: guide runs through a non-last row`);
      assert.equal(t.dataState,false,`${context} ${t.label}: no data-state on nav <a>`);
      assert.equal(t.hasIcon,false,`${context} ${t.label}: submenu items carry no icon; icons mark top-level rows only`);
      assert.equal(t.truncated,false,`${context} ${t.label}: text not truncated`);
      assert(t.itemHeight>=minRow-4,`${context} ${t.label}: item ${t.itemHeight}px`);
    }
  }
}

const report={};
try{
  for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
  await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await s.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await login();
  // Observed on the shared audit Chrome: after the login flow ran in a tab,
  // Input.dispatchMouseEvent on that tab reached no listener. Cookies are
  // browser-wide, so continue in a fresh tab.
  s.close();await closeTab(target);
  target=await open('about:blank');s=await Session.attach(target.webSocketDebuggerUrl);
  for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
  await s.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await s.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});

  // Guard 2: empty storage => every group expanded (current route is Dasbor, in no group).
  await s.goto(origin+'/app');
  await s.evaluate(`localStorage.removeItem(${JSON.stringify(STORE)})`);
  await s.goto(origin+'/app');await wait(hydrated,'nav hydrated');await pause(500);
  const initial=JSON.parse(await s.evaluate(`JSON.stringify([...document.querySelectorAll('[data-nav-group-trigger]')].map(b=>[b.dataset.navGroupTrigger,b.getAttribute('aria-expanded')]))`));
  assert.deepEqual(initial,[['Pengiriman','true'],['Data','true'],['Cek','true'],['Laporan','true'],['Pengelolaan','true']],'default-open: every group expanded with empty storage');

  // Guard 1: pointer click on the label text toggles, both directions.
  await pointerClickLabel('Pengelolaan');
  assert.equal(await expanded('Pengelolaan'),'false','clicking the label text collapses the group');
  assert.equal(await s.evaluate(`[...document.querySelectorAll('#cms-nav-group-pengelolaan [data-nav-tree-item]')].some(e=>e.getBoundingClientRect().height>0)`),false,'collapsed group shows no items');
  await pointerClickLabel('Pengelolaan');
  assert.equal(await expanded('Pengelolaan'),'true','clicking the label text expands the group');

  const desktop=JSON.parse(await s.evaluate(measure));
  checkTree(desktop,36,'1440');
  report.desktop=desktop;
  report.shots=[await shot('tenant-1440-light')];
  await s.evaluate(`document.documentElement.classList.add('dark')`);report.shots.push(await shot('tenant-1440-dark'));
  report.desktopDarkColors=JSON.parse(await s.evaluate(measure)).map(g=>({group:g.group,line:g.tree[0]?.lineColor,active:g.tree.find(t=>t.current)?.connectorColor}));
  await s.evaluate(`document.documentElement.classList.remove('dark')`);

  // Guard 3: keyboard on the focused row.
  await s.evaluate(`document.querySelector('[data-nav-group-trigger="Cek"]').focus()`);
  await key('Enter');assert.equal(await expanded('Cek'),'false','Enter collapses');
  await key(' ');assert.equal(await expanded('Cek'),'true','Space expands');
  report.focusRing=await s.evaluate(`(()=>{const b=document.activeElement;return {group:b.dataset.navGroupTrigger,boxShadow:getComputedStyle(b).boxShadow}})()`);
  assert(report.focusRing.boxShadow!=='none','focus-visible ring drawn on the row');

  // Guard 4: stored collapse honoured; current-page group forced open.
  await pointerClickLabel('Laporan');assert.equal(await expanded('Laporan'),'false');
  await pointerClickLabel('Data');assert.equal(await expanded('Data'),'false');
  await s.goto(origin+'/app/kontak/penerima');await wait(hydrated,'nav hydrated');await pause(600);
  assert.equal(await expanded('Laporan'),'false','stored collapse survives reload');
  assert.equal(await expanded('Data'),'true','current-page group (Penerima in Data) is forced open');
  assert.equal(await expanded('Pengiriman'),'true');
  // T-188: Data holds Pengirim then Penerima; only the open list is current.
  const dataTree=JSON.parse(await s.evaluate(measure)).find(g=>g.group==='Data').tree;
  assert.deepEqual(dataTree.map(i=>[i.label,i.current]),[['Pengirim',null],['Penerima','page']]);
  report.activeTree=dataTree[1];
  report.shots.push(await shot('tenant-1440-kontak-active-laporan-collapsed-light'));
  report.storedState=await s.evaluate(`localStorage.getItem(${JSON.stringify(STORE)})`);
  await s.evaluate(`localStorage.removeItem(${JSON.stringify(STORE)})`);

  // Rail (collapsed icon) mode keeps its flyout.
  await s.send('Emulation.setDeviceMetricsOverride',{width:900,height:900,deviceScaleFactor:1,mobile:false});
  await s.goto(origin+'/app/kontak/pengirim');await pause(1500);
  await wait(`document.querySelector('[data-slot=sidebar]')?.dataset.state==='collapsed'`,'rail at 900');
  report.rail=await s.evaluate(`(()=>({triggers:document.querySelectorAll('[data-nav-group-trigger]').length,menuButtons:[...document.querySelectorAll('[data-sidebar=menu-button][aria-haspopup=menu]')].length}))()`);
  assert.equal(report.rail.triggers,0,'rail renders no tree rows');assert(report.rail.menuButtons>=5,'rail keeps a flyout per group');
  await s.evaluate(`document.querySelector('[data-sidebar=menu-button][aria-haspopup=menu]').click()`);
  await s.evaluate(`(()=>{const b=document.querySelector('[data-sidebar=menu-button][aria-haspopup=menu]');for(const t of ['pointerdown','mousedown'])b.dispatchEvent(new PointerEvent(t,{bubbles:true,button:0,pointerType:'mouse'}))})()`);
  await wait(`!!document.querySelector('[role=menu]')`,'rail flyout opens');
  await s.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await pause(300);
  // T-197: the flyout of the group holding the current page marks that item
  // visibly (sidebar accent ground, medium weight, primary start marker), not
  // only through aria-current; the other items keep the plain menu-item look.
  await wait(`!document.querySelector('[role=menu]')`,'first flyout closed');
  const openCurrentFlyout=`(()=>{const b=document.querySelector('[data-sidebar=menu-button][aria-haspopup=menu][aria-describedby]');for(const t of ['pointerdown','mousedown'])b.dispatchEvent(new PointerEvent(t,{bubbles:true,button:0,pointerType:'mouse'}));return b.textContent.trim()})()`;
  const flyoutItems=`JSON.stringify([...document.querySelectorAll('[role=menu] a[role=menuitem]')].map(a=>{const cs=getComputedStyle(a);return {label:a.textContent.trim(),current:a.getAttribute('aria-current'),bg:cs.backgroundColor,shadow:cs.boxShadow,weight:cs.fontWeight,color:cs.color,hasIcon:!!a.querySelector('svg')}}))`;
  const tokens=`JSON.stringify((()=>{const probe=document.createElement('div');document.body.append(probe);probe.style.background='var(--sidebar-accent)';probe.style.color='var(--sidebar-accent-foreground)';probe.style.borderColor='var(--sidebar-primary)';const cs=getComputedStyle(probe);const t={accent:cs.backgroundColor,accentForeground:cs.color,primary:cs.borderTopColor};probe.remove();return t})())`;
  report.railFlyout={};
  for(const theme of ['light','dark']){
    if(theme==='dark')await s.evaluate(`document.documentElement.classList.add('dark')`);
    report.railFlyout[theme]={group:await s.evaluate(openCurrentFlyout)};
    await wait(`!!document.querySelector('[role=menu] a[aria-current=page]')`,'current-group flyout opens');
    // Move focus off the items so the check reads the current marker, not the focus highlight.
    await s.evaluate(`document.querySelector('[role=menu]').focus()`);await pause(250);
    const items=JSON.parse(await s.evaluate(flyoutItems)),tk=JSON.parse(await s.evaluate(tokens));
    Object.assign(report.railFlyout[theme],{items,tokens:tk,shot:await shot(`tenant-900-rail-flyout-current-${theme}`)});
    const current=items.filter(i=>i.current==='page'),others=items.filter(i=>i.current!=='page');
    assert.equal(current.length,1,`${theme}: one current flyout item`);
    assert.equal(current[0].bg,tk.accent,`${theme}: current flyout item has the sidebar accent ground`);
    assert.equal(current[0].color,tk.accentForeground,`${theme}: current flyout item uses the sidebar accent foreground`);
    assert(current[0].shadow.includes(tk.primary)&&current[0].shadow.includes('inset'),`${theme}: current flyout item has the primary start marker (${current[0].shadow})`);
    assert(Number(current[0].weight)>=500,`${theme}: current flyout item is medium weight`);
    for(const o of others){assert.notEqual(o.bg,tk.accent,`${theme}: ${o.label} is not marked`);assert.equal(o.shadow,'none',`${theme}: ${o.label} has no marker`)}
    for(const i of items)assert.equal(i.hasIcon,false,`${theme}: flyout item ${i.label} carries no icon (T-192)`);
    await s.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await pause(300);
    await s.evaluate(`document.querySelector('[role=menu]')&&document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await wait(`!document.querySelector('[role=menu]')`,'current-group flyout closed');
  }
  await s.evaluate(`document.documentElement.classList.remove('dark')`);

  // Mobile sheet at 390.
  await s.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await s.goto(origin+'/app');await pause(1500);
  await wait(`!!document.querySelector('button[aria-label="Buka atau tutup navigasi"]')`,'mobile trigger');
  await s.evaluate(`document.querySelector('button[aria-label="Buka atau tutup navigasi"]').click()`);
  await wait(`!!document.querySelector('[role=dialog] [data-nav-group-trigger]')`,'sheet open');await pause(600);
  const mobile=JSON.parse(await s.evaluate(measure));
  assert.equal(mobile.length,5);for(const g of mobile)assert.equal(g.expanded,'true',`mobile default-open ${g.group}`);
  checkTree(mobile,44,'390');
  report.mobile=mobile;
  report.shots.push(await shot('tenant-390-sheet-light'));
  await s.evaluate(`document.documentElement.classList.add('dark')`);report.shots.push(await shot('tenant-390-sheet-dark'));
  await s.evaluate(`document.documentElement.classList.remove('dark')`);
  await pointerClickLabel('Pengiriman');assert.equal(await expanded('Pengiriman'),'false','mobile: label tap collapses');
  assert(await s.evaluate(`!!document.querySelector('[role=dialog]')`),'sheet stays open after toggling a group');
  await pointerClickLabel('Pengiriman');assert.equal(await expanded('Pengiriman'),'true','mobile: label tap expands');
  await s.evaluate(`localStorage.removeItem(${JSON.stringify(STORE)})`);

  const summarize=gs=>gs.map(g=>({group:g.group,rowHeight:g.height,hitWidth:g.width,labelFont:g.labelFont,labelWeight:g.labelWeight,iconCenterX:g.iconCenterX,guideX:g.tree[0]&&g.tree[0].lineX+g.tree[0].lineWidth/2,connectorWidth:g.tree[0]?.connectorWidth,itemHeight:g.tree[0]?.itemHeight,itemFont:g.tree[0]?.itemFont,lastGuideBottomMinusConnector:g.tree.at(-1)&&g.tree.at(-1).lineBottom-g.tree.at(-1).connectorY}));
  writeFileSync(new URL('report.json',out),JSON.stringify(report,null,2));
  console.log(JSON.stringify({pass:true,desktop:summarize(desktop),mobile:summarize(mobile),focusRing:report.focusRing,rail:report.rail,railFlyout:Object.fromEntries(Object.entries(report.railFlyout).map(([k,v])=>[k,{group:v.group,current:v.items.find(i=>i.current),shot:v.shot}])),active:{connector:report.activeTree.connectorColor,guide:report.activeTree.lineColor},dark:report.desktopDarkColors,shots:report.shots},null,1));
}finally{s.close();await closeTab(target)}
