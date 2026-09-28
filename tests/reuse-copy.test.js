import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {commitDiaryDay} from '../public/add-entry.js';
import {localRecordId} from '../public/local-record-id.js';
await import('../public/food-reuse.js');
await import('../public/food-persistence.js');
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('function copyFoodEntries('),end=source.indexOf('\nfunction ',start+1);
const plain=v=>JSON.parse(JSON.stringify(v));
const food=(id,meal='breakfast')=>({id,name:'QA food',amount:150,unit:'g',meal,calories:664,protein:20,carbs:70,fat:18,loggedAt:'2026-09-20T06:15:00Z',metadata:{tags:['source']}});
function fixture({target='2026-09-19',from='2026-09-20',foods=[food('a'),food('b')]}={}){
 let value,fail=false,idCalls=0,writes=0;const initial={selectedDate:target,days:{[from]:{foods,exercises:[]},...(target===from?{}:{[target]:{foods:[],exercises:[]}})}};
 const c=vm.createContext({state:structuredClone(initial),foodReuseState:{open:true},foodLibrary:[],editingFoodId:null,
  foodReuse:globalThis.IntakeFoodReuse,foodPersistence:globalThis.IntakeFoodPersistence,commitDiaryDay,maxRecentFoodItems:100,
  // Exercise the canonical getRandomValues fallback, not a second UUID path.
  localRecordId(){idCalls++;return localRecordId({getRandomValues:a=>crypto.getRandomValues(a)});},
  localStorage:{setItemConfirmed(k,v){writes++;if(fail)throw Error('quota');value=v;}},
  isFutureDateKey:day=>day>'2026-09-19',currentDay:()=>c.state.days[target],foodSource:f=>f.source||'Manual',normalizeFoodForLibrary:f=>f,saveFoodLibrary(){},
  closeFoodReusePanel(){c.foodReuseState.open=false;},mealLabel:v=>v,render(){},resetFoodForm(){},elements:{searchNote:{}},
  setFoodReuseStatus(message){c.error=message;}});
 vm.runInContext(source.slice(start,end),c);
 return{c,initial,copy:(entries=c.state.days[from].foods,options={})=>c.copyFoodEntries(entries,{sourceDate:from,...options}),setFail:v=>fail=v,stats:()=>({value,writes,idCalls})};
}
for(const [from,target] of [['2026-09-20','2026-09-19'],['2026-09-18','2026-09-19'],['2026-09-19','2026-09-20']])test(`whole batch ${from} -> ${target}, canonical IDs, one write, reload and immutable source`,()=>{
 const f=fixture({from,target});assert.equal(f.copy(),true);const {value,writes,idCalls}=f.stats(),stored=JSON.parse(value),clones=stored.days[target].foods;
 assert.equal(writes,1);assert.equal(idCalls,2);assert.equal(new Set(clones.map(f=>f.id)).size,2);assert.equal(stored.selectedDate,target);
 for(const [i,clone]of clones.entries()){assert.notEqual(clone.id,f.initial.days[from].foods[i].id);assert.equal(clone.loggedForDate,target);assert.equal(clone.copiedFromDate,from);assert.equal(new Date(clone.loggedAt).getHours(),new Date(f.initial.days[from].foods[i].loggedAt).getHours());assert.equal(clone.amount,150);assert.equal(clone.unit,'g');assert.equal(clone.calories,664);assert.equal(clone.localFoodId,['a','b'][i]);}
 assert.deepEqual(stored.days[from],f.initial.days[from]);f.c.state.days[target].foods[0].metadata.tags.push('edited');f.c.state.days[target].foods.pop();assert.deepEqual(plain(f.c.state.days[from]),f.initial.days[from]);
});
test('whole day preserves all meals; meal-only shares path and selects just breakfast',()=>{
 const foods=['breakfast','lunch','dinner','snack'].map((m,i)=>food(String(i),m));const day=fixture({foods});day.copy();assert.deepEqual(plain(day.c.state.days['2026-09-19'].foods.map(f=>f.meal)),foods.map(f=>f.meal));
 const meal=fixture({foods});meal.copy(meal.c.state.days['2026-09-20'].foods.filter(f=>f.meal==='breakfast'),{targetMeal:'breakfast'});assert.equal(meal.c.state.days['2026-09-19'].foods.length,1);
});
test('same-date and deliberate repeat logging remain allowed; closed/busy operations cannot double commit',()=>{
 const f=fixture({from:'2026-09-19'});f.c.foodReuseState.copyBusy=true;assert.equal(f.copy(),false);f.c.foodReuseState.copyBusy=false;const originals=[...f.c.state.days['2026-09-19'].foods];f.copy(originals);assert.equal(f.copy(originals),false);assert.equal(f.stats().writes,1);f.c.foodReuseState.open=true;assert.equal(f.copy(originals),true);assert.equal(f.c.state.days['2026-09-19'].foods.length,6);assert.equal(new Set(f.c.state.days['2026-09-19'].foods.map(f=>f.id)).size,6);
});
test('failed confirmed write leaves both in-memory collections intact, retains sheet and retries without partial batch',()=>{
 const f=fixture(),before=plain(f.c.state),library=f.c.foodLibrary;f.setFail(true);assert.equal(f.copy(),false);assert.deepEqual(plain(f.c.state),before);assert.equal(f.c.foodLibrary,library);assert.equal(f.c.foodReuseState.open,true);assert.equal(f.c.foodReuseState.copyBusy,false);assert.equal(f.stats().writes,1,'no compensating write');assert.match(f.c.error,/try again/);f.setFail(false);assert.equal(f.copy(),true);assert.equal(JSON.parse(f.stats().value).days['2026-09-19'].foods.length,2);
});
test('legacy optional metadata may be missing, catalog/food identity and nutrition remain exact',()=>{
 const legacy={id:'usda-old',name:'QA legacy',calories:100,protein:4,carbs:15,fat:2};const f=fixture({foods:[legacy]});assert.equal(f.copy(),true);const [copy]=f.c.state.days['2026-09-19'].foods;assert.equal(copy.catalogId,'usda-old');assert.equal(copy.calories,100);assert.equal(copy.amount,undefined);assert.equal(copy.unit,undefined);
});
test('invalid mixed batch is rejected before ID generation/storage; empty source never reports success',()=>{
 const f=fixture({foods:[food('a'),{...food('bad'),protein:undefined}]});assert.equal(f.copy(),false);assert.equal(f.stats().writes,0);assert.equal(f.stats().idCalls,0);assert.equal(f.c.state.days['2026-09-19'].foods.length,0);assert.match(f.c.error,/incomplete nutrition/);assert.equal(f.copy([]),false);assert.match(f.c.error,/No food/);
});
test('source picker does not prohibit an existing future diary day',()=>{assert.doesNotMatch(source,/data-reuse-source-date[^>]*\bmax=/);});
