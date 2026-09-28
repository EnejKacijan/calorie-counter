import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,read,seedPhotoDiary,group,settle,opened,closed,instrument,drag,input} from './photo-dismiss-harness.mjs';
const out=process.env.INTAKE_QA_OUTPUT||'artifacts/photo-dismiss/lifecycle',results=[];await mkdir(out,{recursive:true});
for(const engine of ['chromium','webkit']){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
 try{
  const {p,c}=await setup(b,{engine,width:390,height:844,theme:'dark'}),checks=[];
  try{
   await seedPhotoDiary(p);await p.evaluate(instrument);const data=await read(p);
   for(const value of ['hidden','transparent','offscreen','removed']){
    await opened(p);await p.evaluate(()=>window.returnedPhotoFocus=0);await p.locator(group).evaluate(e=>{e.addEventListener('focus',()=>returnedPhotoFocus++);});
    const t=await drag(p,engine,{ratio:.32,interrupt:async()=>p.locator(group).evaluate((e,value)=>{window.detachedPhoto=e;window.photoSibling=e.nextSibling;window.photoParent=e.parentNode;e.dataset.qaStyle=e.getAttribute('style')||'';if(value==='removed')e.remove();if(value==='hidden')e.style.visibility='hidden';if(value==='transparent')e.style.opacity='0';if(value==='offscreen')e.style.transform='translateY(-3000px)';},value)});
    await closed(p);const motion=t.effects.find(e=>e.target==='food-photo-frame');assert.ok(motion);assert.match(motion.frames[1].transform,/translate3d\(0,/);assert.equal(motion.frames[1].opacity,0);assert.equal(await p.evaluate(()=>document.activeElement===detachedPhoto),false);assert.equal(await p.evaluate(()=>returnedPhotoFocus),0);
    await p.evaluate(()=>{if(!detachedPhoto.isConnected)photoParent.insertBefore(detachedPhoto,photoSibling);detachedPhoto.setAttribute('style',detachedPhoto.dataset.qaStyle);});await settle(p);checks.push('unavailable source: '+value);
    // Removed thumbnail nodes are deliberately unobserved/revoked by production
    // cleanup. Mount a fresh diary instead of recycling a dead fixture node.
    if(value==='removed'){await p.reload();await p.locator(group).waitFor();await settle(p);await p.evaluate(instrument);}
   }
   await opened(p);let r=await p.locator('.food-photo-stage').boundingBox(),io=await input(p,engine),x=195,y=r.y+150;
   // The first contact starts on header text. A nonprimary stage contact must
   // not start dismissal even though it is the only entry in the pan map.
   if(engine==='chromium'){
    const title=await p.locator('[data-photo-title]').boundingBox();await io.send('touchStart',[{id:1,x:title.x+10,y:title.y+5}]);await io.send('touchStart',[{id:1,x:title.x+10,y:title.y+5},{id:2,x,y}]);await io.send('touchMove',[{id:1,x:title.x+10,y:title.y+5},{id:2,x,y:y+250}]);
   }else await p.locator('.food-photo-stage').evaluate((el,{x,y})=>{for(const[type,dy]of[['pointerdown',0],['pointermove',250]])el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:2,isPrimary:false,button:0,clientX:x,clientY:y+dy}));},{x,y});
   assert.equal(await p.locator('.food-photo-viewer').getAttribute('data-photo-state'),'open');await io.send('touchCancel',[]);await io.dispose();await p.locator('[data-photo-close]').tap();await closed(p);checks.push('header-owned first contact excludes nonprimary stage dismiss');
   await opened(p);r=await p.locator('.food-photo-stage').boundingBox();x=195;y=r.y+150;io=await input(p,engine);
   await io.send('touchStart',[{id:1,x:x-40,y},{id:2,x:x+40,y}]);await io.send('touchMove',[{id:1,x:x-100,y},{id:2,x:x+100,y}]);assert.ok(Number(await p.locator('.food-photo-viewer').getAttribute('data-photo-scale'))>1);
   await io.send('touchMove',[{id:1,x:x-10,y},{id:2,x:x+10,y}]);await p.waitForFunction(()=>document.querySelector('.food-photo-viewer').dataset.photoScale==='1');
   await io.send('touchEnd',[{id:1,x:x-10,y}]);await io.send('touchMove',[{id:1,x:x-10,y:y+250}]);await p.waitForTimeout(80);assert.equal(await p.locator('.food-photo-viewer').getAttribute('data-photo-state'),'open');await io.send('touchEnd',[]);await io.dispose();
   await drag(p,engine,{ratio:.32});await closed(p);checks.push('pinch back to fit does not turn remaining pan into dismissal; fresh gesture works');
   await opened(p);r=await p.locator('.food-photo-stage').boundingBox();io=await input(p,engine);x=195;y=r.y+150;
   await io.send('touchStart',[{x,y}]);await io.send('touchMove',[{x,y:y+50}]);await p.waitForTimeout(40);
   // Audit only production drag handling, outside sampling/cached start/end.
   await p.evaluate(()=>{window.dragReads=[];window.auditDrag=true;const native=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(...args){if(auditDrag&&this.closest?.('.food-photo-viewer'))dragReads.push(this.className);return native.apply(this,args);};});
   for(const dy of [70,90,110])await io.send('touchMove',[{x,y:y+dy}]);await p.waitForTimeout(40);
   assert.deepEqual(await p.evaluate(()=>{auditDrag=false;return dragReads;}),[]);await io.send('touchCancel',[]);await io.dispose();await settle(p);checks.push('active dismiss frames perform no viewer getBoundingClientRect reads');
   const before=await p.evaluate(()=>dismissCloses);await p.locator('[data-photo-close]').tap();await closed(p);assert.equal(await p.evaluate(()=>dismissCloses),before+1);
   await opened(p);await drag(p,engine,{ratio:.32,interrupt:async()=>p.evaluate(()=>{document.querySelector('[data-photo-close]').click();dispatchEvent(new Event('blur'));dispatchEvent(new Event('resize'));})});await closed(p);assert.equal(await p.evaluate(()=>dismissCloses),before+2);checks.push('close + blur + resize completes exactly once');
   await opened(p);await drag(p,engine,{ratio:.2,interrupt:async()=>p.evaluate(()=>window.IntakeNavigate('assistant.html'))});await p.locator('#assistantInput').waitFor();await settle(p);assert.equal(await p.locator('.food-photo-viewer').count(),0);assert.equal(await p.evaluate(()=>document.body.style.position==='fixed'),false);assert.equal(await p.locator('.app-shell').evaluate(e=>e.inert),false);checks.push('route disposal during live drag releases viewer/lock/inert');
   assert.deepEqual(await read(p),data);assert.deepEqual(await p.evaluate(()=>qaErrors),[]);results.push({engine,version:b.version(),passed:true,checks});console.log('PASS',engine,checks.length);
  }catch(error){await p.screenshot({path:`${out}/${engine}-FAIL.png`});results.push({engine,passed:false,error:error.stack,checks});throw error;}
  finally{await c.close();await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
 }finally{await b.close();}
}
