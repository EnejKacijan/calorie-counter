import test from 'node:test';
import assert from 'node:assert/strict';
import {swipeIntent,commitsSwipe,bindOnboardingSwipe} from '../public/onboarding-swipe.js';
import {restoreOnboardingTargets} from '../public/onboarding.js';
import {validateTargets} from '../public/target-validation.js';
import {validateSettings} from '../public/profile-settings.js';
import {presentOnboardingCompletion} from '../public/onboarding-completion.js';
const goals={calories:2350,protein:160,carbs:281,fat:65};
test('swipe direction, vertical/diagonal cancellation and intent dead zone',()=>{
 assert.equal(swipeIntent(4,2),'pending'); assert.equal(swipeIntent(100,8),'back'); assert.equal(swipeIntent(-100,8),'forward');
 for(const [x,y]of[[0,50],[60,60],[-60,60],[10,-90]])assert.equal(swipeIntent(x,y),'cancel');
});
test('questionnaire distance or recent deliberate flick; tiny quick gestures never commit',()=>{
 assert.equal(commitsSwipe(130,390,0),true); assert.equal(commitsSwipe(128,390,0),false);
 assert.equal(commitsSwipe(56,390,.65),true); assert.equal(commitsSwipe(55,390,10),false);assert.equal(commitsSwipe(60,390,.64),false);
});
test('target validation is exactly Profile validation with no new macro rule',()=>{
 const user={goalType:'maintain',weightKg:83,activityMultiplier:1.55};
 for(const g of [goals,{...goals,calories:''},{...goals,calories:1220},{...goals,calories:1150},{...goals,fat:-1},{...goals,protein:'2,5'},{calories:1200,protein:1000,carbs:0,fat:0}])assert.deepEqual(validateTargets(g),validateSettings('plan',{user,goals:g}));
});
test('only valid explicitly custom targets recover; old drafts remain recommended',()=>{
 for(const s of [undefined,{}, {goals}, {goalsAreCustom:true,goals:{...goals,calories:''}}])assert.equal(restoreOnboardingTargets(s),null);
 const source={goalsAreCustom:true,goals};const restored=restoreOnboardingTargets(source);assert.deepEqual(restored,source);assert.notEqual(restored.goals,goals);
});
test('reduced-motion completion commits exactly once without animation',async()=>{
 let commits=0;await presentOnboardingCompletion(()=>commits++,{matchMedia:()=>({matches:true}),document:{}});assert.equal(commits,1);
});
test('completion commits without waiting for fade finish; cleans skipped transition',async()=>{
 let commits=0,classes=new Set(),finish;const finished=new Promise(resolve=>finish=resolve);
 const win={matchMedia:()=>({matches:false}),document:{documentElement:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},startViewTransition:commit=>({updateCallbackDone:Promise.resolve().then(commit),finished})}};
 await presentOnboardingCompletion(()=>commits++,win);assert.equal(commits,1);assert.ok(classes.has('onboarding-completion'));finish();await Promise.resolve();assert.equal(classes.size,0);
});
test('older-engine fallback only animates after destination commit',async()=>{
 const calls=[];await presentOnboardingCompletion(()=>calls.push('commit'),{matchMedia:()=>({matches:false}),document:{querySelector:()=>({animate:(_,opts)=>{assert.equal(opts.duration,200);calls.push('fade');}})}});assert.deepEqual(calls,['commit','fade']);
});
// Exercise production event bindings, including teardown, without DOM emulation.
function harness() {
 const listeners=()=>({map:new Map(),addEventListener(k,f){this.map.set(k,f);},removeEventListener(k,f){if(this.map.get(k)===f)this.map.delete(k);},emit(k,e={}){e.type=k;this.map.get(k)?.(e);}});
 const root={...listeners(),clientWidth:390},doc={...listeners(),activeElement:null},vv={...listeners(),scale:1};let at=0,key='1',allowed=true;const calls=[];
 const win={...listeners(),document:doc,visualViewport:vv,innerWidth:390,getSelection:()=>'',getComputedStyle:()=>({overflowX:'visible'}),performance:{now:()=>at}};
 const target={closest:()=>null,parentElement:root,scrollWidth:0,clientWidth:0};
 const dispose=bindOnboardingSwipe(root,{window:win,identity:()=>key,enabled:()=>allowed,back:()=>calls.push('back'),forward:()=>calls.push('forward')});
 const event=(x,y,extra={})=>({target,touches:[{clientX:x,clientY:y,identifier:1}],cancelable:true,preventDefault(){this.prevented=true;},stopImmediatePropagation(){},...extra});
 return{root,doc,win,vv,calls,event,dispose,setKey:v=>key=v,setAllowed:v=>allowed=v,tick:()=>at+=20};
}
test('swipe binding commits one turn and suppresses its synthetic click; fresh tap remains usable',()=>{
 const h=harness();h.root.emit('touchstart',h.event(260,300));h.tick();h.root.emit('touchmove',h.event(90,302));h.root.emit('lostpointercapture');h.root.emit('touchend',h.event(90,302));h.root.emit('touchend',h.event(90,302));assert.deepEqual(h.calls,['forward']);
 const click=h.event(90,302);h.root.emit('click',click);assert.equal(click.prevented,true);
 h.root.emit('touchstart',h.event(150,300));const tap=h.event(150,300);h.root.emit('click',tap);assert.equal(tap.prevented,undefined);h.dispose();
});
for(const interruption of ['touchcancel','pointercancel','blur','visibilitychange','resize','multi','changed-step','locked'])test('unfinished swipe cancels on '+interruption,()=>{
 const h=harness();h.root.emit('touchstart',h.event(260,300));h.tick();h.root.emit('touchmove',h.event(90,302));
 if(interruption==='changed-step')h.setKey('2');else if(interruption==='locked')h.setAllowed(false);
 else if(interruption==='multi')h.doc.emit('touchstart',h.event(90,302,{touches:[{},{}]}));
 else (['blur','resize'].includes(interruption)?h.win:interruption==='visibilitychange'?h.doc:h.root).emit(interruption,h.event(90,302));
 h.root.emit('touchend',h.event(90,302));assert.deepEqual(h.calls,[]);h.dispose();
});
test('scoped gesture leaves browser edges, pinch and editing controls untouched; cleans every listener',()=>{
 for(const mode of ['left-edge','right-edge','pinch','input']){
  const h=harness();if(mode==='pinch')h.vv.scale=2;if(mode==='input')h.doc.activeElement={matches:()=>true};
  h.root.emit('touchstart',h.event(mode==='left-edge'?5:mode==='right-edge'?388:260,300));h.tick();h.root.emit('touchmove',h.event(90,302));h.root.emit('touchend',h.event(90,302));assert.deepEqual(h.calls,[]);
  h.dispose();for(const owner of[h.root,h.doc,h.win,h.vv])assert.equal(owner.map.size,0);
 }
});
