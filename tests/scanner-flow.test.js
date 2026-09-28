import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {CAMERA_PENDING_MS,cameraExplanation} from '../public/package-scan.js';
import {commitDiaryDay} from '../public/add-entry.js';
import {createCaptureDraft} from '../public/plate-capture.js';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const log=source.slice(source.indexOf('async function logScannedFoods('),source.indexOf('function validateScannedFoodAmounts('));
function harness(fail=false){
 const initial={selectedDate:'2026-09-10',days:{'2026-09-10':{foods:[{id:'existing'}],exercises:[]}}};
 const ctx={state:initial,recentSuccess:null,events:[],fail,writes:0,photoAttempts:0,entryCommits:new Set(),photoEditor:{ready:async()=>({})},attachDiaryPhoto:async()=>{ctx.photoAttempts++;assert.ok(ctx.persisted);},isActive:()=>true,currentDay(){return ctx.state.days[ctx.state.selectedDate];},
  scannedFoodAnalysis:{inputMode:'text'},scanDraftGeneration:0,collectFoodMediaSoon(){},
  commitDiaryDay,entryTap:null,addSurface:{committed(){}},localStorage:{setItemConfirmed(k,v){ctx.writes++;if(ctx.fail)throw Error('quota');ctx.persisted=JSON.parse(v);}},
  scannedFoodToReusableEntry:(food,meal)=>({...food,meal}),
  addFood(food,{stageDay}){return{day:{...stageDay,foods:[food,...stageDay.foods]},nextFood:food,addedId:food.id};},
  foodSource:food=>food.source,rememberFoods:foods=>ctx.events.push(['remember',foods.length]),
  render:()=>ctx.events.push('render'),resetFoodForm:()=>ctx.events.push('reset'),closeMobileLogForm:()=>ctx.events.push('close'),
  entryStatus:(_,message)=>ctx.message=message,
  elements:{foodSection:{classList:{contains:()=>true}},scanReviewFooter:{},scanAddSelectedFoods:{},manualFoodSubmit:{}}};
 vm.createContext(ctx);vm.runInContext(log,ctx);return{ctx,initial};
}
test('scanner permission explanation appears after a specified 5 seconds, never calls pending denied',()=>{
 assert.equal(CAMERA_PENDING_MS,5000);
 assert.match(cameraExplanation('CameraUnsupportedError',false),/HTTPS/);
 assert.match(cameraExplanation('CameraUnsupportedError',true),/not available in this browser/);
 assert.match(cameraExplanation('NotAllowedError'),/not allowed/);
 assert.match(cameraExplanation('NotFoundError'),/No camera/);
 assert.match(cameraExplanation('NotReadableError'),/may be in use/);
 assert.match(cameraExplanation('CameraPreviewError'),/preview could not start/);
});
test('scanner history marker does not require secure-context-only UUID',()=>{
 const scanner=readFileSync(new URL('../public/package-scan.js',import.meta.url),'utf8');
 assert.doesNotMatch(scanner,/crypto\.randomUUID\(/);
 assert.match(source.slice(source.indexOf('function createScannedFoodItem('),source.indexOf('function renderScanReview(')),/id: localRecordId\(\)/);
 assert.ok(scanner.indexOf('find("[data-enter-manual]").onclick')<scanner.lastIndexOf('select(mode);'));
});
test('reviewed plate stages all foods, confirms one write and only then clears review',async()=>{
 const{ctx,initial}=harness();await ctx.logScannedFoods([{id:'first'},{id:'second'}],'lunch');
 assert.equal(ctx.writes,1);assert.deepEqual(ctx.persisted.days['2026-09-10'].foods.map(f=>f.id),['first','second','existing']);
 assert.deepEqual(initial.days['2026-09-10'].foods,[{id:'existing'}]);
 // Commit still precedes all UI work; close retains the inert presentation
 // before its fields reset. The confirmed write is never animation-dependent.
 assert.deepEqual(ctx.events,[['remember',2],'render','close','reset']);
});
test('failed scan commit leaves state/review/library intact; retry confirms one copy',async()=>{
 const{ctx,initial}=harness(true);await ctx.logScannedFoods([{id:'food'}],'dinner');await ctx.logScannedFoods([{id:'food'}],'dinner');
 assert.equal(ctx.state,initial);assert.deepEqual(ctx.events,[]);assert.match(ctx.message,/review is still here/);
 assert.equal(ctx.photoAttempts,0,'failed Add never stores a photo');
 ctx.fail=false;await ctx.logScannedFoods([{id:'food'}],'dinner');assert.equal(ctx.writes,3);
 assert.equal(ctx.persisted.days['2026-09-10'].foods.filter(f=>f.id==='food').length,1);
 assert.equal(ctx.photoAttempts,1,'retry attaches only after confirmed food persistence');
});

test('closing or replacing a photo draft while Add awaits normalization cancels that submission',async()=>{
 const{ctx}=harness();ctx.photoEditor.ready=async()=>({cancelled:true});await ctx.logScannedFoods([{id:'food'}],'lunch');assert.equal(ctx.writes,0);assert.equal(ctx.photoAttempts,0);assert.equal(ctx.entryCommits.has('food'),false);assert.equal(ctx.elements.scanAddSelectedFoods.disabled,false);
});

function withPlate(ctx){
 let puts=0;const photo={normalized:{}};ctx.scannedFoodAnalysis={inputMode:'photo'};ctx.photoEditor.ready=async()=>photo;
 ctx.foodMedia={put:async()=>{puts++;return 'photo-plate12345';},hold:async ids=>({ids,release:async()=>{}}),settle:async()=>{}};
 ctx.captureDraft=createCaptureDraft(ctx.foodMedia);ctx.hasRecoverablePhoto=()=>true;return ()=>puts;
}
test('photo Add commits N independent entries with one capture in its only diary write',async()=>{
 const{ctx}=harness();const puts=withPlate(ctx);await ctx.logScannedFoods([{id:'a'},{id:'b'},{id:'c'}],'lunch');
 const added=ctx.persisted.days[ctx.state.selectedDate].foods.slice(0,3);assert.equal(added.length,3);assert.equal(new Set(added.map(f=>f.captureId)).size,1);assert.ok(added.every(f=>f.captureId==='photo-plate12345'&&!f.photoMediaId));assert.equal(ctx.writes,1);assert.equal(puts(),1);assert.equal(ctx.photoAttempts,0);
});
test('failed photo Add and repeated retry keep one staged asset and never publish a partial plate',async()=>{
 const{ctx,initial}=harness(true);const puts=withPlate(ctx);const foods=[{id:'a'},{id:'b'}];
 await ctx.logScannedFoods(foods,'lunch');await ctx.logScannedFoods(foods,'lunch');assert.equal(ctx.state,initial);assert.deepEqual(ctx.events,[]);assert.equal(puts(),1);
 ctx.fail=false;await ctx.logScannedFoods(foods,'lunch');assert.equal(puts(),1);assert.equal(ctx.persisted.days[ctx.state.selectedDate].foods.length,3);assert.equal(ctx.writes,3);
});
