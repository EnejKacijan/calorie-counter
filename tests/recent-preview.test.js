import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function code(name) { const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);return source.slice(start,source.indexOf('\n}',start)+2); }
const food={name:'Banana',id:'usda-banana',lastUsedAmount:150,lastUsedUnit:'g'};
test('All preview is a single existing selection button with no management actions or mutation',()=>{
  const selected={};let management=0;
  const c={document:{createElement:()=>({dataset:{},classList:{add(){}},children:[],appendChild(child){this.children.push(child);}})},foodIdentityKey:f=>f.id,createFoodSuggestionCard:f=>{assert.equal(f,food);return selected;},createRecentManagementRow(){management++;}};
  vm.runInNewContext(code('createReuseFoodRow'),c);
  const row=c.createReuseFoodRow(food,{recent:true,preview:true});
  assert.deepEqual(row.children,[selected]);assert.equal(row.dataset.reuseFood,food.id);assert.equal(management,0);
});
test('full Recent alone delegates to the contextual management row',()=>{
  const row={dataset:{}},managed={};let calls=0;
  const c={document:{createElement:()=>row},foodIdentityKey:f=>f.id,createRecentManagementRow(r,f){assert.equal(r,row);assert.equal(f,food);calls++;return managed;}};
  vm.runInNewContext(code('createReuseFoodRow'),c);assert.equal(c.createReuseFoodRow(food,{recent:true}),managed);assert.equal(calls,1);
});
test('Recent contextual actions call the existing save/remove path once and recover row focus after re-render',()=>{
  const calls=[],replacement={dataset:{reuseFood:food.id},querySelector:()=>({focus:options=>calls.push(['focus',options.preventScroll])})};
  const c={toggleSavedFood:f=>calls.push(['save',f]),removeRecentFoodWithUndo:f=>calls.push(['remove',f]),foodIdentityKey:f=>f.id,elements:{foodSuggestions:{querySelectorAll:()=>[replacement]}}};
  vm.runInNewContext(code('runRecentFoodAction'),c);
  c.runRecentFoodAction('save',food);c.runRecentFoodAction('remove',food);
  assert.deepEqual(calls,[['save',food],['focus',true],['remove',food]]);
});
test('Back/Escape closes Recent management to its parent list rather than the diary menu',()=>{
  let closed=0;const c={foodReuseState:{view:'recent-actions'},closeFoodReusePanel(){closed++;},renderFoodReusePanel(){assert.fail('must not render diary menu');}};
  vm.runInNewContext(code('backFoodReusePanel'),c);c.backFoodReusePanel();assert.equal(closed,1);assert.equal(c.foodReuseState.view,'recent-actions');
});
test('Recent management has one overflow path and no hidden swipe actions or pointer ownership',()=>{
  const row=code('createRecentManagementRow');
  assert.match(row,/reuse-food-overflow/);assert.match(row,/recent-actions/);
  assert.doesNotMatch(row,/pointer|suppressClick|swipe|data-reuse-save|data-reuse-remove/);
});
