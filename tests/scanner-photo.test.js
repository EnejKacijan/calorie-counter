import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createScannerPhoto } from '../public/scanner-photo.js';

test('one gallery photo prepares once; concurrent use and retry reuse its normalized media and analysis image', async () => {
  let normalizeCalls = 0, resizeCalls = 0;
  const file = new Blob(['photo']), normalized = { full: new Blob(['display']), thumbnail: new Blob(['thumb']) };
  const session = createScannerPhoto(file, {
    normalize: async input => { assert.equal(input, file); normalizeCalls++; return normalized; },
    resize: async input => { assert.equal(input, normalized.full); resizeCalls++; return 'data:image/jpeg;base64,photo'; },
  });
  const results = await Promise.all([session.prepare(), session.prepare()]);
  assert.equal(results[0], session); assert.equal(results[1], session);
  await session.prepare(); assert.equal(normalizeCalls, 1); assert.equal(resizeCalls, 1); assert.equal(session.normalized, normalized);
});
test('preparation failure is retryable and cannot reuse another selected photo', async () => {
  let calls = 0;
  const first = createScannerPhoto('one', { normalize: async () => { if (++calls === 1) throw Error('decode'); return {full:'one'}; }, resize: async blob => blob });
  const next = createScannerPhoto('two', { normalize: async () => ({full:'two'}), resize: async blob => blob });
  await assert.rejects(first.prepare(), /decode/);
  assert.equal((await next.prepare()).imageDataUrl, 'two');
  assert.equal((await first.prepare()).imageDataUrl, 'one');
  assert.equal(next.normalized.full, 'two');
});
test('retry after analysis-image conversion failure keeps the already normalized photo', async () => {
  let normalizes = 0, resizes = 0;
  const session = createScannerPhoto('photo', { normalize: async () => { normalizes++; return {full:'full'}; }, resize: async () => { if (++resizes === 1) throw Error('resize'); return 'ready'; } });
  await assert.rejects(session.prepare()); await session.prepare(); assert.equal(normalizes, 1); assert.equal(resizes, 2);
});

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const correctionSource = app.slice(app.indexOf('async function correctScannedFood('), app.indexOf('\nfunction addSelectedScannedFoods('));
for (const inputMode of ['photo', 'text']) test(`${inputMode} correction uses its own request lifetime without blocking other text-estimate items`, async () => {
  const food = { id: 'original', name: 'Original', correctionText: 'Replacement', included: true };
  let finish;
  const context = {
    scannedFoodItems: [food], scannedFoodAnalysis: { inputMode, imageDataUrl: 'data:image/jpeg;base64,test' },
    scanDraftGeneration: 1, scanCorrectionController: null, AbortController,
    isActive: () => true, renderScanReview() {}, createScannedFoodItem: values => ({ ...values, id: 'temporary' }),
    fetch: () => new Promise(resolve => { finish = resolve; }),
  };
  vm.runInNewContext(correctionSource, context);
  const pending = context.correctScannedFood('original');
  context.scanDraftGeneration++;
  const replacement = { name: 'Replacement', calories: 200 };
  finish({ ok: true, json: async () => ({ food: replacement, analysis: { foods: [replacement] } }) });
  await pending;
  assert.equal(food.id, 'original');
  assert.equal(food.name, inputMode === 'photo' ? 'Original' : 'Replacement');
  if (inputMode === 'text') assert.equal(food.isCorrecting, false, 'unrelated row changes cannot leave text correction stuck');
});
