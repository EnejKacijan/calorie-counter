import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,seed,rowGeometry,out,settle,read} from './today-row-week-harness.mjs';
await mkdir(out,{recursive:true});const results=[];
export const idle=p=>p.waitForFunction(()=>!document.querySelector('.calendar-week-viewport').dataset.weekMotion);
export const top=async p=>{await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await settle(p);};
const keyPlus=(key,days)=>{const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+days);return[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
export const snapshot=p=>p.evaluate(()=>{
 const v=document.querySelector('.calendar-week-viewport'),track=v.firstElementChild,r=v.getBoundingClientRect();
 const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
 return{date:JSON.parse(localStorage.getItem('calorie-counter-state')).selectedDate,stored:localStorage.getItem('calorie-counter-state'),writes:qaWrites.length,width:r.width,x:track.getBoundingClientRect().x-r.x+r.width,days:[...document.querySelectorAll('#calendarStrip .day-tile')].map(e=>({date:e.dataset.dateKey,width:e.getBoundingClientRect().width})),previews:document.querySelectorAll('[data-week-preview] button').length,selected:document.querySelectorAll('.calendar-panel .is-selected').length,ring:rect('.calorie-ring'),prev:rect('#previousWeekButton'),next:rect('#nextWeekButton'),errors:qaErrors,overflow:document.documentElement.scrollWidth>innerWidth,transform:getComputedStyle(track).transform};
});
// Chromium exercises native touch dispatch; WebKit's Playwright backend cannot
// send touchmove, so it exercises the production TouchEvent adapter explicitly.
export async function touch(p,engine){
 const box=await p.locator('.calendar-week-viewport').boundingBox();let x=box.x+box.width/2,y=box.y+box.height/2;
 const cdp=engine==='chromium'?await p.context().newCDPSession(p):null;
 async function send(type,dx=0,dy=0){
  if(cdp)return cdp.send('Input.dispatchTouchEvent',{type:({start:'touchStart',move:'touchMove',end:'touchEnd',cancel:'touchCancel'})[type],touchPoints:type==='end'||type==='cancel'?[]:[{x:x+dx,y:y+dy,id:1}]});
  return p.evaluate(({type,x,y})=>{const el=window.qaCalendarTarget||(window.qaCalendarTarget=document.elementFromPoint(x,y));const t={identifier:1,target:el,clientX:x,clientY:y,pageX:x+scrollX,pageY:y+scrollY};const e=new Event('touch'+type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='end'||type==='cancel'?[]:[t]},changedTouches:{value:[t]}});el.dispatchEvent(e);if(type==='end'||type==='cancel')window.qaCalendarTarget=null;},{type,x:x+dx,y:y+dy});
 }
 return{send,close:()=>cdp?.detach()};
}
export async function drag(p,engine,dx,{pause=150,dy=0,record=false}={}){
 const input=await touch(p,engine);await input.send('start');
 for(let i=1;i<=8;i++){await p.waitForTimeout(35);await input.send('move',dx*i/8,dy*i/8);}
 await p.waitForTimeout(pause);const during=await snapshot(p);await input.send('end',dx,dy);await idle(p);await input.close();return during;
}
async function checkRows(p,label){
 const rows=await rowGeometry(p);
 for(const r of rows){assert.ok(Math.abs(r.above-r.below)<1.2,`${label}/${r.id} unbalanced ${r.above}/${r.below}`);assert.ok(r.between>=3.8&&r.between<=4.2,`${label}/${r.id} metadata gap`);assert.ok(r.action.width>=44&&r.action.height>=44);assert.ok(r.action.top>=r.row.top-.1&&r.action.bottom<=r.row.bottom+.1,`${label}/${r.id} hit target clipped`);assert.ok(r.kcal.right<=r.action.left-7&&r.kcal.right<=r.row.right);assert.ok(Math.abs(r.glyph.top-r.kcal.top)<1.2,`${label}/${r.id} dots aligned`);}
 assert.equal(await p.locator('#foodList .entry-swipe-actions').count(),0);
 assert.ok(rows.find(r=>r.id==='long').title.height>30);return rows;
}
if(!process.env.WEEK_HELPERS_ONLY){try{
 for(const engine of ['chromium','webkit']){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
 try{for(const[width,height]of [[320,720],[375,667],[390,844],[393,852],[430,932]])for(const theme of ['light','dark']){
  if(process.env.WEEK_QUICK==='1'&&(width!==390||theme!=='dark'))continue;
  const label=`${engine}-${width}-${theme}`;
  const{c,p}=await setup(b,{engine,width,height,theme,beforeOpen:async({c})=>{await c.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,value:true}));}});
  try{
   await seed(p);const rows=await checkRows(p,label);
   if(width===390){await p.locator('[data-food-entry-id=musli]').screenshot({path:`${out}/${engine}-${theme}-row-after.png`});await p.screenshot({path:`${out}/${engine}-${theme}-diary-after.png`});}
   await top(p);const initial=await snapshot(p);assert.equal(initial.overflow,false);const original=initial.date;
   const cancel=await drag(p,engine,-initial.width*.18);assert.ok(Math.abs(cancel.x+initial.width*.18)<2,`${label} follows finger: ${cancel.x}`);assert.equal(cancel.previews,14);assert.equal(cancel.stored,initial.stored);assert.equal(cancel.writes,initial.writes);assert.deepEqual(cancel.ring,initial.ring);assert.deepEqual(cancel.prev,initial.prev);assert.deepEqual(cancel.days,initial.days);assert.equal(cancel.selected,1);assert.equal((await read(p)).selectedDate,original);
   const next=await drag(p,engine,-initial.width*.42);assert.equal(next.date,original);assert.equal((await read(p)).selectedDate,keyPlus(original,7));assert.equal((await snapshot(p)).previews,0);
   await drag(p,engine,initial.width*.42);assert.equal((await read(p)).selectedDate,original);
   // Native vertical intent beginning on the calendar must scroll the page.
   const vertical=await touch(p,engine);await vertical.send('start');for(let i=1;i<=8;i++){await vertical.send('move',-i*.8,-i*9);await p.waitForTimeout(24);}await vertical.send('end',-6,-72);await vertical.close();await idle(p);assert.equal((await read(p)).selectedDate,original);if(engine==='chromium')assert.ok(await p.evaluate(()=>scrollY>20),'native vertical scroll');
   await top(p);await p.locator('#previousWeekButton').tap();await idle(p);assert.equal((await read(p)).selectedDate,keyPlus(original,-7));await p.locator('#nextWeekButton').tap();await idle(p);assert.equal((await read(p)).selectedDate,original);
   const flick=await touch(p,engine);await flick.send('start');await p.waitForTimeout(350);await flick.send('move',-30);await p.waitForTimeout(10);await flick.send('move',-70);await flick.send('end',-70);await idle(p);await flick.close();assert.equal((await read(p)).selectedDate,keyPlus(original,7));
   await p.locator('#nextWeekButton').evaluate(e=>e.click());await p.waitForTimeout(35);await p.locator('#previousWeekButton').evaluate(e=>e.click());await idle(p);assert.equal((await read(p)).selectedDate,original);
   const date=await p.locator('#calendarStrip button').nth(2).getAttribute('data-date-key');await p.locator('#calendarStrip button').nth(2).tap();assert.equal((await read(p)).selectedDate,date);
   // Keyboard focus is separate from the touch-selected date.
   await p.keyboard.press('Tab');await p.locator('#nextWeekButton').focus();assert.ok(await p.locator('#nextWeekButton').evaluate(e=>e.matches(':focus-visible')));await p.keyboard.press('Enter');await idle(p);assert.equal((await read(p)).selectedDate,keyPlus(date,7));
   const errors=await p.evaluate(()=>qaErrors);assert.deepEqual(errors,[]);results.push({label,rows,drag:{cancel,next},pass:true});console.log('PASS',label);
  }finally{await c.close();}
 }
 // Boundary equivalence exercises real app date helpers on exactly matched seeds.
 for(const start of ['2026-01-29','2026-12-29','2026-03-27','2026-10-23']){
  const{c,p}=await setup(b,{engine,theme:'dark',timezoneId:'Europe/Ljubljana'});
  try{await seed(p,{date:start,onlyOne:true});await top(p);await p.locator('#nextWeekButton').tap();await idle(p);const arrow=await read(p);
   await seed(p,{date:start,onlyOne:true});await top(p);await drag(p,engine,-130);const swipe=await read(p);assert.deepEqual(swipe,arrow,`${engine} boundary ${start}`);assert.equal(swipe.selectedDate,keyPlus(start,7));results.push({engine,boundary:start,date:swipe.selectedDate,pass:true});console.log('PASS',engine,'boundary',start);
  }finally{await c.close();}
 }
 // Reduced motion, rapid arrows, gesture interruption, touch cancellation.
 const{c,p}=await setup(b,{engine,theme:'dark',reduce:true});
 try{await seed(p,{onlyOne:true});await top(p);const base=await snapshot(p);await drag(p,engine,-120);assert.equal((await read(p)).selectedDate,keyPlus(base.date,7));await p.locator('#previousWeekButton').tap();await idle(p);assert.equal((await read(p)).selectedDate,base.date);results.push({engine,reduced:true,pass:true});}finally{await c.close();}
 }finally{await b.close();}
 }
}finally{await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
console.log('ALL PASS',results.length);
}
