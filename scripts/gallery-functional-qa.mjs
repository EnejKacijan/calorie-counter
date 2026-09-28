import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,openFood,settle,read} from './add-flow-harness.mjs';
process.env.GALLERY_FIXTURES_ONLY='1';process.env.NESTED_HELPERS_ONLY='1';
const {plate,imageFile}=await import('./gallery-flow-qa.mjs');
const {drag}=await import('./nested-back-qa.mjs');
const out=process.env.INTAKE_QA_OUTPUT||'artifacts/gallery-flow/functional';await mkdir(out,{recursive:true});const results=[];
for(const engine of ['chromium','webkit']) {
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 try{for(const width of [320,390,430])for(const theme of ['light','dark']){
  const {p,c}=await setup(b,{engine,width,height:844,theme,beforeOpen:async({c})=>c.addInitScript(()=>{
    localStorage.setItem('calorie-counter-ai-consent-v1',JSON.stringify({photo:true,label:true,'food-text':true}));
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:undefined});
    Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
    window.photoUrls=new Set();const make=URL.createObjectURL,revoke=URL.revokeObjectURL;
    URL.createObjectURL=function(blob){const id=make.call(this,blob);photoUrls.add(id);return id;};URL.revokeObjectURL=function(id){photoUrls.delete(id);return revoke.call(this,id);};
  })});
  let reply={foods:plate.foods.slice(0,2)},count=0,corrections=0,hold=false,pending,holdCorrection=false,pendingCorrection;
  await p.route('**/api/foods/analyze-image',async r=>{count++;if(hold){pending=r;return;}await r.fulfill({json:{analysis:reply}});});
  await p.route('**/api/foods/correct-image-item',r=>{corrections++;if(holdCorrection){pendingCorrection=r;return;}return r.fulfill({json:{food:{...plate.foods[0],name:'Chicken sausages',amount:2,calories:200,protein:20,carbs:2,fat:12}}});});
  const choose=async file=>{const q=p.waitForEvent('filechooser');await p.locator('[data-gallery]').click();await(await q).setFiles(file);};
  const diary=async()=>Object.values((await read(p)).days).flatMap(d=>d.foods);
  const summary=()=>p.locator('.scan-plate-row');
  try{
    await openFood(p);await p.locator('#foodScanButton').click();const file=await imageFile(p,[1000,700]);await choose(file);await summary().nth(1).waitFor();await settle(p);
    assert.equal(count,1);const ids=await summary().evaluateAll(rows=>rows.map(r=>r.dataset.scanFoodId));
    const photo=p.locator('#scanReview .food-photo-thumb');await photo.click();await p.locator('.food-photo-viewer img[src]').evaluate(i=>i.decode());await p.locator('[data-photo-close]').click();await settle(p);
    assert.equal(await photo.evaluate(e=>document.activeElement===e),true);
    const noParent=await drag(p,engine,{selector:'.add-flow-backdrop',x:8,y:230,dx:width*.7});
    assert.ok(noParent.every(f=>Math.abs(f.x)<1),'summary does not reveal Today as a false scanner parent');
    assert.equal(await summary().count(),2);
    // Replacement is a child edit. Cancel and Back never mutate its prior food.
    await summary().first().click();await p.locator('[data-scan-action=correct]').click();await p.locator('[data-scan-correction-input]').fill('Chicken');await p.locator('#closeFoodModal').click();
    assert.equal(corrections,0);assert.equal(await p.locator('[data-scan-field=amount]').inputValue(),'7');
    holdCorrection=true;await p.locator('[data-scan-action=correct]').click();await p.locator('[data-scan-correction-input]').fill('Obsolete correction');await p.locator('[data-scan-action=apply-correction]').click();
    while(!pendingCorrection)await p.waitForTimeout(10);await p.locator('#closeFoodModal').click();await pendingCorrection.fulfill({json:{food:{...plate.foods[0],name:'Must never appear'}}}).catch(()=>{});holdCorrection=false;await settle(p);
    assert.equal(await p.locator('#scanReviewTitle').textContent(),'Grilled sausages');assert.equal(await p.locator('[data-scan-field=amount]').inputValue(),'7');
    await p.locator('[data-scan-action=correct]').click();await p.locator('[data-scan-correction-input]').fill('Chicken sausages');await p.locator('[data-scan-action=apply-correction]').click();await p.locator('#scanReviewTitle').filter({hasText:'Chicken sausages'}).waitFor();
    assert.equal(corrections,2);await p.locator('[data-scan-action=details]').click();await p.locator('[data-scan-field=calories]').fill('220');await p.locator('[data-scan-field=calories]').press('Enter');await settle(p);
    assert.equal((await diary()).length,0,'Return from an item editor never submits the plate');
    assert.equal(await p.locator('#scanTotalCalories').textContent(),'544');assert.equal(await p.locator('#scanTotalProtein').textContent(),'32');
    assert.deepEqual(await summary().evaluateAll(rows=>rows.map(r=>r.dataset.scanFoodId)),ids);assert.match(await summary().nth(1).innerText(),/3 pieces/);
    await p.locator('#scanReviewMeal').selectOption('dinner');await p.locator('#scanSaveAsMeal').click();await p.locator('[name=mealName]').fill('QA plate');await p.locator('#foodReuseContent form button[type=submit]').click();await p.locator('#foodReusePanel').waitFor({state:'hidden'});await settle(p);
    assert.equal((await diary()).length,0,'Save as meal never logs');const meals=await p.evaluate(()=>JSON.parse(localStorage.getItem('calorie-counter-saved-meals')));
    assert.equal(meals.length,1);assert.equal(meals[0].foods.length,2);assert.equal(meals[0].meal,'dinner');assert.equal(meals[0].foods[0].calories,220);
    // Finger-follow child Back restores the actual plate parent, not Today.
    await summary().first().click();await settle(p);const frames=await drag(p,engine,{selector:'.add-flow-backdrop',x:8,y:230,dx:280});
    assert.ok(frames.some(f=>f.x>15),'child follows finger');assert.equal(await summary().count(),2);assert.equal(await p.locator('#scanReviewTitle').textContent(),'2 foods detected');
    await summary().nth(1).click();await p.locator('[data-scan-action=toggle]').click();assert.equal(await summary().count(),1);assert.equal(await p.locator('#scanTotalCalories').textContent(),'220');await p.locator('#scanRemoveUndo').click();assert.equal(await summary().count(),2);assert.equal(await p.locator('#scanTotalCalories').textContent(),'544');
    // Selecting a different photo starts a different draft; six long names stay usable.
    await p.locator('#closeFoodModal').click();await p.locator('.unified-scanner').waitFor();reply={foods:Array.from({length:7},(_,i)=>({...plate.foods[i%3],name:`Food ${i+1} ${'verylongname'.repeat(7)}`}))};
    await choose(await imageFile(p,[500,2200]));await summary().nth(6).waitFor();assert.equal(await summary().count(),7);assert.equal(await p.locator('#scanAddSelectedFoods').textContent(),'Add 7 foods');
    const bounds=await summary().evaluateAll(rows=>rows.map(row=>{const r=row.getBoundingClientRect(),k=row.querySelector('.scan-plate-kcal').getBoundingClientRect();return {height:r.height,right:r.right,kcal:k.right};}));
    assert.ok(bounds.every(r=>r.height>=44&&r.kcal<=r.right&&r.right<=width));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    // Current portion vocabulary is bounded to g/ml/piece/serving. Stress its
    // wrapping separately with a localized-length label, not a new data unit.
    const longPortion=await summary().first().evaluate(row=>{
      const label=row.querySelector('small'),previous=label.textContent;
      label.textContent='1234.5 generous servings with a longer localized portion description';
      const ok=label.getBoundingClientRect().right<=row.querySelector('.scan-plate-kcal').getBoundingClientRect().left;
      label.textContent=previous;return ok;
    });assert.equal(longPortion,true,'long portion labels wrap without colliding with kcal');
    await summary().last().click();await p.locator('[data-scan-field=amount]').fill('.');await p.locator('#closeFoodModal').click();assert.equal(await summary().count(),0,'invalid portion cannot leave child silently');
    await p.locator('[data-scan-field=amount]').fill('0,5');await p.locator('#closeFoodModal').click();await summary().nth(6).waitFor();assert.equal(count,2);
    // Native Back invalidates analysis while retaining the current photo source.
    await p.locator('#closeFoodModal').click();hold=true;await p.locator('[data-food-analyze]').click();while(!pending)await p.waitForTimeout(10);await p.goBack();await pending.fulfill({json:{analysis:plate}}).catch(()=>{});pending=null;await settle(p);
    assert.equal(await p.locator('.unified-scanner').getAttribute('data-food-phase'),'source');assert.equal(await p.locator('.scanner-photo-preview').isVisible(),true);
    await p.locator('.package-scan-close').click();await p.locator('#closeFoodModal').click();await settle(p);
    assert.equal((await diary()).length,0);assert.equal(await p.evaluate(()=>photoUrls.size),0,'all ephemeral URLs released after leaving');
    assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
    results.push({engine,width,theme,status:'PASS',analysisRequests:count,corrections,checks:'2 foods; viewer/focus; replacement cancel/success/late response; Return never logs; nutrition/identity/sibling preservation; Save as meal without logging; native/synthetic finger-follow child Back; Remove/Undo; 7 long names/tall photo; long portion wrapping; invalid/comma amount; native Back pending; URL cleanup'});console.log('PASS',engine,width,theme);
  }catch(error){await p.screenshot({path:`${out}/${engine}-${width}-${theme}-failure.png`});await writeFile(`${out}/failure.json`,JSON.stringify({error:error.stack,errors:await p.evaluate(()=>qaErrors)},null,2));throw error;}finally{await c.close();}
 }}finally{await b.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
