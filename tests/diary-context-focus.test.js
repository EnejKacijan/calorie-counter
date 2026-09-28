import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiaryContextFocus} from '../public/diary-context-focus.js';
function fixture(){
 const listeners=new Map();let trigger;
 const makeTarget=()=>({isConnected:true,attrs:new Set(),calls:[],visible:true,contains(e){return e===this;},closest(){return null;},matches(){return this.visible;},
  setAttribute(k){this.attrs.add(k);},removeAttribute(k){this.attrs.delete(k);},focus(options){this.calls.push(options);}});
 trigger=makeTarget();const button={},panel={contains:e=>e===button},root={isConnected:true,contains:e=>e===trigger,
  addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{assert.equal(listeners.get(name),fn);listeners.delete(name);}};
 const focus=createDiaryContextFocus({root,panel,getTrigger:()=>trigger});
 const emit=(type,more={})=>{const e={target:button,isTrusted:true,eventPhase:1,...more};listeners.get(type)?.(e);return e;};
 const touch=()=>{emit('pointerdown',{pointerType:'touch'});emit('touchstart',{touches:[{}]});return emit('click',{detail:1});};
 return {focus,emit,touch,root,listeners,button,get trigger(){return trigger;},replace(){trigger.isConnected=false;return trigger=makeTarget();}};
}
test('verified touch return keeps logical focus and neutralizes inherited native focus-visible without blur',()=>{
 const f=fixture();f.touch();const token=f.focus.capture();assert.equal(token.touch,true);f.focus.restore(token);
 assert.equal(f.trigger.attrs.has('data-diary-touch-restored'),true);assert.deepEqual(f.trigger.calls,[{preventScroll:true}]);
});
test('keyboard input while closing invalidates the touch exception and subsequent keyboard input clears it',()=>{
 const f=fixture();f.touch();const token=f.focus.capture();f.emit('keydown',{key:'Tab'});f.focus.restore(token);assert.equal(f.trigger.attrs.size,0);
 f.touch();f.focus.restore(f.focus.capture());assert.equal(f.trigger.attrs.size,1);f.emit('keydown',{key:'ArrowRight',target:f.trigger});assert.equal(f.trigger.attrs.size,0);
});
test('unknown, synthetic, AT-style and mouse activation never imply ordinary touch',()=>{
 for(const click of [{isTrusted:false,detail:1},{isTrusted:true,detail:0}]){
  const f=fixture();f.touch();f.emit('click',click);assert.equal(f.focus.capture().touch,false);f.focus.restore(f.focus.capture());assert.equal(f.trigger.attrs.size,0);
 }
 const f=fixture();f.emit('pointerdown',{pointerType:'mouse'});f.emit('click',{detail:1});assert.equal(f.focus.capture().touch,false);
});
test('a completed touch event is not authority for a later programmatic close',()=>{
 const f=fixture(),event=f.touch();event.eventPhase=0;assert.equal(f.focus.capture().touch,false);
 f.focus.restore(f.focus.capture());assert.equal(f.trigger.attrs.size,0);
});
test('drag uses this sheet gesture’s trusted start, not touch capability or a prior trigger tap',()=>{
 const f=fixture();f.touch();f.focus.begin();assert.equal(f.focus.capture({dragDistance:100}).touch,true,'current click remains live until dispatch ends');
 // Outside the opener click: only a new trusted sheet touch can authorize drag return.
 const event=f.emit('click',{isTrusted:false,detail:0});event.eventPhase=0;
 assert.equal(f.focus.capture({dragDistance:100}).touch,false);
 f.emit('touchstart',{touches:[{}]});assert.equal(f.focus.capture({dragDistance:100}).touch,true);
 f.emit('touchcancel');assert.equal(f.focus.capture({dragDistance:100}).touch,false);
 f.emit('touchstart',{isTrusted:false,touches:[{}]});assert.equal(f.focus.capture({dragDistance:100}).touch,false);
});
test('native neutral focus needs no marker, and blur clears the temporary marker',()=>{
 const f=fixture();f.trigger.visible=false;f.touch();f.focus.restore(f.focus.capture());assert.equal(f.trigger.attrs.size,0);
 f.trigger.visible=true;f.touch();f.focus.restore(f.focus.capture());f.emit('focusout',{target:f.trigger});assert.equal(f.trigger.attrs.size,0);
});
test('logical replacement receives focus; detached routes and disposed owners cannot steal it',()=>{
 const f=fixture();f.touch();const token=f.focus.capture(),replacement=f.replace();f.focus.restore(token);assert.equal(replacement.calls.length,1);
 f.root.isConnected=false;f.focus.restore(token);assert.equal(replacement.calls.length,1);
 f.root.isConnected=true;f.focus.dispose();assert.equal(f.listeners.size,0);f.focus.restore(token);assert.equal(replacement.calls.length,1);assert.equal(replacement.attrs.size,0);
});
