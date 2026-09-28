import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pw,setup,settle,out,read} from './add-flow-harness.mjs';
process.env.DISCLOSURE_HELPERS_ONLY='1';const{seed}=await import('./disclosure-reveal-qa.mjs');
await mkdir(out,{recursive:true});const results=[];
const sizes=process.env.HOVER_QUICK?[[390,844]]:[[320,667],[375,667],[390,844],[393,852],[430,932]];
export async function neutral(p){
 const data=await p.evaluate(()=>({pressed:[...document.querySelectorAll('[data-touch-pressed],.is-pressed,[data-add-pressed],[data-sheet-pressed]')].map(e=>e.id||e.className),focus:[...document.querySelectorAll('button:focus-visible,a:focus-visible,[role=button]:focus-visible,summary:focus-visible')].filter(e=>e.getClientRects().length&&!e.closest('[hidden],[inert]')&&getComputedStyle(e).outlineStyle!=='none').map(e=>e.id||e.className),hover:[...document.querySelectorAll('button:hover,a:hover,[role=button]:hover')].map(e=>({id:e.id||e.className,active:e.matches(':active'),background:getComputedStyle(e).backgroundColor,opacity:getComputedStyle(e).opacity})),errors:qaErrors,overflow:document.documentElement.scrollWidth>innerWidth}));
 assert.deepEqual(data.pressed,[]);assert.deepEqual(data.focus,[],'touch does not inherit a keyboard outline');assert.deepEqual(data.errors,[]);assert.equal(data.overflow,false);return data;
}
for(const engine of process.env.HOVER_ENGINE?.split(',')||['chromium','webkit']){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge'}:{});
 try{for(const[width,height]of sizes)for(const theme of process.env.HOVER_QUICK?['dark']:process.env.HOVER_THEME?.split(',')||['light','dark'])for(const reduce of process.env.HOVER_QUICK?[false]:process.env.HOVER_MOTION?[process.env.HOVER_MOTION==='reduce']:[false,true]){
  const tag=`${engine}-${width}-${theme}-${reduce?'reduce':'motion'}`;const {p,c}=await setup(b,{engine,width,height,theme,reduce,beforeOpen:seed,video:process.env.HOVER_RECORD==='1'});const checks=[];let stage='setup';
  try{
   await p.evaluate(()=>localStorage.setItem('calorie-counter-ai-consent-v1','{"assistant":true}'));await p.route('**/api/assistant/chat',r=>r.fulfill({json:{message:'A fixture response for interaction QA.'}}));
   const diary=await read(p);
   async function tap(selector,label=selector){
    stage=label;const e=p.locator(selector).filter({visible:true}).first();await e.scrollIntoViewIfNeeded();await settle(p);
    const paint=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return Object.fromEntries(['color','backgroundColor','borderColor','borderWidth','boxShadow','outlineStyle'].map(k=>[k,s[k]]).concat([['width',r.width],['height',r.height]]));};
    const before=await e.evaluate(paint),r=await e.boundingBox();
    // Native held touch in Chromium, controlled PointerEvent in Windows WebKit.
    // Cancel the diagnostic hold, then perform the real tap below.
    const cd=engine==='chromium'?await c.newCDPSession(p):null;
    if(cd)await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2,id:97}]});
    else await e.evaluate(el=>el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:97,isPrimary:true,button:0,clientX:el.getBoundingClientRect().x+10,clientY:el.getBoundingClientRect().y+10})));
    await p.waitForTimeout(90);const held=await e.evaluate(paint);assert.deepEqual(held,before,label+' held touch changes neither paint nor geometry');
    if(cd){await cd.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await cd.detach();}else await p.evaluate(()=>dispatchEvent(new PointerEvent('pointercancel',{pointerType:'touch',pointerId:97})));
    await e.tap();await settle(p);await p.waitForTimeout(1050);checks.push({label,heldPaintStable:true,...await neutral(p)});
   }
   await tap('.scanned-meal-toggle','scanned meal expand');assert.equal(await p.locator('.scanned-meal-toggle').first().getAttribute('aria-expanded'),'true');
   await tap('.scanned-meal-toggle','scanned meal collapse');assert.equal(await p.locator('.scanned-meal-toggle').first().getAttribute('aria-expanded'),'false');await tap('.diary-meal-heading','tap elsewhere');
   await tap('[data-food-entry-id=edit-qa] .entry-main','diary row → Edit Food');await tap('#editFoodNutrition','nutrition disclosure');await tap('#editFoodNutrition','Done');await tap('#closeFoodModal','nested Back');
   await tap('[data-food-entry-id=edit-qa] .entry-actions-toggle','overflow → sheet');await tap('#foodReuseClose','sheet Close');
   await tap('#floatingAddButton','+ → Add');await tap('.add-flow-surface [data-add-mode=exercise]','Exercise selected');assert.equal(await p.locator('.add-flow-surface [data-add-mode=exercise]').getAttribute('aria-selected'),'true');await tap('.add-flow-surface [data-add-mode=food]','Food selected');
   await tap('[data-food-filter=recent]','Recent filter');await tap('[data-food-filter=my]','Saved filter');await tap('[data-food-filter=all]','All filter');
   await tap('#foodAiDescriptionTrigger','Describe food to AI');await tap('#foodAiDescriptionBack','description Back');await tap('#manualFoodShortcut','manual action');await tap('#closeFoodModal','manual Back');
   if(await p.locator('.add-flow-host').count())await tap('#closeFoodModal','Add Close');
   await tap('.mobile-tabbar a[href="assistant.html"]','bottom nav Assistant');assert.equal(await p.locator('.mobile-tabbar [aria-current=page]').getAttribute('href'),'assistant.html');
   await tap('.assistant-starters button','Assistant starter');await tap('#assistantContextDisclosure','Diary context');await tap('#assistantContextClose','Diary context Close');await tap('#assistantHistoryOpen','History');await tap('#assistantHistoryClose','History Back');
   await tap('.mobile-tabbar a[href="progress.html"]','bottom nav Progress');await tap('#weightLogJump','Progress sheet open');await tap('#weightCancel','Progress sheet Cancel');
   await tap('[data-progress-view=nutrition]','Nutrition selected');await tap('[data-nutrition-range="30"]','30D selected');await tap('[data-nutrition-metric=macros]','Macros selected');assert.equal(await p.locator('[data-nutrition-metric=macros]').getAttribute('aria-selected'),'true');
   await tap('.mobile-tabbar a[href="profile.html"]','bottom nav Profile');await tap('[data-edit-settings=appearance]','Profile row');await tap('#profileEditBack','Profile nested Back');await tap('#profilePrivacyOpen','Profile privacy row');await tap('#profileDataBack','Profile privacy Back');
   await tap('.mobile-tabbar a[href="index.html"]','bottom nav Today');assert.deepEqual((await read(p)).days,diary.days);
   // A genuine keyboard focus remains distinct from the selected Today tab.
   stage='keyboard focus';await p.keyboard.press('Tab');await p.locator('.mobile-tabbar a[href="progress.html"]').focus();if(engine==='chromium'){await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');}assert.ok(await p.locator('.mobile-tabbar a[href="progress.html"]').evaluate(e=>e.matches(':focus-visible')&&getComputedStyle(e).outlineStyle==='solid'));assert.equal(await p.locator('.mobile-tabbar [aria-current=page]').getAttribute('href'),'index.html');checks.push({label:stage,method:engine==='webkit'?'keyboard modality + focus (Windows WebKit skips links by default; same as C2 QA)':'native Tab/Shift+Tab'});
   if(width===390&&theme==='dark')await p.screenshot({path:`${out}/${tag}.png`});
   results.push({tag,passed:true,checks});console.log('PASS',tag,checks.length);
  }catch(error){results.push({tag,passed:false,stage,error:error.stack,checks});await p.screenshot({path:`${out}/${tag}-FAIL.png`});throw error;}
  finally{const video=p.video();await c.close();if(video)await video.saveAs(`${out}/${tag}.webm`);await writeFile(out+'/results.json',JSON.stringify(results,null,2));}
 }}finally{await b.close();}
}
