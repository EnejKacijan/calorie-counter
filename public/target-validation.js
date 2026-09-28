// Shared with Profile: preserve its existing ranges, steps and messages.
export const targetKeys = ["calories", "protein", "carbs", "fat"];
export const targetNumber = value => /^\d+(?:[.,]\d+)?$/.test(String(value ?? "").trim()) ? Number(String(value).trim().replace(",", ".")) : NaN;
export function validateTargets(goals) {
  const errors = {};
  for (const key of targetKeys) {
    const value = targetNumber(goals?.[key]);
    if (!Number.isFinite(value) || value < (key === "calories" ? 1200 : 0) || !Number.isInteger(value) || key === "calories" && value % 50 !== 0)
      errors[key] = key === "calories" ? "Enter at least 1200 kcal, in steps of 50." : "Enter zero or a positive whole number.";
  }
  return errors;
}
