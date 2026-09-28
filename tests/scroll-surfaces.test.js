import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const css=read('scroll-surfaces.css').replace(/\/\*[\s\S]*?\*\//g,'');

test('one capability/PWA policy, not a width breakpoint or universal native-control override',()=>{
 assert.match(css,/@media \(pointer: coarse\), \(display-mode: standalone\)/);
 assert.doesNotMatch(css,/min-width|max-width|\*|\bselect\b|\binput\b|photo-stage|photo-viewer/);
 const inventories=[...css.matchAll(/:is\(([\s\S]*?)\)/g)].map(m=>m[1].replace(/\s/g,''));
 assert.equal(inventories.length,2);assert.equal(inventories[0],inventories[1]);
 for(const owner of ['html','.add-flow-content','.scanner-body','.food-reuse-content','.assistant-conversation','.assistant-history-list','.assistant-context-body','textarea','.settings-editor-scroll','#progressList','#weightSheetContent','.onboarding-content'])assert.ok(inventories[0].split(',').includes(owner),owner);
});
test('only scrollbar chrome is changed: no scroll, geometry, focus or gesture declarations',()=>{
 const declarations=[...css.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map(m=>[m[1],m[2].trim()]);
 assert.deepEqual(declarations,[['scrollbar-width','none !important'],['width','0 !important'],['height','0 !important'],['display','none !important']]);
 assert.match(css,/\)::-webkit-scrollbar\s*\{\s*width: 0 !important;\s*height: 0 !important;\s*display: none !important;/);
 assert.doesNotMatch(css,/overflow:|overflow-y:|touch-action:|position:|padding:|margin:|scrollbar-gutter:|outline:/);
});
test('shared policy loads before styles and is available in the offline shell',()=>{
 assert.ok(read('styles.css').startsWith('@import url("./scroll-surfaces.css");'));
 assert.equal((read('sw.js').match(/"\/scroll-surfaces.css"/g)||[]).length,1);
});
