import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createFoodMediaStore, collectPhotoReferences, transformPhotoReferences, savedPhotoDefinition, retainedScannerPhoto, normalizeFoodPhoto, mediaIdValid } from '../public/food-media.js';
import { exportPhotoBackup, readPhotoBackup, restorePhotoBackup, jpegDimensions } from '../public/food-media-backup.js';
import { createSafeStorage } from '../public/data-safety.js';
import { boundPhotoView } from '../public/food-photo-ui.js';
import { configurePhotoRecovery, hasRecoverablePhoto } from '../public/food-media-runtime.js';
await import('../public/food-reuse.js');
await import('../public/food-persistence.js');
const jpeg = (w=64,h=32) => new Blob([Uint8Array.from([255,216,255,192,0,11,8,h>>8,h&255,w>>8,w&255,1,1,17,0,255,217])],{type:'image/jpeg'});
const image = () => ({full:jpeg(),thumbnail:jpeg(32,16),width:64,height:32,thumbnailWidth:32,thumbnailHeight:16,mimeType:'image/jpeg'});
const core = foods => ({user:{age:30},goals:{calories:2000,protein:140,carbs:200,fat:60},days:{'2026-09-20':{foods,exercises:[]}},progress:[],selectedDate:'2026-09-20'});
const food = (photoMediaId) => ({id:'entry',name:'Rice',amount:150,unit:'g',meal:'lunch',calories:200,protein:5,carbs:40,fat:2,...(photoMediaId?{photoMediaId}:{})});
const data = foods => ({'calorie-counter-state':JSON.stringify(core(foods))});
function fixture() {
 let refs=new Set(),time=Date.now();const media=createFoodMediaStore({indexedDB:new IDBFactory(),references:()=>refs,now:()=>time});
 return {media,setRefs:value=>refs=new Set(value),advance:n=>time+=n};
}
function storageFixture(initial) {
 const values=new Map(Object.entries(initial));const native={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 return {storage:createSafeStorage(native),values,native};
}
test('normalized media uses independent Blob/metadata stores and thumbnails, never JSON/base64',async()=>{
 const {media}=fixture(),id=await media.put(image());assert.equal(mediaIdValid(id),true);
 assert.equal((await media.get(id,'full')).size,17);assert.equal((await media.getThumbnails([id])).get(id).size,17);
 const [meta]=await media.list();assert.equal(meta.full,undefined);assert.equal(meta.thumbnail,undefined);assert.equal(meta.width,64);assert.equal(meta.byteSize,17);
 assert.equal(await media.get('../../etc/passwd'),null);
});
test('only successful Food-photo capture is eligible; barcode/label/text and cancelled/no-food are excluded',()=>{
 const file=jpeg();assert.equal(retainedScannerPhoto('food',file,2),file);
 for(const mode of ['barcode','label','text'])assert.equal(retainedScannerPhoto(mode,file,1),null);
 assert.equal(retainedScannerPhoto('food',file,0),null);assert.equal(retainedScannerPhoto('food',null,1),null);
});
test('Saved cover is initialized once and is semantically independent from diary occurrence',()=>{
 const diary=food('photo-first123'),saved=savedPhotoDefinition(diary);
 assert.equal(saved.photoMediaId,undefined);assert.equal(saved.coverImageId,diary.photoMediaId);
 const repeated=savedPhotoDefinition(food('photo-second123'),saved);assert.equal(repeated.coverImageId,'photo-first123');
 saved.coverImageId='photo-changed123';assert.equal(diary.photoMediaId,'photo-first123');delete saved.coverImageId;assert.equal(diary.photoMediaId,'photo-first123');
 assert.equal(savedPhotoDefinition(food('photo-second123'),saved).coverImageId,undefined,'explicitly removed cover is not re-created on logging');
});
test('shared diary, Recent and Saved references keep one immutable binary; final release collects both blobs',async()=>{
 const f=fixture(),id=await f.media.put(image());await f.media.settle([id]);
 let d={...data([food(id)]),'calorie-counter-food-library':JSON.stringify([food(id)]),'calorie-counter-saved-foods':JSON.stringify([savedPhotoDefinition(food(id))])};
 f.setRefs(collectPhotoReferences(d));assert.equal(await f.media.collect(),0);
 d['calorie-counter-state']=JSON.stringify(core([]));d['calorie-counter-food-library']='[]';f.setRefs(collectPhotoReferences(d));assert.equal(await f.media.collect(),0);assert.ok(await f.media.get(id));
 d['calorie-counter-saved-foods']='[]';f.setRefs(collectPhotoReferences(d));assert.equal(await f.media.collect(),1);assert.equal(await f.media.get(id),null);assert.equal(await f.media.get(id,'full'),null);
});
test('Delete retains photo throughout Undo lease; Undo restores a reference; expiry/final dismissal releases it',async()=>{
 const f=fixture(),id=await f.media.put(image());await f.media.settle([id]);const lease=await f.media.hold([id],{undo:true});
 assert.equal(await f.media.collect(),0);f.advance(60_000);await lease.renew();assert.equal(await f.media.collect(),0);
 f.setRefs([id]);await lease.release();assert.equal(await f.media.collect(),0);
 const second=await f.media.hold([id],{undo:true});f.setRefs([]);await second.release();assert.equal(await f.media.collect(),1);
});
test('cross-window media lease and GC transactions serialize: acquired reference survives collection',async()=>{
 const db=new IDBFactory(),a=createFoodMediaStore({indexedDB:db}),b=createFoodMediaStore({indexedDB:db});const id=await a.put(image());await a.settle([id]);
 await b.list(); // Both windows have opened their DB; hold wins this ordering.
 const hold=b.hold([id]);await a.collect();const lease=await hold;assert.deepEqual(lease.ids,[id]);assert.ok(await a.get(id));
 await lease.release();await a.collect();assert.equal(await b.get(id),null);
});
test('failed abandoned staging is reclaimed after grace; corrupt core prevents destructive GC',async()=>{
 const f=fixture(),id=await f.media.put(image());assert.equal(await f.media.collect(),0);f.advance(300_001);assert.equal(await f.media.collect(),1);
 const db=new IDBFactory(),media=createFoodMediaStore({indexedDB:db,references(){throw Error('corrupt core');}});const safe=await media.put(image());await media.settle([safe]);assert.equal(await media.collect(),0);assert.ok(await media.get(safe));
});
test('pending conflict recovery protects newly staged photo until explicit data deletion',async()=>{
 const {media}=fixture(),id=await media.put(image());await media.settle([id],{recovery:true});assert.equal(await media.collect(),0);assert.ok(await media.get(id));await media.erase();assert.equal((await media.list()).length,0);
});

test('confirmed recovery releases its grace owner; abandoned memory-only recovery is eventually reclaimed',async()=>{
 let refs=new Set(),confirmed=new Set(),time=Date.now();const media=createFoodMediaStore({indexedDB:new IDBFactory(),references:()=>refs,confirmedReferences:()=>confirmed,now:()=>time});
 const id=await media.put(image());await media.settle([id],{recovery:true});refs.add(id);confirmed.add(id);await media.collect();refs.clear();confirmed.clear();assert.equal(await media.collect(),1);
 const abandoned=await media.put(image());await media.settle([abandoned],{recovery:true});assert.equal(await media.collect(),0);time+=86_400_001;assert.equal(await media.collect(),1);
});

test('unrelated pending data cannot keep a cancelled photo alive as a recovery owner',()=>{
 configurePhotoRecovery(()=>data([food()]));assert.equal(hasRecoverablePhoto('photo-cancelled123'),false);
 configurePhotoRecovery(()=>data([food('photo-pending123')]));assert.equal(hasRecoverablePhoto('photo-pending123'),true);configurePhotoRecovery(()=>({}));
});
test('Copy another day keeps nutrition but not historical photo ownership; Saved meals are definitions',()=>{
 const entry=food('photo-first123');const [copy]=globalThis.IntakeFoodReuse.cloneFoodEntries([entry],{targetDate:'2026-09-21',idFactory:()=> 'new-id'});
 assert.equal(copy.photoMediaId,undefined);assert.equal(entry.photoMediaId,'photo-first123');assert.notEqual(copy.id,entry.id);
 const saved=globalThis.IntakeFoodReuse.createSavedMeal({name:'Meal',foods:[entry]});assert.equal(saved.foods[0].photoMediaId,undefined);
});
test('invalid metadata and unsupported/overlarge photo source are rejected without stored assets',async()=>{
 const {media}=fixture();await assert.rejects(media.put({...image(),width:'oops'}));await assert.rejects(media.put({...image(),thumbnailWidth:500}));await assert.rejects(media.put({...image(),full:null}));assert.equal((await media.list()).length,0);
 await assert.rejects(normalizeFoodPhoto(new Blob(['<svg/>'],{type:'image/svg+xml'})));await assert.rejects(normalizeFoodPhoto(new Blob([],{type:'image/jpeg'})));
});
test('version-2 binary backup restores data and shared IDs with fresh local IDs; version-1 remains supported',async()=>{
 const f=fixture(),id=await f.media.put(image()),old=data([food(id)]);old['calorie-counter-saved-foods']=JSON.stringify([savedPhotoDefinition(food(id))]);
 const original=storageFixture(old),packed=await exportPhotoBackup(original.storage,f.media,true);assert.equal(packed.extension,'intake');assert.match(await packed.blob.slice(0,16).text(),/^INTAKE-PHOTOS-2/);
 const parsed=await readPhotoBackup(packed.blob);assert.equal(parsed.media.length,1);const next=storageFixture(data([]));
 const restoring={restore(text){next.storage.restore(text);f.setRefs(collectPhotoReferences(JSON.parse(next.storage.export()).data));}};
 const result=await restorePhotoBackup(restoring,f.media,parsed);
 assert.equal(result.missing,0);const restored=JSON.parse(next.values.get('calorie-counter-state')).days['2026-09-20'].foods[0];
 assert.notEqual(restored.photoMediaId,id);assert.ok(await f.media.get(restored.photoMediaId));assert.equal(JSON.parse(next.values.get('calorie-counter-saved-foods'))[0].coverImageId,restored.photoMediaId);
 const legacy=await readPhotoBackup(new Blob([storageFixture(data([food()])).storage.export()]));assert.deepEqual(legacy.media,[]);assert.equal(JSON.parse(legacy.data['calorie-counter-state']).days['2026-09-20'].foods[0].name,'Rice');
});
test('explicit photo exclusion produces JSON without references or binary and does not mutate source',async()=>{
 const f=fixture(),id=await f.media.put(image()),s=storageFixture(data([food(id)]));const result=await exportPhotoBackup(s.storage,f.media,false),text=await result.blob.text();
 assert.equal(result.extension,'json');assert.equal(JSON.parse(text).photosIncluded,false);assert.doesNotMatch(text,/photoMediaId|base64/);assert.match(s.values.get('calorie-counter-state'),/photoMediaId/);
});

test('plate capture and Saved Meal cover round-trip as one binary with one fresh shared identity',async()=>{
 const f=fixture(),id=await f.media.put(image());
 const original=data([1,2,3].map(n=>({...food(),id:`entry-${n}`,captureId:id})));
 original['calorie-counter-saved-meals']=JSON.stringify([{id:'meal',name:'Plate',meal:'lunch',coverImageId:id,foods:[food()]}]);
 const s=storageFixture(original),packed=await exportPhotoBackup(s.storage,f.media),parsed=await readPhotoBackup(packed.blob);
 assert.equal(parsed.media.length,1);
 const next=storageFixture(data([]));
 const restoring={restore(text){next.storage.restore(text);f.setRefs(collectPhotoReferences(JSON.parse(next.storage.export()).data));}};
 assert.equal((await restorePhotoBackup(restoring,f.media,parsed)).missing,0);
 const restored=JSON.parse(next.values.get('calorie-counter-state')).days['2026-09-20'].foods;
 const newId=restored[0].captureId;assert.notEqual(newId,id);assert.ok(await f.media.get(newId));
 assert.equal(new Set(restored.map(entry=>entry.captureId)).size,1);assert.equal(restored.length,3);
 assert.equal(JSON.parse(next.values.get('calorie-counter-saved-meals'))[0].coverImageId,newId);
 const excluded=await exportPhotoBackup(s.storage,f.media,false);
 assert.doesNotMatch(await excluded.blob.text(),/captureId|coverImageId/);assert.match(s.values.get('calorie-counter-state'),/captureId/);
});
test('one corrupt or missing photo does not corrupt core diary; malformed package is rejected',async()=>{
 const f=fixture(),id=await f.media.put(image()),s=storageFixture(data([food(id)])),packed=await exportPhotoBackup(s.storage,f.media);
 const bytes=new Uint8Array(await packed.blob.arrayBuffer());bytes[bytes.length-2]^=1;
 const parsed=await readPhotoBackup(new Blob([bytes]));assert.equal(parsed.missing,1);assert.equal(parsed.media.length,0);
 const next=storageFixture(data([]));await restorePhotoBackup(next.storage,f.media,parsed);assert.equal(JSON.parse(next.values.get('calorie-counter-state')).days['2026-09-20'].foods[0].photoMediaId,undefined);
 await assert.rejects(readPhotoBackup(new Blob(['INTAKE-PHOTOS-2\n'])));await assert.rejects(readPhotoBackup(new Blob(['{"format":"intake-backup","version":2}'])));
 assert.equal(jpegDimensions(new Uint8Array([1,2,3])),null);
});
test('photo quota failure during restore keeps core food without a broken attachment',async()=>{
 const f=fixture(),id=await f.media.put(image()),s=storageFixture(data([food(id)]));const parsed=await readPhotoBackup((await exportPhotoBackup(s.storage,f.media)).blob);
 const next=storageFixture(data([]));const quota={...f.media,put:async()=>{throw Error('quota');}};const result=await restorePhotoBackup(next.storage,quota,parsed);
 assert.equal(result.missing,1);assert.equal(JSON.parse(next.values.get('calorie-counter-state')).days['2026-09-20'].foods[0].name,'Rice');assert.equal(collectPhotoReferences(JSON.parse(next.storage.export()).data).size,0);
});
test('failed core restore rolls back old diary and media; imported images do not overwrite existing assets',async()=>{
 const f=fixture(),id=await f.media.put(image());f.setRefs([id]);await f.media.settle([id]);
 const s=storageFixture(data([food(id)])),parsed=await readPhotoBackup((await exportPhotoBackup(s.storage,f.media)).blob);
 await assert.rejects(restorePhotoBackup({restore(){throw Error('core quota');}},f.media,parsed));assert.ok(await f.media.get(id));assert.equal((await f.media.list()).length,1);
});
test('reference transforms only known food collections; old records have no placeholders or media changes',()=>{
 const original={...data([food()]),'calorie-counter-assistant-conversations-v1':'[{"photoMediaId":"photo-private123"}]'};
 assert.equal(collectPhotoReferences(original).size,0);assert.deepEqual(transformPhotoReferences(original,()=>null),original);
});

test('Recent replaces the last-occurrence image and clears it for a later unphotographed use',()=>{
 const persistence=globalThis.IntakeFoodPersistence;
 const first={...food('photo-first123'),catalogId:'rice',source:'USDA'};
 const next=persistence.updateRecentFoods([first],[{...first,photoMediaId:'photo-second123'}]);assert.equal(next[0].photoMediaId,'photo-second123');
 const plain=persistence.updateRecentFoods(next,[{...first,photoMediaId:undefined,coverImageId:'photo-cover123'}]);assert.equal(plain[0].photoMediaId,undefined);assert.equal(plain[0].coverImageId,undefined);
});
test('viewer bounds allow image pan only inside the zoomed image, fit resets to centered',()=>{
 assert.deepEqual(boundPhotoView({scale:1,x:500,y:-500},390,700,1920,1080),{scale:1,x:0,y:0});
 const zoom=boundPhotoView({scale:3,x:900,y:900},390,700,1920,1080);assert.equal(zoom.x,390);assert.equal(zoom.y,0);assert.equal(boundPhotoView({...zoom,scale:99},390,700,400,900).scale,5);
});
test('actual diary attachment writer starts only after food exists, preserves food on optional storage failure',async()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),start=source.indexOf('async function attachDiaryPhoto('),end=source.indexOf('\nasync function holdUndoPhotos',start),code=source.slice(start,end);
 for(const fail of [false,true]){
  const f=fixture(),initial=core([food()]),s=storageFixture(data([food()]));let notice='';
  const c={state:initial,foodMedia:fail?{...f.media,put:async()=>{throw Error('quota');}}:f.media,isActive:()=>true,localStorage:s.storage,collectFoodMediaSoon(){},foodPhotoNotice:message=>notice=message};
  vm.createContext(c);vm.runInContext(code,c);await c.attachDiaryPhoto(['entry'],{normalized:image()},'2026-09-20');
  const entry=JSON.parse(s.values.get('calorie-counter-state')).days['2026-09-20'].foods[0];assert.equal(entry.calories,200);
  if(fail){assert.equal(entry.photoMediaId,undefined);assert.match(notice,/Food saved/);assert.equal((await f.media.list()).length,0);}else assert.ok(await f.media.get(entry.photoMediaId));
 }
});
