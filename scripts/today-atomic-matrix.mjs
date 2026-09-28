import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,settle,read,openFood,selectFood} from './add-flow-harness.mjs';
import {probe} from './today-atomic-qa.mjs';
const out=process.env.INTAKE_QA_OUTPUT||'artifacts/today-atomic';
await mkdir(out,{recursive:true});
const results=[];
const near=(a,b,why,tolerance=1.1)=>assert.ok(Math.abs(a-b)<tolerance,`${why}: ${a} != ${b}`);
function verify(trace,state,{cold=false}={}){
 const frames=trace.filter(f=>f.path==='/index.html'&&!f.loading),first=frames[0],last=frames.at(-1);
 assert.ok(frames.length>=2,'multiple first-to-settled frames');
 const day=state.days[state.selectedDate]||{foods:[],exercises:[]},sum=key=>day.foods.reduce((n,f)=>n+Number(f[key]||0),0),net=sum('calories')-day.exercises.reduce((n,e)=>n+Number(e.calories||0),0);
 for(const f of frames){
  assert.equal(f.selected,state.selectedDate,'selected date from the same snapshot');
  assert.equal(Number(f.calories),Math.round(Math.abs(state.goals.calories-net)),'first-frame ring');
  assert.equal(f.foods,day.foods.length,'first-frame diary');
  assert.deepEqual(f.macros,['protein','carbs','fat'].map(k=>String(Math.round(sum(k)))));
  if(!day.foods.length)assert.match(f.diary,/No food logged\./);else assert.ok(f.diary.includes(day.foods[0].name));
  for(const [key,e] of Object.entries(f.elements)){
   assert.ok(e&&e.visible,`${key} exists and is not hidden`);
   for(const axis of ['y','width','height'])near(e.rect[axis],last.elements[key].rect[axis],`${key}.${axis}`);
   near(e.rect.x,last.elements[key].rect.x,`${key}.x (shared route travel only)`,8.1);
  }
  for(const key of ['fab','footer']){
   const e=f.elements[key];assert.ok(e.inViewport&&e.hit,`${key} actually hit-testable in viewport`);
   near(e.rect.x,last.elements[key].rect.x,`${key} fixed x`);
   assert.equal(e.opacity,1,`${key} no separate entrance`);
   assert.ok(e.ancestors.every(a=>a.transform==='none'),`${key} no transformed containing block`);
  }
  assert.equal(f.elements.logTitle.opacity,1,'food-log heading commits with its fixed action');
  near(f.elements.logTitle.rect.x,last.elements.logTitle.rect.x,'log heading no clipped horizontal entrance');
  assert.ok(f.elements.fab.rect.top>=0&&f.elements.fab.rect.bottom<=f.elements.footer.rect.top,'whole FAB stays above navigation');
  if(!cold)assert.ok(!f.animations.some(a=>a.target==='calorieRing'),'no first-mount ring replay');
 }
 return{first,last,frameCount:frames.length,frames:frames.map(f=>({time:f.time,date:f.date,selected:f.selected,calories:f.calories,foods:f.foods,focus:f.focus,rects:Object.fromEntries(Object.entries(f.elements).map(([k,e])=>[k,e.rect]))}))};
}
for(const engine of (process.env.ATOMIC_ENGINE?[process.env.ATOMIC_ENGINE]:['chromium','webkit'])){
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 try{for(const [width,height] of (process.env.ATOMIC_SMOKE?[[390,844]]:[[375,667],[390,844],[393,852],[430,932]]))for(const theme of ['light','dark'])for(const reduce of [false,true]){
  const tag=`${engine}-${width}-${theme}-${reduce?'reduce':'normal'}`,cases=[];
  const {c,p}=await setup(b,{engine,width,height,theme,reduce});
  try{
   await c.addInitScript(probe);
   await p.evaluate(()=>sessionStorage.removeItem('calorie-counter-today-session-v1'));
   await p.reload();await p.locator('.day-tile').first().waitFor();await settle(p);await p.waitForTimeout(100);
   cases.push({name:'cold initial current empty',...verify(await p.evaluate(()=>atomicFrames),await read(p),{cold:true})});
   const capture=async(source,name,mutate)=>{
    await p.locator(`.mobile-tabbar a[href="${source}.html"]`).tap();await settle(p);
    if(mutate)await mutate();
    const expected=await read(p);
    await p.evaluate(()=>{atomicFrames=[];atomicRecording=true;});
    await p.locator('.mobile-tabbar a[href="index.html"]').tap();await p.waitForTimeout(260);
    const frames=await p.evaluate(()=>{atomicRecording=false;return atomicFrames;});
    cases.push({name,...verify(frames,expected)});
    assert.equal(await p.locator('#floatingAddButton').getAttribute('aria-expanded'),'false');
   };
   for(const [i,source] of ['assistant','assistant','progress','profile'].entries())await capture(source,`${i} ${source} current empty`);
   await capture('assistant','data changed while away: selected historical populated',()=>p.evaluate(()=>{
    const s=JSON.parse(localStorage.getItem('calorie-counter-state'));s.selectedDate=qaDate;
    s.days[qaDate]={foods:[{id:'qa-historical',name:'QA historical rice',amount:150,unit:'g',meal:'lunch',calories:500,protein:30,carbs:50,fat:15,createdAt:qaDate+'T12:00:00',loggedForDate:qaDate}],exercises:[{id:'qa-walk',name:'Walk',minutes:20,calories:100}]};
    localStorage.setItem('calorie-counter-state',JSON.stringify(s));
   }));
   for(const source of ['progress','profile'])await capture(source,`${source} historical populated`);
   await openFood(p);await selectFood(p);await p.locator('#foodAmount').fill('1.5');await p.locator('#foodAmount').blur();await p.locator('#manualFoodSubmit').tap();await settle(p);
   await capture('assistant','after actual Add persisted');
   await p.locator('#foodList .entry-actions-toggle').first().tap();await settle(p);
   await p.locator('#foodReusePanel [data-entry-action="delete"]').tap();await settle(p);
   await capture('progress','after actual Delete persisted');
   await capture('profile','data changed while away: empty current and new targets',()=>p.evaluate(()=>{
    const s=JSON.parse(localStorage.getItem('calorie-counter-state'));s.selectedDate=s.lastOpenedDate;s.days[s.selectedDate]={foods:[],exercises:[]};s.goals.calories=2100;localStorage.setItem('calorie-counter-state',JSON.stringify(s));
   }));
   for(const sequence of [['assistant','index','progress'],['profile','index','assistant'],['index','assistant','index']]){
    const boxes={};for(const name of new Set(sequence))boxes[name]=await p.locator(`.mobile-tabbar a[href="${name}.html"]`).boundingBox();
    for(const name of sequence){const r=boxes[name];await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);}
    await p.waitForTimeout(300);const latest=sequence.at(-1);
    assert.equal(new URL(p.url()).pathname,`/${latest}.html`);assert.equal(await p.locator('#floatingAddButton').count(),latest==='index'?1:0);
    assert.equal(await p.locator('.mobile-tabbar [aria-current="page"]').getAttribute('href'),`${latest}.html`);
    assert.equal(await p.evaluate(()=>document.activeElement?.id==='floatingAddButton'),false);
    if(latest==='index')assert.equal(await p.locator('#calendarStrip [aria-pressed="true"]').getAttribute('data-date-key'),(await read(p)).selectedDate);
   }
   // The first screen is not focused into a control on touch return. Keyboard
   // selection remains separate from the active C2 destination.
   await p.keyboard.press('Tab');await p.locator('.mobile-tabbar a[href="progress.html"]').focus();
   assert.equal(await p.locator('.mobile-tabbar a[href="progress.html"]').evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle!=='none'),true);
   assert.equal(await p.locator('.mobile-tabbar [aria-current="page"]').getAttribute('href'),'index.html');
   assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
   results.push({tag,cases,rapidSequences:3,keyboardFocus:true});console.log('PASS',tag,`${cases.length} lifecycle cases + 3 rapid sequences + keyboard`);
   await writeFile(`${out}/matrix-${engine}.json`,JSON.stringify(results,null,2));
  }catch(error){await p.screenshot({path:`${out}/FAIL-${tag}.png`});throw error;}finally{await c.close();}
 }}finally{await b.close();}
}
