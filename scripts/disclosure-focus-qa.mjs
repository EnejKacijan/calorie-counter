import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,launchPage,fixture,position,finish,measure,toggle,group,read,settle,out} from './disclosure-focus-harness.mjs';
await mkdir(out,{recursive:true});const results=[];
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<2,`${label}: ${a}/${b}`);
function checkPlan(before,after,{count=2}={}){
 const p=after.plan;assert.equal(p.policy,'content-focus');const ideal=p.start+p.anchor.top-p.usable.top-12;
 near(p.target,Math.max(0,Math.min(p.max,ideal)),'one deterministic clamped target');near(after.scrollTop,p.target,'settled target');
 near(after.anchor.top,Math.max(p.usable.top+12,p.anchor.top+p.start-after.max),'anchor at top or real end limit');
 assert.ok(after.fullyVisible>=Math.min(count,2),'first complete food rows visible above footer/FAB');assert.equal(after.overflow,false);
 assert.deepEqual(after.footer,before.footer);assert.deepEqual(after.fab,before.fab);
 return {initial:before.scrollTop,usable:p.usable,anchor:p.anchor,ideal,target:p.target,final:after.scrollTop,max:after.max,clamped:p.target<ideal-1,fullyVisible:after.fullyVisible};
}
for(const engine of(process.env.DISCLOSURE_ENGINE?.split(',')||['chromium','webkit'])){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
 try{for(const[width,height]of(process.env.FOCUS_QUICK?[[390,844]]:[[320,667],[375,667],[390,844],[430,932]]))for(const theme of['light','dark'])for(const reduce of[false,true]){
  const tag=`${engine}-${width}-${theme}-${reduce?'reduce':'motion'}`,{p,c}=await launchPage(b,{engine,width,height,theme,reduce});const checks=[],metrics={};let stage='setup';
  try{
   for(const tail of [0,10]){
    stage='two-food '+(tail?'start aligned':'real end clamp');await fixture(p,{tail});const initial=await read(p),heightBefore=await p.evaluate(()=>document.scrollingElement.scrollHeight);
    await position(p);const before=await measure(p);await p.locator(toggle).first().tap();await finish(p);let after=await measure(p);
    metrics[stage]=checkPlan(before,after);assert.equal(after.fullyVisible,2);
    const final=after.scrollTop;await p.locator(toggle).first().tap();await finish(p);near(await p.evaluate(()=>document.scrollingElement.scrollHeight),heightBefore,'collapse leaves no added spacer');
    for(let n=0;n<2;n++){await position(p);await p.locator(toggle).first().tap();await finish(p);after=await measure(p);near(after.scrollTop,final,'same layout no accumulating drift');await p.locator(toggle).first().tap();await finish(p);}
    assert.deepEqual(await read(p),initial);checks.push(stage+' deterministic x3, no added range/data writes');
    if(tail){stage='already comfortable group stays still';await position(p,{where:'top'});const before=await measure(p);await p.locator(toggle).first().tap();await finish(p);after=await measure(p);near(after.scrollTop,before.scrollTop,'comfortable no-op');assert.equal(after.fullyVisible,2);checks.push(stage);}
   }
   // The accepted compact diary rows let twelve items fit on a 430x932
   // WebKit viewport. Keep this fixture genuinely oversized at every size;
   // retain the assertion that the last item needs normal manual scrolling.
   stage='oversized group anchored at beginning';await fixture(p,{count:20,tail:10});const initial=await read(p);await position(p);const before=await measure(p);await p.locator(toggle).first().tap();await finish(p);const after=await measure(p);metrics.large=checkPlan(before,after,{count:20});assert.ok(after.rows.at(-1).bottom>after.bounds.bottom);checks.push(stage);
   stage='restored expansion after Edit is quiet';await p.locator('.scanned-meal-children .entry-main').first().tap();await finish(p);await p.locator('#closeFoodModal').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await finish(p);
   assert.equal(await p.locator(toggle).first().getAttribute('aria-expanded'),'true');const writes=await p.evaluate(()=>focusWrites.length);await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>focusWrites.length),writes);assert.deepEqual(await read(p),initial);checks.push(stage);
   stage='latest of two overlapping expansions';await fixture(p,{tail:10,second:true});await position(p);await p.evaluate(()=>{document.querySelectorAll('.scanned-meal-toggle').forEach(e=>e.click());});await finish(p);const second=await measure(p,{index:1});
   near(second.anchor.top,second.bounds.top+12,'second final heading, including earlier expansion growth');assert.equal(await p.locator('[aria-expanded=true].scanned-meal-toggle').count(),2);metrics.second=second;checks.push(stage);
   assert.deepEqual(await p.evaluate(()=>qaErrors),[]);results.push({tag,passed:true,checks,metrics});console.log('PASS focus',tag,checks.length);
  }catch(e){results.push({tag,passed:false,stage,error:e.stack,metrics});await p.screenshot({path:out+'/'+tag+'-FAIL.png'});throw e;}
  finally{await c.close();await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
 }}finally{await b.close();}
}
