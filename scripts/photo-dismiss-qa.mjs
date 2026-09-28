import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,read,seedPhotoDiary,group,settle,opened,closed,instrument,drag,input} from './photo-dismiss-harness.mjs';
process.env.PLATE_FIXTURES_ONLY='1';
const {prepare,scan}=await import('./plate-photo-probe.mjs');
const out=process.env.INTAKE_QA_OUTPUT||'artifacts/photo-dismiss',results=[];await mkdir(out,{recursive:true});
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1.2,`${label}: ${a} vs ${b}`);
const stable=(trace)=>{const first=trace.frames[0];for(const f of trace.frames){near(f.scroll,first.scroll,'scroll');for(const k of ['footer','fab','app'])for(const axis of ['x','y','width','height'])near(f[k][axis],first[k][axis],`${k}.${axis}`);if(f.phase)assert.equal(f.inert,true);}};
for(const engine of (process.env.PHOTO_ENGINE?.split(',')||['chromium','webkit'])){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
 try{for(const[width,height]of(process.env.PHOTO_QUICK?[[390,844]]:[[375,667],[390,844],[393,852],[430,932]]))for(const theme of(process.env.PHOTO_QUICK?['dark']:['light','dark']))for(const reduce of[false,true]){
  const tag=`${engine}-${width}-${theme}-${reduce?'reduce':'motion'}`,primary=width===390&&theme==='dark',checks=[],traces={};let stage='seed';
  const {p,c}=await setup(b,{engine,width,height,theme,reduce,beforeOpen:prepare});
  try{
   await seedPhotoDiary(p,{long:true,individual:true});await p.evaluate(instrument);const data=await read(p);
   const run=async(name,options={},commit=false)=>{stage=name;const t=await drag(p,engine,options);stable(t);traces[name]=t;if(commit){await closed(p);assert.equal(await p.locator(group).evaluate(e=>e===document.activeElement),true);}else if(!options.keep){assert.equal(await p.locator('.food-photo-viewer').getAttribute('data-photo-state'),'open');const s=await p.evaluate(()=>dismissSample());near(s.pose.y,0,'cancel.y');near(s.pose.scale,1,'cancel.scale');assert.equal(s.scrim,1);}checks.push(name);return t;};
   await opened(p);
   let t=await run('10% slow cancel',{ratio:.1});assert.equal(t.active.phase,'dragging');near(t.active.pose.y,t.distance,'finger following');assert.ok(t.active.pose.scale<1&&t.active.scrim<1);
   await run('20% slow cancel',{ratio:.2});
   await run('horizontal rejected',{ratio:.015,dx:90});
   await run('ambiguous rejected',{ratio:.1,dx:70});
   await run('upward rejected',{ratio:-.1});
   await run('stale fast movement cancels',{distance:90,steps:2,delay:12,hold:160});
   t=await run('distance commit',{ratio:.32},true);assert.ok(t.active.scrim>0&&t.active.scrim<.5);if(!reduce){const effect=t.effects.find(e=>e.target==='food-photo-frame');assert.ok(effect);assert.match(effect.frames[1].transform,/translate\(/);}
   await opened(p);await run('fast flick commit',{distance:100,steps:2,delay:8,hold:0},true);
   await opened(p);await p.locator('[data-photo-in]').tap();await run('zoomed pan does not dismiss',{ratio:.32});assert.equal(await p.locator('.food-photo-viewer').getAttribute('data-photo-scale'),'1.5');
   await p.locator('[data-photo-fit]').tap();await run('Fit then fresh gesture commits',{ratio:.32},true);
   await opened(p);await run('pointer cancellation',{ratio:.32,cancel:true});
   await run('rapid cancel',{ratio:.1,hold:130,keep:true});await run('immediate next gesture commits',{ratio:.32},true);
   // Same viewer from all existing photo sources, with drafts/storage unchanged.
   stage='individual source';await opened(p,'[data-food-entry-id="photo-single"] .food-photo-thumb');t=await drag(p,engine,{ratio:.32});stable(t);await closed(p);assert.equal(await p.locator('[data-food-entry-id="photo-single"] .food-photo-thumb').evaluate(e=>e===document.activeElement),true);checks.push(stage);
   await p.locator('.scanned-meal-toggle').tap();await settle(p);await p.locator('.scanned-meal-children .entry-main').first().tap();await settle(p);
   stage='Edit Food plate source';const amount=await p.locator('#foodAmount').inputValue();await opened(p,'.food-plate-context .plate-photo-row');t=await drag(p,engine,{ratio:.32});stable(t);await closed(p);assert.equal(await p.locator('#foodAmount').inputValue(),amount);assert.equal(await p.locator('.food-plate-context .plate-photo-row').evaluate(e=>e===document.activeElement),true);checks.push(stage);
   await p.locator('#closeFoodModal').tap();await settle(p);
   if(primary){
    for(const event of ['blur','resize','orientationchange','visibilitychange']){
     await opened(p);stage='interrupt '+event;await run(stage,{ratio:.15,interrupt:async()=>p.evaluate(event=>{if(event==='visibilitychange'){Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event(event));delete document.hidden;}else dispatchEvent(new Event(event));},event)});await p.locator('[data-photo-close]').tap();await closed(p);
    }
    stage='pinch interrupts active dismiss; no handoff mid-sequence';await opened(p);
    const r=await p.locator('.food-photo-stage').boundingBox(),x=width/2,y=r.y+140,io=await input(p,engine);
    await io.send('touchStart',[{x,y}]);await io.send('touchMove',[{x,y:y+70}]);await p.waitForTimeout(30);assert.equal(await p.locator('.food-photo-viewer').getAttribute('data-photo-state'),'dragging');
    await io.send('touchStart',[{id:1,x,y:y+70},{id:2,x:x+45,y:y+100}]);await io.send('touchMove',[{id:1,x:x-45,y:y+30},{id:2,x:x+90,y:y+160}]);await p.waitForTimeout(30);assert.ok(Number(await p.locator('.food-photo-viewer').getAttribute('data-photo-scale'))>1);
    assert.equal((await p.evaluate(()=>dismissSample())).scrim,1);await io.send('touchEnd',[]);await io.dispose();await p.locator('[data-photo-fit]').tap();await run('fresh gesture after pinch',{ratio:.32},true);checks.push(stage);
    stage='missing live thumbnail fallback';await opened(p);
    t=await drag(p,engine,{ratio:.32,interrupt:async()=>p.locator(group).evaluate(e=>{e.dataset.qaStyle=e.getAttribute('style')||'';e.style.setProperty('display','none','important');})});await closed(p);
    if(!reduce){const effect=t.effects.find(e=>e.target==='food-photo-frame');assert.match(effect.frames[1].transform,/translate3d\(0,/);assert.equal(effect.frames[1].opacity,0);}assert.equal(await p.locator(group).evaluate(e=>e===document.activeElement),false);
    await p.locator(group).evaluate(e=>e.setAttribute('style',e.dataset.qaStyle));await p.locator(group+' img[src]').evaluate(e=>e.decode());checks.push(stage);
    stage='Escape and keyboard focus';await opened(p);await p.keyboard.press('Tab');assert.equal(await p.locator('[data-photo-close]').evaluate(e=>e===document.activeElement),true);await p.keyboard.press('Escape');await closed(p);checks.push(stage);
   }
   assert.deepEqual(await read(p),data);assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
   if(primary&&!reduce){await opened(p);await p.screenshot({path:`${out}/${engine}-390-dark-fit.png`});await drag(p,engine,{ratio:.2,interrupt:async()=>p.screenshot({path:`${out}/${engine}-390-dark-drag.png`})});await p.locator('[data-photo-close]').tap();await closed(p);}
   stage='scanner Review source';await scan(p,2);const beforeScan=await read(p);await opened(p,'#scanReview .food-photo-thumb');t=await drag(p,engine,{ratio:.32});stable(t);await closed(p);assert.equal(await p.locator('#scanReview').isVisible(),true);assert.equal(await p.locator('#scanReview .food-photo-thumb').evaluate(e=>e===document.activeElement),true);assert.deepEqual(await read(p),beforeScan);checks.push(stage);
   results.push({tag,passed:true,checks});await writeFile(`${out}/${tag}-traces.json`,JSON.stringify(traces,null,2));console.log('PASS',tag,checks.length);
  }catch(error){await p.screenshot({path:`${out}/${tag}-FAIL.png`});await writeFile(`${out}/${tag}-FAIL-traces.json`,JSON.stringify(traces,null,2));results.push({tag,passed:false,stage,error:error.stack});throw error;}
  finally{await c.close();await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
 }}finally{await b.close();}
}
