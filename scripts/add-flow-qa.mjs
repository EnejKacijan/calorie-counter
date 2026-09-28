import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {pw,out,setup,openFood,selectFood,keyboard,closeKeyboard,settle,read} from './add-flow-harness.mjs';
const results=[],geometry=[];let stage='',current;
const mark=s=>{stage=s;console.log(s);};
const value=(p,id)=>p.locator('#'+id).inputValue();
const active=p=>p.evaluate(()=>document.activeElement.id);
const count=async(p,type='foods')=>{const s=await read(p);return s.days[s.selectedDate][type].length;};
const mode=(p,name)=>p.locator('.add-flow-surface [data-add-mode='+name+']');
async function check(p,tag,{field,footer=true}={}) {
 await settle(p);
 const m=await p.evaluate(({field,tag})=>{
  const root=document.querySelector('.add-flow-surface'),content=root.querySelector('.add-flow-content'),header=root.querySelector('.add-flow-header'),foot=root.querySelector('.add-flow-footer'),rect=e=>e.getBoundingClientRect().toJSON();
  const bottom=visualViewport.offsetTop+visualViewport.height;
  return {tag,backdrop:rect(document.querySelector('.add-flow-backdrop')),clientWidth:document.documentElement.clientWidth,windowWidth:innerWidth,scrollX,root:rect(root),content:rect(content),header:rect(header),footer:!foot.hidden&&rect(foot),bottom,top:visualViewport.offsetTop,scale:visualViewport.scale,
   field:field?rect(document.getElementById(field)):null,inputs:[...root.querySelectorAll('input,select,textarea')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,font:parseFloat(getComputedStyle(e).fontSize)})),
   scrollOwners:[root,content,root.querySelector('form'),root.querySelector('#foodSuggestions')].filter(Boolean).map(e=>({id:e.id||e.className,overflow:getComputedStyle(e).overflowY})),
   background:document.querySelector('.app-shell').inert&&document.querySelector('.mobile-tabbar').inert,
   cover:[1,innerWidth/2,innerWidth-1].map(x=>[1,Math.min(innerHeight-1,bottom+20)].map(y=>{const el=document.elementFromPoint(x,y);return {x,y,id:el?.id,tag:el?.tagName,cls:el?.className,covered:Boolean(el?.closest('.add-flow-surface,.add-flow-backdrop'))};})).flat(),
   overflow:document.documentElement.scrollWidth>innerWidth,errors:qaErrors,duplicates:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,a)=>a.indexOf(id)!==i)};
 },{tag,field});geometry.push(m);
 assert.equal(m.scale,1);assert.equal(m.overflow,false,tag+' overflow');assert.equal(m.background,true,tag+' background inert');assert.ok(m.cover.every(v=>v.covered),tag+' opaque background '+JSON.stringify(m.cover));assert.equal(m.root.top,m.top);assert.ok(Math.abs(m.root.bottom-m.bottom)<1);
 assert.equal(m.scrollOwners.filter(e=>['auto','scroll'].includes(e.overflow)).length,1,tag+' one scroller');assert.deepEqual(m.errors,[]);assert.deepEqual(m.duplicates,[]);
 for(const input of m.inputs)assert.ok(input.font>=16,tag+' '+input.id+' readable');
 if(footer){assert.ok(m.footer,tag+' footer present');assert.ok(m.footer.bottom<=m.bottom+1&&m.footer.top>=m.content.bottom-1);}
 else assert.equal(m.footer,false,tag+' no browse commit');
 if(m.field)assert.ok(m.field.top>=m.content.top-1&&m.field.bottom<=m.content.bottom+1,tag+' input exposed: '+JSON.stringify(m));
 return m;
}
async function closed(p) {await settle(p);assert.equal(await p.locator('.add-flow-surface').count(),0);assert.equal(await p.evaluate(()=>document.body.style.position==='fixed'||document.querySelector('.app-shell').inert||document.body.classList.contains('modal-open')),false);}
async function manual(p,{amount='1',calories='210,5'}={}) {
 await openFood(p);await p.locator('#manualFoodShortcut').click();assert.equal(await p.locator('#foodNutritionSummary').isVisible(),false,'no duplicate manual macro summary');await p.locator('#manualFoodName').fill('QA homemade bowl');await p.locator('#foodAmount').fill(amount);
 for(const [id,v] of [['manualFoodCalories',calories],['manualFoodProtein','10,5'],['manualFoodCarbs','30'],['manualFoodFat','5']]) {await p.locator('#'+id).fill(v);await keyboard(p,360,65);await check(p,'manual '+id,{field:id});}
 await p.locator('#foodMeal').selectOption('dinner');await p.locator('#manualFoodFat').click();await p.locator('#manualFoodSubmit').click();await closed(p);await closeKeyboard(p);
}
async function journey(b,config) {
 const {c,p}=await setup(b,config);current=p;const tag=config.engine+' '+config.width+' '+config.theme;
 try {
 mark(tag+' search keyboard');await openFood(p);assert.equal(await active(p),'closeFoodModal');await check(p,tag+' browse',{footer:false});
 await selectFood(p);assert.equal(await active(p),'closeFoodModal');assert.equal(await p.locator('#foodPortionNote').textContent(),'1 serving = 32 g');await p.locator('#foodAmount').fill('0,5');await p.locator('#foodMeal').selectOption('lunch');await p.locator('#foodAmount').click();await keyboard(p);await check(p,tag+' amount keyboard',{field:'foodAmount'});
 if(config.width===390)await p.screenshot({path:out+'/portion-keyboard-'+config.engine+'-'+config.theme+'-390.png'});
 await p.locator('#manualFoodSubmit').click();await closed(p);let s=await read(p),f=s.days[s.selectedDate].foods[0];assert.equal(await count(p),1);assert.equal(f.amount,.5);assert.equal(f.unit,'serving');assert.equal(f.meal,'lunch');assert.equal(f.calories,60);assert.equal(f.brand,'QA Pantry');assert.match(await p.locator('#foodCaloriesTotal').textContent(),/60/);assert.match(await p.locator('.diary-meal-group[data-diary-meal=lunch]').textContent(),/60/);
 await closeKeyboard(p);await p.reload();await p.locator('#floatingAddButton').waitFor();assert.equal(await count(p),1);assert.deepEqual((await read(p)).days[s.selectedDate].foods[0],f);
 mark(tag+' closed keyboard and edit');await openFood(p);await selectFood(p);await p.locator('#foodAmount').fill('1.5');await closeKeyboard(p);await p.locator('#manualFoodSubmit').click();await closed(p);assert.equal(await count(p),2);
 // Diary groups sort by meal, not storage insertion order. Select the group
 // belonging to the record under test (the clock-dependent default may differ).
 const prior=(await read(p)).days[s.selectedDate].foods[0];
 const card=p.locator(`#foodList [data-diary-meal="${prior.meal}"] .entry-card`).filter({hasText:'Banana'}).first();
 await card.click();assert.equal(Number(await value(p,'foodAmount')),prior.amount);assert.equal(await value(p,'foodMeal'),prior.meal);
 await p.locator('#foodAmount').fill('2');await p.locator('#foodMeal').selectOption('breakfast');await p.locator('#manualFoodSubmit').click();await closed(p);const edited=(await read(p)).days[s.selectedDate].foods.find(e=>e.id===prior.id);assert.equal(edited.amount,2);assert.equal(edited.meal,'breakfast');assert.equal(await count(p),2);
 await p.locator('#foodList [data-diary-meal="breakfast"] .entry-card').filter({hasText:'Banana'}).first().click();const before=JSON.stringify((await read(p)).days[s.selectedDate].foods);await p.locator('#foodAmount').fill('7');await p.locator('#closeFoodModal').click();await closed(p);assert.equal(JSON.stringify((await read(p)).days[s.selectedDate].foods),before);
 assert.equal(await p.evaluate(()=>document.activeElement.closest('[data-food-entry-id]')?.dataset.foodEntryId),prior.id,'edit cancel restores focus after the inert exit, to the current rendered diary row');
 mark(tag+' manual');await manual(p);assert.equal(await count(p),3);const mf=(await read(p)).days[s.selectedDate].foods[0];assert.equal(mf.name,'QA homemade bowl');assert.equal(mf.calories,211, 'existing whole-kcal normalization');assert.equal(mf.protein,10.5);assert.equal(mf.meal,'dinner');
 mark(tag+' preserved modes');await openFood(p);await p.locator('#manualFoodName').fill('banana');await p.locator('[data-food-filter=usda]').click();await p.locator('#manualFoodName').press('Enter');await p.locator('#foodSuggestions .suggestion-card').first().waitFor();await p.waitForFunction(()=>!document.querySelector('#foodSuggestions').hasAttribute('aria-busy'));
 const names=await p.locator('#foodSuggestions .suggestion-card strong').allTextContents();await mode(p,'exercise').click();await p.locator('#exerciseMinutes').fill('25');await p.locator('#exerciseCaloriesEdit').click();await p.locator('#exerciseCalories').fill('201');await mode(p,'food').click();assert.notEqual(await active(p),'manualFoodName');assert.equal(await value(p,'manualFoodName'),'banana');assert.equal(await p.locator('[data-food-filter=usda]').getAttribute('aria-pressed'),'true');assert.deepEqual(await p.locator('#foodSuggestions .suggestion-card strong').allTextContents(),names);
 await mode(p,'exercise').click();assert.equal(await value(p,'exerciseMinutes'),'25');assert.equal(await value(p,'exerciseCalories'),'201');await p.locator('#exerciseMinutes').click();await keyboard(p,390,70);await check(p,tag+' exercise keyboard',{field:'exerciseMinutes'});await p.locator('#exerciseSubmit').click();await closed(p);await closeKeyboard(p);assert.equal(await count(p,'exercises'),1);const e=(await read(p)).days[s.selectedDate].exercises[0];assert.equal(e.minutes,25);assert.equal(e.calories,201);assert.equal(e.caloriesManual,true);
 if(config.width===390)await p.screenshot({path:out+'/diary-'+config.engine+'-'+config.theme+'-390.png'});
 results.push({tag,status:'PASS',journeys:['keyboard-open','keyboard-closed','reload','edit/cancel','manual','mode-drafts','exercise-override']});
 } catch(error) {await p.screenshot({path:out+'/matrix-failure.png'});throw error;} finally {await c.close();}
}
await mkdir(out,{recursive:true});
try{for(const engine of (process.env.ADD_QA_ENGINE?[process.env.ADD_QA_ENGINE]:['chromium','webkit'])){
 const b=await pw[engine].launch(engine==='chromium'?{channel:'msedge',headless:true}:{headless:true});
 try{for(const [width,height] of (process.env.ADD_QA_SMOKE?[[390,844]]:[[375,667],[390,844],[393,852],[430,932]]))for(const theme of (process.env.ADD_QA_THEME?[process.env.ADD_QA_THEME]:process.env.ADD_QA_SMOKE?['light']:['light','dark']))await journey(b,{engine,width,height,theme});}
 finally{await b.close();}
}}catch(error){results.push({stage,status:'FAIL',error:error.stack});console.error(error);if(current&&!current.isClosed())await current.screenshot({path:out+'/failure.png'}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(out+'/acceptance.json',JSON.stringify({results,geometry},null,2));console.log(JSON.stringify(results));}
