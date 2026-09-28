import {pw,setup,out} from './add-flow-harness.mjs';
import {seedPhotoDiary,captureRendered} from './photo-close-harness.mjs';
export {pw,setup,out,captureRendered};
export async function settle(p){
 await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 // Re-query live animation state rather than retaining a finished promise for
 // a previous CSS animation generation during repeated mount/unmount journeys.
 // Do not finish/cancel production animations just to make the test pass.
 await p.waitForFunction(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).every(a=>a.playState==='finished'||a.playState==='idle'),null,{timeout:12000});
}
export async function fixture(p){
 await seedPhotoDiary(p);
 await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('calorie-counter-state')),d=s.days[s.selectedDate],f=d.foods[0];d.foods=[90,400,2040,10000].map((calories,i)=>({...f,id:'edge-row-'+i,name:i%2?'Very long multi-word food name that wraps across several lines':'Egg',calories}));d.foods.push({...f,id:'edge-row-ordinary',captureId:undefined,name:'Ordinary reused food',calories:400});localStorage.setItem('calorie-counter-state',JSON.stringify(s));});
 await p.reload();await p.locator('.scanned-meal-toggle').tap();await settle(p);
}
export async function open(p,kind){
 if(kind==='exercise'){await p.locator('[data-empty-exercise-action=add]').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await settle(p);await p.locator('[data-empty-exercise-action=add]').tap();}
 else if(kind==='edit'){await p.locator('.scanned-meal-children .entry-main').first().evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await settle(p);await p.locator('.scanned-meal-children .entry-main').first().tap();}
 else {
  await p.locator('#floatingAddButton').click();await p.locator('#manualFoodName').waitFor();await settle(p);
  if(kind==='child'){await p.locator('#manualFoodName').fill('banana');await p.locator('#manualFoodName').press('Enter');await p.locator('#foodSuggestions .suggestion-card').filter({has:p.locator('strong',{hasText:/^Banana$/})}).click();await settle(p);await p.evaluate(()=>document.activeElement.blur());}
 }
 await settle(p);
}
export async function close(p){if(await p.locator('.add-flow-host').count()){await p.locator('.add-flow-surface .modal-close-button').click();await settle(p);if(await p.locator('.add-flow-host').count()){await p.locator('.add-flow-surface .modal-close-button').click();await settle(p);}}}
export function instrument(){
 window.edgeFrames=[];window.edgeEvents=[];window.edgeRecording=false;window.edgeContact=null;
 const r=e=>e?.getBoundingClientRect().toJSON(),s=e=>e&&getComputedStyle(e),q=x=>document.querySelector(x);
 window.edgeSample=()=>{const h=q('.add-flow-host'),b=q('.add-flow-backdrop'),root=q('.add-flow-surface');return{time:performance.now(),contact:edgeContact,host:r(h),stage:r(b),surface:r(root),transform:s(h)?.transform,stageTransform:s(b)?.transform,active:root?.dataset.edgeBackActive,section:root?.id,keyboard:root?.dataset.keyboard,focus:document.activeElement.id,state:h?.dataset.addState,detail:q('#manualFoodForm')?.dataset.foodDetail,preview:[...document.querySelectorAll('.add-back-preview')].map(e=>({hidden:e.hidden,rect:r(e)})),parent:r(q('.main-content')),footer:r(q('.mobile-tabbar')),fab:r(q('#floatingAddButton')),group:r(q('.scanned-meal-group')),expanded:q('.scanned-meal-toggle')?.getAttribute('aria-expanded'),ring:q('#calorieRing')?.style.strokeDashoffset,selected:q('.day-tile.is-selected')?.textContent};};
 document.addEventListener('click',e=>{if(e.target.closest('.modal-close-button'))edgeEvents.push({type:'back',...edgeSample()});},true);
 for(const type of ['touchstart','touchmove','touchend','touchcancel'])document.addEventListener(type,e=>{edgeContact=e.touches.length?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;edgeEvents.push({type,cancelable:e.cancelable,target:e.target.id||e.target.className,...edgeSample()});},true);
 for(const type of ['blur','resize','orientationchange','visibilitychange'])window.addEventListener(type,()=>edgeEvents.push({type,...edgeSample()}),true);
 window.edgeStart=()=>{edgeFrames=[];edgeEvents=[];edgeRecording=true;const tick=()=>{edgeFrames.push(edgeSample());if(edgeRecording)requestAnimationFrame(tick);};tick();};
 window.edgeStop=()=>{edgeRecording=false;return{frames:edgeFrames,events:edgeEvents,final:edgeSample()};};
}
export async function drag(p,engine,{x=8,y=230,fractions=[.15,.3],width=390,hold=130,delay=70,cancel=false,dy=0,interrupt,overlay=false}={}){
 const cdp=engine==='chromium'?await p.context().newCDPSession(p):null;
 await p.evaluate(({x,y,overlay})=>{window.edgeTarget=document.elementFromPoint(x,y);if(overlay&&!document.querySelector('#edgeFinger')){const e=document.createElement('div');e.id='edgeFinger';e.style='position:fixed;z-index:99999;width:16px;height:16px;border:2px solid #dfaa75;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%)';document.body.append(e);}}, {x,y,overlay});
 const send=async(type,points)=>{
  await p.evaluate(points=>{const e=document.querySelector('#edgeFinger');if(e){e.hidden=!points.length;if(points.length){e.style.left=points[0].x+'px';e.style.top=points[0].y+'px';}}},points);
  if(cdp)return cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((a,i)=>({...a,id:i+1}))});
  await p.evaluate(({type,points})=>{const e=new Event({touchStart:'touchstart',touchMove:'touchmove',touchEnd:'touchend',touchCancel:'touchcancel'}[type],{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:points.map((a,i)=>({identifier:i+1,clientX:a.x,clientY:a.y}))});edgeTarget.dispatchEvent(e);},{type,points});
 };
 await p.evaluate(()=>edgeStart());await send('touchStart',[{x,y}]);
 for(let i=0;i<fractions.length;i++){await send('touchMove',[{x:x+width*fractions[i],y:y+dy*(i+1)/fractions.length}]);await p.waitForTimeout(delay);}
 if(interrupt)await interrupt(send);
 await p.waitForTimeout(hold);await send(cancel?'touchCancel':'touchEnd',[]);await p.waitForTimeout(230);await settle(p);await cdp?.detach();return p.evaluate(()=>edgeStop());
}
export const rows=p=>p.locator('#foodList .entry-card').evaluateAll(cards=>cards.filter(e=>e.getClientRects().length).map(e=>{const q=s=>e.querySelector(s),r=e=>e?.getBoundingClientRect().toJSON(),k=q('.entry-kcal'),n=q('.entry-main strong'),t=q('.entry-actions-toggle');const css=el=>Object.fromEntries(['display','width','minWidth','maxWidth','gridTemplateColumns','textAlign','justifySelf','marginLeft','marginRight','paddingLeft','paddingRight','fontVariantNumeric','fontSize','lineHeight'].map(a=>[a,getComputedStyle(el)[a]]));const range=document.createRange();range.selectNodeContents(k);return{name:n.textContent,kcal:k.textContent,card:r(e),main:r(q('.entry-main')),nameRect:r(n),kcalRect:r(k),textRect:range.getBoundingClientRect().toJSON(),toggle:r(t),kcalStyle:css(k),mainStyle:css(q('.entry-main')),surfaceStyle:css(q('.entry-surface'))};}));
