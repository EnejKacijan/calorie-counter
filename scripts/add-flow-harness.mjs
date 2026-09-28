import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {preparePwa,preparePwaPage} from './pwa-qa-context.mjs';
export const pw=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
export const out=process.env.INTAKE_QA_OUTPUT||'artifacts/add-flow';
export const base=process.env.INTAKE_URL||'http://127.0.0.1:3002';
export const product={id:'usda-qa-banana',catalogId:'usda-qa-banana',name:'Banana',brand:'QA Pantry',source:'USDA',serving:'32 g',servingGrams:32,calories:120,protein:3,carbs:24,fat:2};
export async function settle(p){await p.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});}
export async function setup(b,{width=390,height=844,theme='light',engine='chromium',missing=false,video=false,reduce=false,source,serviceWorkers='block',cold=false,beforeOpen,timezoneId}={}){
 await mkdir(out,{recursive:true});const c=await b.newContext({viewport:{width,height},hasTouch:true,isMobile:true,colorScheme:theme,reducedMotion:reduce?'reduce':'no-preference',serviceWorkers,...(timezoneId?{timezoneId}:{}),...(video?{recordVideo:{dir:out+'/videos',size:{width,height}}}:{})});await preparePwa(c,width);
 await c.addInitScript(({theme,missing,cold})=>{
  const now=new Date(),old=new Date();old.setDate(old.getDate()-2);const key=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');window.qaDate=key(old);
  if(!localStorage.getItem('calorie-counter-state'))localStorage.setItem('calorie-counter-state',JSON.stringify({user:{name:'QA',age:30,sex:'male',heightCm:180,weightKg:75,targetWeightKg:70,goalType:'lose',activityMultiplier:1.375,weeklyRateKg:.5},goals:{calories:2000,protein:140,carbs:240,fat:60},days:{[qaDate]:{foods:[],exercises:[]}},selectedDate:qaDate,lastOpenedDate:key(now),progress:[],theme}));
  if(!cold)sessionStorage.setItem('calorie-counter-today-session-v1','active');
  if(missing)Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
  window.qaEvents=[];window.qaWrites=[];window.qaErrors=[];window.qaInnerHeight=Object.getOwnPropertyDescriptor(window,'innerHeight');
  // Instrument only event/field IDs, validity and write completion/counts. No
  // diary/profile/photo payloads or user content are diagnostic log material.
  for(const type of ['pointerdown','click','submit','invalid','focusin'])document.addEventListener(type,e=>qaEvents.push({type,target:e.target.id||e.target.tagName,defaultPrevented:e.defaultPrevented,valid:e.target.validity?.valid,time:performance.now()}),true);
  window.addEventListener('error',e=>qaErrors.push({name:e.error?.name,message:e.message,stack:e.error?.stack}));
  const write=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='calorie-counter-state'){qaEvents.push({type:'storage-attempt'});if(window.qaFailStorage)throw new DOMException('QA storage failure','QuotaExceededError');const result=write.call(this,k,v);qaWrites.push({key:k,time:performance.now()});return result;}return write.call(this,k,v);};
 },{theme,missing,cold});
 const p=await c.newPage();if(engine==='chromium')await preparePwaPage(p);p.setDefaultTimeout(12000);
 await p.route('**/api/foods/search?*',r=>r.fulfill({json:{foods:[product,...Array.from({length:14},(_,i)=>({...product,id:'usda-qa-'+i,catalogId:'usda-qa-'+i,name:'Banana snack '+i}))]}}));
 if(source)await p.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==new URL(base).origin||url.pathname.startsWith('/api/'))return route.fallback();
  const root=path.resolve(source),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))return route.fallback();
  try{await route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream'});}catch{await route.fallback();}
 });
 await beforeOpen?.({c,p});
 await p.goto(base+'/index.html');await p.locator('#floatingAddButton').waitFor();await settle(p);return{c,p};
}
export async function openFood(p){await p.locator('#floatingAddButton').click();await p.locator('#manualFoodName').waitFor();await settle(p);}
export async function selectFood(p){await p.locator('#manualFoodName').fill('banana');await p.locator('#manualFoodName').press('Enter');const row=p.locator('#foodSuggestions .suggestion-card').filter({has:p.locator('strong',{hasText:/^Banana$/})});await row.click();await settle(p);}
export async function metrics(p,tag){return p.evaluate(tag=>{
 const root=document.querySelector('.log-panel.is-adding'),form=root?.querySelector('form'),rect=e=>e?.getBoundingClientRect().toJSON(),style=e=>e?Object.fromEntries(['position','top','bottom','height','maxHeight','overflowY','transform','backgroundColor','fontSize'].map(k=>[k,getComputedStyle(e)[k]])):null;
 return{tag,scrollY,innerHeight,vv:{height:visualViewport.height,top:visualViewport.offsetTop,scale:visualViewport.scale},active:document.activeElement.id,root:rect(root),rootStyle:style(root),header:rect(root?.querySelector('.panel-title')),form:rect(form),formStyle:style(form),footer:rect(root?.querySelector('.add-flow-footer')||form?.querySelector('[type=submit]')),inputs:[...form?.querySelectorAll('input,select,textarea')||[]].filter(e=>e.getClientRects().length).map(e=>({id:e.id,rect:rect(e),style:style(e),valid:e.validity.valid})),owners:['html','body','.app-shell','.main-content','#foodSection','#exerciseSection','#manualFoodForm','#foodSuggestions'].map(s=>{const e=document.querySelector(s);return{s,rect:rect(e),style:style(e),scroll:e.scrollTop,inert:e.inert};})};
 },tag);}
export async function keyboard(p,height=430,top=90,innerHeight=height){await p.evaluate(({height,top,innerHeight})=>{Object.defineProperties(visualViewport,{height:{configurable:true,value:height},offsetTop:{configurable:true,value:top}});Object.defineProperty(window,'innerHeight',{configurable:true,value:innerHeight});visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));},{height,top,innerHeight});await settle(p);}
export async function closeKeyboard(p){await p.evaluate(()=>{document.activeElement.blur();Object.defineProperty(window,'innerHeight',qaInnerHeight);delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});await settle(p);}
export const read=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('calorie-counter-state')));
