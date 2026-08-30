import test from "node:test";
import assert from "node:assert/strict";

await import("../public/scanned-food.js");

const { normalizeScannedFoodEstimate, simplePlatePortion } = globalThis.IntakeScannedFood;

test("photo estimates preserve multiple AI-detected servings", () => {
  const food = normalizeScannedFoodEstimate({
    name: "Vegetable pizza",
    amount: 2,
    unit: "serving",
    servingGrams: 600,
    calories: 1200,
    protein: 48,
    carbs: 150,
    fat: 44,
  }, "photo");

  assert.equal(food.amount, 2);
  assert.equal(food.unit, "serving");
  assert.equal(food.calories, 1200);
  assert.equal(food.baseNutrition.calories, 600);
});

test("photo gram estimates keep nutrition for the full detected weight", () => {
  const food = normalizeScannedFoodEstimate({
    amount: 250,
    unit: "g",
    servingGrams: 250,
    calories: 400,
    protein: 15,
    carbs: 45,
    fat: 12,
  }, "photo");

  assert.equal(food.amount, 250);
  assert.equal(food.baseNutrition.calories, 400);
});

test("simple photo review starts at the detected serving count", () => {
  const portion = simplePlatePortion([{ amount: 2, unit: "serving", servingGrams: 600 }]);

  assert.deepEqual(portion, { amount: 2, unit: "serving", initialMultiplier: 2 });
});

test("a mixed scanned plate remains one combined serving", () => {
  const portion = simplePlatePortion([
    { amount: 2, unit: "serving", servingGrams: 600 },
    { amount: 1, unit: "serving", servingGrams: 100 },
  ]);

  assert.deepEqual(portion, { amount: 1, unit: "serving", initialMultiplier: 1 });
});
