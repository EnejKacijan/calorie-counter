(function attachScannedFoodHelpers(root) {
  const MAX_AMOUNT = 10_000;

  function parseDecimalAmount(value) {
    const text = String(value ?? "").trim();
    if (!text || text === "." || text === ",") return { state: "partial", value: null };
    if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return { state: "invalid", value: null };
    const parsed = Number(text.replace(",", "."));
    if (!Number.isFinite(parsed)) return { state: "invalid", value: null };
    return { state: "valid", value: parsed };
  }

  function amountError(value, { max = MAX_AMOUNT } = {}) {
    const parsed = typeof value === "number" ? { state: "valid", value } : parseDecimalAmount(value);
    if (parsed.state !== "valid") return "Enter a valid amount.";
    if (parsed.value <= 0) return "Enter an amount greater than zero.";
    if (parsed.value > max) return `Enter an amount no greater than ${max}.`;
    return "";
  }

  function portionMultiplier({ amount, unit, servingGrams, servingMl }) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (unit === "g" || unit === "ml") {
      const referenceAmount = Number(unit === "g" ? servingGrams : servingMl);
      return referenceAmount > 0 ? amount / referenceAmount : 0;
    }
    return amount;
  }

  function scaleNutrition(baseNutrition, multiplier) {
    return Object.fromEntries(["calories", "protein", "carbs", "fat"].map((key) => [
      key,
      Math.round(Math.max(0, Number(baseNutrition?.[key] || 0)) * Math.max(0, multiplier) * 10) / 10,
    ]));
  }

  function rebaseNutrition(totalNutrition, multiplier) {
    const divisor = Math.max(0.0001, Number(multiplier || 0));
    return Object.fromEntries(["calories", "protein", "carbs", "fat"].map((key) => [
      key,
      Math.round((Math.max(0, Number(totalNutrition?.[key] || 0)) / divisor) * 10) / 10,
    ]));
  }

  function storedFoodNutritionBasis(food) {
    const amount = Number(food?.lastUsedAmount || 0);
    const unit = ["serving", "piece", "g", "ml"].includes(food?.lastUsedUnit) ? food.lastUsedUnit : "serving";
    const multiplier = amount > 0 ? portionMultiplier({
      amount,
      unit,
      servingGrams: food?.servingGrams,
      servingMl: food?.servingMl,
    }) : 1;
    return rebaseNutrition(food, multiplier > 0 ? multiplier : 1);
  }

  function normalizeScannedFoodEstimate(food, inputMode = "photo") {
    const servingGrams = Math.max(0, Number(food?.servingGrams || (food?.unit === "g" ? food?.amount : 0)) || 0);
    const unit = ["serving", "piece", "g", "ml"].includes(food?.unit) ? food.unit : "serving";
    const amount = Math.max(0.1, Number(food?.amount || (unit === "g" ? servingGrams : 1)) || 1);
    const servingMl = Math.max(0, Number(food?.servingMl || (unit === "ml" ? amount : 0)) || 0);
    const nutrients = Object.fromEntries(["calories", "protein", "carbs", "fat"].map((key) => [
      key,
      Math.max(0, Number(food?.[key] || 0)),
    ]));
    const initialMultiplier = unit === "g"
      ? amount / (servingGrams || 100)
      : amount;
    const baseNutrition = Object.fromEntries(Object.entries(nutrients).map(([key, value]) => [
      key,
      Math.round((value / Math.max(0.1, initialMultiplier)) * 10) / 10,
    ]));

    return {
      amount,
      unit,
      servingGrams,
      servingMl,
      ...nutrients,
      baseNutrition,
    };
  }

  function simplePlatePortion(foods) {
    if (!Array.isArray(foods) || foods.length !== 1) {
      return { amount: 1, unit: "serving", initialMultiplier: 1 };
    }

    const food = foods[0];
    const amount = Math.max(0.1, Number(food.amount || 1));
    const unit = ["serving", "piece", "g", "ml"].includes(food.unit) ? food.unit : "serving";
    const servingGrams = Math.max(0, Number(food.servingGrams || 0));
    const initialMultiplier = unit === "g" ? amount / (servingGrams || 100) : amount;

    return { amount, unit, initialMultiplier: Math.max(0.1, initialMultiplier) };
  }

  root.IntakeScannedFood = Object.freeze({
    MAX_AMOUNT,
    parseDecimalAmount,
    amountError,
    portionMultiplier,
    scaleNutrition,
    rebaseNutrition,
    storedFoodNutritionBasis,
    normalizeScannedFoodEstimate,
    simplePlatePortion,
  });
})(globalThis);
