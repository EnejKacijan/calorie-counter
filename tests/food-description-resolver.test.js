import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeFoodDescription,
  analyzeFoodImage,
  evaluateStructuredCandidate,
  extractPortionHints,
} from "../server/food-image-analysis.js";

function parsedFood(overrides = {}) {
  return {
    name: "Test food",
    searchQuery: "test food",
    amount: 1,
    unit: "serving",
    servingGrams: 100,
    qualifiers: "",
    fallbackCalories: 180,
    fallbackProtein: 12,
    fallbackCarbs: 20,
    fallbackFat: 6,
    ...overrides,
  };
}

function parsedResponse(foods, overrides = {}) {
  return {
    foods,
    confidence: "medium",
    notes: "",
    ...overrides,
  };
}

function aiFetch(result) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ output_text: JSON.stringify(result) }),
  });
}

function candidate(overrides = {}) {
  return {
    id: "source-1",
    name: "Test food",
    brand: "",
    source: "USDA",
    serving: "100 g",
    servingGrams: 100,
    calories: 100,
    protein: 10,
    carbs: 5,
    fat: 4,
    ...overrides,
  };
}

test("extracts compact, spaced, long-form, and kilogram quantities", () => {
  const cases = [
    ["chicken 200g raw", 200, "g"],
    ["chicken 200 g raw", 200, "g"],
    ["chicken 200 grams raw", 200, "g"],
    ["chicken 200 gram raw", 200, "g"],
    ["chicken 0.2kg raw", 200, "g"],
    ["whole milk 250 ml", 250, "ml"],
  ];
  cases.forEach(([description, amount, unit]) => {
    const [hint] = extractPortionHints(description);
    assert.equal(hint.amount, amount, description);
    assert.equal(hint.unit, unit, description);
  });
});

test("extracts a generic discrete count without a food allowlist", () => {
  const [hint] = extractPortionHints("2 eggs");
  assert.equal(hint.amount, 2);
  assert.equal(hint.unit, "piece");
});

test("raw compatible structured candidate is accepted and cooked candidate is rejected", () => {
  const raw = evaluateStructuredCandidate(candidate({ name: "Chicken breast, meat only, raw" }), "chicken breast raw");
  const cooked = evaluateStructuredCandidate(candidate({ name: "Chicken breast, cooked, roasted" }), "chicken breast raw");
  assert.equal(raw.accepted, true);
  assert.equal(cooked.accepted, false);
  assert.ok(cooked.reasons.includes("raw_state_not_supported"));
});

test("unsupported processing and brand-only identity cannot establish a match", () => {
  const processed = evaluateStructuredCandidate(candidate({ name: "Beef, corned, brisket" }), "beef");
  const isolatedComponent = evaluateStructuredCandidate(candidate({ name: "Beef, retail cuts, separable fat, raw" }), "beef");
  const brandOnly = evaluateStructuredCandidate(candidate({ name: "Minute Maid lemonade", brand: "The Coca-Cola Company" }), "Coke cola");
  const alcoholicModifier = evaluateStructuredCandidate(candidate({ name: "Rum and diet cola" }), "diet cola");
  assert.equal(processed.accepted, false);
  assert.ok(processed.reasons.some((reason) => reason.includes("processing") || reason.includes("cut")));
  assert.equal(isolatedComponent.accepted, false);
  assert.ok(isolatedComponent.reasons.includes("unsupported_composition_qualifier"));
  assert.equal(brandOnly.accepted, false);
  assert.ok(brandOnly.reasons.includes("food_identity_mismatch"));
  assert.equal(alcoholicModifier.accepted, false);
  assert.ok(alcoholicModifier.reasons.includes("unsupported_alcohol_qualifier"));
});

test("diet and preparation qualifiers accept compatible candidates", () => {
  assert.equal(evaluateStructuredCandidate(
    candidate({ name: "Coca-Cola, diet cola" }),
    "Coke cola diet",
  ).accepted, true);
  assert.equal(evaluateStructuredCandidate(
    candidate({ name: "Chicken breast, fried" }),
    "fried chicken breast",
  ).accepted, true);
});

test("explicit 200 g portion overrides parser drift and structured nutrition is scaled mathematically", async () => {
  const analysis = await analyzeFoodDescription("chicken breast 200g raw", {
    openAiApiKey: "test-key",
    fetchFn: aiFetch(parsedResponse([parsedFood({
      name: "Chicken breast, raw",
      searchQuery: "chicken breast raw",
      amount: 1,
      unit: "serving",
      servingGrams: 120,
      qualifiers: "raw",
      fallbackCalories: 240,
      fallbackProtein: 45,
      fallbackCarbs: 0,
      fallbackFat: 5,
    })])),
    searchFoodsFn: async () => [candidate({
      id: "raw-breast",
      name: "Chicken breast, meat only, raw",
      servingGrams: 100,
      calories: 120,
      protein: 22,
      carbs: 0,
      fat: 2.5,
    })],
  });
  const [food] = analysis.foods;
  assert.equal(food.amount, 200);
  assert.equal(food.unit, "g");
  assert.equal(food.servingGrams, 200);
  assert.equal(food.calories, 240);
  assert.equal(food.protein, 44);
  assert.equal(food.nutritionSource, "USDA");
});

test("unsafe structured candidate falls back to AI nutrition instead of failing", async () => {
  const analysis = await analyzeFoodDescription("beef 100g", {
    openAiApiKey: "test-key",
    fetchFn: aiFetch(parsedResponse([parsedFood({
      name: "Beef, cooked",
      searchQuery: "beef generic",
      amount: 100,
      unit: "g",
      servingGrams: 100,
      fallbackCalories: 250,
      fallbackProtein: 26,
      fallbackCarbs: 0,
      fallbackFat: 15,
    })])),
    searchFoodsFn: async () => [candidate({ name: "Beef, corned, brisket" })],
  });
  assert.equal(analysis.foods[0].nutritionSource, "AI estimate");
  assert.equal(analysis.foods[0].calories, 250);
  assert.equal(analysis.foods[0].amount, 100);
});

test("structured provider failure also uses the valid AI fallback", async () => {
  const analysis = await analyzeFoodDescription("banana 120g", {
    openAiApiKey: "test-key",
    fetchFn: aiFetch(parsedResponse([parsedFood({
      name: "Banana",
      searchQuery: "banana",
      fallbackCalories: 107,
      fallbackProtein: 1.3,
      fallbackCarbs: 27,
      fallbackFat: 0.4,
    })])),
    searchFoodsFn: async () => { throw new Error("source unavailable"); },
  });
  assert.equal(analysis.foods[0].nutritionSource, "AI estimate");
  assert.equal(analysis.foods[0].amount, 120);
  assert.equal(analysis.foods[0].unit, "g");
});

test("multiple explicit portions are reconciled to the matching foods", async () => {
  const analysis = await analyzeFoodDescription("200g chicken breast, 150g rice and greek salad", {
    openAiApiKey: "test-key",
    fetchFn: aiFetch(parsedResponse([
      parsedFood({ name: "Chicken breast, cooked", searchQuery: "chicken breast cooked" }),
      parsedFood({ name: "Rice, cooked", searchQuery: "rice cooked" }),
      parsedFood({ name: "Greek salad", searchQuery: "greek salad", servingGrams: 180 }),
    ])),
    searchFoodsFn: async () => [],
  });
  assert.deepEqual(analysis.foods.map(({ amount, unit }) => ({ amount, unit })), [
    { amount: 200, unit: "g" },
    { amount: 150, unit: "g" },
    { amount: 1, unit: "serving" },
  ]);
});

test("clear input matrix preserves quantities and units without food-specific parsing", async () => {
  const cases = [
    ["200 g raw chicken breast", parsedFood({ name: "Chicken breast, raw", searchQuery: "chicken breast raw" }), 200, "g"],
    ["chicken breast 200 g cooked", parsedFood({ name: "Chicken breast, cooked", searchQuery: "chicken breast cooked" }), 200, "g"],
    ["banana 120g", parsedFood({ name: "Banana", searchQuery: "banana" }), 120, "g"],
    ["2 eggs", parsedFood({ name: "Eggs", searchQuery: "eggs", servingGrams: 100 }), 2, "piece"],
    ["250 ml whole milk", parsedFood({ name: "Whole milk", searchQuery: "whole milk", servingGrams: 258 }), 250, "ml"],
    ["100 g cooked rice", parsedFood({ name: "Rice, cooked", searchQuery: "rice cooked" }), 100, "g"],
  ];
  for (const [description, food, expectedAmount, expectedUnit] of cases) {
    const analysis = await analyzeFoodDescription(description, {
      openAiApiKey: "test-key",
      fetchFn: aiFetch(parsedResponse([food])),
      searchFoodsFn: async () => [],
    });
    assert.equal(analysis.foods[0].amount, expectedAmount, description);
    assert.equal(analysis.foods[0].unit, expectedUnit, description);
    assert.equal(analysis.foods[0].nutritionSource, "AI estimate", description);
  }
});

test("compound meal without explicit weights remains multiple editable estimates", async () => {
  const analysis = await analyzeFoodDescription("burger, medium fries and coke", {
    openAiApiKey: "test-key",
    fetchFn: aiFetch(parsedResponse([
      parsedFood({ name: "Burger", searchQuery: "burger" }),
      parsedFood({ name: "Fries, medium", searchQuery: "french fries medium" }),
      parsedFood({ name: "Cola", searchQuery: "Coke cola" }),
    ])),
    searchFoodsFn: async () => [],
  });
  assert.deepEqual(analysis.foods.map((food) => food.name), ["Burger", "Fries, medium", "Cola"]);
  assert.ok(analysis.foods.every((food) => food.nutritionSource === "AI estimate"));
});

test("qualifier safety matrix is generic across state, preparation, and product identity", () => {
  const cases = [
    ["beef", "Beef, raw", true],
    ["raw beef", "Beef, raw", true],
    ["raw beef", "Beef, cooked", false],
    ["Coke cola", "Minute Maid lemonade", false],
    ["diet Coke cola", "Cola, diet", true],
    ["chicken breast", "Chicken breast, breaded and fried", false],
    ["fried chicken breast", "Chicken breast, fried", true],
  ];
  cases.forEach(([query, name, accepted]) => {
    assert.equal(evaluateStructuredCandidate(candidate({ name }), query).accepted, accepted, `${query} -> ${name}`);
  });
});

test("provider parser failure can still reach a compatible structured source without invented nutrition", async () => {
  const analysis = await analyzeFoodDescription("200g raw turkey breast", {
    openAiApiKey: "test-key",
    fetchFn: async () => { throw new Error("parser unavailable"); },
    searchFoodsFn: async () => [candidate({
      id: "raw-turkey",
      name: "Turkey breast, meat only, raw",
      calories: 115,
      protein: 24,
      carbs: 0,
      fat: 1.5,
    })],
  });
  assert.equal(analysis.foods[0].nutritionSource, "USDA");
  assert.equal(analysis.foods[0].amount, 200);
  assert.equal(analysis.foods[0].calories, 230);
});

test("local emergency parser never fabricates nutrition when no structured match exists", async () => {
  await assert.rejects(
    analyzeFoodDescription("200g raw turkey breast", {
      openAiApiKey: "test-key",
      fetchFn: async () => { throw new Error("parser unavailable"); },
      searchFoodsFn: async () => [],
    }),
    (error) => error.status === 502,
  );
});

test("new unseen foods use the same preparation compatibility rules", () => {
  const bakedFish = evaluateStructuredCandidate(candidate({ name: "Salmon, baked" }), "salmon baked");
  const smokedFish = evaluateStructuredCandidate(candidate({ name: "Salmon, smoked" }), "salmon baked");
  const grilledTofu = evaluateStructuredCandidate(candidate({ name: "Tofu, grilled" }), "tofu grilled");
  const breadedTofu = evaluateStructuredCandidate(candidate({ name: "Tofu, breaded, fried" }), "tofu grilled");
  assert.equal(bakedFish.accepted, true);
  assert.equal(smokedFish.accepted, false);
  assert.equal(grilledTofu.accepted, true);
  assert.equal(breadedTofu.accepted, false);
});

test("non-food empty model result and empty input remain errors", async () => {
  await assert.rejects(
    analyzeFoodDescription("purple ideas orbit quickly", {
      openAiApiKey: "test-key",
      fetchFn: aiFetch(parsedResponse([])),
      searchFoodsFn: async () => [],
    }),
    (error) => error.status === 502,
  );
  await assert.rejects(
    analyzeFoodDescription("", { openAiApiKey: "test-key" }),
    (error) => error.status === 400,
  );
});

test("photo analysis rejects unreadably small images before calling the model", async () => {
  let called = false;
  await assert.rejects(
    analyzeFoodImage("data:image/png;base64,AAAA", {
      openAiApiKey: "test-key",
      fetchFn: async () => { called = true; },
    }),
    (error) => error.status === 400,
  );
  assert.equal(called, false);
});

test("photo model non-food decision always normalizes to an empty food list", async () => {
  const sufficientlyLargeImage = `data:image/png;base64,${"A".repeat(600)}`;
  const analysis = await analyzeFoodImage(sufficientlyLargeImage, {
    openAiApiKey: "test-key",
    fetchFn: aiFetch({ containsFood: false, foods: [], confidence: "high", notes: "No food visible." }),
  });
  assert.deepEqual(analysis.foods, []);
  assert.equal(analysis.confidence, "high");
});
