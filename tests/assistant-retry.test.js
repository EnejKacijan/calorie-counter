import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { assistantKeyboardOpen } from "../public/assistant.js";

const source = readFileSync(new URL("../public/assistant.js", import.meta.url), "utf8");
function functionSource(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match, name);
  const rest = source.slice(match.index);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
const key = "conversations";
function fixture(outcomes, initial = []) {
  const data = new Map();
  const requests = [];
  let nextId = 0;
  const context = vm.createContext({
    messages: structuredClone(initial), conversations: [], activeConversationId: null,
    isSending: false, transientError: "", conversationsKey: key,
    crypto: { randomUUID: () => `test-conversation-${++nextId}` },
    localRecordId: () => `test-conversation-${++nextId}`,
    elements: { input: { value: "", focus() {} }, sendStatus: { textContent: "" }, diaryToggle: { checked: true }, range: { value: "30" } },
    localStorage: { setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) },
    activeConversationKey: "old-active", legacyConversationKey: "legacy",
    window: { confirm: () => true },
    setActiveConversationId(id) { context.activeConversationId = id; },
    buildAppContext: () => ({ diaryEnabled: true, rangeDays: 30, days: [] }),
    getSafetyIdentifier: () => "synthetic-test",
    setSending(value) { context.isSending = value; },
    chatScroll: { latest() {} },
    resizeComposer() {}, updateComposerState() {}, setContextDisclosure() {}, renderConversation() {}, renderHistory() {}, setHistoryOpen() {}, isMobileSidebar: () => true,
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const outcome = outcomes.shift();
      if (outcome === "network") throw Error("Offline");
      return { ok: outcome === "ok", json: async () => outcome === "ok" ? { message: "Answer" } : { error: "Unavailable" } };
    },
  });
  vm.runInContext(["validDateString", "normalizeMessages", "normalizeConversation", "activeConversation", "conversationTitle", "ensureActiveConversation", "saveConversation", "openConversation", "unansweredTurn", "restoreTurnComposer", "retryFailedMessage", "startNewConversation", "deleteConversation", "deleteAllConversations", "sendMessage"].map(functionSource).join("\n"), context);
  return { context, requests, data, send: text => context.sendMessage(text),
    saved: () => JSON.parse(data.get(key))[0].messages,
    reopen() {
      context.conversations = JSON.parse(data.get(key)).map(context.normalizeConversation);
      context.messages = [];
      context.openConversation("test-conversation-1");
    } };
}
const turns = messages => messages.map(({ role, content }) => ({ role, content }));
const user = content => ({ role: "user", content });
const answer = { role: "assistant", content: "Answer" };

test("Assistant first-send success persists one question and answer with prior history unchanged", async () => {
  const prior = [user("Earlier"), answer];
  const f = fixture(["ok", "ok"], prior);
  await f.send("Question");
  assert.deepEqual(turns(f.saved()), [...prior, user("Question"), answer]);
  assert.deepEqual(f.requests[0].history, prior);
  assert.equal(f.requests[0].message, "Question");
  assert.deepEqual(f.requests[0].appContext, { diaryEnabled: true, rangeDays: 30, days: [] });
  await f.send("Question"); // A repeated question after a reply is a new turn.
  assert.equal(f.saved().length, 6);
});

test("Assistant explicit Retry uses the edited composer and survives normalization/reopening", async () => {
  const f = fixture(["fail", "fail", "ok"]);
  await f.send("Original");
  f.reopen();
  assert.equal(f.context.elements.input.value, "Original");
  f.context.elements.input.value = "  Edited replacement  ";
  await f.context.retryFailedMessage();
  f.reopen();
  assert.equal(f.context.elements.input.value, "Edited replacement");
  await f.context.retryFailedMessage();
  f.reopen();
  assert.deepEqual(turns(f.saved()), [user("Edited replacement"), answer]);
  assert.equal(f.context.elements.input.value, "");
  assert.deepEqual(f.requests.map(r => r.history), [[], [], []]);
  await f.context.retryFailedMessage();
  assert.equal(f.requests.length, 3, "a replied turn cannot be retried");
});

test("Assistant New and history selection do not leak the failed composer or mutate saved history", async () => {
  const f = fixture(["fail", "ok"]);
  await f.send("Saved failed question");
  const before = f.data.get(key);
  f.context.startNewConversation();
  assert.equal(f.context.elements.input.value, "");
  assert.equal(f.context.activeConversationId, null);
  assert.equal(f.data.get(key), before);
  await f.send("Separate conversation");
  assert.deepEqual(f.requests[1].history, []);
  f.context.openConversation("test-conversation-1");
  assert.equal(f.context.elements.input.value, "Saved failed question");
  f.context.openConversation("test-conversation-2");
  assert.equal(f.context.elements.input.value, "");
  assert.equal(f.context.conversations.length, 2);
});

test("Assistant history delete and delete-all require confirmation and clear only conversation data", async () => {
  const f = fixture(["fail", "ok"]);
  await f.send("Failed");
  f.context.startNewConversation();
  await f.send("Second");
  f.data.set("diary", "keep");
  f.context.window.confirm = () => false;
  const before = f.data.get(key);
  f.context.deleteConversation("test-conversation-2");
  f.context.deleteAllConversations();
  assert.equal(f.data.get(key), before);
  f.context.window.confirm = () => true;
  f.context.deleteConversation("test-conversation-2");
  assert.equal(f.context.conversations.length, 1);
  assert.equal(f.context.elements.input.value, "");
  f.context.openConversation("test-conversation-1");
  f.context.deleteAllConversations();
  assert.equal(f.context.elements.input.value, "");
  assert.equal(f.data.has(key), false);
  assert.equal(f.data.get("diary"), "keep");
});

test("Assistant pending submissions are single-flight and capture diary settings at request time", async () => {
  const f = fixture([]);
  let finish;
  f.context.fetch = async (_url, options) => {
    f.requests.push(JSON.parse(options.body));
    return new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ message: "Answer" }) }); });
  };
  const pending = f.send("Question");
  f.context.elements.diaryToggle.checked = false;
  await f.send("Duplicate");
  await f.context.retryFailedMessage();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].appContext.diaryEnabled, true);
  finish();
  await pending;
  assert.deepEqual(turns(f.saved()), [user("Question"), answer]);
});

test("Assistant keyboard contract: mobile/touch Return writes; desktop Enter sends except Shift, IME, repeat", () => {
  const context = vm.createContext({ window: { matchMedia: () => ({ matches: false }), navigator: { maxTouchPoints: 0 } } });
  vm.runInContext(functionSource("shouldSendOnEnter"), context);
  assert.equal(context.shouldSendOnEnter({ key: "Enter" }), true);
  for (const event of [{ key: "Enter", shiftKey: true }, { key: "Enter", isComposing: true }, { key: "Enter", repeat: true }, { key: "x" }]) assert.equal(context.shouldSendOnEnter(event), false);
  context.window.matchMedia = () => ({ matches: true });
  assert.equal(context.shouldSendOnEnter({ key: "Enter" }), false);
  context.window.matchMedia = () => ({ matches: false });
  context.window.navigator.maxTouchPoints = 5;
  assert.equal(context.shouldSendOnEnter({ key: "Enter" }), true, "a fine-pointer desktop with a touchscreen still uses desktop Enter");
});

test("Assistant diary disabled is minimal; 7/30-day windows preserve exact existing boundaries and fields", () => {
  const days = {};
  for (let offset = 0; offset <= 30; offset++) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - offset);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days[key] = { foods: [{ name: `Day ${offset}`, meal: "lunch", amount: 150, unit: "g", calories: 100, protein: 5, carbs: 15, fat: 2, privateNote: "exclude" }] };
  }
  const context = vm.createContext({ elements: { diaryToggle: { checked: false }, range: { value: "7" } }, state: { days, user: {}, goals: { calories: 2000 } } });
  vm.runInContext(["buildAppContext", "localDateKey"].map(functionSource).join("\n"), context);
  const capture = () => JSON.parse(JSON.stringify(context.buildAppContext()));
  assert.deepEqual(capture(), { diaryEnabled: false });
  context.elements.diaryToggle.checked = true;
  for (const range of [7, 30]) {
    context.elements.range.value = String(range);
    const payload = capture();
    assert.equal(payload.rangeDays, range);
    assert.equal(payload.days.length, range);
    assert.equal(payload.days[0].foods[0].name, `Day ${range - 1}`);
    assert.equal(payload.days.at(-1).foods[0].name, "Day 0");
    assert.equal("privateNote" in payload.days[0].foods[0], false);
  }
});

test("Assistant retry retains the 16-message request and 40-message persistence limits", async () => {
  const prior = Array.from({ length: 24 }, (_, i) => [user(`Earlier ${i}`), answer]).flat();
  const f = fixture(["fail", "ok"], prior);
  await f.send("Latest");
  assert.equal(f.saved().length, 40);
  assert.deepEqual(f.requests[0].history, prior.slice(-16));
  f.reopen();
  await f.context.retryFailedMessage();
  assert.equal(f.saved().length, 40);
  assert.deepEqual(f.requests[1].history, prior.slice(-16));
  assert.equal(f.saved().filter(m => m.content === "Latest").length, 1);
});

test("Assistant keyboard-only viewport sizing respects zoom and removes listeners/styles on navigation", () => {
  const listeners = new Map(), styles = new Map();
  const viewport = { height: 420, offsetTop: 12, scale: 1,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name) };
  let dispose;
  const classes = new Set(), input = {};
  const doc = { querySelector: () => null, activeElement: input, documentElement: { clientHeight: 844 },
    addEventListener() {}, removeEventListener() {}, body: { classList: { contains: key => classes.has(key), toggle: (key,on) => on ? classes.add(key) : classes.delete(key), remove: key => classes.delete(key) } } };
  const context = vm.createContext({ assistantKeyboardOpen, window: { visualViewport: viewport, getComputedStyle: () => ({height:'92px'}), addEventListener() {}, removeEventListener() {} },
    elements: { input, appShell: { ownerDocument: doc, style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) } } },
    chatScroll: { changed() {} }, messageActions: { position() {} }, onDispose: fn => { dispose = fn; } });
  vm.runInContext(functionSource("bindComposerViewport"), context);
  context.bindComposerViewport();
  assert.equal(styles.get("--assistant-viewport-height"), "420px");
  assert.equal(styles.get("--assistant-viewport-top"), "12px");
  viewport.scale = 2; viewport.height = 200; listeners.get("resize")();
  assert.equal(styles.get("--assistant-viewport-height"), "420px");
  viewport.scale = 1; listeners.get("resize")();
  assert.equal(styles.get("--assistant-viewport-height"), "200px");
  viewport.height = 844; viewport.offsetTop = 0; listeners.get("resize")();
  assert.equal(styles.has("--assistant-viewport-height"), false); assert.equal(styles.has("--assistant-viewport-top"), false);
  assert.equal(classes.size, 0);
  dispose(); assert.equal(listeners.size, 0); assert.equal(styles.size, 0);
});

test("Assistant failure persists exactly one question and restores the composer", async () => {
  const f = fixture(["network"]);
  await f.send("Question");
  assert.deepEqual(turns(f.saved()), [user("Question")]);
  assert.equal(f.context.elements.input.value, "Question");
  assert.equal(f.context.isSending, false);
  assert.match(f.context.transientError, /Offline/);
});

test("Assistant unchanged retry reuses the persisted turn after history reopening", async () => {
  const f = fixture(["fail", "ok"], [user("Earlier"), answer]);
  await f.send("Question");
  const timestamp = f.saved().at(-1).createdAt;
  f.reopen();
  await f.send("Question");
  assert.deepEqual(turns(f.saved()), [user("Earlier"), answer, user("Question"), answer]);
  assert.equal(f.saved().at(-2).createdAt, timestamp);
  assert.deepEqual(f.requests[1].history, [user("Earlier"), answer]);
  assert.equal(f.requests[1].message, "Question");
});

test("Assistant edited retry replaces the failed text instead of retaining both versions", async () => {
  const f = fixture(["fail", "ok"]);
  await f.send("Original question");
  await f.send("Completely different edited question");
  assert.deepEqual(turns(f.saved()), [user("Completely different edited question"), answer]);
  assert.deepEqual(f.requests[1].history, []);
  assert.equal(f.requests[1].message, "Completely different edited question");
});

test("Assistant repeated failures never duplicate the unanswered turn", async () => {
  const f = fixture(["fail", "network", "fail"]);
  for (const text of ["Question", "Question", "Edited question"]) {
    await f.send(text);
    assert.deepEqual(turns(f.saved()), [user(text)]);
    assert.deepEqual(f.requests.at(-1).history, []);
    assert.equal(f.requests.at(-1).message, text);
    assert.equal(f.context.elements.input.value, text);
    f.reopen();
  }
});
