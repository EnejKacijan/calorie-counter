import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diarySwipeIntent, diarySwipeShouldOpen, diarySwipeWidth} from '../public/diary-row-swipe.js';

test('food swipe locks only clear horizontal intent and leaves vertical/diagonal scroll alone', () => {
  assert.equal(diarySwipeIntent(-8, 0), 'pending');
  assert.equal(diarySwipeIntent(-30, 4), 'open');
  assert.equal(diarySwipeIntent(30, 4), 'close');
  assert.equal(diarySwipeIntent(-20, 18), 'vertical');
  assert.equal(diarySwipeIntent(4, 26), 'vertical');
});
test('short drags cancel; distance or velocity opens only the shelf', () => {
  assert.equal(diarySwipeWidth, 132);
  assert.equal(diarySwipeShouldOpen(-22, -22, -.1, false), false);
  assert.equal(diarySwipeShouldOpen(-54, -54, -.1, false), true);
  assert.equal(diarySwipeShouldOpen(-30, -30, -.7, false), true);
  assert.equal(diarySwipeShouldOpen(-132, -260, -2, false), true);
  assert.equal(diarySwipeShouldOpen(-92, 40, .7, true), false);
  assert.equal(diarySwipeShouldOpen(-110, 22, .1, true), true);
});
test('quick actions reuse existing food behavior and retain overflow/edit', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const success = await toggleSavedFood\(entry\)/);
  assert.match(app, /const success = await deleteEntryWithUndo\('foods', entry, \{/);
  assert.match(app, /beforeRender: \(\) => collapseDiaryFoodRow\(card, window\)/);
  assert.match(app, /openFoodReusePanel\('row-actions', \{ entryId:entry.id \}\)/);
  assert.match(app, /const edit = \(\) => \{ diaryRowSwipe\.close\(true\); runFoodEntryAction\('edit', entry\); \}/);
  assert.doesNotMatch(app, /diary-row-swipe-actions[\s\S]{0,900}data-entry-action="edit"/);
});
