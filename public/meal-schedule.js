(function initializeMealSchedule(globalScope) {
  const DEFAULT_MEAL_SCHEDULE = Object.freeze({
    breakfastEnd: "11:00",
    lunchEnd: "16:00",
  });

  function timeToMinutes(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function isValidMealSchedule(schedule) {
    const breakfastEnd = timeToMinutes(schedule?.breakfastEnd);
    const lunchEnd = timeToMinutes(schedule?.lunchEnd);
    return breakfastEnd !== null && lunchEnd !== null && breakfastEnd < lunchEnd;
  }

  function normalizeMealSchedule(schedule) {
    if (!isValidMealSchedule(schedule)) return { ...DEFAULT_MEAL_SCHEDULE };
    return {
      breakfastEnd: schedule.breakfastEnd,
      lunchEnd: schedule.lunchEnd,
    };
  }

  function defaultMealForDate(date = new Date(), schedule) {
    const normalized = normalizeMealSchedule(schedule);
    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    if (currentMinutes < timeToMinutes(normalized.breakfastEnd)) return "breakfast";
    if (currentMinutes < timeToMinutes(normalized.lunchEnd)) return "lunch";
    return "dinner";
  }

  function scheduleSummary(schedule) {
    const normalized = normalizeMealSchedule(schedule);
    return `Breakfast before ${normalized.breakfastEnd} · Lunch from ${normalized.breakfastEnd} until ${normalized.lunchEnd} · Dinner from ${normalized.lunchEnd}`;
  }

  globalScope.IntakeMealSchedule = Object.freeze({
    DEFAULT_MEAL_SCHEDULE,
    timeToMinutes,
    isValidMealSchedule,
    normalizeMealSchedule,
    defaultMealForDate,
    scheduleSummary,
  });
}(typeof globalThis !== "undefined" ? globalThis : window));
