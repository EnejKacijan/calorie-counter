import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {assistantFixture,pw,out,keyboard,closeKeyboard,settle,seed,scroll,measure,keyboardMask} from './assistant-jump-harness.mjs';
import {paintAudit} from './assistant-jump-presentation-audit.mjs';
const baseline=process.env.JUMP_BASELINE==='1',quick=process.env.JUMP_QUICK==='1';
const results=[];await mkdir(out,{recursive:true});
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1.5,`${label}: ${a} != ${b}`);
function geometry(m){
 assert.equal(m.name,'Jump to latest');assert.equal(m.parent,'assistant-chat-footer');assert.equal(m.hidden,false);assert.equal(m.inert,false);
 near(m.jump.width,44,'hit width');near(m.jump.height,44,'hit height');near(m.face.width,40,'face width');near(m.face.height,40,'face height');
 near(m.jump.x+m.jump.width/2,m.composer.x+m.composer.width/2,'composer center');near(m.footer.y-m.face.bottom,12,'visual gap');near(m.footer.y-m.jump.bottom,10,'hit gap');
 assert.ok(m.jump.y>=m.region.y,'button inside conversation boundary');assert.ok(m.jump.bottom<m.context.y,'separate Diary hit target');
 assert.ok(m.jump.bottom<m.composer.y&&m.jump.bottom<m.send.y);assert.equal(m.jumpHit,'assistantJumpLatest');assert.equal(m.diaryHit,'assistantContextDisclosure');
 assert.equal(m.mask,'none','conversation is not erased into a full-width utility slab');assert.equal(m.docTop,0);assert.equal(m.overflow,false);
}
async function floating(p){
 const paint=await paintAudit(p),j=paint['#assistantJumpLatest'];
 assert.equal(j.style.position,'absolute');assert.equal(j.style.backgroundColor,'rgba(0, 0, 0, 0)');
 for(const k of ['backgroundImage','boxShadow','backdropFilter'])assert.equal(j.style[k],'none',k);
 for(const s of ['#assistantJumpLatest','.assistant-jump-face','.assistant-chat-footer'])for(const pseudo of ['before','after'])assert.equal(paint[s][pseudo].content,'none','no generated slab');
 assert.notEqual(paint['.assistant-jump-face'].style.backgroundColor,'rgba(0, 0, 0, 0)');
 const hits=await p.evaluate(()=>{const j=document.querySelector('#assistantJumpLatest'),r=j.getBoundingClientRect(),chat=document.querySelector('.assistant-conversation').getBoundingClientRect();return [chat.left+25,r.left-3,r.right+3,chat.right-25].map(x=>({x,conversation:!!document.elementFromPoint(x,r.top+r.height/2)?.closest('.assistant-conversation')}));});
 assert.ok(hits.every(h=>h.conversation),'beside the circle hits live conversation, not footer/overlay');
 return paint;
}
for(const engine of (process.env.JUMP_ENGINE?[process.env.JUMP_ENGINE]:['chromium','webkit'])){
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 try{for(const[width,height]of(baseline||quick?[[390,844]]:[[320,667],[375,667],[390,844],[393,852],[430,932]]))for(const theme of(baseline||quick?['dark']:['light','dark']))for(const reduce of(baseline||quick?[false]:[false,true])){
  const tag=`${engine}-${width}-${theme}-${reduce?'reduced':'motion'}`,checks=[],samples=[];let stage='seed';
  const f=await assistantFixture(b,{engine,width,height,theme,reduce,source:baseline?'artifacts/assistant-jump/before/public':undefined,beforeOpen:async({c})=>c.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}))}),{p,c}=f;
  try{
   await seed(p);const initial=await measure(p);assert.equal(initial.hidden,true);near(initial.distance,0,'initial latest');assert.equal(await p.locator('#assistantJumpLatest').count(),1);
   await scroll(p,120);await p.locator('#assistantInput').fill('A draft question');await settle(p);
   if(baseline){await p.locator('#assistantInput').focus();await keyboard(p,430,48,430);await keyboardMask(p);samples.push(await measure(p));await p.screenshot({path:`out/${tag}.png`.replace('out/',out+'/')});results.push({tag,baseline,samples});console.log('PASS baseline',tag);continue;}
   geometry(await measure(p));await floating(p);near((await measure(p)).footer.y,initial.footer.y,'appearance does not move footer');near((await measure(p)).header.y,initial.header.y,'appearance does not move header');near((await measure(p)).height,initial.height,'no permanent/dynamic scroll padding');checks.push('one centered utility; 44px hit/40px face/11–12px visual gap; no slab, overlay hit area, pseudo paint or appearance layout shift');
   for(const keyboardOpen of[false,true])for(const lines of[1,2,4]){
    stage=`keyboard-${keyboardOpen}-lines-${lines}`;
    await p.evaluate(()=>{window.qaJumpReplay=[];window.qaJumpSampling=true;const tick=()=>{const f=document.querySelector('.assistant-jump-face');qaJumpReplay.push({opacity:getComputedStyle(f).opacity,scale:getComputedStyle(f).scale});if(qaJumpSampling)requestAnimationFrame(tick);};tick();});
    if(!keyboardOpen)await closeKeyboard(p);
    await p.locator('#assistantInput').fill(Array.from({length:lines},(_,i)=>i?'Another draft line':'A draft question').join('\n'));
    if(keyboardOpen){await p.locator('#assistantInput').focus();await keyboard(p,430,48,430);}
    await settle(p);const m=await measure(p);geometry(m);near(m.top,120,'composer/keyboard retains reading');samples.push({keyboardOpen,lines,...m});
    const replay=await p.evaluate(()=>{qaJumpSampling=false;return qaJumpReplay;});assert.ok(replay.every(f=>f.opacity==='1'&&f.scale==='1'),'geometry change must not replay entry');await floating(p);
    assert.ok(m.input.bottom<=m.viewport.top+m.viewport.height+1,'composer above keyboard');
    if(width===390&&!reduce){await keyboardMask(p,keyboardOpen);await p.screenshot({path:`${out}/${tag}-${keyboardOpen?'keyboard':'closed'}-${lines}line.png`});await keyboardMask(p,false);}
    stage+='-diary';await p.locator('#assistantContextDisclosure').tap();await p.locator('#assistantContextControls').waitFor();await settle(p);
    assert.equal(await p.locator('#assistantContextDisclosure').getAttribute('aria-expanded'),'true');
    assert.equal(await p.locator('#assistantJumpLatest').evaluate(e=>!!e.closest('[inert]')),true,'existing modal makes parent inert');
    assert.notEqual((await measure(p)).jumpHit,'assistantJumpLatest','Diary modal owns input');
    await p.locator('#assistantContextDone').tap();await p.locator('#assistantContextControls').waitFor({state:'hidden'});await settle(p);
    const closed=await measure(p);geometry(closed);near(closed.jump.y,m.jump.y,'Diary roundtrip stable');near(closed.header.y,m.header.y,'Diary header stable');near(closed.footer.y,m.footer.y,'Diary footer stable');near(closed.top,m.top,'Diary reading stable');
    checks.push(`keyboard ${keyboardOpen?'open':'closed'}, ${lines} lines, Diary open/close: geometry + input separation + reading preserved`);
   }
   stage='tap';const beforeTap=await measure(p);await p.locator('#assistantJumpLatest').tap();await settle(p);let m=await measure(p);assert.equal(m.hidden,true);assert.equal(m.inert,true);assert.equal(m.mask,'none');near(m.height,beforeTap.height,'hide does not change scroll height');near(m.footer.y,beforeTap.footer.y,'hide does not move footer');near(m.distance,0,'tap latest');assert.equal(m.follow,'latest');assert.equal(await p.locator('.assistant-conversation').evaluate(e=>e.matches(':focus-visible')),false);checks.push('tap rejoins latest, no touch focus residue; show/hide adds no scroll range or layout strip');
   await closeKeyboard(p);await p.locator('#assistantInput').fill('');await settle(p);
   stage='thresholds';m=await measure(p);await scroll(p,m.height-m.view-20);assert.equal((await measure(p)).hidden,true);await scroll(p,m.height-m.view-155);assert.equal((await measure(p)).hidden,false);
   await scroll(p,m.height-m.view-100);assert.equal((await measure(p)).hidden,false);await scroll(p,m.height-m.view-70);assert.equal((await measure(p)).hidden,true);checks.push('20px no button, 140/60 hysteresis and 80px resume unchanged');
   stage='response';f.setOutcome('pending');await p.locator('#assistantInput').fill('A live turn');await p.locator('#assistantSend').tap();await p.locator('#assistantTyping').waitFor();await settle(p);await scroll(p,240);
   const reading=await measure(p);f.setReply('A long answer arriving as one response.\n\n'+('Sample paragraph.\n• Item one\n• Item two\n\n').repeat(90));await f.release();await f.idle();await settle(p);
   m=await measure(p);geometry(m);near(m.top,reading.top,'response does not steal reading');assert.equal(m.follow,'history');checks.push('long reply/list arrives without stealing manual reading');
   stage='focus';await closeKeyboard(p);await p.locator('#assistantInput').fill('');await scroll(p,240);await p.keyboard.press('Tab');await p.locator('#assistantJumpLatest').focus();assert.equal((await measure(p)).outline,'solid');assert.equal(await p.locator('#assistantJumpLatest').evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Enter');await settle(p);near((await measure(p)).distance,0,'keyboard latest');assert.equal(await p.evaluate(()=>document.activeElement.classList.contains('assistant-conversation')),true);checks.push('keyboard visible focus, accessible name and focus restoration');
   assert.deepEqual(f.errors,[]);assert.equal(f.requests.length,1);results.push({tag,version:b.version(),checks,samples});console.log('PASS',tag,checks.length);
  }catch(error){await p.screenshot({path:`${out}/${tag}-FAIL.png`});await writeFile(out+'/failure.json',JSON.stringify({tag,stage,error:error.stack,measure:await measure(p),errors:f.errors},null,2));throw error;}
  finally{await c.close();await writeFile(out+'/matrix.json',JSON.stringify({qualification:'Isolated synthetic conversation and mocked whole response; visualViewport keyboard simulation, not physical iOS.',results},null,2));}
 }}finally{await b.close();}
}
console.log('PASS',results.length,'Jump configurations');
