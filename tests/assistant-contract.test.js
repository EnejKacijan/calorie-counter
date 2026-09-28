import test from 'node:test';
import assert from 'node:assert/strict';
import { askNutritionAssistant } from '../server/nutrition-assistant.js';

const sent = [];
const mock = result => async (url, options) => {
  assert.equal(url, 'https://api.openai.com/v1/responses');
  sent.push(JSON.parse(options.body));
  return result;
};
const ok = text => ({ ok: true, json: async () => ({ output_text: text }) });
const ask = (payload, response) => askNutritionAssistant(payload, {
  openAiApiKey: 'synthetic-key', model: 'fixture-model', fetchFn: mock(response),
});

test('basic Assistant turn sends one non-stored request and returns one reply', async () => {
  sent.length = 0;
  const result = await ask({ message: 'Hello', appContext: { diaryEnabled: false } }, ok('Hi there.'));
  assert.deepEqual(result, { message: 'Hi there.', model: 'fixture-model' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].store, false);
  assert.equal(sent[0].input.length, 1);
  assert.match(sent[0].input[0].content, /Hello\n\n<daily_fuel_context>/);
  assert.match(sent[0].input[0].content, /Diary access is disabled/);
});

test('multi-turn order and the 16-message history boundary are stable', async () => {
  sent.length = 0;
  const history = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user', content: `Turn ${index}`,
  }));
  await ask({ message: 'Latest question', history, appContext: { diaryEnabled: false } }, ok('Latest answer'));
  assert.equal(sent[0].input.length, 17);
  assert.deepEqual(sent[0].input.slice(0, 16), history.slice(-16));
  assert.match(sent[0].input.at(-1).content, /^Latest question/);
});

test('diary context contains selected synthetic facts only and empty diary remains valid', async () => {
  sent.length = 0;
  const diary = { diaryEnabled: true, rangeDays: 7, profile: {
    goal: 'maintain', weightKg: 75, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 },
  }, days: [{ date: '2026-09-28', foods: [{ name: 'QA oats', meal: 'breakfast', amount: 150,
    unit: 'g', calories: 200, protein: 12, carbs: 30, fat: 4, privateNote: 'never send' }] }] };
  await ask({ message: 'Review my diary', appContext: diary }, ok('Oats are in your diary.'));
  const context = sent[0].input.at(-1).content;
  assert.match(context, /QA oats/);
  assert.match(context, /2026-09-28/);
  assert.doesNotMatch(context, /never send/);
  await ask({ message: 'Any data?', appContext: { diaryEnabled: true, rangeDays: 30, days: [] } }, ok('No diary foods.'));
  assert.match(sent[1].input.at(-1).content, /"days":\[\]/);
});

test('provider output accepts one completed response or ordered text blocks without duplicate text', async () => {
  sent.length = 0;
  const completed = { ok: true, json: async () => ({ output: [{ content: [
    { type: 'output_text', text: 'First paragraph.' }, { type: 'output_text', text: 'Second paragraph.' },
  ] }] }) };
  const reply = await ask({ message: 'Two paragraphs' }, completed);
  assert.equal(reply.message, 'First paragraph.\n\nSecond paragraph.');
  assert.equal(sent.length, 1);
});

test('429, 500, empty response, malformed response, offline and abort fail truthfully', async () => {
  sent.length = 0;
  for (const status of [429, 500]) {
    await assert.rejects(ask({ message: 'Synthetic question' }, {
      ok: false, status, json: async () => ({ error: { message: `Provider ${status}` } }),
    }), error => error.status === status && error.message === `Provider ${status}`);
  }
  for (const payload of [{}, { output_text: '' }, { output: [{ content: [{ type: 'not_text', text: 'No' }] }] }]) {
    await assert.rejects(ask({ message: 'Synthetic question' }, {
      ok: true, json: async () => payload,
    }), error => error.status === 502);
  }
  for (const failure of [new TypeError('Offline'), new DOMException('Aborted', 'AbortError')]) {
    await assert.rejects(askNutritionAssistant({ message: 'Synthetic question' }, {
      openAiApiKey: 'synthetic-key', fetchFn: async () => { throw failure; },
    }), error => error === failure);
  }
});

test('empty message is rejected before contacting the provider', async () => {
  sent.length = 0;
  await assert.rejects(ask({ message: '   ' }, ok('Should not happen')), error => error.status === 400);
  assert.equal(sent.length, 0);
});
