import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {assistantFixture,pw,out,keyboard,closeKeyboard,conversationKey,base} from './assistant-polish-harness.mjs';
import {settle} from './edge-row-harness.mjs';
export const userText='My lunch — café 🥣\n\n150 g oats; 32 g protein.\nKeep these paragraphs.';
export const replyText='A sample reply.\n\n• Protein: 32 g\n• Energy: 520 kcal\n\nhttps://example.test/food\n\n'+('A longer paragraph with Unicode žšč and meaningful units.\n\n').repeat(18);
export async function fixture(b,options={}){
 const f=await assistantFixture(b,options),{p}=f;
 await p.evaluate(({key,userText,replyText})=>{
  const date=new Date().toISOString(),messages=[{role:'user',content:userText,createdAt:date},{role:'assistant',content:replyText,createdAt:date},{role:'user',content:'A second question',createdAt:date},{role:'assistant',content:'A second answer',createdAt:date}];
  localStorage.setItem(key,JSON.stringify([{id:'actions-qa',title:'Synthetic actions QA',messages,createdAt:date,updatedAt:date,diaryEnabled:true,diaryRange:7}]));sessionStorage.setItem('calorie-counter-assistant-active-conversation-session-v1','actions-qa');
 },{key:conversationKey,userText,replyText});
 await p.goto(base+'/assistant.html?copyDiagnostics=1');await p.locator('.assistant-message').last().waitFor();await settle(p);
 await p.evaluate(real=>{
  window.qaCopies=[];window.qaDiagnostics=[];window.qaCopyMode='ok';
  document.addEventListener('intake:copy-diagnostic',e=>qaDiagnostics.push(e.detail));
  const write=text=>{qaCopies.push(text);if(qaCopyMode==='pending')return new Promise((resolve,reject)=>{window.qaResolve=resolve;window.qaReject=reject;});if(qaCopyMode==='reject')return Promise.reject(new DOMException('QA rejection','NotAllowedError'));return Promise.resolve();};
  if(!real)Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:write}});
 },options.realClipboard===true);
 return f;
}
export async function reading(p,top=0){await p.locator('.assistant-conversation').evaluate((e,top)=>{e.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true}));e.scrollTop=top;},top);await settle(p);}
export async function hold(p,role){
 const body=p.locator('.assistant-message.is-'+role+' > p').first();await body.scrollIntoViewIfNeeded();await settle(p);
 const r=await body.boundingBox();await body.dispatchEvent('pointerdown',{pointerType:'touch',pointerId:77,isPrimary:true,button:0,clientX:r.x+25,clientY:Math.max(r.y+12,140)});
 await p.waitForTimeout(520);await body.dispatchEvent('pointerup',{pointerType:'touch',pointerId:77,isPrimary:true,button:0});
 await p.locator('#assistantMessageActions[open]').waitFor();await settle(p);
}
export const readingState=p=>p.evaluate(()=>({top:document.querySelector('.assistant-conversation').scrollTop,draft:document.querySelector('#assistantInput').value,follow:document.querySelector('.assistant-conversation').dataset.chatFollow,header:document.querySelector('.assistant-header').getBoundingClientRect().top,stored:localStorage.getItem('calorie-counter-assistant-conversations-v1')}));
const near=(a,b)=>assert.ok(Math.abs(a-b)<2,`${a} != ${b}`);

if(process.argv[1]?.replaceAll('\\','/').endsWith('/assistant-actions-qa.mjs')){
 await mkdir(out,{recursive:true});const results=[];
 const cases=process.env.ACTIONS_SMOKE==='1'?[{width:390,theme:'dark'}]:[320,390,430].flatMap(width=>['light','dark'].map(theme=>({width,theme}))).concat(['light','dark'].flatMap(theme=>[{width:390,theme,reduce:true},{width:390,theme,large:true}]));
 for(const engine of ['chromium','webkit']){
  const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
  try{for(const options of cases){
   const tag=`${engine}-${options.width}-${options.theme}-${options.reduce?'reduced':options.large?'large':'normal'}`,f=await fixture(b,{engine,...options}),{p,c}=f;let stage='initial';const checks=[];
   try{
    if(options.large)await p.addStyleTag({content:'.assistant-message > p,.assistant-text-selection-body {font-size:22px !important;}'});
    await p.locator('#assistantInput').fill('Draft stays\nAcross actions');await reading(p);const initial=await readingState(p);
    for(const [role,text] of [['user',userText],['assistant',replyText]]){
     stage=role+' hold/copy';await hold(p,role);
     assert.equal(await p.evaluate(()=>qaCopies.length),role==='user'?0:1,'hold only opens, never copies');
     const before=await readingState(p),menu=p.locator('#assistantMessageActions');const box=await menu.boundingBox(),region=await p.locator('.assistant-conversation').boundingBox();
     assert.ok(box.y>=region.y&&box.y+box.height<=region.y+region.height+1);assert.ok(box.x>=0&&box.x+box.width<=options.width);
     assert.equal(await menu.locator('button').count(),2);assert.ok((await menu.locator('button').first().boundingBox()).height>=44);
     assert.equal(await p.locator('.assistant-message').first().getAttribute('role'),null);
     if(options.width===390&&!options.reduce&&!options.large)await p.screenshot({path:`${out}/${tag}-${role}-actions.png`});
     await p.locator('[data-message-action=copy]').tap();await menu.waitFor({state:'hidden'});await settle(p);
     assert.equal(await p.evaluate(()=>qaCopies.at(-1)),text);assert.equal(await p.locator('#assistantCopyStatus').textContent(),'Copied');
     if(role==='assistant')assert.ok((await p.locator('#assistantCopyStatus').boundingBox()).height>20,'long reply confirmation is visible near the former menu');
     if(options.width===390&&!options.reduce&&!options.large)await p.screenshot({path:`${out}/${tag}-${role}-copied.png`});
     const after=await readingState(p);near(after.top,before.top);assert.equal(after.draft,initial.draft);assert.equal(after.stored,initial.stored);assert.equal(after.follow,'history');
     assert.equal(await p.locator('[data-copy-confirmed]').count(),1);await p.waitForTimeout(1900);assert.equal(await p.locator('[data-copy-confirmed]').count(),0);
    }checks.push('both holds: exact text, no auto-copy/release leak, stable draft/persistence/anchor, brief confirmed success');
    stage='selection';await reading(p,200);const overflow=p.locator('.assistant-message.is-assistant [data-message-actions]').first();await overflow.tap();
    await p.locator('[data-message-action=select]').tap();await p.locator('#assistantTextSelection[open]').waitFor();await settle(p);
    const body=p.locator('#assistantTextSelectionBody');assert.equal(await body.textContent(),replyText);assert.equal(await body.getAttribute('contenteditable'),null);
    const selectionBox=await p.locator('#assistantTextSelection').boundingBox();near(selectionBox.width,options.width);assert.ok(selectionBox.height>600);
    assert.equal(await body.evaluate(e=>getComputedStyle(e).userSelect||getComputedStyle(e).webkitUserSelect),'text');
    // Browser-native Range, not a painted imitation; iOS handles need a device.
    assert.equal(await body.evaluate(e=>{const s=getSelection(),r=document.createRange();r.setStart(e.firstChild,0);r.setEnd(e.firstChild,66);s.removeAllRanges();s.addRange(r);return s.toString();}),replyText.slice(0,66));
    if(options.width===390&&!options.reduce&&!options.large)await p.screenshot({path:`${out}/${tag}-select-text.png`});
    await p.locator('#assistantTextSelectionBack').tap();await p.locator('#assistantTextSelection').waitFor({state:'hidden'});await settle(p);
    assert.equal(await p.evaluate(()=>getSelection().isCollapsed),true,'hidden snapshot must not keep a stale native selection');
    assert.equal((await readingState(p)).draft,initial.draft);assert.equal((await readingState(p)).stored,initial.stored);assert.equal(await p.evaluate(()=>document.activeElement.id==='assistantInput'),false);checks.push('full-screen read-only snapshot, real Range, existing Back, no keyboard reopen');
    stage='keyboard/failure';await reading(p);await p.locator('#assistantInput').focus();await keyboard(p,430,48,430);
    await p.evaluate(()=>{qaCopyMode='reject';getSelection().removeAllRanges();});await p.locator('[data-message-actions]').first().tap();
    const kb=await p.locator('#assistantMessageActions').boundingBox(),footer=await p.locator('.assistant-chat-footer').boundingBox();assert.ok(kb.y+kb.height<=footer.y);
    await p.locator('[data-message-action=copy]').tap();await p.locator('#assistantTextSelection[open]').waitFor();assert.match(await p.locator('[data-selection-note]').innerText(),/declined/);
    assert.equal(await p.locator('#assistantCopyStatus').textContent(),'');assert.equal(await p.locator('#assistantTextSelectionBody').textContent(),userText);
    await p.keyboard.press('Escape');await p.locator('#assistantTextSelection').waitFor({state:'hidden'});await settle(p);await closeKeyboard(p);checks.push('keyboard-aware compact menu; rejected secure write opens honest native selection, no false success');
    stage='dismissals';await reading(p);await p.locator('[data-message-actions]').first().tap();await p.goBack();await p.locator('#assistantMessageActions').waitFor({state:'hidden'});await settle(p);
    await p.locator('[data-message-actions]').first().tap();await p.touchscreen.tap(options.width-5,70);await p.locator('#assistantMessageActions').waitFor({state:'hidden'});assert.equal(await p.locator('#assistantHistory').isVisible(),false);checks.push('history Back and outside tap dismiss without activating parent');
    stage='pending stale';await p.evaluate(()=>qaCopyMode='pending');await p.locator('[data-message-actions]').first().tap();const count=await p.evaluate(()=>qaCopies.length);
    await p.locator('[data-message-action=copy]').tap();await p.locator('[data-message-action=copy]').dispatchEvent('click');assert.equal(await p.evaluate(()=>qaCopies.length),count+1);
    await p.keyboard.press('Escape');await p.locator('#assistantMessageActions').waitFor({state:'hidden'});await settle(p);await p.locator('[data-message-actions]').first().tap();
    await p.evaluate(()=>qaResolve());await settle(p);assert.equal(await p.locator('#assistantMessageActions').isVisible(),true);assert.equal(await p.locator('#assistantCopyStatus').textContent(),'');
    await p.keyboard.press('Escape');await p.locator('#assistantMessageActions').waitFor({state:'hidden'});await settle(p);checks.push('exactly once rapid Copy, stale result cannot close a new menu or announce success');
    stage='keyboard focus';await p.locator('[data-message-actions]').first().focus();await p.keyboard.press('Enter');await p.locator('#assistantMessageActions[open]').waitFor();
    assert.equal(await p.locator('[data-message-action=copy]').evaluate(e=>e===document.activeElement),true);assert.equal(await p.locator('[data-message-action=copy]').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
    await p.keyboard.press('Tab');assert.equal(await p.locator('[data-message-action=select]').evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Tab');assert.equal(await p.locator('[data-message-action=copy]').evaluate(e=>e===document.activeElement),true);
    await p.keyboard.press('Escape');await p.locator('#assistantMessageActions').waitFor({state:'hidden'});await settle(p);checks.push('keyboard entry, real focus-visible, Tab trap, Escape and focus return');
    assert.equal((await readingState(p)).stored,initial.stored);assert.deepEqual(f.errors,[]);assert.equal(f.requests.length,0);assert.equal(await p.evaluate(()=>document.body.style.position),'');
    results.push({tag,checks,errors:f.errors});console.log('PASS',tag,checks.length);
   }catch(e){await p.screenshot({path:`${out}/${tag}-FAIL.png`});await writeFile(out+'/failure.json',JSON.stringify({tag,stage,error:e.stack,errors:f.errors},null,2));throw e;}
   finally{await c.close();await writeFile(out+'/matrix.json',JSON.stringify(results,null,2));}
  }}finally{await b.close();}
 }
}
