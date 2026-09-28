import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cssRules} from '../scripts/css-interaction-audit.mjs';
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
const css=read('form-focus.css'),rules=cssRules(css);

test('form focus is shared by editable primitives, never native pickers or viewport guessing',()=>{
 const focus=rules.find(r=>r.selector.endsWith(':enabled:focus'));
 for(const type of ['text','search','number','email','tel','url','password'])assert.ok(focus.selector.includes(`input[type=${type}]`));
 assert.ok(focus.selector.includes('textarea:not(#assistantInput)'));
 assert.doesNotMatch(focus.selector,/\bselect\b|type=(date|time|file|range|checkbox|radio)/);
 assert.doesNotMatch(css,/@media.*width|matchMedia|pointer: coarse/);
 assert.ok(read('styles.css').includes('@import url("./form-focus.css");'));
 assert.ok(read('sw.js').includes('"/form-focus.css"'));
});
test('touch editing adds no focus paint; keyboard retains a distinct 2px outline',()=>{
 const touch=rules.find(r=>r.selector.endsWith(':enabled:focus'));
 assert.match(touch.body,/box-shadow: none !important/);
 assert.doesNotMatch(touch.body,/border-color:/);
 assert.match(touch.body,/outline: none !important/);
 const keyboard=rules.find(r=>r.selector.includes('html:not([data-intake-touch])')&&r.selector.endsWith(':enabled:focus-visible'));
 assert.match(keyboard.body,/outline: 2px solid var\(--ink\) !important/);
 assert.match(keyboard.body,/box-shadow: none !important/);
 assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g,''),/(?:^|[;{])\s*(?:height|width|padding|margin|transform|border-width|background-color|background)\s*:/);
 assert.doesNotMatch(read('modern-ux.css'),/\.food-name-field:focus-within/);
});
test('error color has priority over touch focus, while compound onboarding gets only one focus owner',()=>{
 const error=rules.find(r=>r.selector.endsWith(':enabled[aria-invalid=true]'));
 assert.match(error.body,/border-color: var\(--field-error\) !important/);
 assert.match(error.body,/box-shadow: inset 0 -1px var\(--field-error\)/);
 assert.ok(error.start>rules.find(r=>r.selector.endsWith(':enabled:focus')).start);
 const child=rules.find(r=>r.selector==='#onboarding .onboarding-number input:enabled:is(:focus,[aria-invalid=true])');
 assert.match(child.body,/box-shadow: none !important/);assert.match(child.body,/outline: none !important/);
 assert.ok(rules.some(r=>r.selector.includes('.onboarding-number:has(input:focus-visible)')&&r.body.includes('outline: 2px')));
});
test('touch-focus color token is removed while themed validation remains',()=>{
 assert.doesNotMatch(css,/--field-touch-focus/);assert.ok(css.includes('body[data-theme=dark] { --field-error: #ff9e8e; }'));
});
