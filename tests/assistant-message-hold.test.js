import test from 'node:test';
import assert from 'node:assert/strict';
import {bindMessageHold} from '../public/assistant-message-actions.js';

function setup() {
  const emitter = () => {
    const listeners = new Map();
    return {addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
      removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
      emit(type,detail={}){const e={target:body,pointerType:'touch',pointerId:1,isPrimary:true,button:0,clientX:100,clientY:200,preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...detail};for(const f of [...(listeners.get(type)||[])])f(e);return e;}};
  };
  const timers=new Map();let id=0,selected=false;
  const doc=emitter(),root=emitter(),win=emitter(),body={closest:s=>s==='[data-message-hold]'?body:s==='.assistant-message'?article:null};
  const article={isConnected:true,contains:e=>e===body};
  doc.getSelection=()=>({isCollapsed:!selected});root.ownerDocument=doc;root.contains=e=>e===article;
  win.document=doc;win.setTimeout=(f,ms)=>{timers.set(++id,{f,ms});return id;};win.clearTimeout=i=>timers.delete(i);win.matchMedia=()=>({matches:true});
  const opened=[],binding=bindMessageHold({root,window:win,open:(...v)=>opened.push(v)});
  const tick=()=>{for(const [id,{f,ms}]of [...timers])if(ms===480){timers.delete(id);f();}};
  return {root,doc,win,body,article,opened,binding,tick,select:v=>selected=v};
}
test('message hold waits deliberately; down does not prevent scrolling and release cannot invoke an action',()=>{
 const f=setup(),e=f.root.emit('pointerdown');assert.equal(e.prevented,undefined);assert.equal(f.opened.length,0);f.tick();assert.equal(f.opened.length,1);
 assert.deepEqual(f.opened[0],[f.article,{x:100,y:200}]);f.doc.emit('pointerup');f.tick();assert.equal(f.opened.length,1);f.binding.dispose();
});
for(const cancel of ['movement','scroll','second-pointer','multitouch','leave','cancel','blur','hidden','selection','dispose'])test('hold cancels on '+cancel,()=>{
 const f=setup();f.root.emit('pointerdown');
 if(cancel==='movement')f.doc.emit('pointermove',{clientY:220});
 if(cancel==='scroll')f.doc.emit('scroll');
 if(cancel==='second-pointer')f.doc.emit('pointerdown',{pointerId:2,isPrimary:false});
 if(cancel==='multitouch')f.doc.emit('touchstart',{touches:[{},{}]});
 if(cancel==='leave')f.root.emit('pointerout',{relatedTarget:null});
 if(cancel==='cancel')f.doc.emit('pointercancel');
 if(cancel==='blur')f.win.emit('blur');
 if(cancel==='hidden'){f.doc.hidden=true;f.doc.emit('visibilitychange');}
 if(cancel==='selection'){f.select(true);f.doc.emit('selectionchange');}
 if(cancel==='dispose')f.binding.dispose();
 f.tick();assert.equal(f.opened.length,0);f.binding.dispose();
});
test('mouse, active native selection, and interactive content do not open the custom hold menu',()=>{
 const f=setup();f.root.emit('pointerdown',{pointerType:'mouse'});f.tick();f.select(true);f.root.emit('pointerdown');f.tick();f.select(false);
 const interactive={closest:()=>interactive};f.root.emit('pointerdown',{target:interactive});f.tick();assert.equal(f.opened.length,0);f.binding.dispose();
});
test('unrelated mouse hover movement cannot cancel a held touch on hybrid WebKit',()=>{
 const f=setup();f.root.emit('pointerdown');f.root.emit('pointerout',{pointerType:'mouse',pointerId:9,relatedTarget:null});f.doc.emit('pointermove',{pointerType:'mouse',pointerId:9,clientX:0});f.tick();assert.equal(f.opened.length,1);f.binding.dispose();
});
