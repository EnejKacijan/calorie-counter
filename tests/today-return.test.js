import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('Today no longer mounts or changes the retired swipe hint during Add return',()=>{
 assert.doesNotMatch(source,/updateFoodSwipeHint|foodSwipeHint|supportsEntrySwipe/);
 for(const file of ['index.html','add-surface.js'])assert.doesNotMatch(readFileSync(new URL('../public/'+file,import.meta.url),'utf8'),/entry-swipe-hint|foodSwipeHint/);
});
