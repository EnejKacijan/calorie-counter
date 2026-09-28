import {pw,setup,base,read,keyboard,closeKeyboard} from './add-flow-harness.mjs';
import {settle} from './edge-row-harness.mjs';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='artifacts/weight-sheet-keyboard';await mkdir(out,{recursive:true});
const results=[];let active,stage='';
async function seed(p){
 await p.clock.setFixedTime(new Date('2026-09-21T12:00:00'));
 await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('calorie-counter-state'));s.user.weightKg=81.5;s.user.startWeightKg=83;s.user.targetWeightKg=80;s.progress=[{id:'start',date:'2026-09-19',weightKg:83},{id:'previous',date:'2026-09-20',weightKg:81.5}];localStorage.setItem('calorie-counter-state',JSON.stringify(s));localStorage.setItem('daily-fuel-weight-range','7');});
 await p.goto(base+'/progress.html');await p.locator('[data-edit-weight=previous]').waitFor();await settle(p);
 const instrument=()=>{
  window.weightFrames=[];window.weightFocus=[];
  const box=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();
  window.weightGeometry=()=>document.querySelector('#weightSheet')&&({sheet:box('#weightSheet'),footer:box('.weight-form-actions'),input:box('#progressWeight'),label:box('label[for=progressWeight]'),save:box('#weightSave'),cancel:box('#weightCancel'),date:box('#progressDate'),content:box('#weightSheetContent'),chart:box('#progressChart'),current:box('#currentWeightValue'),scroll:scrollY,rootScroll:document.scrollingElement.scrollTop,contentScroll:document.querySelector('#weightSheetContent').scrollTop,vv:{height:visualViewport.height,top:visualViewport.offsetTop,scale:visualViewport.scale},active:document.activeElement.id,bodyStyle:document.body.style.cssText,rootStyle:document.documentElement.style.cssText,sheetStyle:document.querySelector('#weightSheet').style.cssText,classes:document.body.className,transform:getComputedStyle(document.querySelector('#weightSheet')).transform,inert:document.querySelector('.app-shell').inert,nav:getComputedStyle(document.querySelector('.mobile-tabbar')).visibility});
  const focus=HTMLElement.prototype.focus;
  HTMLElement.prototype.focus=function(...args){if(this.id==='progressWeight')weightFocus.push(weightGeometry());return focus.apply(this,args);};
  window.weightWatch=true;const frame=()=>{if(!weightWatch)return;weightFrames.push({...weightGeometry(),time:performance.now()});requestAnimationFrame(frame);};requestAnimationFrame(frame);
 };await p.context().addInitScript(instrument);await p.evaluate(instrument);
}
const measure=p=>p.evaluate(()=>weightGeometry());
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1,`${label}: ${a} vs ${b}`);
function visible(g){
 for(const key of ['label','input','save','cancel']){assert.ok(g[key].top>=g.vv.top-1,key+' top');assert.ok(g[key].bottom<=g.vv.top+g.vv.height+1,key+' bottom');}
 assert.equal(g.inert,true);assert.equal(g.nav,'hidden');assert.ok(g.save.height>=44);assert.ok(g.cancel.height>=44);
}
function stable(g,b){near(g.current.y-g.vv.top,b.current.y-b.vv.top,'Current visible position');near(g.chart.y-g.vv.top,b.chart.y-b.vv.top,'chart visible position');near(g.scroll,b.scroll,'document scroll');near(g.rootScroll,b.rootScroll,'root scroll');}
async function systemArea(p,enabled){await p.evaluate(enabled=>{
 let e=document.querySelector('#qaSystemArea');if(!enabled){e?.remove();return;}
 if(!e){e=document.createElement('div');e.id='qaSystemArea';e.style.cssText='position:fixed;inset:auto 0 0;z-index:30000;display:grid;place-items:center;background:#292929;color:#eee;font:13px/1.5 system-ui;text-align:center;padding:20px;box-sizing:border-box;pointer-events:none';e.textContent='QA keyboard viewport simulation\nNot a native iPhone keyboard';document.body.append(e);}
 e.style.top=(visualViewport.offsetTop+visualViewport.height)+'px';
 },enabled);}
async function animateKeyboard(p,height,top=0){
 await p.evaluate(async({height,top})=>{
  const fromH=visualViewport.height,fromT=visualViewport.offsetTop,start=performance.now();
  await new Promise(resolve=>{function step(now){const t=Math.min(1,(now-start)/260),ease=1-(1-t)**3;Object.defineProperties(visualViewport,{height:{configurable:true,value:fromH+(height-fromH)*ease},offsetTop:{configurable:true,value:fromT+(top-fromT)*ease}});visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));const e=document.querySelector('#qaSystemArea');if(e)e.style.top=(visualViewport.offsetTop+visualViewport.height)+'px';if(t<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});
 },{height,top});await settle(p);
}
async function rest(p,height){await p.evaluate(()=>document.activeElement.blur());await animateKeyboard(p,height);await closeKeyboard(p);await systemArea(p,false);}
async function functional(p,height,record,engine){
 const original=await read(p);await p.locator('#progressWeight').fill('81,7');
 await p.evaluate(()=>{qaWrites=[];});await p.locator('#weightSave').tap();await rest(p,height);await p.locator('#weightSheet').waitFor({state:'hidden'});await settle(p);
 const saved=await read(p),entry=saved.progress.find(e=>e.date==='2026-09-21');assert.equal(entry.weightKg,81.7);assert.equal(await p.evaluate(()=>qaWrites.length),1);assert.equal(await p.locator('#currentWeightValue').textContent(),'81.7');assert.deepEqual(saved.goals,original.goals);
 if(record)await p.waitForTimeout(900);
 const del=p.locator(`[data-delete-weight="${entry.id}"]`);await del.scrollIntoViewIfNeeded();await del.tap();assert.equal(await p.locator('#currentWeightValue').textContent(),'81.5');assert.equal((await read(p)).progress.length,2);
 if(record)await p.waitForTimeout(900);
 await p.locator('#weightUndoToast button').tap();assert.deepEqual((await read(p)).progress,saved.progress);assert.equal(await p.locator('#currentWeightValue').textContent(),'81.7');
 if(record)await p.waitForTimeout(1200);
 await writeFile(`${out}/${engine}-save-return-frames.json`,JSON.stringify(await p.evaluate(()=>weightFrames),null,2));
 await p.reload();await p.locator(`[data-edit-weight="${entry.id}"]`).waitFor();await settle(p);assert.deepEqual((await read(p)).progress,saved.progress);
 // Date and current policy: a new historical date never becomes Current.
 await p.locator('#weightLogJump').tap();await p.locator('#progressWeight').fill('81.7');await p.locator('#progressDate').fill('2026-09-18');assert.equal(await p.locator('#progressWeight').inputValue(),'81.7');assert.deepEqual((await read(p)).progress,saved.progress);
 await p.locator('#progressWeight').tap();await keyboard(p,390,0);await p.locator('#weightSave').tap();await rest(p,height);await p.locator('#weightSheet').waitFor({state:'hidden'});assert.equal(await p.locator('#currentWeightValue').textContent(),'81.7');assert.equal((await read(p)).progress.length,4);
 await p.locator('#weightLogJump').tap();await p.locator('#progressWeight').fill('81,8');await p.locator('#progressDate').fill('2026-09-18');assert.equal(await p.locator('#progressWeight').inputValue(),'81.7');assert.equal(await p.locator('#weightSave').textContent(),'Update weight');await p.locator('#progressWeight').fill('81,8');await p.locator('#weightSave').tap();await p.locator('#weightSheet').waitFor({state:'hidden'});assert.equal((await read(p)).progress.length,4);assert.equal((await read(p)).progress.find(e=>e.date==='2026-09-18').weightKg,81.8);
 // Failure with an open keyboard leaves the raw draft, then exactly one retry.
 await p.locator('#weightLogJump').tap();await p.locator('#progressDate').fill('2026-09-17');await p.locator('#progressWeight').fill('81,6');await keyboard(p,390,30);await p.evaluate(()=>{qaFailStorage=true;qaWrites=[];});await p.locator('#weightSave').tap();assert.equal(await p.locator('#weightSheet').isVisible(),true);assert.equal(await p.locator('#progressWeight').inputValue(),'81,6');assert.equal(await p.locator('#progressDate').inputValue(),'2026-09-17');assert.equal(await p.locator('#weightSave').isDisabled(),false);visible(await measure(p));
 await p.evaluate(()=>{qaFailStorage=false;document.querySelector('#progressForm').requestSubmit();document.querySelector('#progressForm').requestSubmit();});await rest(p,height);await p.locator('#weightSheet').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>qaWrites.length),1);assert.equal((await read(p)).progress.length,5);
 // A focused Undo expires by the established 8s policy, not by a new timer.
 await p.clock.install({time:new Date('2026-09-21T12:00:00')});await p.locator(`[data-delete-weight="${entry.id}"]`).tap();await p.locator('#weightUndoToast button').focus();await p.clock.fastForward(8100);assert.equal(await p.locator('#weightUndoToast').isVisible(),false);await p.reload();await settle(p);assert.equal((await read(p)).progress.some(e=>e.id===entry.id),false);
}
try{for(const engine of (process.env.WEIGHT_ENGINE?.split(',')||['chromium','webkit'])){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
 try{for(const [width,height,enlarged]of(process.env.WEIGHT_KEYBOARD_QUICK?[[390,844,false]]:[[375,667,false],[390,844,false],[430,932,false],[320,667,true]]))for(const theme of ['light','dark'])for(const reduce of [false,true]){
  stage=`${engine} ${width} ${theme} reduced=${reduce}`;const record=engine==='chromium'&&width===390&&theme==='dark'&&!reduce;
  const {c,p}=await setup(b,{engine,width,height,theme,reduce,video:record,beforeOpen:async({c})=>c.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}))});active=p;
  try{
   await seed(p);
   if(enlarged)await p.addStyleTag({content:'#weightSheet :is(label,input,button,#weightUnit){font-size:24px!important;line-height:1.5!important} html{font-size:24px!important}'});
   await p.locator('#weightLogJump').scrollIntoViewIfNeeded();const before=await measure(p),original=await read(p);
   await p.locator('#weightLogJump').tap();await settle(p);const opened=await measure(p);stable(opened,before);assert.equal(await p.evaluate(()=>weightFocus.length),1);const first=await p.evaluate(()=>weightFocus[0]);assert.equal(first.transform,'none');assert.ok(first.input.bottom<=height);assert.equal(await p.evaluate(()=>document.activeElement.id),'progressWeight');assert.equal(await p.locator('#progressWeight').inputValue(),'81.5');
   if((width===390||enlarged)&&!reduce)await p.screenshot({path:`${out}/${engine}-${theme}-${width}-resting.png`});
   const kh=enlarged?430:Math.min(390,height-250);
   await systemArea(p,true);await animateKeyboard(p,kh);const initial=await measure(p);visible(initial);stable(initial,before);
   if(width===390)await p.screenshot({path:`${out}/${engine}-${theme}-${reduce?'reduced':'motion'}-initial-focus.png`});
   if(record)await p.waitForTimeout(700);
   await rest(p,height);const dismissed=await measure(p);stable(dismissed,before);near(dismissed.sheet.height,opened.sheet.height,'resting height');
   if(record)await p.waitForTimeout(700);
   await p.locator('#progressWeight').tap();await systemArea(p,true);await animateKeyboard(p,kh);const refocus=await measure(p);visible(refocus);stable(refocus,before);
   for(const key of ['sheet','footer','input','save','cancel']){near(initial[key].y,refocus[key].y,key+' equivalent focus');near(initial[key].height,refocus[key].height,key+' equivalent size');}
   if(width===390)await p.screenshot({path:`${out}/${engine}-${theme}-${reduce?'reduced':'motion'}-refocus.png`});
   if(record)await p.waitForTimeout(700);
   const geometryTrace=await p.evaluate(()=>({focus:weightFocus,frames:weightFrames}));
   if(width===390&&theme==='dark'&&!reduce)await functional(p,height,record,engine);
   else{await p.locator('#weightCancel').tap();await rest(p,height);await p.locator('#weightSheet').waitFor({state:'hidden'});assert.deepEqual(await read(p),original);}
   await p.locator('#weightLogJump').scrollIntoViewIfNeeded();const parent=await measure(p);
   await p.locator('#weightLogJump').tap();await p.locator('#progressWeight').fill('81,');
   for(const top of [0,60,0,30,0]){await keyboard(p,kh,top);visible(await measure(p));stable(await measure(p),parent);}
   await p.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));});await settle(p);assert.equal(await p.locator('#progressWeight').inputValue(),'81,');visible(await measure(p));
   await rest(p,height);await p.locator('#weightCancel').tap();await p.locator('#weightSheet').waitFor({state:'hidden'});await settle(p);assert.equal(await p.evaluate(()=>document.body.style.position),'');assert.equal(await p.locator('.app-shell').evaluate(e=>e.inert),false);assert.equal(await p.locator('#weightSheet').evaluate(e=>e.style.getPropertyValue('--surface-bottom')),'');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
   results.push({engine,width,height,theme,reduce,enlarged,pass:true,before,initial,refocus,dismissed,geometryTrace});console.log('PASS',stage);
   if(record){const video=p.video();await c.close();await copyFile(await video.path(),out+'/weight-sheet-flow.webm');}else await c.close();
  }catch(e){await p.screenshot({path:out+'/failed.png'});await writeFile(out+'/failed-geometry.json',JSON.stringify(await measure(p),null,2));throw e;}
 }}finally{await b.close();}
}}catch(e){console.error('FAILED',stage);throw e;}finally{await writeFile(out+(process.env.WEIGHT_KEYBOARD_QUICK?'/keyboard-quick-results.json':'/keyboard-results.json'),JSON.stringify(results,null,2));}
console.log('PASS',results.length,'keyboard lifecycle configurations; native iOS keyboard/picker is not emulated.');
