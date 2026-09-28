import test from "node:test";
import assert from "node:assert/strict";

await import("../public/scanned-food.js");

const {
  normalizeScannedFoodEstimate,
  simplePlatePortion,
  parseDecimalAmount,
  amountError,
  portionMultiplier,
  scaleNutrition,
  rebaseNutrition,
  storedFoodNutritionBasis,
} = globalThis.IntakeScannedFood;

test("locale decimal amounts preserve dot, comma, and temporary empty input", () => {
  assert.deepEqual(parseDecimalAmount("0.5"), { state: "valid", value: 0.5 });
  assert.deepEqual(parseDecimalAmount("0,5"), { state: "valid", value: 0.5 });
  assert.deepEqual(parseDecimalAmount(""), { state: "partial", value: null });
  assert.deepEqual(parseDecimalAmount(","), { state: "partial", value: null });
  assert.equal(parseDecimalAmount("1,2.3").state, "invalid");
});

test("amount validation rejects zero, negatives, NaN, and extreme values", () => {
  assert.match(amountError("0"), /greater than zero/i);
  assert.match(amountError("-1"), /valid amount/i);
  assert.match(amountError("NaN"), /valid amount/i);
  assert.match(amountError("10001"), /no greater than 10000/i);
  assert.equal(amountError("10000"), "");
});

test("one serving basis scales through 2, 1, and 0.5 without drift", () => {
  const basis = { calories: 100, protein: 10, carbs: 20, fat: 5 };
  assert.deepEqual(scaleNutrition(basis, portionMultiplier({ amount: 2, unit: "serving" })), {
    calories: 200,
    protein: 20,
    carbs: 40,
    fat: 10,
  });
  assert.deepEqual(scaleNutrition(basis, portionMultiplier({ amount: 1, unit: "serving" })), basis);
  assert.deepEqual(scaleNutrition(basis, portionMultiplier({ amount: 0.5, unit: "serving" })), {
    calories: 50,
    protein: 5,
    carbs: 10,
    fat: 2.5,
  });
});

test("entry totals survive persistence and reopen with the same per-serving basis", () => {
  const basis = { calories: 100, protein: 10, carbs: 20, fat: 5 };
  const amount = 2;
  const multiplier = portionMultiplier({ amount, unit: "serving" });
  const entry = JSON.parse(JSON.stringify({
    amount,
    unit: "serving",
    ...scaleNutrition(basis, multiplier),
  }));
  const reopenedBasis = rebaseNutrition(entry, portionMultiplier(entry));

  assert.deepEqual(reopenedBasis, basis);
  assert.deepEqual(scaleNutrition(reopenedBasis, portionMultiplier({ amount: 0.5, unit: "serving" })), {
    calories: 50,
    protein: 5,
    carbs: 10,
    fat: 2.5,
  });
});

test("reopening a Recent or Saved food does not multiply its last-used amount twice", () => {
  const storedFood = {
    lastUsedAmount: 2,
    lastUsedUnit: "serving",
    servingGrams: 32,
    calories: 200,
    protein: 20,
    carbs: 40,
    fat: 10,
  };
  const basis = storedFoodNutritionBasis(storedFood);
  const reopenedTotals = scaleNutrition(basis, portionMultiplier({
    amount: storedFood.lastUsedAmount,
    unit: storedFood.lastUsedUnit,
    servingGrams: storedFood.servingGrams,
  }));

  assert.deepEqual(basis, { calories: 100, protein: 10, carbs: 20, fat: 5 });
  assert.deepEqual(reopenedTotals, { calories: 200, protein: 20, carbs: 40, fat: 10 });
});

test("gram conversion only scales when a real reference amount exists", () => {
  assert.equal(portionMultiplier({ amount: 200, unit: "g", servingGrams: 100 }), 2);
  assert.equal(portionMultiplier({ amount: 200, unit: "g", servingGrams: null }), 0);
  assert.equal(portionMultiplier({ amount: 480, unit: "ml", servingMl: 240 }), 2);
  assert.equal(portionMultiplier({ amount: 240, unit: "ml", servingMl: null }), 0);
});

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
