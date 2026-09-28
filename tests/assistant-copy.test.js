import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assistantMessageIdentity, requestAssistantCopy } from "../public/assistant.js";
import {clipboardEnvironment,copyFallbackText} from '../public/assistant-message-actions.js';

const source = readFileSync(new URL("../public/assistant.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/assistant.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/assistant-usability.css", import.meta.url), "utf8");
const actions = readFileSync(new URL('../public/assistant-message-actions.js',import.meta.url),'utf8');

test("Assistant copy sends the exact plain text directly on activation and reports resolved success", async () => {
  let resolve;
  const calls = [];
  const states = [];
  const navigator = { clipboard: { writeText(value) { calls.push(value); return new Promise(done => { resolve = done; }); } } };
  const text = "  Protein\n\n• 32 g\n1.5 units — café  "
  const accepted = requestAssistantCopy({ navigator, text, onSuccess: () => states.push("success"), onFailure: () => states.push("failure") });
  assert.equal(accepted, true);
  assert.deepEqual(calls, [text]);
  assert.deepEqual(states, []);
  resolve();
  await Promise.resolve();
  assert.deepEqual(states, ["success"]);
});

test("Assistant copy reports rejected and unavailable clipboard without claiming success", async () => {
  const rejected = [];
  const accepted = requestAssistantCopy({
    navigator: { clipboard: { writeText: () => Promise.reject(new Error("denied")) } },
    text: "reply",
    onSuccess: () => rejected.push("success"),
    onFailure: () => rejected.push("failure"),
  });
  assert.equal(accepted, true);
  await Promise.resolve();
  assert.deepEqual(rejected, ["failure"]);

  const unavailable = [];
  assert.equal(requestAssistantCopy({ navigator: {}, text: "reply", onSuccess: () => unavailable.push("success"), onFailure: () => unavailable.push("failure") }), false);
  assert.deepEqual(unavailable, ["failure"]);
});

test("message identity is stable per in-memory message and does not become persisted content", () => {
  const first = { role: "assistant", content: "same" };
  const second = { role: "assistant", content: "same" };
  assert.equal(assistantMessageIdentity(first), assistantMessageIdentity(first));
  assert.notEqual(assistantMessageIdentity(first), assistantMessageIdentity(second));
  assert.deepEqual(first, { role: "assistant", content: "same" });
});

test("both message roles have one accessible action entry with stable identity and stale-operation guards", () => {
  assert.match(source, /dataset\.messageActions/);
  assert.match(source, /dataset\.messageId/);
  assert.match(source, /if \(String\(message\.content \|\| \"\"\)\.trim\(\)\)/);
  assert.match(actions, /requestAssistantCopy\(\{/);
  assert.match(actions, /generation!==operation/);
  assert.match(source, /renderedConversationId===activeConversationId/);
  assert.match(source, /messages\.find\(message=>assistantMessageIdentity\(message\)===messageId\)/);
  assert.match(html, /id="assistantCopyStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(css, /\.assistant-message-actions/);
  assert.match(css, /\.assistant-message-menu-trigger[^}]*width: 44px[^}]*min-height: 44px/);
  assert.match(css, /\.assistant-message > p[^}]*user-select: text; -webkit-user-select: text/);
  assert.match(css, /-webkit-touch-callout: default/);
  assert.match(css, /\[data-message-hold\] \{ user-select: none/);
  assert.match(css, /assistant-text-selection-body[^}]*user-select: text/);
  assert.doesNotMatch(source+actions, /clipboard\.readText|execCommand\(/);
  assert.match(actions,/chatScroll\.hold\(\)/);
});

test("unavailable and rejected copy use honest selection fallback, not an inline error or false success", () => {
  assert.match(copyFallbackText({secureContext:false}),/this connection/);
  assert.match(copyFallbackText({secureContext:true,reason:'clipboard-unavailable'}),/this browser/);
  assert.match(copyFallbackText({secureContext:true,reason:'NotAllowedError'}),/declined/);
  assert.doesNotMatch(source+actions,/assistant-copy-error|Couldn't copy automatically/);
  assert.match(actions,/void selectText\(t,copyFallbackText\(details\)\)/);
  assert.match(actions,/status.textContent='Copied'/);
  assert.match(actions,/generation===current/);
});

test('copy diagnostics expose capabilities only, never host/path/content/error text',async()=>{
 const ctx={isSecureContext:true,location:{protocol:'https:',hostname:'private.example',search:'?secret=value'},document:{hasFocus:()=>true},self:1,top:1};
 const events=[],secret='private-message-text';
 requestAssistantCopy({navigator:{userActivation:{isActive:true},clipboard:{writeText:()=>Promise.reject(Object.assign(new Error(secret),{name:'NotAllowedError'}))}},context:ctx,text:secret,diagnose:e=>events.push(e)});
 await Promise.resolve();assert.deepEqual(events.map(e=>e.phase),['activation','write-called','rejected']);
 assert.equal(events.at(-1).reason,'NotAllowedError');assert.equal(events[0].activation,true);
 assert.doesNotMatch(JSON.stringify(events),/private|secret|value/);
 assert.equal(clipboardEnvironment({location:{protocol:'http:',hostname:'10.0.0.2'}}).originCategory,'non-loopback-http');
 assert.equal(clipboardEnvironment({location:{protocol:'http:',hostname:'127.0.0.1'}}).originCategory,'loopback-http');
});

test('empty text never writes and a thrown clipboard error never reports success',()=>{
 let calls=0;const failures=[];
 const navigator={clipboard:{writeText(){calls++;throw new DOMException('sensitive browser details','SecurityError');}}};
 assert.equal(requestAssistantCopy({navigator,text:' ',onFailure:d=>failures.push(d.reason)}),false);assert.equal(calls,0);
 assert.equal(requestAssistantCopy({navigator,text:'Message',onFailure:d=>failures.push(d.reason),onSuccess:()=>assert.fail('false success')}),false);
 assert.deepEqual(failures,['empty-text','SecurityError']);assert.equal(calls,1);
});
