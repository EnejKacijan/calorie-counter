import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,settle,openFood,out} from './add-flow-harness.mjs';
process.env.GALLERY_FIXTURES_ONLY='1';
const {imageFile}=await import('./gallery-flow-qa.mjs');
export const foods=[
 {name:'Grilled sausage links',amount:7,unit:'piece',servingGrams:210,calories:650,protein:42,carbs:5,fat:54},
 {name:'White sandwich bread',amount:2,unit:'piece',servingGrams:60,calories:140,protein:4,carbs:28,fat:2},
 {name:'Ketchup',amount:2,unit:'serving',servingGrams:30,calories:40,protein:0,carbs:10,fat:0},
];
export async function prepare({c}) { await c.addInitScript(()=>{
 localStorage.setItem('calorie-counter-ai-consent-v1',JSON.stringify({photo:true,label:true}));
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:undefined});
 window.plateUrls=new Set();const make=URL.createObjectURL,revoke=URL.revokeObjectURL;
 URL.createObjectURL=blob=>{const url=make.call(URL,blob);plateUrls.add(url);return url;};
 URL.revokeObjectURL=url=>{plateUrls.delete(url);revoke.call(URL,url);};
 }); }
export async function scan(p,count=3,{pause=0,delay=180}={}) {
 const analysis={foods:Array.from({length:count},(_,i)=>({...foods[i%3],...(i>2?{name:`${foods[i%3].name} ${i+1}`}:{})}))};
 // WebKit with an active SW can bypass Playwright page routes. Keep this
 // synthetic-photo fixture at the fetch boundary so QA never calls real AI.
 await p.evaluate(({analysis,delay})=>{
  window.plateFixture={analysis,requests:0,delay};
  if(window.plateNativeFetch)return;
  window.plateNativeFetch=window.fetch;
  window.fetch=async function(input,options){
   if(new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/foods/analyze-image'){
    const fixture=window.plateFixture;fixture.requests++;await new Promise(resolve=>setTimeout(resolve,fixture.delay));
    return new Response(JSON.stringify({analysis:fixture.analysis}),{status:200,headers:{'Content-Type':'application/json'}});
   }
   return window.plateNativeFetch.call(this,input,options);
  };
 },{analysis,delay});
 await openFood(p);if(pause)await p.waitForTimeout(pause);await p.locator('#foodScanButton').tap();if(pause)await p.waitForTimeout(pause);
 const file=await imageFile(p,[900,1200]);const picker=p.waitForEvent('filechooser');await p.locator('[data-gallery]').tap();await(await picker).setFiles(file);
 await p.locator('.scan-plate-row').first().waitFor();await settle(p);await p.locator('#scanReview .food-photo-thumb img[src]').evaluate(e=>e.decode());
 return {requests:()=>p.evaluate(()=>plateFixture.requests)};
}
export async function geometry(p) {return p.evaluate(()=>{
 const selectors=['html','body','.app-shell','.main-content','.add-flow-host','.add-flow-surface','.add-flow-header','.add-flow-content','#manualFoodForm','#scanReview','.scan-review-footer','.scan-review-footer-actions','.add-flow-footer'];
 return {viewport:{height:innerHeight,width:innerWidth,vvHeight:visualViewport.height,vvTop:visualViewport.offsetTop,scale:visualViewport.scale},nodes:selectors.map(selector=>{const e=document.querySelector(selector);if(!e)return {selector};const s=getComputedStyle(e);return {selector,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,range:e.scrollHeight-e.clientHeight,scrollTop:e.scrollTop,rect:e.getBoundingClientRect().toJSON(),hidden:e.hidden,style:Object.fromEntries(['display','height','minHeight','maxHeight','paddingTop','paddingBottom','marginTop','marginBottom','overflowY','position','boxSizing','flex','gap'].map(k=>[k,s[k]]))};})};
 });}
if(process.env.PLATE_FIXTURES_ONLY!=='1'){
 await mkdir(out,{recursive:true});const results=[],b=await pw.chromium.launch({channel:'msedge',headless:true});
 try{for(const [width,height] of [[390,844],[393,852]])for(const count of [3,8]){
  const {p,c}=await setup(b,{width,height,theme:'dark',beforeOpen:prepare,source:process.env.PLATE_PROBE_SOURCE});
  try{await scan(p,count);const before=await geometry(p);await p.screenshot({path:`${out}/before-${width}-${count}.png`});
   await p.locator('.add-flow-content').evaluate(e=>e.scrollTop=10000);const after=await geometry(p);
   results.push({width,height,count,before,after});console.log(width,count,before.nodes.map(n=>[n.selector,n.range,n.style?.overflowY]),'travel',after.nodes.find(n=>n.selector==='.add-flow-content').scrollTop);
  }finally{await c.close();}
 }}finally{await b.close();await writeFile(out+'/geometry.json',JSON.stringify(results,null,2));}
}
