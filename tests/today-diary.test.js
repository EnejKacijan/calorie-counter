import test from "node:test";
import assert from "node:assert/strict";
import { groupDiaryFoods, latestReusableDay, diaryMealLabel } from "../public/today-diary.js";
await import("../public/meal-schedule.js");

test("empty diary has no meal groups; one meal includes its subtotal", () => {
  assert.deepEqual(groupDiaryFoods([]), []);
  const foods = [{ id: "a", meal: "lunch", calories: 150 }, { id: "b", meal: "lunch", calories: 220.5 }];
  assert.deepEqual(groupDiaryFoods(foods), [{ meal: "lunch", foods, calories: 370.5 }]);
});
test("groups are chronological without reordering entries within a meal or mutating diary", () => {
  const foods = [
    { id: "d", meal: "dinner", calories: 400 },
    { id: "b2", meal: "breakfast", calories: 90 },
    { id: "l", meal: "lunch", calories: 300 },
    { id: "b1", meal: "breakfast", calories: 110 },
  ];
  const before = JSON.stringify(foods);
  assert.deepEqual(groupDiaryFoods(foods).map(g => [g.meal, g.calories, g.foods.map(f => f.id)]), [
    ["breakfast", 200, ["b2", "b1"]], ["lunch", 300, ["l"]], ["dinner", 400, ["d"]],
  ]);
  assert.equal(JSON.stringify(foods), before);
  assert.equal(groupDiaryFoods(foods)[0].foods[0], foods[1]);
});
test("missing, unknown and blank meal tags fall back to Snack only for presentation", () => {
  const foods = [{ calories: 10 }, { meal: " ", calories: 20 }, { meal: "custom", calories: 30 }, { meal: "SNACK", calories: 40 }, { meal: " Lunch ", calories: 50 }];
  assert.deepEqual(groupDiaryFoods(foods).map(g => [g.meal, g.calories]), [["lunch", 50], ["snack", 100]]);
  assert.equal(foods[0].meal, undefined); assert.equal(foods[2].meal, "custom");
  assert.equal(diaryMealLabel("snack"), "Snack");
});
test("custom time boundaries still select meals without reclassifying existing diary tags", () => {
  const schedule = { breakfastEnd: "09:00", lunchEnd: "14:00" };
  const tag = globalThis.IntakeMealSchedule.defaultMealForDate(new Date(2026, 8, 11, 10), schedule);
  assert.equal(tag, "lunch");
  const tagged = [{ meal: tag, calories: 100 }, { meal: "breakfast", loggedAt: "2026-09-11T20:00:00", calories: 200 }];
  assert.deepEqual(groupDiaryFoods(tagged).map(g => g.meal), ["breakfast", "lunch"]);
});
test("reuse chooses the latest populated day strictly before the selected historical date", () => {
  const days = { "2026-09-08": { foods: [{}] }, "2026-09-09": { foods: [] }, "2026-09-10": { foods: [{}] }, "2026-09-11": { foods: [{}] } };
  assert.equal(latestReusableDay(days, "2026-09-10"), "2026-09-08");
  assert.equal(latestReusableDay(days, "2026-09-12"), "2026-09-11");
  assert.equal(latestReusableDay(days, "2026-09-08"), "");
});
