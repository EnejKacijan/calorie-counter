import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validateFoodEntry} from '../public/add-entry.js';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('function syncFoodNutritionMode()');
const end=source.indexOf('\nfunction ',start+1);
function sync({editing=true,phone=true,expanded=false,summary=true}={}) {
 const fields=Array.from({length:4},()=>({hidden:false}));
 const elements={foodFilterBar:{},foodNutritionSummary:{},foodNutritionGrid:{},foodNutritionEditor:{},foodNutritionAction:{},
  foodSection:{classList:{contains:()=>true,toggle(){}}},
  editFoodNutrition:{attributes:{},setAttribute(k,v){this.attributes[k]=v;}}};
 ['Calories','Protein','Carbs','Fat'].forEach((name,i)=>elements['manualFood'+name]={closest:()=>fields[i]});
 const context=vm.createContext({elements,editingFoodId:editing?'diary-id':null,foodNutritionEditing:expanded,
  desktopEditSession:null,syncNutritionEditorLayout(){},isPhoneAddFoodLayout:()=>phone,hasSourceNutritionSummary:()=>summary});
 vm.runInContext(source.slice(start,end),context);context.syncFoodNutritionMode();
 return {elements,fields};
}
test('Edit Food replaces its macro summary with the inline nutrition editor',()=>{
 const {elements,fields}=sync({expanded:true});
 assert.equal(elements.foodNutritionGrid.hidden,true);
 assert.equal(elements.foodNutritionEditor.hidden,false);
 assert.equal(elements.foodNutritionSummary.hidden,false);
 assert.ok(fields.every(field=>!field.hidden));
 assert.equal(elements.foodNutritionAction.textContent,'Hide details');
 assert.equal(elements.editFoodNutrition.attributes['aria-label'],'Hide nutrition details');
 assert.equal(elements.editFoodNutrition.attributes['aria-expanded'],'true');
});
test('Hide details returns to the compact summary and removes fields from tab order',()=>{
 const {elements,fields}=sync();
 assert.equal(elements.foodNutritionGrid.hidden,false);assert.ok(fields.every(field=>field.hidden));
 assert.equal(elements.foodNutritionAction.textContent,'Edit');
 assert.equal(elements.foodNutritionEditor.hidden,true);
 assert.equal(elements.editFoodNutrition.attributes['aria-expanded'],'false');
});
test('ordinary Add detail and desktop retain their existing expansion behavior',()=>{
 for(const options of [{editing:false},{phone:false}]) {
  const {elements,fields}=sync({...options,expanded:true});
  assert.equal(elements.foodNutritionGrid.hidden,true);assert.ok(fields.every(field=>!field.hidden));
 }
});
test('manual entry without a source summary still shows its input fields',()=>{
 const {elements,fields}=sync({summary:false});
 assert.equal(elements.foodNutritionSummary.hidden,true);assert.ok(fields.every(field=>!field.hidden));
});
test('nutrition entry remains a named native non-submit button controlling the existing fields',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<button id="editFoodNutrition" type="button" aria-controls="manualFoodCalories manualFoodProtein manualFoodCarbs manualFoodFat"><span class="nutrition-section-title" hidden>Nutrition<\/span><span id="foodNutritionAction">Edit nutrition<\/span><\/button>/);
 assert.match(html,/id="foodNutritionBasis">For this entry<\/p>/);
});

function toggleDraft(value,{expanded=true}={}) {
 const calls=[],input={value,closest:()=>({})},elements={editFoodNutrition:{},foodNutritionSummary:{},foodNutritionGrid:{},manualFoodForm:{}};
 for(const key of ['Calories','Protein','Carbs','Fat'])elements['manualFood'+key]=input;
 const context=vm.createContext({elements,editingFoodId:'food',foodNutritionEditing:expanded,
  hasSourceNutritionSummary:()=>true,inlineReveal:{cancel:()=>calls.push('cancel')},
  validateFoodEntry,foodEntryValues:()=>({name:'Food',amount:'1',calories:value,protein:'1',carbs:'2',fat:'3'}),portionMath:{amountError:()=>null},
  entryErrors:(form,errors,focus)=>calls.push({errors,focus}),syncFoodNutritionSummaryFromInputs:()=>calls.push('summary'),syncFoodNutritionMode:()=>calls.push('mode'),
  isPhoneAddFoodLayout:()=>false,disclosureRegion:()=>({}),revealInline:(trigger,region,options)=>calls.push({anchor:options.anchor,policy:options.policy})});
 const start=source.indexOf('elements.editFoodNutrition.addEventListener("click", () => {');
 const code=source.slice(start+'elements.editFoodNutrition.addEventListener("click", () => {'.length,source.indexOf('\n});',start));
 vm.runInContext(`function toggle(){${code}\n}`,context);context.toggle();return{context,calls,elements};
}
test('Hide validates current raw text and retains invalid input without synchronizing it to zero',()=>{
 for(const value of ['', '-', '.', '1,', '1.25', '-1', 'abc']) {
  const {context,calls}=toggleDraft(value);assert.equal(context.foodNutritionEditing,true,value);
  assert.equal(calls[0],'cancel');assert.ok(calls[1].errors.manualFoodCalories);assert.equal(calls[1].focus,false);
  assert.equal(calls.includes('summary'),false);assert.equal(calls.includes('mode'),false);
 }
});
test('Hide keeps current valid decimals and refreshes draft summary without a persistence path',()=>{
 for(const value of ['0','12,5','12.5']){
  const {context,calls}=toggleDraft(value);assert.equal(context.foodNutritionEditing,false);assert.deepEqual(calls,['cancel','summary','mode']);
 }
});
test('Edit uses the stable heading with the completed content-focus helper and never autofocuses',()=>{
 const {context,calls,elements}=toggleDraft('12',{expanded:false});assert.equal(context.foodNutritionEditing,true);
 assert.equal(calls[2].anchor,elements.editFoodNutrition);assert.equal(calls[2].policy,'content-focus');
});
test('Edit action press feedback cancels on pan, release, interruption and disposal without activating',()=>{
 const classes=new Set(),local={},global={},doc={};let dispose;
 const c=vm.createContext({editingFoodId:'entry',isPhoneAddFoodLayout:()=>true,onDispose:f=>dispose=f,
  elements:{editFoodNutrition:{classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)},addEventListener:(t,f)=>local[t]=f}},
  window:{addEventListener:(t,f)=>global[t]=f},document:{visibilityState:'visible',addEventListener:(t,f)=>doc[t]=f}});
 const start=source.indexOf('function bindNutritionActionPress()');
 vm.runInContext(source.slice(start,source.indexOf('\nbindNutritionActionPress();',start)),c);c.bindNutritionActionPress();
 const press=(over={})=>local.pointerdown({isPrimary:true,button:0,pointerId:1,clientX:50,clientY:100,...over});
 press({isPrimary:false});assert.equal(classes.size,0);press({button:2});assert.equal(classes.size,0);
 c.editingFoodId=null;press();assert.equal(classes.size,0);c.editingFoodId='entry';
 press();global.pointermove({pointerId:1,clientX:52,clientY:102});assert.ok(classes.has('is-pressed'));
 global.pointerup({pointerId:2});assert.ok(classes.has('is-pressed'));
 for(const clear of [()=>global.pointermove({pointerId:1,clientX:50,clientY:120}),()=>global.pointerup({pointerId:1}),()=>global.pointercancel({pointerId:1}),global.blur,doc.scroll,()=>{c.document.visibilityState='hidden';doc.visibilitychange();},dispose]) {
  press();assert.ok(classes.has('is-pressed'));clear();assert.equal(classes.size,0);
 }
 assert.equal(local.click,undefined);
});
