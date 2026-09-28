import {settle} from './add-flow-harness.mjs';
export async function installEvidence(p,{pointer=false}={}){
 await p.evaluate(pointer=>{
  window.sheetTrace=[];
  window.sheetMetrics=()=>({y:scrollY,scrollTop:document.scrollingElement.scrollTop,viewportTop:visualViewport.offsetTop,
   landmarks:Object.fromEntries(['.topbar','.calorie-ring','#foodSection .logged-list-heading','#foodList .entry-card','#profileSettingsOverview','.mobile-tabbar'].flatMap(s=>{const e=document.querySelector(s);return e?[[s,e.getBoundingClientRect().toJSON()]]:[]})),
   sheet:(document.querySelector('.intake-sheet')||document.querySelector('#foodReusePanel'))?.getBoundingClientRect().toJSON(),
   translate:document.querySelector('.intake-sheet')?.style.translate||'',owner:document.querySelector('.intake-sheet')?.dataset.sheetGesture,
   contentTop:document.querySelector('#foodReuseContent')?.scrollTop,view:document.querySelector('#foodReusePanel')?.dataset.reuseView});
  for(const type of ['touchstart','touchmove','touchend','touchcancel','pointercancel','click'])document.addEventListener(type,e=>{
   const record={type,target:e.target.id||e.target.closest?.('[data-reuse-action]')?.dataset.reuseAction||e.target.tagName,cancelable:e.cancelable};
   queueMicrotask(()=>sheetTrace.push({...record,prevented:e.defaultPrevented,...sheetMetrics()}));
  },true);
  if(pointer){const dot=document.createElement('div');dot.id='qa-touch-pointer';Object.assign(dot.style,{position:'fixed',width:'22px',height:'22px',border:'2px solid #ff8a50',borderRadius:'50%',background:'#ff8a5070',zIndex:2147483647,pointerEvents:'none',left:'-40px',top:'-40px'});document.body.append(dot);}
 },pointer);
}
export const metrics=p=>p.evaluate(()=>sheetMetrics());
export async function touch(p,engine,selector,{distance=150,dx=0,steps=16,delay=24,atBottom=false,cancel=false,multi=false,hold=0,retarget=false,snapshot,onStart}={}){
 const r=await p.locator(selector).first().boundingBox(),x=r.x+Math.min(90,r.width/2),y=atBottom?r.y+r.height-25:r.y+Math.min(22,r.height/2);
 const session=engine==='chromium'?await p.context().newCDPSession(p):null;
 const pointer=async(x,y,up=false)=>p.evaluate(({x,y,up})=>{const d=document.querySelector('#qa-touch-pointer');if(d){d.style.left=`${x-11}px`;d.style.top=`${y-11}px`;d.style.opacity=up?'0':'1';}},{x,y,up});
 const synthetic=async(type,points)=>p.evaluate(({type,points,retarget})=>{
  // WebKit/Windows has no native continuous-touch injection. Keep a fixed
  // Touch identifier/target; optional DOM retargeting is a robustness probe.
  const t=retarget&&points[0]?document.elementFromPoint(points[0].x,points[0].y)||qaGestureTarget:qaGestureTarget;
  const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:points.map((q,i)=>({identifier:i+1,target:qaGestureTarget,clientX:q.x,clientY:q.y}))});t.dispatchEvent(event);
 },{type,points,retarget});
 await p.locator(selector).first().evaluate(e=>window.qaGestureTarget=e);
 await pointer(x,y);
 if(session)await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});else await synthetic('touchstart',[{x,y}]);
 if(onStart)await onStart();
 const samples=[];
 for(let i=1;i<=steps;i++){
  const nx=x+dx*i/steps,ny=y+distance*i/steps;await pointer(nx,ny);
  if(session)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:nx,y:ny,id:1}]});else await synthetic('touchmove',[{x:nx,y:ny}]);
  await p.waitForTimeout(delay);samples.push({pointerX:nx,pointerY:ny,...await metrics(p)});
 }
 if(hold)await p.waitForTimeout(hold);
 if(snapshot)await p.screenshot({path:snapshot});
 if(multi){const points=[{x:x+dx,y:y+distance,id:1},{x:x+dx+25,y:y+distance,id:2}];if(session)await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});else await synthetic('touchstart',points);}
 if(session){await session.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await session.detach();}else await synthetic(cancel?'touchcancel':'touchend',[]);
 await pointer(x+dx,y+distance,true);await settle(p);await p.waitForTimeout(230);
 return samples;
}
