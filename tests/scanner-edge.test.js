import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {cssRules,selectorList} from '../scripts/css-interaction-audit.mjs';
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');
test('scanner uses Food live motion and retained inert parent, not a new Add mount',()=>{
 const s=read('package-scan.js');
 assert.match(s,/bindSemanticBack, liveBackMotion/);assert.match(s,/createAddPresentation/);
 assert.match(s,/isolateSurfaceBackground\(/);assert.match(s,/\.app-shell,\.add-flow-host,\.mobile-tabbar/);
 assert.match(s,/createMotion\(\)\s*\{\s*presentation\.settle\(\);\s*return \{ \.\.\.liveBackMotion\(dialog, window\)/);
 assert.ok(s.indexOf('const restoreParent =')<s.indexOf('dialog.showModal()'));
 assert.ok(s.indexOf('dialog.close(); dialog.remove();')<s.indexOf('restoreParent();'));
 assert.doesNotMatch(s,/cloneNode|captureBackPreview|setTimeout\([^;]*shutdown/);
 assert.match(s,/swipeBackCommitted === 'true'/);assert.match(s,/if \(closed \|\| dismissal\) return/);
});
test('scanner backdrop reveals live parent throughout gesture and normal Back',()=>{
 const r=cssRules(read('package-scan.css')).find(r=>r.selector==='body dialog.package-scan-dialog.unified-scanner::backdrop');
 assert.match(r.body,/background: transparent/);assert.equal(r.parents.length,0);
});
test('touch color audit gates nonsemantic active/focus/JS press paint, retaining real selections',()=>{
 for(const file of readdirSync(new URL('../public/',import.meta.url)).filter(f=>f.endsWith('.css')&&!['form-focus.css','touch-feedback.css'].includes(f)))for(const r of cssRules(read(file))){
  if(!/(?:background(?:-[\w-]+)?|border(?:-[\w-]+)?|box-shadow|color|stroke)\s*:/.test(r.body))continue;
  for(const s of selectorList(r.selector))if(/:(?:focus(?:-visible|-within)?|active)\b|\.is-pressed\b|\[data-(?:add|sheet)-pressed\]/.test(s))assert.ok(s.includes('html:not([data-intake-touch])')||s.includes('[aria-invalid=true]'),file+':'+r.line+' '+s);
 }
 assert.match(read('food-reuse.css'),/foodLogOptionsButton\[aria-expanded=true\] \{ background:/);
 assert.match(read('bottom-navigation.css'),/\[aria-current="page"\].*color: var\(--ink\)/);
 assert.match(read('touch-feedback.css'),/opacity: \.8 !important/);
});

test('touch press does not also inherit legacy scale or positional movement',()=>{
 for(const file of readdirSync(new URL('../public/',import.meta.url)).filter(f=>f.endsWith('.css')))for(const r of cssRules(read(file))){
  if(!/:active|is-pressed|data-.*pressed/.test(r.selector)||!/transform\s*:|scale\s*:/.test(r.body))continue;
  // Explicit product exception: the small floating Jump face grows on press;
  // its 44px target and the surrounding layout must remain stationary (browser QA).
  if(file==='assistant-usability.css'&&r.selector==='body.assistant-page #appShell #assistantJumpLatest[data-jump-pressed] .assistant-jump-face'){
   assert.match(r.body,/scale: 1\.09;/);assert.doesNotMatch(r.body,/transform:|width:|height:|background:/);continue;
  }
  assert.ok(r.selector.includes('html:not([data-intake-touch])')||/transform:\s*none/.test(r.body),file+':'+r.line);
 }
});
