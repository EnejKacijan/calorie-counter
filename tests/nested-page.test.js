import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {animateNestedPage,nestedFrames,createNestedHistory} from '../public/nested-page.js';
const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
test('nested tap geometry is short, horizontal and opaque; not a full-width route reveal',()=>{
  assert.deepEqual(nestedFrames(true),[{transform:'translateX(18px)'},{transform:'translateX(0px)'}]);
  assert.deepEqual(nestedFrames(false),[{transform:'translateX(0px)'},{transform:'translateX(24px)'}]);
  for(const frames of [nestedFrames(true),nestedFrames(false)])for(const frame of frames)assert.equal(frame.opacity,undefined);
});
test('native nested history stays on Profile; button Back unwinds exactly one entry',async()=>{
  const entries=[{intakeIndex:0},{intakeIndex:1}],listeners=new Set();let at=1,backs=0,semantic=0;
  const win={location:{href:'http://local/profile.html'},addEventListener:(k,f)=>listeners.add(f),removeEventListener:(k,f)=>listeners.delete(f),
    history:{get state(){return entries[at];},pushState(s){entries.splice(++at);entries[at]=s;},replaceState(s){entries[at]=s;},back(){backs++;at--;}}};
  const h=createNestedHistory(win,()=>semantic++);h.open();assert.equal(at,2);assert.equal(entries[2].intakeIndex,1);assert.equal(semantic,0);
  const pending=h.close();assert.equal(backs,1);listeners.forEach(f=>f());await pending;assert.equal(semantic,0);assert.deepEqual(win.history.state,{intakeIndex:1});
  h.open();win.history.back();listeners.forEach(f=>f());assert.equal(semantic,1);await h.close();assert.equal(backs,2);
  h.dispose();assert.equal(listeners.size,0);
});
test('nested disposal clears only its marker and cannot trigger route Back',()=>{
  let pop,state={intakeIndex:7,other:'keep'},backs=0;
  const win={location:{href:'profile.html'},addEventListener:(k,f)=>pop=f,removeEventListener:()=>pop=null,history:{get state(){return state;},pushState:s=>state=s,replaceState:s=>state=s,back:()=>backs++}};
  const h=createNestedHistory(win,()=>assert.fail('disposed Back'));h.open();h.dispose();assert.equal(pop,null);assert.equal(backs,0);assert.deepEqual(state,{intakeIndex:7,other:'keep'});
});
test('Profile moves the whole page over its retained committed summary and visible inert navigation',()=>{
  const s=read('profile-surface.js'),settings=read('profile-settings.js');
  assert.match(s,/history.open\(\);\s*unlock=lockSurfaceScroll/);assert.match(s,/animateNestedPage\(panel,true,win\)/);assert.doesNotMatch(s,/scroller.animate|cloneNode|Today/);
  assert.match(s,/panel.dataset.swipeBackCommitted==='true'/);assert.match(settings,/section==='plan' && !editor.closing/);
  assert.match(settings,/motionTargets:\(\)=>dataPanel/);assert.match(read('profile-settings.css'),/profile-nested-open:not\(.profile-page-open\)/);
  assert.match(read('profile-settings.css'),/\[data-edit-settings=plan\],#profilePrivacyOpen,#profileEditBack,#profileDataBack\) \{ -webkit-tap-highlight-color: transparent/);
  assert.match(read('profile-settings.css'),/:focus-visible \{ outline: 2px solid var\(--ink\)/);
});
test('sheets stay vertical; Add details require their captured browse parent',()=>{
  assert.doesNotMatch(read('app.js'),/bindSemanticBack\(elements.foodReusePanel/);
  assert.match(read('app.js'),/mobileBrowseState && section.classList.contains\('is-detailing'\)/);
  assert.match(read('app.js'),/createMotion: \(\) => addSurface.backMotion\(addBackParent\(section\)\)/);
  assert.match(read('add-surface.js'),/if \(parentKey && !parent\) return null/);
  assert.match(read('assistant.js'),/sheet \|\| panel === elements.messageActions \? \(\) => \{\} : bindSemanticBack/);
});
test('nested animation holds its initial frame, starts on fresh timeline, and cancels queued work',async()=>{
  const frames=new Map();let id=0,args,resolve,reject;
  const a={playState:'running',finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),pause(){this.playState='paused';},play(){this.playState='running';},cancel(){this.playState='idle';reject(Error('cancel'));}};
  const win={document:{timeline:{currentTime:1000}},matchMedia:()=>({matches:false}),requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:id=>frames.delete(id)};
  const panel={animate:(...v)=>{args=v;return a;}},paint=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(f=>f());};
  animateNestedPage(panel,true,win);assert.equal(args[1].duration,170);assert.equal(a.currentTime,0);paint();assert.equal(a.playState,'paused');paint();assert.equal(a.startTime,1000);
  resolve();await a.finished;await Promise.resolve();assert.equal(a.playState,'idle');assert.equal(frames.size,0);
  assert.equal(animateNestedPage(panel,false,{...win,matchMedia:()=>({matches:true})}),null);
});
