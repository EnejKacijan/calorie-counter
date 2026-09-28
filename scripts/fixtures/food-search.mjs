// Recent ordering must describe actual recency, not normalization-time Date().
export const food = (id, name, extra = {}) => ({ id, catalogId: id, name, source: "USDA", serving: "100 g", servingGrams: 100, calories: 100, protein: 10, carbs: 20, fat: 2, ...extra });
export const localRice = food("usda-local-rice", "Rice", {
  savedAt: "2026-09-09T12:00:00.000Z", lastUsedAt: "2026-09-09T12:00:00.000Z",
  lastUsedAmount: 150, lastUsedUnit: "g", calories: 150, protein: 15, carbs: 30, fat: 3,
});
export const milk = food("off-milk", "Oat drink", {
  savedAt: "2026-09-09T08:00:00.000Z", lastUsedAt: "2026-09-09T08:00:00.000Z",
  source: "Open Food Facts", brand: "Sample Oats", serving: "250 ml", servingGrams: null, servingMl: 250, calories: 120, protein: 3, carbs: 15, fat: 4,
});
