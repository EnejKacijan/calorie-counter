import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assistantContextLabel} from '../public/assistant.js';
const html=readFileSync(new URL('../public/assistant.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/assistant.js',import.meta.url),'utf8');
test('compact context explicitly distinguishes off, seven and thirty days',()=>{
 assert.equal(assistantContextLabel(false,30),'Diary off');assert.equal(assistantContextLabel(true,7),'Diary · 7 days');assert.equal(assistantContextLabel(true,30),'Diary · 30 days');
});
test('scroll lifecycle restores tab position but explicitly follows a newly chosen conversation',()=>{
 assert.match(source,/if \(initial\) chatScroll.restore\(conversationScrolls.get\(activeConversationId\)\)/);
 assert.match(source,/else if \(changed\) chatScroll.latest\(\)/);
 assert.match(source,/conversationScrolls.set\(activeConversationId, chatScroll.snapshot\(\)\)/);
});
test('context and history reuse native nested dialogs; context trigger belongs to the footer',()=>{
 assert.match(html,/<dialog[^>]*id="assistantHistory"/);assert.match(html,/<dialog[^>]*id="assistantContextControls"/);
 assert.ok(html.indexOf('id="assistantContextDisclosure"')>html.indexOf('class="assistant-chat-footer"'));
 assert.doesNotMatch(html,/assistant-history-backdrop|assistant-mark/);
 assert.match(html,/<button[^>]*id="assistantClear"[^>]*hidden/);
});
test('starter actions remain native buttons with diary-grounded, non-diagnostic copy',()=>{
 assert.equal((html.match(/data-assistant-prompt=/g)||[]).length,4);assert.doesNotMatch(html,/Why am I bloated|Food and my skin/);
 assert.match(source,/button\.addEventListener\("click", \(\) => sendMessage\(button.dataset.assistantPrompt\)\)/);
});
test('message and history previews stay safe text, with no new HTML/Markdown renderer',()=>{
 assert.match(source,/content\.textContent = message.content/);assert.match(source,/preview\.textContent =/);assert.doesNotMatch(source,/content\.innerHTML = message|preview\.innerHTML/);
});
