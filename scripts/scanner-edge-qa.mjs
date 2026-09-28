import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,out,fixture,settle,drag,openScanner,sample} from './scanner-edge-harness.mjs';
await mkdir(out,{recursive:true});const results=[];
const quick=process.env.SCANNER_EDGE_QUICK==='1';
for(const engine of (process.env.SCANNER_EDGE_ENGINE?[process.env.SCANNER_EDGE_ENGINE]:['chromium','webkit'])){
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 try{for(const[width,height]of(quick?[[390,844]]:[[320,667],[375,667],[390,844],[393,852],[430,932]]))for(const theme of(quick?['dark']:['light','dark']))for(const reduce of(quick?[false]:[false,true])){
  const{c,p}=await fixture(b,{engine,width,height,theme,reduce});const tag=`${engine}-${width}-${theme}-${reduce?'reduced':'motion'}`,checks=[],traces=[];let stage='open';
  try{
   const parent=await sample(p);const retained=s=>{assert.ok(s.sameParent&&s.sameInput&&s.sameForm&&s.sameResult,'same live Add nodes');assert.equal(s.query,parent.query);assert.equal(s.filter,parent.filter);assert.equal(s.results,parent.results);assert.equal(s.parentScroll,parent.parentScroll);assert.equal(s.host.x,parent.host.x);assert.equal(s.host.y,parent.host.y);assert.equal(s.host.width,parent.host.width);assert.equal(s.host.height,parent.host.height);};
   const run=async(options={},commit=false)=>{
    stage=JSON.stringify(options);if(!await p.locator('.unified-scanner').count())await openScanner(p);
    const before=await sample(p),d=p.locator('.unified-scanner');await d.evaluate(e=>window.qaScanner=e);
    assert.ok(await p.locator('.add-flow-host').evaluate(e=>e.inert),'live parent is explicitly inert before movement');
    const trace=await drag(p,engine,{width,y:210,...options});traces.push(trace);
    for(const frame of trace.frames){retained(frame);if(frame.dialog){assert.equal(frame.dialog.backdrop,'rgba(0, 0, 0, 0)');assert.ok(Number.isFinite(frame.dialog.rect.x));assert.ok(frame.dialog.rect.x>=-1&&frame.dialog.rect.x<=width+1);if(frame.contact)assert.equal(frame.backClicks,before.backClicks,'no mid-drag Back');}}
    assert.equal(trace.final.backClicks-before.backClicks,Number(commit),'exactly once semantic Back');assert.equal(await d.count(),Number(!commit));
    if(!commit){assert.equal(await d.evaluate(e=>e===qaScanner),true);assert.equal(trace.final.dialog.rect.x,0);}
    else{assert.equal(trace.final.outline,'none');assert.deepEqual(trace.final.paint,parent.paint);assert.equal(trace.final.pressed,0);assert.equal(await p.locator('.add-flow-host').evaluate(e=>e.inert),false,'parent becomes interactive only after exit');}
    assert.equal(trace.frames.some(f=>f.dialog?.rect.x>10),options.x===25?false:!options.dy);
   };
   await run({fractions:[.1,.2],hold:160},false);checks.push('partial cancel retains same scanner and exact live Add nodes/state');
   await run({fractions:[.25,.5,.75,.9],hold:180},true);await p.waitForTimeout(1000);let s=await sample(p);retained(s);assert.equal(s.outline,'none');assert.equal(s.pressed,0);checks.push('parent visible from first movement; stationary; release-only exactly-once commit; neutral idle after 1s');
   stage='visible Back';await openScanner(p);await p.evaluate(()=>edgeStart());await p.locator('.package-scan-close').tap();await p.locator('.unified-scanner').waitFor({state:'detached'});await settle(p);const back=await p.evaluate(()=>edgeStop());traces.push(back);back.frames.forEach(retained);assert.equal(back.final.outline,'none');assert.deepEqual(back.final.paint,parent.paint);checks.push('visible Back uses same retained parent; no touch outline');
   stage='keyboard';await p.keyboard.press('Tab');await p.locator('#foodScanButton').focus();assert.equal(await p.locator('#foodScanButton').evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle!=='none'),true);await p.keyboard.press('Enter');await settle(p);await p.keyboard.press('Escape');await p.locator('.unified-scanner').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>document.activeElement.id),'foodScanButton');assert.equal(await p.locator('#foodScanButton').evaluate(e=>getComputedStyle(e).outlineStyle!=='none'),true);checks.push('keyboard focus/Enter/Escape restoration stays visible');
   if(width===390&&theme==='dark'&&!reduce){
    for(const x of[0,4,8,16,24,25])for(const fraction of[.2,.5,.9,1.2])await run({x,fractions:[fraction/2,fraction],hold:160},x<=24&&fraction>=.33);
    checks.push('24 edge/overdrag combinations: 0/4/8/16/24/25px × 20/50/90/120%; finite/clamped; no mid-drag commit');
   }
   if(await p.locator('.unified-scanner').count()){await p.locator('.package-scan-close').tap();await p.locator('.unified-scanner').waitFor({state:'detached'});}
   assert.deepEqual(await p.evaluate(()=>qaErrors),[]);results.push({tag,checks,traces});console.log('PASS',tag,checks.length);
  }catch(e){await p.screenshot({path:out+'/'+tag+'-FAIL.png'});await writeFile(out+'/failure.json',JSON.stringify({tag,stage,error:e.stack,sample:await sample(p),traces},null,2));throw e;}
  finally{await c.close();await writeFile(out+'/matrix.json',JSON.stringify({qualification:'Native Chromium touch; WebKit controlled TouchEvents. Standalone/safe-area emulation, not physical iPhone.',results},null,2));}
 }}finally{await b.close();}
}
