import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
try {
  await page.goto(new URL("/profile.html", process.env.INTAKE_URL || "http://127.0.0.1:3001").href);
  await page.locator("#privacyControls h3").first().waitFor({ state: "attached" });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.locator("#privacyControls h3").first().waitFor({ state: "attached" });
  await context.setOffline(true);
  await page.reload(); await page.locator("#privacyControls h3").first().waitFor({ state: "attached" });
  assert.equal(await page.evaluate(async () => typeof (await import('/scanner-photo.js')).createScannerPhoto), 'function', 'food-photo preparation module is available in the offline app shell');
  assert.equal(await page.evaluate(async () => typeof (await import('/assistant-message-actions.js?v=1')).createAssistantMessageActions), 'function', 'Assistant message actions are available after an offline cold reload');
  assert.equal(await page.evaluate(async () => {
    const {formatFoodDisplayName} = await import('/food-display-name.js?v=1');
    return formatFoodDisplayName({name:'grilled sausage links',source:'OpenAI photo estimate'});
  }), 'Grilled sausage links', 'AI food-name display helper loads from the offline app shell');
  assert.deepEqual(await page.evaluate(async () => [
    typeof (await import('/touch-feedback.js?v=1')).mountTouchFeedback,
    (await fetch('/touch-feedback.css?v=1')).ok,
    document.documentElement.hasAttribute('data-touch-feedback-ready')
  ]), ['function', true, true], 'shared touch policy is cached and mounted after offline cold reload');
  assert.deepEqual(await page.evaluate(async () => {
    const reveal = await import('/disclosure-reveal.js?v=1');
    const group = await import('/scanned-meal-group.js?v=2');
    return [typeof reveal.createDisclosureReveal, reveal.disclosureRevealDuration, typeof group.bindScannedMealDisclosure];
  }), ['function', 200, 'function'], 'shared disclosure and scanned-group integration load offline');
  assert.deepEqual(await page.evaluate(async () => {
    const viewer = await import('/food-photo-ui.js?v=5');
    const motion = await import('/food-photo-motion.js?v=1');
    return [typeof viewer.createFoodPhotoViewer, viewer.foodPhotoTitle('meal'), motion.photoViewerTiming.opening];
  }), ['function', 'Meal photo', 180], 'photo viewer and its new motion owner load after an offline cold reload');
  assert.deepEqual(await page.evaluate(async () => {
    const surface = await import('/add-surface.js?v=11');
    const presentation = await import('/add-presentation.js?v=5');
    const nested = await import('/nested-page.js?v=2');
    return [typeof surface.createAddSurface, typeof presentation.createAddPresentation, nested.nestedFrames(true)[0].transform, nested.nestedPageTiming.opening.duration];
  }), ['function', 'function', 'translateX(18px)', 170], 'nested Edit Food and its shared motion dependencies load with the network offline');
  const result = await page.evaluate(async () => {
    // Some Chromium/SW combinations retain an online navigator hint after a
    // cached reload. Exercise the offline guard explicitly in addition to the
    // network-offline cold reload above.
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { consentFetch } = await import("/privacy-controls.js?v=1"); let sent = false;
    try { await consentFetch(async () => { sent = true; }, "/api/foods/estimate-text"); } catch (error) { return { sent, message: error.message }; }
  });
  assert.equal(result.sent, false); assert.match(result.message, /offline/); assert.deepEqual(errors, []);
  console.log("PASS: real service worker install, offline cold reload with new modules, and offline AI blocked before sending.");
} finally { await browser.close(); }
