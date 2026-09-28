import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { rankFoodMatches, foodNameMatch, foodBrandLabel, foodActionLabel, foodSearchErrorMessage } from "../public/food-search.js";
import { localRice, milk } from "../scripts/fixtures/food-search.mjs";
import "../public/food-persistence.js";
import { mediaIdValid } from '../public/food-media.js';
import { formatFoodDisplayName } from '../public/food-display-name.js';

test("name ranking is strictly exact > prefix > substring > metadata-only", () => {
  const foods = [{ name: "Raw banana chips", source: "USDA" }, { name: "Banana", brand: "Brand" }, { name: "Banana bread" }, { name: "Shake", brand: "Banana" }];
  assert.deepEqual(rankFoodMatches(foods, "banana").map(f => f.name), ["Banana", "Banana bread", "Raw banana chips", "Shake"]);
  assert.equal(foodNameMatch("  BANANA   bread ", "banana bread"), 3);
  assert.equal(foodNameMatch("Bananas", "banana"), 2);
});
test("local identity priority breaks name-quality ties, never promotes a weaker local name", () => {
  const foods = [{ id: "online", name: "Rice" }, { id: "saved", name: "Rice" }, { id: "recent", name: "Rice" }, { id: "weak", name: "Rice bowl" }];
  const priority = f => ({ saved: 2, recent: 1, weak: 2 })[f.id] || 0;
  assert.deepEqual(rankFoodMatches(foods, "rice", priority).map(f => f.id), ["saved", "recent", "online", "weak"]);
  assert.deepEqual(foods.map(f => f.id), ["online", "saved", "recent", "weak"]);
});
test("provider does not influence equal name matches; empty query preserves Recent ordering", () => {
  const foods = [{ name: "Rice", source: "Open Food Facts" }, { name: "Rice", source: "USDA" }];
  assert.deepEqual(rankFoodMatches(foods, "rice"), foods);
  assert.deepEqual(rankFoodMatches(foods, "", () => 2), foods);
});
test("detail actions name the destination and editing remains Save changes", () => {
  for (const meal of ["breakfast", "lunch", "dinner", "snack"]) {
    assert.equal(foodActionLabel(meal), `Add to ${meal[0].toUpperCase()}${meal.slice(1)}`);
    assert.equal(foodActionLabel(meal, true), "Save changes");
  }
});
test("brand and useful search errors remain distinct from source provenance", () => {
  assert.equal(foodBrandLabel({ brand: "Dairy Farm", source: "USDA" }), "Dairy Farm");
  assert.equal(foodBrandLabel({ brand: "USDA", source: "USDA" }), "");
  assert.equal(foodSearchErrorMessage(new Error("Food sources are temporarily unavailable.")), "Food sources are temporarily unavailable.");
  assert.match(foodSearchErrorMessage(new TypeError("Failed to fetch")), /connection/);
});

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const from = source.slice(start - 6, start) === "async " ? start - 6 : start;
  const rest = source.slice(start + 1), next = rest.search(/\n(?:async )?function /);
  return source.slice(from, next < 0 ? undefined : start + 1 + next);
}
test("Recent QA fixtures have explicit distinct recency instead of relying on load time", () => {
  for (const food of [localRice, milk]) {
    assert.ok(Number.isFinite(Date.parse(food.lastUsedAt)));
    assert.ok(Number.isFinite(Date.parse(food.savedAt)));
  }
  assert.ok(Date.parse(localRice.lastUsedAt) > Date.parse(milk.lastUsedAt));
  assert.equal(localRice.lastUsedAmount, 150);
  assert.equal(localRice.lastUsedUnit, "g");
});

test("Recent fixture identity/order and last-used portion survive normalization regardless of clock or input order", () => {
  for (const step of [0, 1, 1000]) for (const fixtures of [[localRice, milk], [milk, localRice]]) {
    let tick = 0;
    const c = {
      Date: class extends Date { constructor() { super(1800000000000 + tick++ * step); } },
      foodPersistence: globalThis.IntakeFoodPersistence, structuredClone, mediaIdValid,
      roundNutritionValue: n => Math.round(Number(n || 0) * 10) / 10,
    };
    vm.createContext(c);
    vm.runInContext(functionSource("foodSource") + "\n" + functionSource("normalizeFoodForLibrary"), c);
    const stored = globalThis.IntakeFoodPersistence.uniqueRecentFoods(fixtures.map(food => c.normalizeFoodForLibrary(food)));
    assert.deepEqual(stored.map(food => food.id), [localRice.id, milk.id]);
    assert.equal(stored[0].catalogId, localRice.catalogId);
    assert.equal(stored[0].lastUsedAmount, 150);
    assert.equal(stored[0].lastUsedUnit, "g");
    assert.equal(stored[1].lastUsedAmount, null);
    assert.equal(stored[1].lastUsedUnit, "");
    assert.equal(tick, 0, "fixture chronology must not depend on the runtime clock");
  }
});

function searchFixture(fetch) {
  const c = { AbortController, fetch, clearTimeout() {}, autocompleteTimer: null, suggestionAbortController: null,
    foodSearchRequestId: 0, foodSearchPending: false, foodSearchError: "", latestFoodSuggestions: [],
    details: false, rendered: [], errors: [], elements: {
      manualFoodName: { value: "rice" }, searchNote: { textContent: "" },
      foodSuggestions: { innerHTML: "", setAttribute() {}, removeAttribute() {} },
      foodSection: { classList: { remove() {}, contains: () => c.details } }
    }, searchFoodLibrary: () => [{ name: "Rice", source: "Saved" }], showBrowseFoodSuggestions() {}, setFoodSearchActive() {},
    rankFoodSuggestions: foods => foods, dedupeFoodSuggestions: foods => foods,
    foodSearchErrorMessage, renderSuggestions: foods => c.rendered.push(foods), renderFoodSearchError: message => c.errors.push(message) };
  vm.createContext(c);
  vm.runInContext(functionSource("cancelFoodSearch") + "\n" + functionSource("searchFoodSuggestions"), c);
  return c;
}
const response = name => ({ ok: true, json: async () => ({ foods: [{ name }] }) });
test("stale success cannot replace a newer query even if abort is ignored upstream", async () => {
  const pending = [];
  const c = searchFixture((url, options) => new Promise(resolve => pending.push({ resolve, options })));
  const first = vm.runInContext('searchFoodSuggestions("rice")', c);
  c.elements.manualFoodName.value = "oats";
  const second = vm.runInContext('searchFoodSuggestions("oats")', c);
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve(response("Oats")); await second;
  pending[0].resolve(response("Old rice")); await first;
  assert.equal(c.rendered.at(-1).at(-1).name, "Oats");
  assert.equal(c.foodSearchPending, false);
});
test("selecting a local result cancels the same-name pending request before detail", async () => {
  let resolve;
  const c = searchFixture(() => new Promise(done => { resolve = done; }));
  const work = vm.runInContext('searchFoodSuggestions("rice")', c);
  vm.runInContext("cancelFoodSearch()", c); c.details = true;
  resolve(response("Rice online")); await work;
  assert.equal(c.rendered.length, 1); assert.equal(c.errors.length, 0);
});
test("failure and repeated retry retain local matches/query and clear pending state", async () => {
  let calls = 0;
  const c = searchFixture(async () => ++calls < 3 ? { ok: false, json: async () => ({ error: "Food sources are temporarily unavailable." }) } : response("Rice online"));
  for (let i = 0; i < 2; i++) {
    await vm.runInContext('searchFoodSuggestions("rice")', c);
    assert.equal(c.elements.manualFoodName.value, "rice");
    assert.equal(c.rendered.at(-1)[0].name, "Rice");
    assert.equal(c.foodSearchPending, false);
  }
  assert.equal(c.errors.length, 2);
  await vm.runInContext('searchFoodSuggestions("rice")', c);
  assert.equal(c.rendered.at(-1).at(-1).name, "Rice online");
  assert.equal(c.foodSearchError, "");
});

test("a stale rejected request cannot show an error over newer results", async () => {
  let rejectOld;
  let calls = 0;
  const c = searchFixture(() => ++calls === 1 ? new Promise((resolve, reject) => { rejectOld = reject; }) : Promise.resolve(response("Oats")));
  const first = vm.runInContext('searchFoodSuggestions("rice")', c);
  c.elements.manualFoodName.value = "oats";
  await vm.runInContext('searchFoodSuggestions("oats")', c);
  rejectOld(new Error("Old provider failure")); await first;
  assert.equal(c.errors.length, 0); assert.equal(c.rendered.at(-1).at(-1).name, "Oats");
});

test("logged ml edit uses its measured total basis just like g, preserving serving rules", async () => {
  await import("../public/scanned-food.js");
  const field = () => ({ value: "", textContent: "", focus() {} });
  const c = { elements: { manualFoodForm: { dataset: {} }, foodSection: { classList: { remove() {}, add() {} } },
      foodEditSummary: { querySelector: field }, manualFoodName: field(), foodEditName: field(), foodAmount: field(), foodUnit: field(), foodMeal: field(),
      manualFoodCalories: field(), manualFoodProtein: field(), manualFoodCarbs: field(), manualFoodFat: field(), manualFoodSubmit: field(), foodSuggestions: {}, searchNote: field() },
    formatFoodDisplayName, resetPhotoReview() {}, cancelFoodSearch() {}, syncFoodDetailBrand() {}, foodSource: f => f.source || "USDA", parseServing: () => ({}),
    roundNutritionValue: n => Math.round(Number(n || 0) * 10) / 10, syncFoodUnitOptions() {}, syncFoodPortionNote() {},
    defaultMealForNow: () => "lunch", updateFoodAmountStep() {}, setFoodSearchActive() {}, syncFoodNutritionSummaryFromInputs() {},
    syncFoodNutritionMode() {}, openEditLogForm() {}, syncFoodModeHeader() {}, renderEntries() {}, isPhoneAddFoodLayout: () => false };
  vm.createContext(c); vm.runInContext(functionSource("fillFoodFormForEdit"), c);
  for (const unit of ["g", "ml", "serving"]) {
    c.food = { id: "entry", name: "Test", amount: unit === "serving" ? 2 : 125, unit, meal: "lunch", servingGrams: 250, servingMl: 250, calories: 60, protein: 6, carbs: 10, fat: 2 };
    vm.runInContext("fillFoodFormForEdit(food)", c);
    const multiplier = globalThis.IntakeScannedFood.portionMultiplier({ ...c.selectedFoodBase, amount: c.food.amount * 2, unit });
    assert.equal(Math.round(c.selectedFoodBase.calories * multiplier), 120, unit);
    assert.equal(c.selectedFoodBase.protein * multiplier, 12, unit);
    assert.equal(c.elements.manualFoodSubmit.textContent, "Save changes");
  }
});
