import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { createSafeStorage } from "../public/data-safety.js";

const publicDir = new URL("../public/", import.meta.url);
const read = name => readFileSync(new URL(name, publicDir), "utf8");

test("all four local-profile screens have no logout controls, references or handlers", () => {
  for (const file of readdirSync(publicDir).filter(file => /\.(html|js|css)$/.test(file))) {
    assert.doesNotMatch(read(file), /logout|logged-out|log\s+out|logging\s+out|sign\s*out|state\.user\s*=\s*null/i, file);
  }
  assert.match(read("profile.html"), /id="profileForm"/);
  assert.match(read("profile.html"), /id="privacyControls"/);
});

test("the sole whole-storage erase call remains in the explicit privacy action", () => {
  const callers = readdirSync(publicDir).filter(file => file.endsWith(".js") && /\bstorage\.erase\(/.test(read(file)));
  assert.deepEqual(callers, ["privacy-controls.js"]);
});

test("privacy mount and cancelled erase preserve all records; confirmed erase removes only app data", async () => {
  const entries = {
    "calorie-counter-state": JSON.stringify({ user: { age: 30 }, goals: { calories: 2000 }, days: {}, progress: [] }),
    "calorie-counter-saved-foods": "[]",
    "calorie-counter-saved-meals": "[]",
    "calorie-counter-assistant-conversations": "[]",
    unrelated: "keep",
  };
  const data = new Map(Object.entries(entries));
  const native = { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  const storage = createSafeStorage(native);
  let click, confirmClick, close, locks = 0, resets = 0, redirects = 0, prompts = 0;
  const field = { addEventListener() {} };
  const confirmation = { open: false, addEventListener(type, fn) { if(type==='close')close=fn; }, showModal() { this.open = true; prompts++; }, close() { this.open = false; close(); } };
  const confirmButton = { disabled: false, addEventListener(type, fn) { if (type === 'click') confirmClick = fn; } };
  const root = { innerHTML: "", querySelector: selector => selector === '#deleteDataConfirm' ? confirmation : selector === '#deleteDataConfirmButton' ? confirmButton : field, addEventListener(type, fn) { if (type === "click") click = fn; } };
  let mediaErases=0;
  const context = { storage, foodMedia:{list:async()=>[],erase:async()=>{mediaErases++;}}, lockSurfaceScroll(){locks++;return()=>locks--;}, renderWarning() {}, document: { querySelector: () => root }, sessionStorage: {},
    window: { IntakeResetSession() { resets++; } },
    location: { replace(path) { assert.equal(path, "profile.html"); redirects++; } } };
  const source = read("privacy-controls.js");
  const start = source.indexOf("export function mountPrivacy(");
  const end = source.indexOf("\nexport ", start + 1);
  vm.runInNewContext(source.slice(start, end < 0 ? undefined : end).replace("export function", "function") + "\nmountPrivacy({ isActive: () => true });", context);
  assert.match(root.innerHTML, /data-action="erase">Delete all local data/);
  assert.deepEqual(Object.fromEntries(data), entries);
  const fire = action => click({ target: { closest: () => ({ dataset: { action } }) } });
  fire(undefined);
  assert.equal(prompts, 0);
  fire("erase");
  fire("erase"); assert.equal(locks,1);
  confirmation.close();
  assert.equal(locks,0);
  assert.deepEqual(Object.fromEntries(data), entries);
  assert.equal(resets, 0); assert.equal(redirects, 0);
  fire("erase");
  const deleting=confirmClick(); await confirmClick(); await deleting;
  assert.deepEqual(Object.fromEntries(data), { unrelated: "keep" });
  assert.equal(prompts, 2); assert.equal(resets, 1); assert.equal(redirects, 1);
  assert.equal(mediaErases,1);
});
