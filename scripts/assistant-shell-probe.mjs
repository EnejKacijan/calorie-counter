import {pw,setup,base,out,settle} from './add-flow-harness.mjs';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function sample() {
 const selectors={body:'body',root:'.app-shell',page:'.main-content',assistant:'.assistant-shell',header:'.assistant-header',conversation:'.assistant-conversation',empty:'#assistantEmpty',composer:'.assistant-chat-footer',disclaimer:'.assistant-footnote',nav:'.mobile-tabbar'};
 const probe=document.createElement('div');probe.style.cssText='position:fixed;visibility:hidden;height:100dvh;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);box-sizing:content-box';document.body.append(probe);const pc=getComputedStyle(probe),safe={top:pc.paddingTop,bottom:pc.paddingBottom,dvh:pc.height};probe.remove();
 return {path:location.pathname,layout:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,innerHeight,scrollY},vv:{height:visualViewport.height,top:visualViewport.offsetTop,scale:visualViewport.scale},safe,active:document.activeElement?.id,theme:document.body.dataset.theme,secure:isSecureContext,uuid:typeof crypto.randomUUID,
  nodes:Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{const e=document.querySelector(selector);if(!e)return[name,null];const c=getComputedStyle(e);return[name,{rect:e.getBoundingClientRect().toJSON(),css:Object.fromEntries(['height','minHeight','maxHeight','position','top','bottom','paddingTop','paddingBottom','overflowY','transform','contain'].map(k=>[k,c[k]])),inline:e.getAttribute('style')}];}))};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){
const results=[];
for(const engine of ['chromium','webkit']){
 const b=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 try{for(const theme of ['light','dark']){
  const {p,c}=await setup(b,{engine,theme}),errors=[],requests=[];p.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
  await p.route('**/api/assistant/chat',r=>{requests.push(r.request().postDataJSON());return r.fulfill({json:{message:'Synthetic reply.'}});});
  await p.evaluate(()=>{localStorage.setItem('calorie-counter-ai-consent-v1','{"assistant":true}');window.repairFrames=[];window.repairEvents=[];window.repairWrites=[];const write=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.includes('assistant-conversations'))repairWrites.push({key:k,count:JSON.parse(v).length});return write.call(this,k,v);};for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>repairEvents.push({type,target:e.target.id||e.target.closest('[data-assistant-prompt]')?.dataset.assistantPrompt||e.target.tagName}),true);function frame(){const b=document.querySelector('[data-assistant-prompt]'),h=document.querySelector('#assistantHistoryOpen');if(b&&repairFrames.length<50){const c=getComputedStyle(b),hc=getComputedStyle(h);repairFrames.push({time:performance.now(),active:document.activeElement.id,focus:b.matches(':focus'),focusVisible:b.matches(':focus-visible'),border:c.border,outline:c.outline,background:c.backgroundColor,historyBorder:hc.border,historyOutline:hc.outline,rect:b.getBoundingClientRect().toJSON(),nav:document.querySelector('.mobile-tabbar').getBoundingClientRect().toJSON(),styles:[...document.styleSheets].map(s=>s.href),theme:document.body.dataset.theme});}requestAnimationFrame(frame);}requestAnimationFrame(frame);});
  const today=await p.evaluate(sample);await p.locator('.mobile-tabbar a[href="assistant.html"]').tap();await p.locator('#assistantTitle').waitFor();await p.screenshot({path:out+`/before-first-${engine}-${theme}.png`});await p.waitForTimeout(850);const assistant=await p.evaluate(sample);await p.screenshot({path:out+`/before-settled-${engine}-${theme}.png`});
  await p.evaluate(()=>{Object.defineProperties(visualViewport,{height:{configurable:true,value:740},offsetTop:{configurable:true,value:0}});visualViewport.dispatchEvent(new Event('resize'));});await settle(p);const shortVisualViewport=await p.evaluate(sample);
  await p.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});
  await p.locator('[data-assistant-prompt]').first().tap();await p.waitForTimeout(250);results.push({engine,theme,today,assistant,shortVisualViewport,frames:await p.evaluate(()=>repairFrames),events:await p.evaluate(()=>repairEvents),writes:await p.evaluate(()=>repairWrites),errors,requests,messages:await p.locator('.assistant-message').count()});await c.close();
 }}finally{await b.close();}
}
await writeFile(out+'/probe.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({frames,...r})=>({...r,frames:[frames[0],frames.at(-1)]}))));
}
