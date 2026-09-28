import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {foodResultMetadata} from '../public/food-search.js';
import {animateFoodStep} from '../public/add-surface.js';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
function fn(name){const start=source.indexOf(`function ${name}(`);const end=source.indexOf('\nfunction ',start+1);return source.slice(start,end);}
test('result metadata has one line, deduplicates provider-brand and retains real portion',()=>{
 assert.equal(foodResultMetadata({brand:'USDA',source:'USDA'},'100 g','USDA'),'100 g · USDA');
 assert.equal(foodResultMetadata({brand:"Better’n Peanut Butter",source:'USDA'},'32 g','USDA'),'32 g · Better’n Peanut Butter · USDA');
 assert.equal(foodResultMetadata({},'1 serving',''),'1 serving');
});
test('long metadata is retained verbatim for the accessible result name, not inserted as HTML',()=>{
 const brand='<script>very long & genuine brand</script>'.repeat(10);
 assert.equal(foodResultMetadata({brand},'100 g','USDA'),`100 g · ${brand} · USDA`);
 assert.match(fn('createFoodSuggestionCard'),/meta.textContent = foodResultMetadata/);
 assert.match(fn('createFoodSuggestionCard'),/setAttribute\("aria-label"/);
});
test('nested motion only decorates a committed destination and cancels prior motion',()=>{
 const calls=[],element={animate(frames,timing){const a={cancel(){calls.push('cancel');}};calls.push({frames,timing});return a;}};
 const win={matchMedia:()=>({matches:false})};
 animateFoodStep(element,'forward',win);animateFoodStep(element,'back',win);
 assert.equal(calls[0].timing.duration,180);assert.equal(calls[0].frames[0].transform,'translateX(12px)');
 assert.equal(calls[1],'cancel');assert.equal(calls[2].frames[0].transform,'translateX(-12px)');
 animateFoodStep(element,'forward',{matchMedia:()=>({matches:true})});assert.equal(calls.length,4);assert.equal(calls[3],'cancel');
});
test('row tap, keyboard and overflow route through the same domain actions',()=>{
 const calls=[];const entry={id:'a'};const c={closeInlineEntryActions(){},editEntry:(...a)=>calls.push(a),toggleSavedFood:e=>calls.push(['save',e]),deleteEntryWithUndo:(...a)=>calls.push(['delete',...a])};
 vm.runInNewContext(fn('runFoodEntryAction'),c);
 for(const action of ['edit','save','delete'])c.runFoodEntryAction(action,entry);
 assert.deepEqual(calls,[['foods',entry],['save',entry],['delete','foods',entry]]);
 assert.match(fn('bindFoodDiaryRow'),/main.setAttribute\('role', 'button'\)/);
 assert.match(fn('bindFoodDiaryRow'),/entry-inline-actions'\).remove/);
 assert.match(source,/runFoodEntryAction\(entryAction, entry\)/);
});
test('header retains unique day/meal reuse actions with a label, not a second ellipsis',()=>{
  assert.match(html,/aria-label="Reuse food and meals"[^>]*>Reuse<\/button>/);
 for(const action of ['saved-meals','repeat-yesterday','repeat-meal','copy-date','save-meal-picker'])assert.ok(fn('renderFoodReuseContents').includes(`"${action}"`));
});
test('Today ends after exercise, and Back preserves all captured search fields without focusing search',()=>{
 assert.doesNotMatch(html,/class="mobile-diary-stats"/);
 for(const key of ['query:','filter:','scroll:','foods:','limit:','status:','pending:'])assert.ok(fn('captureFoodBrowseState').includes(key));
 assert.match(fn('restoreFoodBrowseState'),/container.scrollTop = browse.scroll/);
 assert.doesNotMatch(fn('restoreFoodBrowseState'),/manualFoodName\)\.focus/);
 assert.match(source,/searchFoodSuggestions\(elements.manualFoodName.value\);\s*elements.manualFoodName.blur\(\)/);
});
test('food add commits persistence before new-row marker and only uses a 600ms tonal cue',()=>{
 const add=fn('addFood');assert.ok(add.indexOf('state = commitDiaryDay')<add.indexOf('recentSuccess ='));
 const css=readFileSync(new URL('../public/today-diary.css',import.meta.url),'utf8');assert.match(css,/food-log-added 600ms/);assert.match(css,/entry-card.is-new-entry \{ animation:none/);
});
