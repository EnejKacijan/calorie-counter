import assert from "node:assert/strict";
import test from "node:test";

await import("../public/meal-schedule.js");

const mealSchedule = globalThis.IntakeMealSchedule;

function localTime(hours, minutes) {
  return new Date(2026, 7, 21, hours, minutes, 0, 0);
}

test("default boundaries preserve the existing automatic meal behavior", () => {
  assert.equal(mealSchedule.defaultMealForDate(localTime(10, 59)), "breakfast");
  assert.equal(mealSchedule.defaultMealForDate(localTime(11, 0)), "lunch");
  assert.equal(mealSchedule.defaultMealForDate(localTime(15, 59)), "lunch");
  assert.equal(mealSchedule.defaultMealForDate(localTime(16, 0)), "dinner");
});

test("custom boundaries change only the automatic meal result", () => {
  const custom = { breakfastEnd: "09:30", lunchEnd: "14:15" };
  assert.equal(mealSchedule.defaultMealForDate(localTime(9, 29), custom), "breakfast");
  assert.equal(mealSchedule.defaultMealForDate(localTime(9, 30), custom), "lunch");
  assert.equal(mealSchedule.defaultMealForDate(localTime(14, 15), custom), "dinner");
});

test("invalid or reversed boundaries safely fall back to defaults", () => {
  assert.deepEqual(
    mealSchedule.normalizeMealSchedule({ breakfastEnd: "17:00", lunchEnd: "12:00" }),
    { breakfastEnd: "11:00", lunchEnd: "16:00" },
  );
  assert.equal(mealSchedule.isValidMealSchedule({ breakfastEnd: "11:00", lunchEnd: "11:00" }), false);
  assert.equal(mealSchedule.defaultMealForDate(localTime(12, 0), { breakfastEnd: "bad", lunchEnd: "14:00" }), "lunch");
});

test("automatic selection never invents the manually selected Snack category", () => {
  const custom = { breakfastEnd: "08:00", lunchEnd: "13:00" };
  const meals = [0, 7, 8, 12, 13, 23].map((hour) => mealSchedule.defaultMealForDate(localTime(hour, 0), custom));
  assert.equal(meals.includes("snack"), false);
});
