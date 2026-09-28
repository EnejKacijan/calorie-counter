import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const base = process.env.INTAKE_URL || "http://127.0.0.1:3001";
try {
  for (const width of [320, 390, 430]) for (const reducedMotion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion, serviceWorkers: "block" });
    await context.addInitScript(() => {
      localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "UX QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 70, goalType: "lose", activityMultiplier: 1.375, weeklyRateKg: .5 }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: {}, progress: [], theme: "light" }));
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => { throw Error("QA denied"); } } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/foods/search?*", route => route.fulfill({ json: { foods: [{ name: "QA banana", source: "Test", serving: "1 piece", calories: 100, protein: 1, carbs: 20, fat: 1 }] } }));
    await page.goto(base + "/index.html");
    // The load event precedes the router's asynchronous initial mount. A static
    // FAB can be visible before it has listeners; use a rendered Today marker.
    await page.locator('.day-tile').first().waitFor();
    await page.locator("#floatingAddButton").click();
    const input = page.locator("#manualFoodName");
    await input.fill("banana");
    await page.locator(".suggestion-card").filter({ hasText: "QA banana" }).click();
    await page.locator("#closeFoodModal").click();
    assert.equal(await input.inputValue(), "banana");
    await page.locator(".ux-search-clear").click();
    assert.equal(await input.inputValue(), ""); assert.equal(await page.evaluate(() => document.activeElement.id), "manualFoodName");
    await page.locator("#foodScanButton").click();
    await page.keyboard.press("Escape");
    await page.locator('.unified-scanner').waitFor({state:'detached'});
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(await page.locator("#foodSection").evaluate(el => el.classList.contains("is-adding")), true);
    await page.locator("#closeFoodModal").click();
    for (let i = 0; i < 3; i++) {
      await page.locator("#foodLogOptionsButton:visible,[data-empty-food-action=reuse]").click();
      await page.locator("#foodReusePanel").evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
      assert.equal(await page.evaluate(() => document.body.style.position), "fixed");
      const handle = await page.locator("#foodReuseDragZone").boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + 10); await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + 100, { steps: 6 }); await page.mouse.up();
      await page.locator("#foodReusePanel").waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => document.body.style.position), "");
    }
    await page.locator("#foodLogOptionsButton:visible,[data-empty-food-action=reuse]").click();
    await page.locator("#foodReusePanel").evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
    await page.locator('[data-reuse-action="copy-date"]').click();
    await page.evaluate(() => Object.defineProperty(navigator, "standalone", { configurable: true, value: true }));
    async function edge(type, dx, dy) {
      await page.evaluate(({ type, dx, dy }) => {
        const panel = document.querySelector("#foodReusePanel"), rect = panel.getBoundingClientRect();
        const touch = (x,y) => new Touch({ identifier: 1, target: panel, clientX: rect.left + x, clientY: rect.top + y });
        panel.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(4,60)] }));
        panel.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [touch(4+dx,60+dy)] }));
        panel.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: [] }));
      }, { type, dx, dy });
    }
    await edge("touchcancel", 180, 0);
    assert.equal(await page.locator("#foodReuseBack").isVisible(), true);
    // A short vertical gesture must not become semantic Back. A deliberate
    // downward content flick now dismisses the sheet (covered by touch QA).
    await edge("touchend", 8, 16);
    await page.locator("#foodReusePanel").evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
    assert.equal(await page.locator("#foodReuseBack").isVisible(), true);
    await edge("touchend", 180, 0);
    // Reuse is a bottom sheet, not a horizontal nested page. Its existing
    // visible Back remains authoritative; horizontal movement never borrows it.
    assert.equal(await page.locator("#foodReuseBack").isVisible(), true);
    await page.locator("#foodReuseBack").click();
    assert.equal(await page.locator("#foodReuseBack").isVisible(), false);
    assert.equal(await page.locator("#foodReusePanel").isVisible(), true);
    // A cancelled handle drag leaves the sheet open and scroll ownership intact.
    const cancelHandle = await page.locator("#foodReuseDragZone").boundingBox();
    await page.mouse.move(cancelHandle.x + 60, cancelHandle.y + 10); await page.mouse.down();
    await page.mouse.move(cancelHandle.x + 60, cancelHandle.y + 35);
    await page.evaluate(() => window.dispatchEvent(new Event("resize"))); await page.mouse.up();
    // Cancellation now uses the shared 180ms snap-back. Measure the settled
    // sheet, not that animation's still-interpolated 25px drag offset.
    await page.locator("#foodReusePanel").evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
    assert.equal(await page.locator("#foodReusePanel").isVisible(), true);
    assert.equal(await page.locator("#foodReusePanel").evaluate(el => el.style.translate), "");
    await page.screenshot({ path: `artifacts/modern-ux-sheet-${width}-${reducedMotion}.png` });
    // Synthetic visual viewport: verifies layout arithmetic, not an iPhone keyboard.
    await page.evaluate(async () => {
      const viewport = new EventTarget(); Object.assign(viewport, { height: 420, offsetTop: 30, scale: 1 });
      // The shared viewport owner also subscribes to window resize/scroll.
      // Supply the real EventTarget contract in this synthetic fixture.
      const fakeWin = Object.assign(new EventTarget(), { visualViewport: viewport, innerHeight: 844, document, requestAnimationFrame: requestAnimationFrame.bind(window), cancelAnimationFrame: cancelAnimationFrame.bind(window) });
      const { bindSurfaceViewport } = await import("/mobile-surface.js?v=1");
      window.qaReleaseViewport = bindSurfaceViewport(document.querySelector("#foodReusePanel"), fakeWin);
    });
    const bounds = await page.locator("#foodReusePanel").boundingBox();
    assert.ok(bounds.y >= 29 && bounds.y + bounds.height <= 451, JSON.stringify(bounds));
    await page.evaluate(() => window.qaReleaseViewport());
    await page.locator("#foodReuseClose").click(); await page.locator("#foodReusePanel").waitFor({ state: "hidden" });
    await page.locator('.mobile-tabbar a[href="assistant.html"]').click();
    await page.locator("#assistantContextDisclosure").click();
    await page.locator("#assistantContextDone").click();
    await page.locator("#assistantHistoryOpen").click();
    await page.locator("#assistantHistory").waitFor({ state: "visible" });
    await page.locator("#assistantHistory").evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))));
    await page.screenshot({ path: `artifacts/modern-ux-history-${width}-${reducedMotion}.png` });
    await page.keyboard.press("Escape");
    await page.locator("#assistantHistory").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.body.style.position), "");
    assert.deepEqual(errors, []);
    console.log(`PASS ${width} ${reducedMotion}: search/back/clear, nested Escape, repeat drag-dismiss, viewport bounds, history focus/close, scroll unlock.`);
    await context.close();
  }
} finally { await browser.close(); }
