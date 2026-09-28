import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pw,setup,settle,read,keyboard,closeKeyboard,out} from './add-flow-harness.mjs';
import {seedPhotoDiary,captureRendered} from './photo-close-harness.mjs';
export {pw,settle,read,keyboard,closeKeyboard,out,captureRendered};
export const group='.scanned-meal-group',toggle='.scanned-meal-toggle';
export async function launchPage(b,options={}){
 const source=options.source;
 return setup(b,{...options,beforeOpen:async({c,p})=>{
  await c.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{configurable:true,value:true});window.focusPlans=[];window.focusWrites=[];
   const scroll=Element.prototype.scrollTo;Element.prototype.scrollTo=function(options,...args){if(options?.behavior==='instant')focusWrites.push({time:performance.now(),top:options.top,owner:this.id||this.tagName});return scroll.call(this,options,...args);};
  });
  // Observe the production helper's actual plan without changing its behavior.
  await p.route('**/disclosure-reveal.js*',async route=>{
   const src=await readFile(path.join(source||'public','disclosure-reveal.js'),'utf8');
   const marker='if(Math.abs(distance)<.5)';if(!src.includes(marker))throw Error('Missing reveal audit point');
   const audit=`window.focusPlans.push({start,max,target,distance,usable,trigger:rect(trigger),anchor:typeof measuredAnchor==='undefined'?(typeof anchor==='undefined'?rect(trigger):rect(resolve(anchor)||trigger)):measuredAnchor,policy:typeof policy==='undefined'?'nearest':policy,region:disclosureRegion(resolve(expandedRegion)),time:win.performance.now()});`;
   await route.fulfill({body:src.replace(marker,audit+marker),contentType:'text/javascript'});
  });
 }});
}
export async function fixture(p,{count=2,tail=0,second=false}={}){
 await seedPhotoDiary(p);
 await p.evaluate(({count,tail,second})=>{
  const s=JSON.parse(localStorage.getItem('calorie-counter-state')),d=s.days[s.selectedDate],a=d.foods[0],b=d.foods[1];
  d.foods=Array.from({length:count},(_,i)=>({... (i%2?b:a),id:'focus-food-'+i,name:i<2?[a.name,b.name][i]:`Food ${i+1}: yogurt with berries`,localFoodId:'focus-local-'+i}));
  if(second)d.foods.push(...[0,1].map(i=>({...b,id:'second-'+i,captureId:'photo-focus-second',name:'Second meal food '+i})));
  d.exercises=Array.from({length:tail},(_,i)=>({id:'tail-'+i,name:'Walking',minutes:30,calories:130}));localStorage.setItem('calorie-counter-state',JSON.stringify(s));
 },{count,tail,second});await p.reload();await p.locator(toggle).first().waitFor();await settle(p);
}
export const finish=async p=>{await settle(p);await p.waitForTimeout(270);};
export async function position(p,{index=0,where='bottom'}={}){
 await p.locator(group).nth(index).evaluate((e,where)=>{
  const h=e.querySelector('.scanned-meal-header').getBoundingClientRect(),safe=parseFloat(getComputedStyle(document.querySelector('.app-shell'),'::before').height)||0,nav=document.querySelector('.mobile-tabbar').getBoundingClientRect();
  const top=where==='bottom'?nav.top-h.height-20:safe+35;
  document.scrollingElement.scrollTo({top:scrollY+h.top-top,behavior:'instant'});
 },where);await settle(p);
}
export async function measure(p,{nutrition=false,index=0}={}){return p.evaluate(({nutrition,index})=>{
 const q=s=>document.querySelector(s),g=[...document.querySelectorAll('.scanned-meal-group')][index],owner=nutrition?q('.add-flow-content'):document.scrollingElement;
 const r=e=>e?.getBoundingClientRect().toJSON(),header=nutrition?q('#foodNutritionSummary'):g.querySelector('.scanned-meal-header');
 const safe=parseFloat(getComputedStyle(q('.app-shell'),'::before').height)||0,foot=r(nutrition?q('.add-flow-footer'):q('.mobile-tabbar')),fab=r(q('#floatingAddButton'));
 const bounds=nutrition?{top:Math.max(r(owner).top,visualViewport.offsetTop),bottom:Math.min(r(owner).bottom,foot.top,visualViewport.offsetTop+visualViewport.height)}:{top:Math.max(safe,visualViewport.offsetTop),bottom:Math.min(foot.top,fab.top,visualViewport.offsetTop+visualViewport.height)};
 const rows=nutrition?['Calories','Protein','Carbs','Fat'].map(n=>q('#manualFood'+n).closest('label')):[...g.querySelectorAll('.scanned-meal-children > .entry-card')];
 const anchor=r(header);if(nutrition)anchor.top=anchor.y=Math.min(anchor.top,...rows.filter(e=>e.getClientRects().length).map(e=>r(e).top));
 return {scrollTop:owner.scrollTop,max:owner.scrollHeight-owner.clientHeight,height:owner.scrollHeight,bounds,anchor,rows:rows.map(r),fullyVisible:rows.filter(e=>{const b=r(e);return b.height>0&&b.top>=bounds.top-1&&b.bottom<=bounds.bottom-1;}).length,
  rootTop:scrollY,footer:foot,fab,done:nutrition?r(q('#editFoodNutrition')):null,focus:document.activeElement.id,plan:focusPlans.at(-1),writes:focusWrites.length,overflow:document.documentElement.scrollWidth>innerWidth};
 },{nutrition,index});}
