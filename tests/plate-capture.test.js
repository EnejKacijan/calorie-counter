import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {captureContext,captureBlocks,sharedPlateCover,createCaptureDraft} from '../public/plate-capture.js';
import {collectPhotoReferences,transformPhotoReferences,savedPhotoDefinition,createFoodMediaStore} from '../public/food-media.js';
import {commitDiaryDay} from '../public/add-entry.js';
await import('../public/food-reuse.js');await import('../public/food-persistence.js');
const a='photo-captureA123',b='photo-captureB123',own='photo-individual123';
const food=(id,captureId=a,over={})=>({id,localFoodId:id,name:id,meal:'lunch',captureId,amount:2,unit:'piece',calories:100,protein:2,carbs:3,fat:4,...over});
const data=foods=>({'calorie-counter-state':JSON.stringify({days:{today:{foods}}})});
test('three independent foods render one explicit capture block without changing nutrition/order/identities',()=>{
 const foods=[food('sausage'),food('bread'),food('ketchup')],blocks=captureBlocks(foods,foods);
 assert.equal(blocks.length,1);assert.equal(blocks[0].capture.count,3);assert.equal(blocks[0].capture.id,a);assert.deepEqual(blocks[0].foods,foods);assert.equal(foods.reduce((n,f)=>n+f.calories,0),300);
});
test('one item retains capture semantics; legacy equal photo refs are not guessed into captures',()=>{
 const single=[food('one')];assert.equal(captureBlocks(single,single)[0].capture.count,1);
 const old=[food('old1',undefined,{photoMediaId:a}),food('old2',undefined,{photoMediaId:a})];delete old[0].captureId;delete old[1].captureId;
 assert.ok(captureBlocks(old,old).every(block=>!block.capture));assert.equal(captureContext({captureId:'invalid'},old),null);
});
test('multiple captures and manual foods stay separate despite matching time/name',()=>{
 const foods=[food('a1'),food('a2'),food('b1',b),food('b2',b),food('manual',null)];
 const blocks=captureBlocks(foods,foods);assert.deepEqual(blocks.map(x=>x.capture?.id),[a,b,undefined]);assert.deepEqual(blocks.map(x=>x.foods.length),[2,2,1]);
});
test('count follows live deletion/Undo and disappears with final entry',()=>{
 const original=[food('a'),food('b'),food('c')];const reduced=original.slice(1);assert.equal(captureContext(reduced[0],reduced).count,2);
 const restored=IntakeFoodReuse.restoreRemovedItem(reduced,original[0],0);assert.equal(captureContext(restored[0],restored).count,3);
 assert.deepEqual(captureBlocks([],[]),[]);
});
test('moving a sibling to another meal shows one majority-anchored photo with truthful cross-meal counts',()=>{
 const foods=[food('moved',a,{meal:'breakfast'}),food('b'),food('c')];
 const breakfast=captureBlocks(foods.slice(0,1),foods),lunch=captureBlocks(foods.slice(1),foods);
 assert.equal(breakfast[0].capture,undefined);assert.equal(lunch[0].capture.count,3);assert.equal(lunch[0].foods.length,2);assert.deepEqual(lunch[0].capture.counts,[['lunch',2],['breakfast',1]]);
 const tie=foods.slice(0,2);assert.equal(captureContext(tie[1],tie).meal,'breakfast');
});
test('an individual image is independent of shared plate and editing it leaves siblings untouched',()=>{
 const original=[food('a'),food('b')],edited={...original[0],photoMediaId:own,amount:.5};
 assert.equal(captureContext(edited,[edited,original[1]]).id,a);assert.equal(original[1].photoMediaId,undefined);assert.equal(original[1].amount,2);
 assert.equal(savedPhotoDefinition(edited).coverImageId,own);assert.equal(savedPhotoDefinition(edited).captureId,undefined);
});
test('Saved food and Recent never inherit a plate as a component cover/occurrence',()=>{
 const plate=food('ketchup');assert.equal(savedPhotoDefinition(plate).coverImageId,undefined);assert.equal(savedPhotoDefinition(plate).captureId,undefined);
 const [recent]=IntakeFoodPersistence.updateRecentFoods([{...plate,photoMediaId:own}],[plate]);assert.equal(recent.captureId,undefined);assert.equal(recent.photoMediaId,undefined);assert.equal(recent.amount,2);
});
test('Saved meal cover is one representative image, while components preserve portions but not occurrence photos',()=>{
 const foods=[food('a'),food('b')],id=sharedPlateCover(foods);assert.equal(id,a);assert.equal(sharedPlateCover([...foods,food('other',b)]),undefined);
 const meal=IntakeFoodReuse.createSavedMeal({name:'Plate',foods,coverImageId:id,idFactory:()=> 'saved'});
 assert.equal(meal.coverImageId,a);assert.ok(meal.foods.every(f=>!f.captureId&&!f.photoMediaId&&!f.coverImageId));assert.deepEqual(meal.foods.map(f=>[f.amount,f.unit,f.calories]),[[2,'piece',100],[2,'piece',100]]);
});
test('copy/repeat/Saved logging strips historical and representative image fields, retaining source originals',()=>{
 const original=food('original',a,{photoMediaId:own,coverImageId:b});
 const [copy]=IntakeFoodReuse.cloneFoodEntries([original],{targetDate:'2026-09-21',idFactory:()=> 'fresh'});
 assert.equal(copy.id,'fresh');assert.equal(copy.localFoodId,original.localFoodId);for(const key of ['photoMediaId','captureId','coverImageId'])assert.equal(copy[key],undefined);
 assert.equal(original.captureId,a);assert.equal(original.photoMediaId,own);
});
test('backup/reference mapping deduplicates plate asset, remaps all siblings and strips photo-free exports',()=>{
 const values=data([food('a'),food('b',a,{photoMediaId:own})]);values['calorie-counter-saved-meals']=JSON.stringify([{coverImageId:a}]);
 assert.deepEqual([...collectPhotoReferences(values)].sort(),[a,own].sort());
 const mapped=transformPhotoReferences(values,id=>id===a?b:id);assert.deepEqual([...collectPhotoReferences(mapped)].sort(),[b,own].sort());
 assert.equal(collectPhotoReferences(transformPhotoReferences(values,()=>null)).size,0);assert.match(values['calorie-counter-state'],/captureId/);
});
test('capture staging shares one binary across Save meal, N entries and retry; a new analysis gets a new identity',async()=>{
 let puts=0;const draft=createCaptureDraft({put:async()=>`photo-created${++puts}abc`}),photo={normalized:{}};
 const ids=await Promise.all([draft.stage(photo),draft.stage(photo),draft.stage(photo)]);assert.equal(new Set(ids).size,1);assert.equal(puts,1);
 assert.equal(await draft.stage(photo),ids[0]);draft.clear();assert.notEqual(await draft.stage(photo),ids[0]);
});
test('failed photo preparation can retry and failed diary write publishes no partial group',async()=>{
 let fail=true;const draft=createCaptureDraft({put:async()=>{if(fail)throw Error('quota');return a;}}),photo={normalized:{}};
 await assert.rejects(draft.stage(photo));fail=false;assert.equal(await draft.stage(photo),a);
 const state={selectedDate:'today',days:{today:{foods:[]}}};let attempted;
 assert.throws(()=>commitDiaryDay({setItemConfirmed(k,v){attempted=JSON.parse(v);throw Error('quota');}},state,{foods:[food('a'),food('b'),food('c')]}));
 assert.equal(state.days.today.foods.length,0);assert.equal(attempted.days.today.foods.length,3);assert.equal(new Set(attempted.days.today.foods.map(f=>f.captureId)).size,1);
});
test('final media cleanup respects sibling, Saved-cover and Undo owners',async()=>{
 let refs=new Set();const media=createFoodMediaStore({indexedDB:new IDBFactory(),references:()=>refs});const blob=new Blob(['jpg'],{type:'image/jpeg'});
 const id=await media.put({full:blob,thumbnail:blob,width:2,height:2,thumbnailWidth:2,thumbnailHeight:2,mimeType:'image/jpeg'});await media.settle([id]);
 refs=collectPhotoReferences(data([food('a',id),food('b',id)]));assert.equal(await media.collect(),0);
 refs=collectPhotoReferences(data([food('b',id)]));assert.equal(await media.collect(),0);
 const lease=await media.hold([id],{undo:true});refs=new Set();assert.equal(await media.collect(),0);
 refs=collectPhotoReferences({'calorie-counter-saved-meals':JSON.stringify([{coverImageId:id}])});await lease.release();assert.equal(await media.collect(),0);
 refs=new Set();assert.equal(await media.collect(),1);assert.equal(await media.get(id),null);
});
