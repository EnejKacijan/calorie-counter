import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {disclosureRegion,disclosureViewport,disclosureDelta,disclosureScrollOwner,disclosureEase,disclosureLayoutOffsets,createDisclosureReveal} from '../public/disclosure-reveal.js';
const box=(top,bottom,left=0,right=390)=>({top,bottom,left,right,height:bottom-top});
const viewport=box(80,700);
test('fully visible disclosure is a zero-scroll no-op, including exact edge fit',()=>{
 assert.equal(disclosureDelta({viewport,trigger:box(100,145),region:box(150,400)}),0);
 assert.equal(disclosureDelta({viewport,trigger:box(80,125),region:box(125,700)}),0);
});
test('partly clipped sections use the exact minimal bottom or top delta',()=>{
 assert.equal(disclosureDelta({viewport,trigger:box(350,398),region:box(400,750)}),50);
 assert.equal(disclosureDelta({viewport,trigger:box(60,108),region:box(110,400)}),-20);
});

test('content focus aligns a bottom section heading plus normal gap, not just its first rows',()=>{
 assert.equal(disclosureDelta({policy:'content-focus',viewport,trigger:box(590,630),anchor:box(580,640),region:box(580,830),preferredRegion:box(640,700)}),488);
 assert.equal(disclosureDelta({policy:'content-focus',viewport,trigger:box(590,630),anchor:box(580,640),region:box(580,2500)}),488);
});

test('content focus is quiet when comfortably visible high up, but deliberate in the lower half',()=>{
 assert.equal(disclosureDelta({policy:'content-focus',viewport,trigger:box(140,180),region:box(140,400)}),0);
 assert.equal(disclosureDelta({policy:'content-focus',viewport,trigger:box(420,460),region:box(420,540)}),328);
 assert.equal(disclosureDelta({policy:'content-focus',viewport,trigger:box(92,132),region:box(92,1200)}),0);
});

test('content focus uses the measured editor beginning when Done is after the fields',()=>{
 assert.equal(disclosureDelta({policy:'content-focus',viewport,trigger:box(950,998),anchor:box(500,998),region:box(500,998)}),408);
 assert.equal(disclosureDelta({policy:'content-focus',viewport,trigger:box(60,100),region:box(60,400)}),-32);
});
test('footer bounds and visual viewport intersect without double-counting safe-area',()=>{
 const r=disclosureViewport({owner:{...viewport,bottom:740},viewport:box(0,844),bottomOcclusion:[box(700,844)]});
 assert.equal(r.bottom,700);assert.equal(disclosureDelta({viewport:r,trigger:box(400,448),region:box(450,760)}),60);
 const inner=disclosureViewport({owner:box(103,739),viewport:box(0,844),topOcclusion:[box(0,47)],bottomOcclusion:[box(739,844)]});assert.deepEqual(inner,{top:103,bottom:739,height:636});
 const keyboard=disclosureViewport({owner:box(103,739),viewport:box(80,430)});assert.equal(keyboard.bottom,430);
 const floating=disclosureViewport({owner:box(0,844),viewport:box(0,844),bottomOcclusion:[box(752,844),box(694,746,322,374)]});assert.equal(floating.bottom,694,'floating Add must not cover a revealed row action');
});
test('top occlusion is measured and unrelated offscreen chrome does not obstruct',()=>{
 const r=disclosureViewport({owner:box(0,844),viewport:box(0,844),topOcclusion:[box(0,47),box(0,80,500,600)],bottomOcclusion:[box(900,980)]});assert.deepEqual(r,{top:47,bottom:844,height:797});
});
test('large groups reveal first rows and keep header, never chase the final child',()=>{
 assert.equal(disclosureDelta({viewport,trigger:box(580,640),region:box(580,1900),preferredRegion:box(640,820)}),120);
 assert.equal(disclosureDelta({viewport,trigger:box(100,160),region:box(100,1500),preferredRegion:box(160,340)}),0);
});
test('oversized fallback aligns the beginning at most one viewport, not the bottom',()=>{
 assert.equal(disclosureDelta({viewport,trigger:box(500,548),region:box(550,2500)}),420);
 assert.equal(disclosureDelta({viewport:box(80,80),trigger:box(40,60),region:box(80,500)}),0);
});
test('region union includes editor fields and Done regardless of DOM/CSS order',()=>{
 assert.deepEqual(disclosureRegion([box(600,648),box(300,400),box(416,500)]),box(300,648));
 assert.equal(disclosureRegion([null,box(0,0)]),null);
});

test('concurrent height disclosures predict anchor shift and range once, including collapsing predecessors',()=>{
 const element=(top,bottom,natural,animated=true)=>({getBoundingClientRect:()=>box(top,bottom),scrollHeight:natural,getAnimations:()=>animated?[{effect:{getKeyframes:()=>[{height:'0px'},{height:natural+'px'}]}}]:[]});
 const regions=[{element:element(100,150,200),expanded:true},{element:element(200,250,100),expanded:false},{element:element(500,510,240),expanded:true},{element:element(300,349.5,50,false),expanded:true}];
 assert.deepEqual(disclosureLayoutOffsets(box(450,490),regions),{shift:100,growth:330});
 assert.deepEqual(disclosureLayoutOffsets(box(450,490),[]),{shift:0,growth:0});
});
test('owner discovery returns the nearest real scroller rather than the page',()=>{
 const root={},body={},inner={parentElement:body,scrollHeight:900,clientHeight:500},wrapper={parentElement:inner,scrollHeight:900,clientHeight:900},trigger={parentElement:wrapper};
 const win={document:{body,scrollingElement:root},getComputedStyle:e=>({overflowY:e===inner?'auto':'visible'})};
 assert.equal(disclosureScrollOwner(trigger,win),inner);inner.parentElement=body;win.getComputedStyle=()=>({overflowY:'visible'});assert.equal(disclosureScrollOwner(trigger,win),root);
 win.getComputedStyle=()=>({overflowY:'auto'});inner.scrollHeight=inner.clientHeight;assert.equal(disclosureScrollOwner(trigger,win),root,'unbounded auto wrappers are not scroll owners');
});
function fixture({reduce=false,growth=0}={}){
 const eventTarget=()=>{const listeners=new Map();return{addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},emit(type,event={}){for(const fn of listeners.get(type)||[])fn(event);},listeners};};
 const doc=eventTarget(),win=eventTarget(),vv=eventTarget(),preference={...eventTarget(),matches:reduce};let now=0,seq=0;const rafs=new Map(),writes=[];
 const owner={isConnected:true,scrollTop:100,scrollLeft:0,clientTop:0,clientHeight:600,scrollHeight:1000,style:{},getBoundingClientRect:()=>box(80,680),scrollTo({top}){this.scrollTop=top;writes.push(top);}};
 doc.documentElement={clientHeight:844,clientWidth:390};doc.scrollingElement={isConnected:true,scrollTop:999};doc.body={};
 Object.assign(vv,{offsetTop:0,height:844,scale:1});Object.assign(win,{document:doc,visualViewport:vv,innerHeight:844,performance:{now:()=>now},matchMedia:()=>preference,requestAnimationFrame(fn){rafs.set(++seq,fn);return seq;},cancelAnimationFrame:id=>rafs.delete(id)});
 const trigger={isConnected:true,getClientRects:()=>[1],closest:()=>null,getBoundingClientRect:()=>box(500,548)};let current=true;
 const helper=createDisclosureReveal(win),options={scrollContainer:owner,trigger,expandedRegion:box(550,780),pendingLayoutGrowth:growth,isCurrent:()=>current};
 const tick=(ms=16)=>{now+=ms;const list=[...rafs.values()];rafs.clear();list.forEach(fn=>fn(now));};
 return{helper,options,owner,root:doc.scrollingElement,win,doc,vv,preference,writes,rafs,trigger,tick,hide(){current=false;},measure(){tick();tick();},finish(){for(let i=0;i<16;i++)tick();}};
}
test('normal reveal waits for committed layout and moves only its owner over 200ms',()=>{
 const f=fixture();f.helper.reveal(f.options);assert.equal(f.writes.length,0);f.measure();assert.equal(f.writes.length,0);f.tick(100);assert.ok(f.owner.scrollTop>100&&f.owner.scrollTop<200);f.tick(100);assert.equal(f.owner.scrollTop,200);assert.equal(f.root.scrollTop,999);assert.equal(f.helper.active,false);
});
test('reduced motion repositions once without changing focus or creating an animation',()=>{
 const f=fixture({reduce:true});f.helper.reveal(f.options);f.measure();assert.deepEqual(f.writes,[200]);assert.equal(f.rafs.size,0);
});
test('already visible target does not write even an unchanged scrollTop',()=>{
 const f=fixture();f.helper.reveal({...f.options,expandedRegion:box(550,650)});f.measure();f.finish();assert.deepEqual(f.writes,[]);
});
test('predicted animated layout growth prevents premature range clamping',()=>{
 const f=fixture({growth:300});f.owner.scrollHeight=720;f.helper.reveal(f.options);f.measure();f.finish();assert.equal(f.owner.scrollTop,200);
});
test('real scroll extent clamps the planned destination without adding spacers',()=>{
 const f=fixture();f.owner.scrollHeight=720;f.helper.reveal(f.options);f.measure();f.finish();assert.equal(f.owner.scrollTop,120);assert.equal(f.owner.scrollHeight,720);
});

test('content-focus uses identical clamped targets in normal and reduced motion without adding range',()=>{
 for(const reduce of [false,true]){
  const f=fixture({reduce});f.helper.reveal({...f.options,policy:'content-focus',anchor:box(500,548)});f.measure();f.finish();
  assert.equal(f.owner.scrollTop,400);assert.equal(f.owner.scrollHeight,1000);assert.equal(f.root.scrollTop,999);
 }
});
test('rapid open/close and removed content cannot run an old queued reveal',()=>{
 for(const invalidate of [f=>f.helper.cancel(),f=>f.hide(),f=>{f.trigger.isConnected=false;}]){
  const f=fixture();f.helper.reveal(f.options);invalidate(f);f.finish();assert.deepEqual(f.writes,[]);assert.equal(f.helper.active,false);
 }
});
test('latest disclosure wins without changing the previous disclosure state',()=>{
 const f=fixture();f.helper.reveal(f.options);f.measure();f.tick(40);const before=f.owner.scrollTop;
 f.helper.reveal({...f.options,expandedRegion:box(550,730)});f.measure();f.finish();assert.equal(f.owner.scrollTop,before+50);
});
test('wheel, touch, drag, new click and keyboard scroll cancel running motion',()=>{
 for(const[type,event]of [['wheel',{}],['touchstart',{}],['pointerdown',{}],['click',{}],['keydown',{key:'PageDown'}],['keydown',{key:'Tab'}]]){
  const f=fixture();f.helper.reveal(f.options);f.measure();f.tick(50);const before=f.owner.scrollTop;f.doc.emit(type,event);f.finish();assert.equal(f.owner.scrollTop,before);assert.equal(f.helper.active,false);
 }
});
test('manual scroll is distinguished from the helper own scroll event',()=>{
 const f=fixture();f.helper.reveal(f.options);f.measure();f.tick(50);f.doc.emit('scroll',{target:f.owner});assert.equal(f.helper.active,true);f.owner.scrollTop+=20;f.doc.emit('scroll',{target:f.owner});const before=f.owner.scrollTop;f.finish();assert.equal(f.owner.scrollTop,before);assert.equal(f.helper.active,false);
});
test('input focus/keyboard viewport take authority before any stale reveal',()=>{
 for(const cancel of [f=>f.doc.emit('focusin',{target:{matches:()=>true}}),f=>f.vv.emit('resize'),f=>f.vv.emit('scroll'),f=>f.win.emit('popstate')]){
  const f=fixture();f.helper.reveal(f.options);cancel(f);f.finish();assert.deepEqual(f.writes,[]);
 }
});
test('dispose removes listeners and cancels pending work; later requests stay inert',()=>{
 const f=fixture();f.helper.reveal(f.options);f.helper.dispose();f.finish();f.helper.reveal(f.options);assert.equal(f.rafs.size,0);assert.equal(f.writes.length,0);assert.ok([...f.doc.listeners.values()].every(s=>s.size===0));
});
test('shared easing is monotonic, restrained and ends at the target',()=>{
 const values=Array.from({length:101},(_,i)=>disclosureEase(i/100));assert.ok(values.every((n,i)=>n>=0&&n<=1&&(!i||n>=values[i-1])));assert.ok(values[100]>.9999);
});
test('all eight inventoried inline consumers use one page-owned geometry helper',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 for(const text of ['createDisclosureReveal(window)','inlineReveal.dispose()','bindPhotoDisclosure(individualPhoto','bindPhotoDisclosure(coverDisclosure','revealInline(button,()=>','revealInline(elements.editFoodNutrition','revealInline(actionToggle,inlineActions','revealInline(elements.exerciseCaloriesEdit','revealInline(current.querySelector(\'[data-scan-action=correct]\')','revealInline(trigger,() => [...current.querySelectorAll'])assert.ok(src.includes(text),text);
});
