import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { pwaPhones, preparePwa, preparePwaPage } from "./pwa-qa-context.mjs";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = process.env.INTAKE_URL || "http://127.0.0.1:3001";
const output = "artifacts/progress";
mkdirSync(output, { recursive: true });
const results = [];
async function seed(context, theme, mode = "partial", goalType = "maintain") {
  await context.addInitScript(({theme,mode,goalType}) => {
    if (sessionStorage.getItem("progress-qa-seeded")) return;
    sessionStorage.setItem("progress-qa-seeded", "true");
    const date = offset => { const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
    const days = {};
    if (mode !== "empty") for (let i=0;i<65;i++) if (mode === "full" || i%2===0) days[date(-i)]={ foods:[{id:`f-${i}`,name:"Long food "+"ingredients".repeat(25),amount:150,unit:"g",meal:"lunch",calories: i<30 ? 2200 : 1700,protein:120,carbs:250,fat:70}], exercises:[{id:`e-${i}`,name:"Walking",calories:200}] };
    localStorage.setItem("calorie-counter-state", JSON.stringify({user:{name:"Progress QA",age:30,sex:"male",heightCm:180,weightKg:80,targetWeightKg:75,goalType,theme},theme,goals:{calories:2000,protein:140,carbs:240,fat:60}, days, progress: mode === "empty" ? [] : [{id:"old",date:date(-35),weightKg:83},{id:"earlier",date:date(-4),weightKg:81},{id:"latest",date:date(-1),weightKg:80}] }));
    sessionStorage.setItem("progress-qa-dates",JSON.stringify({today:date(0),earlier:date(-4),latest:date(-1),move:date(-2),old:date(-35)}));
  },{theme,mode,goalType});
}
async function bounds(page, selectors = []) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"horizontal overflow");
  const weightLabels=await page.evaluate(()=>{
    if(document.querySelector('#weightProgressView').hidden) return [];
    return [...document.querySelectorAll('.weight-chart-axis span')].map(el=>{const range=document.createRange();range.selectNodeContents(el); const r=range.getBoundingClientRect();return {left:r.left,right:r.right,text:el.textContent};});
  });
  for(let i=1;i<weightLabels.length;i++) assert.ok(weightLabels[i-1].right<=weightLabels[i].left,`overlapping weight labels ${JSON.stringify(weightLabels)}`);
  for(const selector of selectors) {
    const el=page.locator(selector), inSheet=await el.evaluate(el=>Boolean(el.closest('#weightSheet')));
    if(!inSheet)await el.evaluate(el => el.scrollIntoView({block:"center",behavior:"instant"}));
    const r=await el.boundingBox(), nav=inSheet?null:await page.locator(".mobile-tabbar").boundingBox();
    assert.ok(r && r.x>=-1 && r.x+r.width<=page.viewportSize().width+1,`${selector} horizontal clipping: ${JSON.stringify(r)}`);
    assert.ok(r.y>=-1 && r.y+r.height <= (nav?.y ?? page.viewportSize().height)+1,`${selector} covered/unreachable: ${JSON.stringify({r,nav})}`);
  }
}
async function chartGeometry(page) {
  const geometry = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,text:el.textContent}; };
    return {labels:[...document.querySelectorAll('#nutritionChart .nutrition-axis-label')].map(rect), bars:[...document.querySelectorAll('#nutritionChart .nutrition-macro-bar')].map(rect)};
  });
  for(let i=1;i<geometry.labels.length;i++) assert.ok(geometry.labels[i-1].right<=geometry.labels[i].left,`overlapping chart labels ${JSON.stringify(geometry.labels)}`);
  for(let i=3;i<geometry.bars.length;i+=3) assert.ok(geometry.bars[i-1].right<=geometry.bars[i].left,`overlapping macro day groups ${JSON.stringify(geometry.bars.slice(i-1,i+1))}`);
}
try {
  for(const viewport of (process.env.PROGRESS_QA_WIDTH ? pwaPhones.filter(v=>v.width===Number(process.env.PROGRESS_QA_WIDTH)) : pwaPhones)) for(const theme of ["light","dark"]) {
    const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,colorScheme:theme,reducedMotion:"reduce",serviceWorkers:"block"});
    await preparePwa(context,viewport.width); await seed(context,theme,"partial",["lose","maintain","gain"][results.length%3]);
    const page=await context.newPage(); await preparePwaPage(page); page.setDefaultTimeout(8000);
    // Keep fixture and assertions on the same day if this suite spans midnight.
    await page.clock.setFixedTime(new Date());
    if(process.env.PROGRESS_QA_BASELINE_ROUTER) await page.route('**/app-router.js*',route=>route.fulfill({path:process.env.PROGRESS_QA_BASELINE_ROUTER,contentType:'text/javascript'}));
    const errors=[]; page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>{errors.push(d.message());void d.dismiss();});
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("calorie-counter-state")));
    await page.goto(`${base}/progress.html`); await page.locator("[data-edit-weight=latest]").waitFor();
    const dates=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("progress-qa-dates")));
    const shot=async name=>{ if(viewport.width===390) await page.screenshot({path:`${output}/${name}-${theme}-390.png`}); };
    await bounds(page); await shot("weight");
    const chart=await page.locator("#progressChart").innerHTML();
    const original=await read();
    await page.locator("[data-edit-weight=latest]").click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),"progressWeight");
    await page.locator("#progressWeight").fill("79,5"); await bounds(page,["#progressDate","#progressWeight","#weightSave","#weightCancel"]); await shot("edit-weight");
    await page.locator("#weightCancel").click(); assert.deepEqual(await read(),original);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.editWeight),'latest');
    await page.evaluate(()=>{ window.qaWeightChart = document.querySelector('#progressChart svg'); dispatchEvent(new Event('resize')); });
    await page.waitForFunction(()=>!window.qaWeightChart.isConnected);
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.editWeight),'latest','resize retains restored focus');
    await page.locator("[data-edit-weight=latest]").press("Enter"); await page.locator("#progressDate").fill(dates.earlier);
    assert.equal(await page.locator("#progressWeight").inputValue(),"81"); assert.equal(await page.locator("#weightSave").textContent(),"Update weight"); assert.deepEqual(await read(),original);
    await page.locator("#progressDate").fill(dates.latest); await page.locator("#progressWeight").fill("79,5");
    await page.setViewportSize({width:viewport.width,height:480});
    await bounds(page,["#progressDate","#progressWeight","#weightSave","#weightCancel"]);
    await page.locator("#weightSave").click();
    let saved=await read(); assert.equal(saved.progress.length,3); assert.equal(saved.progress.find(e=>e.id==="latest").date,dates.latest);
    assert.equal(saved.progress.find(e=>e.id==="latest").weightKg,79.5); assert.equal(saved.user.weightKg,79.5); assert.deepEqual(saved.goals,original.goals);
    assert.equal(await page.locator("#currentWeightValue").textContent(),"79.5"); assert.notEqual(await page.locator("#progressChart").innerHTML(),chart);
    await page.setViewportSize(viewport);
    await page.locator("[data-delete-weight=latest]").click(); assert.equal((await read()).progress.length,2); assert.equal(await page.locator("#currentWeightValue").textContent(),"81");
    await bounds(page,["#weightUndoToast button"]); await page.locator("#weightUndoToast button").click();
    assert.equal((await read()).progress.length,3); assert.equal(await page.locator("#currentWeightValue").textContent(),"79.5");
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.editWeight),'latest');
    await page.locator("[data-edit-weight=latest]").click(); await page.keyboard.press("Escape"); assert.equal(await page.locator("#weightCancel").isVisible(),false);
    const beforeBack=await read();
    await page.locator("[data-edit-weight=latest]").click(); await page.locator("#progressWeight").fill("70");
    // Modal background/navigation is intentionally inert. Exercise the same
    // route leave guard as browser Back instead of clicking a hidden nav link.
    await page.evaluate(()=>IntakeNavigate('index.html'));
    assert.match(page.url(),/progress.html/); assert.equal(await page.locator("#weightCancel").isVisible(),false); assert.deepEqual(await read(),beforeBack);
    await page.locator("#weightLogJump").click(); await page.locator("#progressDate").fill(dates.today); await page.locator("#progressWeight").fill("79"); await page.locator("#weightSave").click();
    assert.equal((await read()).progress.length,4);
    for(const range of [7,30]) {await page.locator(`[data-weight-range="${range}"]`).click(); await page.locator("#weightPreviousPeriod").click(); await bounds(page,["#weightPreviousPeriod","#weightNextPeriod"]); await page.locator("#weightNextPeriod").click();}
    await page.locator('[data-progress-view="nutrition"]').click();
    for(const range of [7,30]) {
      await page.locator(`[data-nutrition-range="${range}"]`).click();
      for(const metric of ["calories","net","macros"]) {
        await page.locator(`[data-nutrition-metric="${metric}"]`).click(); await bounds(page);
        await chartGeometry(page);
        assert.equal(await page.locator("#nutritionLoggedDays").textContent(),`${range===7?4:15}/${range}`);
        assert.equal(await page.locator("#nutritionSummaryValue1").textContent(),metric==="macros"?"120 g":metric==="net"?"2,000 kcal":"2,200 kcal");
        if(metric!=="macros") assert.equal(await page.locator("#nutritionSummaryValue3").textContent(),metric==="net"?"On target":"200 kcal over");
        // press() focuses immediately, unlike click()'s layout stability wait.
        // Let the existing 80/120 ms resize redraw finish before testing keyboard
        // activation on the settled chart; do not retry or weaken the assertion.
        await page.waitForFunction(()=>{
          const svg=document.querySelector('#nutritionChart svg'),now=performance.now();
          if(!svg)return false;
          if(window.progressQaStableChart?.svg!==svg){window.progressQaStableChart={svg,since:now};return false;}
          return now-window.progressQaStableChart.since>=160;
        });
        const day=page.locator("[data-nutrition-date]").nth(1);
        if(process.env.PROGRESS_QA_DIAGNOSTICS) await page.evaluate(()=>{
          window.progressQaEvents=[];
          if(window.progressQaTracing)return;window.progressQaTracing=true;
          for(const type of ['focusin','keydown','keyup']) document.addEventListener(type,event=>window.progressQaEvents.push({type,key:event.key,target:event.target.dataset?.nutritionDate||event.target.id||event.target.tagName,at:performance.now()}),true);
          new MutationObserver(()=>window.progressQaEvents.push({type:'chart redraw',focus:document.activeElement.dataset?.nutritionDate||document.activeElement.id||document.activeElement.tagName,at:performance.now()})).observe(document.querySelector('#nutritionChart'),{childList:true});
        });
        await day.press("Enter");
        if(await day.getAttribute('aria-pressed')!=='true') console.log('Selection diagnostic',JSON.stringify({viewport,theme,range,metric,events:await page.evaluate(()=>window.progressQaEvents||[])}));
        assert.equal(await day.getAttribute("aria-pressed"),"true");
        const dayKey=await page.locator('[data-nutrition-date]').first().getAttribute('data-nutrition-date');
        await page.locator('#nutritionChartDetailDate').selectOption(dayKey);
        assert.equal(await page.locator('[data-nutrition-date]').first().getAttribute('aria-pressed'),'true');
        await bounds(page,['#nutritionChartDetailDate']); assert.ok((await page.locator('#nutritionChartDetailDate').boundingBox()).height>=44);
        await bounds(page,["#nutritionPreviousRange","#nutritionNextRange"]);
        if(range===7 && metric!=="net") { await page.evaluate(()=>scrollTo(0,0)); await shot(`nutrition-${metric}`); await page.locator(".nutrition-summary-panel").evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'})); await shot(`summary-${metric}`); }
        await page.locator("#nutritionPreviousRange").click(); await bounds(page); await page.locator("#nutritionNextRange").click();
      }
    }
    await page.locator('[data-nutrition-metric="calories"]').click(); await page.locator("#nutritionPreviousRange").click();
    assert.equal(await page.locator("#nutritionSummaryValue1").textContent(),"1,700 kcal");
    for(let i=0;i<3;i++) await page.locator("#nutritionPreviousRange").click();
    assert.equal(await page.locator("#nutritionSummaryValue1").textContent(),"—"); assert.equal(await page.locator("#nutritionInsightText").textContent(),"No food logged in this range yet.");
    await page.reload(); await page.locator("#nutritionChart svg").waitFor({state:"attached"}); assert.equal((await read()).progress.length,4);
    assert.deepEqual(errors,[]);
    results.push({...viewport,theme,result:"PASS",checks:"partial/historical/empty ranges, 7/30, all metrics, selected day, weight date selection/update/cancel/add/delete/Undo, chart/latest refresh, keyboard 480, safe insets"});
    console.log(`PASS Progress ${viewport.width}x${viewport.height} ${theme}`); await context.close();
  }
  for(const viewport of pwaPhones) for(const theme of ['light','dark']) for(const mode of ["empty","full"]) {
    const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,serviceWorkers:"block",reducedMotion:'reduce'}); await preparePwa(context,viewport.width); await seed(context,theme,mode);
    const page=await context.newPage(); await preparePwaPage(page); await page.goto(`${base}/progress.html`); await page.locator("#progressChart svg").waitFor({state:"attached"});
    if(mode==="empty") assert.equal(await page.locator(".weight-chart-empty").isVisible(),true);
    for(const range of [7,30]) {await page.locator(`[data-weight-range="${range}"]`).click(); await bounds(page,["#weightPreviousPeriod","#weightNextPeriod"]);}
    await page.locator('[data-progress-view="nutrition"]').click();
    for(const range of [7,30]) { await page.locator(`[data-nutrition-range="${range}"]`).click(); assert.equal(await page.locator("#nutritionLoggedDays").textContent(),`${mode==="empty"?0:range}/${range}`);
      for(const metric of ['calories','net','macros']) {await page.locator(`[data-nutrition-metric="${metric}"]`).click(); await chartGeometry(page); await bounds(page);}
    }
    results.push({...viewport,theme,mode,result:"PASS"}); await context.close();
  }
  const desktop=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:"block"}); await seed(desktop,"light");
  const page=await desktop.newPage(); await page.goto(`${base}/progress.html`); await page.locator("[data-edit-weight=latest]").click(); await page.locator("#progressWeight").fill("79"); await page.locator("#weightSave").click();
  assert.equal(await page.locator("#currentWeightValue").textContent(),"79"); await page.locator('[data-progress-view="nutrition"]').click(); await bounds(page); await page.locator('.side-nav a[href="assistant.html"]').click(); await page.locator("#assistantTitle").waitFor({state:"visible"});
  await desktop.close(); results.push({desktop:"regression only",result:"PASS"});
  const offline=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); await preparePwa(offline,390); await seed(offline,'light');
  const offlinePage=await offline.newPage(); await preparePwaPage(offlinePage); const offlineErrors=[]; offlinePage.on('pageerror',error=>offlineErrors.push(error.message));
  await offlinePage.goto(`${base}/progress.html`); await offlinePage.evaluate(()=>navigator.serviceWorker.ready); await offlinePage.reload(); await offlinePage.locator('[data-edit-weight=latest]').waitFor();
  await offline.setOffline(true); await offlinePage.reload(); await offlinePage.locator('[data-edit-weight=latest]').click();
  assert.equal(await offlinePage.locator('#weightCancel').isVisible(),true);
  assert.ok(parseFloat(await offlinePage.locator('#progressWeight').evaluate(el=>getComputedStyle(el).fontSize))>=16);
  await offlinePage.locator('#progressWeight').fill('79'); await offlinePage.locator('#weightSave').click();
  assert.equal(await offlinePage.locator('#currentWeightValue').textContent(),'79');
  await offlinePage.locator('[data-progress-view=nutrition]').click(); assert.equal(await offlinePage.locator('#nutritionSummaryValue3').textContent(),'200 kcal over');
  assert.deepEqual(offlineErrors,[]); await offline.close(); results.push({offline:'cold Progress reload/edit/new CSS and nutrition summary',result:'PASS'});
  writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));
  console.log(`PASS ${results.length} Progress scenarios (24 phone/theme/data combinations, desktop regression, offline cold reload).`);
} finally {await browser.close();}
