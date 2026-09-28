import test from 'node:test';
import assert from 'node:assert/strict';
import {createAddPresentation,addPresentationTiming} from '../public/add-presentation.js';
function fixture({hidden=false,unsupported=false,nested=false,fullExit=nested}={}) {
 const calls=[],timers=new Map(),frames=new Map();let time=0,closed=0,transform='none',opacity='1';
 const surface={dataset:{},animate(frames,timing){let resolve,reject;const a={finished:new Promise((a,b)=>{resolve=a;reject=b;}),pause(){this.paused=true;},play(){this.paused=false;this.played=true;},cancel(){this.cancelled=true;reject(Error('cancel'));},finish:()=>resolve()};calls.push({frames,timing,a});return a;}};
 if(unsupported)delete surface.animate;
 const win={document:{visibilityState:hidden?'hidden':'visible',timeline:{currentTime:1234}},getComputedStyle:()=>({transform,opacity}),requestAnimationFrame(fn){frames.set(++time,fn);return time;},cancelAnimationFrame(id){frames.delete(id);},setTimeout(fn,ms){timers.set(++time,{fn,ms});return time;},clearTimeout(id){timers.delete(id);}};
 const presentation=createAddPresentation(surface,win,()=>closed++,{nested,fullExit});
 const paint=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
 return {presentation,calls,timers,frames,surface,paint,play(){paint();paint();},get closed(){return closed;},position(value,alpha='1'){transform=value;opacity=alpha;}};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('Edit Food keeps its entrance but exits fully right in one opaque 180ms phase',async()=>{
 const f=fixture({nested:true});f.presentation.open();
 assert.deepEqual(f.calls[0].frames,[{transform:'translateX(18px)',opacity:1},{transform:'translateX(0px)',opacity:1}]);
 assert.equal(f.calls[0].timing.duration,170);assert.equal(f.calls[0].timing.easing,'cubic-bezier(.2,.8,.2,1)');
 f.position('matrix(1, 0, 0, 1, 8, 0)');f.presentation.close();
 assert.deepEqual(f.calls[1].frames,[{transform:'matrix(1, 0, 0, 1, 8, 0)',opacity:1},{transform:'translateX(100%)',opacity:1}]);
 assert.equal(f.calls[1].timing.duration,180);assert.equal(f.calls[0].a.cancelled,true);
 assert.equal(f.frames.size,0);assert.equal(f.calls[1].a.startTime,1234);
 f.calls[0].a.finish();await flush();assert.equal(f.closed,0);
 f.calls[1].a.finish();await flush();assert.equal(f.closed,1);
});
test('Edit exit has bounded fallback and idempotent cleanup even without completion events',async()=>{
 const f=fixture({nested:true});f.presentation.open({immediate:true});f.presentation.close();
 const fallback=[...f.timers.values()][0];assert.equal(fallback.ms,260);assert.equal(f.closed,0);
 fallback.fn();fallback.fn();f.calls[0].a.finish();await flush();assert.equal(f.closed,1);
});
test('rapid Edit reopen invalidates the full-distance exit callback and timer',async()=>{
 const f=fixture({nested:true}),p=f.presentation;p.open({immediate:true});p.close();const prior=[...f.timers.values()][0].fn;
 f.position('matrix(1, 0, 0, 1, 230, 0)');p.open({from:p.frame});prior();f.calls[0].a.finish();await flush();
 assert.equal(f.closed,0);assert.equal(p.state,'opening');assert.equal(f.calls[1].frames[0].transform,'matrix(1, 0, 0, 1, 230, 0)');
 f.calls[1].a.finish();await flush();assert.equal(p.state,'open');
});
test('nested reduced/keyboard/committed gesture closes immediately and leaves no effect',()=>{
 const f=fixture({nested:true});f.presentation.open({immediate:true});f.presentation.close({immediate:true});
 assert.equal(f.calls.length,0);assert.equal(f.closed,1);assert.equal(f.frames.size,0);
});
test('Food and Exercise Add roots use the same opaque horizontal entry and full Back exit',async()=>{
 const f=fixture(),p=f.presentation;p.open();assert.equal(p.state,'opening');
 assert.deepEqual(f.calls[0].frames,[{transform:'translateX(18px)',opacity:1},{transform:'translateX(0px)',opacity:1}]);
 assert.deepEqual(f.calls[0].timing,{...addPresentationTiming.opening,fill:'both'});assert.equal(f.calls[0].timing.duration,170);
 f.calls[0].a.finish();await flush();assert.equal(p.state,'open');assert.equal(f.calls[0].a.cancelled,true);assert.equal(f.timers.size,0);
 p.close();assert.equal(p.state,'closing');assert.equal(f.calls[1].timing.duration,180);assert.equal(f.closed,0);
 assert.deepEqual(f.calls[1].frames,[{transform:'none',opacity:1},{transform:'translateX(100%)',opacity:1}]);
 f.calls[1].a.finish();await flush();assert.equal(p.state,'closed');assert.equal(f.closed,1);p.close();assert.equal(f.closed,1);
});
test('Back mid-entrance samples current position before cancelling; stale open cannot complete exit',async()=>{
 const f=fixture(),p=f.presentation;p.open();f.position('matrix(1, 0, 0, 1, 12, 0)');p.close();
 assert.deepEqual(f.calls[1].frames[0],{transform:'matrix(1, 0, 0, 1, 12, 0)',opacity:1});assert.equal(f.calls[0].a.cancelled,true);
 f.calls[0].a.finish();await flush();assert.equal(p.state,'closing');assert.equal(f.closed,0);
 f.calls[1].a.finish();await flush();assert.equal(f.closed,1);
});
test('reopen from sampled exit invalidates completion and fallback from the old session',async()=>{
 const f=fixture(),p=f.presentation;p.open({immediate:true});p.close();f.play();const fallback=[...f.timers.values()][0].fn;
 f.position('matrix(1, 0, 0, 1, 20, 0)');const from=p.frame;p.dispose();p.open({from});
 assert.deepEqual(f.calls[1].frames[0],from);assert.equal(from.opacity,1);fallback();f.calls[0].a.finish();await flush();assert.equal(p.state,'opening');assert.equal(f.closed,0);
 f.calls[1].a.finish();await flush();assert.equal(p.state,'open');
});
test('external animation cancellation completes owned presentation exactly once',async()=>{
 const f=fixture(),p=f.presentation;p.open();f.calls[0].a.cancel();await flush();assert.equal(p.state,'open');
 p.close();f.calls[1].a.cancel();await flush();assert.equal(p.state,'closed');assert.equal(f.closed,1);p.settle();assert.equal(f.closed,1);
});
test('bounded lost-event fallback releases closing; duplicate callbacks are harmless',async()=>{
 const f=fixture(),p=f.presentation;p.open();f.play();const opening=[...f.timers.values()][0];assert.equal(opening.ms,250);opening.fn();
 p.close();f.play();const closing=[...f.timers.values()][0];assert.equal(closing.ms,260);closing.fn();closing.fn();await flush();assert.equal(f.closed,1);assert.equal(f.timers.size,0);
});
test('existing Exercise edit can keep the short nested profile without adopting full food exit',()=>{
 const f=fixture({nested:true,fullExit:false});f.presentation.open();f.presentation.close();
 assert.deepEqual(f.calls[0].frames[0],{transform:'translateX(18px)',opacity:1});
 assert.deepEqual(f.calls[1].frames[1],{transform:'translateX(24px)',opacity:1});assert.equal(f.calls[1].timing.duration,150);
});
test('reduce/keyboard immediate, hidden document and absent WAAPI preserve lifecycle without travel',()=>{
 for(const options of [{hidden:true},{unsupported:true},{}]){const f=fixture(options),p=f.presentation;p.open({immediate:true});assert.equal(p.state,'open');p.close({immediate:true});assert.equal(f.closed,1);assert.equal(f.calls.length,0);}
 for(const options of [{hidden:true},{unsupported:true}]){const f=fixture(options);f.presentation.open();f.presentation.close();assert.equal(f.calls.length,0);assert.equal(f.closed,1);}
});
test('visibility/reduced-motion settlement finishes opening or closes exit; disposal invalidates callbacks',async()=>{
 const f=fixture(),p=f.presentation;p.open();p.settle();assert.equal(p.state,'open');p.close();p.settle();assert.equal(f.closed,1);
 p.open();f.play();const fallback=[...f.timers.values()][0].fn;p.dispose();fallback();await flush();assert.equal(p.state,'closed');assert.equal(f.closed,1);assert.equal(f.timers.size,0);
});

test('the initial effect is held at zero through a paint opportunity, then starts on the fresh timeline',()=>{
 const f=fixture();f.presentation.open();const a=f.calls[0].a;
 assert.equal(a.paused,true);assert.equal(a.currentTime,0);assert.equal(f.timers.size,0);
 f.paint();assert.equal(a.paused,true);assert.equal(a.played,undefined);assert.equal(f.timers.size,0);
 f.paint();assert.equal(a.played,true);assert.equal(a.startTime,1234);assert.equal(f.timers.size,1);
});
test('full Back exit starts from the sampled live surface without another entrance hold',()=>{
 const f=fixture();f.presentation.open({immediate:true});f.presentation.close();const a=f.calls[0].a;
 assert.equal(f.frames.size,0);assert.equal(a.startTime,1234);assert.equal(f.closed,0);
});
test('immediate close, dispose and preference settlement cancel queued frames before playback',async()=>{
 for(const action of ['close','dispose','settle']){
  const f=fixture();f.presentation.open();f.paint();f.presentation[action]({immediate:true});f.play();await flush();
  assert.equal(f.calls[0].a.played,undefined);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
 }
});
test('rapid open close reopen before any paint cannot play or complete a superseded animation',async()=>{
 const f=fixture(),p=f.presentation;p.open();p.close();p.open();f.play();await flush();
 assert.equal(f.calls[0].a.played,undefined);assert.equal(f.calls[1].a.played,undefined);assert.equal(f.calls[2].a.played,true);assert.equal(f.closed,0);
 f.calls[2].a.finish();await flush();assert.equal(p.state,'open');assert.equal(f.frames.size,0);
});
