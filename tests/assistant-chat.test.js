import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assistantHistoryFrames,assistantMessageIdentity} from '../public/assistant.js';
const source=readFileSync(new URL('../public/assistant.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/assistant-usability.css',import.meta.url),'utf8');
test('History enters from the right with no opacity or height animation',()=>{
 const frames=assistantHistoryFrames(true);assert.deepEqual(frames,[{transform:'translateX(18px)'},{transform:'translateX(0px)'}]);
 for(const frame of frames)assert.deepEqual(Object.keys(frame),['transform']);
});
test('Back can begin at an interrupted entry position without jumping',()=>{
 assert.deepEqual(assistantHistoryFrames(false,'matrix(1, 0, 0, 1, 87, 0)'),[{transform:'matrix(1, 0, 0, 1, 87, 0)'},{transform:'translateX(24px)'}]);
});
test('only the known Assistant surface loses native tap paint and fallback dialog focus; controls retain ink focus',()=>{
 assert.match(css,/\.assistant-shell \{ -webkit-tap-highlight-color: transparent; \}/);
 assert.match(css,/dialog\.assistant-nested-surface:focus \{ outline: none; \}/);
 assert.match(css,/:is\(button,select,input\):focus-visible \{ outline: 2px solid var\(--ink\) !important/);
 assert.doesNotMatch(css,/\*:focus/);assert.match(css,/#assistantHistory \{ animation: none; opacity: 1; \}/);
});
function message(role,failed=false){
 const make=tag=>({tag,children:[],attributes:{},dataset:{},setAttribute(k,v){this.attributes[k]=v;},append(...nodes){this.children.push(...nodes);},appendChild(node){this.children.push(node);}});
 const start=source.indexOf('function createMessage('),end=source.indexOf('\nfunction unansweredTurn',start);
 const context=vm.createContext({document:{createElement:make},transientError:'Offline',assistantMessageIdentity});vm.runInContext(source.slice(start,end),context);
 return context.createMessage({role,content:'<img src=x>\n\n• Plain text\nhttps://example.test/'+'a'.repeat(250)},failed);
}
test('user and Intake remain distinct safely rendered message roles',()=>{
 const user=message('user'),reply=message('assistant');assert.equal(user.className,'assistant-message is-user');assert.equal(reply.className,'assistant-message is-assistant');
 assert.match(user.children[0].className,/sr-only/);assert.equal(reply.children[0].textContent,'Intake');assert.match(reply.children[1].textContent,/<img src=x>\n\n• Plain text/);assert.equal(reply.children[1].innerHTML,undefined);
});
test('failure and Retry stay associated with the one original user turn',()=>{
 const failed=message('user',true);assert.equal(failed.className,'assistant-message is-user is-failed');assert.equal(failed.children.filter(c=>c.tag==='p').length,1);
 const recovery=failed.children.find(c=>c.className==='assistant-failed-turn');assert.equal(recovery.attributes['aria-label'],'Intake response failed');assert.equal(recovery.children[0].textContent,'Intake');assert.equal(recovery.children[2].dataset.assistantRetry,'');assert.equal(recovery.children[2].textContent,'Retry');
});
test('chat widths and long plain-text wrapping are bounded without a renderer change',()=>{
 assert.match(css,/\.assistant-message\.is-user \{[^}]*max-width: 80%/);assert.match(css,/\.assistant-message \{[^}]*max-width: 90%/);
 assert.match(css,/\.assistant-message > p \{[^}]*white-space: pre-wrap; overflow-wrap: anywhere/);
 assert.doesNotMatch(source,/cloneNode/);assert.match(source,/if \(toEmpty && !surface\).*#assistantTitle/);
});
test('pending bubble obeys its existing hidden state after success or failure',()=>{
 assert.match(css,/\.assistant-typing\[hidden\] \{ display: none !important; \}/);
 assert.match(source,/elements.typing.hidden = !sending/);
});
