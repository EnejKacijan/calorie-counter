import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chatScrollState,createAssistantScroll} from '../public/assistant-scroll.js';

function fixture() {
  let time=1000, tick=0, writes=0, measure=0;
  const frames=new Map(), nodes=[];
  const node=()=>{const listeners=new Map();const n={listeners,dataset:{},hidden:false,isConnected:true,
    addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t),
    emit(t,e={}){listeners.get(t)?.({target:n,...e});},closest:()=>null,
    focus(){doc.activeElement=n;},getBoundingClientRect:()=>({top:0,bottom:400})};nodes.push(n);return n;};
  const doc={activeElement:null},region=node(),messages=node(),pending=node(),jump=node();jump.ownerDocument=doc;
  Object.assign(region,{scrollHeight:6000,clientHeight:400});let value=0;
  Object.defineProperty(region,'scrollTop',{get:()=>value,set:v=>{writes++;value=Math.max(0,Math.min(v,region.scrollHeight-region.clientHeight));}});
  let growth=0;
  messages.children=Array.from({length:120},(_,i)=>({...node(),get offsetTop(){measure++;return i*50+growth;},offsetHeight:50,
    getBoundingClientRect:()=>({top:i*50+growth-region.scrollTop+4,bottom:i*50+growth+54-region.scrollTop})}));
  let observer;class RO{constructor(fn){this.fn=fn;this.nodes=[];observer=this;}observe(n){this.nodes.push(n);}disconnect(){this.nodes=[];}}
  const api=createAssistantScroll({region,messages,pending,jump,window:{performance:{now:()=>time}},
    requestAnimationFrame:fn=>{frames.set(++tick,fn);return tick;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:RO});
  const flush=()=>{const fs=[...frames.values()];frames.clear();fs.forEach(f=>f());};
  const move=(top,intent=true)=>{if(intent)region.emit('wheel',{deltaY:top<value?-100:100});region.scrollTop=top;region.emit('scroll');flush();};
  return{api,region,messages,pending,jump,doc,frames,flush,move,observer,nodes,
    advance:()=>time+=1000,get writes(){return writes;},get measures(){return measure;},
    reflow(n){growth+=n;region.scrollHeight+=n;observer.fn();}};
}

test('follow state uses explicit intent; geometry alone never resumes reading',()=>{
 let s={following:true,jump:false};s=chatScrollState(s,'up',20);assert.deepEqual(s,{following:false,jump:false});
 s=chatScrollState(s,'geometry',200);assert.deepEqual(s,{following:false,jump:true});
 s=chatScrollState(s,'geometry',100);assert.equal(s.jump,true);
 s=chatScrollState(s,'geometry',60);assert.deepEqual(s,{following:false,jump:false});
 s=chatScrollState(s,'down',80);assert.equal(s.following,true);
 assert.equal(chatScrollState({following:false,jump:true},'latest',5000).following,true);
});
test('restore zero/middle reading positions; latest uses one immediate bounded write',()=>{
 for(const top of [0,125]){const f=fixture();f.api.restore({top,following:false});f.flush();assert.equal(f.region.scrollTop,top);assert.equal(f.region.dataset.chatFollow,'history');f.api.latest();f.flush();assert.equal(f.region.scrollTop,5600);assert.equal(f.region.dataset.chatFollow,'latest');assert.equal(f.jump.hidden,true);}
});
test('programmatic scroll events and response/viewport growth do not disable follow',()=>{
 const f=fixture();f.api.latest();f.flush();f.region.emit('scroll');f.flush();assert.equal(f.region.dataset.chatFollow,'latest');
 f.region.scrollHeight+=1000;f.observer.fn();f.flush();assert.equal(f.region.scrollTop,6600);
 f.region.clientHeight=220;f.observer.fn();f.flush();assert.equal(f.region.scrollTop,6780);
});
test('upward input immediately wins over an already queued response-follow frame',()=>{
 const f=fixture();f.api.latest();f.flush();f.region.emit('scroll');f.reflow(300);f.move(4000);f.flush();
 assert.equal(f.region.scrollTop,4000);assert.equal(f.region.dataset.chatFollow,'history');assert.equal(f.jump.hidden,false);
 f.reflow(400);f.flush();assert.equal(f.region.scrollTop,4400,'visible message anchor follows earlier reflow, not latest');
});
test('first touch after Send/Jump does not restore a stale pre-send reading anchor before native scroll',()=>{
 const f=fixture();f.api.restore({top:1000,following:false});f.flush();f.api.latest();f.flush();assert.equal(f.region.scrollTop,5600);
 f.region.emit('touchstart',{touches:[{clientX:80,clientY:100}]});f.region.emit('touchmove',{touches:[{clientX:80,clientY:120}]});f.flush();
 assert.equal(f.region.scrollTop,5600);assert.equal(f.region.dataset.chatFollow,'history');
 f.move(5500);assert.equal(f.region.scrollTop,5500);
});
test('manual movement while pending, subsequent reflow and keyboard-only resizing preserve reading',()=>{
 const f=fixture();f.api.restore({top:200,following:false});f.flush();f.region.clientHeight=200;f.observer.fn();f.flush();assert.equal(f.region.scrollTop,200);
 f.region.scrollHeight+=1500;f.observer.fn();f.flush();assert.equal(f.region.scrollTop,200);
 f.region.clientHeight=400;f.observer.fn();f.flush();assert.equal(f.region.scrollTop,200);
});
test('native/assistive scroll fallback respects direction, manual near-bottom resumes',()=>{
 const f=fixture();f.api.latest();f.flush();f.region.emit('scroll');f.advance();f.move(4000,false);assert.equal(f.region.dataset.chatFollow,'history');f.move(5530);assert.equal(f.region.scrollTop,5600);assert.equal(f.region.dataset.chatFollow,'latest');
});
test('touch/keyboard intent pauses following without intercepting native scroll or editing keys',()=>{
 const f=fixture();f.api.latest();f.flush();f.region.emit('touchstart',{touches:[{clientX:80,clientY:100}]});f.region.emit('touchmove',{touches:[{clientX:80,clientY:140}]});f.flush();assert.equal(f.region.dataset.chatFollow,'history');
 f.api.latest();f.flush();f.region.emit('keydown',{key:'PageUp',target:{closest:()=>true}});f.flush();assert.equal(f.region.dataset.chatFollow,'latest');
 f.region.emit('keydown',{key:'PageUp'});f.flush();assert.equal(f.region.dataset.chatFollow,'history');
});
test('jump has no focus steal for pointer activation and restores meaningful keyboard focus',()=>{
 const f=fixture();f.api.restore({top:200,following:false});f.flush();let prevented=false;
 f.jump.emit('pointerdown',{pointerType:'touch',isPrimary:true,button:0,preventDefault:()=>prevented=true});assert.equal(prevented,false);
 f.jump.emit('pointerdown',{pointerType:'mouse',isPrimary:true,button:0,preventDefault:()=>prevented=true});assert.equal(prevented,true);
 f.jump.emit('click');f.flush();assert.equal(f.doc.activeElement,null);assert.equal(f.region.scrollTop,5600);
 f.doc.activeElement=f.jump;f.jump.emit('click',{detail:1});f.flush();assert.notEqual(f.doc.activeElement,f.region);
 f.jump.emit('click',{detail:0});f.flush();assert.equal(f.doc.activeElement,f.region);
});
test('coalesced growth avoids repeated writes/list measurement; 120 messages need logarithmic anchor lookup',()=>{
 const f=fixture();f.api.latest();for(let i=0;i<100;i++)f.api.changed();assert.equal(f.frames.size,1);f.flush();assert.equal(f.writes,1);
 for(let i=0;i<100;i++)f.observer.fn();f.flush();assert.equal(f.writes,1);assert.equal(f.measures,0);
 f.move(2500);assert.ok(f.measures<=9);const before=f.measures;f.reflow(100);f.flush();assert.ok(f.measures-before<=1);
});

test('Jump press/cancel changes only transient presentation and never scroll intent',()=>{
 const f=fixture();f.api.restore({top:200,following:false});f.flush();
 for(const release of ['pointerup','pointercancel','lostpointercapture']){
  f.jump.emit('pointerdown',{pointerType:'touch',isPrimary:true});assert.equal(f.jump.dataset.jumpPressed,'true');
  f.jump.emit(release);assert.equal(f.jump.dataset.jumpPressed,undefined);
  assert.equal(f.region.scrollTop,200);assert.equal(f.region.dataset.chatFollow,'history');assert.equal(f.jump.hidden,false);
 }
 f.jump.emit('pointerdown',{pointerType:'touch',isPrimary:true});f.jump.emit('click');f.flush();
 assert.equal(f.jump.dataset.jumpPressed,undefined);assert.equal(f.region.dataset.chatFollow,'latest');
});
test('tab snapshot/restoration retains layout anchor, independent of transient message reveal transforms',()=>{
 const a=fixture();a.api.restore({top:1225,following:false});a.flush();const saved=a.api.snapshot();
 const b=fixture();b.reflow(100);b.api.restore(saved);b.flush();assert.equal(b.region.scrollTop,1325);assert.equal(b.region.dataset.chatFollow,'history');
});
test('a transformed message list becoming the offset parent retains its padding contribution',()=>{
 const f=fixture();f.api.restore({top:1225,following:false});f.flush();const saved=f.api.snapshot();
 for(const n of f.messages.children){const old=n.offsetTop;Object.defineProperty(n,'offsetTop',{get:()=>old-8});n.offsetParent={offsetTop:8,offsetParent:f.region};}
 f.api.restore(saved);f.flush();assert.equal(f.region.scrollTop,1225);
});
test('presentation snapshot contains no message content and maps correctly after prefix trimming',()=>{
 const f=fixture();f.api.restore({top:4500,following:false});f.flush();const saved=f.api.snapshot();
 assert.deepEqual(saved.anchor,{fromEnd:30,offset:0});
 f.messages.children=f.messages.children.slice(-40);for(const n of f.messages.children){const old=n.offsetTop;Object.defineProperty(n,'offsetTop',{get:()=>old-4000});}
 f.api.restore(saved);f.flush();assert.equal(f.region.scrollTop,500);
});
test('dispose cancels RAF, disconnects all observed geometry and removes scoped listeners',()=>{
 const f=fixture();assert.equal(f.observer.nodes.length,3);f.api.changed();f.api.dispose();assert.equal(f.frames.size,0);assert.equal(f.observer.nodes.length,0);assert.ok(f.nodes.every(n=>!n.listeners.size));f.api.changed();assert.equal(f.frames.size,0);
});

test('message overlay holds the visible anchor without changing follow intent; release is idempotent',()=>{
 const f=fixture();f.api.restore({top:200,following:false});f.flush();const release=f.api.hold();
 f.reflow(100);f.flush();assert.equal(f.region.scrollTop,300);assert.equal(f.region.dataset.chatFollow,'history');
 release();release();f.flush();assert.equal(f.region.scrollTop,300);assert.equal(f.region.dataset.chatFollow,'history');
 f.api.latest();f.flush();const stop=f.api.hold(),before=f.region.scrollTop;f.region.scrollHeight+=1000;f.observer.fn();f.flush();
 assert.equal(f.region.scrollTop,before);assert.equal(f.region.dataset.chatFollow,'latest');stop();f.flush();assert.equal(f.region.scrollTop,before+1000);
});
test('empty Assistant starts at the heading, permits native starter scrolling and never shows Jump',()=>{
 const f=fixture();f.messages.children=[];f.api.restore();f.flush();assert.equal(f.region.scrollTop,0);assert.equal(f.jump.hidden,true);
 f.move(200);assert.equal(f.region.scrollTop,200);assert.equal(f.jump.hidden,true);
 f.region.clientHeight=200;f.observer.fn();f.flush();assert.equal(f.region.scrollTop,200);
 f.api.latest();f.flush();assert.equal(f.region.scrollTop,0);
});

test('the temporary Jump face becomes inert immediately on exit and reactivates on renewed reading',()=>{
 const f=fixture();f.api.restore();f.flush();assert.equal(f.jump.inert,true);
 f.move(200);assert.equal(f.jump.hidden,false);assert.equal(f.jump.inert,false);
 f.api.latest();f.flush();assert.equal(f.jump.hidden,true);assert.equal(f.jump.inert,true);
 f.move(400);assert.equal(f.jump.hidden,false);assert.equal(f.jump.inert,false);
});

test('one centered composer-relative Jump target has an independent 40px face and accessible name',()=>{
 const html=readFileSync(new URL('../public/assistant.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/assistant-usability.css',import.meta.url),'utf8');
 assert.equal((html.match(/id="assistantJumpLatest"/g)||[]).length,1);
 assert.match(html, /class="assistant-chat-footer">\s*<button[^>]*id="assistantJumpLatest"[^>]*aria-label="Jump to latest"[^>]*hidden inert/);
 assert.ok(html.indexOf('id="assistantJumpLatest"')<html.indexOf('id="assistantContextBar"'));
 assert.match(css, /#assistantJumpLatest \{[^}]*position: absolute; bottom: calc\(100% \+ 10px\); left: 50%/);
 assert.match(css, /#assistantJumpLatest \{[^}]*width: 44px;[^}]*height: 44px/);
 assert.match(css, /\.assistant-jump-face \{[^}]*width: 40px; height: 40px/);
 assert.match(css, /opacity 150ms ease-out, scale 150ms ease-out/);
 assert.match(css, /#assistantJumpLatest\[hidden\] \.assistant-jump-face \{[^}]*transition-duration: 120ms/);
 assert.match(css, /@starting-style/);
 assert.match(css, /prefers-reduced-motion:reduce\) \{\s*body[^}]*#assistantJumpLatest[^}]*transition: none !important/);
 assert.doesNotMatch(css, /mask-image:|\.assistant-jump[^}]*backdrop-filter:/);
 assert.match(css, /#assistantJumpLatest\[data-jump-pressed\] \.assistant-jump-face \{ scale: 1\.09;/);
 assert.match(css, /#assistantJumpLatest \.assistant-jump-face \{ scale: 1 !important; \}\s*\}/);
 assert.doesNotMatch(css, /#assistantJumpLatest:active[^}]*background:/);
});
test('Send/Retry/starters share explicit follow, viewport does not own a second scroll, and no fake streaming',()=>{
 const source=readFileSync(new URL('../public/assistant.js',import.meta.url),'utf8');
 const send=source.slice(source.indexOf('async function sendMessage'),source.indexOf('function buildAppContext'));
 assert.ok(send.indexOf('saveConversation()')<send.indexOf('chatScroll.latest()'));
 assert.ok(send.indexOf('chatScroll.latest()')<send.indexOf('await fetch'));
 assert.doesNotMatch(source,/conversationRegion.scrollTop\s*=|region.scrollTop\s*=|getReader\(|setInterval\(.*token/);
 assert.match(source,/const data = await response.json/);
});
