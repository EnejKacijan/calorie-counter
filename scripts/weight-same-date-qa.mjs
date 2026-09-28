import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pw, setup, settle, read, base } from './add-flow-harness.mjs';

const out = 'artifacts/weight-same-date';
await mkdir(out, { recursive: true });
const results = [];
const engines = process.env.WEIGHT_ENGINE?.split(',') || ['chromium', 'webkit'];
const pause = async page => { if (process.env.WEIGHT_RECORD) await page.waitForTimeout(350); };

for (const engine of engines) {
  const browser = await pw[engine].launch(engine === 'chromium' ? { channel: 'msedge' } : {});
  let context;
  try {
    const scene = await setup(browser, { engine, width: 390, height: 844, theme: 'dark', video: Boolean(process.env.WEIGHT_RECORD) });
    context = scene.c;
    const page = scene.p;
    await page.clock.install({ time: new Date('2026-09-28T12:00:00') });
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('calorie-counter-state'));
      state.user.weightKg = 82.2;
      state.user.targetWeightKg = 80;
      state.progress = [
        { id: 'historical', date: '2026-09-21', weightKg: 81.7, createdAt: '2026-09-21T10:00:00Z', note: 'retain' },
        { id: 'latest', date: '2026-09-27', weightKg: 82.2, createdAt: '2026-09-27T10:00:00Z' },
      ];
      localStorage.setItem('calorie-counter-state', JSON.stringify(state));
    });
    await page.goto(base + '/progress.html');
    await page.locator('[data-edit-weight=historical]').waitFor();
    await settle(page);
    const chartBeforeHistoricalUpdate = await page.locator('#progressChart').innerHTML();

    const open = async () => { await page.locator('#weightLogJump').click(); await settle(page); };
    const close = async () => { await page.locator('#weightSheet').waitFor({ state: 'hidden' }); await settle(page); };
    const date = async value => { await page.locator('#progressDate').fill(value); await settle(page); };
    const mode = async (label, weight) => {
      assert.equal((await page.locator('#weightSave').textContent()).trim(), label);
      assert.equal(await page.locator('#progressWeight').inputValue(), weight);
      assert.equal(await page.locator('#weightSave').getAttribute('aria-label'), null);
    };

    await open();
    await mode('Save weight', '82.2');
    await date('2026-09-22');
    await mode('Save weight', '82.2');
    await pause(page);
    await page.locator('#progressWeight').fill('79.4');
    await date('2026-09-21');
    await mode('Update weight', '81.7');
    await pause(page);
    await date('2026-09-22');
    await mode('Save weight', '82.2');
    await date('2026-09-21');
    await page.locator('#progressWeight').fill('81.9');
    await pause(page);
    await page.locator('#weightSave').click();
    await close();
    let state = await read(page);
    assert.equal(state.progress.length, 2);
    assert.equal(state.progress.find(entry => entry.date === '2026-09-21').id, 'historical');
    assert.equal(state.progress.find(entry => entry.date === '2026-09-21').weightKg, 81.9);
    assert.equal(state.progress.find(entry => entry.date === '2026-09-21').createdAt, '2026-09-21T10:00:00Z');
    assert.equal(state.progress.find(entry => entry.date === '2026-09-21').note, 'retain');
    assert.equal(state.user.weightKg, 82.2);
    assert.equal((await page.locator('#currentWeightValue').textContent()).trim(), '82.2');
    assert.match(await page.locator('[data-edit-weight=historical]').textContent(), /81.9/);
    assert.notEqual(await page.locator('#progressChart').innerHTML(), chartBeforeHistoricalUpdate);
    assert.match(await page.locator('#weightTrendText').textContent(), /\+0\.3 kg/);
    await page.screenshot({ path: `${out}/${engine}-390-dark-updated.png` });
    await pause(page);

    await open();
    await date('2026-09-21');
    await mode('Update weight', '81.9');
    await pause(page);
    await page.locator('#weightCancel').click();
    await close();

    await open();
    await date('2026-09-22');
    await mode('Save weight', '82.2');
    await page.locator('#progressWeight').fill('81.8');
    await page.locator('#weightSave').click();
    await close();
    state = await read(page);
    assert.equal(state.progress.length, 3);
    const created = state.progress.find(entry => entry.date === '2026-09-22');
    assert.ok(created?.id && created.id !== 'historical' && created.id !== 'latest');
    assert.equal(state.user.weightKg, 82.2);

    await open();
    await date('2026-09-27');
    await mode('Update weight', '82.2');
    await page.locator('#progressWeight').fill('82.4');
    await page.locator('#weightSave').click();
    await close();
    state = await read(page);
    assert.equal(state.progress.length, 3);
    assert.equal(state.progress.find(entry => entry.id === 'latest').weightKg, 82.4);
    assert.equal(state.user.weightKg, 82.4);
    assert.equal((await page.locator('#currentWeightValue').textContent()).trim(), '82.4');

    await page.reload();
    await page.locator('[data-edit-weight=historical]').waitFor();
    await open();
    await date('2026-09-21');
    await mode('Update weight', '81.9');
    await page.evaluate(() => { qaWrites = []; document.querySelector('#progressWeight').value = '81.5'; document.querySelector('#progressForm').requestSubmit(); document.querySelector('#progressForm').requestSubmit(); });
    await close();
    assert.equal((await read(page)).progress.length, 3);
    assert.equal((await read(page)).progress.find(entry => entry.id === 'historical').weightKg, 81.5);
    assert.equal(await page.evaluate(() => qaWrites.length), 1);
    assert.equal((await page.locator('#currentWeightValue').textContent()).trim(), '82.4');

    await open();
    await date('2026-09-21');
    await mode('Update weight', '81.5');
    await page.locator('#progressWeight').fill('81.4');
    await page.evaluate(() => { qaFailStorage = true; });
    await page.locator('#weightSave').click();
    assert.equal((await read(page)).progress.find(entry => entry.id === 'historical').weightKg, 81.5);
    assert.equal(await page.locator('#progressWeight').inputValue(), '81.4');
    assert.equal((await page.locator('#weightSave').textContent()).trim(), 'Update weight');
    assert.match(await page.locator('#weightFormError').textContent(), /could not be saved/);
    assert.equal(await page.locator('#weightSheet').isVisible(), true);
    await page.evaluate(() => { qaFailStorage = false; });
    await page.locator('#weightSave').click();
    await close();
    assert.equal((await read(page)).progress.find(entry => entry.id === 'historical').weightKg, 81.4);

    await page.locator('[data-delete-weight=historical]').click();
    assert.equal((await read(page)).progress.some(entry => entry.id === 'historical'), false);
    await page.locator('#weightUndoToast button').click();
    assert.equal((await read(page)).progress.find(entry => entry.id === 'historical').weightKg, 81.4);
    await page.reload();
    await page.locator('[data-edit-weight=historical]').waitFor();
    assert.equal((await read(page)).progress.find(entry => entry.id === 'historical').weightKg, 81.4);

    const beforeLegacy = await read(page);
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('calorie-counter-state'));
      state.progress.push({ id: 'legacy-duplicate', date: '2026-09-21', weightKg: 80.1, updatedAt: '2026-09-22T10:00:00Z' });
      localStorage.setItem('calorie-counter-state', JSON.stringify(state));
    });
    await page.reload();
    await page.locator('#weightLogJump').waitFor();
    await open();
    await date('2026-09-21');
    assert.equal((await page.locator('#weightSave').textContent()).trim(), 'Update weight');
    assert.equal(await page.locator('#progressWeight').inputValue(), '');
    assert.match(await page.locator('#weightFormError').textContent(), /Multiple weight entries/);
    await page.locator('#weightSave').click();
    assert.equal((await read(page)).progress.length, beforeLegacy.progress.length + 1);
    assert.equal(await page.locator('#weightSheet').isVisible(), true);
    assert.equal((await page.locator('#currentWeightValue').textContent()).trim(), '82.4');
    assert.deepEqual(await page.evaluate(() => qaErrors), []);

    const video = page.video();
    await context.close();
    context = null;
    if (video && process.env.WEIGHT_RECORD) await video.saveAs(`${out}/${engine}-390-dark.webm`);
    results.push({ engine, result: 'PASS', checks: 'create/update/date switching/current/reload/double submit/failure/delete-undo/legacy duplicate' });
    console.log('PASS', engine, 'same-date Weight flow');
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
