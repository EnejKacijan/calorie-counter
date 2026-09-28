import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,settle,out,fixture,open,close,instrument,drag,rows} from './edge-row-harness.mjs';
await mkdir(out,{recursive:true});const results=[],phase=process.env.EDGE_PHASE||'matrix';
const engines=process.env.EDGE_ENGINE?.split(',')||['chromium','webkit'];
function verify(data,{width,kind,commit,before}){
 const moving=f=>kind==='child'?f.stage:f.host;
 assert.equal(data.events.filter(e=>e.type==='back').length,Number(commit),'exactly one semantic Back after release');
 for(const f of data.frames){
  const r=moving(f);if(r){assert.ok(Number.isFinite(r.x)&&r.x>=-.5&&r.x<=width+.5,'clamped translation');assert.ok(Math.abs(r.width-width)<.5);}
  if(f.contact){assert.ok(f.host,'no route removal mid-contact');assert.equal(f.section,before.section);}
  if(f.active&&f.host){assert.ok(Math.abs(f.parent.y-before.parent.y)<.6,'stationary Today');assert.equal(f.expanded,before.expanded);assert.equal(f.ring,before.ring);assert.ok(Math.abs(f.footer.y-before.footer.y)<.6,'stationary footer');if(kind==='child')assert.ok(f.preview.some(a=>!a.hidden),'prepared browse parent');}
 }
 assert.ok(data.events.filter(e=>e.type==='back').every(e=>!e.contact),'Back cannot run with contact active');
 assert.equal(data.final.active,undefined,'gesture cleaned up');
 if(commit&&kind!=='child')assert.equal(data.final.host,undefined);
 if(!commit)assert.ok(Math.abs(moving(data.final).x)<.5);
}
async function checkRows(p,width){
 const items=await rows(p);assert.equal(items.length,5);
 for(const row of items){
  assert.ok(row.kcalRect.right<=row.toggle.left-7.5,'independent kcal/action areas');
  assert.ok(row.nameRect.right<=row.kcalRect.left-10,'name does not overlap kcal');
  assert.ok(row.toggle.width>=44&&row.toggle.height>=44);assert.ok(row.toggle.right<=width);
  assert.ok(Math.abs(row.textRect.right-items[0].textRect.right)<.6,'one text right boundary');
  assert.ok(Math.abs(row.toggle.x-items[0].toggle.x)<.6,'one overflow column');
  assert.equal(row.kcalStyle.fontVariantNumeric,'tabular-nums');assert.equal(row.kcalStyle.textAlign,'right');
  if(row.name.startsWith('Very'))assert.ok(row.nameRect.height>Number.parseFloat(row.kcalStyle.lineHeight)*1.3,'long names wrap');
 }
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);return items;
}
for(const engine of engines){
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 const configs=phase==='matrix'?[[375,667],[390,844],[393,852],[430,932],[320,844]].flatMap(([width,height])=>['light','dark'].flatMap(theme=>[false,true].map(reduce=>({width,height,theme,reduce})))):[{width:390,height:844,theme:'dark',reduce:false}];
 try{for(const config of configs){
  const {width,height,theme,reduce}=config,tag=`${engine}-${width}-${theme}-${reduce?'reduce':'motion'}`;
  if(process.env.EDGE_CONFIG&&tag!==process.env.EDGE_CONFIG)continue;
  const {p,c}=await setup(b,{engine,...config,beforeOpen:async({c})=>{await c.addInitScript(()=>Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>window.qaStandalone!==false}));await c.addInitScript(instrument);}});let stage='fixture';
  try{
   await fixture(p);const original=await p.evaluate(()=>localStorage.getItem('calorie-counter-state'));
   stage='diary geometry';const normalRows=await checkRows(p,width);
   await p.screenshot({path:`${out}/${tag}-rows.png`});
   await p.addStyleTag({content:'html {font-size:24px!important;} body #foodList .entry-card .entry-main strong {font-size:21px!important;line-height:1.3!important;}'});const largeRows=await checkRows(p,width);
   await p.locator('style').last().evaluate(e=>e.remove());await settle(p);
   results.push({tag,status:'PASS',stage,normalRows,largeRows});
   if(width===320)continue;
   for(const kind of ['food','child','exercise','edit']){
    const cases=phase==='boundaries'?[0,4,8,16,24,25].flatMap(x=>[.2,.4,.7,.95,1.2].map(f=>({label:`x${x}-${f}`,options:{x,width,fractions:[f*.25,f*.5,f],delay:20},commit:x<=24&&f>=.33}))):[
     {label:'partial cancel',options:{width,fractions:[.15,.3]},commit:false},
     {label:'strong commit',options:{width,x:0,fractions:[.2,.5,.8,1.2]},commit:true},
    ];
    for(const item of cases){
     stage=kind+' '+item.label;if(process.env.EDGE_CASE&&!stage.includes(process.env.EDGE_CASE))continue;
     if(phase==='boundaries')await writeFile(out+'/progress.json',JSON.stringify({tag,stage,time:new Date().toISOString()}));
     await open(p,kind);
     if(phase==='boundaries')item.options.y=await p.evaluate(x=>{
      // Native Chromium touch adjustment may choose a nearby button even when
      // elementFromPoint is the gutter (e.g. x16 next to Scan). Measure a blank
      // edge segment so boundary tests do not bypass form/control exclusions.
      const root=document.querySelector('.add-flow-surface'),controls=[...root.querySelectorAll('input,textarea,select,button,a,[role=tablist],img')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());
      let best={y:230,d:-1};for(let y=90;y<innerHeight-70;y+=8){const d=Math.min(...controls.map(r=>Math.hypot(Math.max(r.left-x,0,x-r.right),Math.max(r.top-y,0,y-r.bottom))));if(d>best.d)best={y,d};}return best.y;
     },item.options.x);
     const before=await p.evaluate(()=>edgeSample());const data=await drag(p,engine,item.options);results.push({tag,status:'CHECK',stage,options:item.options,before,...data});verify(data,{width,kind,commit:item.commit,before});results.at(-1).status='PASS';await close(p);
    }
    if(phase==='interactions'){
     const exceptions=[['vertical',{fractions:[0,0,0],dy:-100}],['diagonal vertical',{fractions:[.01,.03,.06],dy:100}],['wobble',{fractions:[.004,.009,.012],dy:2}],['touch cancel',{fractions:[.2,.5,.8],cancel:true}],['blur',{fractions:[.2,.5],interrupt:()=>p.evaluate(()=>dispatchEvent(new Event('blur')))}],['resize',{fractions:[.2,.5],interrupt:()=>p.evaluate(()=>dispatchEvent(new Event('resize')))}],['visibility',{fractions:[.2,.5],interrupt:()=>p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))}],['multitouch',{fractions:[.2,.5],interrupt:send=>send('touchStart',[{x:100,y:230},{x:120,y:260}])}]];
     for(const [label,options] of exceptions){stage=kind+' '+label;await open(p,kind);const before=await p.evaluate(()=>edgeSample());const data=await drag(p,engine,{width,...options});verify(data,{width,kind,commit:false,before});results.push({tag,status:'PASS',stage});await close(p);}
     stage=kind+' native tab';await p.evaluate(()=>qaStandalone=false);await open(p,kind);let before=await p.evaluate(()=>edgeSample());let data=await drag(p,engine,{width,fractions:[.2,.7]});verify(data,{width,kind,commit:false,before});await close(p);await p.evaluate(()=>qaStandalone=true);results.push({tag,status:'PASS',stage});
     stage=kind+' batched release';await open(p,kind);before=await p.evaluate(()=>edgeSample());await p.evaluate(()=>{edgeStart();const t=document.elementFromPoint(4,230);for(const[type,x]of [['touchstart',4],['touchmove',4+innerWidth*.2],['touchmove',4+innerWidth*.95],['touchend',null]]){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:x===null?[]:[{identifier:1,clientX:x,clientY:230}]});t.dispatchEvent(e);}});await p.waitForTimeout(320);data=await p.evaluate(()=>edgeStop());verify(data,{width,kind,commit:true,before});assert.ok(data.events.find(e=>e.type==='back').time-data.events.find(e=>e.type==='touchend').time>=140,'unpainted movement must not use 40ms settle');results.push({tag,status:'PASS',stage,...data});await close(p);
     stage=kind+' fresh flick';await open(p,kind);before=await p.evaluate(()=>edgeSample());data=await drag(p,engine,{width,fractions:[.03,.08,.2],delay:1,hold:0});const end=data.events.find(e=>e.type==='touchend'),moves=data.events.filter(e=>e.type==='touchmove'),last=moves.at(-1),prior=moves.at(-2)||data.events[0];const velocity=(last.contact.x-prior.contact.x)/Math.max(1,last.time-prior.time),commit=end.time-last.time<100&&velocity>=.65;verify(data,{width,kind,commit,before});results.push({tag,status:'PASS',stage,velocity,commit,...data});await close(p);
     for(let i=0;i<2;i++){await open(p,kind);await p.locator('.add-flow-surface .modal-close-button').evaluate(e=>e.click());await settle(p);await close(p);}results.push({tag,status:'PASS',stage:kind+' rapid reopen'});
    }
   }
   assert.equal(await p.evaluate(()=>localStorage.getItem('calorie-counter-state')),original,'Back/cancel never writes diary');assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
   console.log('PASS',phase,tag);
  }catch(error){await p.screenshot({path:`${out}/${tag}-failure.png`});results.push({tag,status:'FAIL',stage,error:error.stack,dom:await p.evaluate(()=>({sample:edgeSample(),body:document.body.outerHTML.slice(0,300),target:document.querySelector('[data-empty-exercise-action=add]')?.outerHTML}))});throw error;}
  finally{await writeFile(out+'/results.json',JSON.stringify({engineVersion:b.version(),phase,results},null,2));await c.close();}
 }}finally{await b.close();}
}
console.log('PASS',results.length,'checks');
