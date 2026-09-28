import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,settle,read,keyboard,closeKeyboard,out} from './add-flow-harness.mjs';
process.env.PLATE_FIXTURES_ONLY='1';const{prepare,scan}=await import('./plate-photo-probe.mjs');
await mkdir(out,{recursive:true});const results=[];
const sizes=(process.env.DISCLOSURE_QUICK?[[390,844]]:[[320,667],[375,667],[390,844],[393,852],[430,932]]).filter(([width])=>!process.env.DISCLOSURE_WIDTH||width===Number(process.env.DISCLOSURE_WIDTH));
export async function seed({c}){
 await prepare({c});await c.addInitScript(()=>{
  Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
  const s=JSON.parse(localStorage.getItem('calorie-counter-state'));
  if(s.days[s.selectedDate].foods.length)return;
  const food={name:'Yogurt with berries',amount:1,unit:'serving',servingGrams:150,calories:160,protein:12,carbs:20,fat:4,meal:'breakfast',source:'Manual',loggedAt:s.selectedDate+'T08:00:00',loggedForDate:s.selectedDate};
  s.days[s.selectedDate].foods=[{...food,id:'edit-qa',localFoodId:'reveal-food'},...[1,2,3,12].flatMap(n=>Array.from({length:n},(_,i)=>({...food,id:`group-${n}-${i}`,localFoodId:`reveal-${n}-${i}`,name:['Oatmeal','Greek yogurt','Berries'][i%3],captureId:`photo-disclosure-group-${n}`})))];
  s.days[s.selectedDate].exercises=Array.from({length:10},(_,i)=>({id:'exercise-'+i,name:'Walking',minutes:30,calories:130}));
  localStorage.setItem('calorie-counter-state',JSON.stringify(s));
  localStorage.setItem('calorie-counter-saved-foods',JSON.stringify([{...food,id:'saved-1',localFoodId:'reveal-2-0',name:'Oatmeal'}]));
 });
}
export function instrument(){
 const union=nodes=>{const r=nodes.filter(Boolean).map(e=>e.getBoundingClientRect()).filter(r=>r.height>0);return{top:Math.min(...r.map(r=>r.top)),bottom:Math.max(...r.map(r=>r.bottom))};};
 window.revealWrites=[];window.revealStarts=[];
 const scroll=Element.prototype.scrollTo;Element.prototype.scrollTo=function(options,...args){if(options?.behavior==='instant')revealWrites.push({time:performance.now(),owner:this.className||this.tagName,top:options.top});return scroll.call(this,options,...args);};
 document.addEventListener('click',e=>{
  const nutrition=e.target.closest('#editFoodNutrition'),toggle=e.target.closest('.scanned-meal-toggle');if(!nutrition&&!toggle)return;
  const owner=nutrition?nutrition.closest('.add-flow-content,#desktopEditModalBody'):document.scrollingElement;
  const safe=parseFloat(getComputedStyle(document.querySelector('.app-shell'),'::before').height)||0;
  const bounds=nutrition?owner.getBoundingClientRect():{top:safe,bottom:Math.min(document.querySelector('.mobile-tabbar').getBoundingClientRect().top,document.querySelector('#floatingAddButton').getBoundingClientRect().top)};
  let region,preferred,trigger=(nutrition||toggle).getBoundingClientRect();
  if(nutrition)region=union([document.querySelector('#foodNutritionSummary'),...['Calories','Protein','Carbs','Fat'].map(n=>document.querySelector('#manualFood'+n).closest('label'))]);
  else{const group=toggle.closest('.scanned-meal-group'),content=group.querySelector('.scanned-meal-children'),header=group.querySelector('.scanned-meal-header');region={top:header.getBoundingClientRect().top,bottom:content.getBoundingClientRect().top+content.scrollHeight};preferred=union([header,...[...content.children].slice(0,2)]);}
  let shift=0,growth=0;
  if(toggle)for(const content of document.querySelectorAll('#foodList .scanned-meal-children')){
   if(!content.getAnimations().some(a=>a.effect.getKeyframes().some(f=>'height' in f)))continue;
   const b=content.getBoundingClientRect(),change=(content.parentElement.querySelector('.scanned-meal-toggle').getAttribute('aria-expanded')==='true'?content.scrollHeight:0)-b.height;
   growth+=change;if(b.top<region.top&&b.bottom<=region.top+1)shift+=change;
  }
  const full={top:Math.min(region.top,trigger.top)+shift,bottom:Math.max(region.bottom,trigger.bottom)+shift},anchor=region.top+shift;
  const comfortable=full.top>=bounds.top+12&&full.bottom<=bounds.bottom-12&&anchor<bounds.top+(bounds.bottom-bounds.top)/2;
  const delta=comfortable?0:anchor-bounds.top-12;
  const range=owner.scrollHeight-owner.clientHeight+growth,target=Math.max(0,Math.min(range,owner.scrollTop+delta));
  revealStarts.push({type:nutrition?'nutrition':'group',expanded:(nutrition||toggle).getAttribute('aria-expanded'),top:owner.scrollTop,range,bounds:{top:bounds.top,bottom:bounds.bottom},region,preferred,anchor,ideal:owner.scrollTop+delta,target,expected:target-owner.scrollTop,time:performance.now()});
 });
}
export const finish=async p=>{await settle(p);await p.waitForTimeout(280);};
const closeEdit=async p=>{await p.locator('#closeFoodModal').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await finish(p);};
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<2,`${label}: ${a}/${b}`);
const group=n=>`.scanned-meal-group[data-plate-capture="photo-disclosure-group-${n}"]`;
async function positionGroup(p,n,where){await p.locator(group(n)).evaluate((e,where)=>{const t=e.querySelector('.scanned-meal-toggle').getBoundingClientRect(),nav=document.querySelector('.mobile-tabbar').getBoundingClientRect(),safe=parseFloat(getComputedStyle(document.querySelector('.app-shell'),'::before').height)||0;const y=where==='bottom'?nav.top-t.height-18:safe+50;document.scrollingElement.scrollTo({top:scrollY+t.top-y,behavior:'instant'});},where);await settle(p);}
async function toggleGroup(p,n){await p.locator(group(n)+' .scanned-meal-toggle').tap();await finish(p);}
function assertReveal(start,after,label){near(after-start.top,start.expected,label);}
if(process.env.DISCLOSURE_HELPERS_ONLY!=='1')for(const engine of (process.env.DISCLOSURE_ENGINE?.split(',')||['chromium','webkit'])){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
 try{for(const[width,height]of sizes)for(const theme of(process.env.DISCLOSURE_QUICK?['dark']:['light','dark']))for(const reduce of[false,true]){
  const tag=`${engine}-${width}-${theme}-${reduce?'reduce':'motion'}`,primary=width===390&&theme==='dark'&&!reduce;
  const{p,c}=await setup(b,{engine,width,height,theme,reduce,beforeOpen:seed});let stage='setup';const checks=[],evidence={};
  try{
   await p.evaluate(instrument);const initial=await read(p),initialHeight=await p.evaluate(()=>document.scrollingElement.scrollHeight);
   stage='Edit nutrition content focus, Done, no keyboard';await p.locator('[data-food-entry-id=edit-qa] .entry-main').tap();await finish(p);await p.locator('#editFoodNutrition').tap();await finish(p);
   const n=await p.evaluate(()=>({start:revealStarts.at(-1),top:document.querySelector('.add-flow-content').scrollTop,active:document.activeElement.tagName,done:document.querySelector('#editFoodNutrition').getBoundingClientRect().toJSON(),footer:document.querySelector('.add-flow-footer').getBoundingClientRect().toJSON(),root:scrollY}));
   assertReveal(n.start,n.top,'nutrition content focus');assert.ok(!['INPUT','TEXTAREA','SELECT'].includes(n.active));assert.ok(n.done.bottom<=n.footer.top+1);evidence.nutrition=n;
   await p.locator('#editFoodNutrition').tap();await finish(p);assert.equal(await p.locator('#manualFoodFat').isVisible(),false);checks.push(stage);
   stage='rapid nutrition toggle, focus and keyboard takeover';await p.locator('#editFoodNutrition').evaluate(e=>{e.click();e.click();e.click();});await finish(p);assert.equal(await p.locator('#editFoodNutrition').getAttribute('aria-expanded'),'true');await p.locator('#editFoodNutrition').evaluate(e=>e.click());await finish(p);
   await p.locator('#editFoodNutrition').evaluate(e=>{e.click();document.querySelector('#manualFoodFat').focus({preventScroll:true});});await keyboard(p,430,25);await finish(p);
   const kb=await p.locator('#manualFoodFat').evaluate(e=>({r:e.getBoundingClientRect().toJSON(),owner:e.closest('.add-flow-content').getBoundingClientRect().toJSON()}));assert.ok(kb.r.top>=kb.owner.top-1&&kb.r.bottom<=kb.owner.bottom+1);await closeKeyboard(p);await finish(p);await closeEdit(p);checks.push(stage);
   for(const count of[1,2,3,12])for(const where of['top','bottom']){
    stage=`${count}-food group ${where}: reveal policy and collapse`;await positionGroup(p,count,where);await toggleGroup(p,count);
    const result=await p.evaluate(selector=>({start:revealStarts.at(-1),top:scrollY,group:document.querySelector(selector).getBoundingClientRect().toJSON(),children:document.querySelector(selector+' .scanned-meal-children').getBoundingClientRect().toJSON(),first:document.querySelector(selector+' .entry-card').getBoundingClientRect().toJSON(),nav:document.querySelector('.mobile-tabbar').getBoundingClientRect().toJSON()}),group(count));
    evidence[`${count}-${where}`]=result;assertReveal(result.start,result.top,stage);
    // A row count is not a size. Include the normal top reading gap when
    // deciding whether all rows can fit at the requested content-focus target.
    if(result.start.expected===0)near(result.start.top,result.top,'already visible target');
    assert.ok(result.first.bottom<=result.start.bounds.bottom+1);
    const oversized=result.start.region.bottom-result.start.region.top>result.start.bounds.bottom-result.start.bounds.top-12;
    if(oversized)assert.ok(result.children.bottom>result.start.bounds.bottom,'large group must not chase its final child');
    else assert.ok(result.children.bottom<=result.start.bounds.bottom+1,'a fitting group is revealed completely');
    await toggleGroup(p,count);assert.equal(await p.locator(group(count)+' .scanned-meal-children').isVisible(),false);checks.push(stage);
   }
   stage='multiple groups, latest reveal and no single-open policy';await positionGroup(p,1,'top');await p.locator(group(1)+' .scanned-meal-toggle').evaluate(e=>e.click());await p.locator(group(2)+' .scanned-meal-toggle').evaluate(e=>e.click());await finish(p);assert.equal(await p.locator(group(1)+' .scanned-meal-toggle').getAttribute('aria-expanded'),'true');assert.equal(await p.locator(group(2)+' .scanned-meal-toggle').getAttribute('aria-expanded'),'true');
   const start=await p.evaluate(()=>revealStarts.at(-1));assertReveal(start,await p.evaluate(()=>scrollY),stage);
   await p.locator(group(1)+' .scanned-meal-toggle').evaluate(e=>e.click());await p.locator(group(2)+' .scanned-meal-toggle').evaluate(e=>e.click());await finish(p);checks.push(stage);
   stage='rapid group reversals, manual wheel cancellation';await positionGroup(p,12,'bottom');await p.locator(group(12)+' .scanned-meal-toggle').evaluate(e=>{e.click();e.click();e.click();});await finish(p);assert.equal(await p.locator(group(12)+' .scanned-meal-toggle').getAttribute('aria-expanded'),'true');await toggleGroup(p,12);await positionGroup(p,12,'bottom');
   await p.locator(group(12)+' .scanned-meal-toggle').evaluate(e=>{e.click();document.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:50}));});const pos=await p.evaluate(()=>scrollY);await finish(p);near(await p.evaluate(()=>scrollY),pos,'wheel cancelled pending reveal');await p.locator(group(12)+' .scanned-meal-toggle').evaluate(e=>e.click());await finish(p);checks.push(stage);
   stage='child Edit return and native photo disclosure';await positionGroup(p,2,'top');await toggleGroup(p,2);await p.locator(group(2)+' .entry-main').first().tap();await finish(p);
   for(const selector of['.food-photo-individual','.food-photo-cover']){const detail=p.locator(selector);assert.equal(await detail.isVisible(),true);await detail.locator('summary').tap();await finish(p);assert.equal(await detail.evaluate(e=>e.open),true);assert.equal(await detail.locator('summary').getAttribute('aria-expanded'),'true');const geometry=await detail.evaluate(e=>({r:e.getBoundingClientRect().toJSON(),owner:e.closest('.add-flow-content').getBoundingClientRect().toJSON()}));assert.ok(geometry.r.bottom<=geometry.owner.bottom+1);await detail.locator('summary').tap();await finish(p);}
   await closeEdit(p);assert.equal(await p.locator(group(2)+' .scanned-meal-toggle').getAttribute('aria-expanded'),'true');await toggleGroup(p,2);near(await p.evaluate(()=>document.scrollingElement.scrollHeight),initialHeight,'no added range after disclosures collapse');checks.push(stage);
   stage='exercise inline actions and calorie edit keyboard ownership';await p.locator('#exerciseList .entry-actions-toggle').first().tap();await finish(p);assert.equal(await p.locator('#exerciseList .entry-inline-actions').first().isVisible(),true);await p.locator('#exerciseList .entry-inline-edit').first().tap();await finish(p);assert.equal(await p.locator('#exerciseCalories').isVisible(),true);await p.locator('#closeExerciseModal').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await finish(p);checks.push(stage);
   assert.deepEqual(await read(p),initial);assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
   if(primary){
    stage='desktop Edit uses modal content owner, not document';await p.setViewportSize({width:1100,height:720});await p.locator('[data-food-entry-id=edit-qa] .entry-main').click();await finish(p);const docTop=await p.evaluate(()=>scrollY);await p.locator('#editFoodNutrition').click();await finish(p);const desktop=await p.locator('#editFoodNutrition').evaluate(e=>({done:e.getBoundingClientRect().toJSON(),owner:e.closest('#desktopEditModalBody').getBoundingClientRect().toJSON(),scroll:scrollY}));assert.equal(desktop.scroll,docTop);assert.ok(desktop.done.bottom<=desktop.owner.bottom+1);await p.locator('#desktopEditModalClose').click();await finish(p);await p.setViewportSize({width,height});await finish(p);checks.push(stage);
stage='Add exercise calorie disclosure yields to existing input focus';await p.locator('#floatingAddButton').tap();await p.locator('.add-flow-surface [data-add-mode=exercise]').tap();await finish(p);await p.locator('#exerciseCaloriesEdit').tap();await finish(p);assert.equal(await p.locator('#exerciseCaloriesEdit').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('#exerciseCalories').evaluate(e=>e===document.activeElement),true);await keyboard(p,430,25);await finish(p);await closeKeyboard(p);await p.locator('#exerciseCaloriesEdit').tap();await finish(p);assert.equal(await p.locator('#exerciseCaloriesEdit').getAttribute('aria-expanded'),'false');await p.locator('#closeExerciseModal').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await finish(p);checks.push(stage);
    stage='Edit nutrition already fits: zero scroll in a taller usable viewport';await p.setViewportSize({width,height:1100});await p.locator('[data-food-entry-id=edit-qa] .entry-main').tap();await finish(p);await p.locator('#editFoodNutrition').tap();await finish(p);const visible=await p.evaluate(()=>({start:revealStarts.at(-1),top:document.querySelector('.add-flow-content').scrollTop}));assert.equal(visible.start.expected,0);assert.equal(visible.top,visible.start.top);await closeEdit(p);await p.setViewportSize({width,height});await finish(p);checks.push(stage);
    stage='150% text: complete editor and oversized group beginning';const enlarged=await p.addStyleTag({content:'#manualFoodForm label :is(input,select){font-size:27px!important;line-height:1.4!important} #foodList .entry-main strong{font-size:22.5px!important} #foodList .entry-main p{font-size:18px!important} .scanned-meal-toggle strong{font-size:22.5px!important} .scanned-meal-toggle small{font-size:18px!important}'});
    await p.locator('[data-food-entry-id=edit-qa] .entry-main').tap();await finish(p);await p.locator('#editFoodNutrition').tap();await finish(p);const big=await p.evaluate(()=>({start:revealStarts.at(-1),top:document.querySelector('.add-flow-content').scrollTop,overflow:document.documentElement.scrollWidth>innerWidth}));assertReveal(big.start,big.top,'large text editor');assert.equal(big.overflow,false);await closeEdit(p);await positionGroup(p,12,'bottom');await toggleGroup(p,12);const bigGroup=await p.evaluate(()=>({start:revealStarts.at(-1),top:scrollY}));assertReveal(bigGroup.start,bigGroup.top,'large text group');await toggleGroup(p,12);await enlarged.evaluate(e=>e.remove());checks.push(stage);
    stage='keyboard disclosure focus survives reveal';await positionGroup(p,3,'bottom');const kbToggle=p.locator(group(3)+' .scanned-meal-toggle');await kbToggle.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');await p.keyboard.press('Enter');await finish(p);assert.ok(await kbToggle.evaluate(e=>e===document.activeElement&&getComputedStyle(e).outlineStyle==='solid'));await p.keyboard.press('Space');await finish(p);checks.push(stage);
    stage='user touch interrupts in-flight reveal and manually scrolls large group';await positionGroup(p,12,'bottom');await p.evaluate(()=>revealWrites=[]);await p.locator(group(12)+' .scanned-meal-toggle').tap();await p.waitForTimeout(65);
    if(engine==='chromium'){
     const cd=await c.newCDPSession(p),x=width/2,y=height/2;await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});const writes=await p.evaluate(()=>revealWrites.length);for(let i=1;i<=10;i++){await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*14,id:1}]});await p.waitForTimeout(18);}await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(450);assert.equal(await p.evaluate(()=>revealWrites.length),writes);await cd.detach();
    }else{await p.evaluate(()=>document.dispatchEvent(new Event('touchstart',{bubbles:true})));const writes=await p.evaluate(()=>revealWrites.length);await p.evaluate(()=>{document.scrollingElement.scrollTop+=120;});await finish(p);assert.equal(await p.evaluate(()=>revealWrites.length),writes);}
    await p.locator(group(12)+' .scanned-meal-toggle').evaluate(e=>e.click());await finish(p);checks.push(stage);
    stage='scan item nutrition and Change food';await scan(p,3);await p.locator('.scan-plate-row').first().tap();await finish(p);await p.locator('[data-scan-action=details]').tap();await finish(p);const card=p.locator('.scan-food-card');assert.equal(await card.locator('[data-scan-action=details]').getAttribute('aria-expanded'),'true');
    const geometry=await card.evaluate(e=>({r:e.querySelector('.scan-food-nutrition-basis').getBoundingClientRect().toJSON(),owner:e.closest('.add-flow-content').getBoundingClientRect().toJSON()}));assert.ok(geometry.r.bottom<=geometry.owner.bottom+1);
    await p.locator('[data-scan-action=correct]').tap();await finish(p);assert.equal(await p.locator('[data-scan-correction-input]').evaluate(e=>e===document.activeElement),true);await keyboard(p,430,25);await finish(p);await closeKeyboard(p);checks.push(stage);
   }
   assert.deepEqual(await p.evaluate(()=>qaErrors),[]);results.push({tag,passed:true,checks,evidence});console.log('PASS',tag,checks.length);
  }catch(error){results.push({tag,passed:false,stage,error:error.stack,evidence});await p.screenshot({path:`${out}/${tag}-FAIL.png`});throw error;}
  finally{await c.close();await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
 }}finally{await b.close();}
}
