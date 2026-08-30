(function attachScannedFoodHelpers(root) {
  function normalizeScannedFoodEstimate(food, inputMode = "photo") {
    const servingGrams = Math.max(0, Number(food?.servingGrams || (food?.unit === "g" ? food?.amount : 0)) || 0);
    const unit = ["serving", "piece", "g", "ml"].includes(food?.unit) ? food.unit : "serving";
    const amount = Math.max(0.1, Number(food?.amount || (unit === "g" ? servingGrams : 1)) || 1);
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

  root.IntakeScannedFood = Object.freeze({ normalizeScannedFoodEstimate, simplePlatePortion });
})(globalThis);
