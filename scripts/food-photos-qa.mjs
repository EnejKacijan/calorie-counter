import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,openFood,settle,out,read} from './add-flow-harness.mjs';
const results=[];
await mkdir(out,{recursive:true});
const keys={state:'calorie-counter-state',recent:'calorie-counter-food-library',saved:'calorie-counter-saved-foods'};
export async function photoFixture(p,width=2400,height=1800) {
  // Synthetic QA food illustration, never a network/stock food image.
  const encoded=await p.evaluate(({width,height})=>{
    const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');g.scale(width/800,height/600);
    g.fillStyle='#746b59';g.fillRect(0,0,800,600);g.fillStyle='#eee8da';g.beginPath();g.ellipse(400,300,290,240,0,0,7);g.fill();g.fillStyle='#d4c9b7';g.beginPath();g.ellipse(400,300,250,200,0,0,7);g.fill();
    for(let i=0;i<850;i++){const a=i*2.39996,r=Math.sqrt(i/850)*135,x=340+Math.cos(a)*r,y=300+Math.sin(a)*r;g.fillStyle=i%3?'#f3e8be':'#dfd19e';g.beginPath();g.ellipse(x,y,6,3,a,0,7);g.fill();}
    for(let i=0;i<35;i++){const x=475+(i*47%125),y=180+(i*71%240);g.fillStyle=['#688043','#465e32','#859953'][i%3];g.beginPath();g.arc(x,y,20,0,7);g.fill();}
    for(let i=0;i<16;i++){g.fillStyle='#c97936';g.fillRect(300+i*79%160,200+i*83%200,22,13);}
    return c.toDataURL('image/jpeg',.94).split(',')[1];
  },{width,height});
  return{name:'qa-rice-vegetables.jpg',mimeType:'image/jpeg',buffer:Buffer.from(encoded,'base64')};
}
export async function create(b,engine,width,theme,video=false,options={}){
  const q=await setup(b,{engine,width,theme,height:844,video,...options,beforeOpen:async({c,p})=>{
    await c.addInitScript(()=>{
      if(!sessionStorage.getItem('qa-photo-seeded')){const s=JSON.parse(localStorage.getItem('calorie-counter-state'));const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');s.selectedDate=day;s.days[day]={foods:[],exercises:[]};localStorage.setItem('calorie-counter-state',JSON.stringify(s));sessionStorage.setItem('qa-photo-seeded','true');}
      localStorage.setItem('calorie-counter-ai-consent-v1',JSON.stringify({photo:true,label:true}));
      // Page routing can be bypassed by a controlling SW in WebKit. Keep AI
      // deterministic at the page fetch boundary; no QA photo reaches an API.
      const realFetch=window.fetch.bind(window);window.fetch=(input,options)=>{
        if(new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/foods/analyze-image')return Promise.resolve(new Response(JSON.stringify({analysis:{confidence:'medium',foods:[{name:'Rice with roasted vegetables',amount:1,unit:'serving',servingGrams:250,calories:320,protein:9,carbs:53,fat:8,confidence:'medium'}]}}),{headers:{'Content-Type':'application/json'}}));
        return realFetch(input,options);
      };
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{throw new DOMException('QA no camera','NotAllowedError');}}});
      window.qaMediaReads=[];window.qaUrls={created:0,revoked:0,live:new Set()};
      window.qaLoadId=Math.random();
      const get=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(key){if(this.name==='blobs')qaMediaReads.push(key);return get.call(this,key);};
      const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=function(blob){qaUrls.created++;const url=create.call(this,blob);qaUrls.live.add(url);return url;};URL.revokeObjectURL=function(url){qaUrls.revoked++;qaUrls.live.delete(url);return revoke.call(this,url);};
    });
    await p.route('**/api/foods/analyze-image',r=>r.fulfill({json:{analysis:{confidence:'medium',foods:[{name:'Rice with roasted vegetables',amount:1,unit:'serving',servingGrams:250,calories:320,protein:9,carbs:53,fat:8,confidence:'medium'}]}}}));
  }});
  await q.p.locator('#calendarStrip .day-tile').first().waitFor();return q;
}
const media=p=>p.evaluate(async()=>{const {foodMedia}=await import('/food-media-runtime.js?v=1');return foodMedia.list();});
const entries=async p=>Object.values((await read(p)).days).flatMap(d=>d.foods||[]);
async function screenshot(p,name,width,theme){assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');if(width===390)await p.screenshot({path:`${out}/${name}-${theme}-390.png`});}
let current,stage;
if(process.env.PHOTO_FIXTURES_ONLY!=='1'){
try{
  for(const engine of (process.env.PHOTO_SMOKE==='1'?['chromium']:['chromium','webkit'])){
    const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
    for(const width of (process.env.PHOTO_SMOKE==='1'?[390]:[320,375,390,430]))for(const theme of (process.env.PHOTO_SMOKE==='1'?['dark']:['light','dark'])){
      stage=`${engine} ${width} ${theme}`;console.log(stage);const {c,p}=await create(b,engine,width,theme,engine==='chromium'&&width===390&&theme==='dark');current=p;
      await openFood(p);await p.locator('#foodScanButton').click();await p.locator('.unified-scanner[data-camera-state=error]').waitFor();
      const image=await photoFixture(p),chooser=p.waitForEvent('filechooser');await p.locator('[data-gallery]').click();await(await chooser).setFiles(image);
      await p.locator('#scanFoodList .scan-plate-row').first().waitFor();await p.locator('#scanReview .food-photo-thumb img').waitFor();
      assert.equal((await media(p)).length,0,'review does not persist binary');await screenshot(p,'review',width,theme);
      await p.locator('#scanAddSelectedFoods').click();await p.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('calorie-counter-state')).days).some(d=>d.foods?.some(f=>f.photoMediaId)));
      await p.locator('.log-panel.is-adding').waitFor({state:'hidden'});await settle(p);
      let foods=await entries(p);assert.equal(foods.length,1);const id=foods[0].photoMediaId;assert.ok(id);
      assert.equal((await media(p))[0].width,1920);assert.equal((await media(p))[0].thumbnailWidth,160);
      await p.locator('#foodList .food-photo-thumb img').first().waitFor();await p.locator('#foodList').scrollIntoViewIfNeeded();
      await p.waitForFunction(()=>document.querySelector('#foodList .food-photo-thumb img')?.naturalWidth===160);
      const thumb=p.locator('#foodList .food-photo-thumb').first();const r=await thumb.boundingBox();assert.ok(r.width>=44&&r.width<=48);assert.ok(r.height>=44&&r.height<=48);
      assert.equal(await p.evaluate(()=>qaMediaReads.filter(k=>k.endsWith(':full')).length),0,'list never reads original');
      await thumb.click();await p.waitForFunction(()=>document.querySelector('.food-photo-viewer img')?.naturalWidth===1920);await screenshot(p,'viewer',width,theme);
      await p.locator('[data-photo-in]').click();assert.equal(await p.locator('.food-photo-viewer').getAttribute('data-photo-scale'),'1.5');
      const stageRect=await p.locator('.food-photo-stage').boundingBox();await p.mouse.move(stageRect.x+stageRect.width/2,stageRect.y+stageRect.height/2);await p.mouse.down();await p.mouse.move(stageRect.x+stageRect.width/2+50,stageRect.y+stageRect.height/2+60,{steps:8});await p.mouse.up();
      assert.equal(await p.locator('.food-photo-viewer').count(),1);await p.locator('[data-photo-fit]').click();assert.equal(await p.locator('.food-photo-viewer').getAttribute('data-photo-scale'),'1');
      await p.keyboard.press('Escape');await p.locator('.food-photo-viewer').waitFor({state:'detached'});await settle(p);assert.equal(await thumb.evaluate(e=>e===document.activeElement),true,'viewer focus return');
      // Save through the established diary overflow; select cover through Saved.
      await p.locator('#foodList .entry-actions-toggle').first().click();await p.locator('[data-entry-action=save]').click();await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'[]').length===1,keys.saved);await settle(p);
      const saved=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),keys.saved);assert.equal(saved[0].coverImageId,id);assert.equal(saved[0].photoMediaId,undefined);
      await openFood(p);await screenshot(p,'recent',width,theme);assert.equal(await p.locator('#foodSuggestions .food-photo-thumb').count(),1);
      await p.locator('[data-food-filter=my]').click();await settle(p);await screenshot(p,'saved',width,theme);
      await p.locator('#foodSuggestions .suggestion-card').first().click();await settle(p);
      await p.locator('#manualFoodSubmit').click();await p.locator('.log-panel.is-adding').waitFor({state:'hidden'});await settle(p);
      foods=await entries(p);assert.equal(foods.length,2);assert.equal(foods.filter(f=>f.photoMediaId).length,1,'cover is not a new occurrence photo');
      await p.locator('#foodList').scrollIntoViewIfNeeded();await screenshot(p,'today-mixed',width,theme);
      assert.equal(await p.locator('#foodList .food-photo-thumb').count(),1);assert.equal(await p.locator('#foodList .entry-main').count(),2);
      await p.reload();await p.locator('#calendarStrip .day-tile').first().waitFor();await p.locator('#foodList .food-photo-thumb').scrollIntoViewIfNeeded();await p.waitForFunction(()=>document.querySelector('#foodList .food-photo-thumb img')?.naturalWidth===160);
      assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
      results.push({engine,width,theme,status:'PASS',media:(await media(p)).length});await c.close();
    }await b.close();
  }
  await writeFile(`${out}/photo-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,results}));
}catch(error){console.error(stage,error);if(current)await current.screenshot({path:`${out}/photo-failure.png`});process.exitCode=1;}
finally{process.exit(process.exitCode||0);}
}
