import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => { throw Error("QA camera denied"); } }, configurable: true });
    localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "Package QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 70, goalType: "lose", activityMultiplier: 1.375, weeklyRateKg: .5 }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: {}, progress: [], theme: "dark" }));
    localStorage.setItem("calorie-counter-ai-consent-v1", '{"label":true}');
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  const food = { name: "Test yogurt", source: "Open Food Facts", serving: "per 100g", servingGrams: 100, calories: 100, protein: 5, carbs: 12, fat: 3 };
  let lookups = 0;
  await page.route("**/api/foods/barcode?*", route => { lookups++; return route.fulfill({ json: { food } }); });
  let labelCalls = 0;
  await page.route("**/api/foods/analyze-label", route => route.fulfill({ json: { food: ++labelCalls === 1 ? null : { ...food, source: "Label · AI transcription" } } }));
  async function start(mode) { await page.goto(process.env.INTAKE_URL || "http://127.0.0.1:3001"); await page.locator("#floatingAddButton").click(); await page.locator("#foodScanButton").click(); await page.locator(`[data-mode="${mode}"]`).click(); }
  await start("barcode");
  await page.screenshot({ path: fileURLToPath(new URL("../review-package/barcode-dialog.png", import.meta.url)) });
  await page.locator("[data-code]").fill("3017620422004"); await page.locator("[data-find]").click();
  await page.getByText(/check digit does not match/).waitFor(); assert.equal(lookups, 0);
  await page.locator("[data-code]").fill("3017620422003"); await page.locator("[data-find]").click();
  await page.locator("#foodEditName").filter({ hasText: "Test yogurt" }).waitFor(); assert.equal(lookups, 1);
  await start("barcode");
  const base64 = await page.evaluate(() => {
    const A = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
    const B = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
    const code = "3017620422003", parity = "AABBBA";
    let bits = "101";
    for (let i=1;i<7;i++) bits += (parity[i-1] === "A" ? A : B)[Number(code[i])];
    bits += "01010";
    for (let i=7;i<13;i++) bits += A[Number(code[i])].replace(/[01]/g, bit => bit === "0" ? "1" : "0");
    bits += "101";
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 360;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0,0,600,360); ctx.fillStyle = "black";
    [...bits].forEach((bit,i) => { if (bit === "1") ctx.fillRect(60+i*5,50,5,240); });
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const image = { name: "barcode.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
  await page.locator("[data-gallery-file]").setInputFiles(image);
  await page.locator("#foodEditName").filter({ hasText: "Test yogurt" }).waitFor(); assert.equal(lookups, 2);
  await start("label");
  await page.locator("[data-gallery-file]").setInputFiles(image);
  await page.getByText(/Could not read complete nutrition/).waitFor();
  await page.locator("[data-gallery-file]").setInputFiles(image);
  await page.locator("#foodEditName").filter({ hasText: "Test yogurt" }).waitFor();
  await page.locator("#foodUnit").selectOption("g"); await page.locator("#foodAmount").fill("50"); await page.locator("#foodAmount").dispatchEvent("input");
  assert.equal(Number(await page.locator("#manualFoodCalories").inputValue()), 50);
  assert.deepEqual(errors, []);
  console.log("PASS: checksum validation, manual lookup, real local barcode decoding, unreadable label retry, reviewed label amount scaling. Provider responses mocked; no AI charges.");
} finally { await browser.close(); }
