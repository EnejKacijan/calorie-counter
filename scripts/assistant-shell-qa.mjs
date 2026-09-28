import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {assistantFixture,pw,out,settle,keyboard,closeKeyboard} from './assistant-polish-harness.mjs';
import {sample} from './assistant-shell-probe.mjs';
const sizes=process.env.ASSISTANT_SMOKE?[[390,844]]:[[375,667],[390,844],[393,852],[430,932]],results=[];
await mkdir(out+'/delivery',{recursive:true});
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1,`${a} != ${b}`);
function geometry(today,a){near(a.nodes.nav.rect.bottom,today.nodes.nav.rect.bottom);near(a.nodes.nav.rect.top,today.nodes.nav.rect.top);near(a.nodes.root.rect.bottom,today.nodes.nav.rect.bottom);assert.ok(a.nodes.composer.rect.bottom<=a.nodes.nav.rect.top+1);assert.ok(a.nodes.header.rect.top>=parseFloat(a.safe.top));assert.equal(a.nodes.root.inline.includes('--assistant-viewport-height'),false);assert.equal(a.nodes.root.inline.includes('--assistant-viewport-top'),false);}
for(const engine of ['chromium','webkit']){
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 try{for(const[width,height]of sizes)for(const theme of ['light','dark']){
  const f=await assistantFixture(b,{engine,width,height,theme,source:process.env.INTAKE_QA_SOURCE}),{p,c}=f;let stage='shell';const checks=[];
  const lifecycle=[];
  const trace=async label=>{if(process.env.ASSISTANT_FOCUS_DIAG)lifecycle.push({label,...await p.evaluate(sample),events:await p.evaluate(()=>window.qaEvents.slice(-25))});};
  const tab=async name=>{await p.locator(`.mobile-tabbar a[href="${name}.html"]`).tap();await p.waitForURL('**/'+name+'.html');await settle(p);};
  const shot=async name=>{if(width===390)await p.screenshot({path:out+`/delivery/${name}-${theme}-${engine}-390.png`});};
  try{
   await tab('index');const today=await p.evaluate(sample);await tab('assistant');const normal=await p.evaluate(sample);geometry(today,normal);await shot('assistant');
   // A browser chrome/closed-keyboard visual viewport mismatch must NOT own the shell.
   await keyboard(p,height-104,0,height);geometry(today,await p.evaluate(sample));await closeKeyboard(p);geometry(today,await p.evaluate(sample));
   for(const mode of ['context','history']){const open=mode==='context'?'#assistantContextDisclosure':'#assistantHistoryOpen',panel=mode==='context'?'#assistantContextControls':'#assistantHistory';await p.locator(open).tap();await settle(p);const rect=await p.locator(panel).boundingBox();near(rect.y+rect.height,height);assert.equal(await p.evaluate(()=>document.activeElement.tagName),'H2');await p.goBack();await p.locator(panel).waitFor({state:'hidden'});geometry(today,await p.evaluate(sample));}
   checks.push('Today/Assistant shared viewport boundary and nav; short non-keyboard visual viewport; context/history full height and Back');
   stage='four rendered starters';
   for(let i=0;i<4;i++){
    if(i)await p.locator('#assistantClear').tap();
    await p.locator('#assistantContextDisclosure').tap();if(!await p.locator('#assistantDiaryToggle').isChecked())await p.locator('.assistant-context-toggle').tap();await p.locator('#assistantRange').selectOption(i===1?'30':'7');if(i===2)await p.locator('.assistant-context-toggle').tap();await p.locator('#assistantContextDone').tap();await settle(p);
    const button=p.locator('#assistantEmpty [data-assistant-prompt]').nth(i),expected=await button.getAttribute('data-assistant-prompt'),before=f.requests.length;
    assert.ok((await button.boundingBox()).height>=44);await button.tap();await f.idle();assert.equal(f.requests.length,before+1);assert.equal(f.requests.at(-1).message,expected);assert.equal(await p.locator('.assistant-message.is-user > p').innerText(),expected);assert.equal((await f.saved())[0].messages.length,2);assert.equal(await p.locator('#assistantEmpty').isVisible(),false);assert.equal(await p.evaluate(()=>document.activeElement.id==='assistantInput'),false);
    if(i===2)assert.deepEqual(f.requests.at(-1).appContext,{diaryEnabled:false});else assert.equal(f.requests.at(-1).appContext.rangeDays,i===1?30:7);
    const id=(await f.saved())[0].id;assert.match(id,/^[\da-f-]{36}$/i);await p.reload();await p.locator('.assistant-message.is-assistant').waitFor();assert.equal((await f.saved())[0].id,id);assert.equal(await p.locator('.assistant-message.is-user > p').innerText(),expected);geometry(today,await p.evaluate(sample));
   }
   await shot('active');checks.push('4/4 real taps: visible label, exactly one request/turn, current 7/30/off payload, persisted UUID, reload, no keyboard');
   stage='rapid taps';await p.locator('#assistantClear').tap();f.setOutcome('pending');const row=p.locator('#assistantEmpty [data-assistant-prompt]').first(),box=await row.boundingBox(),start=f.requests.length;
   await p.touchscreen.tap(box.x+30,box.y+20);await p.touchscreen.tap(box.x+30,box.y+20);await p.waitForFunction(()=>document.querySelector('#assistantInput').disabled);assert.equal(f.requests.length,start+1);assert.equal(await p.locator('#assistantEmpty button:disabled').count(),4);assert.equal((await f.saved())[0].messages.length,1);await f.release();await f.idle();f.setOutcome('ok');checks.push('rapid physical-coordinate double tap: one turn/request, all starters immediately disabled, live loading');
   stage='failed starter';await p.locator('#assistantClear').tap();f.setOutcome('fail');await p.locator('#assistantEmpty [data-assistant-prompt]').first().tap();await f.idle();assert.equal((await f.saved())[0].messages.length,1);assert.equal(await p.locator('#assistantEmpty').isVisible(),false);await p.locator('[data-assistant-retry]').tap();await f.idle();assert.equal((await f.saved())[0].messages.length,1);f.setOutcome('ok');await p.locator('[data-assistant-retry]').tap();await f.idle();assert.equal((await f.saved())[0].messages.length,2);assert.deepEqual(f.requests.at(-1).history,[]);checks.push('failed starter retains turn; repeated failure and successful Retry without duplicates');
   stage='keyboard focus/reduced motion';for(const key of ['Enter','Space']){await p.locator('#assistantClear').tap();await p.keyboard.press('Tab');await p.keyboard.press('Tab');await p.locator('#assistantEmpty button').first().focus();assert.equal(await p.locator('#assistantEmpty button').first().evaluate(e=>getComputedStyle(e).outlineStyle),'solid');const count=f.requests.length;await p.locator('#assistantEmpty button').first().press(key);await f.idle();assert.equal(f.requests.length,count+1);}
   await p.emulateMedia({reducedMotion:'reduce'});await p.locator('#assistantClear').tap();await p.locator('#assistantEmpty button').last().tap();await f.idle();assert.equal(await p.locator('.assistant-empty-exit').count(),0);await p.emulateMedia({reducedMotion:'no-preference'});checks.push('native Enter/Space starter activation, visible intentional keyboard focus, reduced motion');
   stage='keyboard/lifecycle';const input=p.locator('#assistantInput');await input.fill('Keep this draft\nSecond line');const draft=await input.inputValue();await keyboard(p,380,75,380);let a=await p.evaluate(sample);await trace('first keyboard');near(a.nodes.composer.rect.bottom,455);assert.ok((await input.boundingBox()).y>=75);assert.equal(await p.locator('.mobile-tabbar').isVisible(),false);
   await p.locator('#assistantContextDisclosure').tap();await settle(p);let rect=await p.locator('#assistantContextControls').boundingBox();assert.ok(rect.y>=75-1);near(rect.y+rect.height,455);await p.locator('#assistantContextDone').tap();await closeKeyboard(p);await trace('after closeKeyboard');
   // Animation completion is not the sheet's close boundary: its bounded
   // cleanup timer can run a frame later. Wait for actual dismissal before
   // starting a new composer edit, which is inert during that exit.
   await p.locator('#assistantContextControls').waitFor({state:'hidden'});
   geometry(today,await p.evaluate(sample));assert.equal(await input.inputValue(),draft);
   await input.fill(draft);await trace('after refill');await keyboard(p,380,0,380);a=await p.evaluate(sample);await trace('second keyboard');assert.ok(a.nodes.header.rect.top>=parseFloat(a.safe.top));near(a.nodes.composer.rect.bottom,380);assert.ok(a.nodes.conversation.rect.height>=32);await closeKeyboard(p);geometry(today,await p.evaluate(sample));
   for(const target of ['index','progress']){await tab(target);assert.equal(await p.evaluate(()=>document.body.classList.contains('assistant-keyboard-open')),false);await tab('assistant');geometry(today,await p.evaluate(sample));assert.equal(await input.inputValue(),draft);assert.equal(await p.evaluate(()=>document.activeElement.id==='assistantInput'),false);}
   await c.pages()[0].setViewportSize({width:667,height:375});await settle(p);await p.setViewportSize({width,height});await settle(p);geometry(today,await p.evaluate(sample));
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(f.errors,[]);checks.push('keyboard/context/dismiss exact reset; Today/Progress return and draft; resize/rotation back; no stale vars/errors');
   results.push({engine,version:b.version(),width,height,theme,checks,today,normal,requests:f.requests.length,errors:f.errors,secure:normal.secure});console.log('PASS shell/starter',engine,width,theme,checks.length);
  }catch(e){await p.screenshot({path:out+'/failure.png'});await trace('failure');console.error('FAIL',stage,engine,width,theme,f.errors);throw e;}finally{if(process.env.ASSISTANT_FOCUS_DIAG)await writeFile(out+`/lifecycle-${engine}-${width}-${theme}.json`,JSON.stringify(lifecycle,null,2));await c.close();}
 }}finally{await b.close();}
}
await writeFile(out+'/matrix.json',JSON.stringify({qualification:'Real rendered taps on isolated synthetic profiles; HTTP LAN tests exercise native missing randomUUID. Chromium safe-area PWA emulation and Windows WebKit; keyboard offsets simulated, not physical-device approval.',results},null,2));
