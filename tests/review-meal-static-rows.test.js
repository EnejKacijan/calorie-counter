import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const app=read('app.js');
const fn=name=>{const start=app.indexOf(`function ${name}(`);assert.ok(start>=0);return app.slice(start,app.indexOf('\n}',start)+2);};

test('Review meal uses intrinsic native sizing, keeps the arrow gutter and permits wrapping',()=>{
 const css=read('package-scan.css');
 assert.match(css,/scan-review-heading \{[^}]*flex-wrap:wrap/);
 assert.match(css,/scan-review-heading-actions \{[^}]*flex:1 1 auto;min-width:0;max-width:100%/);
 assert.match(css,/scan-review-meal \{[^}]*width:100%!important;max-width:100%/);
 assert.doesNotMatch(css,/scan-review[^\n]*112px/);
 assert.match(read('styles.css'),/padding: 0 34px 0 0 !important/);
 const select=read('index.html').match(/<select id="scanReviewMeal">([\s\S]*?)<\/select>/)[1];
 for(const name of ['Breakfast','Lunch','Dinner','Snack'])assert.ok(select.includes(`>${name}</option>`));
 const editor=read('index.html').match(/<select id="foodMeal"[^>]*>([\s\S]*?)<\/select>/)[1];
 for(const name of ['Breakfast','Lunch','Dinner','Snack'])assert.ok(editor.includes(`>${name}</option>`),'review/edit must retain the same meal');
});

test('diary and managed Recent have no shared row gesture, hidden panes, hint or offsets',()=>{
 for(const name of ['bindFoodRowSwipe','foodSwipeDestination','attachEntrySwipe','closeSwipedEntries','closeRecentManagementSwipes'])assert.ok(!app.includes(name));
 assert.doesNotMatch(read('today-diary.js'),/swipe|pointer/i);
 assert.doesNotMatch(read('index.html'),/entry-swipe|swipe-save-action|swipe-delete-action/);
 assert.doesNotMatch(read('styles.css'),/entry-swipe|swipe-save-action|swipe-delete-action|foodSwipeHint/);
 assert.doesNotMatch(read('food-reuse.css'),/reuse-food-swipe|is-swiped|--swipe-x/);
 for(const name of ['renderList','bindFoodDiaryRow','createRecentManagementRow'])assert.doesNotMatch(fn(name),/pointer(?:down|move|up)|suppressClick|--swipe-x/);
 // The independent legacy Recent chip has no equivalent Remove action.
 assert.match(app,/attachRecentFoodSwipe\(card, food\)/);
});

test('ordinary and scanned child food bindings keep separate named edit and overflow targets',()=>{
 const calls=[],events={},mainEvents={},attrs={},mainAttrs={};
 const main={setAttribute:(k,v)=>mainAttrs[k]=v,focus(){calls.push('focus');},addEventListener:(type,handler)=>mainEvents[type]=handler};
 const toggle={setAttribute:(k,v)=>attrs[k]=v,focus(){},addEventListener:(type,handler)=>events['toggle-'+type]=handler};
 const card={dataset:{},querySelector:s=>s==='.entry-main'?main:s==='.entry-actions-toggle'?toggle:s==='.food-photo-thumb'?null:{remove(){}},prepend(){},addEventListener:(type,handler)=>events[type]=handler};
 const node=()=>({setAttribute(){},append(){},addEventListener(){},querySelector(){return {textContent:''}},set innerHTML(value){this.html=value;}});
 const food={id:'scanned-child-or-ordinary',name:'Rice'};
 const context={document:{createElement:node},diaryRowSwipe:{close(){}},isFoodSaved:()=>false,formatFoodDisplayName:e=>e.name,openFoodReusePanel:(...args)=>calls.push(args),runFoodEntryAction:(...args)=>calls.push(args)};
 vm.runInNewContext(fn('bindFoodDiaryRow'),context);context.bindFoodDiaryRow(card,food);
 assert.deepEqual(Object.keys(events).sort(),['click','toggle-click']);
 assert.equal(attrs['aria-label'],'Actions for Rice');assert.equal(attrs['aria-haspopup'],'dialog');
 assert.equal(mainAttrs['aria-label'],'Edit Rice');assert.equal(main.tabIndex,0);
 events.click();assert.deepEqual(calls,['focus',['edit',food]]);calls.length=0;
 let stopped=0;events['toggle-click']({stopPropagation(){stopped++;}});
 assert.equal(stopped,1);assert.equal(calls.length,1);assert.equal(calls[0][0],'row-actions');assert.equal(calls[0][1].entryId,food.id);
 calls.length=0;mainEvents.keydown({key:'Enter',preventDefault(){}});assert.deepEqual(calls,[['edit',food]]);
});
