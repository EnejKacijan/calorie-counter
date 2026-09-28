import test from 'node:test';
import assert from 'node:assert/strict';
import {animateAddMode,diaryReadingPosition,settleNestedParent} from '../public/add-surface.js';
test('nested return finishes retained Today effects before reveal, without touching infinite effects or child',()=>{
 const calls=[];const effect=(name,iterations=1)=>({effect:{getTiming:()=>({iterations})},finish:()=>calls.push(name)});
 settleNestedParent({querySelector(selector){assert.equal(selector,'.app-shell');return {getAnimations(options){assert.deepEqual(options,{subtree:true});return [effect('ring'),effect('macro'),effect('infinite',Infinity)];}};}});
 assert.deepEqual(calls,['ring','macro']);
});
function fixture(reduce=false) {
  const calls=[],element=()=>({style:{},animate(frames,timing){const animation={cancel(){}};calls.push({frames,timing});return animation;}});
  return {indicator:element(),content:element(),win:{matchMedia:()=>({matches:reduce})},calls};
}
test('Mode indicator ends immediately at selected mode, without waiting for animation',()=>{
  const f=fixture();const animations=animateAddMode(f.indicator,f.content,0,1,f.win);
  assert.equal(f.indicator.style.transform,'translateX(100%)');assert.equal(animations.length,2);
  assert.deepEqual(f.calls[0].frames,[{transform:'translateX(0%)'},{transform:'translateX(100%)'}]);
  for(const call of f.calls)assert.equal(call.timing.duration,160);
  assert.deepEqual(f.calls[1].frames,[{opacity:.72},{opacity:1}]);
});
test('Reverse mode motion uses the current direction and does not animate geometry',()=>{
  const f=fixture();animateAddMode(f.indicator,f.content,1,0,f.win);
  assert.equal(f.indicator.style.transform,'translateX(0%)');assert.deepEqual(f.calls[0].frames[0],{transform:'translateX(100%)'});
  for(const call of f.calls)for(const frame of call.frames)assert.ok(!('height'in frame)&&!('top'in frame));
});
test('Initial opening and reselecting a mode do not animate',()=>{
  for(const from of [null,0]){const f=fixture();assert.deepEqual(animateAddMode(f.indicator,f.content,from,0,f.win),[]);assert.equal(f.calls.length,0);}
});
test('Reduced motion skips both animations and still presents the final selection',()=>{
  const f=fixture(true);assert.deepEqual(animateAddMode(f.indicator,f.content,0,1,f.win),[]);assert.equal(f.indicator.style.transform,'translateX(100%)');assert.equal(f.calls.length,0);
});

function diary(headerBottom=-10) {
  let rows=[];
  const header={getBoundingClientRect:()=>({bottom:headerBottom})};
  const list={parentElement:{querySelector:()=>header},querySelectorAll:()=>rows};
  const win={document:{querySelector:()=>list},scrollY:800,innerHeight:844,visualViewport:{offsetTop:0,height:844}};
  const row=(id,top)=>({dataset:{foodEntryId:id},getBoundingClientRect:()=>({top,bottom:top+64})});
  return {win,setRows(value){rows=value.map(([id,top])=>row(id,top));}};
}
test('Today retains the document offset while dashboard or diary header is in view',()=>{
  const d=diary(44);d.setRows([['a',60]]);assert.equal(diaryReadingPosition(d.win),undefined);
});
test('Deep diary uses the first visible stable entry, not Add scroll or an offscreen row',()=>{
  const d=diary();d.setRows([['above',-100],['visible',-20],['next',44]]);
  const restore=diaryReadingPosition(d.win);
  // A real render replaces the nodes, but retains their local record IDs.
  d.setRows([['new',-100],['visible',45],['next',109]]);
  assert.deepEqual(restore({left:5,top:800}),{left:5,top:865});
  d.setRows([['visible',-20],['next',44],['added-below',108]]);
  assert.deepEqual(restore({left:5,top:800}),{left:5,top:800});
});
test('Reading anchor survives native offset changes and falls back when the entry disappears',()=>{
  const d=diary();d.setRows([['visible',20]]);const restore=diaryReadingPosition(d.win);
  d.win.scrollY=500;d.setRows([['visible',385]]);
  assert.deepEqual(restore({left:0,top:800}),{left:0,top:865});
  d.setRows([]);assert.deepEqual(restore({left:0,top:800}),{left:0,top:800});
  assert.equal(diaryReadingPosition(d.win),undefined);
});
test('Reading restoration respects visual viewport bounds and clamps negative targets',()=>{
  const d=diary();d.win.visualViewport.offsetTop=90;d.setRows([['covered',0],['visible',100],['below',1000]]);
  const restore=diaryReadingPosition(d.win);d.win.scrollY=0;d.setRows([['visible',-10]]);
  assert.deepEqual(restore({left:0,top:800}),{left:0,top:0});
});
