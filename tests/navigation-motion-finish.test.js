import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../public/motion.js';

function fixture(reduce=false) {
 const calls=[];
 const container={};
 const links=Array.from({length:4},(_,i)=>({parentElement:container,current:i===0,icon:{animate(frames,timing){const a={cancel(){this.cancelled=true;this.oncancel?.();}};calls.push({index:i,frames,timing,a});return a;}},querySelector(){return this.icon;},getAttribute(k){return k==='aria-current'&&this.current?'page':null;}}));
 const motion=IntakeCreateMotion({document:{visibilityState:'visible',addEventListener(){},createElement(){throw Error('Navigation must not create a marker');}},matchMedia:()=>({matches:reduce})});
 const select=i=>{links.forEach((e,n)=>e.current=n===i);motion.selection(links,'navigation');};
 return{calls,container,links,motion,select};
}
test('C2 decorates only the newly committed icon with exact study settle, no marker',()=>{
 const f=fixture();f.select(0);f.select(3);
 assert.equal(f.links[3].getAttribute('aria-current'),'page');assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].index,3);
 assert.deepEqual(f.calls[0].frames,[{transform:'scale(.96)',offset:0},{transform:'scale(1.045)',offset:.55},{transform:'scale(1)',offset:1}]);
 assert.equal(f.calls[0].timing.duration,170);
});
test('rapid C2 selection cancels stale icons; animation callbacks cannot change current state',()=>{
 const f=fixture();f.select(0);f.select(1);f.select(2);
 assert.equal(f.calls[1].index,2);
 assert.equal(f.calls[0].a.cancelled,true);assert.equal(f.links[2].current,true);
 f.calls[0].a.onfinish();assert.equal(f.links[2].current,true);
});
test('route cancellation cancels the prior icon, without removing persistent links',()=>{
 const f=fixture();f.select(0);f.select(1);f.motion.stopAll();
 assert.equal(f.calls[0].a.cancelled,true);f.select(0);
 f.motion.stopAll();assert.equal(f.calls[1].a.cancelled,true);
});
test('active-tab reselection is silent; reduced motion commits without animation',()=>{
 const f=fixture();f.select(0);f.select(0);assert.equal(f.calls.length,0);f.select(1);f.select(1);assert.equal(f.calls.length,1);
 const r=fixture(true);r.select(0);r.select(3);assert.equal(r.calls.length,0);assert.equal(r.links[3].current,true);
});
test('Add keeps its full-screen presentation ownership until unmount, while logical close is immediate',()=>{
 const source=readFileSync(new URL('../public/add-surface.js',import.meta.url),'utf8');
 const close=source.slice(source.indexOf('function close(section'),source.indexOf('const stopExit='));
 assert.match(close,/active=null;closing=session/);assert.match(close,/section\.inert=true/);
 assert.match(close,/dataset.addExiting='true'/);assert.doesNotMatch(close,/classList\.remove\('is-adding'\)/);
 assert.match(source,/marker\.replaceWith\(section\); section\.classList\.remove\('add-flow-surface','is-adding'\)/);
 assert.match(source,/presentation\.close\(/);assert.match(source,/createAddPresentation\(host,win,finishClose,\{nested:nested \|\| section.classList.contains\('is-editing'\),fullExit:nested && section\.id==='foodSection'\}\)/);
 assert.match(source,/host\.dataset\.presentation = nested \? 'nested' : 'task'/);
 assert.ok(close.indexOf('settleNestedParent(doc)')<close.indexOf('presentation.close('));
});
test('router preserves navigation children; Add ignores repeated close on an exiting presentation',()=>{
 const router=readFileSync(new URL('../public/app-router.js',import.meta.url),'utf8');
 assert.doesNotMatch(router,/nav\.replaceChildren/);assert.match(router,/selection\(nav\.querySelectorAll\('a\[href\]'\), 'navigation'\)/);
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/function closeMobileLogForm\(section\) \{\s*if \(section.dataset.addExiting === 'true'\) return/);
 assert.match(app,/\.log-panel\.is-adding:not\(\[data-add-exiting\]\)/);
});
