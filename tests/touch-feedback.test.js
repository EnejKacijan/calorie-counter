import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {mountTouchFeedback} from '../public/touch-feedback.js';
import {cssRules,fineGate,partitionHover} from '../scripts/css-interaction-audit.mjs';
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
const css=readdirSync(new URL('../public/',import.meta.url)).filter(f=>f.endsWith('.css'));
test('all production hover branches require real fine-pointer hover capability',()=>{
 const hover=css.flatMap(f=>cssRules(read(f)).filter(r=>r.selector.includes(':hover')).map(r=>({f,...r})));
 assert.ok(hover.length>0,'audit the remaining shared hover rules, not a historical desktop rule count');
 for(const r of hover){assert.ok(fineGate(r.parents),r.f+':'+r.line);assert.equal(partitionHover(r.selector).other.length,0,'focus/selection must not be gated with hover');}
});
test('every native active style respects the actual owned touch target',()=>{
 for(const f of css)for(const r of cssRules(read(f)).filter(r=>r.selector.includes(':active'))){
  assert.ok(!r.selector.replaceAll(':active:where(:not([data-intake-touch] *),[data-touch-pressed])','').includes(':active'),f+':'+r.line);
 }
});
test('shared policy never removes keyboard outlines or semantic selected styles',()=>{
 const s=read('touch-feedback.css').replace(/\/\*[\s\S]*?\*\//g,'');assert.doesNotMatch(s,/is-active|aria-selected|aria-expanded|background\s*:/);
 const focus=cssRules(s).find(r=>r.body.includes('outline: none'));
 assert.ok(focus.selector.startsWith('html[data-intake-touch] '));assert.ok(focus.selector.includes(':not([aria-invalid=true])'));
 for(const file of ['today-diary.css','food-photos.css','bottom-navigation.css'])assert.match(read(file),/:focus-visible/);
 assert.match(read('food-photos.css'),/\[aria-expanded=true\]/);assert.match(read('bottom-navigation.css'),/aria-current/);
 for(const name of ['index','assistant','progress','profile'])assert.ok(read(name+'.html').includes('touch-feedback.css?v=2'));
 assert.match(read('sw.js'),/"\/touch-feedback.js"/);
});
test('selector audit splits nested selector commas and preserves independent focus',()=>{
 assert.deepEqual(partitionHover('body :is(.a,.b):is(:hover, :focus-visible), .selected'),{hover:['body :is(.a,.b):hover'],other:['body :is(.a,.b):focus-visible','.selected']});
});
function fixture(){
 const attrs=()=>({values:new Map(),setAttribute(k,v){this.values.set(k,v);},removeAttribute(k){this.values.delete(k);},getAttribute(k){return this.values.get(k)??null;}});
 class Emitter{listeners=new Map();addEventListener(k,f){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(f);}removeEventListener(k,f){this.listeners.get(k)?.delete(f);}dispatchEvent(e){for(const fn of this.listeners.get(e.type)||[])fn(e);}emit(type,over={}){this.dispatchEvent({type,...over});}}
 const win=new Emitter(),doc=new Emitter(),root=attrs();win.document=doc;doc.documentElement=root;doc.body={};doc.querySelector=()=>null;win.Event=class{constructor(type){this.type=type;}};
 let mutate,disconnected=false;win.MutationObserver=class{constructor(fn){mutate=fn;}observe(){}disconnect(){disconnected=true;}};
 const control={...attrs(),isConnected:true,disabled:false,closest:()=>null};const dispose=mountTouchFeedback(win);
 const down=(over={})=>doc.emit('pointerdown',{pointerId:4,pointerType:'touch',button:0,isPrimary:true,clientX:50,clientY:70,target:{closest:()=>control},...over});
 const pressed=()=>control.values.has('data-touch-pressed');return{win,doc,root,control,dispose,down,pressed,mutate:records=>mutate(records),disconnected:()=>disconnected};
}
test('mount/opening release/newly mounted control cannot inherit a touch press',()=>{
 const f=fixture();assert.equal(f.pressed(),false);f.win.emit('pointerup',{pointerId:4});assert.equal(f.pressed(),false);
 f.down();assert.ok(f.pressed());f.control.isConnected=false;f.mutate([{type:'childList'}]);assert.equal(f.pressed(),false);f.win.emit('pointerup',{pointerId:4});assert.equal(f.pressed(),false);
});
test('only enabled primary touch/pen controls own feedback; mouse remains native',()=>{
 for(const bad of [{button:2},{isPrimary:false},{pointerType:'mouse'},{target:{closest:()=>null}}]){const f=fixture();f.down(bad);assert.equal(f.pressed(),false);}
 const f=fixture();f.control.disabled=true;f.down();assert.equal(f.pressed(),false);f.control.disabled=false;f.control.setAttribute('aria-disabled','true');f.down();assert.equal(f.pressed(),false);f.control.removeAttribute('aria-disabled');f.down({pointerType:'pen'});assert.ok(f.pressed());
});
test('release outside, cancel, capture loss, scroll, route, visibility and blur clear immediately',()=>{
 for(const [target,type]of [['win','pointerup'],['win','pointercancel'],['win','lostpointercapture'],['doc','touchcancel'],['doc','scroll'],['doc','wheel'],['doc','click'],['win','popstate'],['win','pagehide'],['doc','visibilitychange'],['win','blur']]){
  const f=fixture();f.down();f[target].emit(type,{pointerId:4});assert.equal(f.pressed(),false,type);
 }
});
test('press cancellation has the existing 8px feedback slop, never captures or activates',()=>{
 const f=fixture();f.down();f.win.emit('pointermove',{pointerId:4,pointerType:'touch',clientX:53,clientY:73});assert.ok(f.pressed());f.win.emit('pointermove',{pointerId:4,pointerType:'touch',clientX:50,clientY:79});assert.equal(f.pressed(),false);f.win.emit('pointermove',{pointerId:4,pointerType:'touch',clientX:50,clientY:70});assert.equal(f.pressed(),false);
 assert.doesNotMatch(read('touch-feedback.js').replace(/\/\/[^\n]*/g,''),/setPointerCapture|\.click\(|\.focus\(|\.blur\(|setTimeout/);
});
test('a held touch cannot click its replacement, but fresh taps and keyboard clicks remain immediate',()=>{
 for(const pointerType of ['touch','pen',undefined]){
  const f=fixture();f.down();f.control.isConnected=false;f.mutate([{type:'childList'}]);f.win.emit('pointerup',{pointerId:4,clientX:50,clientY:70});
  let blocked=0,stopped=0;const click={pointerType,detail:1,clientX:50,clientY:70,target:{closest:()=>({})},preventDefault:()=>blocked++,stopImmediatePropagation:()=>stopped++};
  f.doc.emit('click',click);assert.equal(blocked,1);assert.equal(stopped,1);f.doc.emit('click',click);assert.equal(blocked,1,'consumed only the orphan release');
  f.down();f.win.emit('pointerup',{pointerId:4});f.doc.emit('keydown',{key:'Enter'});f.doc.emit('click',{...click,detail:0});assert.equal(blocked,1,'keyboard unaffected');
  f.down();f.control.isConnected=true;f.win.emit('pointerup',{pointerId:4});f.doc.emit('click',{...click,target:{closest:()=>f.control}});assert.equal(blocked,1,'fresh original-owner tap is immediate');
 }
});
test('modal/sheet open, inert parent and replacement DOM terminate ownership',()=>{
 for(const record of [{type:'childList'},{type:'attributes',attributeName:'open',target:{hasAttribute:()=>true}},{type:'attributes',attributeName:'hidden',target:{hidden:false}}]){const f=fixture();f.down();f.mutate([record]);assert.equal(f.pressed(),false);}
 const f=fixture();f.down();f.mutate([{type:'attributes',attributeName:'aria-expanded'}]);assert.ok(f.pressed(),'semantic state is not a new interaction owner');
 f.control.closest=()=>({inert:true});f.mutate([{type:'attributes',attributeName:'inert'}]);assert.equal(f.pressed(),false);
});
test('reasserting inert on unrelated swipe-action buttons does not erase the actual row press',()=>{
 const f=fixture();f.down();f.mutate([{type:'attributes',attributeName:'inert',target:{inert:true}}]);assert.ok(f.pressed());f.win.emit('pointerup',{pointerId:4});assert.equal(f.pressed(),false);
});
test('hybrid touch suppresses ghost hover until actual mouse/keyboard input, without moving focus',()=>{
 const f=fixture();f.down();assert.ok(f.root.values.has('data-intake-touch'));f.win.emit('pointerup',{pointerId:4});assert.ok(f.root.values.has('data-intake-touch'));f.win.emit('pointermove',{pointerType:'mouse',sourceCapabilities:{firesTouchEvents:true}});assert.ok(f.root.values.has('data-intake-touch'));f.win.emit('pointermove',{pointerType:'mouse'});assert.equal(f.root.values.has('data-intake-touch'),false);f.down();f.doc.emit('keydown',{key:'Tab'});assert.equal(f.pressed(),false);assert.equal(f.root.values.has('data-intake-touch'),false);
});

test('a touch-only edge event preserves touch modality through programmatic restored focus',()=>{
 const f=fixture();f.doc.emit('touchstart');assert.ok(f.root.values.has('data-intake-touch'));f.win.emit('pointerup');f.doc.emit('focusin');assert.ok(f.root.values.has('data-intake-touch'));assert.equal(f.pressed(),false);
 f.doc.emit('keydown',{key:'Tab'});assert.equal(f.root.values.has('data-intake-touch'),false);f.dispose();
});

test('text editing keys and IME do not relabel a touch-focused field as keyboard navigation',()=>{
 const target={matches:()=>true};
 for(const key of ['a','1',' ','Backspace','Delete','Enter','Process','Unidentified']){
  const f=fixture();f.down();f.doc.emit('keydown',{key,target});assert.ok(f.root.values.has('data-intake-touch'),key);assert.equal(f.pressed(),false,'press still clears');
 }
 for(const event of [{key:'Dead',isComposing:true},{key:'',keyCode:229}]){const f=fixture();f.down();f.doc.emit('keydown',{...event,target});assert.ok(f.root.values.has('data-intake-touch'));}
});

test('Tab, navigation, shortcuts and non-editing controls keep real keyboard focus available',()=>{
 for(const event of [{key:'Tab'},{key:'ArrowRight'},{key:'Home'},{key:'Escape'},{key:'a',ctrlKey:true},{key:'a',metaKey:true},{key:'a',altKey:true},{key:'Enter',target:{matches:()=>false}},{key:'a',target:{matches:()=>true,readOnly:true}}]){
  const f=fixture();f.down();f.doc.emit('keydown',{target:{matches:()=>true},...event});assert.equal(f.root.values.has('data-intake-touch'),false,JSON.stringify(event));
 }
 // Typing without a preceding touch must not manufacture touch modality.
 const f=fixture();f.doc.emit('keydown',{key:'a',target:{matches:()=>true}});assert.equal(f.root.values.has('data-intake-touch'),false);
});
test('legacy press adapters share termination, and disposal removes every listener',()=>{
 const f=fixture();let reset=0;const listener=()=>reset++;f.doc.addEventListener('intake:press-reset',listener);f.down();f.dispose();f.dispose();assert.ok(reset>=2);f.doc.removeEventListener('intake:press-reset',listener);assert.equal(f.pressed(),false);assert.ok(f.disconnected());assert.ok([...f.doc.listeners.values(),...f.win.listeners.values()].every(set=>set.size===0));
 for(const file of ['app.js','add-surface.js','bottom-navigation.js','mobile-surface.js'])assert.ok(read(file).includes('intake:press-reset'),file);
});
