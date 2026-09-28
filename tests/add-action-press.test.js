import test from 'node:test';
import assert from 'node:assert/strict';
import {bindAddActionPress} from '../public/add-surface.js';

function fixture() {
  const target = () => ({listeners:new Map(),addEventListener(t,f){this.listeners.set(t,f);},removeEventListener(t,f){if(this.listeners.get(t)===f)this.listeners.delete(t);},emit(t,e={}){this.listeners.get(t)?.(e);}});
  const win=target(),doc=target(),surface=target();win.document=doc;
  const row={attrs:new Set(),setAttribute(k){this.attrs.add(k);},removeAttribute(k){this.attrs.delete(k);}};
  surface.contains=value=>value===row;
  const event={isPrimary:true,button:0,pointerId:7,clientX:40,clientY:50,target:{closest:()=>row}};
  const dispose=bindAddActionPress(surface,win);
  return {win,doc,surface,row,dispose,down:over=>surface.emit('pointerdown',{...event,...over}),has:()=>row.attrs.has('data-add-pressed')};
}
test('Add row is neutral on mount and opener pointerup/click cannot press it',()=>{
  const f=fixture();assert.equal(f.has(),false);
  f.win.emit('pointerup',{pointerId:7});f.surface.emit('click');assert.equal(f.has(),false);
  assert.equal(f.surface.listeners.has('click'),false);
});
test('only a primary actual action-row press owns feedback; native click remains independent',()=>{
  const f=fixture();
  for(const bad of [{isPrimary:false},{button:2},{target:{closest:()=>null}},{target:{closest:()=>({})}}]){f.down(bad);assert.equal(f.has(),false);}
  f.row.disabled=true;f.down();assert.equal(f.has(),false);f.row.disabled=false;
  f.surface.inert=true;f.down();assert.equal(f.has(),false);f.surface.inert=false;
  f.down();assert.equal(f.has(),true);
  f.win.emit('pointerup',{pointerId:9});assert.equal(f.has(),true);
  f.win.emit('pointerup',{pointerId:7});assert.equal(f.has(),false);
});
test('scroll intent clears feedback and cannot re-press until a new pointerdown',()=>{
  const f=fixture();f.down();
  f.win.emit('pointermove',{pointerId:7,clientX:43,clientY:54});assert.equal(f.has(),true);
  f.win.emit('pointermove',{pointerId:9,clientX:40,clientY:150});assert.equal(f.has(),true);
  f.win.emit('pointermove',{pointerId:7,clientX:40,clientY:59});assert.equal(f.has(),false);
  f.win.emit('pointermove',{pointerId:7,clientX:40,clientY:50});assert.equal(f.has(),false);
});
test('cancel, capture loss, scroll, visibility and blur all clear the owned state',()=>{
  for(const [target,type] of [['win','pointercancel'],['win','lostpointercapture'],['doc','scroll'],['doc','visibilitychange'],['win','blur']]){
    const f=fixture();f.down();assert.equal(f.has(),true);f[target].emit(type,{pointerId:7});assert.equal(f.has(),false);
  }
});
test('unmount/close disposal is idempotent and removes state and all listeners',()=>{
  const f=fixture();f.down();f.dispose();f.dispose();assert.equal(f.has(),false);
  for(const target of [f.surface,f.win,f.doc])assert.equal(target.listeners.size,0);
  f.down();assert.equal(f.has(),false);
});
