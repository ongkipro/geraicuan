// T-176 thermal label evidence at print emulation, both sizes.
// CDP_PORT=9430 UI_AUDIT_ORIGIN=http://100.127.67.86:3127 node scripts/ui-audit/thermal-label.mjs
// Read-only: never presses "Cetak label", so no print event is recorded.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {Session,open,closeTab} from './cdp.mjs';
const origin=process.env.UI_AUDIT_ORIGIN;
assert(origin&&['localhost','127.0.0.1','100.127.67.86'].includes(new URL(origin).hostname));
const out=new URL('./.output/thermal-label/',import.meta.url);mkdirSync(out,{recursive:true});
const target=await open('about:blank'),s=await Session.attach(target.webSocketDebuggerUrl),results=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expr,tries=400){for(let i=0;i<tries;i++){if(await s.evaluate(expr).catch(()=>false))return;await pause(150)}throw Error(expr)}
async function login(){await s.send('Network.clearBrowserCookies');await s.goto(origin+'/login/tenant');await wait(`(()=>{const f=document.querySelector('form');return f&&Object.keys(f).some(k=>k.startsWith('__reactProps$')&&typeof f[k]?.onSubmit==='function')})()`);await s.evaluate(`(()=>{for(const[id,value]of[['email','tenant@geraicuan.com'],['password','admin123']]){const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()`);await pause(200);await s.evaluate(`document.querySelector('.auth-submit').click()`);await wait(`location.pathname==='/app'`,400)}

// Numbers under test; they mirror THERMAL in src/lib/label-size.ts.
const MIN_FONT_PT=7,MODULE_MM=0.25,QUIET_MODULES=10,CUT_MM=100,KEEP_OUT_MM=2,TOL_MM=0.15;
const BOLD=['.label-courier','.label-package .label-awb','.label-stub .label-awb','.label-recipient .label-party-name','.label-recipient .label-party-phone','.label-party-area','.label-payment span','.label-payment b','.label-stub-payment','.label-stub-facts dd'];
const hydrated=`(()=>{const i=document.querySelector('input[name="label-size"]');return !!i&&Object.keys(i).some(k=>k.startsWith('__reactProps$'))&&!!document.querySelector('.label-sheet')})()`;
const SIZE_KEY_PREFIX='geraicuan.label-size.';

const MEASURE=`JSON.stringify((()=>{
 const mm=96/25.4,sheet=document.querySelector('.label-sheet'),S=sheet.getBoundingClientRect();
 const rel=r=>({x:(r.left-S.left)/mm,y:(r.top-S.top)/mm,w:r.width/mm,h:r.height/mm,b:(r.bottom-S.top)/mm,r:(r.right-S.left)/mm});
 const name=e=>e.tagName.toLowerCase()+(e.getAttribute('class')?'.'+e.getAttribute('class').split(' ')[0]:'');
 const pkg=sheet.querySelector('.label-package'),stub=sheet.querySelector('.label-stub'),cut=sheet.querySelector('.label-cut');
 const all=[...sheet.querySelectorAll('*')];
 const boxes=all.map(e=>({e,r:rel(e.getBoundingClientRect())})).filter(x=>x.r.w>0&&x.r.h>0);
 // Cut line and crossings.
 const rules=[...sheet.querySelectorAll('.label-cut-rule')].map(e=>{const r=rel(e.getBoundingClientRect());return {center:r.y+r.h/2,x:r.x,r:r.r,borderStyle:getComputedStyle(e).borderTopStyle,borderMm:parseFloat(getComputedStyle(e).borderTopWidth)/mm}});
 const crossings=[];
 for(const {e,r} of boxes){
  if(cut&&(cut===e||cut.contains(e))||e===pkg||e===stub)continue;
  if(pkg.contains(e)&&r.b>${CUT_MM}-${KEEP_OUT_MM}+0.01)crossings.push({el:name(e),top:r.y,bottom:r.b});
  if(stub&&stub.contains(e)&&r.y<${CUT_MM}+${KEEP_OUT_MM}-0.01)crossings.push({el:name(e),top:r.y,bottom:r.b});
  if(r.b>S.height/mm+0.01||r.r>100.01||r.x<-0.01||r.y<-0.01)crossings.push({el:name(e),outsideSheet:r});
 }
 const markText=cut?cut.innerText.trim():null;
 // Clipped regions: any grid row whose content is taller or wider than its box.
 const rows=[...(pkg?.children||[]),...(stub?.children||[])];
 const overflowRows=rows.filter(e=>e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1).map(e=>({el:name(e),scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
 // Text size floor.
 const textEls=all.filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));
 const fontPts=textEls.map(e=>({el:name(e),pt:parseFloat(getComputedStyle(e).fontSize)*0.75}));
 const minFont=fontPts.reduce((m,f)=>f.pt<m.pt?f:m,{pt:99});
 const bold=${JSON.stringify(BOLD)}.flatMap(sel=>[...sheet.querySelectorAll(sel)].map(e=>({sel,weight:Number(getComputedStyle(e).fontWeight)})));
 // Pure black on white.
 const BLACK='rgb(0, 0, 0)',CLEAR=['rgba(0, 0, 0, 0)','rgb(255, 255, 255)'];
 const colour=[];
 for(const e of [sheet,...all]){
  const c=getComputedStyle(e);
  if(c.color!==BLACK)colour.push({el:name(e),color:c.color});
  if(!CLEAR.includes(c.backgroundColor))colour.push({el:name(e),background:c.backgroundColor});
  if(c.backgroundImage!=='none')colour.push({el:name(e),backgroundImage:c.backgroundImage});
  if(c.opacity!=='1')colour.push({el:name(e),opacity:c.opacity});
  if(c.textShadow!=='none'||c.filter!=='none'||c.boxShadow!=='none')colour.push({el:name(e),effect:[c.textShadow,c.filter,c.boxShadow]});
  for(const side of ['Top','Right','Bottom','Left'])if(parseFloat(c['border'+side+'Width'])>0&&c['border'+side+'Style']!=='none'&&c['border'+side+'Color']!==BLACK)colour.push({el:name(e),border:side,color:c['border'+side+'Color']});
  if(parseFloat(c.outlineWidth)>0&&c.outlineStyle!=='none')colour.push({el:name(e),outline:c.outlineColor});
  if(e instanceof SVGElement){if(c.fill!=='none'&&c.fill!==BLACK&&!(e.tagName==='svg'))colour.push({el:name(e),fill:c.fill});if(c.stroke!=='none'&&c.stroke!==BLACK)colour.push({el:name(e),stroke:c.stroke})}
 }
 // Barcodes: module width, quiet zones inside the box, nothing else inside the box, not clipped.
 const barcodes=[...sheet.querySelectorAll('svg.label-barcode')].map(svg=>{
  const box=svg.getBoundingClientRect(),modules=Number(svg.dataset.modules),modulePx=box.width/modules;
  const bars=[...svg.querySelectorAll('rect')].map(r=>r.getBoundingClientRect());
  const barsLeft=Math.min(...bars.map(b=>b.left)),barsRight=Math.max(...bars.map(b=>b.right));
  const intruders=boxes.filter(({e})=>e!==svg&&!svg.contains(e)&&!e.contains(svg)).filter(({e})=>{const r=e.getBoundingClientRect();return r.left<box.right-0.5&&r.right>box.left+0.5&&r.top<box.bottom-0.5&&r.bottom>box.top+0.5}).map(({e})=>name(e));
  let clip=svg.parentElement;while(clip&&getComputedStyle(clip).overflow==='visible')clip=clip.parentElement;
  const c=clip.getBoundingClientRect();
  return {part:svg.closest('.label-stub')?'stub':'package',modules,moduleMm:modulePx/mm,heightMm:box.height/mm,widthMm:box.width/mm,
   quietLeftModules:(barsLeft-box.left)/modulePx,quietRightModules:(box.right-barsRight)/modulePx,
   quietLeftMm:(barsLeft-box.left)/mm,quietRightMm:(box.right-barsRight)/mm,intruders,
   insideClip:box.left>=c.left-0.5&&box.right<=c.right+0.5&&box.top>=c.top-0.5&&box.bottom<=c.bottom+0.5};
 });
 // Geometry fingerprint for screen-versus-print comparison.
 const geometry=boxes.map(({e,r})=>[name(e),+r.x.toFixed(2),+r.y.toFixed(2),+r.w.toFixed(2),+r.h.toFixed(2)]);
 return {size:sheet.dataset.labelSize,sheetMm:{w:S.width/mm,h:S.height/mm},sheetOrigin:{x:S.left+scrollX,y:S.top+scrollY},
  package:pkg?rel(pkg.getBoundingClientRect()):null,stub:stub?rel(stub.getBoundingClientRect()):null,hasCut:!!cut,markText,rules,crossings,overflowRows,
  minFont,bold,colour,barcodes,geometry,stubText:stub?stub.innerText:null,
  printedBoxes:[...document.body.querySelectorAll('body *')].filter(e=>!sheet.contains(e)&&!e.contains(sheet)&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden').length};
})())`;

async function media(value){await s.send('Emulation.setEmulatedMedia',{media:value});await pause(250)}
function pdfBoxes(buffer){const text=buffer.toString('latin1');const boxes=[...text.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m=>[Number(m[3])-Number(m[1]),Number(m[4])-Number(m[2])]);return {pages:(text.match(/\/Type\s*\/Page\b/g)||[]).length,boxes}}

function assertLayout(m,size,label,{screen=false}={}){
 const heightMm=size==='10x15'?150:100;
 assert(Math.abs(m.sheetMm.w-100)<TOL_MM&&Math.abs(m.sheetMm.h-heightMm)<TOL_MM,`${label}: sheet ${JSON.stringify(m.sheetMm)}`);
 assert.equal(m.size,size,`${label}: data-label-size`);
 assert(Math.abs(m.package.h-100)<TOL_MM&&Math.abs(m.package.y)<TOL_MM,`${label}: package box ${JSON.stringify(m.package)}`);
 if(size==='10x15'){
  assert(m.hasCut&&m.stub,`${label}: stub and cut line present`);
  assert(Math.abs(m.stub.y-CUT_MM)<TOL_MM&&Math.abs(m.stub.h-50)<TOL_MM,`${label}: stub box ${JSON.stringify(m.stub)}`);
  assert.equal(m.rules.length,2);
  for(const rule of m.rules){assert(Math.abs(rule.center-CUT_MM)<TOL_MM,`${label}: cut rule centre ${rule.center}mm`);assert.equal(rule.borderStyle,'dashed');assert(rule.borderMm>=0.5,`${label}: cut rule ${rule.borderMm}mm is thinner than 4 dots`)}
  assert(m.rules[0].x<2&&m.rules[1].r>98,`${label}: the cut rule spans the sheet ${JSON.stringify(m.rules)}`);
  assert.match(m.markText,/potong di sini/i);
 } else {
  assert(!m.hasCut&&!m.stub,`${label}: 10x10 carries no cut line and no stub`);
 }
 assert.deepEqual(m.crossings,[],`${label}: content crosses the cut keep-out or leaves the sheet`);
 assert.deepEqual(m.overflowRows,[],`${label}: a region is clipping its content`);
 assert(m.minFont.pt>=MIN_FONT_PT-0.01,`${label}: text below ${MIN_FONT_PT}pt: ${JSON.stringify(m.minFont)}`);
 for(const b of m.bold)assert(b.weight>=700,`${label}: ${b.sel} weight ${b.weight}`);
 // The screen preview frames the sheet with a 1px outline that takes no space; print has none.
 assert.deepEqual(screen?m.colour.filter(c=>!(c.el==='article.label-sheet'&&c.outline)):m.colour,[],`${label}: non black-on-white ink`);
 assert.equal(m.barcodes.length,size==='10x15'?2:1,`${label}: barcode count`);
 for(const bc of m.barcodes){
  assert(Math.abs(bc.moduleMm-MODULE_MM)<0.005,`${label}: ${bc.part} module ${bc.moduleMm}mm`);
  assert(bc.quietLeftModules>=QUIET_MODULES-0.05&&bc.quietRightModules>=QUIET_MODULES-0.05,`${label}: ${bc.part} quiet zone ${bc.quietLeftModules}/${bc.quietRightModules}`);
  assert.deepEqual(bc.intruders,[],`${label}: ${bc.part} quiet zone intruded`);
  assert(bc.insideClip,`${label}: ${bc.part} barcode clipped`);
 }
}

try {
 for(const d of ['Page','Runtime','Network'])await s.send(d+'.enable');
 await s.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await login();
 await s.goto(origin+'/app/label');await wait(`document.querySelectorAll('main a[href^="/app/label/"]').length>0`);
 const hrefs=await s.evaluate(`[...new Set([...document.querySelectorAll('main a[href^="/app/label/"]')].map(a=>a.getAttribute('href').split('?')[0]))].slice(0,12)`);
 const picked={};
 for(const href of hrefs){
  await s.goto(origin+href);await wait(`!!document.querySelector('.label-sheet')||!!document.getElementById('status-label')`);
  if(!(await s.evaluate(`!!document.querySelector('.label-sheet')`)))continue;
  const cod=await s.evaluate(`/^COD/.test(document.querySelector('.label-payment span').textContent)`);
  picked[cod?'cod':'nonCod']??=href;
  if(picked.cod&&picked.nonCod)break;
 }
 assert(picked.cod&&picked.nonCod,'need one COD and one non-COD printable label: '+JSON.stringify(picked));

 // Default, remembered choice, and a storage that throws.
 const href=picked.cod;
 await s.goto(origin+href);await wait(hydrated);
 await s.evaluate(`Object.keys(localStorage).filter(k=>k.startsWith(${JSON.stringify(SIZE_KEY_PREFIX)})).forEach(k=>localStorage.removeItem(k))`);
 await s.goto(origin+href);await wait(hydrated);await pause(400);
 const initial=JSON.parse(await s.evaluate(`JSON.stringify({checked:document.querySelector('input[name="label-size"]:checked')?.value,size:document.querySelector('.label-sheet').dataset.labelSize,button:[...document.querySelectorAll('button[type=submit]')].map(b=>b.textContent).find(t=>/Cetak/.test(t)),region:document.getElementById('pratinjau-label').getAttribute('aria-label')})`));
 assert.deepEqual([initial.checked,initial.size],['10x15','10x15'],'default is 10x15: '+JSON.stringify(initial));
 assert.match(initial.button,/10 × 15 cm/);assert.match(initial.region,/10 × 15 cm/);
 await s.evaluate(`document.querySelector('input[name="label-size"][value="10x10"]').click()`);
 await wait(`document.querySelector('.label-sheet').dataset.labelSize==='10x10'`);
 const stored=await s.evaluate(`Object.entries(localStorage).filter(([k])=>k.startsWith(${JSON.stringify(SIZE_KEY_PREFIX)}))`);
 assert.equal(stored.length,1);assert.equal(stored[0][1],'10x10');
 await s.goto(origin+href);await wait(hydrated);await wait(`document.querySelector('.label-sheet').dataset.labelSize==='10x10'`);
 const remembered=await s.evaluate(`document.querySelector('input[name="label-size"]:checked')?.value`);
 assert.equal(remembered,'10x10','the choice is remembered');
 results.push({step:'size-choice',initial,storedKeyCount:stored.length,remembered});
 const {identifier}=await s.send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('blocked','SecurityError')}})`});
 await s.goto(origin+href);await wait(hydrated);await pause(500);
 const blocked=JSON.parse(await s.evaluate(`JSON.stringify({checked:document.querySelector('input[name="label-size"]:checked')?.value,size:document.querySelector('.label-sheet').dataset.labelSize})`));
 assert.deepEqual([blocked.checked,blocked.size],['10x15','10x15'],'blocked storage falls back to the default: '+JSON.stringify(blocked));
 await s.evaluate(`document.querySelector('input[name="label-size"][value="10x10"]').click()`);
 await wait(`document.querySelector('.label-sheet').dataset.labelSize==='10x10'`);
 await s.send('Page.removeScriptToEvaluateOnNewDocument',{identifier});
 results.push({step:'storage-blocked',blocked,stillSwitches:true});

 for(const [kind,labelHref] of Object.entries(picked)){
  for(const size of ['10x15','10x10']){
   const label=`${kind}@${size}`;
   await s.goto(origin+labelHref);await wait(hydrated);await pause(300);
   await s.evaluate(`document.querySelector('input[name="label-size"][value="${size}"]').click()`);
   await wait(`document.querySelector('.label-sheet').dataset.labelSize===${JSON.stringify(size)}`);await pause(300);
   const screen=JSON.parse(await s.evaluate(MEASURE));
   await media('print');
   const print=JSON.parse(await s.evaluate(MEASURE));
   assertLayout(print,size,label+' print');
   assertLayout(screen,size,label+' screen',{screen:true});
   // What the operator sees is what prints: every box at the same place and size.
   assert.equal(screen.geometry.length,print.geometry.length,`${label}: element count differs between screen and print`);
   const drift=screen.geometry.map((g,i)=>[g,print.geometry[i]]).filter(([a,b])=>a[0]!==b[0]||a.slice(1).some((v,j)=>Math.abs(v-b[j+1])>0.05));
   assert.deepEqual(drift,[],`${label}: preview geometry differs from print`);
   // In print the sheet is the only visible thing and it starts at the page origin.
   assert(Math.abs(print.sheetOrigin.x)<0.5&&Math.abs(print.sheetOrigin.y)<0.5,`${label}: sheet origin in print ${JSON.stringify(print.sheetOrigin)}`);
   assert.equal(print.printedBoxes,0,`${label}: ${print.printedBoxes} other boxes visible in print`);
   if(size==='10x15'){
    assert.match(print.stubText,/Bukti serah terima/i);assert.match(print.stubText,/Diserahkan/);assert.match(print.stubText,/WIB/);
    assert.equal(kind==='cod',/COD\s*Rp/.test(print.stubText),`${label}: COD amount on the stub only when COD`);
   }
   // Screenshot of the sheet in print media, and a PDF at the CSS page size.
   const clip=await s.evaluate(`(()=>{const r=document.querySelector('.label-sheet').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:2}})()`);
   const {data}=await s.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
   writeFileSync(new URL(`label-${kind}-${size}.png`,out),Buffer.from(data,'base64'));
   const pdf=await s.send('Page.printToPDF',{preferCSSPageSize:true,printBackground:false,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0});
   const buffer=Buffer.from(pdf.data,'base64');writeFileSync(new URL(`label-${kind}-${size}.pdf`,out),buffer);
   const page=pdfBoxes(buffer);
   const expected=[100/25.4*72,(size==='10x15'?150:100)/25.4*72];
   assert.equal(page.pages,1,`${label}: PDF has ${page.pages} pages`);
   assert(page.boxes.length>=1&&page.boxes.every(([w,h])=>Math.abs(w-expected[0])<1&&Math.abs(h-expected[1])<1),`${label}: PDF page ${JSON.stringify(page.boxes)} expected ${expected.map(v=>v.toFixed(1))}pt`);
   await media('');
   results.push({step:'layout',label,sheetMm:print.sheetMm,cutRuleCentresMm:print.rules.map(r=>+r.center.toFixed(3)),cutRuleMm:print.rules[0]?.borderMm,
    crossings:print.crossings.length,overflowRows:print.overflowRows.length,minFontPt:+print.minFont.pt.toFixed(2),boldChecked:print.bold.length,colourFindings:print.colour.length,
    barcodes:print.barcodes.map(b=>({part:b.part,modules:b.modules,moduleMm:+b.moduleMm.toFixed(4),widthMm:+b.widthMm.toFixed(2),heightMm:+b.heightMm.toFixed(2),quietMm:[+b.quietLeftMm.toFixed(2),+b.quietRightMm.toFixed(2)],quietModules:[+b.quietLeftModules.toFixed(2),+b.quietRightModules.toFixed(2)],intruders:b.intruders.length})),
    pdf:{pages:page.pages,mediaBoxPt:page.boxes[0]},screenPrintDrift:drift.length});
  }
 }

 // Worst-case text: each recipient density tier at its ceiling, a long outlet, the widest shipment number.
 await s.goto(origin+picked.cod);await wait(hydrated);await pause(300);
 await s.evaluate(`document.querySelector('input[name="label-size"][value="10x15"]').click()`);await pause(200);
 await media('print');
 const worst=[];
 for(const [tier,combined] of [['compact',200],['long',300],['dense',380],['ultra',480]]){
  const fit=JSON.parse(await s.evaluate(`JSON.stringify((()=>{
   const region=document.querySelector('.label-recipient'),area=region.querySelector('.label-party-area');
   if(area)area.textContent='Kebon Jeruk, Kebon Jeruk, Jakarta Barat, DKI Jakarta, 11530';
   const name='Nama Penerima Yang Cukup Panjang Sekali';
   const words='Jl. Raya Kebon Jeruk Blok C No. 17 RT 005 RW 011 Kel. Sukabumi Utara ';
   const addressLength=${combined}-name.length-(area?area.textContent.length:0);
   let address='';while(address.length<addressLength)address+=words;address=address.slice(0,addressLength);
   region.dataset.density=${JSON.stringify(tier)};
   region.querySelector('.label-party-name').textContent=name;
   region.querySelector('.label-party-address').textContent=address;
   document.querySelector('.label-stub-outlet').textContent='Outlet Gudang Utama Cabang Kebon Jeruk Jakarta Barat Nomor Dua';
   for(const p of document.querySelectorAll('.label-footer p, .label-stub-facts dd'))for(const n of p.childNodes)if(n.nodeType===3)n.textContent=n.textContent.replace(/[A-Z0-9]{2,5}-[0-9]{5,}/,'ABCDE-100000');
   return {tier:${JSON.stringify(tier)},addressLength:address.length,scrollHeight:region.scrollHeight,clientHeight:region.clientHeight,fits:region.scrollHeight<=region.clientHeight+1};
  })())`));
  const m=JSON.parse(await s.evaluate(MEASURE));
  assert(fit.fits,`recipient ${tier} tier at ${combined} characters overflows: ${JSON.stringify(fit)}`);
  assert.deepEqual(m.crossings,[],`${tier}: crossings`);assert.deepEqual(m.overflowRows,[],`${tier}: overflow rows ${JSON.stringify(m.overflowRows)}`);
  assert(m.minFont.pt>=MIN_FONT_PT-0.01,`${tier}: min font ${JSON.stringify(m.minFont)}`);
  worst.push(fit);
 }
 const {data:worstShot}=await s.send('Page.captureScreenshot',{format:'png',clip:await s.evaluate(`(()=>{const r=document.querySelector('.label-sheet').getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:2}})()`),captureBeyondViewport:true});
 writeFileSync(new URL('label-worst-case-10x15.png',out),Buffer.from(worstShot,'base64'));
 await media('');
 results.push({step:'worst-case-text',worst});

 writeFileSync(new URL('report.json',out),JSON.stringify({picked,results},null,2));
 console.log(JSON.stringify(results,null,1));
 console.log('THERMAL LABEL PASS');
} finally {s.close();await closeTab(target)}
