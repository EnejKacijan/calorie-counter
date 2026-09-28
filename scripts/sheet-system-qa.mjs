import {pw,setup,settle,keyboard,closeKeyboard,out} from './add-flow-harness.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const results=[],engines=process.env.SHEET_ENGINE?.split(',')||['chromium','webkit'];
const sizes=process.env.SHEET_QUICK?[[390,844]]:[[390,844],[375,667],[393,852],[430,932]];
const action=(p,name)=>p.locator(`#foodReuseContent [data-reuse-action="${name}"]`);
const view=async(p,name)=>{await p.locator(`#foodReusePanel[data-reuse-view="${name}"]`).waitFor();await settle(p);};
let active,stage;
async function watch(p,fn,label,report){
 const before=await p.evaluate(()=>window.sheetMetrics());
 await p.evaluate(()=>{window.sheetFrames=[];window.sheetRecording=true;const tick=()=>{sheetFrames.push(sheetMetrics());if(sheetRecording)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 await fn();await settle(p);await p.waitForTimeout(230);
 const after=await p.evaluate(()=>{sheetRecording=false;return{end:sheetMetrics(),frames:sheetFrames};});
 await writeFile(`${out}/last-geometry.json`,JSON.stringify({label,before,after},null,2));
 let max=0;
 for(const f of [...after.frames,after.end]) {
  assert.equal(f.y,before.y,`${label} document scrollTop`);
  for(const [name,r]of Object.entries(before.landmarks))for(const key of ['x','y','width','height']){
   // The fixed document lock now follows native visual-viewport panning.
   // Compare the user's reading position, not raw layout-viewport coordinates.
   // Navigation is fixed independently and inert behind the modal.
   const visual=key==='y'&&name!=='.mobile-tabbar';
   const delta=Math.abs((f.landmarks[name][key]-(visual?f.visualTop:0))-(r[key]-(visual?before.visualTop:0)));max=Math.max(max,delta);assert.ok(delta<=.75,`${label}: ${name}.${key} moved ${delta}px`);
  }
 }
 report.geometry.push({label,before,after:after.end,frames:after.frames.length,maxDelta:max});
}
async function handleDrag(p,distance,{cancel=false,multi=false}={}){
 await p.locator('#foodReuseDragZone').evaluate((handle,{distance,cancel,multi})=>{
  const r=handle.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+10;
  const send=(type,dy,id=1)=>handle.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,isPrimary:id===1,pointerId:id,pointerType:'mouse',button:0,clientX:x,clientY:y+dy}));
  send('pointerdown',0);send('pointermove',distance);if(multi)send('pointerdown',0,2);send(cancel?'pointercancel':'pointerup',distance);
 },{distance,cancel,multi});await settle(p);
}
async function scrollContent(p,engine){
 const before=await p.locator('#foodReuseContent').evaluate(e=>e.scrollTop);
 // A focused actual control lets PageDown exercise browser-native scrolling in
 // Windows WebKit (which has no mobile mouse.wheel). Chromium uses real touch.
 if(engine==='chromium'){
  const s=await p.context().newCDPSession(p),r=await p.locator('#foodReuseContent').boundingBox();
  const x=r.x+r.width/2,y=r.y+r.height-25;
  await s.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++)await s.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-Math.min(220,r.height-60)*i/8}]});
  await s.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await s.detach();
 }else{
  await p.locator('#foodReuseContent button').first().evaluate(e=>e.focus({preventScroll:true}));await p.keyboard.press('PageDown');
 }
 await p.waitForTimeout(400);assert.ok(await p.locator('#foodReuseContent').evaluate(e=>e.scrollTop)>before,'native inner-content scrolling');
 assert.equal(await p.locator('#foodReusePanel').isVisible(),true);
}
async function run(engine,width,height,theme,reduce=false){
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 const {c,p}=await setup(b,{engine,width,height,theme,reduce,video:process.env.SHEET_VIDEO==='1'});active=p;
 const report={engine,width,height,theme,reduce,geometry:[]};
 await p.evaluate(()=>{
  const s=JSON.parse(localStorage.getItem('calorie-counter-state'));
  const food={id:'qa-row',catalogId:'qa-banana',name:'Banana, Raw',meal:'breakfast',amount:1,unit:'serving',serving:'100 g',servingGrams:100,calories:97,protein:1,carbs:23,fat:0,source:'USDA'};
  s.days[s.selectedDate].foods=[food];localStorage.setItem('calorie-counter-state',JSON.stringify(s));
  localStorage.setItem('calorie-counter-saved-meals',JSON.stringify(Array.from({length:18},(_,i)=>({id:'qa-meal-'+i,name:'Breakfast '+String(i+1).padStart(2,'0'),meal:'breakfast',createdAt:'2026-09-01',updatedAt:'2026-09-01',foods:[food]}))));
 });await p.reload();await p.locator('[data-food-entry-id]').waitFor();await settle(p);
 // A normal user scroll establishes the scenario. No scroll normalization is
 // performed during or after any measured open/close assertion.
 await p.keyboard.press('PageDown');await p.waitForTimeout(250);
 await p.evaluate(()=>{
  window.sheetMetrics=()=>({y:document.scrollingElement.scrollTop,visualTop:visualViewport.offsetTop,bodyStyle:document.body.getAttribute('style'),rootStyle:document.documentElement.getAttribute('style'),landmarks:Object.fromEntries(['.calorie-ring','#foodSection .logged-list-heading','[data-food-entry-id]','.mobile-tabbar'].map(s=>[s,document.querySelector(s).getBoundingClientRect().toJSON()]))});
  window.vvListeners=new Map();const add=visualViewport.addEventListener.bind(visualViewport),remove=visualViewport.removeEventListener.bind(visualViewport);
  visualViewport.addEventListener=(k,f,...args)=>{if(!vvListeners.has(k))vvListeners.set(k,new Set());vvListeners.get(k).add(f);return add(k,f,...args);};visualViewport.removeEventListener=(k,f,...args)=>{vvListeners.get(k)?.delete(f);if(!vvListeners.get(k)?.size)vvListeners.delete(k);return remove(k,f,...args);};
 });
 const shot=async name=>{if(width===390&&!reduce)await p.screenshot({path:`${out}/${engine}-${theme}-390-${name}.png`});};
 const row=p.locator('.entry-actions-toggle'),reuse=p.locator('#foodLogOptionsButton'),close=p.locator('#foodReuseClose');
 stage='row lifecycle';
 await shot('today');
 await watch(p,()=>row.click(),'row open',report);await shot('actions');
 assert.equal(await p.locator('#foodReuseTitle').evaluate(e=>e===document.activeElement),true,'meaningful heading focus');
 assert.equal(await p.evaluate(()=>vvListeners.size),0,'non-input sheet has no viewport listeners');
 await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('[data-entry-action=delete]').evaluate(e=>e===document.activeElement),true);
 await p.keyboard.press('Tab');assert.equal(await close.evaluate(e=>e===document.activeElement),true,'focus wraps');
 await watch(p,()=>close.click(),'row close',report);
 assert.equal(await row.evaluate(e=>e===document.activeElement),true,'logical row trigger restored');
 for(let i=0;i<2;i++){await watch(p,()=>row.click(),`repeat ${i} open`,report);await watch(p,()=>p.keyboard.press('Escape'),`repeat ${i} close`,report);}
 stage='reuse / nested / inner scroll';
 await watch(p,()=>reuse.click(),'Reuse open',report);await shot('reuse');
 if(engine==='chromium')await watch(p,async()=>{await p.mouse.move(2,100);await p.mouse.wheel(0,420);},'background wheel blocked',report);
 const reuseStyle=await reuse.evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{h:r.height,border:s.borderTopWidth,color:s.color,text:e.textContent};});
 assert.ok(reuseStyle.h>=44);assert.equal(reuseStyle.border,'0px');assert.equal(reuseStyle.text,'Reuse');
 await watch(p,()=>action(p,'saved-meals').click(),'Saved Meals open',report);await view(p,'saved-meals');
 await watch(p,()=>scrollContent(p,engine),'content scrolling',report);await shot('saved-list');
 const meal=p.locator('#foodReuseContent [data-saved-meal-id]').filter({hasText:'Breakfast 10'});
 // Click may reveal its target inside the sheet; background still must not move.
 await watch(p,()=>meal.click(),'Saved Meal review',report);await view(p,'saved-meal-review');await shot('review');
 assert.equal(await p.evaluate(()=>vvListeners.size),2);
 await watch(p,()=>action(p,'rename-saved-meal').click(),'rename',report);await view(p,'rename-saved-meal');
 assert.equal(await p.locator('[name=mealName]').evaluate(e=>e===document.activeElement),true);
 await watch(p,()=>keyboard(p,390,90,390),'keyboard open/pan',report);
 const rename=await p.locator('[name=mealName]').boundingBox(),save=await p.locator('[data-reuse-rename-form] [type=submit]').boundingBox();
 assert.ok(rename.y>=90-.75&&rename.y+rename.height<=480+.75,'name visible in viewport');assert.ok(save.y+save.height<=480+.75,'Save visible with keyboard');await shot('rename-keyboard');
 await p.locator('[name=mealName]').fill('Breakfast renamed');
 await p.locator('[data-reuse-rename-form] [type=submit]').click();await view(p,'saved-meal-review');await closeKeyboard(p);
 await action(p,'rename-saved-meal').click();await p.locator('[name=mealName]').fill('Cancelled draft');await action(p,'cancel-rename-saved-meal').click();await view(p,'saved-meal-review');
 assert.equal(await p.locator('#foodReuseTitle').textContent(),'Breakfast renamed');
 await watch(p,()=>p.keyboard.press('Escape'),'Back review to list',report);await view(p,'saved-meals');
 assert.equal(await p.evaluate(()=>vvListeners.size),0,'input listeners released when leaving input views');
 await watch(p,()=>p.locator('#foodReuseBack').click(),'Back list to menu',report);await view(p,'menu');
 stage='backdrop / drag / rapid';
 // A pointer beginning in the panel and released over the backdrop cannot close.
 await p.locator('#foodReuseContent').dispatchEvent('pointerdown',{isPrimary:true,pointerId:1});
 await p.locator('#foodReuseBackdrop').dispatchEvent('click',{clientX:2,clientY:10});assert.equal(await p.locator('#foodReusePanel').isVisible(),true);
 await watch(p,()=>p.mouse.click(2,100),'backdrop tap close',report);
 await reuse.click();await settle(p);
 await handleDrag(p,14);assert.equal(await p.locator('#foodReusePanel').isVisible(),true);
 await handleDrag(p,100,{cancel:true});assert.equal(await p.locator('#foodReusePanel').isVisible(),true);
 await handleDrag(p,100,{multi:true});assert.equal(await p.locator('#foodReusePanel').isVisible(),true);
 await watch(p,()=>handleDrag(p,100),'handle dismiss',report);
 await row.click();await settle(p);
 await watch(p,async()=>{await close.dispatchEvent('click');await reuse.dispatchEvent('click');},'rapid close/reopen',report);
 await view(p,'menu');await close.click();await p.locator('#foodReusePanel').waitFor({state:'hidden'});
 stage='static row / shared action / focus replacement';
 const card=p.locator('[data-food-entry-id]').first();
 await card.evaluate(e=>{const r=e.getBoundingClientRect();for(const[type,x]of[['pointerdown',r.x+150],['pointermove',r.x+210],['pointerup',r.x+210]])e.dispatchEvent(new PointerEvent(type,{bubbles:true,isPrimary:true,pointerId:1,pointerType:'touch',clientX:x,clientY:r.y+20}));});
 // Current diary rows intentionally have no swipe-to-save/delete tray. A
 // horizontal contact must leave the static row intact; overflow owns actions.
 assert.equal(await card.evaluate(e=>e.classList.contains('is-swiped-right')),false);
 await row.dispatchEvent('click');await settle(p);assert.equal(await card.evaluate(e=>e.classList.contains('is-swiped-right')),false);
 await p.locator('[data-entry-action=save]').click();await p.locator('#foodReusePanel').waitFor({state:'hidden'});await settle(p);
 assert.equal(await row.evaluate(e=>e===document.activeElement),true,'rerendered trigger focus');
 stage='Edit Food footer';
 await p.locator('[data-food-entry-id] .entry-main').click();await p.locator('#manualFoodSubmit').waitFor();await settle(p);
 await p.locator('#editFoodNutrition').click();await settle(p);
 const footer=await p.locator('#manualFoodSubmit').evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e),range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect();return{rect:r.toJSON(),text:text.toJSON(),paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,align:s.alignItems,justify:s.justifyContent,line:s.lineHeight};});
 assert.equal(footer.paddingTop,footer.paddingBottom);assert.equal(footer.align,'center');assert.equal(footer.justify,'center');assert.ok(footer.rect.height>=44);
 assert.ok(Math.abs(footer.text.y+footer.text.height/2-footer.rect.y-footer.rect.height/2)<2,'text vertically centered');report.footer=footer;await shot('edit-footer');
 await p.locator('#manualFoodSubmit').click();await p.locator('#manualFoodSubmit').waitFor({state:'hidden'});await settle(p);
 assert.equal(await p.evaluate(()=>document.body.style.position),'');assert.equal(await p.evaluate(()=>document.documentElement.style.minHeight),'');assert.equal(await p.evaluate(()=>vvListeners.size),0);
 stage='physical Add parent plus Saved Meal child';
 await p.locator('#floatingAddButton').click();await p.locator('[data-food-filter=my]').click();
 await p.locator('#foodSuggestions [data-saved-meal-id]').first().click();await view(p,'saved-meal-review');
 assert.equal(await p.locator('#foodSection').evaluate(e=>e.inert),true);assert.equal(await p.locator('#foodReusePanel').evaluate(e=>e.inert),false);
 await close.click();await p.locator('#foodReusePanel').waitFor({state:'hidden'});
 assert.equal(await p.evaluate(()=>document.body.style.position),'fixed','child close retains parent lock');assert.equal(await p.locator('#foodSection').evaluate(e=>e.inert),false);
 assert.equal(await p.locator('#foodSection').evaluate(e=>e.contains(document.activeElement)),true,'focus stays with parent');
 await p.locator('#closeFoodModal').click();await p.locator('#manualFoodName').waitFor({state:'hidden'});await settle(p);
 assert.equal(await p.evaluate(()=>document.body.style.position),'');
 assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
 results.push(report);await writeFile(`${out}/matrix.json`,JSON.stringify(results,null,2));console.log('PASS',engine,width,theme,reduce?'reduced':'');
 await c.close();await b.close();active=null;
}
try{
 for(const engine of engines)for(const [w,h]of sizes)for(const theme of ['light','dark'])await run(engine,w,h,theme);
 if(!process.env.SHEET_QUICK)for(const engine of engines)await run(engine,390,844,'dark',true);
}catch(error){await active?.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.error('FAIL stage',stage,error);process.exitCode=1;await active?.context().browser().close();}
console.log(`${results.length} sheet matrix scenarios passed`);
