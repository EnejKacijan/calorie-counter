import test from "node:test";
import assert from "node:assert/strict";
import { createSafeStorage, parseBackup } from "../public/data-safety.js";
const key = "calorie-counter-state";
const state = JSON.stringify({ user: { age: 30 }, goals: { calories: 2000, protein: 140, carbs: 240, fat: 60 }, days: {}, progress: [] });
function fixture(entries = { [key]: state }) {
  const data = new Map(Object.entries(entries));
  const native = { fail: false, get length() { return data.size; }, key(i) { return [...data.keys()][i]; }, getItem(k) { return data.get(k) ?? null; }, setItem(k,v) { if (this.fail) throw Error("Quota"); data.set(k,v); }, removeItem(k) { if (this.fail) throw Error("Quota"); data.delete(k); } };
  return { native, store: createSafeStorage(native), data };
}
test("quota failure preserves pending diary in memory and export, retry persists it", () => {
  const { native, store } = fixture(); native.fail = true;
  const updated = JSON.stringify({ ...JSON.parse(state), selectedDate: "2026-09-07" });
  store.setItem(key, updated);
  assert.match(store.status, /only in memory/); assert.equal(store.getItem(key), updated);
  assert.equal(parseBackup(store.export())[key], updated); assert.equal(native.getItem(key), state);
  native.fail = false; store.retry(); assert.equal(native.getItem(key), updated); assert.equal(store.status, "");
});
test("corrupt diary is not silently replaced by defaults", () => {
  const { store, native } = fixture({ [key]: "broken JSON" });
  store.setItem(key, state); assert.equal(native.getItem(key), "broken JSON"); assert.match(store.status, /protected/);
  assert.equal(JSON.parse(store.export()).data[key], "broken JSON");
});
test("backup round trip restores all libraries but not sharing permission or unrelated data", () => {
  const source = fixture({ [key]: state, "calorie-counter-saved-meals": "[]", "calorie-counter-ai-consent-v1": '{"photo":true}', unrelated: "private" });
  const target = fixture({ [key]: state, unrelated: "keep", "calorie-counter-theme": "dark" });
  target.store.restore(source.store.export());
  assert.equal(target.native.getItem("calorie-counter-saved-meals"), "[]");
  assert.equal(target.native.getItem("calorie-counter-ai-consent-v1"), null);
  assert.equal(target.native.getItem("calorie-counter-theme"), null); assert.equal(target.native.getItem("unrelated"), "keep");
});
test("invalid imports are rejected before touching original data", () => {
  const { store, native } = fixture();
  for (const value of ["{}", '{"format":"intake-backup","version":2,"data":{}}', JSON.stringify({ format: "intake-backup", version: 1, data: { [key]: "{}" } }), JSON.stringify({ format: "intake-backup", version: 1, data: { [key]: state, unrelated: "bad" } })]) assert.throws(() => store.restore(value));
  assert.equal(native.getItem(key), state);
});
test("interrupted restore journal rolls back on startup", () => {
  const { native } = fixture({ [key]: "partial", "intake-restore-journal-v1": JSON.stringify({ [key]: state }) });
  const recovered = createSafeStorage(native); assert.equal(recovered.getItem(key), state); assert.equal(native.getItem("intake-restore-journal-v1"), null);
});
test("quota at start of restore leaves original data unchanged", () => {
  const { native, store } = fixture(); const backup = store.export(); native.fail = true;
  assert.throws(() => store.restore(backup)); assert.equal(native.getItem(key), state);
});
test("erase removes Intake data only", () => {
  const { native, store } = fixture({ [key]: state, unrelated: "keep" }); store.erase(); assert.equal(native.getItem(key), null); assert.equal(native.getItem("unrelated"), "keep");
});
test("competing diary write stays saved while this window can export its own edits", () => {
  const { native, store } = fixture(); store.getItem(key);
  const other = JSON.stringify({ ...JSON.parse(state), selectedDate: "2026-09-08" });
  native.setItem(key, other); store.setItem(key, state);
  assert.equal(native.getItem(key), other); assert.match(store.status, /another window/);
  assert.equal(parseBackup(store.export())[key], state); assert.throws(() => store.retry());
});
test("unsafe nested JSON in a backup is rejected", () => {
  const { store } = fixture(); const backup = JSON.parse(store.export());
  backup.data[key] = '{"__proto__":{},"days":{},"progress":[],"goals":{}}';
  assert.throws(() => parseBackup(JSON.stringify(backup)));
});

for (const collection of ["calorie-counter-food-library", "calorie-counter-saved-foods", "calorie-counter-saved-meals", "calorie-counter-assistant-conversations-v1"]) {
  const original = JSON.stringify([{ id: "original" }]);
  const competing = JSON.stringify([{ id: "other-window" }]);
  const attempted = JSON.stringify([{ id: "this-window" }]);
  test(`${collection}: competing write is preserved; attempted edit exports and retry is blocked`, () => {
    const { native, store } = fixture({ [key]: state, [collection]: original });
    const warnings = [];
    const local = createSafeStorage(native, message => warnings.push(message));
    local.getItem(collection);
    store.setItem(collection, competing);
    local.setItem(collection, attempted);
    assert.equal(native.getItem(collection), competing);
    assert.equal(local.getItem(collection), attempted);
    assert.equal(parseBackup(local.export())[collection], attempted);
    assert.match(warnings.at(-1), /another window/);
    assert.throws(() => local.retry());
    assert.equal(native.getItem(collection), competing);
  });
  test(`${collection}: retry preflights a conflict after an initial quota failure`, () => {
    const { native, store } = fixture({ [key]: state, [collection]: original });
    store.getItem(collection); native.fail = true;
    store.setItem("calorie-counter-theme", "dark");
    store.setItem(collection, attempted);
    native.fail = false; native.setItem(collection, competing);
    assert.throws(() => store.retry(), /Another window/);
    assert.equal(native.getItem("calorie-counter-theme"), null);
    assert.equal(native.getItem(collection), competing);
    assert.equal(parseBackup(store.export())[collection], attempted);
  });
  test(`${collection}: confirmed writes and removal cannot bypass protection`, () => {
    for (const remove of [false, true]) {
      const { native, store } = fixture({ [key]: state, [collection]: original });
      store.getItem(collection); native.setItem(collection, competing);
      if (remove) store.removeItem(collection);
      else assert.throws(() => store.setItemConfirmed(collection, attempted), /Another window/);
      assert.equal(native.getItem(collection), competing);
      assert.equal(store.getItem(collection), remove ? null : attempted);
      assert.throws(() => store.retry());
      assert.equal(native.getItem(collection), competing);
    }
  });
  test(`${collection}: absent-key conflicts detected; ordinary sequential edits still work`, () => {
    const { native, store } = fixture();
    assert.equal(store.getItem(collection), null);
    native.setItem(collection, competing);
    store.setItem(collection, attempted);
    assert.equal(native.getItem(collection), competing);
    const fresh = createSafeStorage(native);
    fresh.getItem(collection); fresh.setItem(collection, original); fresh.setItemConfirmed(collection, attempted);
    assert.equal(native.getItem(collection), attempted);
  });
}

test("preferences remain last-write-wins", () => {
  const { native, store } = fixture({ [key]: state, "calorie-counter-theme": "light" });
  store.getItem("calorie-counter-theme"); native.setItem("calorie-counter-theme", "dark");
  store.setItem("calorie-counter-theme", "light");
  assert.equal(native.getItem("calorie-counter-theme"), "light"); assert.equal(store.status, "");
});
