import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pw, setup, openFood, settle } from './add-flow-harness.mjs';

const out = 'artifacts/usda-peer';
await mkdir(out, { recursive: true });
const results = [];
const recent = ['Banana', 'Oats'].map((name, index) => ({ id: `recent-${index}`, name,
  source: 'Photo estimate', calories: 100 + index * 50, protein: 2, carbs: 20, fat: 1,
  lastUsedAt: `2026-09-28T10:0${index}:00Z` }));

async function createPage(browser, { engine, width, height, theme }) {
  const { c, p } = await setup(browser, { engine, width, height, theme, beforeOpen: async ({ c }) => {
    await c.addInitScript(foods => {
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
      localStorage.setItem('calorie-counter-food-library', JSON.stringify(foods));
      localStorage.setItem('calorie-counter-saved-foods', '[]');
      localStorage.setItem('calorie-counter-saved-meals', '[]');
    }, recent);
  } });
  await openFood(p);
  await p.evaluate(() => {
    window.qaTouch = (type, x, y) => {
      if (type === 'touchstart') window.qaTouchTarget = document.elementFromPoint(x, y);
      const point = { identifier: 19, target: qaTouchTarget, clientX: x, clientY: y };
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [point] }, changedTouches: { value: [point] } });
      qaTouchTarget.dispatchEvent(event);
      return qaTouchTarget;
    };
  });
  return { c, p };
}
const active = p => p.locator('[data-food-filter][aria-pressed=true]').getAttribute('data-food-filter');
async function selected(p, filter) {
  assert.equal(await active(p), filter);
  assert.equal(await p.locator('[data-food-filter][aria-pressed=true]').count(), 1);
  assert.equal(await p.locator('.peer-pane-track').count(), 0);
}
async function tap(p, filter) {
  await p.locator(`[data-food-filter=${filter}]`).tap();
  await settle(p);
  await selected(p, filter);
}
async function swipe(p, direction, { distance, cancel = false, fast = false, y } = {}) {
  const box = await p.locator('#foodFilterViewport').boundingBox();
  const markerBefore = await p.locator('.food-filter-tabs > .motion-selection').boundingBox();
  const startX = direction > 0 ? 70 : p.viewportSize().width - 70;
  const startY = y ?? box.y + 65;
  const dx = direction * (distance ?? box.width * .55);
  const target = await p.evaluate(({ x, y }) => {
    const node = qaTouch('touchstart', x, y);
    return { inside: document.querySelector('#foodFilterViewport').contains(node), name: node.id || node.className || node.tagName };
  }, { x: startX, y: startY });
  assert.equal(target.inside, true, `gesture began outside the pane: ${JSON.stringify(target)}`);
  const from = await active(p);
  if (fast) {
    const during = await p.evaluate(({ x, y, dx }) => {
      qaTouch('touchmove', x + dx / 2, y);
      qaTouch('touchmove', x + dx, y);
      const viewport = document.querySelector('#foodFilterViewport');
      const track = viewport.querySelector('.peer-pane-track');
      const panes = [...track?.children || []].map(node => ({
        width: node.getBoundingClientRect().width, shrink: getComputedStyle(node).flexShrink,
        filter: node.dataset.peerFilter,
      }));
      qaTouch('touchend', x + dx, y);
      return { width: viewport.getBoundingClientRect().width, panes };
    }, { x: startX, y: startY, dx });
    assert.equal(during.panes.length, 2);
    for (const pane of during.panes) {
      assert.ok(Math.abs(pane.width - during.width) < .2);
      assert.equal(pane.shrink, '0');
    }
    await settle(p);
    return during;
  }
  const steps = 8;
  let during;
  for (let step = 1; step <= steps; step++) {
    await p.evaluate(({ x, y }) => qaTouch('touchmove', x, y), { x: startX + dx * step / steps, y: startY });
    if (!fast) await p.waitForTimeout(16);
    if (step === Math.ceil(steps / 2)) {
      during = await p.evaluate(() => {
        const viewport = document.querySelector('#foodFilterViewport');
        const track = viewport.querySelector('.peer-pane-track');
        const pane = [...track?.children || []];
        return { width: viewport.getBoundingClientRect().width, panes: pane.map(node => ({
          width: node.getBoundingClientRect().width, shrink: getComputedStyle(node).flexShrink,
          filter: node.dataset.peerFilter, rows: node.querySelectorAll('.suggestion-card,.food-reuse-row').length,
        })), selected: document.querySelector('[data-food-filter][aria-pressed=true]')?.dataset.foodFilter,
          marker: document.querySelector('.food-filter-tabs > .motion-selection')?.getBoundingClientRect().x };
      });
    }
  }
  if (during.panes.length) {
    assert.equal(during.selected, from, 'semantic selection must wait for release');
    assert.equal(during.panes.length, 2);
    if (markerBefore && during.marker !== undefined)
      assert.ok((during.marker - markerBefore.x) * -direction > 1, 'filter marker follows pane progress');
    for (const pane of during.panes) {
      assert.ok(Math.abs(pane.width - during.width) < .2, 'pane is full width');
      assert.equal(pane.shrink, '0');
    }
  }
  if (!fast && !cancel && Math.abs(dx) < box.width * .28) await p.waitForTimeout(120);
  await p.evaluate(({ x, y, type }) => qaTouch(type, x, y), { x: startX + dx, y: startY, type: cancel ? 'touchcancel' : 'touchend' });
  await settle(p);
  return during;
}

for (const engine of (process.env.PEER_ENGINE?.split(',') || ['chromium', 'webkit'])) {
  const browser = await pw[engine].launch(engine === 'chromium' ? { channel: 'msedge' } : {});
  try {
    if (!process.env.PEER_QUERY_ONLY) for (const [width, height] of [[320, 667], [375, 667], [390, 844], [430, 932]]) for (const theme of ['light', 'dark']) {
      const { c, p } = await createPage(browser, { engine, width, height, theme });
      try {
        for (const filter of ['my', 'recent', 'usda', 'recent', 'my', 'all']) await tap(p, filter);
        for (const filter of ['my', 'recent', 'usda']) {
          await swipe(p, -1);
          await selected(p, filter);
        }
        const pane = await p.locator('#foodFilterViewport > .food-filter-pane').boundingBox();
        assert.ok(pane.height >= 112, 'USDA no-query pane owns a touch-sized content region');
        assert.equal(await p.locator('#foodFilterViewport > .food-filter-pane').getAttribute('data-peer-filter'), 'usda');
        const query = await p.locator('#manualFoodName').inputValue();
        const edge = await swipe(p, -1);
        await selected(p, 'usda');
        assert.equal(edge.panes.length, 0, 'final tab has no outgoing track');
        assert.ok((await p.locator('#foodFilterViewport').boundingBox()).height >= 112, 'final edge does not reveal blank space');
        await swipe(p, 1, { distance: 60 });
        await selected(p, 'usda');
        await swipe(p, 1, { distance: pane.width * .7, cancel: true });
        await selected(p, 'usda');
        const back = await swipe(p, 1);
        assert.ok(back.panes.some(pane => pane.filter === 'recent'), 'Recent is prepared under USDA');
        await selected(p, 'recent');
        await swipe(p, 1); await selected(p, 'my');
        await swipe(p, 1); await selected(p, 'all');
        await swipe(p, -1, { fast: true, distance: 60 }); await selected(p, 'my');
        await swipe(p, -1, { fast: true, distance: 60 }); await selected(p, 'recent');
        await swipe(p, -1, { fast: true, distance: 60 }); await selected(p, 'usda');
        await swipe(p, 1, { fast: true, distance: 60 }); await selected(p, 'recent');
        assert.equal(await p.locator('#manualFoodName').inputValue(), query);
        assert.deepEqual(await p.evaluate(() => qaErrors), []);
        if (engine === 'chromium' && width === 390) await p.screenshot({ path: `${out}/recent-${theme}-390.png` });
        results.push({ engine, width, height, theme, status: 'PASS', case: 'no query; tap/slow/flick/cancel/boundary' });
        console.log('PASS', engine, width, theme, 'no-query adjacent matrix');
      } finally { await c.close(); }
    }
    const { c, p } = await createPage(browser, { engine, width: 390, height: 844, theme: 'dark' });
    try {
      const held = [];
      await p.route('**/api/foods/search?*', route => {
        const query = new URL(route.request().url()).searchParams.get('q');
        if (query === 'zzzx') return route.fulfill({ json: { foods: [] } });
        if (query === 'slowfood') { held.push(route); return; }
        return route.fallback();
      });
      await tap(p, 'usda');
      await p.locator('#manualFoodName').fill('banana');
      await p.locator('#foodSuggestions .suggestion-card').first().waitFor();
      assert.ok(await p.locator('#foodSuggestions .suggestion-card').count() >= 1);
      const rows = await p.locator('#foodSuggestions .suggestion-card').count();
      await p.evaluate(() => { document.querySelector('.add-flow-content').scrollTop = 80; });
      const scroll = await p.evaluate(() => document.querySelector('.add-flow-content').scrollTop);
      await swipe(p, 1); await selected(p, 'recent');
      await swipe(p, -1); await selected(p, 'usda');
      assert.equal(await p.locator('#manualFoodName').inputValue(), 'banana');
      assert.equal(await p.locator('#foodSuggestions .suggestion-card').count(), rows);
      assert.equal(await p.evaluate(() => document.querySelector('.add-flow-content').scrollTop), scroll);
      await p.evaluate(() => { document.querySelector('.add-flow-content').scrollTop = 0; });

      await p.locator('#manualFoodName').fill('zzzx');
      await p.locator('.food-search-fallbacks').waitFor();
      await swipe(p, 1); await selected(p, 'recent');
      await swipe(p, -1); await selected(p, 'usda');
      assert.equal(await p.locator('#manualFoodName').inputValue(), 'zzzx');
      assert.equal(await p.locator('.food-search-fallbacks').isVisible(), true);

      await p.locator('#manualFoodName').fill('slowfood');
      await p.waitForFunction(() => document.querySelector('#foodSuggestions')?.getAttribute('aria-busy') === 'true');
      assert.ok(held.length >= 1, 'remote USDA search is actually pending');
      await swipe(p, 1); await selected(p, 'recent');
      assert.equal(await p.locator('#manualFoodName').inputValue(), 'slowfood');
      await swipe(p, -1); await selected(p, 'usda');
      assert.equal(await p.locator('#manualFoodName').inputValue(), 'slowfood');
      await Promise.all(held.map(route => route.fulfill({ json: { foods: [] } }).catch(() => {})));
      assert.deepEqual(await p.evaluate(() => qaErrors), []);
      results.push({ engine, width: 390, height: 844, theme: 'dark', status: 'PASS', case: 'query/results/scroll/empty/loading' });
      console.log('PASS', engine, '390 dark USDA query states');
    } finally { await c.close(); }
  } finally { await browser.close(); }
}
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
