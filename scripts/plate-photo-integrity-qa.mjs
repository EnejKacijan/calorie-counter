import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,settle,read,openFood,out} from './add-flow-harness.mjs';
process.env.PLATE_FIXTURES_ONLY='1';process.env.GALLERY_FIXTURES_ONLY='1';
const {prepare,scan}=await import('./plate-photo-probe.mjs');const {imageFile}=await import('./gallery-flow-qa.mjs');
await mkdir(out,{recursive:true});const results=[],limitations=[];
const entries=async p=>{const s=await read(p);return s.days[s.selectedDate].foods;};
const library=(p,key)=>p.evaluate(key=>JSON.parse(localStorage.getItem('calorie-counter-'+key)||'[]'),key);
const assets=p=>p.evaluate(async()=>{const {foodMedia}=await import('/food-media-runtime.js?v=2');return foodMedia.list();});
const check=(engine,name)=>{results.push({engine,name,status:'PASS'});console.log('PASS',engine,name);};
const action=(p,name)=>p.locator(`[data-reuse-action=${name}]`);
async function menu(p){await p.locator('#foodLogOptionsButton:visible,[data-empty-food-action=reuse]').tap();await p.locator('#foodReusePanel').waitFor({state:'visible'});}
async function closeAdd(p){await p.locator('#closeFoodModal').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);}
async function rowAction(p,id,actionName){const group=p.locator('.scanned-meal-group').filter({has:p.locator(`[data-food-entry-id="${id}"]`)});if(await group.count()&&await group.locator('.scanned-meal-toggle').getAttribute('aria-expanded')==='false'){await group.locator('.scanned-meal-toggle').tap();await settle(p);}await p.locator(`[data-food-entry-id="${id}"] .entry-actions-toggle`).tap();await p.locator(`[data-entry-action=${actionName}]`).tap();if(actionName==='delete')await p.locator(`[data-food-entry-id="${id}"]`).waitFor({state:'detached'});await settle(p);}
async function openMeal(p,id){await menu(p);await action(p,'saved-meals').tap();await p.locator(`#foodReuseContent [data-saved-meal-id="${id}"]`).tap();await settle(p);}
for(const engine of ['chromium','webkit']){
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 const {p,c}=await setup(b,{engine,width:390,height:844,theme:'dark',beforeOpen:prepare,serviceWorkers:'allow'});
 let stage='start';
 try{
  await scan(p);await p.locator('#scanReviewMeal').selectOption('lunch');
  await p.locator('#scanSaveAsMeal').tap();await p.locator('[name=mealName]').fill('Photographed lunch');await p.locator('[data-reuse-save-form] button[type=submit]').tap();await p.locator('#foodReusePanel').waitFor({state:'hidden'});
  const saved=(await library(p,'saved-meals'))[0];assert.ok(saved.coverImageId);assert.ok(saved.foods.every(f=>!f.captureId&&!f.photoMediaId&&!f.coverImageId));assert.equal((await assets(p)).length,1);
  stage='failed Add retry';await p.evaluate(()=>qaFailStorage=true);
  for(let i=0;i<2;i++){await p.locator('#scanAddSelectedFoods').tap();await p.locator('.scan-review-footer .add-entry-status').waitFor();assert.equal((await entries(p)).length,0);assert.equal((await assets(p)).length,1);}
  await p.evaluate(()=>qaFailStorage=false);await p.locator('#scanAddSelectedFoods').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
  const initial=await entries(p),capture=initial[0].captureId;assert.equal(capture,saved.coverImageId);assert.equal(initial.length,3);assert.equal((await assets(p)).length,1);check(engine,'Saved meal + repeated failure/retry use one asset; diary is all-or-nothing');
  stage='Saved food and Recent';await rowAction(p,initial[2].id,'save');assert.equal((await library(p,'saved-foods'))[0].coverImageId,undefined);
  await openFood(p);await p.locator('[data-food-filter=recent]').tap();assert.equal(await p.locator('#foodSuggestions .food-photo-thumb').count(),0);await closeAdd(p);check(engine,'Recent and Saved food components do not inherit plate covers');
  stage='individual photo';await p.locator(`[data-food-entry-id="${initial[0].id}"] .entry-main`).tap();await p.locator('.food-photo-individual summary').tap();
  const ownFile=await imageFile(p,[800,600]),pick=p.waitForEvent('filechooser');await p.locator('.food-photo-individual [data-photo-choose]').tap();await(await pick).setFiles(ownFile);
  await p.locator('.food-photo-individual [data-photo-choose]').filter({hasText:'Change photo'}).waitFor();await p.locator('#manualFoodSubmit').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
  let current=await entries(p);const ownId=current[0].photoMediaId;assert.ok(ownId&&ownId!==capture);assert.equal(current[0].captureId,capture);assert.deepEqual(current.slice(1),initial.slice(1));
  assert.equal(await p.locator('#foodList [data-food-entry-id] .food-photo-thumb').count(),1);
  await p.locator(`[data-food-entry-id="${initial[0].id}"] .entry-main`).tap();await p.locator('.food-photo-individual [data-photo-remove]').tap();await p.locator('#foodAmount').fill('6');await p.locator('#foodUnit').selectOption('g');await p.locator('#manualFoodSubmit').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
  current=await entries(p);assert.equal(current[0].photoMediaId,undefined);assert.equal(current[0].captureId,capture);assert.equal(current[0].unit,'g');assert.deepEqual(current.slice(1),initial.slice(1));check(engine,'explicit individual photo/change amount/unit do not mutate plate or siblings');
  stage='delete Undo';await rowAction(p,initial[0].id,'delete');assert.match(await p.locator('[data-plate-capture]').innerText(),/2 foods/);await p.locator('#undoToast button').tap();await settle(p);assert.match(await p.locator('[data-plate-capture]').innerText(),/3 foods/);check(engine,'delete and Undo update capture count without duplicate thumbnail');
  stage='move meal';await p.locator(`[data-food-entry-id="${initial[0].id}"] .entry-main`).tap();await p.locator('#foodMeal').selectOption('breakfast');await p.locator('#manualFoodSubmit').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
  assert.equal(await p.locator('[data-plate-capture]').count(),1);assert.match(await p.locator('[data-plate-capture]').innerText(),/2 foods here/);assert.match(await p.locator('[data-plate-capture]').innerText(),/1 food in Breakfast/);check(engine,'meal move keeps one photo and truthful cross-meal context');
  stage='second capture';await scan(p,2);await p.locator('#scanReviewMeal').selectOption('lunch');await p.locator('#scanAddSelectedFoods').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
  assert.equal(await p.locator('[data-plate-capture]').count(),2);assert.equal(new Set((await entries(p)).map(f=>f.captureId)).size,2);check(engine,'two scans remain distinct in one meal');
  stage='manual and Saved reuse';await openFood(p);await p.locator('#manualFoodShortcut').tap();await p.locator('#manualFoodName').fill('Manual egg');await p.locator('#manualFoodCalories').fill('80');await p.locator('#foodMeal').selectOption('lunch');await p.locator('#manualFoodSubmit').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
  assert.equal((await entries(p)).length,6);assert.equal((await entries(p))[0].captureId,undefined);
  await openFood(p);await p.locator('[data-food-filter=my]').tap();await p.locator('#foodSuggestions .suggestion-card').filter({hasText:'Ketchup'}).tap();await p.locator('#manualFoodSubmit').tap();await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
  assert.equal((await entries(p)).length,7);assert.equal((await entries(p))[0].captureId,undefined);check(engine,'mixed manual and Saved-food logs do not manufacture capture ownership');
  stage='Saved meal cover and logging';await openMeal(p,saved.id);assert.equal(await p.locator('#foodReuseContent .food-photo-thumb').count(),1);await p.locator('#foodReuseContent .food-photo-thumb img[src]').evaluate(e=>e.decode());
  await p.screenshot({path:`${out}/${engine}-390-saved-meal.png`});await action(p,'add-saved-meal').tap();await p.locator('#foodReusePanel').waitFor({state:'hidden'});await settle(p);
  assert.equal((await entries(p)).length,10);assert.ok((await entries(p)).slice(0,3).every(f=>!f.captureId&&!f.photoMediaId));assert.equal(await p.locator('[data-plate-capture]').count(),2);check(engine,'Saved meal cover renders once; logging it creates no new factual capture');
  stage='copy another day';const source=(await read(p)).selectedDate;const beforeSource=(await read(p)).days[source];
  await p.evaluate(source=>{const s=JSON.parse(localStorage.getItem('calorie-counter-state')),d=new Date(source+'T12:00:00');d.setDate(d.getDate()+1);const target=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');s.selectedDate=target;s.days[target]={foods:[],exercises:[]};localStorage.setItem('calorie-counter-state',JSON.stringify(s));},source);
  await p.reload();await p.locator('.day-tile').first().waitFor();await settle(p);await menu(p);await action(p,'copy-date').tap();await p.locator('[data-reuse-source-date]').fill(source);await p.locator('[data-reuse-source-date]').dispatchEvent('change');p.once('dialog',d=>d.accept());await action(p,'copy-day').tap();await p.locator('#foodReusePanel').waitFor({state:'hidden'});await settle(p);
  assert.equal((await entries(p)).length,10);assert.ok((await entries(p)).every(f=>!f.captureId&&!f.photoMediaId&&!f.coverImageId));assert.deepEqual((await read(p)).days[source],beforeSource);assert.equal(await p.locator('[data-plate-capture]').count(),0);check(engine,'Copy another day strips historical media, preserving source IDs/photos and nutrition');
  stage='offline source';await p.evaluate(source=>{const s=JSON.parse(localStorage.getItem('calorie-counter-state'));s.selectedDate=source;localStorage.setItem('calorie-counter-state',JSON.stringify(s));},source);await p.reload();await p.locator('[data-plate-capture]').first().waitFor();await settle(p);assert.equal(await p.locator('[data-plate-capture]').count(),2);
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>navigator.serviceWorker.controller);
  if(engine==='chromium'){await c.setOffline(true);await p.reload();}
  else limitations.push({engine,status:'NOT VERIFIED',check:'offline cold reload/local Blob decoding',reason:'Windows Playwright WebKit context.setOffline blocks cached navigation and even a new 20x20 canvas PNG Blob on about:blank. Independent Chromium/WebKit online/offline/online control is in webkit-offline-control.log. Online reload/local viewer tested here; real offline cold reload/local viewer tested in Chromium. Physical iPhone offline verification remains required.'});
  await p.locator('[data-plate-capture]').first().waitFor();await settle(p);assert.equal(await p.locator('[data-plate-capture]').count(),2);
  await p.locator('[data-plate-capture] .scanned-meal-header .food-photo-thumb').first().tap();await p.locator('.food-photo-viewer img[src]').evaluate(e=>e.decode());assert.ok(await p.locator('.food-photo-viewer img').evaluate(e=>e.naturalWidth>0));await p.locator('[data-photo-close]').tap();await settle(p);await c.setOffline(false);check(engine,engine==='chromium'?'offline cold reload retains capture groups and full local viewer':'online reload/local viewer retain capture groups (offline simulation: harness limitation)');
  stage='resource lifecycle';const baseline=await p.evaluate(()=>plateUrls.size);
  for(let i=0;i<8;i++){await p.locator('[data-plate-capture] .scanned-meal-header .food-photo-thumb').first().tap();await p.locator('.food-photo-viewer img[src]').evaluate(e=>e.decode());await p.locator('[data-photo-close]').tap();await settle(p);}
  assert.ok(await p.evaluate(n=>plateUrls.size<=n,baseline));check(engine,'eight viewer open/close cycles release object URLs');
  stage='delete all source captures';const photographed=(await entries(p)).filter(f=>f.captureId);for(const entry of photographed)await rowAction(p,entry.id,'delete');assert.equal(await p.locator('[data-plate-capture]').count(),0);
  await p.locator('#undoToast button').tap();await settle(p);assert.equal(await p.locator('[data-plate-capture]').count(),1);assert.ok((await assets(p)).some(a=>a.id===capture));check(engine,'last deletion removes group; Undo and independent Saved cover keep media valid');
  assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
 }catch(error){await p.screenshot({path:out+'/'+engine+'-failure.png'});await writeFile(out+'/failure.json',JSON.stringify({engine,stage,error:error.stack,errors:await p.evaluate(()=>qaErrors)},null,2));throw error;}
 finally{await c.close();await b.close();await writeFile(out+'/integrity.json',JSON.stringify(results,null,2));await writeFile(out+'/limitations.json',JSON.stringify(limitations,null,2));}
}
