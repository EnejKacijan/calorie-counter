import { pwaPhones, pwaOptions, preparePwa, preparePwaPage } from './pwa-qa-context.mjs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { food } from './fixtures/food-search.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const origin = process.env.INTAKE_URL || 'http://127.0.0.1:3002';
const output = 'artifacts/reuse';
await mkdir(output, { recursive: true });
const keys = { recent:'calorie-counter-food-library', saved:'calorie-counter-saved-foods', meals:'calorie-counter-saved-meals', state:'calorie-counter-state' };
const foods = Array.from({length:30}, (_, i) => food(`usda-reuse-${i}`, i === 29 ? 'Roasted vegetables with rice, chickpeas and a deliberately long descriptive food name for this saved portion' : `Pantry food ${String(i+1).padStart(2,'0')}`, {
  lastUsedAt: new Date(Date.UTC(2026,8,8,12,0,-i)).toISOString(), savedAt:'2026-09-01T12:00:00.000Z', lastUsedAmount:150+i, lastUsedUnit:'g',
}));
const meals = Array.from({length:15}, (_,i) => ({ id:`meal-${i}`, name: i === 14 ? 'Reusable lunch with roasted vegetables, chickpeas and a long descriptive meal name' : `Reusable meal ${String(i+1).padStart(2,'0')}`, meal:'lunch', createdAt:'2026-08-01T12:00:00.000Z', updatedAt:new Date(Date.UTC(2026,8,1,12,0,i)).toISOString(), extra:{keep:['metadata',i]}, foods:foods.slice(i,i+2).map(f=>({...f, amount:150,unit:'g',meal:'lunch'})) }));
const read = (page, key) => page.evaluate(key=>JSON.parse(localStorage.getItem(key)), keys[key] || key);
const view = async (page, value) => { await page.locator(`#foodReusePanel[data-reuse-view="${value}"]`).waitFor(); };
const action = (page, name) => page.locator(`#foodReuseContent [data-reuse-action="${name}"]`);
const results = []; let activePage, stage = '';
const mark = value => { stage = value; console.log(value); };
async function seed(page, theme, empty=false) {
  await page.goto(`${origin}/profile.html`);
  return page.evaluate(({theme,foods,meals,keys,empty})=>{
    const key = offset => {const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
    const today=key(0), yesterday=key(-1), old=key(-3);
    const entries = suffix => foods.slice(0,2).map((f,i)=>({...f,id:`diary-${suffix}-${i}`,amount:150,unit:'g',meal:i?'dinner':'lunch'}));
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem(keys.state,JSON.stringify({user:{name:'Reuse QA',age:30,sex:'male',heightCm:180,weightKg:75,targetWeightKg:70,goalType:'lose',activityMultiplier:1.375,weeklyRateKg:.5},goals:{calories:2000,protein:140,carbs:240,fat:60},days:{[today]:{foods:[],exercises:[]},[yesterday]:{foods:entries('yesterday'),exercises:[]},[old]:{foods:entries('old'),exercises:[]}},selectedDate:today,lastOpenedDate:today,progress:[],theme}));
    for (const [key,data] of [[keys.recent,foods],[keys.saved,foods],[keys.meals,meals]]) localStorage.setItem(key,JSON.stringify(empty?[]:data));
    sessionStorage.setItem('calorie-counter-today-session-v1','active');
    return {today,yesterday,old};
  },{theme,foods,meals,keys,empty});
}
async function bounds(page) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'document overflow');
  const bad = await page.locator('#foodSuggestions .suggestion-card, #foodSuggestions .reuse-food-actions, #foodReuseContent > *, #foodReuseTitle').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {text:n.textContent.slice(0,40),left:r.left,right:r.right,scroll:n.scrollWidth,client:n.clientWidth};}).filter(r=>r.left<-.5||r.right>innerWidth+.5||r.scroll>r.client+1));
  assert.deepEqual(bad,[],'reuse row overflow');
}
async function closeReuse(page) {await page.locator('#foodReuseClose').click();await page.locator('#foodReusePanel').waitFor({state:'hidden'});}
async function menu(page) {await page.locator('#foodLogOptionsButton:visible,[data-empty-food-action=reuse]').click();await view(page,'menu');}
async function openSaved(page) {await page.locator('#floatingAddButton').click();await page.locator('[data-food-filter=my]').click();}
async function settled(page) {await page.evaluate(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});}
async function drag(page, selector, distance) {
  await settled(page);const r=await page.locator(selector).boundingBox();const x=r.x+r.width/2,y=r.y+10;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+distance,{steps:8});await page.mouse.up();
}
async function shot(page, name, width, theme) {
  if(width!==390) return;
  await page.evaluate(async()=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));
  });
  await page.screenshot({path:`${output}/${name}-${theme}-390.png`});
}
try {
  for (const {width,height} of (process.env.REUSE_DESKTOP_ONLY?[]:pwaPhones.filter(p=>!process.env.INTAKE_QA_WIDTH||p.width===Number(process.env.INTAKE_QA_WIDTH)))) for (const theme of ['light','dark']) {
    mark(`${width} ${theme}: populated and read-only load`);
    const context = await browser.newContext({viewport:{width,height},hasTouch:true,serviceWorkers:'block',reducedMotion:theme==='dark'?'reduce':'no-preference',...pwaOptions(width)});
    await preparePwa(context,width); const page=await context.newPage(); activePage=page; await preparePwaPage(page);page.setDefaultTimeout(8000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push(`Unexpected dialog: ${d.message()}`);void d.dismiss();});
    await page.route('**/api/foods/search?*',r=>r.fulfill({json:{foods:[]}}));
    const dates=await seed(page,theme);await page.goto(`${origin}/index.html`);await page.locator('#floatingAddButton').waitFor();
    assert.equal(await page.locator('.saved-foods-panel').isVisible(),false);
    assert.deepEqual(await read(page,'meals'),meals); assert.deepEqual(await read(page,'saved'),foods);assert.deepEqual(await read(page,'recent'),foods);
    await page.locator('#floatingAddButton').click();await page.locator('[data-food-filter=recent]').click();
    while(await page.locator('.food-suggestions-more').count()) await page.locator('.food-suggestions-more').click();
    assert.equal(await page.locator('#foodSuggestions .suggestion-card').count(),30);
    await bounds(page); await page.locator('#foodSection').evaluate(e=>e.scrollTop=0);await shot(page,'recent',width,theme);
    const firstRow = ()=>page.locator('#foodSuggestions .reuse-food-row').filter({has:page.locator('strong',{hasText:/^Pantry food 01$/})});
    await firstRow().locator('.suggestion-card').click();assert.equal(await page.locator('#foodAmount').inputValue(),'150');assert.equal(await page.locator('#foodUnit').inputValue(),'g');
    assert.equal((await read(page,'state')).days[dates.today].foods.length,0);assert.deepEqual(await read(page,'recent'),foods);await page.locator('#closeFoodModal').click();
    mark(`${width} ${theme}: Save/Unsave + Recent Undo`);
    await firstRow().locator('.reuse-food-overflow').click();await page.locator('[data-recent-action=save]').click();assert.equal((await read(page,'saved')).length,29);
    await firstRow().locator('.reuse-food-overflow').click();assert.equal(await page.locator('[data-recent-action=save] strong').textContent(),'Save');await closeReuse(page);
    await page.locator('[data-food-filter=my]').click();assert.equal(await page.locator('#foodSuggestions .suggestion-card strong').filter({hasText:/^Pantry food 01$/}).count(),0);
    await page.locator('[data-food-filter=recent]').click();await firstRow().locator('.reuse-food-overflow').click();await page.locator('[data-recent-action=save]').click();assert.equal((await read(page,'saved')).length,30);
    await firstRow().locator('.reuse-food-overflow').click();await page.locator('[data-recent-action=remove]').click();assert.equal((await read(page,'recent')).length,29);
    await page.locator('#undoToast button').click();assert.equal((await read(page,'recent')).length,30);assert.equal((await read(page,'recent'))[0].lastUsedAmount,150);
    assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('suggestion-card')),true);
    const savedStart=performance.now();await page.locator('[data-food-filter=my]').click();assert.equal(await page.locator('#foodSuggestions .suggestion-card').count(),30);assert.equal(await page.locator('#foodSuggestions .saved-meal-card').count(),15);const savedRenderMs=Math.round(performance.now()-savedStart);assert.ok(savedRenderMs<2000,`large collection took ${savedRenderMs} ms`);
    await page.locator('#foodSuggestions .reuse-food-row').first().scrollIntoViewIfNeeded();await shot(page,'saved-foods',width,theme);
    await page.locator('#foodSuggestions .reuse-food-row').last().scrollIntoViewIfNeeded();await bounds(page);await shot(page,'large-collection',width,theme);
    const mealInAdd = ()=>page.locator('#foodSuggestions [data-saved-meal-id="meal-0"]');
    await mealInAdd().click();await view(page,'saved-meal-review');
    assert.match(await page.locator('.saved-meal-review-summary').textContent(),/2 foods.*200 kcal/);await page.locator('[data-saved-meal-target]').selectOption('dinner');
    await shot(page,'saved-meal-review',width,theme);
    mark(`${width} ${theme}: nested rename, blank, Cancel, one Save, keyboard`);
    await page.evaluate(key=>{window.__mealWrites=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)window.__mealWrites++;return original.call(this,k,v);};},keys.meals);
    await action(page,'rename-saved-meal').click();await view(page,'rename-saved-meal');
    const name=page.locator('#foodReuseContent [name=mealName]');assert.equal(await name.inputValue(),meals[0].name);assert.equal(await name.evaluate(e=>e===document.activeElement),true);
    await shot(page,'saved-meal-rename',width,theme);await name.fill('   ');await page.locator('[data-reuse-rename-form] button[type=submit]').click();assert.equal(await name.getAttribute('aria-invalid'),'true');assert.match(await page.locator('#foodReuseStatus').textContent(),/Enter a meal name/);
    await name.fill('Discard this');await action(page,'cancel-rename-saved-meal').click();assert.equal(await page.evaluate(()=>window.__mealWrites),0);assert.equal(await page.locator('[data-saved-meal-target]').inputValue(),'dinner');
    await action(page,'rename-saved-meal').click();await page.setViewportSize({width,height:480});await name.focus();
    for(const selector of ['[name=mealName]','[data-reuse-action=cancel-rename-saved-meal]','button[type=submit]']) {
      const field=page.locator(`#foodReuseContent ${selector}`);await field.scrollIntoViewIfNeeded();const box=await field.boundingBox();const inset=await page.locator('#foodReusePanel').evaluate(e=>parseFloat(getComputedStyle(e).paddingBottom)||0);assert.ok(box.y>=0&&box.y+box.height<=480-inset+1,`keyboard action clipped ${selector}: ${JSON.stringify({box,inset})}`);
    }
    await shot(page,'keyboard-rename',width,theme);await name.fill('  Renamed reusable meal  ');await page.locator('[data-reuse-rename-form] button[type=submit]').click();await view(page,'saved-meal-review');assert.equal(await page.evaluate(()=>window.__mealWrites),1);
    const renamed=await read(page,'meals');assert.equal(renamed[0].name,'Renamed reusable meal');assert.deepEqual(renamed[0].foods,meals[0].foods);assert.deepEqual(renamed[0].extra,meals[0].extra);assert.deepEqual(renamed.map(m=>m.id),meals.map(m=>m.id));
    await page.setViewportSize({width,height});await page.locator('#foodReuseBack').click();await page.locator('#foodReusePanel').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.savedMealId),'meal-0');assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
    await page.locator('#closeFoodModal').click();await settled(page);assert.notEqual(await page.evaluate(()=>document.body.style.position),'fixed');
    mark(`${width} ${theme}: Saved Meals list + Back/Escape hierarchy + Undo`);
    await menu(page);await shot(page,'reuse-copy',width,theme);await action(page,'saved-meals').click();await view(page,'saved-meals');assert.equal(await page.locator('#foodReuseContent .saved-meal-card').count(),15);await shot(page,'saved-meals',width,theme);
    await page.locator('#foodReuseContent [data-saved-meal-id="meal-14"]').click();await bounds(page);await closeReuse(page);
    await menu(page);await action(page,'saved-meals').click();await page.locator('#foodReuseContent [data-saved-meal-id="meal-0"]').click();await action(page,'rename-saved-meal').click();await name.fill('Escape discards');
    await page.keyboard.press('Escape');await view(page,'saved-meal-review');await page.keyboard.press('Escape');await view(page,'saved-meals');assert.equal(await page.evaluate(()=>document.activeElement.dataset.savedMealId),'meal-0');
    await page.locator('#foodReuseContent [data-saved-meal-id="meal-0"]').click();await action(page,'delete-saved-meal').click();await view(page,'saved-meals');assert.equal((await read(page,'meals')).length,14);
    await page.locator('#undoToast button').click();assert.deepEqual(await read(page,'meals'),renamed);
    await page.keyboard.press('Escape');await view(page,'menu');await page.keyboard.press('Escape');await page.locator('#foodReusePanel').waitFor({state:'hidden'});assert.equal(await page.locator('#foodLogOptionsButton:visible,[data-empty-food-action=reuse]').evaluate(e=>e===document.activeElement),true);assert.notEqual(await page.evaluate(()=>document.body.style.position),'fixed');
    mark(`${width} ${theme}: sheet scroll/handle and nested Undo focus, persistence failure`);
    await menu(page);await action(page,'saved-meals').click();await settled(page);
    await page.locator('#foodReuseContent').evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await page.locator('#foodReuseContent').evaluate(e=>e.scrollTop>0));
    await drag(page,'#foodReuseContent',90);assert.equal(await page.locator('#foodReusePanel').isVisible(),true);
    await drag(page,'#foodReuseDragZone',110);await page.locator('#foodReusePanel').waitFor({state:'hidden'});assert.notEqual(await page.evaluate(()=>document.body.style.position),'fixed');
    await openSaved(page);await mealInAdd().click();await action(page,'delete-saved-meal').click();await page.locator('#foodReusePanel').waitFor({state:'hidden'});assert.equal((await read(page,'meals')).length,14);await page.locator('#undoToast button').focus();await page.keyboard.press('Enter');assert.deepEqual(await read(page,'meals'),renamed);assert.equal(await page.locator('[data-food-filter=my]').getAttribute('aria-pressed'),'true');
    await mealInAdd().click();await action(page,'rename-saved-meal').click();
    await page.evaluate(key=>{const original=Storage.prototype.setItem;window.__restoreQuota=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Synthetic quota failure','QuotaExceededError');return original.call(this,k,v);};},keys.meals);
    await name.fill('Failed rename draft');await page.locator('[data-reuse-rename-form] button[type=submit]').click();assert.match(await page.locator('#foodReuseStatus').textContent(),/could not be renamed/);assert.equal(await name.inputValue(),'Failed rename draft');assert.deepEqual(await read(page,'meals'),renamed);await page.evaluate(()=>window.__restoreQuota());await page.keyboard.press('Escape');await view(page,'saved-meal-review');await closeReuse(page);await page.locator('#closeFoodModal').click();await settled(page);assert.notEqual(await page.evaluate(()=>document.body.style.position),'fixed');
    mark(`${width} ${theme}: insert twice, edit independent copy`);
    const savedSnapshot=await read(page,'saved');
    for(let i=0;i<2;i++){await openSaved(page);await mealInAdd().click();await page.locator('[data-saved-meal-target]').selectOption('dinner');await action(page,'add-saved-meal').click();await page.locator('#foodReusePanel').waitFor({state:'hidden'});}
    let diary=(await read(page,'state')).days[dates.today].foods;assert.equal(diary.length,4);assert.equal(new Set(diary.map(f=>f.id)).size,4);assert.ok(diary.every(f=>f.meal==='dinner'));assert.deepEqual(await read(page,'meals'),renamed);assert.deepEqual(await read(page,'saved'),savedSnapshot);
    const beforeEdit=structuredClone(diary);await page.locator('#foodList .entry-card').first().click();await page.locator('#foodAmount').fill('300');await page.locator('#manualFoodSubmit').click();
    diary=(await read(page,'state')).days[dates.today].foods;assert.equal(diary[0].amount,300);assert.deepEqual(diary.slice(1),beforeEdit.slice(1));assert.deepEqual(await read(page,'meals'),renamed);assert.deepEqual(await read(page,'saved'),savedSnapshot);
    mark(`${width} ${theme}: repeat yesterday, copy day/meal, save meal`);
    const sourceDays=(await read(page,'state')).days;let count=diary.length;
    for(const [kind,addCount] of [['repeat-yesterday',2],['repeat-meal',1],['copy-date',2],['copy-meal',1]]) {
      await menu(page);await action(page,kind==='copy-meal'?'copy-date':kind).click();
      if(kind==='repeat-meal')await action(page,'copy-meal').first().click();
      if(kind==='copy-date'||kind==='copy-meal'){await page.locator('[data-reuse-source-date]').fill(dates.old);await page.locator('[data-reuse-source-date]').dispatchEvent('change');await action(page,kind==='copy-date'?'copy-day':'copy-meal').first().click();}
      await page.locator('#foodReusePanel').waitFor({state:'hidden'});count+=addCount;const s=await read(page,'state');assert.equal(s.days[dates.today].foods.length,count);assert.deepEqual(s.days[dates.yesterday],sourceDays[dates.yesterday]);assert.deepEqual(s.days[dates.old],sourceDays[dates.old]);assert.equal(new Set(s.days[dates.today].foods.map(f=>f.id)).size,count);
    }
    await menu(page);await action(page,'save-meal-picker').click();await action(page,'name-saved-meal').first().click();await page.locator('#foodReuseContent [name=mealName]').fill('New reusable snapshot');await page.locator('[data-reuse-save-form] button[type=submit]').click();await page.locator('#foodReusePanel').waitFor({state:'hidden'});assert.equal((await read(page,'meals')).length,16);
    await page.reload();await page.locator('#floatingAddButton').waitFor();const afterReload=await read(page,'meals');assert.equal(afterReload.find(m=>m.id==='meal-0').name,renamed[0].name);assert.deepEqual(afterReload.filter(m=>m.id.startsWith('meal-')).map(m=>m.id),meals.map(m=>m.id));
    assert.deepEqual(errors,[]);results.push({width,height,theme,case:'populated-large-reuse',status:'PASS',recent:30,savedFoods:30,savedMeals:15,savedRenderMs});
    mark(`${width} ${theme}: empty collections`);
    await seed(page,theme,true);await page.goto(`${origin}/index.html`);await openSaved(page);assert.match(await page.locator('#foodSuggestions').textContent(),/Foods you explicitly save/);await page.locator('[data-reuse-search]').click();assert.equal(await page.locator('[data-food-filter=all]').getAttribute('aria-pressed'),'true');await page.locator('[data-food-filter=recent]').click();assert.match(await page.locator('#foodSuggestions').textContent(),/Recently logged foods/);await page.locator('#closeFoodModal').click();await menu(page);await action(page,'saved-meals').click();assert.match(await page.locator('#foodReuseContent').textContent(),/Meals you save for reuse/);await closeReuse(page);assert.notEqual(await page.evaluate(()=>document.body.style.position),'fixed');
    assert.deepEqual(errors,[]);results.push({width,height,theme,case:'empty',status:'PASS'});await context.close();
  }
  if (!process.env.INTAKE_QA_WIDTH) {
    mark('1440 desktop: reuse regression');
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});const page=await context.newPage();activePage=page;const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await seed(page,'light');await page.goto(`${origin}/index.html`);await page.locator('#foodLogOptionsButton:visible,[data-empty-food-action=reuse]').waitFor();
    assert.equal(await page.locator('.saved-foods-panel').evaluate(e=>{const before=getComputedStyle(e).display;document.querySelector('link[href^="food-reuse.css"]').disabled=true;const old=getComputedStyle(e).display;document.querySelector('link[href^="food-reuse.css"]').disabled=false;return before===old;}),true,'desktop library display changed');
    // Re-enabling this stylesheet can asynchronously reattach it. Do not
    // click the empty-day entry point while its hidden-header rule is absent.
    await page.locator('#foodLogOptionsButton').waitFor({state:'hidden'});
    for(const collapse of [false,true]){if(collapse)await page.locator('#sidebarToggle').click();await menu(page);await bounds(page);await closeReuse(page);}
    await menu(page);await action(page,'saved-meals').click();await page.locator('#foodReuseContent [data-saved-meal-id="meal-0"]').click();await action(page,'rename-saved-meal').click();await page.locator('#foodReuseContent [name=mealName]').fill('Desktop regression');await page.locator('[data-reuse-rename-form] button[type=submit]').click();await action(page,'add-saved-meal').click();assert.equal((await read(page,'meals'))[0].name,'Desktop regression');await bounds(page);assert.deepEqual(errors,[]);results.push({width:1440,height:1000,theme:'light',case:'desktop-regression',status:'PASS'});await context.close();
  }
  await writeFile(`${output}/results.json`,JSON.stringify({results},null,2));console.log(JSON.stringify({passed:results.length,results}));
} catch(error) {
  if(activePage&&!activePage.isClosed()) {await activePage.screenshot({path:`${output}/failure.png`});await writeFile(`${output}/failure.html`,await activePage.content());}
  await writeFile(`${output}/failure.json`,JSON.stringify({stage,error:error.stack,results},null,2));throw error;
} finally {await browser.close();}
