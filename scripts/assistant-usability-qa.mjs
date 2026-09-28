import { qaWidths, qaHeight, qaOutput, pwaOptions, preparePwa, preparePwaPage, pwaAudit } from "./pwa-qa-context.mjs";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const base = process.env.INTAKE_URL || "http://127.0.0.1:3001";
const output = qaOutput("assistant-usability");
mkdirSync(output, { recursive: true });
const results = [];
const key = "calorie-counter-assistant-conversations-v1";

async function fixture(width, theme, hasTouch = true, offlineCache = false) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch, serviceWorkers: offlineCache ? "allow" : "block", ...pwaOptions(width) });
    await preparePwa(context, width);
  await context.addInitScript(theme => {
    if (sessionStorage.getItem("assistant-qa-seeded")) return;
    sessionStorage.setItem("assistant-qa-seeded", "true");
    const days = {};
    for (let offset = 0; offset <= 30; offset++) {
      const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - offset);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days[date] = { foods: [{ id: `qa-${offset}`, name: `QA oats ${offset}`, amount: 150, unit: "g", meal: "breakfast", calories: 200, protein: 12, carbs: 30, fat: 4 }], exercises: [] };
    }
    localStorage.setItem("calorie-counter-state", JSON.stringify({ user: { name: "Assistant QA", age: 30, sex: "male", heightCm: 180, weightKg: 75, targetWeightKg: 75, goalType: "maintain", activityMultiplier: 1.375, weeklyRateKg: .5, theme }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days, progress: [], theme }));
    localStorage.setItem("calorie-counter-ai-consent-v1", JSON.stringify({ assistant: true }));
  }, theme);
  const page = await context.newPage(); await preparePwaPage(page); page.setDefaultTimeout(8000);
  const errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  let outcome = "ok", release;
  await page.route("**/api/assistant/chat", async route => {
    requests.push(route.request().postDataJSON());
    const current = outcome;
    if (current === "pending") await new Promise(resolve => { release = resolve; });
    if (current === "network") return route.abort("internetdisconnected");
    await route.fulfill(current === "fail" ? { status: 503, json: { error: "Intake couldn't reply. Try again." } }
      : { json: { message: "Your recent meals include regular protein sources. You could pair oats with yogurt for a little more protein." + (pwaAudit ? "\n" + "Long message ".repeat(50) + "longword".repeat(30) : "") } });
  });
  await page.goto(`${base}/assistant.html`);
  await page.locator("#assistantTitle").waitFor();
  // A static heading exists before startup completes; programmatic fill() can
  // bypass inert semantics, unlike a real user's focus/tap.
  await page.waitForFunction(() => !document.body.hasAttribute("data-app-loading"));
  const input = page.locator("#assistantInput");
  const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), key);
  const settled = () => page.waitForFunction(() => !document.querySelector("#assistantInput").disabled && document.querySelectorAll(".assistant-message").length > 0);
  const send = async text => { await page.locator('#assistantContextControls').waitFor({state:'hidden'}); await input.fill(text); await page.locator("#assistantSend").click(); await settled(); };
  const shot = async name => {
    await page.locator(".assistant-messages").evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
    if (width === 390) await page.screenshot({ path: `${output}/390-${theme}-${name}.png` });
  };
  return { context, page, input, saved, settled, send, shot, requests, errors, setOutcome: value => { outcome = value; }, release: () => release() };
}

async function assertFits(page) {
  const bounds = await page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height }; };
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, nav: rect(".mobile-tabbar"), input: rect("#assistantInput"), send: rect("#assistantSend"), conversation: rect(".assistant-conversation"), history: rect("#assistantHistoryOpen"), new: rect("#assistantClear") };
  });
  assert.ok(bounds.scrollWidth <= bounds.width + 1, JSON.stringify(bounds));
  assert.ok(bounds.input.y >= 0 && bounds.send.bottom <= bounds.nav.y && bounds.send.right <= bounds.width, JSON.stringify(bounds));
  assert.ok(bounds.conversation.height >= 32, JSON.stringify(bounds));
  for (const button of [bounds.history, bounds.new].filter(button=>button.height>0)) assert.ok(button.x >= 0 && button.right <= bounds.width && button.height >= 44, JSON.stringify(bounds));
}

try {
  for (const width of (process.env.QA_WIDTHS ? process.env.QA_WIDTHS.split(",").map(Number) : qaWidths())) for (const theme of ["light", "dark"]) {
    const f = await fixture(width, theme);
    const { page, input, requests } = f;
    assert.equal(await page.locator("#assistantTitle").textContent(), "Ask Intake");
    assert.equal(await page.locator("#assistantTitle").isVisible(), true);
    assert.equal(await page.locator("#assistantHistoryOpen").isVisible(), true);
    assert.equal(await page.locator("#assistantContextDisclosure").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator("#assistantContextControls").isVisible(), false);
    assert.equal(await page.locator("[data-assistant-prompt]").count(), 4);
    await assertFits(page); await f.shot("empty");
    await input.fill("Review my protein"); await input.press("Enter");
    assert.equal(await input.inputValue(), "Review my protein\n");
    assert.equal(requests.length, 0, "mobile Return must not send");
    await input.press("Shift+Enter");
    assert.equal(await input.inputValue(), "Review my protein\n\n");
    await f.send("How could I improve my protein?");
    assert.equal((await f.saved())[0].messages.length, 2);
    assert.deepEqual(requests[0].history, []);
    assert.equal(requests[0].appContext.rangeDays, 7);
    assert.equal(requests[0].appContext.days[0].foods[0].name, "QA oats 6");
    await f.shot("active");
    // Unchanged live-region nodes must remain intact while subsequent sends run.
    await page.evaluate(() => { window.qaFirstReply = document.querySelector(".assistant-message.is-assistant"); });
    await page.locator("#assistantContextDisclosure").click();
    assert.equal(await page.locator("#assistantContextControls").isVisible(), true);
    await page.locator("#assistantRange").selectOption("30");
    assert.match(await page.locator("#assistantContextNote").textContent(), /sent only when you ask/);
    await f.shot("context-open"); await assertFits(page);
    await page.locator("#assistantContextDone").click();
    await f.send("Review the last month");
    assert.equal(requests.at(-1).appContext.days.length, 30);
    assert.equal(requests.at(-1).appContext.days[0].foods[0].name, "QA oats 29");
    assert.equal(await page.evaluate(() => window.qaFirstReply === document.querySelector(".assistant-message.is-assistant")), true);
    // Capture context once: changes while in flight apply to the next send only.
    f.setOutcome("pending");
    await input.fill("Capture this context"); await page.locator("#assistantSend").click();
    await page.waitForFunction(() => document.querySelector("#assistantInput").disabled);
    await page.locator("#assistantContextDisclosure").click();
    await page.locator(".assistant-context-toggle").click();
    assert.equal(await page.locator("#assistantDiaryToggle").isChecked(), false);
    await page.locator("#assistantContextDone").click();
    const before = requests.length;
    await page.locator("#assistantForm").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    assert.equal(requests.length, before);
    assert.equal(requests.at(-1).appContext.rangeDays, 30);
    assert.equal(await page.locator("#assistantSendStatus").textContent(), "Intake is thinking.");
    f.release(); await f.settled();
    f.setOutcome("ok"); await f.send("Only what I write");
    assert.deepEqual(requests.at(-1).appContext, { diaryEnabled: false });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#assistantContextDisclosure").getAttribute("aria-expanded"), "false");
    await page.locator("#assistantClear").click();
    assert.equal(await input.inputValue(), "");
    // A failed turn stays persisted, carries recovery UI, and retries unchanged.
    f.setOutcome("fail"); await f.send("Can you review my meals?");
    const failedId = (await f.saved()).find(c => c.messages.length === 1).id;
    const turn = (await f.saved()).find(c => c.id === failedId).messages[0];
    assert.equal(await page.locator(".is-user [data-assistant-retry]").count(), 1);
    assert.equal(await page.locator(".is-assistant").count(), 0);
    assert.match(await page.locator("#assistantSendStatus").textContent(), /No reply received/);
    await f.shot("failed-retry");
    f.setOutcome("network"); await page.locator("[data-assistant-retry]").click(); await f.settled();
    assert.equal((await f.saved()).find(c => c.id === failedId).messages.length, 1);
    assert.deepEqual(requests.at(-1).history, []);
    assert.equal(requests.at(-1).message, turn.content);
    await page.reload(); await page.locator("[data-assistant-retry]").waitFor();
    assert.equal(await input.inputValue(), turn.content);
    await input.fill("Instead, help me plan breakfast");
    f.setOutcome("fail"); await page.locator("[data-assistant-retry]").click(); await f.settled();
    const edited = (await f.saved()).find(c => c.id === failedId).messages;
    assert.equal(edited.length, 1); assert.equal(edited[0].createdAt, turn.createdAt);
    assert.equal(edited[0].content, "Instead, help me plan breakfast");
    assert.deepEqual(requests.at(-1).history, []);
    // Navigation preserves the failed turn and its editable draft.
    await input.fill("Edited after navigating");
    await page.locator('.mobile-tabbar a[href="progress.html"]').click();
    await page.locator('.mobile-tabbar a[href="assistant.html"]').click();
    assert.equal(await input.inputValue(), "Edited after navigating");
    f.setOutcome("ok"); await page.locator("[data-assistant-retry]").click(); await f.settled();
    assert.deepEqual(requests.at(-1).history, []);
    await page.reload(); await page.locator("#assistantTitle").waitFor();
    assert.equal(await page.locator("[data-assistant-retry]").count(), 0);
    assert.equal(await input.inputValue(), "");
    const complete = (await f.saved()).find(c => c.id === failedId).messages;
    assert.equal(complete.length, 2); assert.equal(complete[0].content, "Edited after navigating");
    // History hierarchy, focus trap/restore, and selection.
    await page.locator("#assistantHistoryOpen").click();
    await page.waitForFunction(() => document.activeElement.id === "assistantHistoryTitle");
    await page.locator('#assistantHistoryClose').focus();
    await f.shot("history");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "assistantHistoryDeleteAll");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "assistantHistoryClose");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement.id === "assistantHistoryOpen");
    assert.equal(await page.evaluate(() => document.body.style.position), "");
    await page.locator("#assistantHistoryOpen").click();
    await page.locator(`#assistantHistory .assistant-history-select[data-conversation-id="${failedId}"]`).click();
    await page.locator("#assistantHistory").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#assistantHistory").isVisible(), false);
    assert.equal(await page.locator(".assistant-message").count(), 2);
    // A small layout viewport is not itself a keyboard. The shell follows CSS
    // while the separate shell matrix covers a shrinking visual viewport/IME.
    await page.setViewportSize({ width, height: 480 });
    await page.waitForFunction(() => Math.abs(document.querySelector("#appShell").getBoundingClientRect().bottom - innerHeight) < 1 && !document.querySelector("#appShell").style.getPropertyValue("--assistant-viewport-height"));
    await input.fill("A multiline draft\nwith another line\nand one more");
    await assertFits(page);
    await page.locator("#assistantContextDisclosure").click(); await assertFits(page);
    if (pwaAudit && width === 390) await page.screenshot({path:`${output}/390-${theme}-keyboard-context.png`});
    await page.keyboard.press("Escape");
    assert.deepEqual(f.errors, []);
    results.push({ width, theme, requests: requests.length, result: "PASS", checks: "empty/active/context/7&30&off/snapshot/loading guard/retry/edited/repeated/reload/navigation/history focus/480px keyboard" });
    console.log(`PASS ${width}px ${theme}: ${results.at(-1).checks}`);
    await f.context.close();
  }
  const f = await fixture(1280, "light", false);
  await f.input.fill("Desktop"); await f.input.press("Shift+Enter");
  assert.equal(await f.input.inputValue(), "Desktop\n"); assert.equal(f.requests.length, 0);
  await f.input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  assert.equal(f.requests.length, 0);
  await f.input.press("Enter"); await f.settled();
  assert.equal(f.requests.length, 1);
  assert.equal(await f.page.locator("#assistantContextControls").isVisible(), false);
  await f.page.locator("#assistantContextDisclosure").click();
  assert.equal(await f.page.locator("#assistantContextControls").isVisible(), true);
  assert.deepEqual(f.errors, []);
  await f.context.close();
  const tablet = await fixture(1024, "dark", true);
  await tablet.input.fill("Tablet"); await tablet.input.press("Enter");
  assert.equal(await tablet.input.inputValue(), "Tablet\n"); assert.equal(tablet.requests.length, 0);
  await tablet.context.close();
  results.push({ result: "PASS", checks: "1280 desktop Enter/Shift+Enter/IME/disclosure; 1024 touch Return" });
  console.log("PASS desktop keyboard and touch tablet Return");
  const offline = await fixture(390, "dark", true, true);
  offline.setOutcome("fail"); await offline.send("Keep my failed turn offline");
  await offline.page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await offline.page.reload(); await offline.page.locator("[data-assistant-retry]").waitFor();
  await offline.context.setOffline(true);
  await offline.page.reload(); await offline.page.locator("[data-assistant-retry]").waitFor();
  assert.equal(await offline.page.locator("#assistantTitle").isVisible(), true);
  assert.equal(await offline.page.locator(".assistant-header").evaluate(el => getComputedStyle(el).display), "grid");
  assert.equal(await offline.input.inputValue(), "Keep my failed turn offline");
  // Chromium may retain an online hint under SW; exercise the guard explicitly
  // as well as the actual network-offline cold reload above.
  await offline.page.evaluate(() => Object.defineProperty(navigator, "onLine", { value: false, configurable: true }));
  const offlineRequests = offline.requests.length;
  await offline.page.locator("[data-assistant-retry]").click(); await offline.settled();
  assert.equal(offline.requests.length, offlineRequests);
  assert.equal((await offline.saved())[0].messages.length, 1);
  await offline.context.setOffline(false); await offline.page.reload();
  await offline.page.locator("[data-assistant-retry]").waitFor();
  offline.setOutcome("ok"); await offline.page.locator("[data-assistant-retry]").click(); await offline.settled();
  assert.equal((await offline.saved())[0].messages.length, 2);
  assert.deepEqual(offline.requests.at(-1).history, []);
  assert.deepEqual(offline.errors, []); await offline.context.close();
  results.push({ result: "PASS", checks: "Assistant service-worker cold reload offline, cached styles, failed-turn recovery, offline guard, online Retry" });
  console.log("PASS Assistant offline cold reload and reconnect Retry without duplicate turns");
  writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); }
