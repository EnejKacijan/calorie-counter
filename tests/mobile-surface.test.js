import test from 'node:test';
import assert from 'node:assert/strict';
import {lockSurfaceScroll,isolateSurfaceBackground,bindSurfaceViewport,bindSheetGestures,focusSurfaceTarget} from '../public/mobile-surface.js';

function events(extra={}) {
 const listeners=new Map();
 return Object.assign({listeners,addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener(k,fn){listeners.get(k)?.delete(fn);},send(k,event={}){for(const fn of listeners.get(k)||[])fn({type:k,...event});}},extra);
}
function style(values={}) {return Object.assign({getPropertyValue(k){return this[k]||'';},getPropertyPriority(){return '';},setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}},values);}
function runtime(){
 const queue=new Map();let id=0;
 const root={style:style({minHeight:'100%',overscrollBehavior:'auto',overflowX:'clip',overflowY:'scroll',scrollbarGutter:'auto'}),scrollHeight:1400,clientHeight:844,clientWidth:378};
 const body={style:style({position:'',top:'',left:'',right:'',width:'',overflow:'auto'}),getBoundingClientRect:()=>({width:378})};
 const doc=events({body,documentElement:root,scrollingElement:root});
 const win=events({document:doc,scrollX:0,scrollY:420,innerHeight:844,innerWidth:390,visualViewport:events({scale:1,height:844,offsetTop:0}),matchMedia:q=>({matches:!q.includes('reduce')}),scrollTo(v){this.restored=v;},requestAnimationFrame(fn){queue.set(++id,fn);return id;},cancelAnimationFrame(i){queue.delete(i);},flush(){for(const [i,fn]of queue){queue.delete(i);fn();}},MutationObserver:class{observe(){}disconnect(){}}});
 return{win,doc,root,body};
}
test('lock preserves the actual document range/gutter and body coordinates, then restores exact styles once',()=>{
 const {win,root,body}=runtime();const prior={...body.style};
 const release=lockSurfaceScroll(win);assert.equal(root.style.minHeight,'1400px');assert.equal(body.style.width,'378px');assert.equal(body.style.top,'-420px');assert.equal(root.style.overflowY,'scroll');assert.equal(root.style.scrollbarGutter,'auto');
 release();release();assert.deepEqual(body.style,prior);assert.equal(root.style.minHeight,'100%');assert.equal(root.style.overscrollBehavior,'auto');assert.deepEqual(win.restored,{left:0,top:420,behavior:'instant'});
 assert.equal(root.style.overflowX,'clip');assert.equal(root.style.overflowY,'scroll');assert.equal(root.style.scrollbarGutter,'auto');
 assert.equal([...win.document.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});
test('nested lock and inert ownership survive both release orders and repeat without drift',()=>{
 for(const reverse of [false,true]) {const {win,root,body}=runtime();const target={inert:false};
 for(let n=0;n<3;n++){const a=lockSurfaceScroll(win),b=lockSurfaceScroll(win),ia=isolateSurfaceBackground([target]),ib=isolateSurfaceBackground([target]);
 (reverse?b:a)();(reverse?ib:ia)();assert.equal(body.style.position,'fixed');assert.equal(target.inert,true);
 (reverse?a:b)();(reverse?ia:ib)();assert.equal(body.style.position,'');assert.equal(target.inert,false);assert.equal(root.style.minHeight,'100%');}
 }
});

test('root lock retains native scrollbar policy rather than shifting fixed navigation',()=>{
 const {win,root}=runtime();root.clientWidth=win.innerWidth;const release=lockSurfaceScroll(win);
 assert.equal(root.style.scrollbarGutter,'auto');assert.equal(root.style.overflowY,'scroll');release();assert.equal(root.style.overflowY,'scroll');
});
test('only the first lock owner resolves the reading anchor after final layout restoration, exactly once',()=>{
 for(const reverse of [false,true]) {
  const {win,root,body}=runtime();let resolutions=0,scrolls=0;
  win.scrollTo=value=>{scrolls++;win.restored=value;};
  const outer=lockSurfaceScroll(win,{restorePosition:saved=>{
   resolutions++;assert.equal(body.style.position,'');assert.equal(root.style.minHeight,'100%');
   assert.deepEqual(saved,{left:0,top:420});return {...saved,top:485};
  }});
  const inner=lockSurfaceScroll(win,{restorePosition:()=>assert.fail('nested owner must not replace the anchor')});
  (reverse?outer:inner)();assert.equal(resolutions,0);assert.equal(scrolls,0);
  (reverse?inner:outer)();outer();inner();assert.equal(resolutions,1);assert.equal(scrolls,1);
  assert.deepEqual(win.restored,{left:0,top:485,behavior:'instant'});
  lockSurfaceScroll(win)();assert.deepEqual(win.restored,{left:0,top:420,behavior:'instant'});
 }
});
test('background touch is blocked without blocking the active content scroller',()=>{
 const {win,doc}=runtime();const release=lockSurfaceScroll(win);let blocked=0;
 doc.send('touchmove',{target:{closest:()=>null},preventDefault(){blocked++;}});
 doc.send('wheel',{target:{closest:s=>s.includes('dialog')?{}:null},preventDefault(){blocked++;}});
 assert.equal(blocked,1);release();
});

test('prepareLayout restores geometry exactly once but retains background gesture ownership',()=>{
 const {win,doc,body,root}=runtime();let scrolls=0,blocked=0;win.scrollTo=()=>scrolls++;
 const release=lockSurfaceScroll(win);release.prepareLayout();release.prepareLayout();
 assert.equal(body.style.position,'');assert.equal(root.style.minHeight,'100%');assert.equal(scrolls,1);
 doc.send('touchmove',{target:{closest:()=>null},preventDefault(){blocked++;}});assert.equal(blocked,1);
 release();release();assert.equal(scrolls,1);assert.equal([...doc.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});
test('preparing a nested photo leaves the outer editor layout and interaction locks intact',()=>{
 const {win,doc,body}=runtime();let scrolls=0;win.scrollTo=()=>scrolls++;
 const outer=lockSurfaceScroll(win),photo=lockSurfaceScroll(win);photo.prepareLayout();photo();
 assert.equal(body.style.position,'fixed');assert.equal(scrolls,0);assert.ok(doc.listeners.get('touchmove').size);
 outer();assert.equal(body.style.position,'');assert.equal(scrolls,1);assert.equal(doc.listeners.get('touchmove').size,0);
});
test('rapid replacement after preparation cannot unlock or restore over the new owner',()=>{
 const {win,doc,body}=runtime();let scrolls=0;win.scrollTo=()=>scrolls++;
 const old=lockSurfaceScroll(win);old.prepareLayout();win.scrollY=610;const next=lockSurfaceScroll(win);
 old();old.prepareLayout();assert.equal(body.style.top,'-610px');assert.equal(scrolls,1);assert.equal(doc.listeners.get('touchmove').size,1);
 next.prepareLayout();assert.equal(body.style.position,'');assert.equal(scrolls,2);next();assert.equal(doc.listeners.get('touchmove').size,0);
});
test('outer disposal before a prepared photo keeps its blocker through final cleanup',()=>{
 const {win,doc,body}=runtime();const outer=lockSurfaceScroll(win),photo=lockSurfaceScroll(win);
 photo.prepareLayout();outer();assert.equal(body.style.position,'');assert.equal(doc.listeners.get('touchmove').size,1);
 photo();assert.equal(doc.listeners.get('touchmove').size,0);
});
test('viewport reveals only the inner scroller, restores prior properties, removes listeners and pending work',()=>{
 const {win,doc}=runtime();const input={matches:()=>true,getBoundingClientRect:()=>({top:580,bottom:628})};doc.activeElement=input;
 const scroller={contains:()=>true,scrollTop:0,getBoundingClientRect:()=>({top:300,bottom:560})};
 const classes=new Set();const panel=events({style:style({'--surface-height':'77px'}),classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)}});
 win.visualViewport.height=430;win.visualViewport.offsetTop=90;
 const release=bindSurfaceViewport(panel,win,{scroller});assert.equal(scroller.scrollTop,116);assert.equal(panel.style['--surface-height'],'430px');assert.equal(panel.style['--surface-safe-bottom'],'0px');
 win.visualViewport.send('resize');release();win.flush();assert.equal(panel.style['--surface-height'],'77px');assert.equal(classes.size,0);
 for(const target of [win.visualViewport,panel])assert.equal([...target.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});
test('focus return never scrolls and refuses an inert or detached target',()=>{
 let called=0;const target={isConnected:true,closest:()=>null,focus(options){called++;assert.deepEqual(options,{preventScroll:true});}};
 focusSurfaceTarget(target);target.isConnected=false;focusSurfaceTarget(target);target.isConnected=true;target.closest=()=>({});focusSurfaceTarget(target);assert.equal(called,1);
});
test('shared viewport owner keeps locked background at the same visible position through keyboard pan/refocus',()=>{
 const {win,body}=runtime(),classes=new Set();
 const panel=events({style:style(),classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)}});
 const unlock=lockSurfaceScroll(win),release=bindSurfaceViewport(panel,win,{scroller:null});
 for(const top of [0,60,90,0,60,0]){
  win.visualViewport.height=top?390:844;win.visualViewport.offsetTop=top;win.visualViewport.send('resize');win.flush();
  assert.equal(Number.parseFloat(body.style.top)-top,-420);
  assert.equal(panel.style['--surface-bottom'],`${844-win.visualViewport.height-top}px`);
  assert.equal(win.restored,undefined,'no repeated document-scroll compensation');
 }
 release();unlock();assert.equal(body.style.top,'');assert.deepEqual(win.restored,{left:0,top:420,behavior:'instant'});
 for(const target of [win,win.document,win.visualViewport,panel])assert.equal([...target.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});
test('viewport pan honors an already-panned lock origin and never counteracts pinch zoom',()=>{
 const {win,body}=runtime(),classes=new Set();win.visualViewport.offsetTop=40;
 const panel=events({style:style(),classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)}});
 const unlock=lockSurfaceScroll(win),release=bindSurfaceViewport(panel,win,{scroller:null});
 win.visualViewport.offsetTop=100;win.visualViewport.send('scroll');win.flush();assert.equal(body.style.top,'-360px');
 win.visualViewport.scale=2;win.visualViewport.offsetTop=160;win.visualViewport.send('scroll');win.flush();assert.equal(body.style.top,'-360px');
 release();unlock();
});
test('a confirmed form exit freezes sheet geometry while keyboard retreat still tracks the locked background',()=>{
 const {win,body}=runtime(),classes=new Set();
 const panel=events({style:style(),classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)}});
 const unlock=lockSurfaceScroll(win),release=bindSurfaceViewport(panel,win,{scroller:null});
 win.visualViewport.height=440;win.visualViewport.offsetTop=30;win.visualViewport.send('resize');
 assert.equal(panel.style['--surface-bottom'],'374px');
 release.freeze();
 win.visualViewport.height=700;win.visualViewport.offsetTop=10;win.visualViewport.send('resize');win.flush();
 assert.equal(panel.style['--surface-bottom'],'374px');
 assert.equal(panel.style['--surface-height'],'440px');
 assert.equal(body.style.top,'-410px');
 release();unlock();assert.equal(panel.style['--surface-bottom'],undefined);
});
function gesture(){
 const {win,doc}=runtime();let closed=0,settled=0;
 const panel={hidden:false,style:style(),dataset:{},offsetHeight:600,contains:()=>true,getBoundingClientRect:()=>({left:0,right:390,top:0,bottom:844}),setPointerCapture(id){this.captured=id;},hasPointerCapture(id){return this.captured===id;},releasePointerCapture(){this.captured=null;}};
 const handle={contains:()=>true,closest:()=>null};let time=0;win.performance={now:()=>time};
 const release=bindSheetGestures({surface:panel,handle,win,setPosition:y=>panel.style.translate=`0 ${y}px`,onDismiss:()=>closed++,onReset:()=>settled++});
 const send=(k,y,at,id=1,extra={})=>{time=at;doc.send(k,{target:handle,pointerType:'mouse',isPrimary:true,button:0,pointerId:id,clientX:30,clientY:y,cancelable:true,preventDefault(){},stopPropagation(){},...extra});win.flush();};
 return{win,doc,panel,handle,send,release,get closed(){return closed;},get settled(){return settled;}};
}
test('handle gives direct movement, settles small drags and dismisses a deliberate distance only once',()=>{
 const g=gesture();g.send('pointerdown',0,0);g.send('pointermove',15,200);assert.equal(g.panel.style.translate,'0 15px');g.send('pointerup',15,250);assert.equal(g.closed,0);assert.equal(g.settled,1);
 g.send('pointerdown',0,300);g.send('pointermove',90,600);g.send('pointerup',90,620);g.send('pointerup',90,621);assert.equal(g.closed,1);g.release();
});
test('pointer cancel, multitouch and nonprimary starts never dismiss and gesture listeners are scoped',()=>{
 const g=gesture();g.send('pointerdown',0,0);g.send('pointermove',100,300);g.send('pointercancel',100,301);assert.equal(g.closed,0);
 g.send('pointerdown',0,400);g.send('pointermove',100,500);g.doc.send('pointerdown',{pointerType:'touch',pointerId:2});g.send('pointerup',100,501);assert.equal(g.closed,0);
 g.send('pointerdown',0,600,2,{isPrimary:false});g.send('pointermove',100,700,2);g.send('pointerup',100,701,2);assert.equal(g.closed,0);
 assert.equal(g.panel.captured,null);g.release();assert.equal([...g.doc.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});
