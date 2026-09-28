import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pw, setup, openFood, settle, read } from './add-flow-harness.mjs';
const out = process.env.INTAKE_QA_OUTPUT || 'artifacts/gallery-flow/mobile';
await mkdir(out, { recursive: true });
const smoke = process.env.GALLERY_SMOKE === '1';
export const plate = { foods: [
  {name:'Grilled sausages',amount:7,unit:'piece',servingGrams:350,calories:840,protein:49,carbs:7,fat:63},
  {name:'Sourdough bread slices',amount:3,unit:'piece',servingGrams:120,calories:324,protein:12,carbs:63,fat:3.6},
  {name:'Ketchup',amount:2,unit:'serving',servingGrams:30,calories:60,protein:0,carbs:12,fat:0},
] };
const results=[];
export async function imageFile(p, shape) {
  const base64 = await p.evaluate(shape => {
    const canvas=document.createElement('canvas'); [canvas.width,canvas.height]=shape;
    const g=canvas.getContext('2d');g.fillStyle='#73533b';g.fillRect(0,0,canvas.width,canvas.height);
    g.translate(canvas.width/2,canvas.height/2); const r=Math.min(canvas.width,canvas.height)*.42;
    g.fillStyle='#f4ecd7';g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();
    g.fillStyle='#9d502a';for(let i=0;i<4;i++){g.beginPath();g.roundRect(-r*.65,-r*.6+i*r*.3,r*.7,r*.2,r*.1);g.fill();}
    g.fillStyle='#d8b778';g.fillRect(r*.2,-r*.5,r*.45,r*.7);g.fillStyle='#b92c25';g.beginPath();g.arc(r*.35,r*.4,r*.2,0,Math.PI*2);g.fill();
    return canvas.toDataURL('image/jpeg',.9).split(',')[1];
  },shape);
  return {name:'synthetic-plate.jpg',mimeType:'image/jpeg',buffer:Buffer.from(base64,'base64')};
}
const entries=async p=>{const s=await read(p);return s.days[s.selectedDate].foods;};
async function visible(p, selector) { assert.equal(await p.locator(selector).isVisible(),true,selector+' visible'); }
async function hidden(p, selector) { assert.equal(await p.locator(selector).isVisible(),false,selector+' hidden'); }
if(process.env.GALLERY_FIXTURES_ONLY !== '1') for(const engine of (smoke?['chromium']:['chromium','webkit'])) {
 const browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 try {for(const [width,height] of (smoke?[[390,844]]:[[320,720],[375,667],[390,844],[393,852],[430,932]])) for(const theme of (smoke?['dark']:['light','dark'])) for(const reduce of (smoke?[false]:[false,true])) {
  const tag=`${engine}-${width}-${theme}-${reduce?'reduced':'motion'}`;
  const {p,c}=await setup(browser,{width,height,theme,reduce,engine,beforeOpen:async({c})=>{
    await c.addInitScript(()=>{
      localStorage.setItem('calorie-counter-ai-consent-v1',JSON.stringify({photo:true,label:true}));
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:undefined});
      window.galleryUrls=new Set();const make=URL.createObjectURL,revoke=URL.revokeObjectURL;
      URL.createObjectURL=function(blob){const url=make.call(this,blob);galleryUrls.add(url);return url;};
      URL.revokeObjectURL=function(url){galleryUrls.delete(url);return revoke.call(this,url);};
    });
  }});
  let requests=0,reply=plate,error=false,pending=null,hold=true;
  await p.route('**/api/foods/analyze-image',async route=>{requests++;if(hold){pending=route;return;}await route.fulfill({status:error?500:200,json:error?{error:'PRIVATE PROVIDER ERROR'}:{analysis:reply}});});
  await p.route('**/api/foods/correct-image-item',route=>route.fulfill({json:{food:{...plate.foods[0],name:'Chicken sausage',amount:1,unit:'piece',calories:100,protein:10,carbs:1,fat:6}}}));
  const finish=async()=>{while(!pending)await p.waitForTimeout(10);const route=pending;pending=null;await route.fulfill({status:error?500:200,json:error?{error:'PRIVATE PROVIDER ERROR'}:{analysis:reply}}).catch(()=>{});};
  const shot=async name=>{await settle(p);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');if(width===390&&!reduce){await writeFile(`${out}/${tag}-${name}-geometry.json`,JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('.scanner-header,.scanner-header header,#packageScanTitle,.package-scan-close')].map(e=>({tag:e.className||e.id,rect:e.getBoundingClientRect().toJSON(),style:Object.fromEntries(['display','visibility','opacity','color','position','transform'].map(k=>[k,getComputedStyle(e)[k]]))}))),null,2));await p.screenshot({path:`${out}/${tag}-${name}.png`});}};
  const choose=async file=>{const picker=p.waitForEvent('filechooser');await p.locator('[data-gallery]').click();await(await picker).setFiles(file);};
  try {
    await openFood(p);await p.locator('#foodScanButton').click();
    const file=await imageFile(p,width===375?[600,2400]:width===393?[700,1000]:[1000,700]);
    await choose(file);await p.locator('.unified-scanner[data-food-phase=analyzing]').waitFor();
    await visible(p,'.scanner-photo-preview');await hidden(p,'.scanner-controls');await hidden(p,'[data-enter-manual]');
    assert.match(await p.locator('.scanner-photo-status').innerText(),/Analyzing your photo/);assert.doesNotMatch(await p.locator('.unified-scanner').innerText(),/Processing|Analyzing food|PRIVATE/);
    await p.locator('.scanner-photo-preview').evaluate(image=>image.decode());await p.waitForTimeout(350);
    await shot('analyzing');const analysisUrl=await p.locator('.scanner-photo-preview').getAttribute('src');
    await finish();await p.locator('.scan-plate-row').first().waitFor();await shot('summary');
    const reviewUrl=await p.locator('#scanReview .food-photo-thumb img').getAttribute('src');
    assert.equal(requests,1);assert.equal(await p.locator('.scan-plate-row').count(),3);await hidden(p,'#foodAmount');await hidden(p,'#foodUnit');await hidden(p,'#closeScanReview');await hidden(p,'#foodNutritionSummary');
    assert.doesNotMatch(await p.locator('#scanReview').innerText(),/Simple view|Change food|Remove|1 serving/);assert.equal((await entries(p)).length,0);
    const rows=p.locator('.scan-plate-row');const rowId=await rows.first().getAttribute('data-scan-food-id');
    await rows.first().click();await p.locator('[data-scan-field=amount]').fill('6');await shot('item');
    assert.equal(await p.locator('.scan-food-details-toggle').evaluate(e=>Math.abs(e.getBoundingClientRect().width-e.closest('.scan-food-card').getBoundingClientRect().width)<1),true,'nutrition disclosure aligns with the child editor, without the old item-number gutter');
    await p.locator('#closeFoodModal').click();await settle(p);
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.scanFoodId),rowId);
    assert.match(await rows.first().innerText(),/6 pieces/);assert.equal(await p.locator('#scanTotalCalories').textContent(),'1104');
    await rows.nth(2).click();await p.locator('[data-scan-field=amount]').fill('0,5');await p.locator('#closeFoodModal').click();
    assert.equal(await p.locator('#scanTotalCalories').textContent(),'1059');assert.equal(requests,1,'local portion edits never call AI');
    await p.locator('#scanReviewMeal').selectOption('lunch');
    // Confirmed persistence failure keeps the entire plate, then two taps commit once.
    await p.evaluate(()=>{qaFailStorage=true;});await p.locator('#scanAddSelectedFoods').click();await p.locator('.scan-review-footer .add-entry-status').waitFor();
    assert.equal((await entries(p)).length,0);assert.equal(await rows.count(),3);
    await p.evaluate(()=>{qaFailStorage=false;window.firstToday=[];const tick=()=>{const host=document.querySelector('.add-flow-host');if(host){requestAnimationFrame(tick);return;}firstToday.push({rows:document.querySelectorAll('#foodList [data-food-entry-id]').length,text:document.querySelector('#foodList').textContent});};requestAnimationFrame(tick);document.querySelector('#scanAddSelectedFoods').click();document.querySelector('#scanAddSelectedFoods').click();});
    await p.waitForFunction(()=>!document.querySelector('.add-flow-host'));await settle(p);
    const foods=await entries(p);assert.equal(foods.length,3);assert.equal(new Set(foods.map(f=>f.id)).size,3);assert.ok(foods.every(f=>f.meal==='lunch'&&f.captureId&&!f.photoMediaId));assert.equal(new Set(foods.map(f=>f.captureId)).size,1);assert.deepEqual(foods.map(f=>f.amount),[6,3,.5]);
    assert.equal(await p.evaluate(()=>firstToday[0].rows),3);assert.equal(requests,1);await shot('today');
    assert.equal(await p.evaluate(urls=>urls.every(url=>!galleryUrls.has(url)),[analysisUrl,reviewUrl]),true,'successful Add releases scanner and review object URLs');
    // New analysis error retains its photo. Retry submits one new request.
    await openFood(p);await p.locator('#foodScanButton').click();await choose(file);error=true;await finish();await p.locator('.unified-scanner[data-food-phase=error]').waitFor();await shot('error');
    await visible(p,'.scanner-photo-preview');assert.doesNotMatch(await p.locator('.unified-scanner').innerText(),/PRIVATE PROVIDER/);
    const errorActions=await p.evaluate(()=>['[data-retry]','[data-gallery]'].map(s=>getComputedStyle(document.querySelector(s)).backgroundColor));
    assert.notEqual(errorActions[0],errorActions[1],'Retry is primary; choosing another photo is secondary');
    error=false;reply={foods:[]};await p.locator('[data-retry]').click();await finish();await p.locator('#scanNoFood').waitFor();await hidden(p,'#scanAddSelectedFoods');await hidden(p,'#scanReviewMeal');
    await p.locator('#closeFoodModal').click();await p.locator('.unified-scanner[data-food-phase=source]').waitFor();await visible(p,'.scanner-photo-preview');
    // Cancel analysis -> same photo source, late completion must not create review.
    await p.locator('[data-food-analyze]').click();while(!pending)await p.waitForTimeout(10);await p.locator('.package-scan-close').click();reply=plate;await finish();await settle(p);
    assert.equal(await p.locator('.unified-scanner').getAttribute('data-food-phase'),'source');await hidden(p,'#scanReview');
    await choose(file);reply={foods:[plate.foods[0]]};await finish();await p.locator('.scan-plate-row').waitFor();assert.equal(await p.locator('.scan-plate-row').count(),1);
    await p.locator('.scan-plate-row').click();await p.locator('[data-scan-action=toggle]').click();await p.locator('#scanNoFood').waitFor();await hidden(p,'#scanAddSelectedFoods');
    await p.locator('#closeFoodModal').click();await p.locator('.package-scan-close').click();await p.locator('#closeFoodModal').click();await settle(p);
    assert.deepEqual(await p.evaluate(()=>qaErrors),[]);assert.equal((await entries(p)).length,3);
    results.push({tag,status:'PASS',requests});console.log('PASS',tag);
  } catch(error) {await p.screenshot({path:`${out}/${tag}-failure.png`});await writeFile(`${out}/failure.json`,JSON.stringify({tag,error:error.stack,errors:await p.evaluate(()=>qaErrors)},null,2));throw error;}
  finally {await c.close();}
 }} finally {await browser.close();}
}
if(process.env.GALLERY_FIXTURES_ONLY !== '1') await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
