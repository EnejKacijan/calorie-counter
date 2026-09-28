import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindCalendarSwipe } from '../public/calendar-swipe.js';

function node() {
 const listeners=new Map();
 return {style:{},dataset:{},closest:()=>null,addEventListener(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f);},removeEventListener(k,f){listeners.get(k)?.delete(f);},
  send(type,extra={}){const e={target:this,cancelable:true,button:0,isPrimary:true,pointerType:'mouse',pointerId:1,clientX:0,clientY:0,detail:1,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const f of listeners.get(type)||[])f(e);return e;},
  getBoundingClientRect:()=>({width:300}),setPointerCapture(){this.captured=true;},releasePointerCapture(){this.captured=false;},hasPointerCapture(){return this.captured;}};
}
function fixture(reduce=false,canMove=()=>true) {
 const viewport=node(),track=node(),doc=node(),win=node(),moves=[];viewport.ownerDocument=doc;
 let time=0,id=0,prepared=0,cleared=0;const frames=new Map(),timers=new Map();
 Object.assign(win,{performance:{now:()=>time},requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:i=>frames.delete(i),setTimeout:(f,ms)=>{timers.set(++id,{f,at:time+ms});return id;},clearTimeout:i=>timers.delete(i),matchMedia:()=>({matches:reduce}),getComputedStyle:()=>({transform:'matrix(1,0,0,1,-360,0)'})});
 const c=bindCalendarSwipe({viewport,track,win,prepare:()=>prepared++,clear:()=>cleared++,commit:(d,e)=>moves.push(d),canMove});
 const tick=ms=>{time+=ms;for(const [i,f] of [...frames]){frames.delete(i);f();}for(const[i,t]of[...timers])if(t.at<=time){timers.delete(i);t.f();}};
 const send=(name,x=0,y=0,extra={})=>viewport.send(name,{clientX:x,clientY:y,...extra});
 return{viewport,track,doc,win,c,moves,tick,send,stats:()=>({prepared,cleared,timers:timers.size,frames:frames.size})};
}
test('prepares adjacent pages before movement; tracks 1:1 in rAF; never commits mid-drag',()=>{
 const f=fixture();f.send('pointerdown');assert.equal(f.stats().prepared,1);assert.equal(f.viewport.captured,undefined);
 f.tick(200);f.send('pointermove',-120);assert.equal(f.viewport.captured,true);assert.equal(f.track.style.transform,'translate3d(-300px,0,0)');f.tick(16);assert.equal(f.track.style.transform,'translate3d(-420px,0,0)');assert.deepEqual(f.moves,[]);
 f.send('pointerup',-120);assert.equal(f.track.style.transform,'translate3d(-600px,0,0)');assert.deepEqual(f.moves,[]);f.tick(300);assert.deepEqual(f.moves,[1]);f.tick(1000);assert.deepEqual(f.moves,[1]);assert.equal(f.track.style.transform,'translate3d(-100%,0,0)');
});
test('vertical/diagonal intent is irreversible; taps and keyboard activation remain native',()=>{
 const f=fixture();f.send('pointerdown');assert.equal(f.send('pointermove',5,30).prevented,undefined);f.send('pointerup',-180,30);f.tick(500);assert.deepEqual(f.moves,[]);
 f.send('pointerdown');f.send('pointerup',3,2);assert.equal(f.send('click').prevented,undefined);assert.deepEqual(f.moves,[]);
});
test('distance threshold is 28% of viewport, both directions; slow short drag cancels',()=>{
 for(const[d,expected]of[[-84,1],[84,-1],[-70,undefined],[70,undefined]]){const f=fixture();f.send('pointerdown');f.tick(500);f.send('pointermove',d);f.tick(150);f.send('pointerup',d);f.tick(300);assert.deepEqual(f.moves,expected?[expected]:[]);}
});
test('recent flick after long hold commits; tiny, stale and reverse flicks do not',()=>{
 const run=(a,b,wait)=>{const f=fixture();f.send('pointerdown');f.tick(1000);f.send('pointermove',a);f.tick(20);f.send('pointermove',b);f.tick(wait);f.send('pointerup',b);f.tick(300);return f.moves;};
 assert.deepEqual(run(-10,-30,10),[1]);assert.deepEqual(run(-5,-15,10),[]);assert.deepEqual(run(-10,-30,150),[]);assert.deepEqual(run(-55,-30,10),[]);
});
test('cancel settles from current position without semantic mutation and scopes ghost clicks',()=>{
 const f=fixture();f.send('pointerdown');f.tick(500);f.send('pointermove',-35);f.tick(16);assert.equal(f.track.style.transform,'translate3d(-335px,0,0)');f.send('pointerup',-35);assert.equal(f.send('click').prevented,true);assert.equal(f.send('click',0,0,{detail:0}).prevented,undefined);f.tick(400);assert.deepEqual(f.moves,[]);assert.equal(f.send('click').prevented,undefined);
});
test('overdrag clamps and keeps semantic date until release',()=>{
 const f=fixture();f.send('pointerdown');f.send('pointermove',-900);f.tick(16);assert.equal(f.track.style.transform,'translate3d(-600px,0,0)');assert.deepEqual(f.moves,[]);f.send('pointerup',-900);assert.deepEqual(f.moves,[1]);
});
test('a disabled forward range never reveals or commits a future page',()=>{
 const f=fixture(false,d=>d<0);
 f.send('pointerdown');f.send('pointermove',-100);f.tick(16);
 assert.equal(f.track.style.transform,'translate3d(-300px,0,0)');
 f.send('pointerup',-100);f.tick(300);assert.deepEqual(f.moves,[]);
 f.send('pointerdown');f.send('pointermove',100);f.tick(16);
 assert.equal(f.track.style.transform,'translate3d(-200px,0,0)');
 f.send('pointerup',100);f.tick(300);assert.deepEqual(f.moves,[-1]);
});
test('latest arrow interrupts settling; stale transition cannot navigate',()=>{
 const f=fixture();f.c.arrow(1);f.tick(50);f.c.arrow(-1);assert.deepEqual(f.moves,[]);f.track.send('transitionend',{propertyName:'transform'});assert.deepEqual(f.moves,[]);f.tick(300);assert.deepEqual(f.moves,[-1]);f.tick(1000);assert.deepEqual(f.moves,[-1]);
});
test('new drag continues from computed settle position and supersedes old intent',()=>{
 const f=fixture();f.c.arrow(1);f.tick(50);f.send('pointerdown');assert.equal(f.track.style.transform,'translate3d(-360px,0,0)');f.tick(300);f.send('pointermove',180);f.tick(16);assert.equal(f.track.style.transform,'translate3d(-180px,0,0)');f.send('pointerup',180);f.tick(300);assert.deepEqual(f.moves,[-1]);
});
test('touch adapter handles native touch; pointer events for same touch do not double count',()=>{
 const f=fixture(),t=x=>({identifier:9,clientX:x,clientY:0});f.send('pointerdown',0,0,{pointerType:'touch'});f.viewport.send('touchstart',{touches:[t(0)]});f.tick(300);f.viewport.send('touchmove',{touches:[t(-120)]});f.tick(16);assert.equal(f.track.style.transform,'translate3d(-420px,0,0)');f.viewport.send('touchend',{changedTouches:[t(-120)]});f.tick(300);assert.deepEqual(f.moves,[1]);
});
test('a tap interrupting settle activates its original day once, not the replacement under the finger',()=>{
 const f=fixture();let clicks=0;const day={isConnected:true,click:()=>clicks++};
 f.c.arrow(1);f.tick(40);f.send('pointerdown',0,0,{target:{closest:s=>s==='#calendarStrip button'?day:null}});f.send('pointerup',2);f.tick(400);assert.equal(clicks,1);assert.deepEqual(f.moves,[]);
});
test('external selected-date render resets a pending gesture without a later commit',()=>{
 const f=fixture();f.c.arrow(1);f.tick(50);f.c.reset();f.tick(500);assert.deepEqual(f.moves,[]);assert.equal(f.viewport.dataset.weekMotion,undefined);assert.equal(f.stats().timers,0);
});
test('touchcancel and multitouch reset without date change',()=>{
 for(const type of ['touchcancel','touchstart']){const f=fixture(),t={identifier:1,clientX:0,clientY:0};f.viewport.send('touchstart',{touches:[t]});f.viewport.send('touchmove',{touches:[{...t,clientX:-120}]});f.viewport.send(type,{touches:[t,{...t,identifier:2}]});f.tick(500);assert.deepEqual(f.moves,[]);assert.equal(f.track.style.transform,'translate3d(-100%,0,0)');}
});
test('resize, blur, background and disposal cancel all deferred navigation',()=>{
 for(const type of ['resize','blur','orientationchange','pagehide','visibilitychange','destroy']){const f=fixture();f.c.arrow(1);if(type==='destroy')f.c.destroy();else(type==='visibilitychange'?f.doc:f.win).send(type);f.tick(1000);assert.deepEqual(f.moves,[],type);assert.equal(f.track.style.transform,'translate3d(-100%,0,0)');assert.equal(f.stats().timers,0);}
});
test('reduced motion keeps direct tracking but release/arrow are immediate',()=>{
 const f=fixture(true);f.send('pointerdown');f.tick(300);f.send('pointermove',-120);f.tick(16);assert.equal(f.track.style.transform,'translate3d(-420px,0,0)');assert.deepEqual(f.moves,[]);f.send('pointerup',-120);assert.deepEqual(f.moves,[1]);assert.equal(f.stats().timers,0);f.c.arrow(-1);assert.deepEqual(f.moves,[1,-1]);
});
test('integration delegates both arrows and swipe to same local-date action; previews are read-only',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/commit: \(direction, event\) => changeCalendarWeek\(direction \* 7, event\)/);
 assert.match(app,/calendarSwipe.arrow\(-1, event\)/);assert.match(app,/calendarSwipe.arrow\(1, event\)/);
 assert.match(app,/state.selectedDate = localDateKey\(addDays\(dateFromKey\(state.selectedDate\), days\)\)/);
 assert.match(app,/preview \? \(state.days\[dateKey\] \|\| \{ foods: \[\], exercises: \[\] \}\) : ensureDay\(dateKey\)/);
 assert.match(app,/onDispose\(\(\) => calendarSwipe.destroy\(\)\)/);
});
