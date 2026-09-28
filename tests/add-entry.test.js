import test from 'node:test';
import assert from 'node:assert/strict';
import {decimalValue, validateFoodEntry, validateExerciseEntry, commitDiaryDay} from '../public/add-entry.js';
import '../public/food-persistence.js';
const amountError = value => Number(String(value).replace(',', '.')) > 0 ? '' : 'Enter an amount above zero.';
const food = {name:'Banana',amount:'0,5',calories:'60',protein:'1,5',carbs:'12',fat:'1'};
test('Add accepts comma and point decimals without rewriting intermediate text', () => {
  assert.equal(decimalValue('0,5'), .5);assert.equal(decimalValue('0.5'), .5);
  for(const value of ['', '0,', '.', '1,2,3', '-1', 'NaN', 'Infinity']) assert.ok(Number.isNaN(decimalValue(value)),value);
  assert.equal(decimalValue('',true),0);
});
test('Food validation is local to current food values', () => {
  assert.deepEqual(validateFoodEntry(food,amountError),{});
  assert.deepEqual(Object.keys(validateFoodEntry({...food,name:' ',amount:'',calories:'0,'},amountError)),['manualFoodName','foodAmount','manualFoodCalories']);
  assert.ok(validateFoodEntry({...food,protein:'1.23'},amountError).manualFoodProtein);
  assert.deepEqual(validateFoodEntry({...food,protein:'',fat:''},amountError),{});
});
test('Exercise validates duration and current override independently of food', () => {
  assert.deepEqual(validateExerciseEntry({minutes:'25',calories:'200,5'}),{});
  for(const minutes of ['','0','-1','1.5','2,']) assert.ok(validateExerciseEntry({minutes,calories:'50'}).exerciseMinutes);
  assert.ok(validateExerciseEntry({minutes:'25',calories:'bad'}).exerciseCalories);
});
const state=()=>({user:{name:'QA'},selectedDate:'2026-09-10',goals:{calories:2000},days:{'2026-09-10':{foods:[],exercises:[]}}});
test('Food commit writes exactly once before publishing immutable next state', () => {
  const current=state(),day={foods:[{id:'food',amount:.5,unit:'serving',meal:'lunch'}],exercises:[]},writes=[];
  const next=commitDiaryDay({setItemConfirmed:(...v)=>writes.push(v)},current,day);
  assert.equal(writes.length,1);assert.equal(writes[0][0],'calorie-counter-state');assert.deepEqual(JSON.parse(writes[0][1]),next);
  assert.equal(current.days[current.selectedDate].foods.length,0);assert.equal(next.days[next.selectedDate],day);
});
test('Exercise commit preserves foods, profile, targets and unrelated days', () => {
  const current=state();current.days.other={foods:[{id:'older'}]};
  const next=commitDiaryDay({setItemConfirmed(){}},current,{...current.days[current.selectedDate],exercises:[{id:'run',minutes:25,calories:322}]});
  assert.equal(next.user,current.user);assert.equal(next.goals,current.goals);assert.equal(next.days.other,current.days.other);
  assert.equal(next.days[next.selectedDate].exercises.length,1);assert.equal(current.days[current.selectedDate].exercises.length,0);
});
test('Confirmed write failure does not mutate state; retry can write once', () => {
  const current=state(),before=JSON.stringify(current),day={foods:[{id:'retry'}],exercises:[]};let writes=0,fail=true;
  const storage={setItemConfirmed(){if(fail)throw Error('storage unavailable');writes++;},setItem(){assert.fail('must not use optimistic write');}};
  assert.throws(()=>commitDiaryDay(storage,current,day),/storage unavailable/);assert.equal(JSON.stringify(current),before);assert.equal(writes,0);
  fail=false;assert.equal(commitDiaryDay(storage,current,day).days[current.selectedDate].foods.length,1);assert.equal(writes,1);
});
test('Native storage fallback also propagates failures', () => {
  assert.throws(()=>commitDiaryDay({setItem(){throw Error('quota');}},state(),{foods:[],exercises:[]}),/quota/);
});
