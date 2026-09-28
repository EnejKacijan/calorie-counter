import {pw,setup,read,seedPhotoDiary,group} from './photo-close-harness.mjs';
import {settle} from './edge-row-harness.mjs';
export {pw,setup,read,seedPhotoDiary,group,settle};
export async function opened(p,selector=group){
 await p.locator(selector).first().scrollIntoViewIfNeeded();await p.locator(selector+' img[src]').first().evaluate(e=>e.decode());await settle(p);
 await p.locator(selector).first().tap();await p.waitForFunction(()=>document.querySelector('.food-photo-viewer')?.dataset.photoState==='open');await p.locator('[data-photo-full][src]').evaluate(e=>e.decode());await settle(p);
}
export async function closed(p){await p.locator('.food-photo-viewer').waitFor({state:'detached'});await p.waitForFunction(()=>!history.state?.intakePhotoViewer);await settle(p);}
export function instrument(){
 window.dismissFrames=[];window.dismissEffects=[];window.dismissCloses=0;window.dismissContact=null;
 window.dismissInputs=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>{if(e.target.closest('.food-photo-viewer'))dismissInputs.push({type,id:e.pointerId,x:e.clientX,y:e.clientY,time:e.timeStamp});},true);
 const native=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('.food-photo-frame,.food-photo-scrim,.food-photo-viewer header,.food-photo-viewer footer'))dismissEffects.push({target:this.className||this.tagName,frames,options});return native.call(this,frames,options);};
 const close=HTMLDialogElement.prototype.close;HTMLDialogElement.prototype.close=function(...args){if(this.classList.contains('food-photo-viewer'))dismissCloses++;return close.apply(this,args);};
 const rect=e=>e?.getBoundingClientRect().toJSON(),q=s=>document.querySelector(s);
 window.dismissSample=()=>{const d=q('.food-photo-viewer'),frame=q('.food-photo-frame'),m=frame?new DOMMatrix(getComputedStyle(frame).transform):null;return{time:performance.now(),phase:d?.dataset.photoState,contact:dismissContact,scale:d?.dataset.photoScale,pose:m?{x:m.m41,y:m.m42,scale:m.a}:null,scrim:d?Number(getComputedStyle(q('.food-photo-scrim')).opacity):null,header:d?Number(getComputedStyle(d.querySelector('header')).opacity):null,photo:rect(q('[data-photo-full]')),scroll:scrollY,footer:rect(q('.mobile-tabbar')),fab:rect(q('#floatingAddButton')),app:rect(q('.app-shell')),inert:q('.app-shell').inert,focus:document.activeElement?.className};};
 window.dismissStart=()=>{dismissFrames=[];dismissEffects=[];dismissInputs=[];window.dismissRecording=true;const tick=()=>{dismissFrames.push(dismissSample());if(dismissRecording)requestAnimationFrame(tick);};tick();};
 window.dismissStop=()=>{dismissRecording=false;return{frames:dismissFrames,effects:dismissEffects,inputs:dismissInputs,closes:dismissCloses,final:dismissSample()};};
 window.dismissDot=(points)=>{dismissContact=points[0]||null;const d=q('.food-photo-viewer');if(!d)return;let dot=d.querySelector('.qa-touch-dot');if(!dot){dot=document.createElement('span');dot.className='qa-touch-dot';dot.style='position:fixed;width:18px;height:18px;border:2px solid #dfaa75;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:10';d.append(dot);}dot.hidden=!points.length;if(points.length){dot.style.left=points[0].x+'px';dot.style.top=points[0].y+'px';}};
}
// Chromium: trusted CDP touch stream (real pointer+touch arbitration).
// WebKit: driver has no touch drag API; synthetic PointerEvents exercise the
// viewer's existing pointer/pinch path, NOT native iOS gesture acceptance.
export async function input(p,engine,{dot=false}={}){
 const cdp=engine==='chromium'?await p.context().newCDPSession(p):null;
 await p.evaluate(()=>{window.dismissPointers=new Map();});
 return {async send(type,points){
  if(dot)await p.evaluate(points=>dismissDot(points),points);
  if(cdp)return cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((v,i)=>({id:v.id||i+1,x:v.x,y:v.y}))});
  await p.evaluate(({type,points})=>{
   const prior=dismissPointers,next=new Map(points.map((v,i)=>[v.id||i+1,v]));
   const fire=(name,id,v)=>{const stage=document.querySelector('.food-photo-stage');stage?.dispatchEvent(new PointerEvent(name,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:id===1,button:0,buttons:name==='pointerup'?0:1,clientX:v.x,clientY:v.y}));};
   if(type==='touchCancel'){for(const[id,v]of prior)fire('pointercancel',id,v);dismissPointers.clear();return;}
   for(const[id,v]of next)fire(prior.has(id)?'pointermove':'pointerdown',id,v);
   for(const[id,v]of prior)if(!next.has(id))fire('pointerup',id,v);
   dismissPointers=next;
  },{type,points});
 },async dispose(){await cdp?.detach();}};
}
export async function drag(p,engine,{ratio=.1,dx=0,distance,hold=135,delay=45,steps=6,cancel=false,interrupt,keep=false,dot=false}={}){
 const r=await p.locator('.food-photo-stage').boundingBox(),x=r.x+r.width*.5,y=r.y+Math.min(140,r.height*.3),dy=distance??r.height*ratio;
 const io=await input(p,engine,{dot});await p.evaluate(()=>dismissStart());await io.send('touchStart',[{x,y}]);
 for(let i=1;i<=steps;i++){await io.send('touchMove',[{x:x+dx*i/steps,y:y+dy*i/steps}]);if(delay)await p.waitForTimeout(delay);}
 if(hold)await p.waitForTimeout(hold);
 // Do not insert a host round trip/computed-layout audit between the last
 // flick sample and release. That can turn a valid flick into a >100ms hold
 // under parallel QA load; production is correct to reject stale velocity.
 const active=hold||interrupt?await p.evaluate(()=>dismissSample()):null;if(interrupt)await interrupt(io,{x,y,dy});
 await io.send(cancel?'touchCancel':'touchEnd',[]);if(!keep){await settle(p);await p.waitForTimeout(210);}await io.dispose();
 const trace=await p.evaluate(()=>dismissStop());
 return{...trace,active:active||trace.frames.findLast(f=>f.phase==='dragging'),height:r.height,distance:dy};
}
