import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindScannedMealDisclosure} from '../public/scanned-meal-group.js';

function fixture({expanded=false,reduce=false}={}) {
 const writes=[],animations=[];
 const button={setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;}};
 const content={hidden:false,inert:false,scrollHeight:180,getBoundingClientRect(){return {height:this.hidden?0:180};},animate(frames,options){
  let resolve,reject;const a={frames,options,finished:new Promise((a,b)=>{resolve=a;reject=b;}),finish(){resolve();},cancel(){reject(Error('cancel'));}};animations.push(a);return a;
 }};
 bindScannedMealDisclosure({button,content,expanded,onChange:state=>writes.push(state),window:{matchMedia:()=>({matches:reduce})}});
 return {button,content,writes,animations};
}
test('scan group defaults collapsed, inert, and not focusable; initialization never persists',()=>{
 const f=fixture();assert.equal(f.button['aria-expanded'],'false');assert.equal(f.content.hidden,true);assert.equal(f.content.inert,true);assert.deepEqual(f.writes,[]);
});
test('expand/collapse updates semantics immediately and finishes at natural height',async()=>{
 const f=fixture();f.button.click();assert.equal(f.button['aria-expanded'],'true');assert.equal(f.content.hidden,false);assert.equal(f.content.inert,false);
 f.animations[0].finish();await Promise.resolve();f.button.click();assert.equal(f.content.inert,true);f.animations[1].finish();await Promise.resolve();assert.equal(f.content.hidden,true);assert.deepEqual(f.writes,[true,false]);
 assert.equal(f.animations[0].options.duration,160);
});
test('rapid alternating taps settle only the latest state',async()=>{
 const f=fixture();for(let i=0;i<7;i++)f.button.click();for(const a of f.animations)a.finish();await Promise.resolve();assert.equal(f.content.hidden,false);assert.equal(f.content.inert,false);assert.equal(f.button['aria-expanded'],'true');
 f.button.click();f.animations.at(-1).finish();await Promise.resolve();assert.equal(f.content.hidden,true);
});
test('reduced motion has immediate clear selection and no animation',()=>{
 const f=fixture({reduce:true});f.button.click();assert.equal(f.content.hidden,false);f.button.click();assert.equal(f.content.hidden,true);assert.equal(f.animations.length,0);
});
test('expanded UI state can be restored without mutating or animating diary records',()=>{
 const f=fixture({expanded:true});assert.equal(f.content.hidden,false);assert.equal(f.content.inert,false);assert.equal(f.button['aria-expanded'],'true');assert.deepEqual(f.writes,[]);assert.equal(f.animations.length,0);
});
test('group requests shared reveal only on user opening and cancels before each toggle',()=>{
 const calls=[],button={setAttribute(){},addEventListener(type,fn){this[type]=fn;}},content={scrollHeight:180,getBoundingClientRect:()=>({height:180})};
 bindScannedMealDisclosure({button,content,expanded:true,onChange:()=>{},window:{matchMedia:()=>({matches:true})},reveal:()=>calls.push('reveal'),cancelReveal:()=>calls.push('cancel')});
 assert.deepEqual(calls,[]);button.click();button.click();button.click();assert.deepEqual(calls,['cancel','cancel','reveal','cancel']);
});
test('group integration reuses separate food cards and a separate native viewer button',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(src,/children\.append\(cards\.get\(food\.id\)\)/);assert.match(src,/header\.append\(photo,button\)/);assert.match(src,/button\.setAttribute\('aria-controls',children\.id\)/);
 assert.match(src,/expandedScannedMeals\.get\(key\)\|\|false/);
});
test('photo viewer entry announces a noninteractive title, not the back action',()=>{
 const src=readFileSync(new URL('../public/food-photo-ui.js',import.meta.url),'utf8');
 assert.match(src,/data-photo-title tabindex="-1" autofocus/);assert.doesNotMatch(src,/back\.focus\(/);
 assert.match(src,/button\.setAttribute\('aria-label','View meal photo'\)/);
});
test('immediate child-editor exit cleans stale state before restoring focus, and later reset preserves it',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(src,/clearEntryTransientState\(\);\s+addSurface\.close\(section/);
 assert.match(src,/if \(!preserveFocus && document\.activeElement/);
 const reset=src.slice(src.indexOf('function resetFoodForm()'),src.indexOf('function syncFoodModeHeader()'));
 assert.match(reset,/clearEntryTransientState\(\{ preserveFocus: true \}\)/);
});
