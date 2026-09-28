const normalized = value => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export function foodNameMatch(name, query) {
  const text = normalized(name), term = normalized(query);
  if (!term) return 0;
  if (text === term) return 3;
  if (text.startsWith(term)) return 2;
  if (text.includes(term)) return 1;
  return 0;
}

// Name quality is the primary ordering key, never a provider or portion bonus.
// Existing identity helpers supply local priority without changing deduplication.
export function rankFoodMatches(foods, query, localPriority = () => 0) {
  if (!normalized(query)) return [...foods];
  return foods.map((food, index) => ({ food, index, match: foodNameMatch(food.name, query), local: localPriority(food) }))
    .sort((a, b) => b.match - a.match || b.local - a.local || a.index - b.index)
    .map(item => item.food);
}

export function foodBrandLabel(food) {
  const brand = String(food?.brand || "").trim();
  const provenance = normalized(food?.source || food?.nutritionSource);
  return normalized(brand) === provenance || ["usda", "open food facts", "saved", "recent", "my foods", "manual"].includes(normalized(brand)) ? "" : brand;
}

export function foodActionLabel(meal, editing = false) {
  if (editing) return "Save changes";
  const label = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" }[meal];
  return label ? `Add to ${label}` : "Add food";
}

export function foodResultMetadata(food, serving, source) {
  return [serving, foodBrandLabel(food), source].map(value => String(value || '').trim()).filter(Boolean).join(' · ');
}

export function foodSearchErrorMessage(error) {
  if (error instanceof TypeError || /failed to fetch|network|load failed/i.test(error?.message || "")) {
    return "Couldn't connect to food sources. Check your connection and try again.";
  }
  return error?.message || "Food sources are temporarily unavailable. Try again or add this food manually.";
}
