import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('Today removes only stat presentation while preserving streak and weight domain paths',()=>{
 const html=read('index.html'),js=read('app.js');
 assert.doesNotMatch(html,/mobile-diary-stats|mobile-streak-pill|streak-insight|mobileWeight|mobileStreak|clearDayStreak/);
 assert.doesNotMatch(js,/renderMobileWeightStat|elements\.(?:mobileWeight|mobileStreak|clearDayStreak|mobileClearDayStreak)/);
 for(const name of ['foodActivityStreak','bestFoodDayStreak','isFoodExcludedFromStreak'])assert.ok(js.includes(`function ${name}(`));
 assert.match(js,/nextState\.user\.startWeightKg = nextState\.user\.weightKg/);assert.match(js,/excludedFromStreak: isFutureDateKey/);
 for(const id of ['calendarStrip','calorieRing','foodCaloriesTotal','exerciseCaloriesTotal','netCaloriesTotal','macroGrid','foodList','exerciseList','floatingAddButton'])assert.ok(html.includes(`id="${id}"`));
 assert.ok(html.indexOf('id="foodList"')<html.indexOf('id="exerciseList"'));
});
test('Reuse transient press is scoped, separate from semantic selection, and clears on nested update/close',()=>{
 const js=read('mobile-surface.js'),css=read('food-reuse.css');
 assert.match(js,/releaseGesture\?\.cancel\(\); \/\/ Nested content/);assert.match(js,/dragDistance \|\|=.*\n\s*releaseGesture\?\.cancel\(\)/);
 assert.match(css,/\[data-sheet-pressed\]:not\(:disabled\)/);assert.match(css,/:focus-visible \{ outline:2px solid/);
 assert.match(read('styles.css'),/@media \(hover: hover\) and \(pointer: fine\)/);
 assert.doesNotMatch(read('modern-ux.css'),/body :is\([^\n]*food-reuse-action[^\n]*\):active/);
 assert.match(css,/body #foodReusePanel :is\([^\n]+\) \{ -webkit-tap-highlight-color:transparent; transition:none/);
});
