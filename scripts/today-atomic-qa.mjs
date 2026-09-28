// Synthetic-data, real route taps. QA response instrumentation marks synchronous
// work without inserting a task, await, timer or animation into production.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pw,setup,settle,product} from './add-flow-harness.mjs';
import {prepareBaseline} from './today-atomic-baseline.mjs';
const out=process.env.INTAKE_QA_OUTPUT||'artifacts/today-atomic';
const phase=process.env.ATOMIC_PHASE||'before';
await mkdir(out,{recursive:true});
const results=[];
export function probe(){
 window.atomicMarks=[];window.atomicFrames=[];window.atomicRecording=true;
 window.atomicMark=label=>atomicMarks.push({label,time:performance.now(),path:location.pathname});
 const selectors={header:'#appTitle',week:'#calendarStrip',ring:'.calorie-ring',metrics:'.calorie-insights',macros:'#macroGrid',log:'#foodSection > .logged-list-heading',logTitle:'.log-title-meta',diary:'#foodList',fab:'#floatingAddButton',footer:'.mobile-tabbar'};
 const read=selector=>{
  const e=document.querySelector(selector);if(!e)return null;
  const r=e.getBoundingClientRect(),ancestors=[];let opacity=1,visible=!!e.getClientRects().length;
  for(let n=e;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);opacity*=Number(s.opacity);visible&&=s.visibility==='visible'&&s.display!=='none';ancestors.push({node:n.id||n.className,transform:s.transform,opacity:s.opacity,visibility:s.visibility,overflow:s.overflow,position:s.position,animation:s.animation,contentVisibility:s.contentVisibility,contain:s.contain});}
  const y=Math.max(0,r.top)+Math.min(r.height,Math.max(0,innerHeight-Math.max(0,r.top)))/2,x=Math.max(0,r.left)+r.width/2;
  const hit=document.elementFromPoint(x,y);
  return {rect:r.toJSON(),opacity,visible:visible&&opacity>0,inViewport:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth,hit:!!hit&&e.contains(hit),ancestors};
 };
 window.atomicSample=()=>({time:performance.now(),path:location.pathname,loading:document.documentElement.hasAttribute('data-intake-starting'),scrollY,selected:document.querySelector('#calendarStrip [aria-pressed=true]')?.dataset.dateKey,date:document.querySelector('#appTitle')?.textContent,calories:document.querySelector('#consumedCalories')?.textContent,foods:document.querySelectorAll('#foodList [data-food-entry-id]').length,diary:document.querySelector('#foodList')?.textContent,macros:[...document.querySelectorAll('.macro-eaten')].map(e=>e.textContent),focus:document.activeElement?.id,elements:Object.fromEntries(Object.entries(selectors).map(([k,v])=>[k,read(v)])),animations:document.getAnimations().map(a=>({target:a.effect?.target?.id||a.effect?.target?.className,progress:a.effect?.getComputedTiming().progress,timing:a.effect?.getTiming(),type:a.constructor.name}))});
 const frame=()=>{if(atomicRecording)atomicFrames.push(atomicSample());requestAnimationFrame(frame);};requestAnimationFrame(frame);
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/today-atomic-qa.mjs')) {
await prepareBaseline(process.env.ATOMIC_SOURCE);
for(const engine of (process.env.ATOMIC_ENGINE?[process.env.ATOMIC_ENGINE]:['chromium','webkit'])){
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 try{for(const reduce of [false,true]){
  const {c,p}=await setup(b,{engine,theme:'dark',reduce,source:process.env.ATOMIC_SOURCE,cold:true,beforeOpen:async({c,p})=>{
  await c.addInitScript(probe);
  await p.route('**/app.js?*',async r=>{let s=(await readFile((process.env.ATOMIC_SOURCE||'public')+'/app.js','utf8')).replace(/\r\n/g,'\n');s=s.replace('const scanner = mountPackageScan','window.atomicMark?.("mount-start"); const scanner = mountPackageScan').replace('let state = loadState();','let state = loadState(); window.atomicMark?.("data-ready");').replace('function render() {','function render() { window.atomicMark?.("render-start");').replaceAll('  renderEntries();','  renderEntries(); window.atomicMark?.("diary-ready");').replace('render();\nrequestAnimationFrame(openFoodsFromHash);','render(); window.atomicMark?.("render-end");\nrequestAnimationFrame(openFoodsFromHash);').replace('viewState.mounted = true;','viewState.mounted = true; window.atomicMark?.("render-end");');await r.fulfill({body:s,contentType:'text/javascript'});});
  await p.route('**/app-router.js?*',async r=>{let s=await readFile((process.env.ATOMIC_SOURCE||'public')+'/app-router.js','utf8');s=s.replace('    replaceScreen(template);','    window.atomicMark?.("commit-start"); replaceScreen(template); window.atomicMark?.("template-fab-ready");').replace('    mount(module);','    mount(module); window.atomicMark?.("mount-end");');await r.fulfill({body:s,contentType:'text/javascript'});});
  }});
  await p.locator('#calendarStrip .day-tile').first().waitFor();await settle(p);await p.waitForTimeout(250);
  const cold=await p.evaluate(()=>({marks:atomicMarks,frames:atomicFrames}));
  const returns=[];
  for(const source of ['assistant','assistant','progress','profile']){
   await p.locator(`.mobile-tabbar a[href="${source}.html"]`).tap();await settle(p);
   await p.evaluate(()=>{atomicFrames=[];atomicMarks=[];atomicRecording=true;atomicMark('tap-start');});
   await p.locator('.mobile-tabbar a[href="index.html"]').tap();await p.waitForTimeout(400);
   const trace=await p.evaluate(()=>{atomicRecording=false;return{marks:atomicMarks,frames:atomicFrames};});returns.push({source,...trace});
   const first=trace.frames.find(f=>f.path==='/index.html'),last=trace.frames.at(-1);
   console.log(JSON.stringify({phase,engine,reduce,source,marks:trace.marks,first:first&&Object.fromEntries(Object.entries(first.elements).map(([k,e])=>[k,e&&{y:e.rect.y,h:e.rect.height,visible:e.visible,inViewport:e.inViewport,hit:e.hit,opacity:e.opacity}])),last:last&&Object.fromEntries(Object.entries(last.elements).map(([k,e])=>[k,e&&{y:e.rect.y,h:e.rect.height,visible:e.visible,inViewport:e.inViewport,hit:e.hit}]))}));
  }
  results.push({engine,reduce,cold,returns});await c.close();
 }}finally{await b.close();}
}
await writeFile(`${out}/${phase}-trace.json`,JSON.stringify(results,null,2));
}
