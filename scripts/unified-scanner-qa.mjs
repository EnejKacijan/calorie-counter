import { qaWidths, qaHeight, qaOutput, pwaOptions, preparePwa, preparePwaPage, pwaAudit } from "./pwa-qa-context.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const origin = process.env.INTAKE_URL || "http://127.0.0.1:3001";
const output = qaOutput("unified-scanner");
await mkdir(output, { recursive: true });
const results = [];
const product = { id: "off-test-yogurt", catalogId: "off-test-yogurt", name: pwaAudit ? "Sample yogurt with "+ "verylongingredients".repeat(12) : "Sample yogurt", brand: "Sample Dairy", source: "Open Food Facts", serving: "125 g", servingGrams: 125, calories: 100, protein: 8, carbs: 12, fat: 2 };
const label = { ...product, id: "label-test", name: pwaAudit ? "Nutrition label "+ "longlabel".repeat(20) : "Yogurt label", source: "Label · AI transcription", serving: "per 100g", servingGrams: 100, calories: 64 };
const plate = { confidence: "medium", notes: "Portions are estimates.", foods: [
  { name: "Rice", amount: 150, unit: "g", servingGrams: 150, calories: 195, protein: 4, carbs: 42, fat: 1, confidence: "medium" },
  { name: "Egg", amount: 1, unit: "piece", servingGrams: 50, calories: 78, protein: 6, carbs: 1, fat: 5, confidence: "high" },
] };
try {
  for (const width of qaWidths()) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: true, reducedMotion: theme === "dark" ? "reduce" : "no-preference", serviceWorkers: "block", ...pwaOptions(width) });
    await preparePwa(context, width);
    await context.addInitScript(({ theme }) => {
      localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "Scanner QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 70, goalType: "lose", activityMultiplier: 1.375, weeklyRateKg: .5 }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: {}, progress: [], theme }));
      localStorage.setItem("calorie-counter-ai-consent-v1", JSON.stringify({ photo: true, label: true }));
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: theme === "light" ? undefined : { getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } } });
    }, { theme });
    const page = await context.newPage(); await preparePwaPage(page); page.setDefaultTimeout(8000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    let foodReply = plate, labelReply = label, barcodeFound = true, delayed, pendingRoute;
    let counts = { food: 0, label: 0, barcode: 0 };
    await page.route("**/api/foods/analyze-image", async route => {
      counts.food++;
      if (delayed) { pendingRoute = route; return; }
      await route.fulfill({ json: { analysis: foodReply } });
    });
    await page.route("**/api/foods/analyze-label", route => { counts.label++; return route.fulfill({ json: { food: labelReply } }); });
    await page.route("**/api/foods/barcode?*", route => { counts.barcode++; return route.fulfill({ status: barcodeFound ? 200 : 404, json: barcodeFound ? { food: product } : { error: "Product not found." } }); });
    const entries = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("calorie-counter-state")).days).flatMap(day => day.foods));
    async function shot(name) {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: horizontal overflow`);
      if (width === 390) await page.screenshot({ path: `${output}/${name}-${theme}-390.png`, animations: "disabled" });
    }
    async function fresh(mode = "food") {
      await page.goto(`${origin}/index.html`);
      // The static FAB can paint before the router's awaited module mounts.
      // Calendar tiles are rendered after its click handlers are attached.
      await page.locator("#calendarStrip .day-tile").first().waitFor();
      await page.locator("#floatingAddButton").click();
      await page.locator("#foodScanButton").click();
      await page.locator(`[data-mode="${mode}"]`).click();
      await page.locator('.unified-scanner[data-camera-state="error"]').waitFor();
      assert.equal(await page.locator(".unified-scanner").count(), 1);
      assert.deepEqual(await page.locator(".scanner-modes button").allTextContents(), ["Food photo", "Barcode", "Label"]);
      assert.equal(await page.locator('[data-mode="label"]').getAttribute('aria-label'), 'Nutrition label');
      assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator("[data-gallery]").isEnabled(), true);
      assert.equal(await page.locator("[data-shutter]").isVisible(), false);
      assert.equal(await page.locator("#foodGalleryShortcut,#foodScanMenu,#foodPhotoInput,#foodGalleryInput").count(), 0);
    }
    await fresh();
    const bytes = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 32; c.getContext("2d").fillRect(0, 0, 32, 32); return c.toDataURL("image/png").split(",")[1]; });
    const image = { name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from(bytes, "base64") };
    // All modes remain usable without camera access; native choose-photo path.
    await shot("food-mode");
    const chooserPromise = page.waitForEvent("filechooser"); await page.locator("[data-gallery]").click();
    await (await chooserPromise).setFiles(image);
    await page.locator("#scanFoodList .scan-plate-row").nth(1).waitFor();
    assert.equal(await page.locator("#scanReviewEyebrow").textContent(), "AI estimate");
    assert.deepEqual(await entries(), []);
    assert.equal(await page.locator("#scanTotalCalories").textContent(), "273");
    await shot("food-review");
    await page.locator('.scan-plate-row').nth(1).click();
    await page.locator('[data-scan-action="toggle"]').click();
    assert.equal(await page.locator("#scanTotalCalories").textContent(), "195");
    await page.locator('#scanRemoveUndo').click();
    assert.equal(await page.locator("#scanTotalCalories").textContent(), "273");
    await page.locator('.scan-plate-row').first().click();
    await page.locator('[data-scan-field="amount"]').fill("75,0");
    assert.equal(await page.locator("#scanTotalCalories").textContent(), "175.5");
    await page.locator('#closeFoodModal').click();
    await page.locator('.scan-plate-row').nth(1).click();
    await page.locator('[data-scan-action="toggle"]').click();
    await page.locator("#scanReviewMeal").selectOption("lunch");
    await page.locator("#scanAddSelectedFoods").click();
    await page.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('calorie-counter-state')).days).some(d=>d.foods?.length===1));
    assert.equal((await entries()).length, 1); assert.equal((await entries())[0].amount, 75); assert.equal((await entries())[0].meal, "lunch");
    // Barcode: explicit not-found recovery and no automatic AI fallback.
    await fresh("barcode"); await shot("barcode-mode");
    barcodeFound = false;
    await page.locator("[data-code]").fill("3017620422003"); await page.locator("[data-code]").press("Enter");
    await page.locator('.package-scan-status[role="alert"]').waitFor();
    const afterNotFound = { ...counts };
    assert.equal(await page.locator("[data-code]").inputValue(), "3017620422003");
    for (const sel of ["[data-gallery]", "[data-retry]", "[data-label]", "[data-enter-manual]", "[data-code]"]) assert.equal(await page.locator(sel).isVisible(), true);
    await shot("barcode-not-found");
    await page.locator("[data-retry]").click();
    await page.locator('.package-scan-status[role="alert"]').waitFor();
    assert.deepEqual(counts, { ...afterNotFound, barcode: afterNotFound.barcode + 1 });
    assert.equal(await page.locator("[data-code]").inputValue(), "3017620422003");
    barcodeFound = true; await page.locator("[data-find]").click();
    await page.locator("#foodEditName").filter({ hasText: product.name }).waitFor();
    assert.equal(await page.locator("#foodEditBrand").textContent(), product.brand);
    assert.match(await page.locator("#foodEditSummary").textContent(), /Barcode product.*125 g/s);
    assert.deepEqual(await entries(), []);
    await shot("barcode-review");
    await page.locator("#foodUnit").selectOption("g"); await page.locator("#foodAmount").fill("50");
    assert.equal(await page.locator("#foodNutritionCalories").textContent(), "40 kcal");
    await page.locator("#foodMeal").selectOption("dinner");
    await page.locator("#manualFoodSubmit").click();
    assert.equal((await entries())[0].meal, "dinner"); assert.equal((await entries())[0].calories, 40);
    // Label mode has explicit provenance, retry, editable values and review only.
    await fresh("label"); await shot("label-mode");
    labelReply = null; await page.locator("[data-gallery-file]").setInputFiles(image);
    await page.locator('.package-scan-status[role="alert"]').waitFor();
    assert.match(await page.locator(".package-scan-status").textContent(), /Could not read complete nutrition/);
    await shot("label-unreadable");
    labelReply = label; await page.locator("[data-gallery-file]").setInputFiles(image);
    await page.locator("#foodEditName").filter({ hasText: label.name }).waitFor();
    assert.match(await page.locator("#foodEditSummary").textContent(), /Nutrition label · AI transcription/);
    assert.equal(await page.locator("#foodAmount").inputValue(), "100");
    assert.deepEqual(await entries(), []);
    await shot("label-review");
    await page.locator("#foodAmount").fill("50");
    assert.equal(await page.locator("#manualFoodCalories").inputValue(), "32");
    if (!await page.locator("#manualFoodCalories").isVisible()) await page.locator("#editFoodNutrition").click();
    await page.locator("#manualFoodCalories").fill("35");
    await page.locator("#manualFoodSubmit").click(); assert.equal((await entries())[0].calories, 35);
    // No-food result uses the same scanner for retry and retains manual entry.
    foodReply = { foods: [], outcome: "no_food" };
    await fresh(); await page.locator("[data-gallery-file]").setInputFiles(image);
    await page.locator("#scanNoFood").waitFor();
    assert.equal(await page.locator("#scanReviewMeal").isVisible(), false);
    assert.deepEqual(await entries(), []); await shot("food-no-result");
    await page.locator("#scanNoFoodRetry").click();
    await page.locator(".unified-scanner").waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".unified-scanner").waitFor({ state: "detached" });
    assert.equal(await page.locator("#scanNoFood").isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), "foodScanButton");
    await page.locator("#manualFoodShortcut").click();
    assert.equal(await page.locator("#manualFoodName").isEditable(), true);
    // Browser Back dismisses only scanner; Tab remains inside its native dialog.
    await fresh("barcode");
    await page.locator(".package-scan-close").focus(); await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator("[data-enter-manual]").evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(".package-scan-close").evaluate(el => el === document.activeElement), true);
    await page.goBack(); await page.locator(".unified-scanner").waitFor({ state: "detached" });
    assert.equal(await page.locator("#manualFoodName").isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), "foodScanButton");
    // Closing aborts an actual pending request; late completion cannot open review.
    await page.locator("#foodScanButton").click(); delayed = true; pendingRoute = null;
    await page.locator("[data-gallery-file]").setInputFiles(image);
    await page.locator('.unified-scanner[data-food-phase="analyzing"]').waitFor();
    while (!pendingRoute) await new Promise(resolve => setTimeout(resolve, 10));
    const aborted = page.waitForEvent("requestfailed", request => request.url().includes("analyze-image"));
    await page.locator(".package-scan-close").click(); await aborted;
    assert.equal(await page.locator('.unified-scanner').getAttribute('data-food-phase'),'source');
    await page.locator('.package-scan-close').click();
    await pendingRoute.fulfill({ json: { analysis: plate } }).catch(() => {});
    delayed = false;
    await page.locator("#foodScanButton").click();
    await page.locator(".unified-scanner").waitFor();
    assert.equal(await page.locator(".package-scan-status").textContent(), "");
    assert.equal(await page.locator("[data-code]").inputValue(), "");
    assert.equal(await page.locator('[data-mode="food"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#scanReview").isVisible(), false);
    assert.deepEqual(await entries(), []);
    await page.keyboard.press("Escape");
    // Not-found alternatives are explicit actions, never an implicit AI request.
    await fresh("barcode"); barcodeFound = false;
    await page.locator("[data-code]").fill("3017620422003"); await page.locator("[data-find]").click();
    await page.locator("[data-label]").click();
    assert.equal(await page.locator('[data-mode="label"]').getAttribute("aria-pressed"), "true");
    await page.locator('[data-mode="barcode"]').click(); await page.locator("[data-find]").click();
    await page.locator("[data-enter-manual]").click();
    assert.equal(await page.locator("#manualFoodName").isEditable(), true);
    assert.equal(await page.locator(".unified-scanner").count(), 0);
    await page.goto(`${origin}/index.html`);
    await page.locator('[data-empty-food-action="scan"]').click();
    await page.locator(".unified-scanner").waitFor();
    assert.equal(await page.locator(".unified-scanner").count(), 1);
    assert.equal(await page.locator('[data-mode="food"]').getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    results.push({ width, theme, camera: theme === "light" ? "unavailable" : "permission denied", checks: "three modes; choose photo; food multi-item/edit/exclude/add/no-food; barcode manual success/not-found/retry/label/manual alternatives; label failure/retry/edit/add; focus trap/restore; Escape/Back correct layer; real network abort; clean reopen", errors });
    console.log(`PASS ${width} ${theme}`);
    await context.close();
  }
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await desktop.addInitScript(() => {
    localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "Desktop scanner QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 70, goalType: "lose", activityMultiplier: 1.375, weeklyRateKg: .5 }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: {}, progress: [], theme: "light" }));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  });
  const deskPage = await desktop.newPage();
  const desktopErrors = []; deskPage.on("pageerror", error => desktopErrors.push(error.message));
  await deskPage.route("**/api/foods/barcode?*", route => route.fulfill({ json: { food: product } }));
  await deskPage.goto(`${origin}/index.html`);
  await deskPage.locator("#addFoodToggle").click(); await deskPage.locator("#foodScanButton").click();
  await deskPage.locator(".unified-scanner").waitFor();
  await deskPage.keyboard.press("Escape");
  await deskPage.locator(".unified-scanner").waitFor({ state: "detached" });
  // Wide windows now use the same authoritative Add task surface. Do not
  // require the retired desktop modal just to smoke-test shared functionality.
  assert.equal(await deskPage.locator(".add-flow-host").isVisible(), true);
  assert.equal(await deskPage.locator("#manualFoodName").isVisible(), true);
  assert.equal(await deskPage.evaluate(() => document.activeElement.id), "foodScanButton");
  await deskPage.locator("#foodScanButton").click(); await deskPage.locator('[data-mode="barcode"]').click();
  await deskPage.locator("[data-code]").fill("3017620422003"); await deskPage.locator("[data-find]").click();
  await deskPage.locator("#foodEditName").filter({ hasText: product.name }).waitFor();
  assert.equal(await deskPage.locator("#foodEditBrand").textContent(), product.brand);
  assert.equal(await deskPage.locator("#foodAmount").isVisible(), true);
  assert.equal(await deskPage.locator("#manualFoodSubmit").isVisible(), true);
  assert.deepEqual(desktopErrors, []); await desktop.close();
  console.log("PASS desktop canonical scanner, nested Escape/focus restore and barcode review");
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(`PASS ${results.length} unified scanner mobile combinations. Synthetic data and provider replies; no AI requests or real camera access.`);
} finally { await browser.close(); }
