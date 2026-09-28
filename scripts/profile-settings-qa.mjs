import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pwaPhones, preparePwa, preparePwaPage } from './pwa-qa-context.mjs';
import { calculateRecommendedGoals } from '../public/profile.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const base=process.env.INTAKE_URL || 'http://127.0.0.1:3002';
const output=process.env.INTAKE_QA_OUTPUT||'artifacts/profile-settings';mkdirSync(output,{recursive:true});
const results=[];
async function fixture(viewport,theme,goal='lose',offline=false) {
  const context=await browser.newContext({viewport,hasTouch:viewport.width<700,isMobile:viewport.width<700,colorScheme:theme,reducedMotion:'reduce',serviceWorkers:offline?'allow':'block',acceptDownloads:true});
  await preparePwa(context,viewport.width);
  await context.addInitScript(({theme,goal})=>{
    if(sessionStorage.getItem('profile-qa-seeded'))return;sessionStorage.setItem('profile-qa-seeded','1');
    const d=new Date(),today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    localStorage.setItem('calorie-counter-state',JSON.stringify({user:{name:goal==='maintain'?'':goal==='gain'?'LongName'.repeat(32):'Alex',sex:'male',age:30,heightCm:180,weightKg:80,targetWeightKg:goal==='gain'?85:goal==='maintain'?80:70,goalType:goal,activityMultiplier:1.375,weeklyRateKg:goal==='maintain'?0:.5,theme},goals:{calories:2000,protein:140,carbs:240,fat:60},goalsAreCustom:true,theme,progress:[{id:'weight-now',date:today,weightKg:80}],days:{[today]:{foods:[{id:'food',name:'QA oats',meal:'lunch',calories:200,protein:10,carbs:30,fat:4}],exercises:[]}}}));
    for(const key of ['food-library','saved-foods','saved-meals','assistant-conversations-v1']) localStorage.setItem(`calorie-counter-${key}`,'[]');
    localStorage.setItem('calorie-counter-ai-consent-v1',JSON.stringify({assistant:true}));localStorage.setItem('unrelated-qa','keep');
  },{theme,goal});
  const page=await context.newPage();await preparePwaPage(page);page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/profile.html`);await page.locator('#profileSettingsOverview').waitFor({state:'visible'});
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('calorie-counter-state')));
  const all=()=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('calorie-counter-')||key.startsWith('daily-fuel-')).map(key=>[key,localStorage.getItem(key)])));
  const shot=async name=>{if(viewport.width===390&&goal==='lose')await page.screenshot({path:`${output}/${name}-${theme}-390.png`});};
  return {context,page,errors,read,all,shot};
}
async function bounds(page,selectors=[]) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
  for(const selector of selectors) {
    const el=page.locator(selector);await el.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    const r=await el.boundingBox(),nav=await page.locator('.mobile-tabbar').evaluate(e=>e.inert?null:e.getBoundingClientRect().toJSON());
    assert.ok(r && r.x>=-1 && r.x+r.width<=page.viewportSize().width+1,`horizontal clipping ${selector}: ${JSON.stringify(r)}`);
    assert.ok(r.y>=0 && r.y+r.height<=(nav?.y || page.viewportSize().height)+1,`nav coverage ${selector}: ${JSON.stringify({r,nav})}`);
  }
}
async function enter(page,name){await page.locator(`[data-edit-settings=${name}]`).click();await page.locator(`#profileForm fieldset[data-settings-fields=${name}]`).waitFor({state:'visible'});}
async function save(page){await page.locator('#profileSubmitButton').click();await page.locator('#profileSettings[data-profile-view=summary]').waitFor();}
const selectedPhones=process.env.PROFILE_QA_WIDTH?pwaPhones.filter(p=>p.width===Number(process.env.PROFILE_QA_WIDTH)):pwaPhones;
try{
  for(const viewport of selectedPhones)for(const theme of ['light','dark'])for(const goal of (process.env.PROFILE_QA_GOAL?[process.env.PROFILE_QA_GOAL]:['lose','maintain','gain'])) {
    const f=await fixture(viewport,theme,goal),{page,context,read,all,shot}=f;
    const original=await read();assert.equal(await page.locator('#profileForm').isVisible(),false);assert.equal(await page.locator('#planCalories').textContent(),'2,000');
    await enter(page,'personal');await page.locator('#profileName').fill('Back cancels');await page.locator('#profileEditBack').click();assert.deepEqual(await read(),original);
    assert.equal(await page.locator('#profileSettingsOverview input:visible').count(),0);await bounds(page);await shot('summary');
    await enter(page,'plan');assert.equal(await page.locator('#profileTargetWeight').isVisible(),goal!=='maintain');assert.equal(await page.locator('#profileGoalPace').isVisible(),goal!=='maintain');
    assert.equal(await page.locator('#profileName').isVisible(),false);await shot('edit-plan');
    await page.locator('#profileWeight').fill('');await page.locator('#profileSubmitButton').click();assert.equal(await page.locator('#profileWeight').getAttribute('aria-invalid'),'true');assert.equal(await page.evaluate(()=>document.activeElement.id),'profileWeight');assert.deepEqual(await read(),original);
    await page.locator('#profileWeight').fill('80,5');await page.setViewportSize({width:viewport.width,height:480});await bounds(page,['#profileWeight','#profileCancelButton','#profileSubmitButton']);
    const cancelRect=await page.locator('#profileCancelButton').boundingBox(),saveRect=await page.locator('#profileSubmitButton').boundingBox();assert.ok(Math.abs(cancelRect.y-saveRect.y)<1,'edit actions must align');assert.ok(saveRect.height>=44&&cancelRect.height>=44);
    await shot('keyboard-actions');await bounds(page,['#profileWeight']);await page.locator('#profileWeight').focus();await shot('keyboard-edit');
    await page.locator('#profileCancelButton').click();assert.deepEqual(await read(),original);assert.equal(await page.evaluate(()=>document.activeElement.dataset.editSettings),'plan');
    await page.setViewportSize(viewport);await enter(page,'plan');await page.locator('#profileWeight').fill('80,5');await save(page);
    let stored=await read();assert.equal(stored.user.weightKg,80.5);assert.equal(stored.progress.length,1);assert.equal(stored.progress[0].id,'weight-now');assert.deepEqual(stored.goals,original.goals);assert.deepEqual(stored.days,original.days);
    await enter(page,'plan');await page.locator('#goalResetButton').click();assert.match(await page.locator('#profileTargetChange').textContent(),/Saving will update/);await save(page);
    stored=await read();const expected=calculateRecommendedGoals(stored.user);assert.equal(stored.goals.calories,expected.calories);assert.equal(stored.goalsAreCustom,false);
    await enter(page,'plan');await page.locator('#profileGoalType').selectOption('maintain');assert.equal(await page.locator('#profileTargetWeight').isVisible(),false);await page.locator('#profileGoalType').selectOption('gain');assert.equal(await page.locator('#profileTargetWeight').isVisible(),true);assert.equal(await page.locator('#profileGoalPace').inputValue(),'0.5');await page.keyboard.press('Escape');assert.deepEqual(await read(),stored);
    await enter(page,'personal');await page.locator('#profileName').fill('');await page.locator('#profileAge').fill('17');await page.locator('#profileSubmitButton').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'profileAge');
    await page.locator('#profileAge').fill('31');await page.locator('#profileHeight').fill('119');await page.locator('#profileSubmitButton').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'profileHeight');
    await page.locator('#profileHeight').fill('181');await page.locator('#profileForm').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await shot('personal-edit');
    const previousWeightHistory=stored.progress;await save(page);stored=await read();assert.equal(stored.user.name,'');assert.equal(stored.user.age,31);assert.deepEqual(stored.progress,previousWeightHistory);
    await enter(page,'personal');await page.locator('#profileName').fill('Keep this draft');await page.evaluate(()=>window.IntakeNavigate('index.html'));assert.match(page.url(),/profile.html/);assert.equal(await page.locator('#profileForm').isVisible(),true);assert.equal(await page.locator('#profileName').inputValue(),'Keep this draft');assert.deepEqual(await read(),stored);await page.locator('#profileCancelButton').click();
    await enter(page,'schedule');await shot('meal-schedule');await page.locator('#profileBreakfastEnd').fill('17:00');await page.locator('#profileSubmitButton').click();assert.equal(await page.locator('#profileLunchEnd').getAttribute('aria-invalid'),'true');
    await page.setViewportSize({width:viewport.width,height:480});await bounds(page,['#profileBreakfastEnd','#profileLunchEnd','#profileCancelButton','#profileSubmitButton']);
    await page.locator('#profileBreakfastEnd').fill('09:30');await page.locator('#profileLunchEnd').fill('14:30');await save(page);stored=await read();assert.deepEqual(stored.user.mealSchedule,{breakfastEnd:'09:30',lunchEnd:'14:30'});assert.deepEqual(stored.days,original.days);await page.setViewportSize(viewport);
    await enter(page,'schedule');await page.locator('#mealScheduleReset').click();assert.equal(await page.locator('#profileBreakfastEnd').inputValue(),'11:00');await page.locator('#profileCancelButton').click();assert.deepEqual(await read(),stored);
    await enter(page,'appearance');await shot('appearance');await page.locator('[name=profileThemeChoice][value=system]').check();await page.locator('#profileCancelButton').click();assert.deepEqual(await read(),stored);assert.equal(await page.locator('body').getAttribute('data-theme'),theme);
    await enter(page,'appearance');await page.locator('[name=profileThemeChoice][value=system]').check();await save(page);const beforeOS=await read();
    await page.emulateMedia({colorScheme:theme==='light'?'dark':'light'});await page.waitForFunction(expected=>document.body.dataset.theme===expected,theme==='light'?'dark':'light');assert.deepEqual(await read(),beforeOS);
    for(const [path,selector] of [['index.html','#calendarStrip .day-tile'],['assistant.html','#assistantInput'],['progress.html','#progressChart'],['profile.html','#profileSettingsOverview']]) {
      await page.locator(`.mobile-tabbar a[href="${path}"]`).click();await page.locator(selector).first().waitFor({state:'visible'});
      assert.equal(await page.locator('body').getAttribute('data-theme'),theme==='light'?'dark':'light');
    }
    for(const choice of ['light','dark',theme]) {await enter(page,'appearance');await page.locator(`[name=profileThemeChoice][value=${choice}]`).check();await save(page);assert.equal(await page.locator('body').getAttribute('data-theme'),choice);await bounds(page);}
    await page.locator('.mobile-tabbar a[href="index.html"]').click();await page.locator('#calendarStrip .day-tile').first().waitFor();assert.equal(await page.locator('body').getAttribute('data-theme'),theme);await page.locator('.mobile-tabbar a[href="profile.html"]').click();await page.locator('#profileSettingsOverview').waitFor({state:'visible'});
    await page.locator('#profilePrivacyOpen').click();await bounds(page,['#privacyControls [data-action=export]','#privacyControls [data-action=import]','#privacyControls [data-action=erase]']);await shot('data-privacy');
    const downloading=page.waitForEvent('download');await page.locator('[data-action=export]').click();assert.match((await downloading).suggestedFilename(),/intake-backup/);
    const beforeDelete=await all();await page.locator('[data-action=erase]').click();await page.locator('#deleteDataConfirm').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>document.activeElement.value),'cancel');await shot('delete-confirm');
    const dialog=await page.locator('#deleteDataConfirm').boundingBox();assert.ok(dialog.y>=0&&dialog.y+dialog.height<=viewport.height);await page.locator('#deleteDataConfirm button[value=cancel]').click();assert.deepEqual(await all(),beforeDelete);
    await page.locator('[data-action=erase]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#deleteDataConfirm').isVisible(),false);assert.deepEqual(await all(),beforeDelete);
    await page.locator('#privacyControls input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.getByText(/Restore failed:/).waitFor();assert.deepEqual(await all(),beforeDelete);
    const backup=await page.evaluate(async()=>JSON.parse((await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/privacy-controls.js').name)).storage.export()));const backupState=JSON.parse(backup.data['calorie-counter-state']);backupState.user.name='Restored QA';backup.data['calorie-counter-state']=JSON.stringify(backupState);
    page.once('dialog',d=>d.accept());const reload=page.waitForEvent('load');await page.locator('#privacyControls input[type=file]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await reload;await page.locator('#profileSettingsOverview').waitFor({state:'visible'});assert.equal((await read()).user.name,'Restored QA');
    await page.locator('#profilePrivacyOpen').click();await page.locator('[data-action=erase]').click();const cleared=page.waitForEvent('load');await page.locator('#deleteDataConfirmButton').click();await cleared;await page.locator('#onboarding[data-step="0"]').waitFor({state:'visible'});
    assert.equal((await read())?.user ?? null,null);assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-qa')),'keep');assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>/calorie-counter-(saved|food-library|assistant|ai-consent)/.test(k)).length),0);
    assert.deepEqual(f.errors,[]);results.push({...viewport,theme,goal,result:'PASS'});console.log(`PASS ${viewport.width}x${viewport.height} ${theme} ${goal}`);await context.close();
  }
  const d=await fixture({width:1280,height:900},'light');await enter(d.page,'personal');await d.page.locator('#profileName').fill('Desktop QA');await save(d.page);assert.equal((await d.read()).user.name,'Desktop QA');await bounds(d.page);await d.page.locator('.side-nav a[href="assistant.html"]').click();await d.page.locator('#assistantTitle').waitFor({state:'visible'});assert.deepEqual(d.errors,[]);await d.context.close();results.push({desktop:'regression only',result:'PASS'});
  const o=await fixture({width:390,height:844},'dark','lose',true);await o.page.evaluate(()=>navigator.serviceWorker.ready);await o.page.reload();await o.page.locator('#profileSettingsOverview').waitFor({state:'visible'});await o.context.setOffline(true);await o.page.reload();await o.page.locator('#profileSettingsOverview').waitFor({state:'visible'});await enter(o.page,'personal');await o.page.locator('#profileName').fill('Offline QA');await save(o.page);assert.equal((await o.read()).user.name,'Offline QA');assert.deepEqual(o.errors,[]);await o.context.close();results.push({offline:'cold reload/edit/save',result:'PASS'});
  for(const mode of ['quota','conflict']) {
    const f=await fixture({width:390,height:844},'light'),{page,read}=f,original=await read();await enter(page,'personal');await page.locator('#profileName').fill('Recover this edit');
    if(mode==='quota') await page.evaluate(()=>{
      const native=Storage.prototype.setItem;window.profileQaNativeSet=native;window.profileQaWrites=0;
      Storage.prototype.setItem=function(key,value){if(key==='calorie-counter-state'){window.profileQaWrites++;if(!window.profileQaAllowWrite)throw new DOMException('Full','QuotaExceededError');}return native.call(this,key,value);};
    });
    else await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('calorie-counter-state'));state.user.name='Other window';localStorage.setItem('calorie-counter-state',JSON.stringify(state));});
    const nativeBefore=await read();await page.locator('#profileSubmitButton').click();await page.locator('#profileSaveError').waitFor({state:'visible'});
    assert.equal(await page.locator('#profileName').inputValue(),'Recover this edit');assert.deepEqual(await read(),nativeBefore);
    await page.locator('#profileSubmitButton').click();assert.deepEqual(await read(),nativeBefore);
    const recovery=await page.evaluate(async()=>JSON.parse(JSON.parse((await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/privacy-controls.js').name)).storage.export()).data['calorie-counter-state']));
    if(mode==='quota') {
      assert.deepEqual(recovery,original);await page.locator('#profileCancelButton').click();assert.deepEqual(await read(),original);
      await enter(page,'personal');await page.locator('#profileName').fill('Saved once');await page.evaluate(()=>{window.profileQaAllowWrite=true;window.profileQaWrites=0;document.querySelector('#profileForm').requestSubmit();document.querySelector('#profileForm').requestSubmit();});
      await page.locator('#profileSettingsOverview').waitFor({state:'visible'});assert.equal((await read()).user.name,'Saved once');assert.equal(await page.evaluate(()=>window.profileQaWrites),1);
    } else {
      assert.equal(recovery.user.name,'Recover this edit');await page.locator('#profileCancelButton').click();await page.locator('#profilePrivacyOpen').click();await page.locator('[data-action=retry]').click();assert.deepEqual(await read(),nativeBefore);
    }
    assert.deepEqual(f.errors,[]);await f.context.close();results.push({storage:mode,result:'PASS'});
  }
  writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));console.log(`PASS ${results.length} Profile scenarios.`);
}finally{await browser.close();}
