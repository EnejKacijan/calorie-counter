import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRecommendedGoals } from '../public/profile.js';
import { createSettingsDraft, validateSettings, recalculateSettingsDraft, buildSettingsState, settingsSummary } from '../public/profile-settings.js';
import { resolveAppearance } from '../public/appearance.js';
import '../public/meal-schedule.js';
const meals=globalThis.IntakeMealSchedule;
const fixture=goalType=>({user:{name:'',sex:'male',age:30,heightCm:180,weightKg:80,targetWeightKg:goalType==='gain'?85:70,goalType,activityMultiplier:1.375,weeklyRateKg:.5,theme:'light',note:'keep'}, goals:{calories:2000,protein:140,carbs:240,fat:60},goalsAreCustom:true,progress:[{id:'existing',date:'2026-09-11',weightKg:80,note:'weight metadata'}],days:{'2026-09-10':{foods:[{name:'QA',meal:'lunch',calories:250}],exercises:[]}},theme:'light'});
for(const goal of ['lose','maintain','gain']) test(`Profile ${goal}: summary and conditional fields`,()=>{
  const state=fixture(goal),draft=createSettingsDraft(state,meals),summary=settingsSummary(state,meals);
  assert.equal(summary.calories,'2,000');assert.match(summary.personal[0][1],/optional/);
  assert.equal(summary.plan.some(([key])=>key==='Goal weight'),goal!=='maintain');
  if(goal==='maintain') {draft.user.targetWeightKg='';draft.user.weeklyRateKg='';}
  assert.deepEqual(validateSettings('plan',draft,meals),{});
  if(goal!=='maintain'){draft.user.targetWeightKg='';draft.user.weeklyRateKg='';assert.ok(validateSettings('plan',draft,meals).targetWeightKg);assert.ok(validateSettings('plan',draft,meals).weeklyRateKg);}
});
test('Profile draft edits and Cancel do not mutate source data',()=>{
  const state=fixture('lose'),before=structuredClone(state),draft=createSettingsDraft(state,meals);
  draft.user.name='Edited';draft.user.mealSchedule.breakfastEnd='09:00';draft.goals.calories=3000;
  assert.deepEqual(state,before);assert.equal(createSettingsDraft(state,meals).goals.calories,2000);
});
test('Profile optional name and personal validation',()=>{
  const draft=createSettingsDraft(fixture('maintain'),meals); assert.deepEqual(validateSettings('personal',draft,meals),{});
  for(const age of ['',17,30.5,101]){draft.user.age=age;assert.ok(validateSettings('personal',draft,meals).age);}
  draft.user.age=30;draft.user.heightCm=119;assert.ok(validateSettings('personal',draft,meals).heightCm);
  draft.user.heightCm=180;draft.user.sex='';assert.ok(validateSettings('personal',draft,meals).sex);
});
test('Profile decimal weights and target validation are explicit',()=>{
  const draft=createSettingsDraft(fixture('lose'),meals);draft.user.weightKg='80,5';assert.deepEqual(validateSettings('plan',draft,meals),{});
  for(const weight of ['',34,251,'0x50','80.55','80foo']) {draft.user.weightKg=weight;assert.ok(validateSettings('plan',draft,meals).weightKg);}
  draft.user.weightKg=80;draft.goals.calories=1199;assert.ok(validateSettings('plan',draft,meals).calories);
});
test('Profile custom targets survive body/activity changes until explicit Use recommended',()=>{
  const state=fixture('gain'),draft=createSettingsDraft(state,meals);draft.user.weightKg=81;draft.user.activityMultiplier=1.55;
  recalculateSettingsDraft(state,draft,calculateRecommendedGoals);assert.deepEqual(draft.goals,state.goals);
  recalculateSettingsDraft(state,draft,calculateRecommendedGoals,true);assert.equal(draft.goalsAreCustom,false);
  const result=calculateRecommendedGoals(draft.user);assert.equal(draft.goals.calories,result.calories);
});
test('Profile recommendations update on calculation inputs, not on name-only edits',()=>{
  const state=fixture('lose');state.goalsAreCustom=false;
  const draft=createSettingsDraft(state,meals);draft.user.name='Changed name';recalculateSettingsDraft(state,draft,calculateRecommendedGoals);assert.deepEqual(draft.goals,state.goals);
  draft.user.age=40;recalculateSettingsDraft(state,draft,calculateRecommendedGoals);assert.notDeepEqual(draft.goals,state.goals);
});
test('Profile undoing a body edit restores the original automatic targets',()=>{
  const state=fixture('lose');state.goalsAreCustom=false;
  const draft=createSettingsDraft(state,meals);draft.user.age=40;recalculateSettingsDraft(state,draft,calculateRecommendedGoals);
  assert.notDeepEqual(draft.goals,state.goals);draft.user.age=30;recalculateSettingsDraft(state,draft,calculateRecommendedGoals);
  assert.deepEqual(draft.goals,state.goals);
});
test('Profile explicit recommendations stay applied after returning to original inputs',()=>{
  const state=fixture('gain'),draft=createSettingsDraft(state,meals);
  recalculateSettingsDraft(state,draft,calculateRecommendedGoals,true);const expected={...draft.goals};
  draft.user.age=40;recalculateSettingsDraft(state,draft,calculateRecommendedGoals);
  draft.user.age=30;recalculateSettingsDraft(state,draft,calculateRecommendedGoals);
  assert.deepEqual(draft.goals,expected);assert.equal(draft.goalsAreCustom,false);
});
test('Profile explicit refresh of older automatic targets remains intentional after input undo',()=>{
  const state=fixture('lose');state.goalsAreCustom=false;
  const draft=createSettingsDraft(state,meals);recalculateSettingsDraft(state,draft,calculateRecommendedGoals,true);const expected={...draft.goals};
  assert.notDeepEqual(expected,state.goals);draft.user.age=40;recalculateSettingsDraft(state,draft,calculateRecommendedGoals);
  draft.user.age=30;recalculateSettingsDraft(state,draft,calculateRecommendedGoals);assert.deepEqual(draft.goals,expected);
  assert.equal('applyRecommendations' in buildSettingsState(state,draft,'plan',{today:'2026-09-11'}),false);
});
test('Profile plan save keeps today weight ID and preserves diary, metadata and unrelated fields',()=>{
  const state=fixture('lose'),draft=createSettingsDraft(state,meals);draft.user.weightKg='80,5';
  const next=buildSettingsState(state,draft,'plan',{today:'2026-09-11'});
  assert.equal(next.progress.length,1);assert.equal(next.progress[0].id,'existing');assert.equal(next.progress[0].note,'weight metadata');assert.equal(next.progress[0].weightKg,80.5);
  assert.deepEqual(next.days,state.days);assert.equal(next.user.note,'keep');assert.equal(state.user.weightKg,80);
});
test('Profile personal save does not log weight or change schedule/theme',()=>{
  const state=fixture('maintain'),draft=createSettingsDraft(state,meals);draft.user.name='  Sam  ';draft.user.age=31;
  const next=buildSettingsState(state,draft,'personal');assert.equal(next.user.name,'Sam');assert.equal(next.user.age,31);
  assert.deepEqual(next.progress,state.progress);assert.deepEqual(next.days,state.days);assert.equal(next.user.theme,'light');assert.equal(next.user.mealSchedule,state.user.mealSchedule);
});
test('Profile Maintain save removes the need for goal weight and pace',()=>{
  const state=fixture('lose'),draft=createSettingsDraft(state,meals);draft.user.goalType='maintain';draft.user.targetWeightKg='';draft.user.weeklyRateKg='';
  const next=buildSettingsState(state,draft,'plan',{today:'2026-09-11'});assert.equal(next.user.targetWeightKg,80);assert.equal(next.user.weeklyRateKg,0);
});
test('Profile meal schedule validates ordering and saves only boundaries',()=>{
  const state=fixture('maintain'),draft=createSettingsDraft(state,meals);draft.user.mealSchedule={breakfastEnd:'17:00',lunchEnd:'16:00'};
  assert.ok(validateSettings('schedule',draft,meals).lunchEnd);draft.user.mealSchedule={breakfastEnd:'09:30',lunchEnd:'14:30'};assert.deepEqual(validateSettings('schedule',draft,meals),{});
  const next=buildSettingsState(state,draft,'schedule');assert.deepEqual(next.days,state.days);assert.deepEqual(next.goals,state.goals);assert.deepEqual(next.progress,state.progress);
  assert.equal(meals.defaultMealForDate(new Date(2026,8,11,10),next.user.mealSchedule),'lunch');
});
test('Profile appearance preserves profile inputs and all nutrition/history data',()=>{
  const state=fixture('gain'),draft=createSettingsDraft(state,meals);draft.user.themePreference='system';
  const next=buildSettingsState(state,draft,'appearance',{dark:true});assert.equal(next.theme,'dark');assert.equal(next.user.themePreference,'system');
  assert.deepEqual({...next.user,theme:state.user.theme,themePreference:undefined},{...state.user,themePreference:undefined});
  assert.deepEqual(next.goals,state.goals);assert.deepEqual(next.progress,state.progress);assert.deepEqual(next.days,state.days);
  assert.equal(resolveAppearance('system',false),'light');assert.equal(resolveAppearance('system',true),'dark');assert.equal(resolveAppearance('light',true),'light');assert.equal(resolveAppearance('dark',false),'dark');
});
test('Profile recommendation baselines remain unchanged for Lose/Maintain/Gain',()=>{
  for(const [goal,calories,protein,carbs,fat] of [['lose',1900,140,216,53],['maintain',2450,128,332,68],['gain',3000,144,419,83]])
    assert.deepEqual(calculateRecommendedGoals(fixture(goal).user),{calories,protein,carbs,fat,bmr:1780,tdee:2448});
});
