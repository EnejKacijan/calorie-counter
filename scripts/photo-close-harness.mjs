import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,settle,read,out} from './add-flow-harness.mjs';
process.env.GALLERY_FIXTURES_ONLY='1';
const {imageFile}=await import('./gallery-flow-qa.mjs');
export {pw,setup,settle,read,out};
export const group='.scanned-meal-header .food-photo-thumb';
export async function seedPhotoDiary(p,{long=false,individual=false}={}){
 const image=await imageFile(p,[900,1200]);
 await p.evaluate(async({data,long,individual})=>{
  const {foodMedia}=await import('/food-media-runtime.js?v=2'),{normalizeFoodPhoto}=await import('/food-media.js?v=2');
  const id=await foodMedia.put(await normalizeFoodPhoto(await(await fetch('data:image/jpeg;base64,'+data)).blob()));
  const s=JSON.parse(localStorage.getItem('calorie-counter-state')),date=s.selectedDate;
  const food={name:'Grilled sausage links',amount:7,unit:'piece',servingGrams:210,calories:650,protein:42,carbs:5,fat:54,meal:'lunch',source:'Photo',loggedAt:date+'T12:00:00',loggedForDate:date};
  s.days[date]={foods:[...(long?Array.from({length:12},(_,i)=>({...food,id:'earlier-'+i,name:'Earlier food '+i,meal:'breakfast'})):[]),{...food,id:'plate-a',captureId:id},{...food,id:'plate-b',name:'Flatbread, toasted',captureId:id}],exercises:[]};
  if(long||individual)s.days[date].foods.push({...food,id:'photo-single',name:'Individual food',meal:'snack',photoMediaId:id});
  localStorage.setItem('calorie-counter-state',JSON.stringify(s));await foodMedia.settle([id]);
 },{data:image.buffer.toString('base64'),long,individual});
 await p.reload();await p.locator(group).waitFor();await settle(p);
}
export function instrumentPhotoClose(){
 let sampling=false;
 window.closeEvents=[];window.closeFrames=[];window.closeRecording=false;
 const rect=e=>e?.getBoundingClientRect().toJSON();
 const style=e=>{if(!e)return null;const s=getComputedStyle(e);return Object.fromEntries(['position','top','bottom','height','minHeight','maxHeight','paddingTop','paddingBottom','overflow','overflowX','overflowY','transform','translate','contain','willChange','opacity','boxSizing'].map(k=>[k,s[k]]));};
 const vars=e=>e&&Object.fromEntries([...e.style].filter(k=>/^--(app|surface|safe|viewport|vv|assistant)/.test(k)).map(k=>[k,e.style.getPropertyValue(k)]));
 window.closeSample=()=>{
  sampling=true;
  try{const q=s=>document.querySelector(s),d=q('.food-photo-viewer'),nav=q('.mobile-tabbar');return{
   time:performance.now(),wall:Date.now(),state:d?.dataset.photoState||'absent',viewer:rect(d),scrimOpacity:d?Number(getComputedStyle(q('.food-photo-scrim')).opacity):0,
   image:rect(q('[data-photo-full]')),frame:rect(q('.food-photo-frame')),today:rect(q('.main-content')),app:rect(q('.app-shell')),group:rect(q('.scanned-meal-group')),
   source:rect(q('.scanned-meal-header .food-photo-thumb img')),footer:rect(nav),footerStyle:style(nav),fab:rect(q('#floatingAddButton')),
   scroll:{x:scrollX,y:scrollY,document:document.scrollingElement.scrollTop,body:document.body.scrollTop,today:q('.main-content')?.scrollTop,rootHeight:document.scrollingElement.scrollHeight},
   viewport:{height:visualViewport.height,top:visualViewport.offsetTop,width:visualViewport.width,scale:visualViewport.scale,innerHeight,innerWidth,clientHeight:document.documentElement.clientHeight},
   bodyStyle:style(document.body),rootStyle:style(document.documentElement),bodyInline:document.body.getAttribute('style'),rootInline:document.documentElement.getAttribute('style'),classes:{body:document.body.className,root:document.documentElement.className},
   vars:{body:vars(document.body),root:vars(document.documentElement),app:vars(q('.app-shell'))},inert:q('.app-shell').inert,focus:document.activeElement?.id||document.activeElement?.tagName,
  };}finally{sampling=false;}
 };
 const event=(type,extra={})=>closeEvents.push({type,...extra,...closeSample()});window.closeEvent=event;
 const scroll=window.scrollTo;window.scrollTo=function(...args){event('scrollTo-before',{args,stack:new Error().stack});const r=scroll.apply(this,args);event('scrollTo-after');return r;};
 const measure=Element.prototype.getBoundingClientRect;Element.prototype.getBoundingClientRect=function(){const r=measure.call(this);if(!sampling&&this.matches?.('.food-photo-thumb img,.plate-photo-row img'))event('thumbnail-measure',{target:this.parentElement.className,rect:r.toJSON()});return r;};
 const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('.food-photo-frame,.food-photo-scrim,.food-photo-viewer header,.food-photo-viewer footer'))event('animate:'+this.className,{frames,options});return animate.call(this,frames,options);};
 for(const method of ['showModal','close']){const native=HTMLDialogElement.prototype[method];HTMLDialogElement.prototype[method]=function(...args){const result=native.apply(this,args);event('dialog-'+method);return result;};}
 new MutationObserver(records=>event('layout-mutation',{targets:records.map(r=>r.target.tagName+':'+r.attributeName)})).observe(document.body,{attributes:true,attributeFilter:['style','class','inert']});
 document.addEventListener('click',e=>{if(e.target.closest('[data-photo-close]'))event('close-click');},true);
 for(const name of ['resize','popstate','blur','focus','pageshow','pagehide'])addEventListener(name,()=>event(name));
 for(const name of ['resize','scroll'])visualViewport.addEventListener(name,()=>event('visualViewport-'+name));
 document.addEventListener('visibilitychange',()=>event('visibilitychange'));
 window.closeStart=()=>{closeFrames=[];closeEvents=[];closeRecording=true;const tick=()=>{closeFrames.push(closeSample());if(closeRecording)requestAnimationFrame(tick);};tick();};
 window.closeStop=()=>{closeRecording=false;return{frames:closeFrames,events:closeEvents};};
}
export async function captureRendered(p,c,engine,dir,run){
 if(engine!=='chromium')return run();
 await mkdir(dir,{recursive:true});const cd=await c.newCDPSession(p),frames=[],pending=[];
 cd.on('Page.screencastFrame',e=>{const n=frames.length;frames.push({n,time:e.metadata.timestamp});pending.push(writeFile(`${dir}/${String(n).padStart(3,'0')}.png`,Buffer.from(e.data,'base64')));void cd.send('Page.screencastFrameAck',{sessionId:e.sessionId});});
 await cd.send('Page.startScreencast',{format:'png',maxWidth:430,maxHeight:932,everyNthFrame:1});
 try{await run();}finally{await cd.send('Page.stopScreencast');await Promise.all(pending);await writeFile(dir+'/frames.json',JSON.stringify(frames,null,2));await cd.detach();}
}
