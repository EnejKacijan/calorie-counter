const meals = ["breakfast", "lunch", "dinner", "snack"];
export const diaryMealLabel = meal => ({ breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" })[meal] || "Snack";

// The current schedule has breakfast/lunch time boundaries, not a reorder setting.
// Display existing tags chronologically; never reclassify food from timestamps.
export function groupDiaryFoods(entries) {
  const groups = new Map(meals.map(meal => [meal, { meal, foods: [], calories: 0 }]));
  for (const food of entries) {
    const tag = String(food.meal || "").trim().toLowerCase();
    const group = groups.get(tag) || groups.get("snack");
    group.foods.push(food);
    group.calories += Number(food.calories || 0);
  }
  return [...groups.values()].filter(group => group.foods.length);
}

export function latestReusableDay(days, selectedDate) {
  return Object.keys(days).filter(date => date < selectedDate && days[date]?.foods?.length).sort().at(-1) || "";
}
