import assert from 'node:assert/strict';
import { copyFile, mkdir } from 'node:fs/promises';
import { pw, setup, openFood, settle } from './add-flow-harness.mjs';
import { food } from './fixtures/food-search.mjs';

const out = process.env.INTAKE_QA_OUTPUT || 'artifacts/food-peer-surface';
await mkdir(out, { recursive: true });
const recent = Array.from({ length: 8 }, (_, index) => food(`surface-${index}`, `Recent ${index + 1}`, {
  source: 'Photo estimate', calories: 100 + index,
  lastUsedAt: new Date(Date.UTC(2026, 8, 28, 12 - index)).toISOString(),
}));
const active = page => page.locator('[data-food-filter][aria-pressed=true]').getAttribute('data-food-filter');

async function launchPage(browser, options) {
  const { foods = recent, ...setupOptions } = options;
  const { c, p } = await setup(browser, { ...setupOptions, beforeOpen: async ({ c }) => {
    await c.addInitScript(foods => {
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
      localStorage.setItem('calorie-counter-food-library', JSON.stringify(foods));
      localStorage.setItem('calorie-counter-saved-foods', '[]');
      localStorage.setItem('calorie-counter-saved-meals', '[]');
    }, foods);
  } });
  await openFood(p);
  await p.evaluate(() => {
    window.surfaceTouch = (type, x, y) => {
      if (type === 'touchstart') window.surfaceTarget = document.elementFromPoint(x, y);
      const point = { identifier: 77, target: surfaceTarget, clientX: x, clientY: y };
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [point] },
        changedTouches: { value: [point] },
      });
      surfaceTarget.dispatchEvent(event);
      return { target: surfaceTarget.tagName, inside: !!surfaceTarget.closest('#foodFilterViewport') };
    };
  });
  return { c, p };
}

async function gesture(page, x, y, direction, { distance = .18, commit = false, frames = false } = {}) {
  const width = (await page.locator('#foodFilterViewport').boundingBox()).width;
  const initial = await active(page);
  const start = await page.evaluate(({ x, y }) => surfaceTouch('touchstart', x, y), { x, y });
  assert.equal(start.inside, true, `touch ${start.target} belongs to peer viewport`);
  for (const fraction of [1 / 3, 2 / 3, 1]) {
    await page.evaluate(({ x, y }) => surfaceTouch('touchmove', x, y), {
      x: x + direction * width * distance * fraction, y,
    });
    if (frames) await page.waitForTimeout(35);
  }
  const during = await page.evaluate(() => {
    const viewport = document.querySelector('#foodFilterViewport');
    const track = viewport.querySelector('.peer-pane-track');
    return { viewport: viewport.getBoundingClientRect().toJSON(),
      panes: [...track?.children || []].map(node => ({ rect: node.getBoundingClientRect().toJSON(),
        actions: node.querySelector('.food-peer-actions')?.getBoundingClientRect().toJSON() })) };
  });
  assert.equal(during.panes.length, 2, 'one complete incoming and outgoing pane moves');
  assert.equal(await active(page), initial, 'semantic tab does not change during drag');
  for (const pane of during.panes) {
    assert.ok(Math.abs(pane.rect.width - during.viewport.width) < 1, 'pane spans viewport width');
    assert.ok(pane.rect.height >= during.viewport.height - 1, 'short pane fills viewport height');
    assert.ok(pane.actions.left >= pane.rect.left - 1 && pane.actions.right <= pane.rect.right + 1,
      'actions move inside their pane');
  }
  assert.ok(Math.abs(during.panes[1].rect.left - during.panes[0].rect.left - width) < 1,
    'both complete panes remain adjacent');
  const expectedLeft = during.viewport.left + (direction > 0 ? -width : 0) + direction * width * distance;
  assert.ok(Math.abs(during.panes[0].rect.left - expectedLeft) < 2,
    `entire pane follows the finger rather than only its contents: ${JSON.stringify({ actual: during.panes[0].rect.left, expectedLeft, direction, distance, width })}`);
  await page.evaluate(({ x, y, commit }) => surfaceTouch(commit ? 'touchend' : 'touchcancel', x, y), {
    x: x + direction * width * distance, y, commit,
  });
  await settle(page);
  assert.equal(await page.locator('.peer-pane-track').count(), 0, 'track cleans up');
  return initial;
}

async function geometry(page, { short = true } = {}) {
  const value = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    const content = document.querySelector('.add-flow-content');
    return { content: rect('.add-flow-content'), form: rect('#manualFoodForm'),
      tabs: rect('.food-filter-tabs'), viewport: rect('#foodFilterViewport'),
      pane: rect('#foodFilterViewport > .food-filter-pane'),
      scrollHeight: content.scrollHeight, clientHeight: content.clientHeight,
      scrollWidth: document.documentElement.scrollWidth, innerWidth };
  });
  assert.ok(value.viewport.top >= value.tabs.bottom, 'strip remains above the viewport');
  assert.ok(value.pane.height >= value.viewport.height - 1, 'pane owns blank visible area');
  assert.ok(value.scrollWidth <= value.innerWidth + 1, 'no horizontal document overflow');
  if (short) {
    assert.ok(Math.abs(value.viewport.bottom - (value.content.bottom - 16)) <= 2,
      `viewport reaches content box bottom: ${JSON.stringify(value)}`);
    assert.ok(value.scrollHeight <= value.clientHeight + 1, 'no phantom vertical scroll');
  }
  return value;
}

for (const engine of ['chromium', 'webkit']) {
  const browser = await pw[engine].launch(engine === 'chromium'
    ? { channel: 'msedge', headless: true } : { headless: true });
  try {
    for (const [width, height] of [[320, 667], [375, 667], [390, 844], [393, 852], [430, 932]]) {
      for (const theme of ['light', 'dark']) {
        const { c, p } = await launchPage(browser, { engine, width, height, theme, reduce: true });
        try {
          for (const [filter, direction] of [['all', -1], ['my', -1], ['recent', -1], ['usda', 1]]) {
            await p.locator(`[data-food-filter=${filter}]`).click();
            await settle(p);
            const box = await geometry(p, { short: filter === 'usda' });
            const fractions = width === 390 ? [.10, .25, .40, .55, .70, .85, .95] : [.10, .55, .95];
            const visibleTop = Math.max(box.viewport.top, box.content.top);
            const visibleBottom = Math.min(box.viewport.bottom, box.content.bottom - 16);
            for (const fraction of fractions) {
              const x = box.viewport.left + box.viewport.width * .5;
              const y = visibleTop + (visibleBottom - visibleTop) * fraction;
              await gesture(p, x, y, direction);
              assert.equal(await active(p), filter, `cancel preserves ${filter} at ${fraction}`);
            }
          }
          // Search/scan/filter controls are outside the peer gesture owner.
          const outside = await p.evaluate(() => ['#manualFoodName', '#foodScanButton', '[data-food-filter=recent]']
            .map(selector => document.querySelector(selector).closest('#foodFilterViewport')));
          assert.deepEqual(outside, [null, null, null]);
          if (width === 390 && theme === 'dark') {
            // Even a future native input inside a peer pane must retain native ownership.
            await p.evaluate(() => {
              const input = document.createElement('input'); input.id = 'peerNativeExclusion';
              Object.assign(input.style, { position: 'absolute', left: '30px', bottom: '36px', width: '120px', height: '44px' });
              document.querySelector('#foodFilterViewport > .food-filter-pane').append(input);
            });
            const input = await p.locator('#peerNativeExclusion').boundingBox();
            const x = input.x + 40, y = input.y + 22;
            await p.evaluate(({ x, y }) => surfaceTouch('touchstart', x, y), { x, y });
            await p.evaluate(({ x, y }) => surfaceTouch('touchmove', x + 90, y), { x, y });
            assert.equal(await p.locator('.peer-pane-track').count(), 0, 'native input does not start peer motion');
            await p.evaluate(({ x, y }) => surfaceTouch('touchcancel', x + 90, y), { x, y });
            await p.locator('#peerNativeExclusion').evaluate(node => node.remove());
          }
          assert.deepEqual(await p.evaluate(() => qaErrors), []);
          console.log(`PASS ${engine} ${width} ${theme}`);
        } finally { await c.close(); }
      }
    }
    if (engine === 'chromium') {
      const { c, p } = await launchPage(browser, { engine, width: 390, height: 844, theme: 'dark', video: true,
        foods: recent.slice(0, 1) });
      const video = p.video();
      try {
        const cd = await c.newCDPSession(p);
        const nativeDrag = async (x, y, direction, distance, expected, hold = 0) => {
          const width = (await p.locator('#foodFilterViewport').boundingBox()).width;
          await cd.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
          for (let step = 1; step <= 12; step++) {
            await cd.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
              x: x + direction * width * distance * step / 12, y, id: 1,
            }] });
            await p.waitForTimeout(16);
          }
          assert.equal(await p.locator('.peer-pane-track').count(), 1, 'native touch moves full peer track');
          if (hold) await p.waitForTimeout(hold);
          await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await settle(p);
          assert.equal(await active(p), expected);
        };
        await p.locator('[data-food-filter=usda]').click(); await settle(p);
        let box = await geometry(p);
        await nativeDrag(box.viewport.left + box.viewport.width * .5, box.viewport.top + box.viewport.height * .95,
          1, .2, 'usda', 150);
        await p.waitForTimeout(300);
        const ai = await p.locator('#foodAiDescriptionTrigger').boundingBox();
        await nativeDrag(ai.x + ai.width * .5, ai.y + ai.height * .5, 1, .62, 'recent');
        box = await geometry(p);
        await nativeDrag(box.viewport.left + box.viewport.width * .5, box.viewport.top + box.viewport.height * .85,
          -1, .62, 'usda');
        await p.waitForTimeout(500);
        await p.screenshot({ path: `${out}/food-peer-surface-390-dark.png` });
      } finally {
        await c.close();
        if (video) await copyFile(await video.path(), `${out}/food-peer-surface-390-dark.webm`);
      }
    }
  } finally { await browser.close(); }
}
