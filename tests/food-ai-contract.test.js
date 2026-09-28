import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFoodDescription } from '../server/food-image-analysis.js';

const item = (name, amount, unit, servingGrams, calories, protein, carbs, fat, extra = {}) => ({
  name, searchQuery: name, amount, unit, servingGrams, qualifiers: '',
  fallbackCalories: calories, fallbackProtein: protein, fallbackCarbs: carbs, fallbackFat: fat,
  isZeroCalorie: false, ...extra,
});
const parsed = (foods, confidence = 'medium', notes = '') => ({ foods, confidence, notes });
const provider = output => async (_url, request) => {
  assert.equal(JSON.parse(request.body).text.format.name, 'parsed_food_description');
  return { ok: true, json: async () => ({ output_text: typeof output === 'string' ? output : JSON.stringify(output) }) };
};
const estimate = (description, output, searchFoodsFn = async () => []) => analyzeFoodDescription(description, {
  openAiApiKey: 'synthetic-key', model: 'fixture-model', fetchFn: provider(output), searchFoodsFn,
});
const nutrients = food => [food.calories, food.protein, food.carbs, food.fat];

test('simple description preserves two foods, quantities, reviewable nutrients and order', async () => {
  const foods = [item('Egg', 2, 'piece', 100, 144, 12, 1, 10), item('Toast', 2, 'piece', 60, 160, 6, 30, 2)];
  const result = await estimate('2 eggs and two slices of toast', parsed(foods));
  assert.deepEqual(result.foods.map(food => food.name), ['Egg', 'Toast']);
  assert.deepEqual(result.foods.map(food => food.amount), [2, 2]);
  assert.deepEqual(result.foods.map(nutrients), [[144, 12, 1, 10], [160, 6, 30, 2]]);
  assert.equal(result.foods.every(food => food.source === 'AI ESTIMATE' && food.confidence === 'low'), true);
});

test('meal components retain stable ordering and coherent totals', async () => {
  const foods = [item('Chicken breast', 1, 'serving', 150, 248, 46, 0, 5),
    item('Rice', 1, 'serving', 180, 234, 5, 50, 1), item('Broccoli', 1, 'serving', 100, 35, 2, 7, 0),
    item('Olive oil', 1, 'serving', 8, 71, 0, 0, 8)];
  const result = await estimate('Chicken breast, rice and broccoli with a little olive oil', parsed(foods));
  assert.deepEqual(result.foods.map(food => food.name), foods.map(food => food.name));
  assert.equal(result.foods.reduce((sum, food) => sum + food.calories, 0), 588);
  assert.equal(result.foods.every(food => food.amount > 0 && food.servingGrams >= 0), true);
});

test('ambiguous portion stays a cautious editable estimate rather than a parser error', async () => {
  const result = await estimate('big bowl of cereal with milk', parsed([
    item('Cereal with milk', 1, 'serving', 320, 310, 11, 51, 7, { qualifiers: 'Assumed common bowl' }),
  ], 'low', 'Portion is approximate.'));
  assert.equal(result.confidence, 'low');
  assert.equal(result.foods[0].amount, 1);
  assert.match(result.foods[0].notes, /Assumed common bowl/);
});

test('Slovenian description can return separate normalized foods and quantities', async () => {
  const result = await estimate('2 jajci, 2 kosa kruha in malo pršuta', parsed([
    item('Egg', 2, 'piece', 100, 144, 12, 1, 10), item('Bread', 2, 'piece', 70, 180, 6, 35, 2),
    item('Prosciutto', 1, 'serving', 25, 65, 7, 0, 4),
  ]));
  assert.deepEqual(result.foods.map(food => food.name), ['Egg', 'Bread', 'Prosciutto']);
  assert.deepEqual(result.foods.map(food => food.amount), [2, 2, 1]);
});

test('malformed provider JSON and truncated output cannot create an estimate without reliable nutrition', async () => {
  for (const output of ['not json', '{"foods":[', '{}']) {
    await assert.rejects(estimate('mystery meal', output), error => error.status === 502);
  }
});

test('null, missing, wrong-type, enum and extreme nutrients are rejected at runtime', async () => {
  const good = item('Food', 1, 'serving', 100, 200, 8, 20, 10);
  for (const broken of [
    { ...good, fallbackCarbs: null }, { ...good, fallbackFat: undefined },
    { ...good, fallbackCalories: '200' }, { ...good, amount: '1' },
    { ...good, unit: 'plate' }, { ...good, isZeroCalorie: 'false' },
    { ...good, fallbackCalories: -5 }, { ...good, fallbackCalories: 50_000 },
    { ...good, fallbackProtein: 'NaN' },
  ]) {
    await assert.rejects(estimate('mystery meal', parsed([broken])), error => error.status === 502,
      `rejected ${JSON.stringify(broken)}`);
  }
});

test('partial provider nutrition may use a valid structured match, never a fabricated zero', async () => {
  const incomplete = item('Rice', 1, 'serving', 100, 130, 3, 28, 0);
  delete incomplete.fallbackFat;
  const match = { id: 'usda-rice', name: 'Rice', source: 'USDA', servingGrams: 100,
    calories: 130, protein: 3, carbs: 28, fat: 0.3 };
  const result = await estimate('rice', parsed([incomplete]), async () => [match]);
  assert.equal(result.foods[0].nutritionSource, 'USDA');
  assert.deepEqual(nutrients(result.foods[0]), [130, 3, 28, 0.3]);
});

test('provider timeout, rate limit, server failure, offline and abort never leave a fabricated estimate', async () => {
  for (const [outcome, status] of [
    [async () => { throw new DOMException('Timed out', 'TimeoutError'); }, 502],
    [async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'Rate limited' } }) }), 429],
    [async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'Server error' } }) }), 502],
    [async () => { throw new TypeError('Network offline'); }, 502],
    [async () => { throw new DOMException('Aborted', 'AbortError'); }, 502],
  ]) {
    await assert.rejects(analyzeFoodDescription('mystery meal', {
      openAiApiKey: 'synthetic-key', fetchFn: outcome, searchFoodsFn: async () => [],
    }), error => error.status === status);
  }
});
