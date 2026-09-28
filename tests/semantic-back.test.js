import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSemanticBack, liveBackMotion, backSettleDuration, edgeTraceEnabled} from '../public/semantic-back.js';

function events(extra={}) {
  const listeners=new Map();
  return Object.assign({addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener(k,fn){listeners.get(k)?.delete(fn);},send(k,event={}){for(const fn of [...listeners.get(k)||[]])fn({type:k,...event});}},extra);
}
function node() {
  const props=new Map();
  return events({dataset:{},isConnected:true,closest:()=>null,getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,top:0,bottom:844,width:390}),
    getAnimations:()=>[],style:{getPropertyValue:k=>props.get(k)?.[0]||'',getPropertyPriority:k=>props.get(k)?.[1]||'',setProperty:(k,v,p='')=>props.set(k,[v,p]),removeProperty:k=>props.delete(k)}});
}
function fixture({motion=true,reduce=false,standalone=true,createMotion,allowFocusedControl}={}) {
  const surface=node(),doc=events({querySelector:()=>null}),tasks=new Map(),frames=new Map();
  let id=0,now=0,back=node(),state='detail',selection='',changed,clicks=0,committed=false;
  const win=events({document:doc,navigator:{standalone},visualViewport:events({scale:1}),getSelection:()=>selection,
    matchMedia:q=>({matches:q.includes('reduce')&&reduce}),setTimeout:(fn,ms)=>{tasks.set(++id,{fn,at:now+ms});return id;},clearTimeout:i=>tasks.delete(i),
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:i=>frames.delete(i),
    MutationObserver:class{constructor(fn){changed=fn;}observe(){}disconnect(){}}});
  back.click=()=>{doc.send('click',{detail:0});clicks++;committed=surface.dataset.swipeBackCommitted==='true';};
  const release=bindSemanticBack(surface,()=>back,win,{getState:()=>state,allowFocusedControl,...(motion?{motionTargets:()=>surface}:{}),...(createMotion?{createMotion:()=>createMotion(surface,win)}:{})});
  const flush=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());};
  const send=(type,x,y=200,{at=now+50,target=surface,count=1,cancelable=true,identifier=1}={})=>{
    now=at;let prevented=false;
    surface.send(type,{timeStamp:now,target,cancelable,touches:Array.from({length:count},(_,i)=>({identifier:identifier+i,clientX:x,clientY:y})),preventDefault(){assert.ok(cancelable);prevented=true;},stopPropagation(){}});flush();return prevented;
  };
  const tick=ms=>{now+=ms;for(const[i,t]of [...tasks])if(t.at<=now){tasks.delete(i);t.fn();}flush();};
  return{surface,doc,win,release,send,tick,flush,get clicks(){return clicks;},get committed(){return committed;},change(){state='other';changed();},disable(){back=null;changed();},select(){selection='selected';},
    start(){send('touchstart',8,200,{at:0});},move(x=188){return send('touchmove',x,200,{at:400});},end(){send('touchend',188,200,{at:600});},
    click(detail=1,trusted=true){let blocked=false;doc.send('click',{detail,isTrusted:trusted,preventDefault(){blocked=true;},stopImmediatePropagation(){}});return blocked;}};
}

test('live swipe tracks then settles and invokes the existing Back exactly once',()=>{
  const g=fixture();g.start();assert.ok(g.move());assert.equal(g.surface.style.getPropertyValue('transform'),'translate3d(180px,0,0)');g.end();
  assert.equal(g.clicks,0);assert.equal(g.surface.style.getPropertyValue('transform'),'translate3d(390px,0,0)');
  g.send('touchend',188);g.tick(200);assert.equal(g.clicks,1);assert.equal(g.committed,true);assert.equal(g.surface.style.getPropertyValue('transform'),'');assert.deepEqual(g.surface.dataset,{});
});
test('short drag snaps back without Back; a missing parent/motion never intercepts',()=>{
  const g=fixture();g.start();g.move(45);g.end();g.tick(200);assert.equal(g.clicks,0);assert.equal(g.surface.style.getPropertyValue('transform'),'');
  const legacy=fixture({motion:false});legacy.start();assert.equal(legacy.move(),false);legacy.end();assert.equal(legacy.clicks,0);assert.equal(legacy.committed,false);
});
test('ROOK release duration is proportional and bounded',()=>{
  assert.equal(backSettleDuration(0,390,true),200);assert.equal(backSettleDuration(380,390,true),40);assert.equal(backSettleDuration(195,390,false),100);
});
test('nested consumers may cap the shared settle at 160ms without changing other surfaces',()=>{
 const g=fixture({createMotion:(surface,win)=>({...liveBackMotion(surface,win),maxSettleDuration:160})});
 g.start();g.send('touchmove',70,200,{at:70});g.send('touchend',70,200,{at:90});
 assert.match(g.surface.style.getPropertyValue('transition'),/160ms/);
 g.tick(159);assert.equal(g.clicks,0);g.tick(1);assert.equal(g.clicks,1);
});
test('fresh flick commits but stale velocity, reversal and tiny fast movement do not',()=>{
  for(const[x,endAt,expected]of [[75,90,1],[75,250,0],[35,90,0]]){
    const g=fixture({reduce:true});g.start();g.send('touchmove',x,200,{at:70});g.send('touchend',x,200,{at:endAt});assert.equal(g.clicks,expected);
  }
  const g=fixture();g.start();g.move();g.send('touchmove',15,200,{at:450});g.end();g.tick(200);assert.equal(g.clicks,0);
});
test('vertical/diagonal/leftward intent yields permanently to the original interaction',()=>{
  for(const[x,y]of [[10,230],[30,225],[-20,200]]){const g=fixture();g.start();assert.equal(g.send('touchmove',x,y),false);g.move();g.end();g.tick(200);assert.equal(g.clicks,0);}
});
test('cancel, multitouch and wrong touch identity restore motion without navigating',()=>{
  for(const mode of ['cancel','multi','identity']){const g=fixture();g.start();g.move();if(mode==='cancel')g.send('touchcancel',188);else g.send('touchmove',188,200,mode==='multi'?{count:2}:{identifier:2});g.tick(200);g.end();assert.equal(g.clicks,0);assert.equal(g.surface.style.getPropertyValue('transform'),'');}
});
test('resize, blur, visibility, viewport, state change, teardown interrupt drag and settle',()=>{
  for(const settling of [false,true])for(const mode of ['resize','orientationchange','blur','visibility','viewport','state','disabled','dispose']){
    const g=fixture();g.start();g.move();if(settling)g.end();
    if(mode==='state')g.change();else if(mode==='disabled')g.disable();else if(mode==='dispose')g.release();else if(mode==='visibility')g.doc.send('visibilitychange');else if(mode==='viewport')g.win.visualViewport.send('resize');else g.win.send(mode);
    g.tick(500);assert.equal(g.clicks,0,mode);assert.equal(g.surface.style.getPropertyValue('transform'),'',mode);
  }
});
test('browser tabs, pinch zoom, selection, focused editor, excluded control and outside edge never capture',()=>{
  for(const mode of ['browser','zoom','selection','focus','control','outside','backdrop','inert']){
    const g=fixture({standalone:mode!=='browser'});
    if(mode==='zoom')g.win.visualViewport.scale=2;if(mode==='selection')g.select();if(mode==='focus')g.doc.activeElement={matches:()=>true};if(mode==='inert')g.surface.closest=()=>({});
    const target=mode==='control'?{closest:()=>({})}:g.surface;
    g.send('touchstart',mode==='outside'?25:8,mode==='backdrop'?-10:200,{at:0,target});g.move();g.end();g.tick(200);assert.equal(g.clicks,0,mode);
  }
});
test('noncancelable native scroll cannot be stolen after intent detection',()=>{
  const g=fixture();g.start();assert.equal(g.send('touchmove',188,200,{cancelable:false}),false);g.move();g.end();g.tick(200);assert.equal(g.clicks,0);
});

test('Add viewport may allow retained field focus after keyboard closes, never touches on controls',()=>{
 let keyboard=true;const field={matches:()=>true};
 const g=fixture({reduce:true,allowFocusedControl:active=>active===field&&!keyboard});g.doc.activeElement=field;
 g.start();g.move();g.end();assert.equal(g.clicks,0);
 keyboard=false;g.start();assert.equal(g.move(),true);g.end();assert.equal(g.clicks,1);
 const target={closest:()=>({})};g.send('touchstart',8,200,{target});g.move();g.end();assert.equal(g.clicks,1);
});
test('reduced motion tracks the finger but commits immediately with no second exit',()=>{
  const g=fixture({reduce:true});g.start();g.move();g.end();assert.equal(g.clicks,1);assert.equal(g.committed,true);assert.equal(g.surface.style.getPropertyValue('transform'),'');
});
test('residual click cannot cancel settling or activate the exposed parent; fresh touch/keyboard remain usable',()=>{
  const g=fixture();g.start();g.move();g.end();assert.equal(g.click(),true);g.tick(200);assert.equal(g.clicks,1);assert.equal(g.click(0),false);assert.equal(g.click(),true);
  g.doc.send('pointerdown');assert.equal(g.click(),false);
  const timed=fixture();timed.start();timed.move();timed.end();timed.release();assert.equal(timed.click(),true);timed.tick(351);assert.equal(timed.click(),false);
});
test('a real Back or Escape during settle cancels the pending second navigation',()=>{
  for(const kind of ['click','Escape']){const g=fixture();g.start();g.move();g.end();if(kind==='click')g.click(0,false);else g.doc.send('keydown',{key:'Escape'});g.tick(200);assert.equal(g.clicks,0);}
});
test('live motion coalesces frames and restores owned styles, not newer viewport values',()=>{
  const g=fixture(),other=node();g.surface.style.setProperty('transform','scale(1)','important');g.surface.style.setProperty('--height','844px');
  const motion=liveBackMotion([g.surface,other],g.win);motion.render(20,0);motion.render(50,0);g.flush();assert.equal(other.style.getPropertyValue('transform'),'translate3d(50px,0,0)');
  g.surface.style.setProperty('--height','430px');motion.clear();assert.equal(g.surface.style.getPropertyValue('transform'),'scale(1)');assert.equal(g.surface.style.getPropertyPriority('transform'),'important');assert.equal(g.surface.style.getPropertyValue('--height'),'430px');assert.equal(other.style.getPropertyValue('transform'),'');
});

test('a visible nested overlay blocks start and cancels an in-progress parent drag',()=>{
  for(const started of [false,true]){
    const g=fixture();if(started){g.start();g.move();}
    const overlay=node();overlay.contains=()=>false;g.doc.querySelectorAll=()=>[overlay];
    if(!started)g.start();assert.equal(g.move(),false);g.end();g.tick(500);assert.equal(g.clicks,0);assert.equal(g.surface.style.getPropertyValue('transform'),'');
  }
});

test('eligibility includes exactly the inner 24px, tracks children, and ignores pending wobble',()=>{
  for(const [x,expected] of [[0,1],[24,1],[24.1,0],[-1,0]]){
    const g=fixture({reduce:true});g.send('touchstart',x,200,{at:0});g.move(220);g.end();assert.equal(g.clicks,expected);
  }
  const g=fixture();g.start();assert.equal(g.send('touchmove',13,201),false);g.end();g.tick(500);assert.equal(g.clicks,0);assert.equal(g.click(),false);
});

test('touchend from another identifier does not dispatch Back',()=>{
  const g=fixture();g.start();g.move();g.surface.send('touchend',{changedTouches:[{identifier:9}]});g.tick(500);assert.equal(g.clicks,0);
});

test('a prepared parent is mounted only on intent, follows holds/reversal, and cleans up on cancel',()=>{
  let mounts=0,clears=0;
  const g=fixture({createMotion:(surface,win)=>{mounts++;const motion=liveBackMotion(surface,win);return{render:motion.render,clear(){clears++;motion.clear();}};}});
  g.start();g.send('touchmove',13);assert.equal(mounts,0);
  for(const x of [98,188,188,78]) {g.send('touchmove',x);assert.equal(g.surface.style.getPropertyValue('transform'),`translate3d(${x-8}px,0,0)`);assert.equal(g.surface.style.getPropertyValue('transition'),'none');}
  g.tick(500);assert.equal(g.surface.style.getPropertyValue('transform'),'translate3d(70px,0,0)');assert.equal(g.clicks,0);
  g.send('touchcancel',78);g.tick(200);assert.equal(mounts,1);assert.equal(clears,1);assert.equal(g.clicks,0);
});

test('a missing prepared parent fails closed instead of revealing another route',()=>{
  const g=fixture({createMotion:()=>null});g.start();assert.equal(g.move(),false);g.end();g.tick(500);assert.equal(g.clicks,0);
});

test('extreme edge and over-drag stay clamped, with no Back until release',()=>{
 for(const x of [0,4,8,16,24]){
  const g=fixture();g.send('touchstart',x,200,{at:0});
  for(const fraction of [.2,.4,.7,.95,1,1.5]){
   g.send('touchmove',x+390*fraction);assert.equal(g.clicks,0);
   assert.equal(g.surface.style.getPropertyValue('transform'),`translate3d(${Math.min(390,390*fraction)}px,0,0)`);
  }
  g.send('touchend',x+600);g.tick(200);assert.equal(g.clicks,1);assert.deepEqual(g.surface.dataset,{});
 }
});

test('invalid coordinates cannot leak non-finite transforms or dispatch Back',()=>{
 for(const x of [NaN,Infinity,-Infinity]){const g=fixture();g.start();g.send('touchmove',x);g.end();g.tick(500);assert.equal(g.clicks,0);assert.equal(g.surface.style.getPropertyValue('transform'),'');}
});

test('release timing uses the actual rendered position when the last input has not painted',()=>{
 for(const [visual,distance,commit] of [[0,380,true],[78,380,true],[117,60,false]]){
  const g=fixture();g.win.getComputedStyle=()=>({transform:`matrix(1,0,0,1,${visual},0)`});
  g.start();g.move(distance+8);g.end();
  assert.match(g.surface.style.getPropertyValue('transition'),new RegExp(`${backSettleDuration(visual,390,commit)}ms`));
  g.tick(200);assert.equal(g.clicks,Number(commit));
 }
});

test('rendered transition completion, not an early timeout, owns semantic Back',async()=>{
 let finish;const done=new Promise(resolve=>finish=resolve);
 const g=fixture({createMotion:()=>({readDistance:()=>195,render:(_x,ms)=>ms?done:undefined,clear(){}})});
 g.start();g.move();g.end();g.tick(1000);assert.equal(g.clicks,0);
 finish();await Promise.resolve();assert.equal(g.clicks,1);await Promise.resolve();assert.equal(g.clicks,1);
});

test('a cancelled or superseded transition cannot close a rapidly reopened surface',async()=>{
 for(const mode of ['blur','reject']){
  let finish,reject;const done=new Promise((a,b)=>{finish=a;reject=b;});
  const g=fixture({createMotion:()=>({render:(_x,ms)=>ms?done:undefined,clear(){}})});
  g.start();g.move();g.end();
  if(mode==='blur'){g.win.send('blur');g.start();finish();}else reject(new Error('transition cancelled'));
  await Promise.resolve();assert.equal(g.clicks,0);g.release();assert.deepEqual(g.surface.dataset,{});
 }
});

test('lost WebKit transition completion has a duration-derived deadline and exactly one final dispatch',async()=>{
 const g=fixture();let finishes=0,resolve;
 const pending=new Promise(r=>resolve=r);
 let count=0;g.surface.getAnimations=()=>++count===1?[]:[{transitionProperty:'transform',finished:pending,finish(){finishes++;},cancel(){}}];
 g.start();g.move();g.end();g.tick(250);
 assert.equal(g.clicks,1);assert.equal(finishes,1);assert.equal(g.surface.style.getPropertyValue('transform'),'');
 resolve();await Promise.resolve();await Promise.resolve();assert.equal(g.clicks,1);
});

test('document terminal event recovers a detached original touch target, without a second event model',()=>{
 const g=fixture(),target=node();g.send('touchstart',8,200,{target});g.move();
 g.surface.send('pointercancel');g.surface.send('lostpointercapture');assert.ok(g.surface.dataset.edgeBackActive);
 target.isConnected=false;
 target.send('touchend',{timeStamp:600,changedTouches:[{identifier:1}],cancelable:true,preventDefault(){},stopPropagation(){}});
 g.tick(250);assert.equal(g.clicks,1);assert.equal(g.surface.style.getPropertyValue('transform'),'');
 target.send('touchend',{});g.tick(500);assert.equal(g.clicks,1);
});

test('a second contact outside the surface aborts, and all phases trace a coherent terminal state',()=>{
 const g=fixture();g.win.location={hostname:'localhost',search:'?edgeTrace=1',pathname:'/index.html'};
 g.start();g.move();g.doc.send('touchstart',{touches:[{},{}]});g.end();g.tick(250);
 assert.equal(g.clicks,0);assert.deepEqual(g.surface.dataset,{});assert.equal(g.surface.style.getPropertyValue('transform'),'');
});

test('edge diagnostics require opt-in and a local development host, never a production query alone',()=>{
 assert.equal(edgeTraceEnabled({hostname:'127.0.0.1',search:'?edgeTrace=1'}),true);
 assert.equal(edgeTraceEnabled({hostname:'intake.example',search:'?edgeTrace=1'}),false);
 assert.equal(edgeTraceEnabled({hostname:'localhost',search:''}),false);
});
