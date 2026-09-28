import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSheetGestures} from '../public/mobile-surface.js';

function events(extra={}) {
  const listeners=new Map();
  return Object.assign({listeners,addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener(k,fn){listeners.get(k)?.delete(fn);},send(k,event={}){for(const fn of listeners.get(k)||[])fn({type:k,...event});}},extra);
}
function fixture({height=600,scrollTop=0,desktop=false,press=false}={}) {
  let time=0,disabled=false,selection=null;
  const surface=events({offsetHeight:height,scrollTop:0,dataset:{},contains:target=>target?.inSheet!==false,getBoundingClientRect:()=>({left:0,right:390,top:0,bottom:844})}),scroller={scrollTop,scrollHeight:1000,clientHeight:300,contains:target=>target.inContent};
  const doc=events(),win=events({document:doc,visualViewport:{scale:1},matchMedia:()=>({matches:!desktop}),performance:{now:()=>time},getSelection:()=>selection,getComputedStyle:el=>({overflowY:el.overflowY})});
  const attrs=new Map();
  const target={inContent:true,parentElement:scroller,closest:s=>press&&s==='.tap-row'?target:null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),getAttribute:k=>attrs.get(k)??null};
  const positions=[],dismissals=[],resets=[];let starts=0;
  const release=bindSheetGestures({surface,scroller,win,pressSelector:press?'.tap-row':undefined,disabled:()=>disabled,setPosition:y=>positions.push(y),onDragStart:()=>starts++,onDismiss:y=>dismissals.push(y),onReset:y=>resets.push(y)});
  const send=(type,y,at,{x=30,to=target,count=1,id=1,cancelable=true}={})=>{
    time=at;let prevented=false;
    doc.send(type,{target:to,touches:Array.from({length:count},(_,i)=>({identifier:id+i,clientX:x,clientY:y})),cancelable,stopPropagation(){},preventDefault(){assert.equal(cancelable,true);prevented=true;}});
    return prevented;
  };
  return{surface,scroller,doc,win,target,positions,dismissals,resets,release,send,get pressed(){return attrs.has('data-sheet-pressed');},get starts(){return starts;},disable(){disabled=true;},select(){selection={rangeCount:1,isCollapsed:false};},click(detail=1){let blocked=false;doc.send('click',{target,detail,preventDefault(){blocked=true;},stopImmediatePropagation(){}});return blocked;},time:at=>time=at};
}

test('content downward touch follows the finger and dismisses one logical sheet',()=>{
  const g=fixture();g.send('touchstart',0,0);assert.equal(g.send('touchmove',5,50),false);
  assert.equal(g.send('touchmove',25,100),true);assert.deepEqual(g.positions,[25]);
  g.send('touchmove',150,500);g.send('touchend',150,550);g.send('touchend',150,560);
  assert.equal(g.starts,1);assert.deepEqual(g.dismissals,[150]);assert.equal(g.resets.length,0);
});

test('ROOK height-relative threshold, deliberate flick and stale velocity',()=>{
  for(const [height,distance,end,expected] of [[300,75,500,true],[600,80,120,true],[600,80,500,false],[600,20,120,false]]) {
    const g=fixture({height});g.send('touchstart',0,0);g.send('touchmove',distance,100);g.send('touchend',distance,end);
    assert.equal(g.dismissals.length,Number(expected));assert.equal(g.resets.length,Number(!expected));
  }
});

test('scrolled content retains native scroll ownership, then transfers at the top without a jump',()=>{
  const g=fixture({scrollTop:120});g.send('touchstart',0,0);
  assert.equal(g.send('touchmove',60,100),false);g.scroller.scrollTop=60;
  assert.equal(g.send('touchmove',120,200),false);assert.deepEqual(g.positions,[]);
  g.scroller.scrollTop=0;assert.equal(g.send('touchmove',130,250),false); // New origin, not 130px of sheet movement.
  g.send('touchmove',160,300);assert.deepEqual(g.positions,[30]);
  g.send('touchmove',285,700);g.send('touchend',285,750);assert.deepEqual(g.dismissals,[155]);
});

test('upward scrolling and reversal while still scrolled cannot dismiss',()=>{
  const g=fixture();g.send('touchstart',200,0);assert.equal(g.send('touchmove',120,100),false);
  g.scroller.scrollTop=80;g.send('touchmove',240,200);g.send('touchend',240,250);
  assert.deepEqual(g.positions,[]);assert.deepEqual(g.dismissals,[]);
});

test('header and handle can drag even when the independent content region is scrolled',()=>{
  const g=fixture({scrollTop:400}),header={closest:()=>null};
  g.send('touchstart',0,0,{to:header});g.send('touchmove',150,500);g.send('touchend',150,550);
  assert.deepEqual(g.dismissals,[150]);assert.equal(g.scroller.scrollTop,400);
});

test('nearest nested scrolling region is respected',()=>{
  const g=fixture();g.target.scrollHeight=500;g.target.clientHeight=200;g.target.overflowY='auto';g.target.scrollTop=50;
  g.send('touchstart',0,0);g.send('touchmove',150,500);g.send('touchend',150,550);assert.deepEqual(g.positions,[]);
});

test('native dialog backdrop touches cannot start dragging the sheet',()=>{
  const g=fixture();g.surface.getBoundingClientRect=()=>({left:0,right:390,top:200,bottom:844});
  g.send('touchstart',80,0,{to:g.surface});g.send('touchmove',300,500);g.send('touchend',300,550);assert.deepEqual(g.positions,[]);assert.deepEqual(g.dismissals,[]);
});

test('horizontal gesture and pinch zoom are not sheet drags',()=>{
  for(const mode of ['horizontal','zoom']) {
    const g=fixture({desktop:mode==='desktop'});
    if(mode==='zoom')g.win.visualViewport.scale=2;
    g.send('touchstart',0,0);g.send('touchmove',mode==='horizontal'?10:150,500,{x:mode==='horizontal'?180:30});g.send('touchend',150,550);
    assert.deepEqual(g.positions,[],mode);assert.deepEqual(g.dismissals,[],mode);
  }
});

test('wide touch devices use the same sheet gesture rather than a separate desktop lifecycle',()=>{
  const g=fixture({desktop:true});g.send('touchstart',0,0);g.send('touchmove',150,500);g.send('touchend',150,550);
  assert.deepEqual(g.positions,[150]);assert.deepEqual(g.dismissals,[150]);
});

test('inputs, time fields, radios, buttons and selected text use the same vertical arbiter; taps stay native',()=>{
  for(const control of ['input','time','radio','button','select','selected text']) {
    const g=fixture();g.target.closest=selector=>selector.includes('input')?{}:null;if(control==='selected text')g.select();
    assert.equal(g.send('touchstart',100,0),false,control);assert.equal(g.send('touchend',100,50),false,control);assert.equal(g.click(),false,control);
    g.send('touchstart',100,100);assert.equal(g.send('touchmove',130,250),true,control);assert.deepEqual(g.positions,[30],control);
    assert.equal(g.send('touchend',130,500),true,control);assert.equal(g.click(),true,control);assert.deepEqual(g.resets,[30],control);
    g.scroller.scrollTop=80;g.send('touchstart',150,600);assert.equal(g.send('touchmove',80,750),false,control);assert.deepEqual(g.positions,[30],control);
    assert.equal(g.send('touchend',80,800),true,control);assert.equal(g.click(),true,control);g.release();
  }
});

test('short/cancelled drag suppresses the residual pointer click but preserves keyboard and later taps',()=>{
  const g=fixture();g.send('touchstart',0,0);g.send('touchmove',20,200);g.send('touchend',20,250);
  assert.deepEqual(g.resets,[20]);assert.equal(g.click(),true);assert.equal(g.click(0),false);g.time(601);assert.equal(g.click(),false);
  const tap=fixture();tap.send('touchstart',0,0);tap.send('touchend',0,100);assert.equal(tap.click(),false);
});

test('a fresh pointer or touch immediately after a drag still activates the intended control',()=>{
  for(const kind of ['pointer','touch']) {
    const g=fixture();g.send('touchstart',0,0);g.send('touchmove',20,200);g.send('touchend',20,250);assert.equal(g.click(),true);
    if(kind==='pointer')g.doc.send('pointerdown',{target:g.target,clientX:30,clientY:20,pointerType:'mouse'});
    else {g.send('touchstart',20,260);g.send('touchend',20,280);}
    assert.equal(g.click(),false,kind);
  }
});

test('cancel, multitouch anywhere, interrupted lifecycle and changing identity reset without closing',()=>{
  for(const cause of ['cancel','multi','outside-multi','resize','blur','hidden','disabled','identity']) {
    const g=fixture();g.send('touchstart',0,0);g.send('touchmove',150,500);
    if(cause==='cancel')g.send('touchcancel',150,550);
    if(cause==='multi')g.send('touchmove',160,550,{count:2});
    if(cause==='outside-multi')g.doc.send('touchstart',{touches:[{},{}]});
    if(cause==='resize'||cause==='blur')g.win.send(cause);
    if(cause==='hidden')g.doc.send('visibilitychange');
    if(cause==='disabled'){g.disable();g.send('touchmove',160,550);}
    if(cause==='identity')g.send('touchmove',160,550,{id:2});
    g.send('touchend',160,600);assert.deepEqual(g.dismissals,[],cause);assert.deepEqual(g.resets,[150],cause);
  }
});

test('non-cancelable native scroll cannot also acquire a JS sheet transform; cleanup removes all listeners',()=>{
  const g=fixture();g.send('touchstart',0,0);assert.equal(g.send('touchmove',150,500,{cancelable:false}),false);assert.deepEqual(g.positions,[]);
  g.send('touchmove',200,550);assert.deepEqual(g.positions,[],'native owner retained for this sequence');
  g.release();g.send('touchend',150,550);assert.deepEqual(g.dismissals,[]);
  for(const owner of [g.surface,g.doc,g.win])assert.equal([...owner.listeners.values()].reduce((n,s)=>n+s.size,0),0);
});

test('touch PointerEvents never create a second finger owner',()=>{
  const g=fixture();g.doc.send('pointerdown',{target:g.target,pointerType:'touch',button:0,isPrimary:true,pointerId:1});
  g.doc.send('pointermove',{target:g.target,pointerType:'touch',pointerId:1,clientY:150});assert.deepEqual(g.positions,[]);
  g.send('touchstart',0,0);g.send('touchmove',150,500);g.send('touchend',150,550);assert.equal(g.starts,1);assert.deepEqual(g.dismissals,[150]);g.release();
});

test('upward header and exhausted content consume movement; native in-bounds content remains scrollable',()=>{
  const g=fixture(),header={closest:()=>null};g.send('touchstart',200,0,{to:header});assert.equal(g.send('touchmove',150,100),true);assert.deepEqual(g.positions,[]);g.send('touchend',150,120);
  g.scroller.scrollTop=700;g.send('touchstart',200,200);assert.equal(g.send('touchmove',150,300),true);assert.deepEqual(g.positions,[]);g.send('touchend',150,320);
  g.scroller.scrollTop=200;g.send('touchstart',200,400);assert.equal(g.send('touchmove',150,500),false);assert.deepEqual(g.positions,[]);g.release();
});

test('acquired gesture keeps its original owner across different move targets and suppresses activation until end',()=>{
  const g=fixture();g.send('touchstart',100,0);g.send('touchmove',120,100);
  assert.equal(g.click(),true);g.send('touchmove',180,300,{to:{closest:()=>({}),inContent:false}});g.send('touchmove',250,600,{to:{inSheet:false}});
  assert.deepEqual(g.positions,[20,80,150]);g.send('touchend',250,650);assert.deepEqual(g.dismissals,[150]);assert.equal(g.click(),true);
});

test('row press is a transient tap candidate: less than 7px retains feedback and permits one click',()=>{
 const g=fixture({press:true});g.send('touchstart',100,0);assert.equal(g.pressed,true);
 g.send('touchmove',106,50);assert.equal(g.pressed,true);assert.deepEqual(g.positions,[]);
 g.send('touchend',106,80);assert.equal(g.pressed,false);assert.equal(g.click(),false);g.release();
});

test('7px vertical intent clears press immediately for drag, native scroll and clamped boundaries',()=>{
 for(const [scrollTop,dy]of [[0,7],[80,-7],[700,-7]]){
  const g=fixture({press:true,scrollTop});g.target.setAttribute('aria-selected','true');g.send('touchstart',100,0);assert.equal(g.pressed,true);
  g.send('touchmove',100+dy,50);assert.equal(g.pressed,false);
  g.send('touchmove',100+dy*2,100,{to:{inContent:true,parentElement:g.scroller,closest:()=>g.target}});assert.equal(g.pressed,false,'crossed row never becomes a new press target');
  g.send('touchend',100+dy*2,150);assert.equal(g.click(),true);assert.equal(g.target.getAttribute('aria-selected'),'true');g.release();
 }
});

test('row press clears on every cancellation/lifecycle path and a fresh tap can immediately press again',()=>{
 for(const cause of ['touchend','touchcancel','pointercancel','resize','blur','visibilitychange','nested-update','close']){
  const g=fixture({press:true});g.send('touchstart',100,0);assert.equal(g.pressed,true);
  if(cause.startsWith('touch'))g.send(cause,100,50);
  else if(cause==='pointercancel')g.doc.send(cause,{pointerType:'touch'});
  else if(cause==='visibilitychange')g.doc.send(cause);
  else if(cause==='nested-update')g.release.cancel();
  else if(cause==='close')g.release();
  else g.win.send(cause);
  assert.equal(g.pressed,false,cause);
  if(cause!=='close'){g.send('touchstart',100,100);assert.equal(g.pressed,true,cause);g.send('touchend',100,120);}
  g.release();assert.equal(g.pressed,false);
 }
});

test('native scroll takeover clears press without competing with Touch ownership after pointercancel',()=>{
 const g=fixture({press:true});g.send('touchstart',100,0);g.doc.send('pointercancel',{pointerType:'touch'});assert.equal(g.pressed,false);
 g.send('touchmove',80,50,{cancelable:false});assert.equal(g.surface.dataset.sheetGesture,'scroll');g.send('touchmove',250,90);assert.deepEqual(g.positions,[]);g.send('touchend',250,100);assert.equal(g.click(),true);g.release();
});

test('disabled rows and consumers without explicit press styling never receive a transient row marker',()=>{
 for(const cause of ['disabled','aria-disabled','not-enabled']){
  const g=fixture({press:cause!=='not-enabled'});if(cause==='disabled')g.target.disabled=true;if(cause==='aria-disabled')g.target.setAttribute('aria-disabled','true');
  g.send('touchstart',100,0);assert.equal(g.pressed,false);g.release();
 }
});

test('early pointer movement cancels row press at 7px before native touch slop, without driving the sheet',()=>{
 const g=fixture({press:true});g.send('touchstart',100,0);
 g.doc.send('pointermove',{pointerType:'touch',clientX:30,clientY:106});assert.equal(g.pressed,true);
 g.doc.send('pointermove',{pointerType:'touch',clientX:30,clientY:107});assert.equal(g.pressed,false);assert.deepEqual(g.positions,[]);
 g.send('touchend',107,80);assert.equal(g.click(),true);g.release();
});
