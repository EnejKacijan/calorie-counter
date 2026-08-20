import assert from "node:assert/strict";
import test from "node:test";

await import("../public/food-reuse.js");

const reuse = globalThis.IntakeFoodReuse;

function sampleFood(overrides = {}) {
  return {
    id: "diary-source-1",
    catalogId: "usda-123",
    name: "Example food",
    displayName: "Example food, cooked",
    amount: 200,
    unit: "g",
    serving: "200 g",
    servingGrams: 200,
    meal: "lunch",
    calories: 320,
    protein: 42,
    carbs: 14,
    fat: 9,
    source: "USDA",
    nutritionSource: "USDA FoodData Central",
    nutritionOverridden: true,
    aiEstimate: { confidence: 0.78, inputMode: "text", qualifiers: ["cooked"] },
    loggedAt: "2026-08-18T08:15:42.000Z",
    createdAt: "2026-08-18T08:15:42.000Z",
    updatedAt: "2026-08-18T09:00:00.000Z",
    loggedForDate: "2026-08-18",
    ...overrides,
  };
}

test("cloneFoodEntries creates independent diary records on the target date", () => {
  const source = sampleFood();
  const original = structuredClone(source);
  const [copy] = reuse.cloneFoodEntries([source], {
    targetDate: "2026-08-19",
    sourceDate: "2026-08-18",
    idFactory: () => "copy-1",
  });

  assert.equal(copy.id, "copy-1");
  assert.equal(copy.loggedForDate, "2026-08-19");
  assert.equal(copy.copiedFromDate, "2026-08-18");
  assert.equal(copy.meal, "lunch");
  assert.equal(new Date(copy.loggedAt).getHours(), new Date(source.loggedAt).getHours());
  assert.equal(new Date(copy.loggedAt).getMinutes(), new Date(source.loggedAt).getMinutes());
  assert.deepEqual(source, original);

  copy.aiEstimate.qualifiers.push("changed-copy-only");
  assert.deepEqual(source.aiEstimate.qualifiers, ["cooked"]);
});

test("shared cloning preserves manual, structured-source, and AI snapshot fields", () => {
  const entries = [
    sampleFood({ id: "manual", catalogId: "", source: "Manual", manualNutritionOverride: { calories: 333 } }),
    sampleFood({ id: "usda", source: "USDA", catalogId: "fdc-987" }),
    sampleFood({ id: "ai", source: "AI ESTIMATE", catalogId: "", resolvedFoodName: "Food, cooked" }),
  ];
  let nextId = 0;
  const copies = reuse.cloneFoodEntries(entries, {
    targetDate: "2026-08-20",
    idFactory: () => `copy-${++nextId}`,
  });

  assert.equal(copies[0].manualNutritionOverride.calories, 333);
  assert.equal(copies[1].catalogId, "fdc-987");
  assert.equal(copies[2].source, "AI ESTIMATE");
  assert.equal(copies[2].resolvedFoodName, "Food, cooked");
  assert.deepEqual(copies.map((food) => food.id), ["copy-1", "copy-2", "copy-3"]);
});

test("a meal repeat can override the target meal without changing nutrition", () => {
  const source = sampleFood({ meal: "breakfast" });
  const [copy] = reuse.cloneFoodEntries([source], {
    targetDate: "2026-08-19",
    targetMeal: "dinner",
    idFactory: () => "dinner-copy",
  });
  assert.equal(copy.meal, "dinner");
  assert.equal(copy.calories, source.calories);
  assert.equal(copy.protein, source.protein);
});

test("large diary days clone every entry with a unique ID", () => {
  const entries = Array.from({ length: 24 }, (_, index) => sampleFood({ id: `source-${index}`, name: `Food ${index}` }));
  let nextId = 0;
  const copies = reuse.cloneFoodEntries(entries, {
    targetDate: "2026-08-21",
    idFactory: () => `new-${++nextId}`,
  });
  assert.equal(copies.length, 24);
  assert.equal(new Set(copies.map((food) => food.id)).size, 24);
});

test("Saved Meals are immutable snapshots independent of source and logged copies", () => {
  const source = sampleFood();
  const savedMeal = reuse.createSavedMeal({
    id: "meal-1",
    name: "Lunch staple",
    meal: "lunch",
    foods: [source],
  });
  source.calories = 999;
  assert.equal(savedMeal.foods[0].calories, 320);
  assert.equal(savedMeal.foods[0].id, undefined);
  assert.equal(savedMeal.meal, "lunch");
  assert.deepEqual(savedMeal.foods[0].aiEstimate, { confidence: 0.78, inputMode: "text", qualifiers: ["cooked"] });

  const [loggedCopy] = reuse.cloneFoodEntries(savedMeal.foods, {
    targetDate: "2026-08-22",
    idFactory: () => "logged-copy",
  });
  loggedCopy.calories = 111;
  assert.equal(savedMeal.foods[0].calories, 320);
});

test("meal grouping is generic and calculates summaries from diary data", () => {
  const groups = reuse.groupFoodEntriesByMeal([
    sampleFood({ id: "a", meal: "breakfast", calories: 100 }),
    sampleFood({ id: "b", meal: "breakfast", calories: 250 }),
    sampleFood({ id: "c", meal: "snack", calories: 90 }),
  ]);
  assert.deepEqual(groups.map(({ meal, foods, calories }) => ({ meal, count: foods.length, calories })), [
    { meal: "breakfast", count: 2, calories: 350 },
    { meal: "snack", count: 1, calories: 90 },
  ]);
});

test("duplicate Saved Meal names remain separate because identity is the unique ID", () => {
  const first = reuse.createSavedMeal({ id: "meal-a", name: "Same name", foods: [sampleFood()] });
  const second = reuse.createSavedMeal({ id: "meal-b", name: "Same name", foods: [sampleFood()] });
  assert.equal(first.name, second.name);
  assert.notEqual(first.id, second.id);
});

test("Saved Meal names are suggested generically from reviewed food items", () => {
  assert.equal(
    reuse.suggestSavedMealName([
      { name: "Grilled pork chop" },
      { name: "Brussels sprouts and onions salad" },
    ]),
    "Pork chop & Brussels sprouts",
  );
  assert.equal(
    reuse.suggestSavedMealName([
      { name: "Roasted vegetables" },
      { name: "Brown rice" },
      { name: "Tahini sauce" },
    ]),
    "Vegetables & Brown rice & more",
  );
});
