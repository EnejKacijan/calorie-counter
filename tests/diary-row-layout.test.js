import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/today-diary.css',import.meta.url),'utf8');
const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('food row protects kcal and overflow columns while name and metadata have distinct rows',()=>{
 assert.match(css,/\.entry-main\.has-kcal \{[^}]*minmax\(0,1fr\) max-content[^}]*first baseline/);
 assert.match(css,/\.entry-main strong \{[^}]*grid-row:1[^}]*white-space:normal/);
 assert.match(css,/\.entry-main \.entry-kcal \{[^}]*grid-column:2;grid-row:1[^}]*white-space:nowrap/);
 assert.match(css,/\.entry-main p \{[^}]*grid-column:1;grid-row:2/);
});
test('overflow glyph follows primary baseline without shrinking the independent action target',()=>{
 assert.match(css,/\.entry-actions-toggle \{[^}]*align-items:flex-start[^}]*min-width:44px[^}]*min-height:44px[^}]*padding:var\(--diary-row-inset\)/);
 assert.match(src,/actionToggle.innerHTML = '<span class="food-overflow-glyph" aria-hidden="true">•••<\/span>'/);
 assert.doesNotMatch(css,/\.food-overflow-glyph \{[^}]*(?:transform:|top:|position:absolute)/);
});

test('shared food row balances text inset while overflow hit area uses padding instead of forcing a tall track',()=>{
 assert.match(css,/\.entry-card \.entry-surface \{[^}]*--diary-row-inset:12px[^}]*padding-block:var\(--diary-row-inset\)[^}]*min-height:0/);
 assert.match(css,/\.entry-actions-toggle \{[^}]*margin-block:calc\(-1 \* var\(--diary-row-inset\)\)/);
 const photos=readFileSync(new URL('../public/food-photos.css',import.meta.url),'utf8');
 assert.doesNotMatch(photos,/scanned-meal-children \.entry-(?:surface|main) \{[^}]*(?:padding-block|min-height)/);
});

test('all Today food rows explicitly own one trailing gutter and right-aligned tabular kcal',()=>{
 assert.match(css,/\.entry-card \.entry-surface \{[^}]*44px[^}]*padding-right:12px!important/);
 assert.match(css,/\.entry-main\.has-kcal \{[^}]*min-width:0!important;[\s\S]*?width:100%!important/);
 assert.match(css,/\.entry-main \.entry-kcal \{[^}]*justify-self:end!important;[^}]*text-align:right!important;[^}]*font-variant-numeric:tabular-nums/);
 assert.doesNotMatch(css,/\.entry-kcal \{[^}]*position:absolute/);
});
test('only diary Edit Food requests the full nested-editor exit override',()=>{
 const surface=readFileSync(new URL('../public/add-surface.js',import.meta.url),'utf8');
 assert.match(surface,/createAddPresentation\(host,win,finishClose,\{nested:nested \|\| section.classList.contains\('is-editing'\),fullExit:nested && section.id==='foodSection'\}\)/);
});

test('opening mobile Edit Food keeps existing diary nodes instead of rebuilding the unchanged parent',()=>{
 const edit=src.slice(src.indexOf('function fillFoodFormForEdit('),src.indexOf('function resetFoodForm('));
 assert.match(edit,/if \(phoneEditor\) \{\s*elements.foodList.querySelectorAll\('\[data-food-entry-id\]'\)/);
 assert.match(edit,/card.classList.toggle\('is-selected', card.dataset.foodEntryId === food.id\)/);
 assert.match(edit,/\} else renderEntries\(\)/);
});
