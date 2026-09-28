import { qaWidths, qaHeight, qaOutput, pwaOptions, preparePwa, preparePwaPage, pwaAudit } from "./pwa-qa-context.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const origin = process.env.INTAKE_URL || "http://127.0.0.1:3001";
const output = qaOutput("today-diary");
await mkdir(output, { recursive: true });
const results = [];
const read = page => page.evaluate(() => JSON.parse(localStorage.getItem("calorie-counter-state")));
async function seed(page, theme, logged = false) {
  await page.evaluate(({ theme, logged }) => {
    const dateKey = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
    const today = dateKey(0);
    const food = (id, name, meal, calories, hour) => ({ id, name, meal, calories, protein: 10, carbs: 20, fat: 5, amount: 1, unit: "serving", serving: "1 serving", source: "USDA", catalogId: id, loggedAt: `${today}T${hour}:00:00`, loggedForDate: today });
    const foods = logged ? [food("d", "Vegetable pasta", "dinner", 450, "19"), food("b1", "Oats and yogurt", "breakfast", 100, "08"), food("l", "Rice bowl", "lunch", 300, "13"), food("b2", "Fresh berries", "breakfast", 50, "08"), food("s", "Long food name " + "mixednuts".repeat(25), "snack", 90, "16"), food("u", "Unclassified food", "unknown", 70, "17")] : [];
    const previous = dateKey(-2);
    window.qaDates = { today, previous, empty: dateKey(-1) };
    localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "Diary QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 70, goalType: "lose", activityMultiplier: 1.375, weeklyRateKg: .5, mealSchedule: { breakfastEnd: "09:00", lunchEnd: "14:00" } }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: { [today]: { foods, exercises: logged ? [{ id: "exercise", name: "Walking", minutes: 20, calories: 80 }] : [] }, [previous]: { foods: [food("old", "Previous rice", "lunch", 200, "13")], exercises: [] } }, selectedDate: today, lastOpenedDate: today, progress: [], theme }));
    sessionStorage.setItem("calorie-counter-today-session-v1", "active");
  }, { theme, logged });
  // Session data for assertions survives reload, without changing the application.
  const dates = await page.evaluate(() => qaDates);
  await page.goto(`${origin}/index.html`); await page.locator("#foodList").waitFor();
  return dates;
}
async function bounds(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "page overflow");
  const cards = await page.locator("#foodList .entry-card").evaluateAll(elements => elements.map(el => {
    const row = el.getBoundingClientRect(), kcal = el.querySelector('.entry-kcal').getBoundingClientRect();
    return { rowRight: row.right, kcalRight: kcal.right, kcalLeft: kcal.left, rowLeft: row.left, width: innerWidth };
  }));
  for (const r of cards) assert.ok(r.kcalRight <= r.rowRight + 1 && r.kcalLeft >= r.rowLeft && r.rowRight <= r.width, "row kcal clipped");
}
async function diaryShot(page, name) {
  await page.locator('#foodSection .logged-list-heading').evaluate(el => el.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.screenshot({ path: `${output}/${name}.png` });
}
async function swipe(card, direction) {
  const start = direction === "right" ? 70 : 200, end = direction === "right" ? 165 : 105;
  for (const [type, x] of [["pointerdown", start], ["pointermove", end], ["pointerup", end]]) await card.dispatchEvent(type, { pointerType: "touch", pointerId: 5, isPrimary: true, clientX: x, clientY: 200, button: 0, bubbles: true });
}
try {
  for (const width of qaWidths()) for (const theme of ["light", "dark"]) {
    const motion = theme === "light" ? "no-preference" : "reduce";
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, reducedMotion: motion, serviceWorkers: "block", ...pwaOptions(width) });
    await preparePwa(context, width);
    await context.addInitScript(() => { Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { throw Error("Synthetic QA camera unavailable"); } } }); });
    const page = await context.newPage(); await preparePwaPage(page); page.setDefaultTimeout(8000);
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", dialog => { errors.push(`Unexpected confirmation: ${dialog.message()}`); void dialog.dismiss(); });
    await page.goto(`${origin}/profile.html`);
    // Seed synthetic local data only in this isolated test context.
    let dates = await seed(page, theme);
    await page.goto(`${origin}/index.html`); await page.locator("#foodList .diary-empty").waitFor();
    assert.equal(await page.locator("#foodList .diary-empty p").innerText(), 'No food logged.');
    assert.equal(await page.locator(".diary-meal-group").count(), 0);
    for (const action of ["add", "scan", "reuse"]) assert.ok((await page.locator(`[data-empty-food-action=${action}]`).boundingBox()).height >= 44);
    assert.equal(await page.locator('#foodLogOptionsButton').isVisible(),false);
    assert.equal(await page.locator('[data-empty-food-action=reuse]').count(),1);
    await bounds(page);
    const emptyActions = await page.evaluate(() => {
      const fab=document.querySelector('#floatingAddButton').getBoundingClientRect();
      const nav=document.querySelector('.mobile-tabbar').getBoundingClientRect();
      return [...document.querySelectorAll('[data-empty-food-action]')].map(button=>{
        const r=button.getBoundingClientRect();
        return {action:button.dataset.emptyFoodAction,visibleAboveNav:r.top<nav.top,
          overlapsFab:r.left<fab.right&&r.right>fab.left&&r.top<fab.bottom&&r.bottom>fab.top};
      });
    });
    for(const item of emptyActions.filter(item=>item.visibleAboveNav))assert.equal(item.overlapsFab,false,`${item.action} overlaps the floating Add action`);
    // Disable only the new diary stylesheet and compare ring geometry/styles.
    const ring = await page.evaluate(() => {
      const measure = () => { const e = document.querySelector('.calorie-ring'), r = e.getBoundingClientRect(), c = getComputedStyle(e); return { width:r.width, height:r.height, border:c.border, radius:c.borderRadius, font:c.font }; };
      const before = measure(), sheet = document.querySelector('link[href^="today-diary.css"]'); sheet.disabled = true; const after = measure(); sheet.disabled = false;
      return { before, after };
    });
    assert.deepEqual(ring.before, ring.after, "diary CSS changed ring");
    if (width === 390) {
      await page.screenshot({ path: `${output}/overview-${theme}-390.png` });
      await diaryShot(page, `empty-${theme}-390`);
    }
    // Empty Add is the same form, and keyboard activation does not auto-log.
    await page.locator('[data-empty-food-action=add]').focus(); await page.keyboard.press("Enter");
    await page.locator('#manualFoodName').waitFor({ state: "visible" });
    assert.equal((await read(page)).days[dates.today].foods.length, 0);
    await page.locator('#closeFoodModal').click();
    await page.locator('[data-empty-food-action=scan]').click();
    await page.locator('dialog[open] .scanner-modes').waitFor();
    await page.keyboard.press("Escape");
    await page.locator('#closeFoodModal').click();
    // Complete a manual Add through the new entry point, then delete the last
    // row through the existing overflow; the empty state must return.
    await page.locator('[data-empty-food-action=add]').click();
    await page.locator('#manualFoodShortcut').click();
    await page.locator('#manualFoodName').fill("Manual diary test");
    await page.locator('#manualFoodCalories').fill("123");
    await page.locator('#manualFoodProtein').fill("5");
    await page.locator('#manualFoodCarbs').fill("20");
    await page.locator('#manualFoodFat').fill("2");
    await page.locator('#foodMeal').selectOption("breakfast");
    await page.locator('#manualFoodSubmit').click();
    const added = (await read(page)).days[dates.today].foods;
    assert.equal(added.length, 1); assert.equal(added[0].meal, "breakfast"); assert.equal(added[0].calories, 123);
    assert.equal(await page.locator('[data-diary-meal=breakfast] .is-new-entry').count(), 1);
    assert.equal(await page.locator('.diary-meal-heading > span').textContent(), "123 kcal");
    await page.locator('#foodList .entry-actions-toggle').click();
    await page.locator('#foodReusePanel [data-entry-action=delete]').click();
    await page.locator('#foodList .diary-empty').waitFor();
    assert.equal(await page.locator('.diary-meal-group').count(), 0);
    assert.equal((await read(page)).days[dates.today].foods.length, 0);
    // Empty historical wording and reuse must target the selected day.
    await page.locator('#calendarStrip').evaluate((el, date) => el.querySelector(`[data-date-key="${date}"]`)?.click(), dates.empty);
    // If yesterday belongs to the previous week, use the existing previous-week control.
    if ((await read(page)).selectedDate !== dates.empty) { await page.locator('#previousWeekButton').click(); await page.waitForFunction(()=>!document.querySelector('.calendar-week-viewport').dataset.weekMotion); await page.locator(`#calendarStrip [data-date-key="${dates.empty}"]`).click(); }
    assert.equal((await read(page)).selectedDate, dates.empty);
    assert.equal(await page.locator('#foodList .diary-empty p').innerText(), 'No food logged.');
    await page.locator('[data-empty-food-action=reuse]').click();
    await page.locator('[data-reuse-action=copy-date]').click();
    assert.equal(await page.locator('[data-reuse-source-date]').inputValue(), dates.previous);
    await page.locator('[data-reuse-action=copy-meal]').click();
    await page.locator('#foodList .diary-meal-group').waitFor();
    const copied = (await read(page)).days[dates.empty].foods;
    assert.equal(copied.length, 1); assert.equal(copied[0].meal, "lunch"); assert.notEqual(copied[0].id, "old");
    assert.equal(await page.locator('#foodList .is-new-entry').count(), 1);
    assert.equal((await read(page)).days[dates.today].foods.length, 0);
    // Stable meal hierarchy and row order with a long name and an unknown meal.
    dates = await seed(page, theme, true);
    assert.equal(await page.locator('#foodLogOptionsButton').isVisible(),true);assert.ok((await page.locator('#foodLogOptionsButton').boundingBox()).height>=44);
    assert.equal(await page.locator('[data-empty-food-action=reuse]').count(),0);
    assert.deepEqual(await page.locator('.diary-meal-group').evaluateAll(groups => groups.map(g => g.dataset.diaryMeal)), ["breakfast", "lunch", "dinner", "snack"]);
    assert.deepEqual(await page.locator('.diary-meal-heading > span').allTextContents(), ["150 kcal", "300 kcal", "450 kcal", "160 kcal"]);
    assert.deepEqual(await page.locator('[data-diary-meal=breakfast] .entry-main strong').allTextContents(), ["Oats and yogurt", "Fresh berries"]);
    assert.equal(await page.locator('#exerciseList .entry-card').count(), 1);
    assert.equal(await page.locator('#foodList .entry-main p').first().textContent(), "1 serving · 08:00");
    await bounds(page);
    if (width === 390) await diaryShot(page, `logged-${theme}-390`);
    const rice = () => page.locator('#foodList .entry-card').filter({ has: page.locator('.entry-main strong', { hasText: 'Rice bowl' }) });
    await rice().locator('.entry-main').focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator('#foodMeal').inputValue(), "lunch");
    assert.equal(await page.locator('#manualFoodSubmit').innerText(), "Save changes");
    await page.locator('#foodAmount').fill("2"); await page.locator('#foodMeal').selectOption("dinner");
    if (width === 390) await page.screenshot({ path: `${output}/edit-${theme}-390.png` });
    await page.locator('#manualFoodSubmit').click();
    // Root geometry is stationary; its child content now owns the short exit.
    // Do not dispatch synthetic pointer gestures into the still-inert surface.
    await page.locator('#foodSection.add-flow-surface').waitFor({ state: 'detached' });
    const edited = (await read(page)).days[dates.today].foods.find(f => f.id === "l");
    assert.equal(edited.meal, "dinner"); assert.equal(edited.amount, 2); assert.equal(edited.calories, 600);
    assert.equal(await page.locator('[data-diary-meal=lunch]').count(), 0);
    assert.equal(await page.locator('[data-diary-meal=dinner] .diary-meal-heading > span').innerText(), "1050 kcal");
    // Rightward drag stays closed; leftward drag reveals only the row's
    // contextual shortcuts without changing the diary or replacing overflow.
    await swipe(rice(), 'right');
    assert.equal(await rice().evaluate(e=>e.classList.contains('is-swipe-open')),false);
    assert.equal(await rice().locator('.entry-surface').evaluate(e=>getComputedStyle(e).transform),'none');
    await swipe(rice(), 'left');
    assert.equal(await rice().evaluate(e=>e.classList.contains('is-swipe-open')),true);
    assert.equal(await rice().locator('.diary-row-swipe-actions button').count(),2);
    assert.equal(await rice().locator('.diary-row-swipe-actions').evaluate(e=>e.inert),false);
    await page.locator('[data-diary-meal=dinner] .diary-meal-heading').click();
    assert.equal(await rice().evaluate(e=>e.classList.contains('is-swipe-open')),false);
    await rice().locator('.entry-actions-toggle').click(); await page.locator('[data-entry-action=save]').click();
    await rice().locator('.entry-actions-toggle').click(); assert.equal(await page.locator('[data-entry-action=save]').innerText(), 'Unsave');
    await page.locator('[data-entry-action=save]').click();
    await rice().locator('.entry-actions-toggle').click(); await page.locator('[data-entry-action=delete]').click();
    assert.equal((await read(page)).days[dates.today].foods.some(f => f.id === "l"), false);
    await page.locator('#undoToast button').click();
    assert.deepEqual((await read(page)).days[dates.today].foods.find(f => f.id === "l"), edited);
    // Keyboard overflow actions and Cancel preserve the diary.
    await rice().locator('.entry-actions-toggle').focus(); await page.keyboard.press("Enter");
    await page.locator('#foodReusePanel [data-entry-action=edit]').press("Enter");
    await page.locator('#foodAmount').fill("3"); await page.locator('#closeFoodModal').click();
    assert.deepEqual((await read(page)).days[dates.today].foods.find(f => f.id === "l"), edited);
    // Re-enter Today after a cold reload, preserving all persisted meal tags.
    await page.reload(); await page.locator('#foodList .diary-meal-group').first().waitFor();
    assert.deepEqual((await read(page)).days[dates.today].foods.find(f => f.id === "l"), edited);
    assert.equal(await page.locator('[data-diary-meal=dinner] .diary-meal-heading > span').textContent(), "1050 kcal");
    await bounds(page);
    assert.deepEqual(errors, []);
    results.push({ width, theme, motion, ring: ring.before, checks: "empty/manual add/scan/reuse, last-row deletion, historical date, groups/subtotals/order/fallback, long names, keyboard edit/cancel, pointer save/unsave/delete/undo, existing success cue, reload persistence" });
    await context.close();
  }
  const offlineContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const offlinePage = await offlineContext.newPage();
  const offlineErrors = [];
  offlinePage.on("pageerror", e => offlineErrors.push(e.message));
  await offlinePage.goto(`${origin}/profile.html`);
  await seed(offlinePage, "light", true);
  await offlinePage.evaluate(async () => { await navigator.serviceWorker.ready; });
  await offlinePage.reload();
  await offlinePage.locator('.diary-meal-group').first().waitFor();
  await offlineContext.setOffline(true);
  await offlinePage.reload();
  await offlinePage.locator('.diary-meal-group').first().waitFor();
  assert.equal(await offlinePage.locator('.diary-meal-group').count(), 4);
  assert.equal(await offlinePage.locator('.diary-meal-heading h3').first().evaluate(el => getComputedStyle(el).fontSize), "13px");
  assert.deepEqual(offlineErrors, []);
  await offlineContext.close();
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} Today diary viewport/theme combinations plus a real offline Today reload with the new JS/CSS; zero browser errors. Synthetic touch/keyboard, not physical iPhone. Evidence: ${output}`);
} finally { await browser.close(); }
