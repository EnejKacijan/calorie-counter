import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,out,fixture,settle,drag,openScanner,sample} from './scanner-edge-harness.mjs';
import {localRice,milk} from './fixtures/food-search.mjs';
import {instrument} from './edge-row-harness.mjs';
await mkdir(out,{recursive:true});const results=[];
for(const engine of ['chromium','webkit']){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});const{c,p}=await fixture(b,{engine,theme:'dark'});let stage='start';
 try{
  const exceptions=[['vertical',{fractions:[0,0],dy:100}],['diagonal',{fractions:[.01,.04],dy:120}],['touchcancel',{fractions:[.2,.7],cancel:true}],['blur',{fractions:[.2,.5],interrupt:()=>p.evaluate(()=>dispatchEvent(new Event('blur')))}],['resize',{fractions:[.2,.5],interrupt:()=>p.evaluate(()=>dispatchEvent(new Event('resize')))}],['visibility',{fractions:[.2,.5],interrupt:()=>p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))}],['multitouch',{fractions:[.2,.5],interrupt:send=>send('touchStart',[{x:100,y:210},{x:120,y:260}])}]];
  await openScanner(p);
  for(const[label,options]of exceptions){stage=label;const before=await sample(p);const trace=await drag(p,engine,{y:210,...options});assert.equal(trace.final.backClicks,before.backClicks);assert.equal(trace.final.dialog.rect.x,0);assert.ok(trace.final.sameParent);assert.ok(await p.locator('.add-flow-host').evaluate(e=>e.inert));results.push({engine,stage,pass:true,trace});}
  stage='barcode draft and input exclusion';await p.locator('[data-mode=barcode]').tap();await p.locator('[data-code]').fill('1234567890123');
  const before=await sample(p);let trace=await drag(p,engine,{y:210,fractions:[.2,.75]});assert.equal(trace.final.backClicks,before.backClicks);assert.equal(trace.final.dialog.rect.x,0);assert.equal(await p.locator('[data-code]').inputValue(),'1234567890123');
  await p.locator('#packageScanTitle').tap();await p.locator('[data-code]').evaluate(e=>e.blur());
  trace=await drag(p,engine,{y:210,fractions:[.1,.2],hold:180});assert.equal(trace.final.dialog.mode,'barcode');assert.equal(await p.locator('[data-code]').inputValue(),'1234567890123');results.push({engine,stage,pass:true});
  stage='selected text exclusion';await p.locator('#packageScanTitle').evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(range);});trace=await drag(p,engine,{y:210,fractions:[.4,.8]});assert.equal(trace.final.backClicks,before.backClicks);await p.evaluate(()=>getSelection().removeAllRanges());results.push({engine,stage,pass:true});
  stage='same-coordinate release';await p.locator('[data-mode=food]').tap();const target=await p.locator('#foodScanButton').evaluate(e=>e.getBoundingClientRect().toJSON());
  // Finish over the retained trigger's coordinates, without a fresh pointerdown.
  trace=await drag(p,engine,{y:target.y+target.height/2,fractions:[.25,.5],hold:180});assert.equal(trace.final.backClicks,before.backClicks+1);await p.waitForTimeout(1050);assert.equal(await p.locator('.unified-scanner').count(),0);assert.equal((await sample(p)).pressed,0);assert.equal((await sample(p)).outline,'none');results.push({engine,stage,pass:true,trace});
  await p.evaluate(({localRice,milk})=>{localStorage.setItem('calorie-counter-food-library',JSON.stringify([localRice,milk]));localStorage.setItem('calorie-counter-saved-foods',JSON.stringify([localRice]));},{localRice,milk});
  await p.reload();await p.locator('#floatingAddButton').tap();await settle(p);await p.evaluate(instrument);
  for(const filter of ['recent','my','all']){
   stage='retain '+filter;await p.locator('[data-food-filter='+filter+']').tap();await p.locator('#manualFoodName').fill(filter==='all'?'banana':'rice');await p.locator('#manualFoodName').press('Enter');await settle(p);
   await p.evaluate(()=>{document.querySelector('.add-flow-content').scrollTop=32;document.querySelector('#foodAmount').value='1.5';window.retainedAdd=document.querySelector('.add-flow-host');window.retainedResults=document.querySelector('#foodSuggestions');});
   const state=()=>p.evaluate(()=>({same:retainedAdd===document.querySelector('.add-flow-host')&&retainedResults===document.querySelector('#foodSuggestions'),scroll:document.querySelector('.add-flow-content').scrollTop,query:document.querySelector('#manualFoodName').value,filter:document.querySelector('[data-food-filter].is-active').dataset.foodFilter,results:document.querySelector('#foodSuggestions').innerHTML,draft:document.querySelector('#foodAmount').value}));
   const prior=await state();await openScanner(p);const whileOpen=await state();assert.deepEqual(whileOpen,prior);await drag(p,engine,{y:210,fractions:[.15,.25],hold:180});assert.deepEqual(await state(),prior);await drag(p,engine,{y:210,fractions:[.5,.9],hold:180});assert.deepEqual(await state(),prior);results.push({engine,stage,pass:true,state:prior});
  }
  assert.deepEqual(await p.evaluate(()=>qaErrors),[]);
 }catch(e){results.push({engine,stage,pass:false,error:e.stack});await p.screenshot({path:out+'/'+engine+'-FAIL.png'});throw e;}
 finally{await c.close();await b.close();await writeFile(out+'/results.json',JSON.stringify(results,null,2));console.log(engine,stage);}
}
