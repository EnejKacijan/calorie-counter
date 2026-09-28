import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { mediaIdValid, savedPhotoDefinition } from '../public/food-media.js';
import { sharedPlateCover } from '../public/plate-capture.js';
import { formatFoodDisplayName } from '../public/food-display-name.js';
await import('../public/food-persistence.js');
await import('../public/food-reuse.js');
const foodPersistence=globalThis.IntakeFoodPersistence, foodReuse=globalThis.IntakeFoodReuse;
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const key='calorie-counter-saved-meals';
const food=(id='usda-a',extra={})=>({id,catalogId:id,name:'Rice',source:'USDA',calories:100,protein:3,carbs:20,fat:1,amount:150,unit:'g',serving:'100 g',servingGrams:100,lastUsedAmount:150,lastUsedUnit:'g',lastUsedAt:'2026-09-01T12:00:00.000Z',savedAt:'2026-09-01T12:00:00.000Z',...extra});
const meals=()=>Array.from({length:15},(_,i)=>({id:`m${i}`,name:`Meal ${i}`,meal:'lunch',extra:{tags:[i]},updatedAt:new Date(2026,8,1,0,0,i).toISOString(),foods:[food()]}));
const plain=value=>JSON.parse(JSON.stringify(value));
function code(name) {let start=source.indexOf(`function ${name}(`);const end=source.indexOf('\n}',start+1)+2;assert.ok(start>=0&&end>start);if(source.slice(start-6,start)==='async ')start-=6;return source.slice(start,end);}
function fixture(names, overrides={}) {
  const c=vm.createContext({foodPersistence,foodReuse,mediaIdValid,savedPhotoDefinition,sharedPlateCover,formatFoodDisplayName,collectFoodMediaSoon(){},structuredClone,Date, ...overrides});
  vm.runInContext(names.map(code).join('\n'),c);return c;
}

test('loading 15 Saved Meals preserves exact snapshot metadata and ordering without a write',()=>{
  const initial=meals(),data=JSON.stringify(initial);let writes=0;
  const c=fixture(['loadSavedMeals'],{savedMealLibraryKey:key,localStorage:{getItem:()=>data,setItem(){writes++;}}});
  assert.deepEqual(plain(c.loadSavedMeals()),initial);assert.equal(writes,0);
});

const identityFunctions=['foodSource','normalizedFoodText','foodNameBrandKey','foodIdentityKey','foodsShareIdentity','uniqueSavedFoods','uniqueRecentFoods','normalizeFoodForLibrary'];
test('reading 30 Recent/Saved foods retains last-used portions without rewriting native collections',()=>{
  const initial=Array.from({length:30},(_,i)=>food(`usda-${i}`,{lastUsedAmount:150+i})),writes=[];
  const c=fixture([...identityFunctions,'loadFoodLibrary','loadSavedFoods'],{foodLibraryKey:'recent',savedFoodLibraryKey:'saved',savedFoodMigrationKey:'migration',maxRecentFoodItems:100,roundNutritionValue:n=>Number(n),localStorage:{getItem:k=>k==='migration'?'true':JSON.stringify(initial),setItem:(...args)=>writes.push(args)}});
  for(const list of [c.loadFoodLibrary(),c.loadSavedFoods()]){
    assert.equal(list.length,30);assert.deepEqual(plain(list.map(f=>[f.catalogId,f.lastUsedAmount,f.lastUsedUnit])),initial.map(f=>[f.catalogId,f.lastUsedAmount,f.lastUsedUnit]));
  }
  assert.deepEqual(writes,[]);
});

for(const fail of [false,true]) test(`Save/Unsave exact identity, source separation and ${fail?'failed persistence rollback':'one confirmed write per action'}`,()=>{
  const a=food(),b=food('off-a',{source:'Open Food Facts'}),saved=[a,b];let writes=0;
  const c=fixture([...identityFunctions,'foodForSaving','isFoodSaved','toggleSavedFood'],{savedFoods:saved,savedFoodLibraryKey:'saved',roundNutritionValue:n=>Number(n),elements:{searchNote:{}},renderEntries(){},renderSavedFoods(){},localStorage:{setItemConfirmed(){writes++;if(fail)throw Error('quota');}}});
  c.toggleSavedFood({...a,id:'new-diary-id',amount:300});
  if(fail){assert.equal(c.savedFoods,saved);assert.match(c.elements.searchNote.textContent,/could not/);assert.equal(writes,1);return;}
  assert.equal(c.savedFoods.length,1);assert.equal(c.savedFoods[0],b);
  c.toggleSavedFood({...a,id:'another-diary-id',lastUsedAmount:250});
  assert.equal(c.savedFoods.length,2);assert.equal(c.savedFoods[0].catalogId,a.catalogId);assert.equal(c.savedFoods[0].lastUsedAmount,250);assert.equal(writes,2);
});

test('Recent remove/Undo restores only the removed identity and preserves intervening additions',()=>{
  const a=food(),b=food('usda-b'),next=food('usda-new');let undo,writes=0;
  const c=fixture(['removeRecentFoodWithUndo'],{foodLibrary:[a,b],recentFoodKey:foodPersistence.foodIdentityKey,persistRecentEdit(){writes++;},renderSavedFoods(){},focusReuseFood(){},showUndoToast(message,fn){undo=fn;},elements:{searchNote:{}}});
  c.removeRecentFoodWithUndo(a);assert.deepEqual(plain(c.foodLibrary),[b]);c.foodLibrary.unshift(next);undo();
  assert.equal(c.foodLibrary.length,3);assert.ok(c.foodLibrary.some(f=>f===next));assert.deepEqual(plain(c.foodLibrary.find(f=>f.catalogId===a.catalogId)),a);assert.equal(writes,2);
});

test('Recent Undo never replaces an identity used again after removal',()=>{
  const original=food(),reused=food('usda-a',{lastUsedAmount:300});
  const current=[reused];assert.equal(foodReuse.restoreRemovedItem(current,original,0,foodPersistence.foodIdentityKey),current);assert.equal(current[0].lastUsedAmount,300);
});

for(const fail of [false,true]) test(`Saved Meal delete ${fail?'rolls back on persistence failure':'Undo keeps order, metadata and intervening meals'}`,()=>{
  const initial=meals();let undo,writes=0,backs=0;
  const c=fixture(['saveSavedMeals','deleteSavedMealWithUndo'],{savedMeals:initial,savedMealLibraryKey:key,foodReuseState:{open:false},renderSavedFoods(){},backFoodReusePanel(){backs++;},showUndoToast(message,fn){undo=fn;},setFoodReuseStatus(message){c.status=message;},elements:{searchNote:{}},localStorage:{setItemConfirmed(){writes++;if(fail)throw Error('quota');}}});
  c.deleteSavedMealWithUndo(initial[4]);
  if(fail){assert.equal(c.savedMeals,initial);assert.equal(backs,0);assert.equal(undo,undefined);assert.match(c.status,/could not be deleted/);return;}
  assert.equal(c.savedMeals.length,14);assert.equal(backs,1);const extra={...initial[0],id:'new'};c.savedMeals.push(extra);undo();
  assert.deepEqual(plain(c.savedMeals),[...initial,extra]);assert.equal(writes,2);c.savedMeals[4].extra.tags.push('changed');assert.deepEqual(initial[4].extra.tags,[4]);
});

test('two insertions of the same Saved Meal have independent new diary IDs, nested data and stable food identity',()=>{
  const original=food('usda-a',{aiEstimate:{notes:['source']}});const saved=foodReuse.createSavedMeal({id:'saved',name:'Lunch',meal:'lunch',foods:[original]});const before=structuredClone(saved);
  const one=foodReuse.cloneFoodEntries(saved.foods,{targetDate:'2026-09-10',targetMeal:'dinner'}),two=foodReuse.cloneFoodEntries(saved.foods,{targetDate:'2026-09-10',targetMeal:'dinner'});
  assert.notEqual(one[0].id,two[0].id);assert.notEqual(one[0].id,original.id);assert.equal(foodPersistence.foodIdentityKey(one[0]),foodPersistence.foodIdentityKey(two[0]));
  one[0].amount=999;one[0].aiEstimate.notes.push('edited');assert.equal(two[0].amount,150);assert.deepEqual(two[0].aiEstimate.notes,['source']);assert.deepEqual(saved,before);
});

for(const fail of [false,true]) test(`Saved Meal create uses one confirmed snapshot write and ${fail?'rolls back on failure':'keeps the source independent'}`,()=>{
  const original=food('usda-a',{aiEstimate:{notes:['source']}}),initial=meals();let writes=0;
  const c=fixture(['persistSavedMeal','saveSavedMeals'],{savedMeals:initial,savedMealLibraryKey:key,renderSavedFoods(){},localStorage:{setItemConfirmed(){writes++;if(fail)throw Error('quota');}}});
  const saved=c.persistSavedMeal({name:'  Snapshot  ',meal:'dinner',foods:[original]});assert.equal(writes,1);
  if(fail){assert.equal(saved,null);assert.equal(c.savedMeals,initial);return;}
  assert.equal(saved.name,'Snapshot');assert.equal(saved.meal,'dinner');assert.equal(c.savedMeals.length,16);assert.deepEqual(plain(c.savedMeals.slice(1)),initial);original.aiEstimate.notes.push('later edit');assert.deepEqual(plain(saved.foods[0].aiEstimate.notes),['source']);
});

test('nested Back restores meal selection, then menu, then closes instead of dropping the hierarchy',()=>{
  let focused='',closed=0;const c=fixture(['backFoodReusePanel'],{foodReuseState:{view:'saved-meal-review',savedMealReturnView:'saved-meals',savedMealId:'m0'},renderFoodReusePanel(){},closeFoodReusePanel(){closed++;},elements:{foodReuseContent:{querySelectorAll:()=>[{dataset:{savedMealId:'m0'},focus(){focused='m0';}}],querySelector:()=>({focus(){focused='menu';}})}}});
  c.backFoodReusePanel();assert.equal(c.foodReuseState.view,'saved-meals');assert.equal(focused,'m0');c.backFoodReusePanel();assert.equal(c.foodReuseState.view,'menu');c.backFoodReusePanel();assert.equal(closed,1);
});

for(const available of [true,false]) test(`saving photographed diary meal ${available?'holds its shared cover through persistence':'rejects an already missing cover without a broken saved reference'}`,async()=>{
 const id='photo-sharedPlate123',foods=[food('one',{captureId:id}),food('two',{captureId:id})];let held=false,writes=0,closed=0;
 const c=fixture(['saveMealFromSelectedGroup'],{groupMealSaveBusy:false,state:{selectedDate:'today'},foodReuseState:{selectedMeal:'lunch',view:'save-meal-name',open:true},foodMealGroups:()=>[{meal:'lunch',foods}],isActive:()=>true,elements:{searchNote:{}},
  async withFoodPhotos(ids,action){assert.deepEqual(plain(ids),[id]);held=true;try{return await action(new Set(available?ids:[]));}finally{held=false;}},
  persistSavedMeal(value){assert.equal(held,true);assert.equal(value.coverImageId,id);writes++;return {name:'Plate'};},closeFoodReusePanel(){closed++;},setFoodReuseStatus(message){c.status=message;}});
 assert.equal(await c.saveMealFromSelectedGroup('Plate'),available);assert.equal(writes,available?1:0);assert.equal(closed,available?1:0);assert.equal(held,false);assert.equal(c.groupMealSaveBusy,false);if(!available)assert.match(c.status,/could not be saved/);
});

test('Saved Meal deletion acquires an Undo cover lease before removing its owner',async()=>{
 const meal={...meals()[0],coverImageId:'photo-sharedPlate123'};let protectedPhoto=false,undo,options;
 const lease={release(){protectedPhoto=false;}};
 const c=fixture(['deleteSavedMealWithUndo'],{savedMeals:[meal],foodReuseState:{open:false},isActive:()=>true,async holdUndoPhotos(ids){assert.deepEqual(plain(ids),[meal.coverImageId]);protectedPhoto=true;return lease;},
  saveSavedMeals(){assert.equal(protectedPhoto,true);},renderSavedFoods(){},backFoodReusePanel(){},showUndoToast(message,action,settings){undo=action;options=settings;},setFoodReuseStatus(){}});
 await c.deleteSavedMealWithUndo(meal);assert.equal(c.savedMeals.length,0);assert.equal(options.photoLease,lease);undo();assert.equal(c.savedMeals[0].coverImageId,meal.coverImageId);assert.equal(protectedPhoto,true);
});

test('reuse Undo is hosted inside the active sheet/Add focus boundary and returns to body after closing',()=>{
  let host;const toast={};const container=name=>({appendChild(){host=name;},classList:{contains:()=>true}});
  const c=fixture(['positionReuseUndoToast'],{document:{querySelector:()=>toast,body:container('body')},elements:{foodReusePanel:container('reuse'),foodSection:container('add')},foodReuseState:{open:true}});
  c.positionReuseUndoToast();assert.equal(host,'reuse');assert.equal(toast.inert,false);c.foodReuseState.open=false;c.positionReuseUndoToast();assert.equal(host,'add');c.elements.foodSection.classList.contains=()=>false;c.positionReuseUndoToast();assert.equal(host,'body');
});
