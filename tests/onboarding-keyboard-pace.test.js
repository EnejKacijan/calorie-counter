import test from 'node:test';
import assert from 'node:assert/strict';
import {bindOnboardingViewport} from '../public/onboarding-viewport.js';
import {bindOnboardingPace} from '../public/onboarding-pace.js';
function events(){const handlers=new Map();return{handlers,addEventListener(k,f){handlers.set(k,f);},removeEventListener(k){handlers.delete(k);},emit(k,event={}){handlers.get(k)?.(event);}};}
function clock(){let id=0,now=0;const frames=new Map();return{frames,performance:{now:()=>now},requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:i=>frames.delete(i),tick(ms=16){now+=ms;const run=[...frames.values()];frames.clear();run.forEach(f=>f(now));}};}
test('viewport uses one visual coordinate space regardless of innerHeight; batches reveal, offset-only events and disposal',()=>{
 const timer=clock(),vv={...events(),height:430,offsetTop:90,scale:1},styles=new Map();let scroll=0,writes=0;
 const content={getBoundingClientRect:()=>({top:140,bottom:430,height:290}),get scrollTop(){return scroll;},set scrollTop(v){scroll=v;writes++;}};
 const field={getBoundingClientRect:()=>({top:380-scroll,bottom:480-scroll,height:100})};
 const input={matches:()=>true,closest:()=>field};
 const panel={...events(),dataset:{},contains:()=>true,querySelector:()=>content,style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)}};
 const win={...events(),...timer,visualViewport:vv,innerHeight:844,document:{activeElement:input,documentElement:{clientHeight:844}}};
 const binding=bindOnboardingViewport(panel,win);binding.reveal(input);panel.emit('focusin',{target:input});panel.emit('click',{target:input});timer.tick();
 assert.equal(writes,1);assert.equal(scroll,58);assert.equal(styles.get('--onboarding-top'),'90px');
 win.innerHeight=430;vv.emit('resize');timer.tick();assert.equal(styles.get('--onboarding-top'),'90px');assert.equal(styles.get('--onboarding-bottom'),'12px');assert.equal(writes,1);
 vv.offsetTop=35;vv.emit('scroll');timer.tick();assert.equal(styles.get('--onboarding-top'),'35px');
 vv.height=844;vv.offsetTop=0;vv.emit('resize');timer.tick();assert.equal(styles.get('--onboarding-top'),'0px');assert.match(styles.get('--onboarding-bottom'),/safe-area/);
 binding.dispose();assert.equal(styles.size,0);assert.equal(vv.handlers.size,0);assert.equal(panel.handlers.size,0);assert.equal(win.handlers.size,0);
});
function paceHarness({top=450,height=80,reduce=false}={}){
 const timer=clock();let scroll=0;
 const content={...events(),contains:()=>true,clientHeight:300,scrollHeight:700,getBoundingClientRect:()=>({top:100,bottom:400}),get scrollTop(){return scroll;},set scrollTop(v){scroll=v;}};
 const section={getBoundingClientRect:()=>({top:top-scroll,bottom:top+height-scroll,height})};
 const binding=bindOnboardingPace(content,{...timer,matchMedia:()=>({matches:reduce})});return{...timer,content,section,binding};
}
test('pace reveals once by minimum distance in 220ms without changing the section',()=>{
 const h=paceHarness();h.binding.reveal(h.section);assert.equal(h.content.scrollTop,0);h.tick();h.tick(110);assert.ok(h.content.scrollTop>0&&h.content.scrollTop<138);h.tick(110);assert.equal(h.content.scrollTop,138);
 h.content.scrollTop=0;h.binding.reveal(h.section);h.tick(250);assert.equal(h.content.scrollTop,0);
 h.binding.reset();h.binding.reveal(h.section);h.tick();h.tick(220);assert.equal(h.content.scrollTop,138);h.binding.dispose();assert.equal(h.content.handlers.size,0);
});
test('already visible pace does not move; reduced motion is immediate; short area prioritizes legend',()=>{
 const visible=paceHarness({top:200});visible.binding.reveal(visible.section);visible.tick();assert.equal(visible.content.scrollTop,0);assert.equal(visible.frames.size,0);
 const reduced=paceHarness({reduce:true});reduced.binding.reveal(reduced.section);reduced.tick();assert.equal(reduced.content.scrollTop,138);assert.equal(reduced.frames.size,0);
 const short=paceHarness({height:400,reduce:true});short.binding.reveal(short.section);short.tick();assert.equal(short.content.scrollTop,342);
});
for(const type of ['wheel','touchmove','pointerdown','keydown'])test('pace yields to '+type+' before or during movement',()=>{
 for(const started of[false,true]){const h=paceHarness();h.binding.reveal(h.section);if(started){h.tick();h.tick(70);}const position=h.content.scrollTop;h.content.emit(type);h.tick(300);assert.equal(h.content.scrollTop,position);assert.equal(h.frames.size,0);h.binding.reveal(h.section);h.tick(300);assert.equal(h.content.scrollTop,position);}
});
test('pace reset/navigation and dispose cancel pending callbacks',()=>{for(const method of['reset','dispose']){const h=paceHarness();h.binding.reveal(h.section);h.binding[method]();h.tick(300);assert.equal(h.content.scrollTop,0);}});
