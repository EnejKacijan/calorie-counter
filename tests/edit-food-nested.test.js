import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {commitDiaryDay} from '../public/add-entry.js';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function deleteEntryWithUndo('),end=source.indexOf('\nfunction ',start+1);
function fixture({fail=false,photo=false}={}){
 const events=[],entry={id:'edited',name:'Ketchup',amount:2,calories:60,...(photo?{photoMediaId:'photo-qa'}:{})};
 const c=vm.createContext({state:{selectedDate:'2026-09-18',days:{'2026-09-18':{foods:[entry],exercises:[]}}},editingFoodId:entry.id,editingExerciseId:null,
  mediaIdValid:v=>Boolean(v),holdUndoPhotos:async()=>({release:()=>events.push('release-photo')}),isActive:()=>true,
  foodPhotoNotice:()=>events.push('notice'),isPhoneAddFoodLayout:()=>true,commitDiaryDay,
  localStorage:{setItemConfirmed(){events.push('confirmed-write');if(fail)throw Error('quota');}},
  ensureDay:()=>c.state.days[c.state.selectedDate],resetFoodForm:()=>events.push('reset'),saveState:()=>events.push('legacy-write'),
  render:()=>events.push('render'),showUndoToast:(message,undo)=>{events.push('undo-ready');c.undo=undo;},collectFoodMediaSoon:()=>events.push('collect')});
 vm.runInContext(source.slice(start,end),c);
 return {c,entry,events,run:()=>c.deleteEntryWithUndo('foods',entry,{fromEditor:true})};
}
test('editor deletion confirms once, prepares Today before return and keeps draft until caller closes',async()=>{
 const f=fixture();assert.equal(await f.run(),true);assert.deepEqual(f.events,['confirmed-write','render','undo-ready','collect']);assert.equal(f.c.state.days['2026-09-18'].foods.length,0);
 f.c.undo();assert.equal(f.c.state.days['2026-09-18'].foods[0],f.entry);assert.deepEqual(f.events.slice(-2),['legacy-write','render']);
});
test('failed editor deletion leaves diary/draft intact, releases Undo photo and never reports success',async()=>{
 const f=fixture({fail:true,photo:true}),before=f.c.state;await assert.rejects(f.run(),/quota/);
 assert.equal(f.c.state,before);assert.equal(f.c.state.days['2026-09-18'].foods[0],f.entry);assert.deepEqual(f.events,['confirmed-write','release-photo']);assert.equal(f.c.undo,undefined);
});
test('failed photo protection does not delete or close editor',async()=>{
 const f=fixture({photo:true});f.c.holdUndoPhotos=async()=>{throw Error('media');};assert.equal(await f.run(),undefined);assert.deepEqual(f.events,['notice']);assert.equal(f.c.state.days['2026-09-18'].foods.length,1);
});
test('Edit opts into nested presentation before mounting; actual sheets hand off synchronously',()=>{
 assert.match(source,/if \(phoneEditor\) openMobileLogForm\(elements.foodSection, null, \{nested:true\}\)/);
 assert.match(source,/closeFoodReusePanel\(\{immediate:true\}\);\s+if \(entry\) \{\s+runFoodEntryAction/);
 const handler=source.slice(source.indexOf('elements.deleteFoodEdit.addEventListener'),source.indexOf('elements.foodFilterTabs.forEach',source.indexOf('elements.deleteFoodEdit.addEventListener')));
 assert.ok(handler.indexOf('await deleteEntryWithUndo')<handler.indexOf('closeEditLogForm'));
 assert.match(handler,/entryCommits.has\('food'\)/);assert.match(handler,/Could not delete/);
 const reset=source.slice(source.indexOf('function resetFoodForm()'),source.indexOf('function syncFoodModeHeader('));
 assert.ok(reset.indexOf('editingFoodId && addSurface.deferReset')<reset.indexOf('photoEditor.reset()'));
});
