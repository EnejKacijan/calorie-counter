import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "Scanner QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 70, goalType: "lose", activityMultiplier: 1.375, weeklyRateKg: .5 }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: {}, progress: [], theme: "dark" }));
    localStorage.setItem("calorie-counter-ai-consent-v1", '{"photo":true,"label":true}');
    window.qaTracks = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#55594e"; ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#eee9df"; ctx.font = "24px sans-serif"; ctx.fillText("Simulated camera · QA", 160, 240);
      const stream = canvas.captureStream(5); window.qaTracks.push(...stream.getTracks()); return stream;
    };
  });
  const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
  let calls = 0;
  await page.route("**/api/foods/analyze-image", route => { calls++; return route.fulfill({ json: { analysis: { foods: [], outcome: "no_food" } } }); });
  await page.goto(process.env.INTAKE_URL || "http://127.0.0.1:3001");
  await page.locator("#floatingAddButton").click();
  await page.locator("#foodScanButton").click();
  await page.waitForFunction(() => !document.querySelector("[data-shutter]").disabled);
  await page.screenshot({ path: "review-package/unified-scanner-live.png" });
  await page.locator("[data-mode=barcode]").click();
  await page.waitForFunction(() => !document.querySelector("[data-shutter]").disabled, null, { timeout: 10000 }).catch(async error => { console.log(await page.locator("dialog").innerText()); throw error; });
  // Mode tabs share one camera preview; changing processing mode must not
  // restart the live stream or request camera permission again.
  assert.equal(await page.evaluate(() => qaTracks.length), 1);
  assert.equal(await page.evaluate(() => qaTracks[0].readyState), "live");
  await page.locator("[data-mode=food]").click();
  await page.waitForFunction(() => !document.querySelector("[data-shutter]").disabled);
  await page.locator("[data-shutter]").click();
  await page.locator("#scanNoFood").waitFor();
  assert.equal(calls, 1);
  assert.equal(await page.evaluate(() => qaTracks.every(track => track.readyState === "ended")), true);
  await page.locator("#scanNoFoodRetry").click();
  await page.locator('.unified-scanner .scanner-photo-preview:visible').waitFor();
  assert.equal(await page.evaluate(() => qaTracks.every(track => track.readyState === "ended")), true);
  await page.locator('[data-mode=barcode]').click();
  await page.waitForFunction(() => !document.querySelector("[data-shutter]").disabled);
  await page.locator(".package-scan-close").click();
  await page.locator('.unified-scanner').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => qaTracks.every(track => track.readyState === "ended")), true);
  await page.locator('#foodScanButton').click();
  await page.waitForFunction(() => !document.querySelector("[data-shutter]").disabled);
  // Backgrounding stops live tracks without removing picker inputs or the dialog.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  assert.equal(await page.evaluate(() => qaTracks.every(track => track.readyState === "ended")), true);
  assert.equal(await page.locator(".unified-scanner").count(), 1);
  assert.equal(await page.locator("[data-gallery-file]").count(), 1);
  assert.equal(await page.locator("[data-gallery]").isEnabled(), true);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await page.locator('[data-camera-retry]').click();
  await page.waitForFunction(() => !document.querySelector("[data-shutter]").disabled);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  assert.equal(await page.locator(".unified-scanner").count(), 0);
  assert.equal(await page.evaluate(() => qaTracks.every(track => track.readyState === "ended")), true);
  assert.deepEqual(errors, []);
  console.log("PASS: simulated live preview, mode change retains one stream, capture/close/background/pagehide stop tracks; picker survives backgrounding; one photo request reaches existing empty result. Physical iOS remains unverified.");
} finally { await browser.close(); }
