import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,settle,openFood,selectFood,out} from './add-flow-harness.mjs';
await mkdir(out,{recursive:true});const results=[];
export async function drag(p,engine,{selector='#profileForm',x=8,y=230,dx=78,dy=0,steps=12,delay=18,hold=130,cancel=false,interrupt}={}){
  const cdp=engine==='chromium'?await p.context().newCDPSession(p):null;
  await p.evaluate(({x,y})=>window.qaTouchTarget=document.elementFromPoint(x,y),{x,y});
  const send=async(type,points)=>{
    await p.evaluate(points=>{const marker=document.querySelector('#qaFinger');if(!marker)return;marker.hidden=!points.length;if(points.length){marker.style.left=points[0].x+'px';marker.style.top=points[0].y+'px';}},points);
    if(cdp)return cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((q,i)=>({...q,id:i+1}))});
    return p.evaluate(({type,points})=>{
      const e=new Event(({touchStart:'touchstart',touchMove:'touchmove',touchEnd:'touchend',touchCancel:'touchcancel'})[type],{bubbles:true,cancelable:true});
      Object.defineProperty(e,'touches',{value:points.map((q,i)=>({identifier:i+1,clientX:q.x,clientY:q.y}))});qaTouchTarget.dispatchEvent(e);
    },{type,points});
  };
  const samples=[];await send('touchStart',[{x,y}]);
  for(let i=1;i<=steps;i++){
    await send('touchMove',[{x:x+dx*i/steps,y:y+dy*i/steps}]);await p.waitForTimeout(delay);
    samples.push(await p.evaluate(selector=>{const e=document.querySelector(selector),s=e&&getComputedStyle(e);return {x:e?.getBoundingClientRect().x,transform:s?.transform,opacity:s?.opacity,parent:document.querySelector('#profileSettingsOverview')?.getBoundingClientRect().toJSON(),today:!!document.querySelector('.day-tile'),path:location.pathname,active:e?.dataset.edgeBackActive};},selector));
    if(i===Math.ceil(steps/2)&&interrupt){await interrupt(send);break;}
  }
  await p.waitForTimeout(hold);await send(cancel?'touchCancel':'touchEnd',[]);await p.waitForTimeout(220);await settle(p);await cdp?.detach();return samples;
}
const sizes=process.env.NESTED_QUICK?[[390,844]]:[[375,667],[390,844],[393,852],[430,932]];
const engines=process.env.NESTED_ENGINE?.split(',')||['chromium','webkit'];
if(process.env.NESTED_HELPERS_ONLY!=='1')for(const engine of engines){
  const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
  try{for(const [width,height] of sizes)for(const theme of ['light','dark'])for(const reduce of [false,true]){
    const tag=`${engine}-${width}-${theme}-${reduce?'reduce':'motion'}`,{p,c}=await setup(b,{engine,width,height,theme,reduce});let stage='setup';
    try{
      await p.locator('.day-tile').first().waitFor();await settle(p);await p.locator('.mobile-tabbar a[href="profile.html"]').click();await p.locator('[data-edit-settings=plan]').waitFor();await settle(p);
      const original=await p.evaluate(()=>localStorage.getItem('calorie-counter-state'));
      await p.evaluate(()=>{window.qaPop=[];window.qaBack=0;addEventListener('popstate',()=>qaPop.push(location.pathname));document.querySelector('#profileEditBack').addEventListener('click',()=>qaBack++);window.qaParent=document.querySelector('#profileSettingsOverview');});
      const open=async()=>{await p.locator('[data-edit-settings=plan]').click();await settle(p);};
      const plan=()=>p.locator('#profileForm').isVisible();
      const parent=async()=>{assert.equal(await plan(),false);assert.equal(await p.locator('#profileSettings').getAttribute('data-profile-view'),'summary');assert.equal(await p.evaluate(()=>qaParent===document.querySelector('#profileSettingsOverview')),true);};
      stage='button hierarchy';await open();assert.ok(await p.evaluate(()=>history.state.intakeNestedPage));await p.locator('#profileEditBack').click();await settle(p);await p.locator('#profileSettings[data-profile-view=summary]').waitFor();await parent();
      stage='20% cancellation, committed state';await open();await p.locator('#profileWeight').fill('82');await p.locator('#profileFormTitle').focus();
      const partial=await drag(p,engine,{dx:width*.2});assert.equal(await plan(),true);assert.equal(await p.locator('#profileWeight').inputValue(),'82');assert.equal(await p.evaluate(()=>qaBack),1);
      assert.ok(partial.at(-1).x>width*.18,JSON.stringify(partial));assert.ok(partial.every(f=>f.today===false&&f.path==='/profile.html'&&f.opacity==='1'));
      assert.ok(partial.every(f=>Math.abs(f.parent.y-partial[0].parent.y)<.5));assert.equal(await p.evaluate(()=>localStorage.getItem('calorie-counter-state')),original);
      assert.match(await p.locator('#planValues').textContent(),/75 kg/);assert.doesNotMatch(await p.locator('#planValues').textContent(),/82 kg/);
      stage='full commit';const commit=await drag(p,engine,{dx:width*.65});await parent();assert.equal(await p.evaluate(()=>qaBack),2);assert.ok(commit.every(f=>!f.today));
      stage='native browser history parent';await open();await p.evaluate(()=>history.back());await p.locator('#profileSettings[data-profile-view=summary]').waitFor();assert.ok((await p.evaluate(()=>qaPop)).every(path=>path==='/profile.html'));
      if(width===390&&theme==='dark'&&!reduce){
      stage='vertical, diagonal, wobble, outside edge, active editor, selection';await open();
      for(const options of [{dx:0,dy:-100},{dx:25,dy:85},{dx:5,dy:2},{x:25,dx:width*.7}]){await drag(p,engine,options);assert.equal(await plan(),true);assert.equal(await p.locator('#profileForm').evaluate(e=>e.style.transform),'');}
      await p.locator('#profileWeight').focus();await drag(p,engine,{dx:width*.7});assert.equal(await plan(),true);await p.locator('#profileFormTitle').focus();
      await p.locator('#profileFormTitle').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);});await drag(p,engine,{dx:width*.7});assert.equal(await plan(),true);await p.evaluate(()=>getSelection().removeAllRanges());
      stage='interruption cleanup';
      for(const mode of ['cancel','blur','visibility','resize','multi']){
        await drag(p,engine,{dx:width*.7,cancel:mode==='cancel',interrupt:mode==='cancel'?undefined:async send=>{
          if(mode==='multi')await send('touchStart',[{x:90,y:230},{x:110,y:260}]);
          else await p.evaluate(mode=>{(mode==='visibility'?document:window).dispatchEvent(new Event(mode==='visibility'?'visibilitychange':mode));},mode);
        }});assert.equal(await plan(),true);assert.equal(await p.locator('#profileForm').evaluate(e=>e.style.transform),'');
      }
      stage='nested overlay';await p.evaluate(()=>{const d=document.createElement('dialog');d.id='qaOverlay';d.textContent='QA overlay';document.body.append(d);d.showModal();});await drag(p,engine,{dx:width*.7});assert.equal(await plan(),true);await p.evaluate(()=>document.querySelector('#qaOverlay').remove());
      await p.locator('#profileEditBack').click();await p.locator('#profileSettings[data-profile-view=summary]').waitFor();
      stage='privacy and real sheet';await p.locator('#profilePrivacyOpen').click();await settle(p);await drag(p,engine,{selector:'#profileDataScreen',dx:width*.65});assert.equal(await p.locator('#profileDataScreen').isVisible(),false);
      await p.locator('[data-edit-settings=personal]').click();await settle(p);const sheetBox=await p.locator('#profileForm').boundingBox();await drag(p,engine,{y:sheetBox.y+80,dx:width*.65});assert.equal(await plan(),true);await p.locator('#profileEditBack').click();await p.locator('#profileSettings[data-profile-view=summary]').waitFor();
      stage='rapid Back/reopen';for(let i=0;i<2;i++){await p.locator('[data-edit-settings=plan]').click();await p.locator('#profileEditBack').evaluate(e=>e.click());await p.locator('#profileSettings[data-profile-view=summary]').waitFor();}await open();await p.keyboard.press('Escape');await p.locator('#profileSettings[data-profile-view=summary]').waitFor();
      }
      assert.equal(await p.evaluate(()=>localStorage.getItem('calorie-counter-state')),original);
      stage='Assistant History retains draft';await p.locator('.mobile-tabbar a[href="assistant.html"]').click();await p.locator('#assistantInput').waitFor();await settle(p);await p.locator('#assistantInput').fill('Unsent QA draft');await p.locator('#assistantHistoryOpen').click();await settle(p);
      await drag(p,engine,{selector:'#assistantHistory',dx:width*.2});assert.equal(await p.locator('#assistantHistory').isVisible(),true);
      const history=await drag(p,engine,{selector:'#assistantHistory',dx:width*.65});assert.equal(await p.locator('#assistantHistory').isVisible(),false);assert.equal(await p.locator('#assistantInput').inputValue(),'Unsent QA draft');assert.ok(history.at(-1).x>width*.6);
      stage='Add root retains Today; detail returns to prepared browse parent';await p.locator('.mobile-tabbar a[href="index.html"]').click();await p.locator('.day-tile').first().waitFor();await settle(p);await openFood(p);
      await drag(p,engine,{selector:'.add-flow-host',dx:width*.2});assert.equal(await p.locator('.add-flow-host').count(),1);
      await drag(p,engine,{selector:'.add-flow-host',dx:width*.65});assert.equal(await p.locator('.add-flow-host').count(),0);
      await openFood(p);await selectFood(p);await drag(p,engine,{selector:'.add-flow-backdrop',dx:width*.65});assert.equal(await p.locator('#foodSection.is-detailing').count(),0);assert.equal(await p.locator('#manualFoodName').inputValue(),'banana');await p.locator('#closeFoodModal').click();await settle(p);
      assert.deepEqual(await p.evaluate(()=>qaErrors),[]);assert.equal(await p.evaluate(()=>document.querySelectorAll('[data-edge-back-active]').length),0);
      results.push({tag,status:'PASS',partial,commit,history});console.log('PASS',tag);
    }catch(error){await p.screenshot({path:`${out}/${tag}-failure.png`});results.push({tag,status:'FAIL',stage,error:error.stack});throw error;}
    finally{await writeFile(out+'/nested-results.json',JSON.stringify(results,null,2));await c.close();}
  }}finally{await b.close();}
}
