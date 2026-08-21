import assert from "node:assert/strict";
import test from "node:test";

await import("../public/food-persistence.js");

const persistence = globalThis.IntakeFoodPersistence;

function recentFood(index, overrides = {}) {
  return {
    catalogId: `usda-${index}`,
    name: `Food ${index}`,
    source: "USDA",
    lastUsedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    useCount: 1,
    ...overrides,
  };
}

test("keeps five Recent Foods ordered by newest use", () => {
  const foods = persistence.uniqueRecentFoods(Array.from({ length: 5 }, (_, index) => recentFood(index)));
  assert.equal(foods.length, 5);
  assert.equal(foods[0].catalogId, "usda-4");
});

test("keeps at most 100 unique Recent Foods and prunes the least recently used", () => {
  const firstHundred = Array.from({ length: 100 }, (_, index) => recentFood(index));
  const withOneMore = persistence.updateRecentFoods(firstHundred, [recentFood(100)], {
    now: "2026-02-01T00:00:00.000Z",
  });

  assert.equal(withOneMore.length, 100);
  assert.equal(withOneMore[0].catalogId, "usda-100");
  assert.equal(withOneMore.some((food) => food.catalogId === "usda-0"), false);
});

test("reusing a food moves it to the top, increments useCount, and does not duplicate it", () => {
  const foods = [recentFood(1), recentFood(2), recentFood(3)];
  const updated = persistence.updateRecentFoods(foods, [{ ...recentFood(1), amount: 250, unit: "g" }], {
    now: "2026-03-01T00:00:00.000Z",
  });

  assert.equal(updated.length, 3);
  assert.equal(updated[0].catalogId, "usda-1");
  assert.equal(updated[0].useCount, 2);
  assert.equal(updated[0].amount, 250);
  assert.equal(updated[0].unit, "g");
});

test("manual foods use stable local IDs instead of display-name deduplication", () => {
  const first = { localFoodId: "local-1", name: "Homemade bowl", source: "Manual" };
  const second = { localFoodId: "local-2", name: "Homemade bowl", source: "Manual" };
  const repeatedFirst = { ...first, calories: 450 };
  const foods = persistence.updateRecentFoods([first, second], [repeatedFirst], {
    now: "2026-03-02T00:00:00.000Z",
  });

  assert.equal(foods.length, 2);
  assert.equal(foods[0].localFoodId, "local-1");
  assert.equal(foods[0].calories, 450);
});

test("identical photo estimates reuse one stable Recent record and move it to the top", () => {
  const estimate = {
    name: "Grilled pork chop",
    resolvedFoodName: "Grilled pork chop",
    source: "PHOTO ESTIMATE",
    nutritionSource: "AI estimate",
    serving: "1 serving",
    servingGrams: 180,
    calories: 450,
    protein: 48,
    carbs: 0,
    fat: 27,
    aiEstimate: { inputMode: "photo" },
  };
  const oldDuplicates = [
    { ...estimate, aiEstimate: undefined, localFoodId: "old-random-a", lastUsedAt: "2026-01-01T00:00:00.000Z", useCount: 1 },
    { ...estimate, aiEstimate: undefined, localFoodId: "old-random-b", lastUsedAt: "2026-01-02T00:00:00.000Z", useCount: 1 },
  ];
  const migrated = persistence.uniqueRecentFoods(oldDuplicates);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].useCount, 2);
  assert.ok(migrated[0].reusableFoodId.startsWith("estimate-photo-"));

  const reused = persistence.updateRecentFoods(migrated, [estimate], {
    now: "2026-04-03T00:00:00.000Z",
  });
  assert.equal(reused.length, 1);
  assert.equal(reused[0].useCount, 3);
  assert.equal(reused[0].lastUsedAt, "2026-04-03T00:00:00.000Z");
});

test("photo estimates with the same name but incompatible snapshots stay separate", () => {
  const base = {
    name: "Grilled pork chop",
    source: "PHOTO ESTIMATE",
    serving: "1 serving",
    calories: 450,
    protein: 48,
    carbs: 0,
    fat: 27,
    aiEstimate: { inputMode: "photo" },
  };
  assert.equal(persistence.uniqueRecentFoods([base, { ...base, calories: 620, fat: 40 }]).length, 2);
});

test("USDA, Open Food Facts, AI/local, and manual identities remain distinct", () => {
  const foods = persistence.uniqueRecentFoods([
    { catalogId: "123", name: "Milk", source: "USDA" },
    { sourceId: "123", name: "Milk", source: "Open Food Facts" },
    { localFoodId: "ai-789", name: "Milk", source: "AI estimate" },
    { localFoodId: "manual-321", name: "Milk", source: "Manual" },
  ]);
  assert.equal(foods.length, 4);
});

test("Saved Foods have no artificial collection limit", () => {
  const saved = persistence.uniqueSavedFoods(Array.from({ length: 150 }, (_, index) => ({
    ...recentFood(index),
    savedAt: new Date(Date.UTC(2026, 2, 1, 0, index)).toISOString(),
  })));
  assert.equal(saved.length, 150);
});

test("Saved Meals have no artificial collection limit", () => {
  const meals = Array.from({ length: 150 }, (_, index) => ({
    id: `meal-${index}`,
    name: `Meal ${index}`,
    foods: [{ localFoodId: `meal-food-${index}`, name: `Meal food ${index}` }],
  }));
  assert.equal(persistence.prepareSavedMeals(meals).length, 150);
});

test("Recent pruning does not mutate diary history or Saved Foods", () => {
  const diary = [{ id: "diary-1", catalogId: "usda-0", name: "Saved item", source: "USDA", calories: 200 }];
  const diarySnapshot = structuredClone(diary);
  const saved = persistence.uniqueSavedFoods([{ ...diary[0], savedAt: "2026-01-01T00:00:00.000Z" }]);
  const recents = Array.from({ length: 100 }, (_, index) => recentFood(index));
  const updated = persistence.updateRecentFoods(recents, [recentFood(101)], {
    now: "2026-04-01T00:00:00.000Z",
  });

  assert.equal(updated.length, 100);
  assert.equal(updated.some((food) => food.catalogId === "usda-0"), false);
  assert.deepEqual(diary, diarySnapshot);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].catalogId, "usda-0");
});

test("legacy records receive a deterministic stable ID across reloads", () => {
  const legacy = { name: "Old local food", brand: "Home", source: "Manual", calories: 123 };
  const firstLoad = persistence.ensureStableFoodIdentity(legacy);
  const nextLoad = persistence.ensureStableFoodIdentity(legacy);
  assert.ok(firstLoad.localFoodId.startsWith("legacy-"));
  assert.equal(firstLoad.localFoodId, nextLoad.localFoodId);
});

test("Recent ordering and identity survive a persisted JSON round trip", () => {
  const stored = persistence.updateRecentFoods([], [
    { localFoodId: "local-a", name: "A" },
    { catalogId: "usda-42", name: "B", source: "USDA" },
  ], { now: "2026-04-02T00:00:00.000Z" });
  const reloaded = persistence.uniqueRecentFoods(JSON.parse(JSON.stringify(stored)));
  assert.deepEqual(reloaded, stored);
});

test("direct diary logs use current time today and boundary times on other selected dates", () => {
  const now = new Date(2026, 7, 15, 14, 37, 24, 123);
  const today = new Date(persistence.timestampForNewDiaryEntry("2026-08-15", { now }));
  const past = new Date(persistence.timestampForNewDiaryEntry("2026-08-14", { now }));
  const future = new Date(persistence.timestampForNewDiaryEntry("2026-08-16", { now }));

  assert.equal(today.getTime(), now.getTime());
  assert.deepEqual(
    [past.getFullYear(), past.getMonth(), past.getDate(), past.getHours(), past.getMinutes()],
    [2026, 7, 14, 23, 59],
  );
  assert.deepEqual(
    [future.getFullYear(), future.getMonth(), future.getDate(), future.getHours(), future.getMinutes()],
    [2026, 7, 16, 0, 0],
  );
});
