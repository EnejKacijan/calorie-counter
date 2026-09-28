import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { webkit } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.INTAKE_URL || 'http://127.0.0.1:3002';
const out = 'artifacts/post-push-mobile';
await mkdir(out, { recursive: true });
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  colorScheme: 'dark', serviceWorkers: 'block', recordVideo: { dir: out, size: { width: 390, height: 844 } } });
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  if (!localStorage.getItem('calorie-counter-state')) localStorage.setItem('calorie-counter-state', JSON.stringify({
    user: { name: 'QA', age: 30, sex: 'male', heightCm: 180, weightKg: 75,
      targetWeightKg: 72, goalType: 'lose', activityMultiplier: 1.375, weeklyRateKg: .5 },
    goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: {}, progress: [], theme: 'dark',
  }));
  sessionStorage.setItem('calorie-counter-today-session-v1', 'active');
});
const page = await context.newPage();
const video = page.video();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const report = { qualification: 'Windows WebKit, synthetic profile and touch events; NOT physical iPhone', roots: [], gestures: [], camera: {}, peer: {} };
async function swipe(x, y, distance, cancel = false, sample) {
  const target = await page.evaluate(({ x, y }) => {
    window.qaGestureTarget = document.elementFromPoint(x, y);
    return `${qaGestureTarget?.tagName || 'NONE'}.${qaGestureTarget?.className || ''}`;
  }, { x, y });
  const send = (type, px) => page.evaluate(({ type, px, y }) => {
    const t = { identifier: 31, clientX: px, clientY: y, target: qaGestureTarget };
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [t] }, changedTouches: { value: [t] } });
    qaGestureTarget.dispatchEvent(event);
  }, { type, px, y });
  await send('touchstart', x);
  for (let i = 1; i <= 10; i++) {
    await send('touchmove', x + distance * i / 10);
    await page.waitForTimeout(22);
    if (i === 5 && sample) await sample();
  }
  const mid = await page.evaluate(() => ({ active: !!document.querySelector('[data-edge-back-active],[data-peer-active]'),
    addX: document.querySelector('.add-flow-host')?.getBoundingClientRect().x,
    scanX: document.querySelector('.unified-scanner')?.getBoundingClientRect().x,
    track: document.querySelector('.peer-pane-track')?.getBoundingClientRect().toJSON() }));
  await send(cancel ? 'touchcancel' : 'touchend', x + distance);
  await page.waitForTimeout(330);
  return { target, mid };
}
try {
  await page.goto(`${base}/index.html`);
  for (const [label, href, selector] of [
    ['Today', 'index.html', '#calendarStrip'], ['Assistant', 'assistant.html', '#assistantInput'],
    ['Progress', 'progress.html', '#progressChart'], ['Profile', 'profile.html', '#profileSettingsOverview'],
    ['Today', 'index.html', '#calendarStrip'],
  ]) {
    if (label !== 'Today' || report.roots.length) await page.locator(`.mobile-tabbar a[href="${href}"]`).click();
    await page.locator(selector).waitFor({ state: 'visible', timeout: 12000 });
    assert.equal(await page.locator('#appStartupStatus[role="alert"]').count(), 0);
    report.roots.push({ label, url: page.url(), selected: await page.locator('.mobile-tabbar [aria-current="page"]').getAttribute('href') });
  }
  await page.screenshot({ path: `${out}/A-roots-today-390-dark.png` });
  await page.locator('#floatingAddButton').click();
  await page.locator('#foodSection.add-flow-surface').waitFor();
  await page.waitForTimeout(280);
  const rect = await page.locator('#foodSection').boundingBox();
  const y = Math.min(rect.y + 300, 520);
  report.addEdgeGeometry = await page.evaluate(y => ({
    left: document.querySelector('#foodSection').getBoundingClientRect().left,
    edgeHit: document.elementFromPoint(8, y)?.id,
  }), y);
  const cancel = await swipe(8, y, 80, true, () => page.screenshot({ path: `${out}/B-add-partial-390-dark.png` }));
  assert.ok(cancel.mid.addX > 60, JSON.stringify(cancel));
  assert.equal(await page.locator('#foodSection.add-flow-surface').count(), 1);
  const commit = await swipe(8, y, 230, false);
  assert.ok(commit.mid.addX > 180, JSON.stringify(commit));
  assert.equal(await page.locator('.add-flow-host').count(), 0);
  report.gestures.push({ screen: 'Add', cancel, commit });
  await page.locator('#floatingAddButton').click();
  await page.locator('#foodSection.add-flow-surface').waitFor();
  await page.locator('[data-food-filter="recent"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-food-filter="usda"]').click();
  await page.waitForTimeout(65);
  report.peer = await page.evaluate(() => {
    const track = document.querySelector('.peer-pane-track');
    return { gap: track && getComputedStyle(track).columnGap,
      width: document.querySelector('.food-filter-viewport')?.getBoundingClientRect().width,
      paneWidth: track?.firstElementChild.getBoundingClientRect().width,
      overflowX: document.documentElement.scrollWidth > innerWidth };
  });
  await page.screenshot({ path: `${out}/D-peer-gutter-390-dark.png` });
  assert.equal(report.peer.gap, '8px');
  assert.equal(report.peer.width, report.peer.paneWidth);
  assert.equal(report.peer.overflowX, false);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.qaCameraRequests = 0;
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'prompt' }) } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      qaCameraRequests++;
      throw new DOMException('QA permission denied', 'NotAllowedError');
    } } });
  });
  await page.locator('#foodScanButton').click();
  await page.locator('.unified-scanner').waitFor();
  await page.waitForTimeout(100);
  report.camera.beforeActivation = await page.evaluate(() => qaCameraRequests);
  assert.equal(report.camera.beforeActivation, 0);
  assert.equal(await page.locator('[data-gallery]').isEnabled(), true);
  await page.locator('[data-camera-retry]').click();
  await page.locator('.unified-scanner[data-camera-state="denied"]').waitFor();
  report.camera.afterActivation = await page.evaluate(() => qaCameraRequests);
  assert.equal(report.camera.afterActivation, 1);
  const scanBox = await page.locator('.unified-scanner').boundingBox();
  const scan = await swipe(8, Math.min(scanBox.y + 300, 520), 230);
  assert.ok(scan.mid.scanX > 180, JSON.stringify(scan));
  assert.equal(await page.locator('.unified-scanner').count(), 0);
  report.gestures.push({ screen: 'Scan food', commit: scan });
  await page.screenshot({ path: `${out}/C-scan-return-390-dark.png` });
  await page.locator('#foodScanButton').click();
  await page.locator('.unified-scanner').waitFor();
  await page.waitForTimeout(100);
  report.camera.afterReenter = await page.evaluate(() => qaCameraRequests);
  assert.equal(report.camera.afterReenter, 1);
  await page.screenshot({ path: `${out}/E-camera-reentry-390-dark.png` });
  await page.locator('.package-scan-close').click();
  await page.locator('.unified-scanner').waitFor({ state: 'detached' });
  await page.evaluate(() => {
    window.qaLateTrackStops = 0;
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'granted' }) } });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => {
      qaCameraRequests++;
      return new Promise(resolve => window.qaLateCameraResolve = resolve);
    } } });
  });
  await page.locator('#foodScanButton').click();
  await page.locator('.unified-scanner[data-camera-state="starting"]').waitFor();
  report.camera.grantedAutoRequests = await page.evaluate(() => qaCameraRequests);
  assert.equal(report.camera.grantedAutoRequests, 2);
  await page.locator('.package-scan-close').click();
  await page.locator('.unified-scanner').waitFor({ state: 'detached' });
  await page.evaluate(() => qaLateCameraResolve({ getTracks: () => [{ stop: () => qaLateTrackStops++ }] }));
  await page.waitForTimeout(40);
  report.camera.lateTrackStops = await page.evaluate(() => qaLateTrackStops);
  assert.equal(report.camera.lateTrackStops, 1);
  assert.deepEqual(errors, []);
  report.errors = errors;
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close();
  await video.saveAs(`${out}/A-E-webkit-synthetic-390-dark.webm`);
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
}
