import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSafeStorage} from '../public/data-safety.js';
import {settingsSummary} from '../public/profile-settings.js';
import '../public/meal-schedule.js';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('Today retains hierarchy and one contextual empty/populated Reuse entry point',()=>{
  const html=read('index.html'),js=read('app.js');
  assert.ok(html.indexOf('id="foodList"')<html.indexOf('id="exerciseList"'));assert.doesNotMatch(html,/mobile-diary-stats|mobileWeightValue|mobileStreakValue/);
  assert.match(js,/foodLogOptionsButton.hidden = day.foods.length === 0/);assert.equal((js.match(/reuse.dataset.emptyFoodAction = "reuse"/g)||[]).length,1);
  assert.match(js,/openFoodReusePanel\("menu", \{ sourceDate, opener:/);assert.match(html,/class="log-title-meta"/);
  assert.match(read('food-reuse.css'),/min-width: 44px; min-height: 44px/);
  assert.match(read('today-diary.css'),/\.log-title-meta > \.label \{ position:static; inset:auto; display:inline; width:auto;/,'nested heading stays in flow and cannot cover diary actions');
});
test('Profile is a summary hub with one shared form and a separate privacy destination',()=>{
  const html=read('profile.html');assert.equal((html.match(/id="profileForm"/g)||[]).length,1);
  assert.ok(html.indexOf('id="privacyControls"')>html.indexOf('id="profileDataScreen"'));
  for(const name of ['profileSexChoice','profileThemeChoice'])assert.match(html,new RegExp(`type="radio" name="${name}"`));
  assert.doesNotMatch(html,/<select id="profileTheme"/);assert.match(read('profile-settings.js'),/editor.open\(name==='plan'\?'page':'sheet'/);
});
test('Profile schedule summary derives three ranges from the same two boundaries',()=>{
  const summary=settingsSummary({user:{goalType:'maintain',mealSchedule:{breakfastEnd:'09:30',lunchEnd:'14:30'}},goals:{}},globalThis.IntakeMealSchedule);
  assert.deepEqual(summary.schedule,[['Breakfast','before 09:30'],['Lunch','09:30 – 14:30'],['Dinner','after 14:30']]);
  assert.equal(summary.plan.some(([label])=>label==='Pace'||label==='Goal weight'),false);
});
test('Profile router distinguishes summary entry/reselect from an active editor',()=>{
  const router=read('app-router.js'),settings=read('profile-settings.js');
  assert.match(router,/path==='\/profile.html' \? 0 : scrollPositions.get\(path\)/);
  assert.match(router,/dataset.profileView==='summary'\)window.scrollTo/);
  assert.match(router,/scope.canLeave\(\{pop,to:path\}\)/);
  assert.match(settings,/if \(section\) \{ if\(pop\)leave\(\); return false; \}/);
});
test('Profile surfaces blur before close and use shared lock/viewport/focus/sheet ownership',()=>{
  const s=read('profile-surface.js');assert.match(s,/closing=true;blur\(\)/);assert.match(s,/createSheetSurface\(\{panel,backdrop/);assert.match(s,/bindSurfaceViewport\(panel,win,\{scroller\}\)/);
  assert.doesNotMatch(s,/scrollIntoView/);assert.match(read('profile-settings.css'),/body.profile-nested-open:not\(.profile-page-open\) > .mobile-tabbar \{ display:none!important/);
});
function store(){const data=new Map();let fails=false;const native={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem(k,v){if(fails)throw Error('quota');data.set(k,v);},removeItem:k=>data.delete(k)};return{data,native,fail:()=>fails=true,allow:()=>fails=false};}
test('actual pending writes alone expose Retry and successful retry hides it without losing content',()=>{
  const f=store(),s=createSafeStorage(f.native);assert.equal(s.pendingCount,0);f.fail();s.setItem('calorie-counter-saved-foods','[]');assert.equal(s.pendingCount,1);assert.ok(s.status);assert.equal(f.data.has('calorie-counter-saved-foods'),false);
  f.allow();s.retry();assert.equal(s.pendingCount,0);assert.equal(s.status,'');assert.equal(f.data.get('calorie-counter-saved-foods'),'[]');
  assert.match(read('privacy-controls.js'),/hidden=storage.pendingCount===0/);
});
test('confirmed editor failure does not enqueue a cancelled draft as retryable content',()=>{
  const f=store(),s=createSafeStorage(f.native);f.fail();assert.throws(()=>s.setItemConfirmed('calorie-counter-saved-foods','[]'));assert.equal(s.pendingCount,0);
});
