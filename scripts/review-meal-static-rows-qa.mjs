import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,settle,read} from './add-flow-harness.mjs';
process.env.PLATE_FIXTURES_ONLY='1';
const {prepare,scan}=await import('./plate-photo-probe.mjs');
const out=process.env.INTAKE_MEAL_QA_OUTPUT||'artifacts/review-meal-static-rows';await mkdir(out,{recursive:true});
const results=[];
const foods=async p=>{const s=await read(p);return s.days[s.selectedDate].foods;};
async function drag(p,row,dx,dy=0,expectedOpen=false){
 await row.scrollIntoViewIfNeeded();await settle(p);const r=await row.boundingBox();
 const x=r.x+r.width*.5,y=Math.min(r.y+r.height/2,650);
 if(p.context().browser().browserType().name()==='chromium'){
  const cdp=await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let n=1;n<=12;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*n/12,y:y+dy*n/12}]});await p.waitForTimeout(16);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{
  // Playwright WebKit exposes no native touch-drag API. Exercise the pointer
  // path without synthesizing a tap; WebKit mobile also lacks mouse.wheel.
  // Check scroll geometry separately. Real touch scrolling is Chromium-only.
  for(const [type,n] of [['pointerdown',0],...Array.from({length:12},(_,n)=>['pointermove',n+1]),['pointerup',12]])
   await row.dispatchEvent(type,{pointerType:'touch',isPrimary:true,pointerId:81,button:0,clientX:x+dx*n/12,clientY:y+dy*n/12});
  if(dy)await p.evaluate(dy=>window.scrollBy({top:-dy,behavior:'instant'}),dy);
 }
 await settle(p);
 assert.equal(await p.locator('.add-flow-host').count(),0,'drag must not edit');
 assert.equal(await row.evaluate(e=>e.classList.contains('is-swipe-dragging')),false);
 assert.equal(await row.evaluate(e=>e.classList.contains('is-swipe-open')),expectedOpen);
 assert.equal(await row.locator('.diary-row-swipe-actions').getAttribute('aria-hidden'),String(!expectedOpen));
 assert.equal(await row.evaluate(e=>Number.parseFloat(e.style.getPropertyValue('--diary-swipe-x'))||0),expectedOpen?-132:0);
}
async function rowActions(p,id,{record=false}={}){
 const row=()=>p.locator(`[data-food-entry-id="${id}"]`),original=(await foods(p)).find(f=>f.id===id);
 await row().scrollIntoViewIfNeeded();await settle(p);
 await drag(p,row(),85);await drag(p,row(),-85,0,true);await drag(p,row(),85);
 await row().evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
 const before=await p.evaluate(()=>({y:scrollY,remaining:document.documentElement.scrollHeight-innerHeight-scrollY}));
 // At tall viewports the scanned group is already at the document bottom.
 // Move into available scroll range instead of asserting past that boundary.
 const dy=before.remaining>120?-105:105;await drag(p,row(),0,dy);
 const after=await p.evaluate(()=>scrollY);
 assert.ok((after-before.y)*-Math.sign(dy)>10,`vertical movement scrolls Today: ${JSON.stringify({before,after,dy})}`);
 assert.deepEqual((await foods(p)).find(f=>f.id===id),original);
 if(record){await p.waitForTimeout(600);await p.screenshot({path:out+'/today-rest-390-dark.png'});}
 await row().locator('.entry-actions-toggle').tap();await settle(p);
 assert.equal(await p.locator('.add-flow-host').count(),0,'overflow does not edit');
 if(record){await p.screenshot({path:out+'/today-menu-390-dark.png'});await p.waitForTimeout(650);}
 await p.locator('[data-entry-action=edit]').tap();await settle(p);
 assert.equal(await p.locator('#foodAmount').inputValue(),String(original.amount));
 assert.equal(await p.locator('#foodMeal').inputValue(),original.meal);
 if(record)await p.waitForTimeout(700);
 await p.locator('#closeFoodModal').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
 assert.deepEqual((await foods(p)).find(f=>f.id===id),original);
 for(const label of ['Save','Unsave']){
  await row().locator('.entry-actions-toggle').tap();await settle(p);
  assert.equal(await p.locator('[data-entry-action=save]').innerText(),label);
  await p.locator('[data-entry-action=save]').tap();await settle(p);
 }
 await row().locator('.entry-actions-toggle').tap();await settle(p);
 await p.locator('[data-entry-action=delete]').tap();await row().waitFor({state:'detached'});await settle(p);
 assert.equal((await foods(p)).filter(f=>f.id===id).length,0);
 if(record)await p.waitForTimeout(700);
 await p.locator('#undoToast button').tap();await row().waitFor();await settle(p);
 assert.deepEqual((await foods(p)).find(f=>f.id===id),original);
 if(record)await p.waitForTimeout(700);
 // Touch focus restoration stays neutral; keyboard remains intentionally visible.
 const button=row().locator('.entry-actions-toggle');
 assert.equal(await button.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 await button.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');
 assert.ok(await button.evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle!=='none'));
 await p.keyboard.press('Enter');await p.locator('[data-entry-action=edit]').waitFor();
 await p.keyboard.press('Escape');await p.locator('#foodReusePanel').waitFor({state:'hidden'});await settle(p);
 await row().locator('.entry-main').tap();await p.locator('#foodAmount').waitFor();await settle(p);
 await p.locator('#closeFoodModal').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
}
const widths=process.env.MEAL_QUICK?[390]:[320,375,390,393,430];
for(const engine of ['chromium','webkit']){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
 try{for(const width of widths)for(const theme of process.env.MEAL_QUICK?['dark']:['light','dark']){
  const record=engine==='chromium'&&width===390&&theme==='dark';
  const {c,p}=await setup(b,{engine,width,height:width<=375?667:width===430?932:width===393?852:844,theme,beforeOpen:prepare,video:record});
  await c.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}));
  const metrics=[];let stage='scan';
  try{
   await scan(p,3);stage='meal sizing';
   for(const name of ['Breakfast','Lunch','Dinner','Snack','Spätes Frühstück / Brunch']){
    if(name.startsWith('Spätes'))await p.locator('#scanReviewMeal option[value=breakfast]').evaluate((e,name)=>e.textContent=name,name);
    await p.locator('#scanReviewMeal').selectOption(name.startsWith('Spätes')?'breakfast':name.toLowerCase());await settle(p);
    const g=await p.locator('#scanReviewMeal').evaluate(e=>{
     const s=getComputedStyle(e),label=e.closest('label'),r=e.getBoundingClientRect(),outer=label.getBoundingClientRect(),arrow=getComputedStyle(label,'::after');
     const ctx=document.createElement('canvas').getContext('2d');ctx.font=s.font;
     const text=e.selectedOptions[0].textContent,spacing=parseFloat(s.letterSpacing)||0;
     return{text,valueArea:e.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),textWidth:ctx.measureText(text).width+spacing*text.length,
      font:s.font,fontSize:s.fontSize,spacing,outer:outer.toJSON(),select:r.toJSON(),paddingRight:parseFloat(s.paddingRight),arrow:{width:parseFloat(arrow.width),right:parseFloat(arrow.right)},
      heading:label.closest('.scan-review-heading').getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth};
    });metrics.push(g);
    assert.ok(g.valueArea>=g.textWidth+1,JSON.stringify(g));assert.equal(g.overflow,false);
    assert.ok(g.outer.right<=width-20&&g.outer.left>=20);assert.ok(g.select.right<=g.outer.right&&g.select.left>=g.outer.left);
    assert.ok(g.paddingRight>=g.arrow.width+16);assert.equal(g.fontSize,'13.28px');assert.ok(g.outer.height>=44);
    if(width===390&&name==='Breakfast')await p.screenshot({path:`${out}/${engine}-review-${theme}-390.png`});
    if(width===320&&name.startsWith('Spätes'))await p.screenshot({path:`${out}/${engine}-long-meal-${theme}-320.png`});
   }
   await p.locator('#scanReviewMeal option[value=breakfast]').evaluate(e=>e.textContent='Breakfast');
   await p.locator('#scanReviewMeal').selectOption('snack');
   // The same Meal value must survive reviewing an individual scan result.
   await p.locator('#scanFoodList [data-scan-food-id]').first().tap();await settle(p);
   assert.equal(await p.locator('#foodMeal').inputValue(),'snack');
   await p.locator('#closeFoodModal').tap();await settle(p);
   assert.equal(await p.locator('#scanReviewMeal').inputValue(),'snack');
   await p.locator('#scanAddSelectedFoods').tap();
   await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
   const scanned=await foods(p);assert.ok(scanned.every(f=>f.meal==='snack'));assert.equal(scanned.length,3);
   // Reload-isolated fixtures provide ordinary short/long rows with 1/3/4-digit kcal.
   await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('calorie-counter-state')),day=s.days[s.selectedDate];
    day.foods.push(...Array.from({length:7},(_,i)=>({id:'static-'+i,name:i===1?'A very long ordinary food name that wraps across multiple lines without moving the calorie column':i===0?'Tea':'Ordinary food '+i,meal:'breakfast',amount:1,unit:'serving',serving:'1 serving',calories:i===0?2:i===1?1234:120,protein:1,carbs:2,fat:0})));
    day.exercises=[{id:'walk',name:'Walking',minutes:20,calories:80}];localStorage.setItem('calorie-counter-state',JSON.stringify(s));});
   await p.reload();await p.locator('.scanned-meal-toggle').waitFor();await settle(p);stage='static diary rows';
   await p.locator('.scanned-meal-toggle').tap();await settle(p);
   const bounds=await p.locator('#foodList .entry-card').evaluateAll(rows=>rows.map(e=>{const r=e.getBoundingClientRect(),k=e.querySelector('.entry-kcal').getBoundingClientRect(),b=e.querySelector('.entry-actions-toggle').getBoundingClientRect();return{r:r.toJSON(),k:k.toJSON(),b:b.toJSON(),label:e.querySelector('.entry-actions-toggle').getAttribute('aria-label'),transform:getComputedStyle(e.querySelector('.entry-surface')).transform};}));
   for(const g of bounds){assert.equal(g.transform,'none');assert.ok(g.b.width>=44&&g.b.height>=44);assert.ok(g.k.right<=g.b.left&&g.b.right<=g.r.right);assert.match(g.label,/^Actions for /);}
   assert.ok(Math.max(...bounds.map(g=>g.k.right))-Math.min(...bounds.map(g=>g.k.right))<1,'shared trailing kcal column');
   assert.equal(await p.locator('#foodList .diary-row-swipe-actions').count(),bounds.length);
   await rowActions(p,'static-0',{record});await rowActions(p,scanned[0].id);
   stage='exercise equivalent actions';
   const exercise=p.locator('#exerciseList .entry-card');await exercise.scrollIntoViewIfNeeded();
   await exercise.locator('.entry-actions-toggle').tap();await settle(p);assert.ok(await exercise.locator('.entry-inline-edit').isVisible());assert.ok(await exercise.locator('.entry-inline-delete').isVisible());
   assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
   results.push({engine,width,theme,status:'PASS',metrics,rows:bounds.length});console.log('PASS',engine,width,theme);
  }catch(error){await p.screenshot({path:`${out}/${engine}-${width}-${theme}-FAIL.png`});await writeFile(out+'/failure.json',JSON.stringify({engine,width,theme,stage,error:error.stack,metrics},null,2));throw error;}
  finally{const video=record?p.video():null;await c.close();if(video)await video.saveAs(out+'/today-row-actions-390-dark.webm');await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
 }}finally{await b.close();}
}
console.log(`PASS ${results.length} meal/static-row mobile configurations; Chromium native touch, WebKit pointer + scroll geometry.`);
