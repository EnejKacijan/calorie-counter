import { qaWidths, qaHeight, qaOutput, pwaOptions, preparePwa, preparePwaPage, pwaAudit } from "./pwa-qa-context.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { food, localRice, milk } from "./fixtures/food-search.mjs";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const origin = process.env.INTAKE_URL || "http://127.0.0.1:3001";
const output = qaOutput("food-search");
await mkdir(output, { recursive: true });
const results = [];
const online = [food("usda-substring", "Brown rice"), food("usda-prefix", "Rice bowl"), food("off-exact", "Rice", { source: "Open Food Facts", brand: "Sample Pantry" }), ...Array.from({ length: 8 }, (_, i) => food(`usda-long-${i}`, `Rice with vegetables ${i} and a deliberately long descriptive food name`))];
const read = page => page.evaluate(() => JSON.parse(localStorage.getItem("calorie-counter-state")));
async function checkBounds(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "page overflow");
  const rows = await page.locator('#foodSuggestions .suggestion-card').evaluateAll(nodes => nodes.map(n => {
    const row = n.getBoundingClientRect(), kcal = n.querySelector('.suggestion-kcal').getBoundingClientRect();
    return { left: row.left, right: row.right, kcal: kcal.right, width: innerWidth, height: row.height, content: n.scrollHeight, client: n.clientHeight, rows: getComputedStyle(n).gridTemplateRows };
  }));
  for (const row of rows) assert.ok(row.left >= 0 && row.right <= row.width + 1 && row.kcal <= row.right + 1, "result kcal clipped");
  for (const row of rows) assert.ok(row.content <= row.client + 1, `row content overflow: ${JSON.stringify(row)}`);
}
try {
  for (const width of (process.env.INTAKE_QA_WIDTH ? [Number(process.env.INTAKE_QA_WIDTH)] : qaWidths())) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, reducedMotion: theme === "dark" ? "reduce" : "no-preference", serviceWorkers: "block", ...pwaOptions(width) });
    await preparePwa(context, width);
    const page = await context.newPage(); await preparePwaPage(page); page.setDefaultTimeout(8000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => { errors.push(`Unexpected dialog: ${dialog.message()}`); void dialog.dismiss(); });
    let requests = 0, failCalls = 0, delayedResolve;
    await page.route('**/api/foods/search?*', async route => {
      requests++;
      const q = new URL(route.request().url()).searchParams.get("q").toLowerCase();
      if (q === "rice" && delayedResolve) await new Promise(resolve => { delayedResolve.resolve = resolve; });
      if (q === "failure" && ++failCalls <= 2) return route.fulfill({ status: 503, json: { error: "Food sources are temporarily unavailable." } });
      return route.fulfill({ json: { foods: q === "rice" ? online : q === "oat" ? [milk] : q === "failure" ? [food("usda-retry", "Retry food")] : [] } });
    });
    await page.goto(`${origin}/profile.html`);
    const dates = await page.evaluate(({ theme, localRice, milk }) => {
      const today = new Date(), old = new Date(); old.setDate(old.getDate() - 2);
      const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      const date = key(old), now = key(today);
      localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "Search QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 70, goalType: "lose", activityMultiplier: 1.375, weeklyRateKg: .5 }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: { [date]: { foods: [], exercises: [] } }, selectedDate: date, lastOpenedDate: now, progress: [], theme }));
      localStorage.setItem("calorie-counter-food-library", JSON.stringify([localRice, milk]));
      localStorage.setItem("calorie-counter-saved-foods", JSON.stringify([localRice]));
      localStorage.setItem("calorie-counter-saved-meals", JSON.stringify([{ id: "saved-meal", name: "Rice lunch", meal: "lunch", foods: [{ ...localRice, amount: 150, unit: "g", meal: "lunch" }] }]));
      sessionStorage.setItem("calorie-counter-today-session-v1", "active");
      return { date, now };
    }, { theme, localRice, milk });
    await page.goto(`${origin}/index.html`);
    await page.locator('#floatingAddButton').click();
    const input = page.locator('#manualFoodName'), section = page.locator('#foodSection');
    await input.waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.activeElement.id), "closeFoodModal", "Generic mobile Add opens without forcing the keyboard");
    assert.equal(await page.locator('#foodSuggestions .recent-foods-heading').textContent(), "Recent foodsView all →");
    assert.equal(await page.locator('#foodSuggestions .suggestion-card').count(), 2);
    assert.equal(await page.locator('.search-saved-entry').isVisible(), true);
    assert.equal(requests, 0);
    await checkBounds(page);
    if (width === 390) await page.screenshot({ path: `${output}/empty-${theme}-390.png` });
    // Empty Recent and Saved browsing round-trip through explicit detail review.
    const recentBefore = await page.evaluate(() => ({
      stored: JSON.parse(localStorage.getItem("calorie-counter-food-library")),
      amount: document.querySelector("#foodAmount").value,
      unit: document.querySelector("#foodUnit").value,
      names: [...document.querySelectorAll("#foodSuggestions .suggestion-card strong")].map(el => el.textContent),
    }));
    assert.deepEqual(recentBefore.names, [localRice.name, milk.name], "Recent uses explicit fixture chronology");
    const recentRice = recentBefore.stored.find(food => food.id === localRice.id);
    assert.equal(recentRice.catalogId, localRice.catalogId);
    assert.equal(recentRice.lastUsedAmount, 150);
    assert.equal(recentRice.lastUsedUnit, "g");
    // Select the named identity; an unrelated first row must never satisfy this test.
    const riceResult = page.locator('#foodSuggestions .suggestion-card').filter({ has: page.locator('strong', { hasText: /^Rice$/ }) });
    assert.equal(await riceResult.count(), 1);
    await riceResult.click();
    assert.equal(await page.locator('#foodEditName').textContent(), localRice.name);
    assert.equal(await page.locator('#foodAmount').inputValue(), "150");
    assert.equal(await page.locator('#foodUnit').inputValue(), "g");
    const recentSelection = { identity: { id: recentRice.id, catalogId: recentRice.catalogId, name: recentRice.name }, before: recentBefore,
      after: { name: await page.locator('#foodEditName').textContent(), amount: await page.locator('#foodAmount').inputValue(), unit: await page.locator('#foodUnit').inputValue() } };
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("calorie-counter-food-library"))), recentBefore.stored);
    assert.equal((await read(page)).days[dates.date].foods.length, 0);
    await page.locator('#closeFoodModal').click();
    assert.equal(await page.locator('#foodSuggestions .recent-foods-heading').isVisible(), true);
    // A different identity without last-used values gets its own default, not Rice's amount.
    await page.locator('#foodSuggestions .suggestion-card').filter({ has: page.locator('strong', { hasText: /^Oat drink$/ }) }).click();
    assert.equal(await page.locator('#foodEditName').textContent(), milk.name);
    assert.equal(await page.locator('#foodAmount').inputValue(), "1");
    assert.equal(await page.locator('#foodUnit').inputValue(), "serving");
    await page.locator('#closeFoodModal').click();
    await page.locator('.search-saved-entry').click();
    assert.equal(await page.locator('#foodSuggestions .food-suggestion-section-label').allTextContents().then(t => t.join('|')), "Saved meals|Saved foods");
    await page.locator('#foodSuggestions .suggestion-card').click();
    await page.locator('#closeFoodModal').click();
    assert.equal(await page.locator('[data-food-filter=my]').getAttribute('aria-pressed'), "true");
    assert.equal(await page.locator('#foodSuggestions .food-suggestion-section-label').count(), 2);
    await page.locator('[data-food-filter=all]').click();
    // Local identity appears immediately while online results are deliberately pending.
    delayedResolve = {};
    await input.fill("rice"); await input.press("Enter");
    await page.waitForFunction(() => document.querySelector('#foodSuggestions').getAttribute('aria-busy') === 'true');
    assert.equal(await page.locator('#foodSuggestions .suggestion-card strong').first().textContent(), "Rice");
    while (!delayedResolve.resolve) await new Promise(resolve => setTimeout(resolve, 10));
    delayedResolve.resolve(); delayedResolve = null;
    await page.waitForFunction(() => !document.querySelector('#foodSuggestions').hasAttribute('aria-busy'));
    assert.equal(await page.locator('#foodSuggestions .suggestion-saved').first().textContent(), "Saved");
    assert.deepEqual((await page.locator('#foodSuggestions .suggestion-card strong').allTextContents()).slice(0, 3), ["Rice", "Rice", "Rice bowl"]);
    assert.match(await page.locator('#foodSuggestions .suggestion-meta').filter({hasText:'Sample Pantry'}).first().textContent(), /Sample Pantry · OPEN FOOD FACTS/);
    await checkBounds(page);
    if (width === 390) await page.screenshot({ path: `${output}/populated-${theme}-390.png` });
    // Expanded result count, filter, query and exact container scroll survive Back.
    await page.locator('.food-suggestions-more').click();
    await section.evaluate(el => { el.scrollTop = 350; });
    const scroll = await section.evaluate(el => el.scrollTop);
    const names = await page.locator('#foodSuggestions .suggestion-card strong').allTextContents();
    // Keyboard activation avoids Playwright scrolling a top row into view before capture.
    await page.locator('#foodSuggestions .suggestion-card').nth(1).evaluate(el => el.focus({ preventScroll: true }));
    await page.keyboard.press("Enter");
    assert.equal(await page.locator('#foodEditName').textContent(), "Rice");
    assert.equal(await page.locator('#foodEditBrand').textContent(), "Sample Pantry");
    assert.equal(await page.locator('#foodNutritionCalories').textContent(), "100 kcal");
    await page.locator('#foodUnit').selectOption("g"); await page.locator('#foodAmount').fill("50,5");
    assert.equal(await page.locator('#foodNutritionCalories').textContent(), "51 kcal");
    await page.locator('#foodUnit').selectOption("serving"); await page.locator('#foodAmount').fill("0,5");
    assert.equal(await page.locator('#foodNutritionCalories').textContent(), "50 kcal");
    await page.locator('#foodMeal').selectOption("dinner");
    assert.equal(await page.locator('#manualFoodSubmit').textContent(), "Add to Dinner");
    if (width === 390) {
      await section.evaluate(el => { el.scrollTop = 0; });
      const header = await page.locator('#foodMobileHeaderTitle').boundingBox();
      assert.ok(header.y >= 0, `detail header clipped: ${JSON.stringify(header)}`);
      await page.screenshot({ path: `${output}/detail-${theme}-390.png` });
    }
    await page.locator('#closeFoodModal').click();
    assert.equal(await input.inputValue(), "rice");
    assert.deepEqual(await page.locator('#foodSuggestions .suggestion-card strong').allTextContents(), names);
    assert.ok(Math.abs(await section.evaluate(el => el.scrollTop) - scroll) <= 1, "browse scroll changed");
    // Millilitre entry uses the existing volume basis, without enabling grams.
    await input.fill("oat"); await input.press("Enter");
    await page.waitForFunction(() => !document.querySelector('#foodSuggestions').hasAttribute('aria-busy'));
    await page.locator('#foodSuggestions .suggestion-card').first().click();
    assert.equal(await page.locator('#foodUnit option[value=g]').evaluate(option => option.disabled), true);
    await page.locator('#foodUnit').selectOption("ml"); await page.locator('#foodAmount').fill("125");
    assert.equal(await page.locator('#foodNutritionCalories').textContent(), "60 kcal");
    await page.locator('#foodMeal').selectOption("lunch");
    assert.equal(await page.locator('#manualFoodSubmit').textContent(), "Add to Lunch");
    // A keyboard-sized viewport still permits reaching the primary CTA and amount.
    await page.setViewportSize({ width, height: 480 });
    await page.locator('#foodAmount').focus(); await page.locator('#foodAmount').scrollIntoViewIfNeeded();
    assert.ok((await page.locator('#foodAmount').boundingBox()).y >= 0);
    await page.locator('#manualFoodSubmit').scrollIntoViewIfNeeded();
    const cta = await page.locator('#manualFoodSubmit').boundingBox();
    assert.ok(cta.y >= 0 && cta.y + cta.height <= 480, "keyboard CTA clipped");
    await page.locator('#manualFoodSubmit').click();
    assert.equal((await read(page)).days[dates.date].foods.length, 1);
    const added = (await read(page)).days[dates.date].foods[0];
    assert.equal(added.meal, "lunch"); assert.equal(added.amount, 125); assert.equal(added.calories, 60);
    await page.setViewportSize({ width, height: qaHeight(width) });
    // Existing diary edit remains Save changes and Cancel never mutates.
    await page.locator('#foodList .entry-card').click();
    assert.equal(await page.locator('#manualFoodSubmit').textContent(), "Save changes");
    await page.locator('#foodAmount').fill("250"); await page.locator('#closeFoodModal').click();
    assert.deepEqual((await read(page)).days[dates.date].foods[0], added);
    await page.locator('#foodList .entry-card').click();
    await page.locator('#foodAmount').fill("250");
    assert.equal(await page.locator('#foodNutritionCalories').textContent(), "120 kcal", "editing a logged 125 ml portion to 250 ml doubles its nutrition");
    await page.locator('#manualFoodSubmit').click();
    const edited = (await read(page)).days[dates.date].foods[0];
    assert.equal(edited.id, added.id); assert.equal(edited.meal, "lunch"); assert.equal(edited.calories, 120);
    // No matches, filtered fallback and repeated failure/retry preserve the query.
    await page.locator('#floatingAddButton').click();
    await input.fill("no-matches"); await input.press("Enter");
    await page.locator('[data-food-fallback=manual]').waitFor();
    assert.equal(await page.locator('[data-food-fallback=all]').isVisible(), false);
    await page.locator('[data-food-filter=usda]').click();
    // The outgoing pane is briefly an inert presentation snapshot. Interact
    // with the sole live result owner, not a raw selector across both panes.
    await page.locator('#foodSuggestions [data-food-fallback=all]').click();
    assert.equal(await input.inputValue(), "no-matches");
    await input.fill("failure"); await input.press("Enter");
    await page.locator('[data-search-retry]').click();
    await page.locator('[data-search-retry]').waitFor();
    assert.match(await page.locator('.food-search-error p').textContent(), /temporarily unavailable/);
    assert.equal(await input.inputValue(), "failure");
    await page.locator('[data-search-manual]').click();
    assert.equal(await input.inputValue(), "failure");
    assert.equal(await input.getAttribute('readonly'), null);
    await page.locator('#closeFoodModal').click();
    assert.equal(await input.inputValue(), "failure");
    assert.match(await page.locator('.food-search-error p').textContent(), /temporarily unavailable/);
    await page.locator('[data-search-retry]').click();
    await page.locator('#foodSuggestions .suggestion-card').filter({ hasText: "Retry food" }).waitFor();
    assert.equal(failCalls, 3);
    // Manual entry keeps an editable name and macros; no extra logging on Enter search.
    await page.locator('#manualFoodShortcut').click();
    await input.fill("Homemade oats");
    await page.locator('#manualFoodCalories').fill("220");
    await page.locator('#manualFoodProtein').fill("10");
    await page.locator('#manualFoodCarbs').fill("30");
    await page.locator('#manualFoodFat').fill("6");
    await page.locator('#foodMeal').selectOption("breakfast");
    assert.ok(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16, "manual name input should not trigger iPhone focus zoom");
    await checkBounds(page);
    if (width === 390) { await section.evaluate(el => { el.scrollTop = 0; }); await page.screenshot({ path: `${output}/manual-${theme}-390.png` }); }
    await page.setViewportSize({ width, height: 480 });
    await input.focus(); await input.scrollIntoViewIfNeeded();
    assert.ok((await input.boundingBox()).y >= 0);
    await page.locator('#manualFoodSubmit').scrollIntoViewIfNeeded();
    const manualCta = await page.locator('#manualFoodSubmit').boundingBox();
    assert.ok(manualCta.y >= 0 && manualCta.y + manualCta.height <= 480, "manual keyboard CTA clipped");
    await page.locator('#manualFoodSubmit').click();
    assert.equal((await read(page)).days[dates.date].foods.length, 2);
    const manual = (await read(page)).days[dates.date].foods.find(food => food.name === "Homemade oats");
    assert.equal(manual.meal, "breakfast"); assert.equal(manual.calories, 220); assert.equal(manual.protein, 10);
    assert.deepEqual(errors, []);
    results.push({ width, theme, recentSelection, checks: "focus, empty Recent/Saved, local-first, ranking, brand/portion/kcal, explicit selection, Back query/results/scroll/filter, decimal comma g/ml/serving, meal CTA, keyboard viewport, historical add, edit Cancel/Save and ml scaling, no results, repeated failure/retry/manual fallback, manual entry", browserErrors: errors });
    await context.close();
    console.log(`PASS ${width} ${theme}`);
  }
  // The same detail flow is used in the existing desktop dialog.
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await desktop.addInitScript(() => {
    localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "Desktop search QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 70, goalType: "lose", activityMultiplier: 1.375, weeklyRateKg: .5 }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: {}, progress: [], theme: "light" }));
    localStorage.setItem("calorie-counter-food-library", JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ id: `usda-desktop-${i}`, name: `Desktop food ${i}`, source: "USDA", serving: "100 g", servingGrams: 100, calories: 100, protein: 10, carbs: 20, fat: 2 }))));
  });
  const deskPage = await desktop.newPage(); deskPage.setDefaultTimeout(8000);
  const desktopErrors = []; deskPage.on("pageerror", error => desktopErrors.push(error.message));
  await deskPage.route('**/api/foods/search?*', route => route.fulfill({ json: { foods: online } }));
  await deskPage.goto(`${origin}/index.html`);
  // Wide viewports use the same mobile surface; the removed desktop-dialog
  // selectors are not a supported product path. Development smoke only.
  await deskPage.locator('.day-tile').first().waitFor();
  await deskPage.locator('#addFoodToggle').click();
  await deskPage.locator('#manualFoodName').fill('rice');
  await deskPage.locator('#manualFoodName').press('Enter');
  await deskPage.locator('#foodSuggestions .suggestion-card').first().click();
  await deskPage.locator('#closeFoodModal').click();
  assert.equal(await deskPage.locator('#manualFoodName').inputValue(), 'rice');
  assert.ok(await deskPage.locator('#foodSuggestions .suggestion-card').count() > 0);
  assert.deepEqual(desktopErrors, []);
  await desktop.close();
  console.log("PASS wide-viewport development smoke: same Add surface, search/detail/Back");
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(`PASS: ${results.length} food-search viewport/theme combinations. Synthetic data, mocked search providers, no external AI requests.`);
} finally { await browser.close(); }
