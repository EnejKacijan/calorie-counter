import {pw,setup,settle,keyboard,closeKeyboard,out} from './add-flow-harness.mjs';
import {installEvidence,metrics,touch} from './sheet-gesture-harness.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const jobs=(process.env.PROFILE_ENGINE?.split(',')||['chromium','webkit']).flatMap(engine=>(process.env.PROFILE_QUICK?[[390,844]]:[[375,667],[390,844],[393,852],[430,932]]).flatMap(([width,height])=>['light','dark'].flatMap(theme=>[false,true].map(reduce=>({engine,width,height,theme,reduce}))))).filter(job=>!process.env.PROFILE_WIDTH||job.width===Number(process.env.PROFILE_WIDTH));
const results=[];let next=0;
async function run(job){
 const {engine,width,height,theme,reduce}=job,tag=`${engine}-${width}-${theme}-${reduce?'reduced':'motion'}`,dir=`${out}/${tag}`;await mkdir(dir,{recursive:true});
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})}),{c,p}=await setup(b,job);let stage='entry';const report={...job,result:'RUNNING',gestures:[],maxParentDrift:0,heights:{}};
 const shot=async name=>{if(!reduce&&(width===390||width===375&&name==='plan-targets'))await p.screenshot({path:`${dir}/${name}.png`});};
 try{
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('calorie-counter-state'));s.user.mealSchedule={breakfastEnd:'10:30',lunchEnd:'15:30'};localStorage.setItem('calorie-counter-state',JSON.stringify(s));});await p.reload();await p.locator('body:not([data-app-loading]) .day-tile').first().waitFor();await settle(p);
  const original=await p.evaluate(()=>localStorage.getItem('calorie-counter-state'));
  await p.evaluate(()=>{window.profileFrames=[];document.addEventListener('intake:navigated',()=>{let n=0;const frame=()=>{const h=document.querySelector('#profilePageTitle');if(h)profileFrames.push({id:document.activeElement.id,outline:getComputedStyle(h).outlineStyle});if(n++<8)requestAnimationFrame(frame);};frame();});});
  await p.locator('.mobile-tabbar a[href="profile.html"]').tap();await p.locator('#profileSettingsOverview').waitFor();await settle(p);
  await installEvidence(p);await p.evaluate(()=>{const previous=sheetMetrics;window.sheetMetrics=()=>({...previous(),contentTop:document.querySelector('#profileEditorScroll')?.scrollTop,profileHeading:document.querySelector('#personalTitle')?.getBoundingClientRect().toJSON(),footer:document.querySelector('.settings-edit-actions')?.getBoundingClientRect().toJSON()});});
  assert.equal(await p.evaluate(()=>document.activeElement.id),'profilePageTitle');assert.equal(await p.locator('#profilePageTitle').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
  assert.ok((await p.evaluate(()=>profileFrames)).every(f=>f.outline==='none'),'no first-frame heading ring');
  await p.keyboard.press('Tab');assert.notEqual(await p.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none','keyboard control focus remains visible');await shot('summary');
  report.summary=await p.evaluate(()=>({innerPadding:getComputedStyle(document.querySelector('#profileSettings')).paddingBottom,navClearance:getComputedStyle(document.querySelector('.main-content')).paddingBottom}));assert.equal(report.summary.innerPadding,'16px');
  const form=p.locator('#profileForm'),scroller=p.locator('#profileEditorScroll');let baseline;
  const check=(m,label)=>{
   for(const key of ['y','scrollTop'])assert.ok(Math.abs(m[key]-baseline[key])<=.75,`${label} ${key}: ${baseline[key]} -> ${m[key]}`);
   // The shared lock compensates visualViewport pan. Compare visual positions,
   // not layout-viewport y coordinates, exactly as the current Weight gate does.
   for(const s of ['.topbar','#profileSettingsOverview','.mobile-tabbar'])for(const key of ['x','y','width','height']){const pan=key==='y'&&s!=='.mobile-tabbar'?m.viewportTop-baseline.viewportTop:0;const d=Math.abs(m.landmarks[s][key]-baseline.landmarks[s][key]-pan);report.maxParentDrift=Math.max(report.maxParentDrift,d);assert.ok(d<=.75,`${label} ${s}.${key}: ${baseline.landmarks[s][key]} -> ${m.landmarks[s][key]} (pan ${pan})`);}
   assert.ok(Math.abs(m.profileHeading.y-m.viewportTop-baseline.profileHeading.y+baseline.viewportTop)<=.75,`${label} section heading`);
  };
  const open=async section=>{
   stage=`open ${section}`;await p.evaluate(section=>{window.parentBeforeSheet=null;const capture=e=>{if(e.target.closest(`[data-edit-settings=${section}]`)){parentBeforeSheet=sheetMetrics();document.removeEventListener('click',capture,true);}};document.addEventListener('click',capture,true);},section);
   await p.locator(`[data-edit-settings=${section}]`).click();baseline=await p.evaluate(()=>parentBeforeSheet);await settle(p);
   (report.openings||=[]).push({section,before:baseline,after:await metrics(p),layout:await p.evaluate(()=>({innerWidth,clientWidth:document.documentElement.clientWidth,rootOverflow:getComputedStyle(document.documentElement).overflow,rootGutter:getComputedStyle(document.documentElement).scrollbarGutter,body:document.body.getBoundingClientRect().toJSON()}))});
   check(await metrics(p),'opened');assert.equal(await p.locator('.mobile-tabbar').evaluate(e=>e.inert),true);assert.equal(await p.evaluate(()=>document.body.style.position),'fixed');
   report.heights[section]=(await form.boundingBox()).height;await shot(section);
  };
  const closed=async()=>{await form.waitFor({state:'hidden'});await settle(p);check(await metrics(p),'closed');assert.equal(await p.evaluate(()=>document.body.style.position),'');assert.equal(await p.evaluate(()=>document.documentElement.style.overflowY),'');};
  const swipe=async(selector,options={})=>{
   stage=`swipe ${selector}`;const before=await p.evaluate(()=>({values:[...document.querySelectorAll('#profileForm input')].map(e=>[e.id||e.name,e.value,e.checked]),clicks:qaEvents.filter(e=>e.type==='click').length}));
   const samples=await touch(p,engine,selector,{steps:12,delay:18,...options});samples.forEach(m=>check(m,selector));check(await metrics(p),selector+' end');
   assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('#profileForm input')].map(e=>[e.id||e.name,e.value,e.checked])),before.values,'swipe does not edit/select control');
   assert.equal(await p.evaluate(()=>qaEvents.filter(e=>e.type==='click').length),before.clicks,'no accidental activation');
   report.gestures.push({selector,options,samples});return samples;
  };
  await open('personal');
  // Downward input-origin movement previously had no gesture owner at all.
  let s=await swipe('#profileName',{distance:36,hold:140});assert.ok(s.some(m=>m.owner==='drag'));assert.equal(await form.isVisible(),true);
  await p.locator('#profileName').tap();assert.equal(await p.evaluate(()=>document.activeElement.id),'profileName');await p.locator('#profileName').fill('Retained draft');
  await keyboard(p,390,40,390);check(await metrics(p),'keyboard');await shot('personal-keyboard');
  // Test real scrollable form content from each child origin. WebKit Windows
  // uses synthetic continuous touch + actual native keyboard overflow scroll.
  for(const selector of ['#profileName','[name=profileSexChoice][value=female]','#profileAge','#profileEditorScroll']){
   await scroller.evaluate(e=>e.scrollTop=0);await p.locator(selector).scrollIntoViewIfNeeded();await settle(p);check(await metrics(p),'inner reveal');
   const prior=await scroller.evaluate(e=>e.scrollTop);s=await swipe(selector,{distance:-65});assert.ok(s.every(m=>!m.translate));
   if(engine==='chromium')assert.ok(s.some(m=>m.contentTop>prior),'native scroll from '+selector);
   else {await p.keyboard.press('PageDown');await settle(p);assert.ok(await scroller.evaluate(e=>e.scrollTop)>0);check(await metrics(p),'WebKit native overflow');}
  }
  await scroller.evaluate(e=>e.scrollTop=e.scrollHeight);s=await swipe('#profileHeight',{distance:-75});assert.ok(s.every(m=>!m.translate));
  await scroller.evaluate(e=>e.scrollTop=70);s=await swipe('#profileEditorScroll',{distance:90});assert.ok(s.every(m=>!m.translate),'scrolled content not also dragged');
  s=await swipe('#profileSubmitButton',{distance:-60});assert.ok(s.every(m=>!m.translate),'footer upward clamps');
  await closeKeyboard(p);await settle(p);check(await metrics(p),'keyboard closed');assert.equal(await p.locator('#profileName').inputValue(),'Retained draft');
  await scroller.evaluate(e=>e.scrollTop=0);await swipe('[name=profileSexChoice][value=female]',{distance:35,hold:140});assert.equal(await p.locator('[name=profileSexChoice][value=male]').isChecked(),true);
  await p.locator('[name=profileSexChoice][value=female]').tap();assert.equal(await p.locator('[name=profileSexChoice][value=female]').isChecked(),true);
  await swipe('#profileCancelButton',{distance:35,hold:140});assert.equal(await form.isVisible(),true);
  await swipe('#profileSheetHandle',{distance:165});await closed();assert.equal(await p.evaluate(()=>localStorage.getItem('calorie-counter-state')),original);
  await open('personal');assert.equal(await p.locator('#profileName').inputValue(),'QA');await p.locator('#profileCancelButton').tap();await closed();
  await open('schedule');
  const input=p.locator('#profileBreakfastEnd');const rect=await input.boundingBox();assert.equal(rect.width,116);assert.ok(rect.height>=44);assert.equal(await input.getAttribute('type'),'time');
  await input.tap();assert.equal(await p.evaluate(()=>document.activeElement.id),'profileBreakfastEnd');await p.locator('#profileFormTitle').tap();
  await swipe('#profileBreakfastEnd',{distance:-80});await swipe('#profileLunchEnd',{distance:35,hold:140});assert.equal(await form.isVisible(),true);
  await input.fill('09:30');await p.locator('#mealScheduleReset').tap();assert.equal(await input.inputValue(),'11:00');await p.locator('#profileCancelButton').tap();await closed();assert.equal(await p.evaluate(()=>localStorage.getItem('calorie-counter-state')),original);
  await open('appearance');
  await swipe('[name=profileThemeChoice][value=light]',{distance:35,hold:140});assert.equal(await p.locator('[name=profileThemeChoice][value=light]').isChecked(),theme==='light');
  await swipe('[name=profileThemeChoice][value=dark]',{distance:-80});await p.locator('[name=profileThemeChoice][value=system]').tap();assert.equal(await p.locator('[name=profileThemeChoice][value=system]').isChecked(),true);
  await swipe('#profileSheetHandle',{distance:165});await closed();assert.ok(report.heights.appearance<report.heights.personal);assert.notEqual(report.heights.schedule,report.heights.personal);
  stage='plan visual / target semantics';await p.evaluate(()=>{const capture=e=>{if(e.target.closest('[data-edit-settings=plan]')){window.planBeforeOpen=sheetMetrics();document.removeEventListener('click',capture,true);}};document.addEventListener('click',capture,true);});
  await p.locator('[data-edit-settings=plan]').click();baseline=await p.evaluate(()=>planBeforeOpen);await settle(p);assert.equal(await form.getAttribute('data-presentation'),'page');await shot('plan-top');
  await p.locator('#profileActivity').scrollIntoViewIfNeeded();await shot('plan-middle');await p.locator('#goalEditor').scrollIntoViewIfNeeded();await shot('plan-targets');
  const targets=await p.locator('.settings-targets input').evaluateAll(nodes=>nodes.map(e=>({rect:e.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(e).fontSize),sw:e.scrollWidth,cw:e.clientWidth})));assert.equal(targets.length,4);for(const t of targets){assert.ok(Math.abs(t.rect.width-targets[0].rect.width)<1);assert.equal(t.rect.height,48);assert.ok(t.font>=16);assert.ok(t.sw<=t.cw+1);}
  const actions=await p.locator('.settings-target-actions button').evaluateAll(nodes=>nodes.map(e=>({rect:e.getBoundingClientRect().toJSON(),font:parseFloat(getComputedStyle(e).fontSize),sw:e.scrollWidth,cw:e.clientWidth})));assert.equal(actions[0].rect.width,actions[1].rect.width);assert.equal(actions[0].rect.height,actions[1].rect.height);assert.ok(actions[1].rect.y>=actions[0].rect.bottom+8);report.targets={targets,actions};
  await p.locator('#goalEditButton').click();assert.equal(await p.locator('#goalCalories').getAttribute('readonly'),null);await p.locator('#goalCalories').fill('2250');await p.locator('#goalResetButton').click();await p.locator('#profileEditBack').click();await closed();
  assert.equal(await p.evaluate(()=>localStorage.getItem('calorie-counter-state')),original);
  await p.locator('.mobile-tabbar a[href="index.html"]').click();await p.locator('.day-tile').first().waitFor();await p.locator('.mobile-tabbar a[href="profile.html"]').click();await p.locator('#profileSettingsOverview').waitFor();assert.equal(await p.evaluate(()=>scrollY),0);
  assert.deepEqual(await p.evaluate(()=>qaErrors),[]);report.result='PASS';console.log('PASS Profile/control gestures',tag);results.push(report);
 }catch(error){report.result='FAIL';report.stage=stage;report.error=error.stack;results.push(report);await p.screenshot({path:`${dir}/failure.png`}).catch(()=>{});throw error;}
 finally{await writeFile(`${dir}/result.json`,JSON.stringify(report,null,2));await c.close();await b.close();}
}
async function worker(){while(next<jobs.length)await run(jobs[next++]);}
try{await Promise.all(Array.from({length:4},worker));}finally{await writeFile(`${out}/matrix.json`,JSON.stringify(results.map(({gestures,...r})=>({...r,gestures:gestures.map(g=>({selector:g.selector,options:g.options}))})),null,2));}
