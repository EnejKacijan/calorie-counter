// Real validation and focus flows supplement the computed-style state matrix.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,base,read} from './add-flow-harness.mjs';
import {settle} from './edge-row-harness.mjs';
const out=process.env.INTAKE_QA_OUTPUT||'artifacts/form-focus';await mkdir(out,{recursive:true});const results=[];
for(const engine of ['chromium','webkit']){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{}),{p,c}=await setup(b,{engine,theme:'dark'}),checks=[];
 async function error(selector){const el=p.locator(selector);assert.equal(await el.getAttribute('aria-invalid'),'true');assert.equal(await el.evaluate(e=>document.activeElement===e),true);const paint=await el.evaluate(e=>({shadow:getComputedStyle(e).boxShadow,border:getComputedStyle(e).borderBottomColor}));checks.push({error:selector,...paint});return paint;}
 try{
  await p.locator('#floatingAddButton').click();await settle(p);await p.locator('#manualFoodName').fill('banana');
  await p.locator('.ux-search-clear').waitFor();await p.keyboard.press('Tab');await p.locator('.ux-search-clear').focus();
  const clearFocus=await p.locator('.ux-search-clear').evaluate(e=>({focused:e.matches(':focus-visible'),outline:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth}));
  assert.ok(clearFocus.focused&&clearFocus.outline!=='none'&&parseFloat(clearFocus.width)>0,'search clear retains its own keyboard cue');checks.push({clearFocus});
  await p.locator('.ux-search-clear').click();await p.locator('#manualFoodShortcut').click();await settle(p);
  await p.locator('#manualFoodSubmit').tap();await error('#manualFoodName');assert.ok((await p.locator('#manualFoodNameError').innerText()).trim());
  await p.locator('#manualFoodName').tap();await p.keyboard.type('Focus test food');assert.equal(await p.locator('#manualFoodName').getAttribute('aria-invalid'),null);assert.equal(await p.evaluate(()=>document.documentElement.hasAttribute('data-intake-touch')),true);
  for(const [id,value]of Object.entries({foodAmount:'.5',manualFoodCalories:'100',manualFoodProtein:'5',manualFoodCarbs:'12',manualFoodFat:'3'}))await p.locator('#'+id).fill(value);
  await p.locator('#manualFoodSubmit').tap();await settle(p);assert.equal(Object.values((await read(p)).days).flatMap(d=>d.foods).length,1);checks.push({manualSave:true});
  await p.goto(base+'/profile.html');await p.locator('#profileSettingsOverview').waitFor();await p.locator('[data-edit-settings=personal]').click();await settle(p);await p.locator('#profileAge').fill('17');await p.locator('#profileSubmitButton').tap();await error('#profileAge');
  await p.locator('#profileAge').fill('30');await p.locator('#profileSubmitButton').tap();await settle(p);checks.push({profileSave:true});
  await p.goto(base+'/progress.html');await p.locator('#weightLogJump').click();await settle(p);await p.locator('#progressWeight').fill('0');await p.locator('#weightSave').tap();await error('#progressWeight');
  await p.locator('#progressWeight').fill('74.5');await p.locator('#weightSave').tap();await settle(p);assert.ok((await read(p)).progress.some(w=>w.weightKg===74.5));checks.push({weightSave:true});
  await p.evaluate(()=>{localStorage.setItem('calorie-counter-state',JSON.stringify({user:null,days:{},theme:'dark'}));sessionStorage.setItem('calorie-counter-onboarding-draft-v1',JSON.stringify({step:2,draft:{goalType:'lose',sex:'male',age:'17',heightCm:'180',weightKg:'75',targetWeightKg:'70',activityMultiplier:'1.55',weeklyRateKg:'.5'}}));});
  await p.goto(base+'/profile.html');await p.locator('#onboarding-age').waitFor();await p.locator('#onboarding button[type=submit]').tap();await error('#onboarding-age');assert.ok(await p.locator('.onboarding-error:not([hidden])').count());
  results.push({engine,pass:true,checks});console.log('PASS',engine,checks.length,'search focus / actual validation / Save checks');
 }catch(e){await p.screenshot({path:out+'/integration-failure-'+engine+'.png'});throw e;}
 finally{await c.close();await b.close();await writeFile(out+'/integration.json',JSON.stringify(results,null,2));}
}
