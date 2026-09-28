import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assistantKeyboardOpen} from '../public/assistant.js';
const source=readFileSync(new URL('../public/assistant.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/assistant.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assistant-usability.css',import.meta.url),'utf8');
test('a shorter viewport alone is not an Assistant keyboard',()=>{
 assert.equal(assistantKeyboardOpen({visualHeight:740,layoutHeight:844,scale:1,editing:false,wasOpen:false}),false);
 assert.equal(assistantKeyboardOpen({visualHeight:420,layoutHeight:844,scale:1,editing:false,wasOpen:false}),false);
});
test('keyboard follows intentional editing and stays owned while focus enters context',()=>{
 assert.equal(assistantKeyboardOpen({visualHeight:420,layoutHeight:844,scale:1,editing:true,wasOpen:false}),true);
 assert.equal(assistantKeyboardOpen({visualHeight:420,layoutHeight:844,scale:1,editing:false,wasOpen:true}),true);
});
test('keyboard dismissal and pinch zoom do not leave a keyboard mode',()=>{
 assert.equal(assistantKeyboardOpen({visualHeight:844,layoutHeight:844,scale:1,editing:true,wasOpen:true}),false);
 assert.equal(assistantKeyboardOpen({visualHeight:420,layoutHeight:844,scale:2,editing:true,wasOpen:false}),false);
});
test('all starter values match their visible label and retain the shared send handler',()=>{
 const rows=[...html.matchAll(/data-assistant-prompt="([^"]+)">([^<]+)/g)];assert.equal(rows.length,4);
 rows.forEach(([,value,label])=>assert.equal(value,label));
 assert.match(source,/sendMessage\(button.dataset.assistantPrompt\)/);assert.match(source,/elements.starters.forEach\(button => \{ button.disabled = sending; \}\)/);
});
test('Assistant local identities use the existing UUID compatibility helper, not a secure-context-only call',()=>{
 assert.doesNotMatch(source,/crypto.randomUUID\(/);assert.match(source,/import \{ localRecordId \}/);
 assert.equal((source.match(/localRecordId\(\)/g)||[]).length,4);
});
test('Assistant has one viewport owner for composer, History and context',()=>{
 assert.doesNotMatch(source,/bindSurfaceViewport/);assert.doesNotMatch(css,/--surface-(height|top)|--assistant-nav-space/);
 assert.match(css,/height: var\(--assistant-viewport-height,100dvh\) !important/);
 assert.match(html,/<h2 id="assistantContextTitle" tabindex="-1" autofocus>/);
 assert.match(html,/<h2 id="assistantHistoryTitle" tabindex="-1" autofocus>/);
 assert.doesNotMatch(html,/<button[^>]*autofocus/);
});
test('starter feedback cannot animate out of the startup disabled-opacity state',()=>{
 const starterRules=[...css.matchAll(/[^{}]*\.assistant-starters button[^{}]*\{[^}]*\}/g)].map(match=>match[0]).join('\n');
 assert.ok(starterRules);assert.doesNotMatch(starterRules,/transition:[^;]*opacity/);
 assert.match(css,/button:active:where\(:not\(\[data-intake-touch\] \*\),\[data-touch-pressed\]\):not\(:disabled\)/);
});

test('keyboard offset locates the surface without subtracting its system safe area',()=>{
 assert.match(css,/--assistant-top-clearance: env\(safe-area-inset-top\)/);
 assert.doesNotMatch(css,/safe-area-inset-top\)\s*-\s*var\(--assistant-viewport-top/);
});

test('History delete fits its grid track and the list keeps a local vertical/pinch contract',()=>{
 assert.match(css,/\.assistant-history-item \{[^}]*grid-template-columns: minmax\(0,1fr\) 44px/);
 assert.match(css,/\.assistant-history-delete \{ width: 44px !important/);
 assert.match(css,/#assistantHistoryList \{[^}]*overflow-x: hidden[^}]*touch-action: pan-y pinch-zoom/);
 // The existing edge swipe continues to move the complete semantic surface.
 assert.match(source,/motionTargets: \(\) => \[elements.history,elements.textSelection\].includes\(panel\)[^\n]*\? panel : null/);
});
