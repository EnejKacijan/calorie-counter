import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createWeightFeedback,updateWeightEntries} from '../public/progress.js';
const source=readFileSync(new URL('../public/progress.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/progress.html',import.meta.url),'utf8');
function feedback(){let current=null, next=0;const timers=new Map(), renders=[];const ui=createWeightFeedback({setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),render:value=>{current=value;renders.push(value?.message||'');}});return{ui,timers,renders,get current(){return current;},expire(){const t=[...timers.values()][0];t.fn();}};}
test('Weight Undo restores once, replaces rather than stacks, then expires completely',()=>{const f=feedback();let count=0;f.ui.deleted(()=>{count++;});const undo=f.current.undo;assert.equal([...f.timers.values()][0].ms,8000);undo();undo();assert.equal(count,1);assert.equal(f.current.phase,'restored');assert.equal(f.current.undo,null);assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,2000);f.expire();assert.equal(f.current,null);assert.equal(f.timers.size,0);undo();assert.equal(count,1);});
test('Weight latest deletion owns Undo; expiry/dispose invalidate old closures',()=>{const f=feedback();let count=0;f.ui.deleted(()=>{count+=1;});const old=f.current.undo;f.ui.deleted(()=>{count+=10;});old();assert.equal(count,0);const latest=f.current.undo;f.expire();latest();assert.equal(count,0);assert.equal(f.current,null);f.ui.deleted(()=>{count+=100;});const disposed=f.current.undo;f.ui.dispose();disposed();assert.equal(count,0);assert.equal(f.timers.size,0);});
test('Weight failed Undo preserves action only for original bounded window and permits retry',()=>{const f=feedback();let fail=true,count=0;f.ui.deleted(()=>{if(fail)return 'Try Undo again';count++;});const timer=[...f.timers.keys()][0];f.current.undo();assert.equal(f.current.message,'Try Undo again');assert.equal([...f.timers.keys()][0],timer);fail=false;f.current.undo();assert.equal(count,1);assert.equal(f.current.phase,'restored');});
test('Weight handler commits current raw text, suppresses repeat submit, and releases busy on failure',()=>{
 const fn=source.slice(source.indexOf('function submitWeight('),source.indexOf('function deleteWeight('));
 const context={weightSaving:false,weightSheet:{active:true,closing:false},elements:{weightSave:{disabled:false},progressDate:{value:'2026-09-19'},progressWeight:{value:'82,5'}},state:{progress:[]},editingWeightId:null,localDateKey:()=> '2026-09-19',updateWeightEntries:(...args)=>updateWeightEntries(...args,()=> 'new'),fail:true,calls:0,showWeightError:text=>{context.error=text;},persistWeightChange:entries=>{if(context.fail)throw Error('quota');context.calls++;context.state.progress=entries;},closeWeightSheet:options=>{context.closeOptions=options;context.weightSheet.closing=true;}};
 vm.createContext(context);vm.runInContext(fn,context);const event={preventDefault(){}};
 context.submitWeight(event);assert.equal(context.calls,0);assert.equal(context.closeOptions,undefined);assert.equal(context.elements.weightSave.disabled,false);assert.equal(context.elements.progressWeight.value,'82,5');assert.match(context.error,/could not be saved/);context.fail=false;context.submitWeight(event);context.submitWeight(event);assert.equal(context.calls,1);assert.equal(context.state.progress[0].weightKg,82.5);assert.equal(context.closeOptions.stableViewportExit,true);
});
test('Weight visible state commits only after confirmed persistence; no optimistic Current on failure',()=>{
 const fn=source.slice(source.indexOf('function persistWeightChange('),source.indexOf('function submitWeight('));
 const state={progress:[{id:'a',weightKg:83}],user:{weightKg:83,targetWeightKg:80},goals:{calories:2000}};const context={state,fail:true,renders:0,pagerResets:0,weightPager:{reset:()=>context.pagerResets++},nutritionPager:{reset:()=>context.pagerResets++},dailyWeightEntries:e=>e,saveState:next=>{if(context.fail)throw Error('quota');context.saved=structuredClone(next);},render:()=>context.renders++};vm.createContext(context);vm.runInContext(fn,context);
 const next=[...state.progress,{id:'b',weightKg:82}];assert.throws(()=>context.persistWeightChange(next));assert.equal(state.user.weightKg,83);assert.equal(state.progress.length,1);assert.equal(context.renders,0);assert.equal(context.pagerResets,0);context.fail=false;context.persistWeightChange(next);assert.equal(state.user.weightKg,82);assert.equal(context.saved.user.targetWeightKg,80);assert.equal(context.renders,1);assert.equal(context.pagerResets,2);assert.match(source,/setItemConfirmed\(storageKey/);
});
test('Weight sheet is one shared viewport/focus owner and one snackbar; no buried inline form',()=>{
 assert.equal((html.match(/id="progressForm"/g)||[]).length,1);assert.equal((html.match(/id="weightUndoToast"/g)||[]).length,1);assert.doesNotMatch(html,/weight-log-panel|id="weightFeedback"/);assert.match(html,/id="weightSheet" role="dialog" aria-modal="true" aria-labelledby="weightFormTitle"/);assert.match(html,/id="progressDate" type="date"/);assert.match(html,/inputmode="decimal" enterkeyhint="done"/);
 const flow=source.slice(source.indexOf('function showWeightError'),source.indexOf('function changeWeightPeriod'));assert.match(flow,/createSheetSurface/);assert.match(flow,/initialFocus: \(\) => elements.progressWeight/);assert.match(flow,/elements.progressWeight.select\(\)/);assert.doesNotMatch(flow,/scrollIntoView|window.scrollTo|visualViewport|setTimeout\(/);assert.match(flow,/weightSheet\?\.active \? elements.weightSheetNotice : document.body/);
});
test('Weight is first in the native focus order, has an associated unit, and Date remains a native secondary control',()=>{
 assert.ok(html.indexOf('for="progressWeight"')<html.indexOf('for="progressDate"'));
 assert.match(html,/aria-describedby="weightUnit"/);assert.match(html,/<span id="weightUnit">kg<\/span>/);
 assert.match(html,/class="weight-date-field" for="progressDate"/);
 assert.match(source,/name === 'weightKg' \? 'weightUnit'/);
});
test('sheet initial focus has final geometry, once, with no competing translation for an autofocus editor',()=>{
 const shared=readFileSync(new URL('../public/mobile-surface.js',import.meta.url),'utf8');
 const open=shared.slice(shared.indexOf('  function open('),shared.indexOf('  function finish('));
 assert.match(open,/update\(\{ focusIfOutside: false \}\); focus\(\);/);
 const entry=open.slice(open.indexOf("panel.dataset.sheetState = 'open'"));
 assert.ok(entry.indexOf('focus();')<entry.indexOf('panel.animate'));
 assert.match(open,/if \(!editingEntry\) animation = panel.animate/);
 assert.equal((open.match(/focus\(\)/g)||[]).length,1);
});
