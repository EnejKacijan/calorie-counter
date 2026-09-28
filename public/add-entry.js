// Shared by the two Add forms; no estimation or portion formula lives here.
export function decimalValue(raw, optional = false) {
  const text = String(raw ?? '').trim();
  if (!text && optional) return 0;
  return /^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : NaN;
}
export function validateFoodEntry(values, amountError) {
  const errors = {};
  if (!values.name.trim()) errors.manualFoodName = 'Enter a food name.';
  const amount = amountError(values.amount);
  if (amount) errors.foodAmount = amount;
  for (const key of ['calories', 'protein', 'carbs', 'fat']) {
    const value = decimalValue(values[key], key !== 'calories');
    if (!Number.isFinite(value) || value < 0 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-7)
      errors['manualFood' + key[0].toUpperCase() + key.slice(1)] = 'Enter 0 or more, with up to one decimal place.';
  }
  return errors;
}
export function validateExerciseEntry(values) {
  const errors = {}, minutes = decimalValue(values.minutes), calories = decimalValue(values.calories);
  if (!Number.isInteger(minutes) || minutes < 1) errors.exerciseMinutes = 'Enter at least 1 whole minute.';
  if (!Number.isFinite(calories) || calories < 0) errors.exerciseCalories = 'Enter calories of 0 or more.';
  return errors;
}
export function commitDiaryDay(storage, state, day) {
  const next = { ...state, days: { ...state.days, [state.selectedDate]: day } };
  const value = JSON.stringify(next);
  if (storage.setItemConfirmed) storage.setItemConfirmed('calorie-counter-state', value);
  else storage.setItem('calorie-counter-state', value);
  return next; // Callers publish state/feedback only after the write succeeds.
}
