import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", acceptDownloads: true });
const page = await context.newPage(); const errors = [];
page.on("pageerror", error => errors.push(error.message));
const origin = process.env.INTAKE_URL || "http://127.0.0.1:3001";
try {
  await page.goto(new URL("profile.html", origin).href);
  await page.evaluate(() => localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "Release QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 70, goalType: "lose", activityMultiplier: 1.375, weeklyRateKg: .5 }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: {}, progress: [], theme: "light" })));
  await page.reload();await page.locator('#profilePrivacyOpen').click(); await page.locator("#privacyControls").waitFor();
  assert.equal(await page.locator("#profileAge").getAttribute("min"), "18");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("#privacyControls").scrollIntoViewIfNeeded();
  await page.screenshot({ path: fileURLToPath(new URL("../review-package/release-prep-profile.png", import.meta.url)) });
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export backup", exact: true }).click(); assert.match((await download).suggestedFilename(), /intake-backup/);
  page.once("dialog", dialog => dialog.dismiss());
  const cancelled = await page.evaluate(async () => {
    const { consentFetch } = await import("/privacy-controls.js?v=1"); let calls = 0;
    try { await consentFetch(async () => { calls++; }, "/api/foods/analyze-image", { method: "POST" }); } catch (e) { return { calls, message: e.message }; }
  });
  assert.equal(cancelled.calls, 0); assert.match(cancelled.message, /Not sent/);
  page.once("dialog", dialog => dialog.accept());
  const allowed = await page.evaluate(async () => {
    const { consentFetch } = await import("/privacy-controls.js?v=1");
    return consentFetch(async (input, options) => options.headers.get("X-Intake-AI-Consent"), "/api/foods/analyze-image", { method: "POST" });
  }); assert.equal(allowed, "1");
  await page.getByRole("button", { name: "Reset AI permissions" }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem("calorie-counter-ai-consent-v1")), null);
  await page.locator("#privacyControls input[type=file]").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await page.getByText(/Restore failed:/).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("calorie-counter-state")).user.name), "Release QA");
  const backupText = await page.evaluate(async () => (await import("/privacy-controls.js?v=1")).storage.export());
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#privacyControls input[type=file]").setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(backupText) });
  await page.waitForEvent("load");await page.locator('#profilePrivacyOpen').click(); await page.locator("#privacyControls").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("calorie-counter-state")).user.name), "Release QA");
  await page.evaluate(async () => {
    const { storage } = await import("/privacy-controls.js?v=1");
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("calorie-counter-")) throw new DOMException("Full", "QuotaExceededError"); return original.call(this, key, value); };
    storage.setItem("calorie-counter-theme", "dark");
  });
  await page.locator("#storageWarning").waitFor(); assert.match(await page.locator("#storageWarning").innerText(), /only in memory/);
  await page.reload();await page.locator('#profilePrivacyOpen').click(); await page.locator("#privacyControls").waitFor();
  await page.evaluate(() => { const state = JSON.parse(localStorage.getItem("calorie-counter-state")); state.user.age = 17; localStorage.setItem("calorie-counter-state", JSON.stringify(state)); });
  await page.goto(new URL("/index.html", origin).href); await page.waitForURL("**/profile.html"); await page.locator("#profileAge").waitFor();
  assert.equal(await page.locator("#profileAge").evaluate(input => input.checkValidity()), false);
  await page.locator('#profileCancelButton').click();
  await page.locator('#profilePrivacyOpen').click();
  await page.locator('[data-action=erase]').click();
  await page.locator('#deleteDataConfirm button[value=cancel]').click();
  assert.notEqual(await page.evaluate(() => localStorage.getItem("calorie-counter-state")), null);
  await page.locator('[data-action=erase]').click();
  await Promise.all([page.waitForEvent("load"), page.locator('#deleteDataConfirmButton').click()]);
  await page.locator('#onboarding[data-step="0"]').waitFor({state:'visible'});
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("calorie-counter-state") || "null")?.user ?? null), null);
  const denied = await context.request.post(new URL("/api/foods/estimate-text", origin).href, { data: { description: "test" } }); assert.equal(denied.status(), 403);
  const missing = await context.request.get(new URL("/missing-module.js", origin).href); assert.equal(missing.status(), 404); assert.match(missing.headers()["content-type"], /text\/plain/);
  assert.deepEqual(errors, []); console.log("PASS: mobile layout, export, invalid/valid restore, quota warning, consent deny/allow/reset, adult gate, erase cancel/confirm, API consent gate, static 404. No external AI requests made.");
} finally { await browser.close(); }
