import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,openFood,settle} from './add-flow-harness.mjs';
process.env.PHOTO_FIXTURES_ONLY='1';
const {photoFixture}=await import('./food-photos-qa.mjs');
const out=process.env.INTAKE_QA_OUTPUT||'artifacts/peer-photo-diagnosis';
await mkdir(out,{recursive:true});
const results=[];
const rows=p=>p.evaluate(()=>[...document.querySelectorAll('#foodSuggestions .food-photo-thumb')].map(b=>({src:!!b.querySelector('img').getAttribute('src'),width:b.querySelector('img').naturalWidth,id:b.dataset.photoId})));
const filter=p=>p.locator('[data-food-filter][aria-pressed=true]').getAttribute('data-food-filter');
async function select(p,name){await p.locator(`[data-food-filter=${name}]`).click();await settle(p);assert.equal(await filter(p),name);}
async function touch(p,type,x,y){await p.evaluate(({type,x,y})=>{
  if(type==='touchstart')window.peerPhotoTarget=document.elementFromPoint(x,y);
  const point={identifier:11,target:peerPhotoTarget,clientX:x,clientY:y},event=new Event(type,{bubbles:true,cancelable:true});
  Object.defineProperties(event,{touches:{value:type==='touchend'||type==='touchcancel'?[]:[point]},changedTouches:{value:[point]}});
  peerPhotoTarget.dispatchEvent(event);
},{type,x,y});}
async function drag(p,{cancel=false,capture=false,startSelector}={}){
  const box=await p.locator('#foodFilterViewport').boundingBox();
  const start=startSelector?await p.locator(startSelector).first().boundingBox():null;
  const x=start?start.x+start.width/2:Math.min(box.x+box.width-22,300);
  const y=start?start.y+start.height/2:box.y+Math.min(45,box.height/2);
  await touch(p,'touchstart',x,y);
  const samples=[];
  for(const fraction of cancel?[.1,.2]:[.25,.5,.75]){
    await touch(p,'touchmove',x-box.width*fraction,y);await p.waitForTimeout(34);
    const sample=await p.evaluate(()=>({active:document.querySelector('[data-food-filter][aria-pressed=true]')?.dataset.foodFilter,
      images:[...document.querySelector('.peer-pane-track')?.lastElementChild?.querySelectorAll('.food-photo-thumb img')||[]].map(img=>({src:!!img.getAttribute('src'),width:img.naturalWidth})),
      reads:peerPhotoReads.length}));
    assert.equal(sample.active,'my','selection must wait for release');
    assert.ok(sample.images.length&&sample.images.every(img=>img.src&&img.width===160),'incoming thumbnails decoded during drag');
    samples.push({fraction,...sample});
    if(capture)await p.screenshot({path:`${out}/swipe-${Math.round(fraction*100)}.png`});
  }
  await touch(p,cancel?'touchcancel':'touchend',x-box.width*(cancel?.2:.75),y);await settle(p);
  if(capture)await p.screenshot({path:`${out}/swipe-${cancel?'cancel':'100'}.png`});
  return samples;
}
for(const engine of ['chromium','webkit']){
  const browser=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
  try{for(const width of [320,375,390,393,430])for(const theme of ['light','dark']){
    const reduce=engine==='webkit'&&width===390&&theme==='light',video=engine==='webkit'&&width===390&&theme==='dark';
    const {c,p}=await setup(browser,{engine,width,theme,reduce,video,beforeOpen:async({c})=>c.addInitScript(()=>{
      window.peerPhotoReads=[];window.peerPhotoUrls={created:0,revoked:0};
      const get=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(key){if(this.name==='blobs')peerPhotoReads.push(String(key));return get.call(this,key);};
      const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
      URL.createObjectURL=function(blob){peerPhotoUrls.created++;return create.call(this,blob);};
      URL.revokeObjectURL=function(url){peerPhotoUrls.revoked++;return revoke.call(this,url);};
    })});
    try{
      const fixture=await photoFixture(p,800,600);
      const id=await p.evaluate(async bytes=>{const {normalizeFoodPhoto}=await import('/food-media.js?v=1'),{foodMedia}=await import('/food-media-runtime.js?v=1');return foodMedia.put(await normalizeFoodPhoto(new Blob([new Uint8Array(bytes)],{type:'image/jpeg'})));},[...fixture.buffer]);
      await p.evaluate(id=>{
        const foods=Array.from({length:10},(_,i)=>({id:'peer-photo-'+i,catalogId:'peer-photo-'+i,name:'Photo food '+i,source:'Photo estimate',serving:'1 serving',calories:100+i,protein:10,carbs:10,fat:4,lastUsedAt:new Date(Date.now()-i*1000).toISOString(),...(i<4?{photoMediaId:id}:{})}));
        localStorage.setItem('calorie-counter-food-library',JSON.stringify(foods));
        localStorage.setItem('calorie-counter-saved-foods',JSON.stringify([{...foods[0],photoMediaId:undefined,coverImageId:id}]));
      },id);
      await p.reload();await p.locator('#floatingAddButton').waitFor();await openFood(p);
      await p.waitForFunction(()=>[...document.querySelectorAll('#foodSuggestions .food-photo-thumb img')].length===4&&[...document.querySelectorAll('#foodSuggestions .food-photo-thumb img')].every(img=>img.naturalWidth===160));
      const phases=[{name:'all',images:await rows(p)}];
      await select(p,'my');phases.push({name:'saved',images:await rows(p)});
      await select(p,'recent');phases.push({name:'recent',images:await rows(p)});
      await select(p,'usda');await select(p,'recent');phases.push({name:'usda-return',images:await rows(p)});
      await select(p,'all');phases.push({name:'all-return',images:await rows(p)});
      await select(p,'my');const before=await p.evaluate(()=>peerPhotoReads.length);
      const cancelled=reduce?[]:await drag(p,{cancel:true,startSelector:'#foodSuggestions .food-photo-thumb img'});assert.equal(await filter(p),'my');
      const committed=reduce?[]:await drag(p,{capture:video});if(reduce)await select(p,'recent');
      assert.equal(await filter(p),'recent');phases.push({name:'swipe-return',images:await rows(p)});
      for(const phase of phases)assert.ok(phase.images.length&&phase.images.every(i=>i.src&&i.width===160&&i.id===id),`${engine} ${width} ${theme} ${phase.name}`);
      const counts=await p.evaluate(()=>({reads:peerPhotoReads.length,created:peerPhotoUrls.created,revoked:peerPhotoUrls.revoked}));
      assert.equal(counts.reads,before,'no per-frame IDB read');assert.ok(counts.created-counts.revoked<=32,'bounded URLs');
      assert.equal(await p.evaluate(()=>peerPhotoReads.filter(key=>key.endsWith(':full')).length),0,'peer panes use thumbnails only');
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(video){
        await c.setOffline(true);await select(p,'all');await select(p,'recent');
        assert.ok((await rows(p)).every(image=>image.src&&image.width===160),'offline local photos remain visible');
        await c.setOffline(false);
        const fallback=await p.evaluate(async()=>{
          const {createFoodThumbnails}=await import('/food-photo-ui.js?v=7');
          const root=document.createElement('div');document.body.append(root);
          let dispose;const thumbs=createFoodThumbnails({root,viewer:{open(){}},onDispose:fn=>dispose=fn});
          const missing='photo-missing1234',corrupt='photo-corrupt1234';
          const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('intake-food-media-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
          await new Promise((resolve,reject)=>{const tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put({id:corrupt+':thumb',bytes:new Uint8Array([1,2,3,4]).buffer});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
          const a=thumbs.button(missing,'missing'),b=thumbs.button(corrupt,'corrupt');root.append(a,b);
          await thumbs.prime([missing,corrupt]);await new Promise(resolve=>setTimeout(resolve,80));
          const result=[a,b].map(button=>({src:!!button.querySelector('img').getAttribute('src'),width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height}));
          dispose();root.remove();db.close();return result;
        });
        assert.ok(fallback.every(item=>!item.src&&item.width>=44&&item.height>=44),'missing/corrupt images keep stable non-broken footprint');
        await select(p,'all');await p.waitForTimeout(1000);await select(p,'recent');await p.waitForTimeout(1000);
        await writeFile(`${out}/recording-path.txt`,await p.video().path());
      }
      results.push({engine,width,theme,reduce,status:'PASS',phases:phases.map(({name,images})=>({name,count:images.length})),cancelled,committed,counts});
      console.log(`PASS ${engine} ${width} ${theme}${reduce?' reduced':''}`);
    }finally{await c.close();}
  }}finally{await browser.close();}
}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length}));
