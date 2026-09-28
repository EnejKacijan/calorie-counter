import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pwaPhones,preparePwa,preparePwaPage} from './pwa-qa-context.mjs';
import {calculateRecommendedGoals} from '../public/profile.js';
import {onboardingProfile} from '../public/onboarding.js';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.INTAKE_URL||'http://127.0.0.1:3002',out=process.env.INTAKE_QA_OUTPUT||'artifacts/onboarding-flow';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[],geometry=[],diagnostics=[];let active,stage='';
const answers=goalType=>({goalType,sex:'male',age:'21',heightCm:'183',weightKg:'83',targetWeightKg:goalType==='gain'?'86':'80',activityMultiplier:'1.55',weeklyRateKg:'0.5'});
const stateKey='calorie-counter-state',draftKey='calorie-counter-onboarding-draft-v1',cta='#onboarding button[type=submit]';
const next=p=>p.locator(cta).click();
const input=(p,key)=>p.locator('#onboarding [name="'+key+'"]');
async function settle(p){await p.waitForFunction(()=>!document.querySelector('#onboarding .onboarding-primary')?.disabled);await p.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});}
async function screen(p,n){
 await p.locator('#onboarding[data-step="'+n+'"]').waitFor();await settle(p);
 assert.equal(await p.locator('.onboarding-progress').getAttribute('aria-valuenow'),String(n*25));
 const track=await p.evaluate(()=>{const e=document.querySelector('.onboarding-progress');window.qaTrack||=e;return{same:qaTrack===e,ratio:e.firstElementChild.getBoundingClientRect().width/e.getBoundingClientRect().width,substeps:document.querySelector('.onboarding-step').textContent};});
 assert.equal(track.same,true);assert.ok(Math.abs(track.ratio-n/4)<.003);assert.ok(!track.substeps.includes('of 4'));
 if(await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches))assert.equal(await p.locator('.onboarding-content').evaluate(e=>e.getAnimations().length),0);
}
async function choose(p,key,value){await p.locator('.onboarding-choice').filter({has:p.locator('input[name="'+key+'"][value="'+value+'"]')}).click();assert.ok(await p.locator('[name="'+key+'"][value="'+value+'"]').isChecked());}
async function bounds(p,field){
 await settle(p);const g=await p.evaluate(field=>{
  const rect=e=>e.getBoundingClientRect().toJSON(),root=document.querySelector('#onboarding'),content=root.querySelector('.onboarding-content'),button=root.querySelector('button[type=submit]');
  const input=field?root.querySelector('[name="'+field+'"]'):null;
  return{step:root.dataset.step,innerHeight,scrollY,vv:{height:visualViewport.height,top:visualViewport.offsetTop},root:rect(root),content:rect(content),header:rect(root.querySelector('.onboarding-orientation')),footer:rect(root.querySelector('.onboarding-footer')),button:rect(button),field:input?rect(input.closest('.onboarding-field')):null,inputFont:input?parseFloat(getComputedStyle(input).fontSize):null,pageOverflow:document.documentElement.scrollWidth>innerWidth,contentOverflow:content.scrollWidth>content.clientWidth+1,progress:root.querySelector('[role=progressbar]').getAttribute('aria-valuenow')};
 },field);
 assert.ok(!g.pageOverflow&&!g.contentOverflow,JSON.stringify(g));assert.ok(Math.abs(g.root.top-g.vv.top)<1&&Math.abs(g.root.height-g.vv.height)<1,JSON.stringify(g));
 assert.ok(g.button.height>=44&&g.footer.bottom<=g.vv.top+g.vv.height+1&&g.footer.top>=g.content.top,JSON.stringify(g));
 // Welcome intentionally caps its composition instead of stretching the
 // questionnaire content to fill a tall viewport. Later form steps anchor.
 if(g.step!=='0')assert.ok(Math.abs(g.footer.bottom-(g.vv.top+g.vv.height))<1,`footer anchored at viewport bottom: ${JSON.stringify({stage,g})}`);
 if(field){assert.ok(g.field.top>=g.content.top-1&&g.field.bottom<=g.content.bottom+1,JSON.stringify(g));assert.ok(g.inputFont>=16);}
 const sizes=await p.locator('#onboarding button:visible,#onboarding .onboarding-choice').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));for(const r of sizes)assert.ok(r.width>=44&&r.height>=44);
 geometry.push({stage,...g});
}
async function viewport(p,height,top){await p.evaluate(({height,top})=>{Object.defineProperties(visualViewport,{height:{configurable:true,get:()=>height},offsetTop:{configurable:true,get:()=>top}});visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));}, {height,top});await settle(p);}
async function restoreViewport(p){await p.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});await settle(p);}
async function setup({width=390,height=844,theme='light',missing=false,seed=null,old=null,video=false,origin=base}={}){
 const c=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,colorScheme:theme,reducedMotion:theme==='dark'?'reduce':'no-preference',serviceWorkers:'block',...(video?{recordVideo:{dir:out+'/videos',size:{width,height}}}:{})});await preparePwa(c,width);
 await c.addInitScript(({seed,old,missing,stateKey,draftKey})=>{
  if(missing)Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
  if(!sessionStorage.getItem('qaSeeded')){if(seed)localStorage.setItem(stateKey,JSON.stringify(seed));if(old)sessionStorage.setItem(draftKey,JSON.stringify(old));sessionStorage.setItem('qaSeeded','1');}
  window.qaWrites=[];window.qaNavigations=[];const write=Storage.prototype.setItem,push=history.pushState,replace=history.replaceState;
  Storage.prototype.setItem=function(k,v){if(window.qaFailStorage&&k===stateKey)throw new DOMException('Injected failure','QuotaExceededError');const result=write.call(this,k,v);if(this===localStorage&&k===stateKey)qaWrites.push(k);return result;};
  history.pushState=function(...args){qaNavigations.push({kind:'push',url:String(args[2]),writes:qaWrites.length});return push.apply(this,args);};
  history.replaceState=function(...args){qaNavigations.push({kind:'replace',url:String(args[2]),writes:qaWrites.length});return replace.apply(this,args);};
 },{seed,old,missing,stateKey,draftKey});
 const p=await c.newPage();active=p;p.setDefaultTimeout(10000);await preparePwaPage(p);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error'&&m.text().startsWith('Onboarding completion failed'))diagnostics.push(m.text());});
 await p.goto(origin+'/index.html');return{c,p,errors};
}
async function fillBasics(p,d){await choose(p,'sex',d.sex);for(const key of ['age','heightCm','weightKg',...(d.goalType==='maintain'?[]:['targetWeightKg'])])await input(p,key).fill(d[key]);}
async function toTarget(p,d){await screen(p,0);await next(p);await screen(p,1);await choose(p,'goalType',d.goalType);await next(p);await screen(p,2);await fillBasics(p,d);await next(p);await screen(p,3);await choose(p,'activityMultiplier',d.activityMultiplier);if(d.goalType!=='maintain')await choose(p,'weeklyRateKg',d.weeklyRateKg);await next(p);await screen(p,4);}
async function finish(p,d,theme,adjust=false){
 const expected=calculateRecommendedGoals(onboardingProfile(d,theme,{breakfastEnd:'11:00',lunchEnd:'16:00'}));
 assert.equal(await p.locator('.onboarding-calories strong').textContent(),String(expected.calories));
 const summary=await p.locator('.onboarding-summary').textContent();assert.ok(summary.includes('21 years · 183 cm · 83 kg'));
 if(adjust){
  await p.locator('[data-onboarding-adjust]').click();await p.locator('#onboarding[data-target-editing=true]').waitFor();
  assert.ok(await input(p,'calories').isEditable());assert.equal(await input(p,'calories').inputValue(),String(expected.calories));
  assert.equal(await p.locator('.mobile-tabbar').isVisible(),false);assert.equal(await p.evaluate(()=>qaWrites.length),0);await bounds(p,'calories');
  if(d.goalType==='lose')await p.screenshot({path:out+'/adjust-targets-'+theme+'-390.png'});
  await next(p);await p.locator('#onboarding[data-target-editing=false]').waitFor();assert.equal(await p.evaluate(()=>qaWrites.length),0);
 }
 await next(p);await p.locator('.day-tile').first().waitFor();assert.ok(p.url().endsWith('/index.html'));
 const audit=await p.evaluate(()=>({nav:qaNavigations,state:JSON.parse(localStorage.getItem('calorie-counter-state'))}));
  const completionNav=audit.nav.filter(item=>item.writes>0);
  assert.equal(completionNav.length,1,'one navigation after the confirmed completion write');assert.equal(completionNav[0].kind,'replace','onboarding enters the root tab without a Back entry');assert.equal(completionNav[0].writes,1);assert.equal(audit.state.user.age,21);assert.equal(audit.state.user.weightKg,83);assert.equal(audit.state.user.goalType,d.goalType);
 assert.deepEqual(audit.state.goals,Object.fromEntries(['calories','protein','carbs','fat'].map(k=>[k,expected[k]])));
 await p.waitForFunction(k=>sessionStorage.getItem(k)===null,draftKey);return audit;
}
try{
 for(const {width,height}of pwaPhones.filter(v=>!process.env.ONBOARD_QA_WIDTH||v.width===Number(process.env.ONBOARD_QA_WIDTH)))for(const theme of ['light','dark'])for(const goal of (process.env.ONBOARD_QA_GOAL?[process.env.ONBOARD_QA_GOAL]:['lose','maintain','gain'])){
  stage=width+' '+theme+' '+goal;console.log(stage);const {c,p,errors}=await setup({width,height,theme,missing:theme==='dark'}),d=answers(goal);
  const shot=async name=>{if(width===390&&goal==='lose'){await settle(p);await p.screenshot({path:out+'/'+name+'-'+theme+'-390.png'});}};
  await screen(p,0);await bounds(p);await next(p);await screen(p,1);await next(p);await screen(p,1);await choose(p,'goalType',goal);await next(p);await screen(p,2);
  assert.equal(await p.locator('#onboarding input[type=text]').count(),goal==='maintain'?3:4);
  await next(p);await screen(p,2);assert.equal(await p.evaluate(()=>document.activeElement.name),'sex');assert.equal(await p.locator('[data-onboarding-status]').isVisible(),false);
  await fillBasics(p,d);await input(p,'age').fill('17');await next(p);assert.equal(await p.evaluate(()=>document.activeElement.name),'age');
  await viewport(p,480,90);await bounds(p,'age');await screen(p,2);await restoreViewport(p);
  await p.setViewportSize({width,height:480});await input(p,'age').click();await bounds(p,'age');await shot('keyboard-error');await input(p,'age').fill('21');await bounds(p,'age');await shot('keyboard-basics');await p.setViewportSize({width,height});
  // Preserve the live input/caret through visual viewport panning and repeated focus.
  for(const key of ['age','heightCm','weightKg',...(goal==='maintain'?[]:['targetWeightKg'])]){
   await input(p,key).click();await p.evaluate(key=>window.qaInput=document.querySelector('[name="'+key+'"]'),key);
   for(const top of [0,35,90,0]){await viewport(p,480,top);await bounds(p,key);assert.equal(await p.evaluate(()=>qaInput===document.activeElement),true);await screen(p,2);}
   await restoreViewport(p);await bounds(p,key);
  }
  await input(p,'weightKg').fill('83,0');await next(p);await screen(p,3);await p.locator('[data-onboarding-back]').click();await screen(p,2);assert.equal(await input(p,'weightKg').inputValue(),'83,0');
  await p.reload();await screen(p,2);assert.equal(await input(p,'weightKg').inputValue(),'83,0');await bounds(p);await shot('basics');
  await input(p,'age').click();await input(p,'age').press('Enter');assert.equal(await p.evaluate(()=>document.activeElement.name),'heightCm');await screen(p,2);
  await input(p,'heightCm').press('Enter');assert.equal(await p.evaluate(()=>document.activeElement.name),'weightKg');
  await input(p,'weightKg').press('Enter');if(goal!=='maintain'){assert.equal(await p.evaluate(()=>document.activeElement.name),'targetWeightKg');await input(p,'targetWeightKg').press('Enter');}await screen(p,3);
  assert.equal(await input(p,'weeklyRateKg').count(),goal==='maintain'?0:3);await choose(p,'activityMultiplier',d.activityMultiplier);await next(p);await screen(p,4);await bounds(p);await shot('daily-target');
  for(let s=3;s>=0;s--){await p.locator('[data-onboarding-back]').click();await screen(p,s);}for(let s=1;s<=4;s++){await next(p);await screen(p,s);}
  const audit=await finish(p,d,theme);assert.equal(audit.state.progress.length,1);assert.match(audit.state.progress[0].id,/^[0-9a-f-]{36}$/);
  await p.reload();await p.locator('.day-tile').first().waitFor();assert.equal(await p.locator('#onboarding:visible').count(),0);assert.deepEqual(errors,[]);results.push({width,height,theme,goal,missingUUID:theme==='dark',case:'complete flow + geometry + reload',result:'PASS'});await c.close();
 }
 for(const theme of ['light','dark'])for(const goal of ['lose','maintain','gain']){
  stage='Adjust '+theme+' '+goal;const {c,p,errors}=await setup({theme,missing:true}),d=answers(goal);await toTarget(p,d);await finish(p,d,theme,true);assert.deepEqual(errors,[]);results.push({case:stage,result:'PASS'});await c.close();
 }
 for(const adjust of [false]){
  stage='storage failure and rapid '+(adjust?'Adjust':'Start');const {c,p,errors}=await setup({missing:true}),d=answers('lose');await toTarget(p,d);await p.evaluate(()=>window.qaFailStorage=true);await p.locator(adjust?'[data-onboarding-adjust]':cta).click();
  await p.locator('[data-onboarding-status]:not([hidden])').waitFor();assert.match(await p.locator('[data-onboarding-status]').textContent(),/Try again/);assert.doesNotMatch(await p.locator('[data-onboarding-status]').textContent(),/QuotaExceeded|randomUUID|Injected/);await screen(p,4);assert.equal(await p.evaluate(()=>localStorage.getItem('calorie-counter-state')),null);
  assert.ok(await p.evaluate(k=>JSON.parse(sessionStorage.getItem(k)).draft.age==='21',draftKey));
  let releaseDestination;
  if(!adjust)await p.route('**/app.js?*',async r=>{await new Promise(resolve=>releaseDestination=resolve);await r.continue();});
  await p.reload();await screen(p,4);
  // Actual pointer taps, no requestSubmit/direct completion calls. The first wins.
  const a=await p.locator(adjust?'[data-onboarding-adjust]':cta).boundingBox(),b=await p.locator(adjust?cta:'[data-onboarding-adjust]').boundingBox();
  await p.mouse.click(a.x+a.width/2,a.y+a.height/2);
  // Never blindly tap a new screen's unrelated tab after completion has finished.
  if(await p.locator('#onboarding:visible').count()){await p.mouse.click(b.x+b.width/2,b.y+b.height/2);await p.mouse.click(a.x+a.width/2,a.y+a.height/2);}
  if(!adjust){assert.equal(await p.locator('#onboarding').getAttribute('aria-busy'),'true');releaseDestination();}
  if(adjust)await p.locator('#goalCalories').waitFor();else await p.locator('.day-tile').first().waitFor();const audit=await p.evaluate(()=>({nav:qaNavigations,state:JSON.parse(localStorage.getItem('calorie-counter-state'))}));const completionNav=audit.nav.filter(item=>item.writes>0);assert.equal(completionNav.length,1);assert.equal(completionNav[0].kind,'replace');assert.equal(completionNav[0].writes,1);assert.equal(audit.state.progress.length,1);assert.deepEqual(errors,[]);results.push({case:stage,result:'PASS'});await c.close();
 }
 for(const question of ['sex','age','heightCm','weightKg','targetWeightKg','activityMultiplier','weeklyRateKg','target']){
  const d=answers('lose'),{c,p}=await setup({old:{draft:d,step:4,question}});await screen(p,['activityMultiplier','weeklyRateKg'].includes(question)?3:question==='target'?4:2);assert.equal(await p.evaluate(k=>JSON.parse(sessionStorage.getItem(k)).draft.heightCm,draftKey),'183');results.push({case:'legacy draft '+question,result:'PASS'});await c.close();
 }
 {
  stage='retained diary and initial weight';const today=new Date().toLocaleDateString('en-CA'),seed={user:null,theme:'dark',goals:{calories:2300,protein:150,carbs:260,fat:75},days:{'2026-09-09':{foods:[{id:'retained-food',name:'Existing rice',calories:100,protein:3,carbs:20,fat:1,amount:1,unit:'serving',meal:'lunch'}],exercises:[]}},progress:[{id:'old-weight',date:'2026-09-08',weightKg:84},{id:'today-weight',date:today,weightKg:83.2}]};
  const {c,p}=await setup({theme:'dark',missing:true,seed}),d=answers('lose');await toTarget(p,d);const audit=await finish(p,d,'dark');assert.deepEqual(audit.state.progress,seed.progress);assert.equal(audit.state.days['2026-09-09'].foods[0].id,'retained-food');assert.equal(audit.state.days['2026-09-09'].foods[0].calories,100);results.push({case:stage,result:'PASS'});await c.close();
 }
 if(process.env.INTAKE_LAN_URL){stage='actual insecure LAN origin capability';const {c,p}=await setup({origin:process.env.INTAKE_LAN_URL}),d=answers('lose');const env=await p.evaluate(()=>({origin:location.origin,secure:isSecureContext,randomUUID:typeof crypto.randomUUID,getRandomValues:typeof crypto.getRandomValues}));await toTarget(p,d);await finish(p,d,'light');results.push({case:stage,...env,result:'PASS'});await c.close();}
 {
  stage='startup-to-completion recording';const {c,p}=await setup({theme:'dark',missing:true,video:true}),d=answers('lose');await toTarget(p,d);await finish(p,d,'dark');const video=p.video();await c.close();await video.saveAs(out+'/startup-to-completion.webm');results.push({case:stage,result:'PASS'});
 }
 let webkitResult;try{const w=await webkit.launch({headless:true});webkitResult={available:true,version:w.version()};await w.close();}catch(e){webkitResult={available:false,reason:e.message.split('\n')[0]};}
 await writeFile(out+'/results.json',JSON.stringify({engine:browser.version(),origin:base,webkit:webkitResult,results,geometry,diagnostics},null,2));console.log('PASS '+results.length+' corrective onboarding scenarios.');
}catch(e){if(active&&!active.isClosed())await active.screenshot({path:out+'/failure.png'});await writeFile(out+'/failure.json',JSON.stringify({stage,error:e.stack,results},null,2));throw e;}finally{await browser.close();}
