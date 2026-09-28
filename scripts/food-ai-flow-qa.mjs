import assert from 'node:assert/strict';
import { pw, setup, openFood, settle, read } from './add-flow-harness.mjs';

const foods = [
  { name: 'Egg', resolvedFoodName: 'Egg', amount: 2, unit: 'piece', servingGrams: 100,
    calories: 144, protein: 12, carbs: 1, fat: 10, confidence: 'medium', notes: 'Two eggs' },
  { name: 'Toast', resolvedFoodName: 'Toast', amount: 2, unit: 'piece', servingGrams: 60,
    calories: 160, protein: 6, carbs: 30, fat: 2, confidence: 'medium', notes: 'Two slices' },
];
const description = '2 eggs and two slices of toast';
const activeDay = page => read(page).then(state => state.days[state.selectedDate] || { foods: [] });

for (const engine of ['chromium', 'webkit']) {
  const browser = await pw[engine].launch(engine === 'chromium' ? { channel: 'msedge' } : {});
  try {
    for (const [width, theme] of [[390, 'light'], [390, 'dark'], [320, 'dark'], [430, 'dark']]) {
      const { c, p } = await setup(browser, { engine, width, height: 844, theme, beforeOpen: async ({ c }) => {
        await c.addInitScript(() => localStorage.setItem('calorie-counter-ai-consent-v1',
          JSON.stringify({ 'food-text': true })));
      } });
      try {
        let mode = 'pending', release, requests = 0;
        await p.route('**/api/foods/estimate-text', async route => {
          requests++;
          assert.equal(route.request().postDataJSON().description, description);
          const current = mode;
          if (current === 'pending') await new Promise(resolve => { release = resolve; });
          if (current === 'offline') return route.abort('internetdisconnected');
          if (current === 'rate') return route.fulfill({ status: 429, json: { error: 'Too many requests.' } });
          if (current === 'server') return route.fulfill({ status: 503, json: { error: 'Service unavailable.' } });
          if (current === 'bad') return route.fulfill({ status: 200, json: { analysis: { foods: [] } } });
          return route.fulfill({ json: { analysis: { foods, confidence: 'medium', notes: 'Review estimate.' } } });
        });
        await openFood(p);
        await p.locator('#foodAiDescriptionTrigger').click();
        assert.equal(await p.locator('#foodAiDescriptionInput').isVisible(), true);
        await p.locator('#foodAiDescriptionInput').fill(description);
        await p.locator('#foodAiDescriptionSubmit').click();
        await p.waitForFunction(() => document.querySelector('#foodAiDescriptionSubmit').textContent === 'Estimating…');
        assert.equal(await p.locator('#foodAiDescriptionSubmit').isDisabled(), true);
        await p.locator('#foodAiDescriptionSubmit').evaluate(button => button.click());
        assert.equal(requests, 1, 'pending double submit is single-flight');
        mode = 'ok'; release();
        await p.locator('.scan-food-summary strong').first().waitFor();
        assert.equal(await p.locator('#scanReviewTitle').textContent(), 'Review your estimate');
        assert.deepEqual(await p.locator('.scan-food-summary strong').allTextContents(), ['Egg', 'Toast']);
        assert.equal(await p.locator('#scanTotalCalories').textContent(), '304');
        const before = (await activeDay(p)).foods.length;
        await p.locator('#scanAddSelectedFoods').click();
        await p.waitForFunction(() => !document.querySelector('.add-flow-host'));
        const day = await activeDay(p);
        assert.equal(day.foods.length, before + 2);
        assert.deepEqual(day.foods.slice(-2).map(food => food.name), ['Egg', 'Toast']);
        assert.equal(day.foods.slice(-2).reduce((sum, food) => sum + food.calories, 0), 304);
        await p.reload(); await p.locator('.day-tile').first().waitFor(); await settle(p);
        assert.deepEqual((await activeDay(p)).foods.slice(-2).map(food => food.name), ['Egg', 'Toast']);

        // Every failure must release loading and preserve the editable draft.
        for (const failure of ['rate', 'server', 'offline', 'bad']) {
          mode = failure;
          await openFood(p); await p.locator('#foodAiDescriptionTrigger').click();
          await p.locator('#foodAiDescriptionInput').fill(description);
          await p.locator('#foodAiDescriptionSubmit').click();
          await p.locator('#foodAiDescriptionError:not([hidden])').waitFor();
          assert.equal(await p.locator('#foodAiDescriptionInput').inputValue(), description);
          assert.equal(await p.locator('#foodAiDescriptionSubmit').isDisabled(), false);
          assert.equal(await p.locator('#foodAiDescriptionSubmit').textContent(), 'Estimate nutrition');
          assert.equal((await activeDay(p)).foods.length, before + 2);
          await p.locator('#foodAiDescriptionBack').click();
          await p.locator('#closeFoodModal').click();
          await p.waitForFunction(() => !document.querySelector('.add-flow-host'));
        }
        assert.deepEqual(await p.evaluate(() => qaErrors), []);
        console.log(`PASS food AI ${engine} ${width} ${theme}`);
      } finally { await c.close(); }
    }
  } finally { await browser.close(); }
}
