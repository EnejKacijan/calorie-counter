import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {photoRevealFrame,createPhotoMotion,photoViewerTiming} from '../public/food-photo-motion.js';
import {foodPhotoTitle,photoElementVisible} from '../public/food-photo-ui.js';
import {photoDismissPose} from '../public/photo-dismiss.js';
const stage={x:0,y:100,width:390,height:650};

test('meal and individual photos use stable product titles, not generated names',()=>{
 assert.equal(foodPhotoTitle('meal'),'Meal photo');assert.equal(foodPhotoTitle('food'),'Food photo');assert.equal(foodPhotoTitle(),'Food photo');
});
test('thumbnail/focus targets exclude hidden ancestors without requiring newer checkVisibility API',()=>{
 const win={getComputedStyle:n=>({display:'block',visibility:'visible',opacity:'1',...n.css})};
 const parent={css:{}},node={isConnected:true,getClientRects:()=>[{}],parentElement:parent};
 assert.equal(photoElementVisible(node,win),true);
 for(const css of [{display:'none'},{visibility:'hidden'},{visibility:'collapse'},{opacity:'0'}]){parent.css=css;assert.equal(photoElementVisible(node,win),false);}
 parent.css={};node.isConnected=false;assert.equal(photoElementVisible(node,win),false);assert.equal(photoElementVisible(null,win),false);
 node.isConnected=true;node.getClientRects=()=>[];assert.equal(photoElementVisible(node,win),false);
});
test('source geometry uses one uniform scale and a crop matching the actual square thumbnail',()=>{
 const frame=photoRevealFrame({x:20,y:300,width:48,height:48},stage,900,1200);
 assert.equal(frame.transform,'translate(-151px,-101px) scale(0.12307692307692308)');
 assert.equal(frame.clipPath,'inset(130px 0px)');assert.equal(frame.opacity,1);
 // At the start the clipped box is 48x48, centered exactly on the source.
 assert.equal((650-260)*48/390,48);
});
test('portrait, landscape and wide preview geometry avoid nonuniform image stretching',()=>{
 for(const [iw,ih]of [[900,1600],[1600,900],[900,900]]){
  const frame=photoRevealFrame({x:24,y:210,width:112,height:112},stage,iw,ih);
  assert.match(frame.transform,/scale\([\d.]+\)$/);assert.doesNotMatch(frame.transform,/scale[XY]/);assert.doesNotMatch(frame.clipPath,/NaN|Infinity|-/);
 }
});
test('absent, zero-size or unknown image sources use the compact reveal fallback',()=>{
 assert.equal(photoRevealFrame(null,stage,900,1200),null);assert.equal(photoRevealFrame({width:0,height:48},stage,900,1200),null);assert.equal(photoRevealFrame({width:48,height:48},stage,0,0),null);
});
function fixture({reduce=false,hidden=false,unsupported=false}={}){
 const calls=[],timers=new Map(),rafs=new Map(),states=[];let seq=0,closed=0;
 const node=id=>({id,style:{transform:'matrix(1, 0, 0, 1, 0, 0)',clipPath:'inset(0px)',opacity:'1'},animate(frames,options){let resolve,reject;const a={finished:new Promise((a,b)=>{resolve=a;reject=b;}),pause(){this.paused=true;},play(){this.played=true;},cancel(){this.cancelled=true;reject(Error('cancel'));},finish:()=>resolve()};calls.push({id,frames,options,a});return a;}});
 const frame=node('frame'),scrim=node('scrim'),chrome=[node('header'),node('footer')];if(unsupported)delete frame.animate;
 const win={document:{hidden,timeline:{currentTime:1234}},matchMedia:()=>({matches:reduce}),getComputedStyle:e=>e.style,requestAnimationFrame(fn){rafs.set(++seq,fn);return seq;},cancelAnimationFrame(id){rafs.delete(id);},setTimeout(fn,ms){timers.set(++seq,{fn,ms});return seq;},clearTimeout:id=>timers.delete(id)};
 const motion=createPhotoMotion({frame,scrim,chrome,win,onState:s=>states.push(s),onClosed:()=>closed++});
 const tick=()=>{const list=[...rafs.values()];rafs.clear();list.forEach(fn=>fn());};
 return{motion,calls,frame,scrim,chrome,timers,rafs,states,play(){tick();tick();},get closed(){return closed;}};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('opening holds the source pose through paint then runs a shared short easing',async()=>{
 const f=fixture(),source=photoRevealFrame({x:20,y:300,width:48,height:48},stage,900,1200);f.motion.open(source);
 assert.equal(f.calls.length,4);assert.deepEqual(f.calls[0].frames[0],source);assert.equal(f.calls[0].options.duration,180);assert.equal(f.calls[0].options.easing,photoViewerTiming.easing);
 assert.ok(f.calls.every(c=>c.a.paused&&c.a.currentTime===0));f.play();assert.ok(f.calls.every(c=>c.a.startTime===1234));f.calls.forEach(c=>c.a.finish());await flush();assert.equal(f.motion.state,'open');assert.equal(f.timers.size,0);assert.equal(f.closed,0);
});
test('close samples the interrupted opening frame and returns to source in 160ms',async()=>{
 const f=fixture();f.motion.open();f.frame.style.transform='matrix(.4,0,0,.4,-90,10)';f.motion.close({transform:'scale(.12)',clipPath:'inset(10px)',opacity:1});
 assert.equal(f.calls[4].frames[0].transform,f.frame.style.transform);assert.equal(f.calls[4].options.duration,160);assert.equal(f.rafs.size,0);assert.ok(f.calls.slice(0,4).every(c=>c.a.cancelled));f.calls.forEach(c=>c.a.finish());await flush();assert.equal(f.closed,1);
});
test('missing completion event uses bounded idempotent cleanup',async()=>{
 const f=fixture();f.motion.open();f.motion.settleOpen();f.motion.close();const t=[...f.timers.values()][0];assert.equal(t.ms,240);t.fn();t.fn();await flush();assert.equal(f.closed,1);assert.equal(f.motion.state,'closed');
});
test('dispose cancels pending frames/effects and invalidates old completion',async()=>{
 const f=fixture();f.motion.open();f.play();f.motion.close();const stale=[...f.timers.values()][0].fn;f.motion.dispose();stale();f.calls.forEach(c=>c.a.finish());await flush();assert.equal(f.closed,0);assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);
});
test('gesture takeover settles opening only; reduced, hidden and no-WAAPI paths are immediate',()=>{
 const f=fixture();f.motion.open();f.motion.settleOpen();assert.equal(f.motion.state,'open');assert.equal(f.closed,0);assert.equal(f.calls[0].a.cancelled,true);f.motion.close(null,{immediate:true});assert.equal(f.closed,1);
 for(const options of [{reduce:true},{hidden:true},{unsupported:true}]){const q=fixture(options);q.motion.open();assert.equal(q.motion.state,'open');q.motion.close();assert.equal(q.calls.length,0);assert.equal(q.closed,1);}
});
test('viewer copy/reset, decoded preview handoff, focus and scroll ownership stay scoped',()=>{
 const src=readFileSync(new URL('../public/food-photo-ui.js',import.meta.url),'utf8'),css=readFileSync(new URL('../public/food-photos.css',import.meta.url),'utf8');
 assert.match(src,/aria-label="Fit whole photo to screen">Fit to screen/);assert.match(src,/fit.disabled = state.scale === 1/);assert.match(src,/fit.onclick = .*state = \{ scale: 1, x: 0, y: 0 \}/);
 assert.match(src,/dialog.setAttribute\('aria-labelledby'/);assert.match(src,/heading.focus\(\{ preventScroll: true \}\)/);assert.match(src,/drawImage\(sourceImage/);assert.match(src,/await image.decode\(\)/);assert.match(src,/preview\?\.remove\(\)/);
 assert.match(src,/if \(pendingReturn\) await pendingReturn/);assert.match(src,/swipeBackCommitted === 'true'/);assert.match(css,/food-photo-viewer \{ touch-action:none;overscroll-behavior:none/);assert.match(css,/food-photo-viewer button:focus-visible/);
});
test('close prepares parent geometry before fresh target measurement and keeps inertness until unmount',()=>{
 const src=readFileSync(new URL('../public/food-photo-ui.js',import.meta.url),'utf8');
 const close=src.slice(src.indexOf('const close = (restore'),src.indexOf('const pop ='));
 assert.ok(close.indexOf('unlock.prepareLayout()')<close.indexOf('revealFrame(sourceRect())'));
 assert.ok(close.indexOf('dialog.inert = true')<close.indexOf('unlock.prepareLayout()'));
 const finish=src.slice(src.indexOf('function finish()'),src.indexOf('const close = (restore'));
 assert.ok(finish.indexOf('unlock.prepareLayout()')<finish.indexOf('dialog.close()'));
 assert.ok(finish.indexOf('dialog.remove()')<finish.indexOf('node.inert = false'));
 assert.match(finish,/if \(removed\) return; removed = true/);assert.doesNotMatch(src,/window.scrollTo/);
 assert.match(src,/if \(closing\) finish\(\); else/);assert.match(src,/removeEventListener\('visibilitychange', visibility\)/);
 const css=readFileSync(new URL('../public/package-scan.css',import.meta.url),'utf8');assert.doesNotMatch(css,/html:has\(\.food-photo-viewer/);
});

test('direct drag coalesces frames, keeps image opaque and fades chrome as groups',()=>{
 const f=fixture();f.motion.open();f.motion.settleOpen();f.motion.drag(photoDismissPose(10,60,700));f.motion.drag(photoDismissPose(10,120,700));
 assert.equal(f.rafs.size,1);f.play();assert.match(f.frame.style.transform,/120px/);assert.equal(f.frame.style.opacity,1);assert.ok(Number(f.scrim.style.opacity)<1);assert.ok(f.chrome.every(n=>Number(n.style.opacity)<1));assert.equal(f.motion.state,'dragging');
});
test('cancel returns from rendered drag pose, then clears all owned visuals and pending rAF',async()=>{
 const f=fixture();f.motion.open();f.motion.settleOpen();f.motion.drag(photoDismissPose(0,70,700));f.play();const from=f.frame.style.transform;
 f.motion.cancelDrag(70,700);assert.equal(f.calls[4].frames[0].transform,from);assert.ok(f.calls[4].options.duration>80&&f.calls[4].options.duration<180);
 f.calls.slice(4).forEach(c=>c.a.finish());await flush();assert.equal(f.motion.state,'open');assert.match(f.frame.style.transform,/scale\(1\)/);assert.equal(f.scrim.style.opacity,'1');assert.equal(f.closed,0);assert.equal(f.rafs.size,0);
});
test('commit continues from painted pose into live thumbnail, never unpainted last input',async()=>{
 const f=fixture();f.motion.open();f.motion.settleOpen();f.motion.drag(photoDismissPose(0,210,700));f.play();const from=f.frame.style.transform;
 f.motion.drag(photoDismissPose(0,240,700));const target=photoRevealFrame({x:20,y:300,width:48,height:48},stage,900,1200);
 f.motion.close(target,{dismiss:{distance:240,height:700}});assert.equal(f.calls[4].frames[0].transform,from);assert.deepEqual(f.calls[4].frames[1],target);assert.equal(f.rafs.size,0);
 f.motion.close(target);f.calls.forEach(c=>c.a.finish());await flush();assert.equal(f.closed,1);
});
test('missing source continues downward shrinking slightly, not compact center fallback',()=>{
 const f=fixture();f.motion.open();f.motion.settleOpen();f.motion.drag(photoDismissPose(0,210,700));f.play();f.motion.close(null,{dismiss:{distance:210,height:700}});
 const to=f.calls[4].frames[1];assert.match(to.transform,/translate3d\(0,804.9999999999999px,0\) scale\(.82\)/);assert.equal(to.opacity,0);
});
test('interrupt/dispose clear pending drag and invalidate cancel completion, reduced motion is immediate',async()=>{
 const f=fixture();f.motion.open();f.motion.settleOpen();f.motion.drag(photoDismissPose(0,100,700));f.motion.settleOpen();f.play();assert.match(f.frame.style.transform,/scale\(1\)/);assert.equal(f.scrim.style.opacity,'1');
 f.motion.drag(photoDismissPose(0,100,700));f.play();f.motion.cancelDrag(100,700);f.motion.dispose();f.calls.forEach(c=>c.a.finish());await flush();assert.equal(f.closed,0);assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);
 const r=fixture({reduce:true});r.motion.open();r.motion.drag(photoDismissPose(0,100,700));r.play();assert.match(r.frame.style.transform,/100px/);r.motion.cancelDrag(100,700);assert.equal(r.motion.state,'open');r.motion.drag(photoDismissPose(0,210,700));r.play();r.motion.close(null,{dismiss:{distance:210,height:700}});assert.equal(r.closed,1);assert.equal(r.calls.length,0);
});
