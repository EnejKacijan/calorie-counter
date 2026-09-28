import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createSafeStorage } from "../public/data-safety.js";
const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const key = "calorie-counter-saved-meals";
function fixture() {
  const meals = [{ id: "a", name: "Original", meal: "lunch", foods: [{ name: "Rice", calories: 100 }] }, { id: "b", name: "Second", meal: "dinner", foods: [] }];
  const data = new Map([[key, JSON.stringify(meals)]]);
  let writes = 0, fail = false, focus = "", status = "";
  const native = { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null,
    setItem(k, v) { writes++; if (fail) throw Error("Quota"); data.set(k, v); }, removeItem: k => data.delete(k) };
  const storage = createSafeStorage(native);
  const attributes = {};
  const input = { value: "Original", focus() { focus = "input"; }, select() {}, setAttribute(k,v) { attributes[k] = v; }, removeAttribute(k) { delete attributes[k]; } };
  const target = { value: "breakfast" };
  const content = { querySelector(selector) { return selector.includes("mealName") ? input : selector.includes("target") ? target : { focus() { focus = "rename"; } }; } };
  const c = vm.createContext({ savedMeals: structuredClone(meals), foodReuseState: { view: "saved-meal-review", savedMealId: "a" },
    elements: { foodReuseContent: content }, localStorage: storage, savedMealLibraryKey: key,
    renderFoodReusePanel() { status = ""; target.value = "lunch"; }, renderSavedFoods() {}, setFoodReuseStatus(message) { status = message; } });
  for (const name of ["beginSavedMealRename", "returnFromSavedMealRename", "submitSavedMealRename"]) {
    const start = source.indexOf(`function ${name}(`), end = source.indexOf("\nfunction ", start + 1);
    vm.runInContext(source.slice(start, end), c);
  }
  c.beginSavedMealRename();
  assert.equal(focus, "input");
  return { c, meals, input, target, attributes, storage, data, get writes() { return writes; }, get status() { return status; }, get focus() { return focus; },
    fail(value) { fail = value; }, save() { c.submitSavedMealRename({ querySelector: () => input }); } };
}
test("rename Save trims, preserves identity/foods/meal/order, writes once and restores review focus/target", () => {
  const f = fixture(); f.input.value = "  New name  "; f.save(); f.save();
  const saved = JSON.parse(f.data.get(key));
  assert.equal(f.writes, 1); assert.equal(saved[0].name, "New name");
  assert.deepEqual(saved.map(m => m.id), ["a", "b"]);
  assert.deepEqual(saved[0].foods, f.meals[0].foods); assert.equal(saved[0].meal, "lunch");
  assert.deepEqual(saved[1], f.meals[1]);
  assert.equal(f.c.foodReuseState.view, "saved-meal-review"); assert.equal(f.target.value, "breakfast"); assert.equal(f.focus, "rename");
});
test("rename Cancel returns without mutation or persistence", () => {
  const f = fixture(); f.input.value = "Uncommitted"; f.c.returnFromSavedMealRename();
  assert.equal(f.writes, 0); assert.deepEqual(JSON.parse(f.data.get(key)), f.meals);
  assert.equal(f.c.foodReuseState.view, "saved-meal-review"); assert.equal(f.focus, "rename"); assert.equal(f.target.value, "breakfast");
});
test("rename blank submission stays open with inline invalid feedback", () => {
  const f = fixture(); f.input.value = "   "; f.save();
  assert.equal(f.writes, 0); assert.equal(f.attributes["aria-invalid"], "true");
  assert.match(f.status, /Enter a meal name/); assert.equal(f.focus, "input");
  assert.equal(f.c.foodReuseState.view, "rename-saved-meal");
});
test("rename persistence failure retains draft, rolls back and never queues cancelled rename", () => {
  const f = fixture(); f.fail(true); f.input.value = "Draft"; f.save();
  assert.match(f.status, /could not be renamed/); assert.equal(f.input.value, "Draft");
  assert.equal(f.c.foodReuseState.view, "rename-saved-meal");
  assert.equal(f.c.savedMeals[0].name, "Original"); assert.deepEqual(JSON.parse(f.data.get(key)), f.meals);
  f.c.returnFromSavedMealRename(); f.fail(false); f.storage.retry();
  assert.equal(f.writes, 1); assert.deepEqual(JSON.parse(f.data.get(key)), f.meals);
});
