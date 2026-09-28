import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function openAddExerciseFromFab()'),app.indexOf('function openSavedFoodsFromFab()'));
const sync=app.slice(app.indexOf('function syncAddModeButtons('),app.indexOf('function openAddFoodFromFab()'));
function fixture({switching=false,editing=false}={}){
 const calls=[],button=mode=>({dataset:{addMode:mode},classList:{toggle(){}},removeAttribute(){},setAttribute(k,v){this[k]=v;}});
 const section=id=>({id,classList:{contains:()=>false,remove(){}},querySelector:()=>null});
 const food=section('foodSection'),exercise=section('exerciseSection'),buttons=[button('food'),button('exercise'),button('food'),button('exercise')];
 const context={elements:{foodSection:food,exerciseSection:exercise,addModeButtons:buttons,exerciseType:{value:'Walking'},exerciseMinutes:{value:'27'},floatingAddButton:{}},
  addSurface:{section:switching?food:null},isPhoneAddFoodLayout:()=>true,modalOpeners:new Map(),editingFoodId:null,selectedFoodBase:null,scannedFoodItems:[],editingExerciseId:editing?'old':null,foodSearchPending:true,
  setFabMenuOpen:()=>calls.push('fab'),closeMobileLogForm:s=>calls.push('close-'+s.id),resetFoodForm:()=>calls.push('reset-food'),resetExerciseForm:()=>calls.push('reset-exercise'),cancelFoodSearch:()=>calls.push('cancel-search'),
  openMobileLogForm(s){calls.push({open:s.id,selected:buttons.map(b=>[b.dataset.addMode,b['aria-selected']]),type:this?.elements?.exerciseType?.value});}};
 vm.createContext(context);vm.runInContext(sync+'\n'+source,context);return {context,calls,buttons};
}
test('direct Exercise prepares selection before the shared mobile Add entry, without changing defaults',()=>{
 const f=fixture();f.context.openAddExerciseFromFab();const open=f.calls.find(c=>typeof c==='object');assert.equal(open.open,'exerciseSection');
 assert.deepEqual(open.selected,[['food','false'],['exercise','true'],['food','false'],['exercise','true']]);assert.equal(f.context.elements.exerciseType.value,'Walking');assert.equal(f.context.elements.exerciseMinutes.value,'27');
 assert.equal(f.calls.includes('reset-exercise'),false);
});
test('Food to Exercise remains an in-session mode switch, not another Add presentation',()=>{
 const f=fixture({switching:true});f.context.openAddExerciseFromFab();assert.equal(f.context.pausedFoodSearch,true);
 assert.deepEqual(f.calls.filter(c=>typeof c==='string'),['cancel-search']);assert.equal(f.calls.filter(c=>typeof c==='object').length,1);
});
test('an existing exercise edit resets through its existing semantic path before a fresh Add',()=>{
 const f=fixture({editing:true});f.context.openAddExerciseFromFab();assert.ok(f.calls.indexOf('reset-exercise')<f.calls.findIndex(c=>typeof c==='object'));
});
test('Today direct Exercise, its header action and FAB shortcut route through the same entry',()=>{
 assert.match(app,/if \(event.target.closest\('\[data-empty-exercise-action="add"\]'\)\) openAddExerciseFromFab\(\)/);
 assert.match(app,/elements.addExerciseToggle.addEventListener\("click", \(\) => \{\s+openAddExerciseFromFab\(\)/);
 assert.match(app,/elements.fabAddExercise\?\.addEventListener\("click", openAddExerciseFromFab\)/);
});
