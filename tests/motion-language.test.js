import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {motionScale,routeDirection,animateRouteContent} from '../public/motion.js';

function fixture(reduce=false) {
  const calls=[],preference={matches:reduce,addEventListener(){}};
  const element=()=>({style:{},dataset:{},setAttribute(){},animate(frames,timing){const a={cancelled:false,cancel(){this.cancelled=true;this.oncancel?.();}};calls.push({element:this,frames,timing,a});return a;}});
  const doc={visibilityState:'visible',addEventListener(){},createElement:element};
  const motion=globalThis.IntakeCreateMotion({document:doc,matchMedia:()=>preference});
  const container={dataset:{},indicator:null,querySelector(){return this.indicator;},prepend(e){this.indicator=e;}};
  const buttons=Array.from({length:4},(_,i)=>({parentElement:container,active:i===0,getAttribute(name){return name==='aria-pressed'?String(this.active):null;}}));
  return {calls,element,motion,container,buttons,select(i){buttons.forEach((b,n)=>b.active=n===i);motion.selection(buttons,'underline');}};
}
test('shared vocabulary retains accepted Food/Exercise timing/easing and restrained scale',()=>{
  assert.equal(motionScale.mode,160);assert.equal(motionScale.easing,'cubic-bezier(.2,.7,.2,1)');
  assert.equal(motionScale.selection,160);assert.equal(motionScale.route,170);assert.equal(motionScale.add,180);
});
test('tab direction follows Today, Assistant, Progress, Profile in both directions',()=>{
  const paths=['/index.html','/assistant.html','/progress.html','/profile.html'];
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)assert.equal(routeDirection(paths[i],paths[j]),Math.sign(j-i));
  assert.equal(routeDirection('/','/assistant.html'),1);assert.equal(routeDirection('/other','/assistant.html'),0);
});
test('route motion decorates destination content only, never the shell, nav or FAB',()=>{
  const f=fixture(),target=f.element(),group={};let selectors;
  animateRouteContent({querySelectorAll(s){selectors=s;return[target];},querySelector(){return group;}},'/assistant.html','/index.html',f.motion);
  assert.ok(!selectors.includes('.main-content'));assert.ok(!selectors.split(',').includes('.logged-list-heading'));assert.ok(!selectors.includes('mobile-tabbar'));
  assert.ok(!selectors.includes('.log-heading-actions'));assert.ok(!selectors.includes('.log-title-meta'));
  assert.equal(f.calls[0].frames[0].transform,'translateX(-8px)');assert.equal(f.calls[0].timing.duration,170);
});
test('rapid transition replaces previous visual work without queuing state changes',()=>{
  const f=fixture(),group={},a=f.element(),b=f.element();a.textContent='Old';b.textContent='Final';
  f.motion.transition([a],'route',{direction:1,group});f.motion.transition([b],'route',{direction:-1,group});
  assert.equal(f.calls[0].a.cancelled,true);assert.equal(f.calls[1].a.cancelled,false);assert.equal(b.textContent,'Final');
  f.motion.stopAll();assert.equal(f.calls[1].a.cancelled,true);
});
test('selected indicator commits immediately; initial selection does not animate',()=>{
  const f=fixture();f.select(0);assert.equal(f.calls.length,0);f.select(1);
  assert.equal(f.container.indicator.style.transform,'translateX(100%)');assert.equal(f.container.indicator.style.width,'25%');
  assert.equal(f.calls[0].timing.duration,160);assert.deepEqual(f.calls[0].frames,[{transform:'translateX(0%)'},{transform:'translateX(100%)'}]);
});
test('rapid All/Saved/Recent/USDA selection cancels previous animation and ends under USDA',()=>{
  const f=fixture();for(let i=0;i<4;i++)f.select(i);
  assert.equal(f.container.indicator.dataset.index,'3');assert.equal(f.container.indicator.style.transform,'translateX(300%)');
  assert.deepEqual(f.calls.map(c=>c.a.cancelled),[true,true,false]);assert.equal(f.buttons[3].active,true);
});
test('reselecting does not restart a selection animation or reset content',()=>{
  const f=fixture();f.select(0);f.select(1);f.select(1);assert.equal(f.calls.length,1);
});
test('reduced motion immediately presents selection and all content kinds without travel',()=>{
  const f=fixture(true);f.select(0);f.select(3);
  for(const kind of ['route','mode','filter','period','detail'])f.motion.transition([f.element()],kind);
  assert.equal(f.calls.length,0);assert.equal(f.container.indicator.style.transform,'translateX(300%)');
});
test('period direction is small and exactly reversed, complete data never changes',()=>{
  const f=fixture(),chart=f.element();chart.data=[100,200,300];
  f.motion.transition([chart],'period',{direction:-1});f.motion.transition([chart],'period',{direction:1});
  assert.equal(f.calls[0].frames[0].transform,'translateX(-10px)');assert.equal(f.calls[1].frames[0].transform,'translateX(10px)');
  assert.equal(f.calls[1].timing.duration,170);assert.deepEqual(chart.data,[100,200,300]);
});
test('Progress modes/metrics fade whole committed units, day details only fade briefly',()=>{
  const f=fixture(),group={},chart=f.element(),summary=f.element(),detail=f.element();
  f.motion.transition([chart,summary],'mode',{group});assert.deepEqual(f.calls[0].frames,f.calls[1].frames);
  f.motion.transition([detail],'detail',{group});assert.equal(f.calls[0].a.cancelled,true);assert.equal(f.calls[1].a.cancelled,true);
  assert.equal(f.calls[2].timing.duration,120);assert.deepEqual(f.calls[2].frames,[{opacity:.72},{opacity:1}]);
});
test('Progress has no repeated grow-from-zero call and retains session view/range/day',()=>{
  const source=readFileSync(new URL('../public/progress.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/growBars|animateNutritionBars|nutritionMotionKey/);
  for(const key of ['viewState.view','viewState.nutritionOffset','viewState.weightOffset','viewState.day'])assert.ok(source.includes(key));
});
test('Add exit uses the live inert surface, immediate request abort and a bounded presentation fallback',()=>{
  const add=readFileSync(new URL('../public/add-surface.js',import.meta.url),'utf8');
  assert.doesNotMatch(add,/cloneNode|animationend/);
  assert.match(add,/active=null;closing=session/);assert.match(add,/section\.inert=true/);
  assert.match(add,/presentation\.close\(/);
  assert.match(add,/swipeBackCommitted==='true'/);assert.match(add,/function open[\s\S]*?finishClose\(\{preserve:true\}\)/);
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/function resetFoodForm\(\)[\s\S]*?cancelFoodSearch\(\);[\s\S]*?aiDescriptionController\?\.abort\(\);[\s\S]*?addSurface.deferReset/);
});
