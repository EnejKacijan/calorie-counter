import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.INTAKE_URL || 'https://intake-ai.netlify.app';
const override = process.env.ROUTER_OVERRIDE === '1';
const browser = await webkit.launch({ headless: true });
const targets = [
  ['Assistant', '/assistant', '#assistantInput'],
  ['Progress', '/progress', '#progressChart'],
  ['Profile', '/profile', '#profileSettingsOverview'],
];
const results = [];
try {
  for (const [name, path, selector] of targets) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      localStorage.setItem('calorie-counter-state', JSON.stringify({
        user: { name: 'Root QA', sex: 'male', age: 30, heightCm: 180, weightKg: 75,
          targetWeightKg: 72, goalType: 'lose', activityMultiplier: 1.375, weeklyRateKg: 0.5 },
        goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 },
        progress: [], days: {}, theme: 'light',
      }));
    });
    const page = await context.newPage();
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(`${request.url()} ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    if (override) await page.route('**/app-router.js?*', async route => route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: await readFile(new URL('../public/app-router.js', import.meta.url)),
    }));
    await page.goto(new URL('/', base).href);
    await page.locator('#calendarStrip').waitFor({ timeout: 15000 });
    const before = { url: page.url(), selected: await page.locator('.mobile-tabbar [aria-current=page]').getAttribute('href'),
      controller: await page.evaluate(() => navigator.serviceWorker?.controller?.scriptURL || null) };
    await page.locator(`.mobile-tabbar a[href="${path}"]`).click();
    const result = await Promise.race([
      page.locator(selector).waitFor({ state: 'visible', timeout: 12000 }).then(() => 'loaded').catch(() => 'timeout'),
      page.locator('#appStartupStatus[role="alert"]').waitFor({ state: 'visible', timeout: 12000 }).then(() => 'startup-failed').catch(() => 'timeout'),
    ]);
    const after = { url: page.url(), selected: await page.locator('.mobile-tabbar [aria-current=page]').getAttribute('href').catch(() => null),
      startup: await page.locator('#appStartupStatus').textContent().catch(() => null) };
    results.push({ name, result, before, after, errors, failed });
    await context.close();
  }
  if (override) assert.ok(results.every(result => result.result === 'loaded'), JSON.stringify(results));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
