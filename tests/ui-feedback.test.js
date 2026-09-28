import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {commitDiaryDay} from '../public/add-entry.js';
import {localRecordId} from '../public/local-record-id.js';
await import("../public/food-reuse.js");
await import("../public/food-persistence.js");
await import("../public/scanned-food.js");

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
function functionSource(name) {
  let start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  if (source.slice(start - 6, start) === "async ") start -= 6;
  const offset = source.slice(start + 1).search(/\n(?:async )?function /);
  const end = offset < 0 ? -1 : start + 1 + offset;
  return source.slice(start, end < 0 ? undefined : end);
}

test("opening Reuse delegates the physical layer to the shared sheet owner", () => {
  const classes = { add() {}, remove() {} };
  const element = () => ({ inert: true, hidden: true, classList: classes,
    style: { removeProperty() {} }, setAttribute() {}, querySelector() { return { focus() {} }; } });
  const elements = { foodReusePanel: element(), foodReuseBackdrop: element(), foodLogOptionsButton: element() };
  let opened;
  const context = { elements, foodReuseState: { open: false }, reuseSheet: null, closeSwipedEntries() {},
    foodReuseSurface: () => ({open(options){opened=options;}}),
    foodReuseOpener: null, window: { clearTimeout() {} },
    document: { activeElement: {}, body: { classList: classes } },
    isPhoneAddFoodLayout: () => true, isDesktopEditLayout: () => false,
    lockMobileFoodReuseBackground() {}, positionReuseUndoToast() {}, renderFoodReusePanel() {}, requestAnimationFrame(callback) { callback(); } };
  vm.runInNewContext(`${functionSource("openFoodReusePanel")}\nopenFoodReusePanel('saved-meal');`, context);
  assert.equal(opened.returnTo, context.document.activeElement);
  assert.equal(context.foodReuseState.open, true);
});

test("metric feedback renders the final value immediately, never intermediate totals", () => {
  const writes = [];
  const reveals = [];
  const context = { setMetricText: (...args) => writes.push(args), window: { IntakeMotion: { reveal: e => reveals.push(e) } } };
  vm.runInNewContext(`${functionSource("animateNumber")}\nanimateNumber('calories', 2350, 2000, ' kcal');`, context);
  assert.deepEqual(writes, [["calories", 2000, " kcal"]]);
  assert.deepEqual(reveals, ["calories"]);
});

function descriptionFixture(fetch) {
  const classes = { remove() {} };
  const field = () => ({ textContent: "", hidden: true, value: "apple and yogurt", setAttribute() {} });
  const context = { AbortController, fetch, aiDescriptionPending: false, aiDescriptionController: null, addSurface: {forgetParent() {}},
    elements: { foodAiDescriptionInput: field(), foodAiDescriptionError: field(), foodAiDescriptionStatus: field(),
      foodAiDescriptionSubmit: field(), foodAiDescription: field(), foodAiDescriptionTrigger: field(), foodSection: { classList: classes } },
    usefulFoodDescription: () => true, syncFoodAiDescriptionState() {}, syncDesktopFoodAddContentState() {},
    opened: 0, showSimpleScannedPlate() { context.opened++; }, showScannedFoodsReview() {} };
  vm.createContext(context);
  vm.runInContext(functionSource("closeFoodAiDescription") + "\n" + functionSource("estimateDescribedFood"), context);
  return context;
}
test("cancelling AI description ignores even a late successful response", async () => {
  let resolve;
  const c = descriptionFixture(() => new Promise(done => { resolve = done; }));
  const pending = vm.runInContext("estimateDescribedFood()", c);
  const controller = c.aiDescriptionController;
  vm.runInContext("closeFoodAiDescription()", c);
  resolve({ ok: true, json: async () => ({ analysis: { foods: [{ name: "Apple" }] } }) });
  await pending;
  assert.equal(controller.signal.aborted, true);
  assert.equal(c.opened, 0);
  assert.equal(c.aiDescriptionPending, false);
  assert.equal(c.elements.foodAiDescriptionInput.value, "apple and yogurt");
});
test("failed AI estimate retains the editable description and releases pending state", async () => {
  const c = descriptionFixture(async () => ({ ok: false, json: async () => ({}) }));
  await vm.runInContext("estimateDescribedFood()", c);
  assert.equal(c.opened, 0);
  assert.equal(c.aiDescriptionPending, false);
  assert.equal(c.elements.foodAiDescriptionError.hidden, false);
  assert.equal(c.elements.foodAiDescriptionInput.value, "apple and yogurt");
});

test("rapid saved-meal commit inserts one independent copy and marks its feedback once", () => {
  const template = { id: "meal-1", name: "Lunch", meal: "lunch", foods: [{ id: "source", name: "Rice", amount: 2, unit: "serving", calories: 200, protein: 4, carbs: 40, fat: 2 }] };
  const before = JSON.stringify(template);
  const day = { foods: [] };
  let handler;
  let writes = 0;
  const c = { savedMeals: [template], foodReuseState: { open: true, savedMealId: template.id },
    state: { selectedDate: "2026-09-06" }, foodLibrary: [], editingFoodId: null, recentSuccess: null,
    elements: { foodReuseContent: { addEventListener(type, callback) { handler = callback; }, querySelector() { return { value: "dinner" }; } }, foodSection: {}, searchNote: {} },
    foodReuse: globalThis.IntakeFoodReuse, foodPersistence: globalThis.IntakeFoodPersistence, currentDay: () => day, isFutureDateKey: () => false,
    foodSource: () => "Manual", normalizeFoodForLibrary:f=>f, maxRecentFoodItems:100, saveFoodLibrary() {}, localRecordId,
    localStorage:{setItemConfirmed(){writes++;}}, commitDiaryDay(storage,state,updated){const next=commitDiaryDay(storage,state,updated);day.foods=updated.foods;return next;},
    closeFoodReusePanel() { c.foodReuseState.open = false; }, render() {}, closeMobileLogForm() {}, resetFoodForm() {},
    mealLabel: meal => meal.toUpperCase() };
  const start = source.indexOf('elements.foodReuseContent?.addEventListener("click"');
  const end = source.indexOf('\nelements.addFoodToggle.addEventListener', start);
  vm.runInNewContext(functionSource("copyFoodEntries") + "\n" + source.slice(start, end), c);
  const event = { target: { closest: () => ({ dataset: { reuseAction: "add-saved-meal" } }) } };
  handler(event);
  handler(event);
  assert.equal(writes, 1);
  assert.equal(day.foods.length, 1);
  assert.equal(day.foods[0].meal, "dinner");
  assert.equal(day.foods[0].calories, 200);
  assert.notEqual(day.foods[0].id, "source");
  assert.equal(JSON.stringify(template), before);
  assert.equal(c.recentSuccess.ids[0], day.foods[0].id);
});

test("simple scanned plate accepts comma-decimal amount without NaN", () => {
  let committed;
  const c = { scannedFoodItems: [{ included: true, name: "Rice", amount: 1, calories: 100, protein: 4, carbs: 13, fat: 2 }],
    validateScannedFoodAmounts: () => true, portionMath: globalThis.IntakeScannedFood,
    selectedFoodBase: { scanInitialMultiplier: 1 }, portionMultiplier: (base, amount) => amount,
    elements: { foodAmount: { value: "0,5" }, foodUnit: { value: "serving" }, foodMeal: { value: "dinner" },
      manualFoodCalories: { value: "50" }, manualFoodProtein: { value: "2" }, manualFoodCarbs: { value: "6.5" }, manualFoodFat: { value: "1" } },
    logScannedFoods(foods) { committed = foods; } };
  vm.runInNewContext(functionSource("addSimpleScannedFoods") + "\naddSimpleScannedFoods();", c);
  assert.equal(committed[0].amount, 0.5);
  assert.equal(committed[0].calories, 50);
  assert.equal(committed[0].carbs, 6.5);
});
