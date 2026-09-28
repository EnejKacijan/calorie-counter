import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {settingsSummary} from '../public/profile-settings.js';
import '../public/meal-schedule.js';
const meals=globalThis.IntakeMealSchedule;
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const state={user:{goalType:'lose',weightKg:81.5,targetWeightKg:80,activityMultiplier:1.55,weeklyRateKg:.5,themePreference:'system'},goals:{calories:2345,protein:161.25,carbs:279.85,fat:64.45},goalsAreCustom:true};

test('Profile macro summary labels actual targets individually with existing rounding, order and units',()=>{
 const before=structuredClone(state),summary=settingsSummary(state,meals);
 assert.deepEqual(summary.macros,[['Protein','161.3 g'],['Carbs','279.9 g'],['Fat','64.5 g']]);
 assert.equal(summary.calories,'2,345');
 assert.deepEqual(summary.plan,[['Current weight','81.5 kg'],['Goal weight','80 kg'],['Activity','Moderately active'],['Pace','0.5 kg/week']]);
 assert.deepEqual(state,before,'rendering never mutates custom targets or recalculates them');
 assert.match(read('profile.html'),/<dl class="settings-macros" id="planMacros" aria-label="Daily macro targets"><\/dl>/);
 assert.match(read('profile-settings.js'),/\["#planMacros", summary.macros\]/);
});
test('Profile Lose/Maintain/Gain keep the same target source and applicable plan rows',()=>{
 for(const goalType of ['lose','maintain','gain']){
  const s=settingsSummary({...state,user:{...state.user,goalType}},meals);
  assert.deepEqual(s.macros,settingsSummary(state,meals).macros);
  for(const field of ['Goal weight','Pace'])assert.equal(s.plan.some(([label])=>label===field),goalType!=='maintain');
 }
});
test('Appearance summary shows saved preference rather than resolved color, including legacy fallback',()=>{
 for(const themePreference of ['system','light','dark'])for(const theme of ['light','dark']){
  const s=settingsSummary({...state,theme,user:{...state.user,theme,themePreference}},meals);
  assert.equal(s.appearance,themePreference[0].toUpperCase()+themePreference.slice(1));
 }
 assert.equal(settingsSummary({...state,user:{...state.user,themePreference:undefined,theme:'dark'}},meals).appearance,'Dark');
});
test('Profile summary retains explicit fields, optional name and stored meal boundaries',()=>{
 const s=settingsSummary({...state,user:{...state.user,name:' ',mealSchedule:{breakfastEnd:'10:15',lunchEnd:'15:45'}}},meals);
 assert.deepEqual(s.personal.map(([label])=>label),['Name','Sex','Age','Height']);assert.equal(s.personal[0][1],'Not set · optional');
 assert.deepEqual(s.schedule,[['Breakfast','before 10:15'],['Lunch','10:15 – 15:45'],['Dinner','after 15:45']]);
});
test('Profile actions retain distinct accessible names and single existing Appearance sheet trigger',()=>{
 const html=read('profile.html');
 for(const [key,name] of [['personal','Edit personal details'],['schedule','Edit meal schedule']])
  assert.match(html,new RegExp(`data-edit-settings="${key}" aria-label="${name}">Edit</button>`));
 assert.equal((html.match(/data-edit-settings="appearance"/g)||[]).length,1);
 assert.match(html,/data-edit-settings="appearance" class="settings-destination" aria-labelledby="appearanceTitle savedAppearance"/);
 assert.doesNotMatch(html,/Edit appearance|Edit details|Edit schedule/);
 const js=read('profile-settings.js');
 assert.equal((js.match(/root.querySelectorAll\("\[data-edit-settings\]"\)/g)||[]).length,1);
 assert.match(js,/editor.open\(name==='plan'\?'page':'sheet',editButton\(name\)\)/);
});
