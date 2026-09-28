import {pw,setup,read} from './add-flow-harness.mjs';
import {settle} from './edge-row-harness.mjs';
import {seedPhotoDiary} from './photo-close-harness.mjs';
export {pw,setup,read,settle};
export const out='artifacts/today-row-week';
export async function seed(p,{date,onlyOne=false}={}){
 if(!onlyOne)await seedPhotoDiary(p);
 await p.evaluate(({date,onlyOne})=>{
  const s=JSON.parse(localStorage.getItem('calorie-counter-state'));
  const key=date||s.selectedDate,scanned=onlyOne?[]:s.days[s.selectedDate].foods.map((f,i)=>({...f,id:'child-'+i,name:i?'Scanned food with a longer two-line description':'Scanned toast'}));
  const normal=(id,name,calories)=>({id,name,meal:'breakfast',amount:1,unit:'serving',serving:'1 serving',calories,protein:10,carbs:20,fat:5,loggedAt:key+'T02:17:00',loggedForDate:key});
  s.days={[key]:{foods:[normal('musli','Musli',471),...(onlyOne?[]:[normal('long','A longer food name with several words and a second line',1234),normal('tiny','Tea',2),...scanned])],exercises:[]}};
  s.selectedDate=key;localStorage.setItem('calorie-counter-state',JSON.stringify(s));
 },{date,onlyOne});await p.reload();await p.locator('[data-food-entry-id=musli]').waitFor();await settle(p);
 if(!onlyOne){await p.locator('.scanned-meal-toggle').tap();await settle(p);}
}
export async function rowGeometry(p){return p.locator('#foodList .entry-card').evaluateAll(rows=>rows.map(e=>{
 const surface=e.querySelector('.entry-surface'),main=e.querySelector('.entry-main'),title=main.querySelector('strong'),meta=main.querySelector('p'),action=e.querySelector('.entry-actions-toggle'),glyph=action.querySelector('span');
 const rect=e=>e.getBoundingClientRect().toJSON(),css=e=>{const s=getComputedStyle(e);return Object.fromEntries(['paddingTop','paddingBottom','minHeight','height','lineHeight','fontSize','rowGap','display','alignItems','alignSelf','borderBottomWidth','boxSizing'].map(k=>[k,s[k]]));};
 const baseline=e=>{const probe=document.createElement('span');probe.style.cssText='display:inline-block;width:0;height:0;padding:0;margin:0;vertical-align:baseline';e.append(probe);const y=probe.getBoundingClientRect().y;probe.remove();return y;};
 const t=rect(title),m=rect(meta),r=rect(e);return{id:e.dataset.foodEntryId,scanned:!!e.closest('.scanned-meal-children'),row:r,surface:rect(surface),main:rect(main),title:t,meta:m,action:rect(action),glyph:rect(glyph),kcal:rect(main.querySelector('.entry-kcal')),titleBaseline:baseline(title),metadataBaseline:baseline(meta),above:t.top-r.top,between:m.top-t.bottom,below:r.bottom-parseFloat(getComputedStyle(e).borderBottomWidth)-m.bottom,styles:{row:css(e),surface:css(surface),main:css(main),title:css(title),meta:css(meta),action:css(action)}};
}));}
