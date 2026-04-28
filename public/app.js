const macroConfig = [
  {
    key: "protein",
    label: "Protein",
    unit: "g",
    color: "var(--mint-dark)",
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 16h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3V19a3 3 0 0 1 3-3Zm15 0h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3V19a3 3 0 0 1 3-3Z" fill="currentColor" opacity=".22"/><path d="M18 24h12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M10 20v8M38 20v8M15 18v12M33 18v12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  },
  {
    key: "carbs",
    label: "Carbs",
    unit: "g",
    color: "var(--lemon)",
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8v33" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M24 18c-5.9-.2-10.2-3.2-11.4-8.6C18.3 9.4 22.5 12.3 24 18Zm0 8c-5.9-.2-10.2-3.2-11.4-8.6C18.3 17.4 22.5 20.3 24 26Zm0 8c-5.9-.2-10.2-3.2-11.4-8.6C18.3 25.4 22.5 28.3 24 34Zm0-16c5.9-.2 10.2-3.2 11.4-8.6C29.7 9.4 25.5 12.3 24 18Zm0 8c5.9-.2 10.2-3.2 11.4-8.6C29.7 17.4 25.5 20.3 24 26Zm0 8c5.9-.2 10.2-3.2 11.4-8.6C29.7 25.4 25.5 28.3 24 34Z" fill="currentColor" opacity=".82"/></svg>`,
  },
  {
    key: "fat",
    label: "Fat",
    unit: "g",
    color: "var(--berry)",
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6S12 19.7 12 30c0 7.6 5.4 13 12 13s12-5.4 12-13C36 19.7 24 6 24 6Z" fill="currentColor" opacity=".22"/><path d="M24 11.5S16.2 22.1 16.2 30c0 5.1 3.3 8.4 7.8 8.4s7.8-3.3 7.8-8.4c0-7.9-7.8-18.5-7.8-18.5Zm-3.6 20.7c-.7 0-1.2-.5-1.2-1.2 0-3.2 1.6-6.5 3.5-9.2.4-.5 1.1-.7 1.7-.3.5.4.7 1.1.3 1.7-2.1 3.1-3.1 5.8-3.1 7.8 0 .7-.5 1.2-1.2 1.2Z" fill="currentColor"/></svg>`,
  },
];

const defaults = {
  user: null,
  theme: localStorage.getItem("calorie-counter-theme") || "light",
  goals: { calories: 2300, protein: 150, carbs: 260, fat: 75 },
  selectedDate: localDateKey(new Date()),
  lastOpenedDate: localDateKey(new Date()),
  progress: [],
  days: {},
};

const foodLibraryKey = "calorie-counter-food-library";
const savedFoodLibraryKey = "calorie-counter-saved-foods";
const savedFoodMigrationKey = "calorie-counter-saved-foods-v2";
const maxFoodLibraryItems = 10;
const stapleFoodLibrary = [
  { id: "usda-chicken-breast-grilled", name: "Chicken breast, grilled", brand: "USDA", source: "USDA", serving: "per 100g", calories: 165, protein: 31, carbs: 0, fat: 4 },
  { id: "usda-chicken-thigh-roasted", name: "Chicken thigh, roasted", brand: "USDA", source: "USDA", serving: "per 100g", calories: 209, protein: 26, carbs: 0, fat: 11 },
  { id: "off-chickpeas-canned", name: "Chickpeas, canned", brand: "Open Food Facts", source: "Open Food Facts", serving: "per 100g", calories: 119, protein: 6, carbs: 19, fat: 2 },
  { id: "my-chicken-caesar-wrap", name: "Chicken caesar wrap", brand: "My foods", source: "Saved", serving: "per 1 wrap", calories: 482, protein: 32, carbs: 42, fat: 20 },
  { id: "usda-chicken-stock-low-sodium", name: "Chicken stock, low sodium", brand: "USDA", source: "USDA", serving: "per 240ml", calories: 38, protein: 5, carbs: 2, fat: 1 },
];

const exercisePresets = {
  Running: { minutes: 60, met: 9.8 },
  "Weight lifting": { minutes: 45, met: 5 },
  Cycling: { minutes: 60, met: 7.5 },
  Walking: { minutes: 45, met: 3.5 },
};

let state = loadState();
let foodLibrary = loadFoodLibrary();
let savedFoods = loadSavedFoods();
let suggestionAbortController = null;
let autocompleteTimer = null;
let selectedFoodBase = null;
let editingFoodId = null;
let editingExerciseId = null;
let foodSearchFilter = "all";
let latestFoodSuggestions = [];
let undoToastTimer = null;
let renderSnapshot = null;
let recentSuccess = null;
let successCueTimer = null;
const elements = {
  appShell: document.querySelector(".app-shell"),
  mainContent: document.querySelector(".main-content"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  floatingAddButton: document.querySelector("#floatingAddButton"),
  fabOverlay: document.querySelector("#fabOverlay"),
  fabActions: document.querySelector("#fabActions"),
  fabSheetClose: document.querySelector("#fabSheetClose"),
  fabAddFood: document.querySelector("#fabAddFood"),
  fabAddExercise: document.querySelector("#fabAddExercise"),
  fabSavedFoods: document.querySelector("#fabSavedFoods"),
  mobileFoodsTab: document.querySelector("#mobileFoodsTab"),
  appTitle: document.querySelector("#appTitle"),
  profileSummary: document.querySelector("#profileSummary"),
  profileMeta: document.querySelector("#profileMeta"),
  profileInitials: document.querySelector("#profileInitials"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  todayButton: document.querySelector("#todayButton"),
  calendarStrip: document.querySelector("#calendarStrip"),
  previousWeekButton: document.querySelector("#previousWeekButton"),
  nextWeekButton: document.querySelector("#nextWeekButton"),
  logoutButton: document.querySelector("#logoutButton"),
  remainingCalories: document.querySelector("#remainingCalories"),
  goalHelper: document.querySelector("#goalHelper"),
  foodCaloriesTotal: document.querySelector("#foodCaloriesTotal"),
  exerciseCaloriesTotal: document.querySelector("#exerciseCaloriesTotal"),
  netCaloriesTotal: document.querySelector("#netCaloriesTotal"),
  consumedCalories: document.querySelector("#consumedCalories"),
  goalCaloriesText: document.querySelector("#goalCaloriesText"),
  goalStatus: document.querySelector("#goalStatus"),
  calorieRing: document.querySelector("#calorieRing"),
  clearDayStreak: document.querySelector("#clearDayStreak"),
  clearDayStreakLabel: document.querySelector("#clearDayStreakLabel"),
  mobileClearDayStreak: document.querySelector("#mobileClearDayStreak"),
  mobileStreakValue: document.querySelector("#mobileStreakValue"),
  mobileWeightValue: document.querySelector("#mobileWeightValue"),
  mobileWeightDelta: document.querySelector("#mobileWeightDelta"),
  macroGrid: document.querySelector("#macroGrid"),
  foodSection: document.querySelector("#foodSection"),
  foodModeEyebrow: document.querySelector("#foodModeEyebrow"),
  foodModeTitle: document.querySelector("#foodModeTitle"),
  cancelFoodEdit: document.querySelector("#cancelFoodEdit"),
  addFoodToggle: document.querySelector("#addFoodToggle"),
  closeFoodModal: document.querySelector("#closeFoodModal"),
  backFoodModal: document.querySelector("#backFoodModal"),
  manualFoodForm: document.querySelector("#manualFoodForm"),
  manualFoodName: document.querySelector("#manualFoodName"),
  foodEditName: document.querySelector("#foodEditName"),
  foodEditSummary: document.querySelector("#foodEditSummary"),
  foodAmount: document.querySelector("#foodAmount"),
  foodUnit: document.querySelector("#foodUnit"),
  foodMeal: document.querySelector("#foodMeal"),
  manualFoodCalories: document.querySelector("#manualFoodCalories"),
  manualFoodProtein: document.querySelector("#manualFoodProtein"),
  manualFoodCarbs: document.querySelector("#manualFoodCarbs"),
  manualFoodFat: document.querySelector("#manualFoodFat"),
  manualFoodSubmit: document.querySelector("#manualFoodSubmit"),
  foodEditActions: document.querySelector("#foodEditActions"),
  favoriteFoodEdit: document.querySelector("#favoriteFoodEdit"),
  deleteFoodEdit: document.querySelector("#deleteFoodEdit"),
  foodPhotoInput: document.querySelector("#foodPhotoInput"),
  foodGalleryInput: document.querySelector("#foodGalleryInput"),
  foodScanButton: document.querySelector("#foodScanButton"),
  foodScanMenu: document.querySelector("#foodScanMenu"),
  foodFilterTabs: Array.from(document.querySelectorAll("[data-food-filter]")),
  addModeButtons: Array.from(document.querySelectorAll("[data-add-mode]")),
  foodPhotoButton: document.querySelector("#foodPhotoButton"),
  foodGalleryButton: document.querySelector("#foodGalleryButton"),
  foodPhotoStatus: document.querySelector("#foodPhotoStatus"),
  copyYesterdayButton: document.querySelector("#copyYesterdayButton"),
  foodSuggestions: document.querySelector("#foodSuggestions"),
  savedFoods: document.querySelector("#savedFoods"),
  recentFoods: document.querySelector("#recentFoods"),
  searchNote: document.querySelector("#searchNote"),
  foodEntryCount: document.querySelector("#foodEntryCount"),
  foodList: document.querySelector("#foodList"),
  exerciseSection: document.querySelector("#exerciseSection"),
  exerciseModeEyebrow: document.querySelector("#exerciseModeEyebrow"),
  exerciseModeTitle: document.querySelector("#exerciseModeTitle"),
  cancelExerciseEdit: document.querySelector("#cancelExerciseEdit"),
  exerciseForm: document.querySelector("#exerciseForm"),
  addExerciseToggle: document.querySelector("#addExerciseToggle"),
  closeExerciseModal: document.querySelector("#closeExerciseModal"),
  exerciseType: document.querySelector("#exerciseType"),
  exerciseMinutes: document.querySelector("#exerciseMinutes"),
  exerciseCalories: document.querySelector("#exerciseCalories"),
  exerciseSubmit: document.querySelector("#exerciseSubmit"),
  exerciseEditActions: document.querySelector("#exerciseEditActions"),
  deleteExerciseEdit: document.querySelector("#deleteExerciseEdit"),
  exerciseList: document.querySelector("#exerciseList"),
};

function loadState() {
  const saved = localStorage.getItem("calorie-counter-state");
  if (!saved) return structuredClone(defaults);

  try {
    const todayKey = localDateKey(new Date());
    const parsed = JSON.parse(saved);
    const nextState = { ...structuredClone(defaults), ...parsed };

    if (!nextState.days) nextState.days = {};
    if (!Array.isArray(nextState.progress)) nextState.progress = [];
    if (!nextState.selectedDate) nextState.selectedDate = todayKey;
    if (nextState.lastOpenedDate !== todayKey) {
      nextState.selectedDate = todayKey;
      nextState.lastOpenedDate = todayKey;
    }
    if (!nextState.theme) nextState.theme = nextState.user?.theme || localStorage.getItem("calorie-counter-theme") || "light";
    if (nextState.user && !nextState.user.startWeightKg) {
      nextState.user.startWeightKg = nextState.user.weightKg;
    }

    if (Array.isArray(parsed.foods) || Array.isArray(parsed.exercises)) {
      nextState.days[nextState.selectedDate] = {
        foods: parsed.foods || [],
        exercises: parsed.exercises || [],
      };
      delete nextState.foods;
      delete nextState.exercises;
    }

    ensureDay(nextState.selectedDate, nextState);
    return nextState;
  } catch {
    return structuredClone(defaults);
  }
}

function loadFoodLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(foodLibraryKey) || "[]");
    return Array.isArray(saved) ? uniqueRecentFoods(saved.map(normalizeFoodForLibrary).filter(Boolean)).slice(0, maxFoodLibraryItems) : [];
  } catch {
    return [];
  }
}

function loadSavedFoods() {
  if (!localStorage.getItem(savedFoodMigrationKey)) {
    localStorage.removeItem(savedFoodLibraryKey);
    localStorage.setItem(savedFoodMigrationKey, "true");
  }

  try {
    const saved = JSON.parse(localStorage.getItem(savedFoodLibraryKey) || "[]");
    return Array.isArray(saved) ? saved.map(normalizeFoodForLibrary).filter(Boolean).slice(0, maxFoodLibraryItems) : [];
  } catch {
    return [];
  }
}

function saveFoodLibrary() {
  localStorage.setItem(foodLibraryKey, JSON.stringify(foodLibrary.slice(0, maxFoodLibraryItems)));
}

function saveSavedFoods() {
  localStorage.setItem(savedFoodLibraryKey, JSON.stringify(savedFoods.slice(0, maxFoodLibraryItems)));
}

function normalizeFoodForLibrary(food) {
  if (!food?.name) return null;
  return {
    id: food.id || `custom-${foodKey(food)}`,
    name: food.name,
    brand: food.brand || "",
    source: food.source || "Saved",
    serving: food.serving || (food.amount && food.unit ? `${food.amount} ${food.unit}` : "1 serving"),
    calories: Math.round(Number(food.calories || 0)),
    protein: Math.round(Number(food.protein || 0)),
    carbs: Math.round(Number(food.carbs || 0)),
    fat: Math.round(Number(food.fat || 0)),
    savedAt: food.savedAt || new Date().toISOString(),
  };
}

function foodKey(food) {
  return `${food.name || ""}-${food.brand || ""}-${food.serving || food.amount || ""}-${food.unit || ""}`.toLowerCase();
}

function recentFoodKey(food) {
  return String(food?.name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function uniqueRecentFoods(foods) {
  const seen = new Set();
  return foods.filter((food) => {
    const key = recentFoodKey(food);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rememberFoods(foods) {
  const nextFoods = foods.map(normalizeFoodForLibrary).filter(Boolean);
  if (!nextFoods.length) return;

  const foodMap = new Map(foodLibrary.map((food) => [recentFoodKey(food), food]));
  nextFoods.forEach((food) => {
    const key = recentFoodKey(food);
    foodMap.set(key, { ...foodMap.get(key), ...food, savedAt: new Date().toISOString() });
  });

  foodLibrary = uniqueRecentFoods([...foodMap.values()]
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
  ).slice(0, maxFoodLibraryItems);
  saveFoodLibrary();
}

function isFoodSaved(food) {
  return savedFoods.some((savedFood) => foodKey(savedFood) === foodKey(foodForSaving(food)));
}

function foodForSaving(food) {
  return normalizeFoodForLibrary({
    ...food,
    source: "Saved",
    serving: food.serving || (food.amount && food.unit ? `${food.amount} ${food.unit}` : "1 serving"),
  });
}

function toggleSavedFood(food) {
  const normalizedFood = foodForSaving(food);
  const key = foodKey(normalizedFood);

  if (isFoodSaved(normalizedFood)) {
    savedFoods = savedFoods.filter((savedFood) => foodKey(savedFood) !== key);
    elements.searchNote.textContent = `${normalizedFood.name} removed from saved foods.`;
  } else {
    savedFoods = [{ ...normalizedFood, savedAt: new Date().toISOString() }, ...savedFoods.filter((savedFood) => foodKey(savedFood) !== key)].slice(0, maxFoodLibraryItems);
    elements.searchNote.textContent = `${normalizedFood.name} saved.`;
  }

  saveSavedFoods();
  renderEntries();
  renderSavedFoods();
}

function searchFoodLibrary(query) {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 2) return [];

  return [...savedFoods, ...foodLibrary, ...stapleFoodLibrary]
    .filter((food) => [food.name, food.brand, food.source, food.serving].some((value) => String(value || "").toLowerCase().includes(cleanQuery)))
    .slice(0, 12);
}

function dedupeFoodSuggestions(foods) {
  const seen = new Set();
  return foods.filter((food) => {
    const key = foodKey(food);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function saveState() {
  state.theme = state.user?.theme || state.theme || "light";
  localStorage.setItem("calorie-counter-theme", state.theme);
  localStorage.setItem("calorie-counter-state", JSON.stringify(state));
}

function isMobileSidebar() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function setMobileSidebarOpen(isOpen) {
  elements.appShell.classList.toggle("mobile-sidebar-open", isOpen);
  elements.mobileMenuButton?.setAttribute("aria-expanded", String(isOpen));
}

function openMobileLogForm(section, input) {
  setFabMenuOpen(false);
  section.classList.add("is-adding");
  document.body.classList.add("modal-open");
  input?.focus();
}

function closeMobileLogForm(section) {
  section.classList.remove("is-adding");
  clearEntryTransientState();
  if (!document.querySelector(".log-panel.is-adding")) {
    document.body.classList.remove("modal-open");
  }
}

function setFabMenuOpen(isOpen) {
  elements.floatingAddButton?.classList.toggle("is-open", isOpen);
  elements.floatingAddButton?.setAttribute("aria-expanded", String(isOpen));
  elements.fabOverlay?.classList.toggle("is-open", isOpen);
  elements.fabActions?.classList.toggle("is-open", isOpen);
  elements.fabActions?.setAttribute("aria-hidden", String(!isOpen));
}

function syncAddModeButtons(mode) {
  elements.addModeButtons.forEach((button) => {
    const isActive = button.dataset.addMode === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function openAddFoodFromFab() {
  setFabMenuOpen(false);
  closeMobileLogForm(elements.exerciseSection);
  if (editingExerciseId) resetExerciseForm();
  if (editingFoodId) resetFoodForm();
  foodSearchFilter = "all";
  updateFoodFilterTabs();
  elements.foodSection.classList.remove("is-viewing-saved");
  syncAddModeButtons("food");
  openMobileLogForm(elements.foodSection, elements.manualFoodName);
}

function openAddExerciseFromFab() {
  setFabMenuOpen(false);
  elements.foodSection.classList.remove("is-viewing-saved", "is-searching", "is-detailing");
  closeMobileLogForm(elements.foodSection);
  if (editingFoodId || selectedFoodBase) resetFoodForm();
  if (editingExerciseId) resetExerciseForm();
  syncAddModeButtons("exercise");
  openMobileLogForm(elements.exerciseSection, elements.exerciseType);
}

function openSavedFoodsFromFab() {
  setFabMenuOpen(false);
  if (editingFoodId) resetFoodForm();
  elements.foodSection.classList.add("is-viewing-saved");
  openMobileLogForm(elements.foodSection, null);
}

function closeMobileOnlyViewsForDesktop() {
  setFabMenuOpen(false);
  setMobileSidebarOpen(false);
  closeRecentFoodSwipes();
  closeSwipedEntries();
  elements.foodScanMenu?.classList.remove("is-open");
  elements.foodSection.classList.remove("is-viewing-saved", "is-searching", "is-detailing");
  closeMobileLogForm(elements.foodSection);
  closeMobileLogForm(elements.exerciseSection);
  resetFoodForm();
  resetExerciseForm();
  document.body.classList.remove("modal-open");
}

function openFoodsFromHash() {
  if (window.location.hash !== "#foods") return;
  closeMobileLogForm(elements.foodSection);
  closeMobileLogForm(elements.exerciseSection);
  elements.foodSection.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

function showFoodFormFromSavedFoods() {
  elements.foodSection.classList.remove("is-viewing-saved");
  elements.manualFoodName.focus();
}

function syncSelectedDateWithToday() {
  const todayKey = localDateKey(new Date());
  if (state.lastOpenedDate === todayKey) return;

  const previousOpenedDate = state.lastOpenedDate;
  state.lastOpenedDate = todayKey;

  if (state.selectedDate === previousOpenedDate) {
    state.selectedDate = todayKey;
    ensureDay(todayKey);
    saveState();
    render();
    return;
  }

  saveState();
}

function totals() {
  const day = currentDay();
  const foodTotals = day.foods.reduce(
    (sum, food) => ({
      calories: sum.calories + Number(food.calories || 0),
      protein: sum.protein + Number(food.protein || 0),
      carbs: sum.carbs + Number(food.carbs || 0),
      fat: sum.fat + Number(food.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const exerciseCalories = day.exercises.reduce((sum, exercise) => sum + Number(exercise.calories || 0), 0);
  return { ...foodTotals, netCalories: foodTotals.calories - exerciseCalories, exerciseCalories };
}

function isClearDay(day) {
  const summary = summarizeDay(day);
  const hasEntries = day.foods.length > 0 || day.exercises.length > 0;
  return hasEntries && summary.netCalories <= state.goals.calories;
}

function clearDayStreak() {
  const today = localDateKey(new Date());
  let cursor = dateFromKey(today);

  if (!isClearDay(ensureDay(today))) {
    cursor = addDays(cursor, -1);
  }

  let streak = 0;
  while (true) {
    const dateKey = localDateKey(cursor);
    const day = state.days[dateKey];
    if (!day || !isClearDay(day)) return streak;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
}

function ensureDay(dateKey, targetState = state) {
  if (!targetState.days[dateKey]) {
    targetState.days[dateKey] = { foods: [], exercises: [] };
  }
  return targetState.days[dateKey];
}

function currentDay() {
  return ensureDay(state.selectedDate);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function previousDayKey(dateKey) {
  return localDateKey(addDays(dateFromKey(dateKey), -1));
}

function startOfWeek(date) {
  const nextDate = new Date(date);
  const day = nextDate.getDay() || 7;
  nextDate.setDate(nextDate.getDate() - day + 1);
  return nextDate;
}

function formatMacro(value, unit) {
  const rounded = Math.round(Number(value || 0));
  return `${rounded}${unit === "kcal" ? " kcal" : " g"}`;
}

function render() {
  applyTheme(state.user?.theme || state.theme || "light");
  renderProfileState();
  const daily = totals();
  const remaining = state.goals.calories - daily.netCalories;
  const calorieProgress = Math.max(0, Math.min(daily.netCalories / state.goals.calories, 1));
  const hasExerciseDeficit = daily.netCalories < 0;
  const isOverGoal = remaining < 0;
  const ringLength = 364.42;

  setAnimatedMetric(elements.remainingCalories, Math.round(remaining), " kcal", "remaining");
  setAnimatedMetric(elements.foodCaloriesTotal, Math.round(daily.calories), "", "foodCalories");
  setAnimatedMetric(elements.exerciseCaloriesTotal, Math.round(daily.exerciseCalories), "", "exerciseCalories");
  setAnimatedMetric(elements.consumedCalories, Math.round(remaining), "", "remainingRing");
  setAnimatedMetric(elements.netCaloriesTotal, Math.round(daily.netCalories), "", "netCalories");
  const streak = clearDayStreak();
  const streakLabel = `${streak} ${streak === 1 ? "day" : "days"}`;
  elements.clearDayStreak.textContent = streak;
  elements.clearDayStreakLabel.textContent = streak === 1 ? "clear day" : "clear days";
  elements.mobileClearDayStreak.textContent = `${streakLabel} streak`;
  elements.mobileStreakValue.textContent = streak;
  renderMobileWeightStat();
  elements.goalCaloriesText.textContent = state.goals.calories;
  elements.calorieRing.style.strokeDashoffset = ringLength - ringLength * calorieProgress;
  elements.calorieRing.classList.toggle("is-under", hasExerciseDeficit);
  elements.goalStatus.classList.toggle("is-under", hasExerciseDeficit);
  elements.goalStatus.classList.toggle("is-over", isOverGoal);
  elements.goalStatus.textContent = hasExerciseDeficit ? "Below zero" : isOverGoal ? "Over goal" : "On track";
  elements.goalHelper.textContent = hasExerciseDeficit
    ? "Exercise is higher than food so far. Your net calories are below zero."
    : isOverGoal
      ? "You have passed today's calorie target."
      : "Food minus exercise, compared with your daily goal.";

  renderMacros(daily);
  renderCalendar();
  renderEntries();
  renderSavedFoods();
  updateCopyYesterdayButton();
  if (recentSuccess) playSuccessCue(recentSuccess);
  renderSnapshot = {
    remaining: Math.round(remaining),
    foodCalories: Math.round(daily.calories),
    exerciseCalories: Math.round(daily.exerciseCalories),
    netCalories: Math.round(daily.netCalories),
    remainingRing: Math.round(remaining),
    macros: Object.fromEntries(macroConfig.map((macro) => {
      const goal = state.goals[macro.key];
      const progress = goal > 0 ? Math.max(0, Math.min((daily[macro.key] / goal) * 100, 100)) : 0;
      return [macro.key, progress];
    })),
  };
}

function applyTheme(theme) {
  document.body.dataset.theme = theme === "dark" ? "dark" : "light";
}

function renderProfileState() {
  if (!state.user) {
    window.location.href = "profile.html";
    return;
  }

  elements.profileSummary.textContent = state.user.name;
  elements.profileMeta.textContent = `${state.user.weightKg} kg · ${state.user.heightCm} cm`;
  elements.profileInitials.textContent = initialsForName(state.user.name);
}

function initialsForName(name) {
  const parts = String(name || "Daily Fuel").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "DF").toUpperCase();
}

function renderMobileWeightStat() {
  const weight = Number(state.user?.weightKg || 0);
  elements.mobileWeightValue.textContent = weight ? formatDecimal(weight, 1) : "--";

  const startWeight = Number(state.user?.startWeightKg || 0);
  const delta = weight && startWeight ? weight - startWeight : 0;
  elements.mobileWeightDelta.textContent = delta ? `${delta > 0 ? "+" : ""}${formatDecimal(delta, 1)}` : "";
}

function formatDecimal(value, digits = 1) {
  return Number(value).toFixed(digits).replace(/\.0$/, "");
}

function defaultMealForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  return "dinner";
}

function mealLabel(meal = defaultMealForNow()) {
  const labels = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
  return (labels[meal] || labels[defaultMealForNow()]).toUpperCase();
}

function foodLoggedTime(food) {
  const date = food.loggedAt || food.createdAt || food.updatedAt;
  if (!date) return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function setAnimatedMetric(element, value, suffix, key) {
  const previous = renderSnapshot?.[key];
  if (previous === undefined || previous === value || document.visibilityState === "hidden") {
    setMetricText(element, value, suffix);
    return;
  }
  animateNumber(element, previous, value, suffix);
}

function setMetricText(element, value, suffix = "") {
  if (element === elements.remainingCalories) {
    element.innerHTML = `<span>${value}</span><small>${suffix.trim()}</small>`;
    return;
  }
  element.textContent = `${value}${suffix}`;
}

function animateNumber(element, from, to, suffix = "") {
  const duration = 520;
  const start = performance.now();
  const difference = to - from;

  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    setMetricText(element, Math.round(from + difference * eased), suffix);
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function playSubmitSuccess(button) {
  if (!button) return;
  const previousText = button.textContent;
  button.classList.add("is-success");
  button.textContent = "✓";
  setTimeout(() => {
    button.classList.remove("is-success");
    if (button === elements.floatingAddButton) button.textContent = "+";
    else if (!editingFoodId && button === elements.manualFoodSubmit) button.textContent = "+ Add";
    else if (!editingExerciseId && button === elements.exerciseSubmit) button.textContent = "+";
    else button.textContent = previousText;
  }, 800);
}

function playSuccessCue(success) {
  const goalPanel = document.querySelector(".goal-panel");
  if (!goalPanel) return;
  clearTimeout(successCueTimer);
  document.querySelector(".success-cue")?.remove();

  const cue = document.createElement("div");
  cue.className = "success-cue";
  cue.textContent = success.collection === "foods" ? "Added" : "Logged";
  goalPanel.appendChild(cue);
  elements.goalStatus.classList.add("is-success-pulse");
  elements.calorieRing.classList.add("is-success-pulse");
  elements.macroGrid.classList.add("is-success-pulse");

  successCueTimer = setTimeout(() => {
    cue.remove();
    elements.goalStatus.classList.remove("is-success-pulse");
    elements.calorieRing.classList.remove("is-success-pulse");
    elements.macroGrid.classList.remove("is-success-pulse");
  }, 900);
  recentSuccess = null;
}

function renderMacros(daily) {
  elements.macroGrid.innerHTML = "";

  macroConfig.forEach((macro) => {
    const consumed = daily[macro.key];
    const goal = state.goals[macro.key];
    const progress = goal > 0 ? Math.max(0, Math.min((consumed / goal) * 100, 100)) : 0;
    const isOver = consumed > goal;
    const remaining = Math.abs(goal - consumed);
    const progressLabel = `${Math.round(progress)}%`;
    const macroAmountLabel = `<span class="macro-eaten">${Math.round(Number(consumed || 0))}</span><span class="macro-goal">/${Math.round(Number(goal || 0))}${macro.unit}</span>`;
    const macroConsumedLabel = `${Math.round(Number(consumed || 0))}${macro.unit}`;
    const macroGoalLabel = `of ${Math.round(Number(goal || 0))}${macro.unit}`;
    const previousProgress = renderSnapshot?.macros?.[macro.key];
    const progressOffset = 113.1 - 113.1 * (progress / 100);
    const initialProgressOffset = previousProgress === undefined
      ? progressOffset
      : 113.1 - 113.1 * (previousProgress / 100);

    const card = document.createElement("article");
    card.className = "macro-card";
    card.classList.toggle("is-over", isOver);
    card.innerHTML = `
      <div class="macro-card-header">
        <div>
          <p class="label">${macro.label}</p>
          <strong class="macro-amount">${macroAmountLabel}</strong>
        </div>
        <span>${progressLabel}</span>
      </div>
      <div class="macro-card-visual" style="color:${macro.color}; --macro-progress:${progress};">
        ${macro.icon}
        <svg class="macro-ring" viewBox="0 0 48 48" aria-label="${macro.label} progress: ${progressLabel}">
          <circle class="macro-ring-track" cx="24" cy="24" r="18"></circle>
          <circle class="macro-ring-progress" cx="24" cy="24" r="18" style="stroke:${macro.color}; stroke-dashoffset:${initialProgressOffset}"></circle>
        </svg>
        <strong class="macro-ring-value">${macroConsumedLabel}</strong>
        <em>${progressLabel}</em>
      </div>
      <div>
        <p class="macro-mobile-goal">${macroGoalLabel}</p>
        <div class="macro-bar" aria-label="${macro.label} progress: ${progressLabel}">
          <span style="width:${progress}%; background:${macro.color}"></span>
        </div>
        <div class="macro-card-footer">
          <p class="label">${isOver ? `${formatMacro(remaining, macro.unit)} over` : `${formatMacro(remaining, macro.unit)} left`}</p>
          <p class="label">${progressLabel}</p>
        </div>
      </div>
    `;
    elements.macroGrid.appendChild(card);
    if (previousProgress !== undefined && previousProgress !== progress) {
      const progressCircle = card.querySelector(".macro-ring-progress");
      requestAnimationFrame(() => {
        progressCircle.style.strokeDashoffset = progressOffset;
      });
    }
  });
}

function renderEntries() {
  const day = currentDay();
  syncFoodModeHeader();
  syncExerciseModeHeader();
  elements.foodList.dataset.count = `${day.foods.length} ${day.foods.length === 1 ? "entry" : "entries"}`;
  elements.foodSection.dataset.count = elements.foodList.dataset.count;
  elements.foodSection.style.setProperty("--food-entry-count", `"${elements.foodList.dataset.count}"`);
  elements.foodEntryCount.textContent = elements.foodList.dataset.count;
  elements.foodEntryCount.parentElement.dataset.count = elements.foodList.dataset.count;
  elements.foodEntryCount.previousElementSibling.textContent = "Today's log";
  elements.exerciseList.dataset.count = `${day.exercises.length} ${day.exercises.length === 1 ? "entry" : "entries"}`;
  elements.exerciseSection.dataset.count = elements.exerciseList.dataset.count;
  elements.exerciseSection.style.setProperty("--exercise-entry-count", `"${elements.exerciseList.dataset.count}"`);

  renderList(elements.foodList, day.foods, "foods", (food) => {
    return `${mealLabel(food.meal)} · ${foodLoggedTime(food)}`;
  });

  renderList(elements.exerciseList, day.exercises, "exercises", (exercise) => {
    return `${exercise.minutes} min · ${Math.round(exercise.calories)} kcal burned`;
  });
}

function renderList(container, entries, collection, subtitleFactory, titleFactory = (entry) => entry.name) {
  container.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const emptyText = {
      foods: "No food logged today.",
      exercises: "No exercise logged today.",
      progress: "No weight entries yet.",
    };
    empty.textContent = emptyText[collection] || "No entries yet.";
    container.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const card = document.querySelector("#entryTemplate").content.firstElementChild.cloneNode(true);
    const swipeSaveButton = card.querySelector(".swipe-save-action");
    const swipeDeleteButton = card.querySelector(".swipe-delete-action");
    const canEdit = collection === "foods" || collection === "exercises";
    if (recentSuccess?.collection === collection && recentSuccess?.id === entry.id) {
      card.classList.add("is-new-entry");
    }
    if (collection === "foods" && editingFoodId === entry.id) {
      card.classList.add("is-selected");
    }
    if (collection === "exercises" && editingExerciseId === entry.id) {
      card.classList.add("is-selected");
    }
    card.querySelector("strong").textContent = titleFactory(entry);
    card.querySelector("p").textContent = subtitleFactory(entry);
    if (collection === "foods") {
      const entryMain = card.querySelector(".entry-main");
      const calories = document.createElement("span");
      entryMain.classList.add("has-kcal");
      calories.className = "entry-kcal";
      calories.textContent = Math.round(entry.calories || 0);
      calories.setAttribute("aria-label", `${Math.round(entry.calories || 0)} kcal`);
      entryMain.appendChild(calories);
      const saved = isFoodSaved(entry);
      swipeSaveButton.classList.toggle("is-saved", saved);
      swipeSaveButton.textContent = saved ? "♥" : "♡";
      swipeSaveButton.title = saved ? "Remove saved food" : "Save food";
      swipeSaveButton.setAttribute("aria-label", saved ? "Remove saved food" : "Save food");
      swipeSaveButton.addEventListener("click", (event) => {
        event.stopPropagation();
        closeSwipedEntries();
        toggleSavedFood(entry);
      });
    } else if (collection === "exercises") {
      swipeSaveButton.remove();
      card.classList.add("has-no-save-action");
    } else {
      swipeSaveButton.remove();
      card.classList.add("has-no-save-action");
    }
    swipeDeleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      closeSwipedEntries();
      deleteEntryWithUndo(collection, entry);
    });
    if (canEdit) {
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Edit ${titleFactory(entry)}`);
      card.addEventListener("click", () => {
        if (card.dataset.suppressClick === "true") {
          delete card.dataset.suppressClick;
          return;
        }
        if (card.classList.contains("is-swiped-left") || card.classList.contains("is-swiped-right")) {
          closeSwipedEntries();
          return;
        }
        editEntry(collection, entry);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        editEntry(collection, entry);
      });
      attachEntrySwipe(card, collection, entry);
    }
    container.appendChild(card);
  });
}

function editEntry(collection, entry) {
  if (collection === "foods") fillFoodFormForEdit(entry);
  if (collection === "exercises") fillExerciseFormForEdit(entry);
}

function deleteEntryWithUndo(collection, entry) {
  const dateKey = state.selectedDate;
  if (collection === "progress") {
    const previousProgress = [...state.progress];
    state.progress = state.progress.filter((item) => item.id !== entry.id);
    saveState();
    render();
    showUndoToast("Item deleted.", () => {
      state.progress = previousProgress;
      saveState();
      render();
    });
    return;
  }

  const day = ensureDay(dateKey);
  const previousEntries = [...day[collection]];

  day[collection] = day[collection].filter((item) => item.id !== entry.id);
  if (collection === "foods" && editingFoodId === entry.id) resetFoodForm();
  if (collection === "exercises" && editingExerciseId === entry.id) resetExerciseForm();
  saveState();
  render();
  showUndoToast("Item deleted.", () => {
    ensureDay(dateKey);
    state.days[dateKey][collection] = previousEntries;
    saveState();
    render();
  });
}

function showUndoToast(message, onUndo) {
  clearTimeout(undoToastTimer);
  let toast = document.querySelector("#undoToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "undoToast";
    toast.className = "undo-toast";
    toast.innerHTML = "<span></span><button type=\"button\">Undo</button>";
    document.body.appendChild(toast);
  }
  toast.querySelector("span").textContent = message;
  const undoButton = toast.querySelector("button");
  undoButton.onclick = () => {
    toast.classList.remove("is-visible");
    onUndo();
  };
  toast.classList.add("is-visible");
  undoToastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4200);
}

function closeSwipedEntries(exceptCard = null) {
  document.querySelectorAll(".entry-card.is-swiped-left, .entry-card.is-swiped-right").forEach((entryCard) => {
    if (entryCard === exceptCard) return;
    entryCard.classList.remove("is-swiped-left", "is-swiped-right", "is-dragging");
    entryCard.style.removeProperty("--swipe-x");
  });
}

function clearEntryTransientState() {
  closeSwipedEntries();
  document.querySelectorAll(".entry-card.is-selected, .entry-card.is-dragging").forEach((entryCard) => {
    entryCard.classList.remove("is-selected", "is-dragging");
    entryCard.style.removeProperty("--swipe-x");
  });
  if (document.activeElement?.closest?.(".entry-card")) {
    document.activeElement.blur();
  }
}

function attachEntrySwipe(card, collection, entry) {
  let startX = 0;
  let startY = 0;
  let latestX = 0;
  let isTracking = false;
  let isDragging = false;
  const revealDistance = 82;
  const dragLimit = 96;

  function setSwipeOffset(value) {
    const offset = Math.max(-dragLimit, Math.min(dragLimit, value));
    card.style.setProperty("--swipe-x", `${offset}px`);
  }

  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    closeSwipedEntries(card);
    startX = event.clientX;
    startY = event.clientY;
    latestX = startX;
    isTracking = true;
    isDragging = false;
    card.classList.remove("is-swiped-left", "is-swiped-right");
  });

  card.addEventListener("pointermove", (event) => {
    if (!isTracking) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!isDragging && Math.abs(deltaX) < 10) return;
    if (!isDragging && Math.abs(deltaY) > Math.abs(deltaX)) {
      isTracking = false;
      return;
    }
    isDragging = true;
    latestX = event.clientX;
    card.classList.add("is-dragging");
    setSwipeOffset(deltaX);
  });

  card.addEventListener("pointerup", (event) => {
    if (!isTracking) return;
    isTracking = false;
    const deltaX = (isDragging ? latestX : event.clientX) - startX;
    const deltaY = event.clientY - startY;
    card.classList.remove("is-dragging");
    card.style.removeProperty("--swipe-x");
    if (Math.abs(deltaX) < 54 || Math.abs(deltaY) > 44) {
      if (card.classList.contains("is-swiped-left") || card.classList.contains("is-swiped-right")) {
        card.dataset.suppressClick = "true";
        setTimeout(() => {
          delete card.dataset.suppressClick;
        }, 220);
      }
      return;
    }

    card.dataset.suppressClick = "true";
    setTimeout(() => {
      delete card.dataset.suppressClick;
    }, 260);
    if (deltaX < 0) {
      card.classList.add("is-swiped-left");
      return;
    }

    if (collection === "foods") {
      card.classList.add("is-swiped-right");
    }
  });

  card.addEventListener("pointercancel", () => {
    isTracking = false;
    isDragging = false;
    card.classList.remove("is-dragging");
    card.style.removeProperty("--swipe-x");
  });
}

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".entry-card")) return;
  closeSwipedEntries();
});

function renderCalendar() {
  const selected = dateFromKey(state.selectedDate);
  const weekStart = startOfWeek(selected);
  const todayKey = localDateKey(new Date());

  elements.selectedDateLabel.textContent = selected.toLocaleDateString("en-US", { weekday: "long" });
  elements.appTitle.textContent = selected.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  elements.todayButton.disabled = state.selectedDate === todayKey;
  elements.calendarStrip.innerHTML = "";

  Array.from({ length: 7 }).forEach((_, index) => {
    const date = addDays(weekStart, index);
    const dateKey = localDateKey(date);
    const day = ensureDay(dateKey);
    const summary = summarizeDay(day);
    const hasEntries = day.foods.length > 0 || day.exercises.length > 0;
    const isOverGoal = summary.netCalories > state.goals.calories;
    const status = hasEntries ? (isOverGoal ? "over" : "complete") : "empty";
    const statusLabel = status === "empty" ? "No entries" : status === "over" ? "Over calorie goal" : "Within calorie goal";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-tile";
    button.classList.toggle("is-selected", dateKey === state.selectedDate);
    button.classList.toggle("is-today", dateKey === todayKey);
    button.dataset.status = status;
    button.title = statusLabel;
    button.setAttribute("aria-label", `${date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}: ${statusLabel}`);
    button.innerHTML = `
      <span>${date.toLocaleDateString("en-US", { weekday: "short" })}</span>
      <strong>${date.getDate()}</strong>
      <i aria-hidden="true"></i>
    `;
    button.addEventListener("click", () => {
      state.selectedDate = dateKey;
      ensureDay(dateKey);
      saveState();
      render();
    });
    elements.calendarStrip.appendChild(button);
  });
}

function summarizeDay(day) {
  const foodTotals = day.foods.reduce(
    (sum, food) => ({
      calories: sum.calories + Math.round(Number(food.calories || 0)),
      protein: sum.protein + Math.round(Number(food.protein || 0)),
    }),
    { calories: 0, protein: 0 },
  );
  const exerciseCalories = day.exercises.reduce((sum, exercise) => sum + Math.round(Number(exercise.calories || 0)), 0);
  return { ...foodTotals, exerciseCalories, netCalories: foodTotals.calories - exerciseCalories };
}

function renderSavedFoods() {
  if (!elements.savedFoods) return;
  elements.savedFoods.innerHTML = "";
  if (elements.recentFoods) elements.recentFoods.innerHTML = "";

  if (!savedFoods.length) {
    elements.savedFoods.innerHTML = "<div class=\"saved-foods-empty\">Save foods from your daily log and they will appear here.</div>";
  } else {
    savedFoods.slice(0, maxFoodLibraryItems).forEach((food) => {
      elements.savedFoods.appendChild(createLibraryFoodCard(food, { saved: true }));
    });
  }

  if (!elements.recentFoods) return;
  const recentFoods = foodLibrary
    .filter((food) => !savedFoods.some((savedFood) => recentFoodKey(savedFood) === recentFoodKey(food)))
    .slice(0, maxFoodLibraryItems);
  if (!recentFoods.length) {
    elements.recentFoods.innerHTML = "<div class=\"saved-foods-empty\">Foods you log or search will appear here.</div>";
    return;
  }
  recentFoods.forEach((food) => {
    elements.recentFoods.appendChild(createLibraryFoodCard(food, { saved: false }));
  });
}

function createLibraryFoodCard(food, { saved }) {
  const card = document.createElement("div");
  card.className = `saved-food-chip${saved ? "" : " recent-food-chip"}`;
  card.innerHTML = `
    ${saved ? "" : `<div class="recent-food-swipe-actions" aria-hidden="true"><button class="recent-food-delete-action" type="button" tabindex="-1">×</button></div>`}
    <div class="saved-food-surface">
      <button class="saved-food-load" type="button">
        <strong>${food.name}</strong>
        <span>${food.serving} · ${Math.round(food.calories)} kcal</span>
      </button>
      <button class="saved-food-heart ${saved ? "is-saved" : ""}" type="button" title="${saved ? "Remove saved food" : "Save food"}" aria-label="${saved ? "Remove saved food" : "Save food"}">${saved ? "♥" : "♡"}</button>
    </div>
  `;
  card.querySelector(".saved-food-load").addEventListener("click", () => {
    if (card.dataset.suppressClick === "true") {
      delete card.dataset.suppressClick;
      return;
    }
    if (card.classList.contains("is-swiped-left")) {
      closeRecentFoodSwipes();
      return;
    }
    elements.foodSection.classList.remove("is-viewing-saved");
    fillManualFood(food);
    elements.foodAmount.focus();
  });
  card.querySelector(".saved-food-heart").addEventListener("click", () => toggleSavedFood(food));
  if (!saved) {
    card.querySelector(".recent-food-delete-action").addEventListener("click", (event) => {
      event.stopPropagation();
      removeRecentFoodWithUndo(food);
    });
    attachRecentFoodSwipe(card, food);
  }
  return card;
}

function closeRecentFoodSwipes(exceptCard = null) {
  document.querySelectorAll(".recent-food-chip.is-swiped-left").forEach((card) => {
    if (card === exceptCard) return;
    card.classList.remove("is-swiped-left", "is-dragging");
    card.style.removeProperty("--swipe-x");
  });
}

function removeRecentFoodWithUndo(food) {
  const previousFoodLibrary = [...foodLibrary];
  const key = recentFoodKey(food);
  foodLibrary = foodLibrary.filter((recentFood) => recentFoodKey(recentFood) !== key);
  saveFoodLibrary();
  renderSavedFoods();
  showUndoToast("Recent food removed.", () => {
    foodLibrary = previousFoodLibrary;
    saveFoodLibrary();
    renderSavedFoods();
  });
}

function attachRecentFoodSwipe(card, food) {
  let startX = 0;
  let startY = 0;
  let latestX = 0;
  let isTracking = false;
  let isDragging = false;
  const revealDistance = 78;
  const dragLimit = 92;

  function setSwipeOffset(value) {
    const offset = Math.max(-dragLimit, Math.min(0, value));
    card.style.setProperty("--swipe-x", `${offset}px`);
  }

  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".saved-food-heart, .recent-food-delete-action")) return;
    closeRecentFoodSwipes(card);
    startX = event.clientX;
    startY = event.clientY;
    latestX = startX;
    isTracking = true;
    isDragging = false;
    card.classList.remove("is-swiped-left");
  });

  card.addEventListener("pointermove", (event) => {
    if (!isTracking) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!isDragging && Math.abs(deltaX) < 10) return;
    if (!isDragging && Math.abs(deltaY) > Math.abs(deltaX)) {
      isTracking = false;
      return;
    }
    isDragging = true;
    latestX = event.clientX;
    card.classList.add("is-dragging");
    setSwipeOffset(deltaX);
  });

  card.addEventListener("pointerup", (event) => {
    if (!isTracking) return;
    isTracking = false;
    const deltaX = (isDragging ? latestX : event.clientX) - startX;
    const deltaY = event.clientY - startY;
    card.classList.remove("is-dragging");
    card.style.removeProperty("--swipe-x");
    if (Math.abs(deltaY) > 44 || deltaX > -52) {
      if (card.classList.contains("is-swiped-left")) {
        card.dataset.suppressClick = "true";
        setTimeout(() => {
          delete card.dataset.suppressClick;
        }, 220);
      }
      return;
    }

    card.dataset.suppressClick = "true";
    setTimeout(() => {
      delete card.dataset.suppressClick;
    }, 260);
    card.classList.add("is-swiped-left");
  });

  card.addEventListener("pointercancel", () => {
    isTracking = false;
    isDragging = false;
    card.classList.remove("is-dragging");
    card.style.removeProperty("--swipe-x");
  });
}

function sourceLabel(food) {
  const source = String(food.source || food.brand || "Saved").toLowerCase();
  if (source.includes("open food facts") || source === "off") return "OPEN FOOD FACTS";
  if (source.includes("usda")) return "USDA";
  if (source.includes("saved") || isFoodSaved(food)) return "MY FOODS";
  return String(food.source || food.brand || "MY FOODS").toUpperCase();
}

function foodMatchesActiveFilter(food) {
  const source = String(food.source || food.brand || "").toLowerCase();
  if (foodSearchFilter === "my") return isFoodSaved(food) || source.includes("saved");
  if (foodSearchFilter === "recent") return foodLibrary.some((recentFood) => foodKey(recentFood) === foodKey(foodForSaving(food)));
  if (foodSearchFilter === "usda") return source.includes("usda");
  if (foodSearchFilter === "off") return source.includes("open food facts") || source === "off";
  return true;
}

function activeFoodFilterLabel() {
  const labels = {
    my: "saved foods",
    recent: "recent foods",
    usda: "USDA",
    off: "Open Food Facts",
  };
  return labels[foodSearchFilter] || "";
}

function updateFoodFilterTabs() {
  elements.foodFilterTabs.forEach((button) => {
    const isActive = button.dataset.foodFilter === foodSearchFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function foodSearchSummary(count) {
  const query = elements.manualFoodName.value.trim();
  if (!query && foodSearchFilter === "my") return `${count} saved ${count === 1 ? "food" : "foods"}`;
  if (!query) return "Search saved foods, USDA, or Open Food Facts.";
  if (!count) {
    const source = activeFoodFilterLabel();
    return source ? `0 ${source} matches for "${query}"` : `0 matches for "${query}"`;
  }
  return `${count} ${count === 1 ? "match" : "matches"} for "${query}"`;
}

function showBrowseFoodSuggestions() {
  if (elements.manualFoodName.value.trim().length >= 2) return false;

  if (foodSearchFilter === "my") {
    renderSuggestions(savedFoods, { remember: false });
    return true;
  }

  elements.foodSuggestions.innerHTML = "";
  latestFoodSuggestions = [];
  elements.searchNote.textContent = "Search saved foods, USDA, or Open Food Facts.";
  setFoodSearchActive(false);
  return true;
}

function addSuggestedFood(food) {
  const portion = parseServing(food.serving);
  const unit = portion.grams ? "g" : portion.unit;
  const amount = portion.grams || portion.amount || 1;
  const multiplier = portionMultiplier({ ...food, servingGrams: portion.grams || 100 }, amount, unit);
  addFood({
    name: food.name,
    brand: food.brand || "",
    source: food.source || "Local",
    serving: food.serving || "",
    amount,
    unit,
    meal: defaultMealForNow(),
    calories: scaleCalories(food.calories, multiplier),
    protein: scaleMacro(food.protein, multiplier),
    carbs: scaleMacro(food.carbs, multiplier),
    fat: scaleMacro(food.fat, multiplier),
  });
  elements.searchNote.textContent = `${food.name} added.`;
  playSubmitSuccess(elements.floatingAddButton || elements.manualFoodSubmit);
  closeMobileLogForm(elements.foodSection);
  resetFoodForm();
}

function renderSuggestions(foods, options = {}) {
  const { remember = true } = options;
  if (remember) latestFoodSuggestions = foods;
  elements.foodSuggestions.innerHTML = "";
  const filteredFoods = foods.filter(foodMatchesActiveFilter);

  if (!filteredFoods.length) {
    if (elements.manualFoodName.value.trim().length < 2 && foodSearchFilter === "my") {
      elements.searchNote.textContent = "No saved foods yet. Save foods with the heart.";
      setFoodSearchActive(false);
      return;
    }
    elements.searchNote.textContent = elements.manualFoodName.value.trim().length < 2 ? "Search saved foods, USDA, or Open Food Facts." : foodSearchSummary(0);
    setFoodSearchActive(elements.manualFoodName.value.trim().length >= 2);
    return;
  }

  const visibleFoods = filteredFoods.slice(0, 5);
  elements.searchNote.textContent = foodSearchSummary(visibleFoods.length);
  setFoodSearchActive(true);

  visibleFoods.forEach((food) => {
    const button = document.createElement("button");
    button.className = "suggestion-card";
    button.type = "button";
    button.innerHTML = `
      <div>
        <strong>${food.name}</strong>
        <p>${sourceLabel(food)} · ${food.serving || "per 100g"}</p>
      </div>
      <span class="suggestion-kcal">${Math.round(food.calories)}</span>
    `;
    button.addEventListener("click", () => {
      fillManualFood(food);
    });
    elements.foodSuggestions.appendChild(button);
  });
}

function fillManualFood(food) {
  const portion = parseServing(food.serving);
  selectedFoodBase = { ...food, servingGrams: portion.grams || 100 };

  elements.foodSection.classList.add("is-detailing");
  elements.manualFoodName.readOnly = true;
  elements.manualFoodName.value = food.name;
  elements.foodEditName.textContent = food.name;
  elements.foodAmount.value = 100;
  elements.foodUnit.value = "g";
  elements.foodMeal.value = defaultMealForNow();
  elements.manualFoodSubmit.textContent = "+ Add";
  updateFoodAmountStep();
  elements.foodSuggestions.innerHTML = "";
  setFoodSearchActive(false);
  updateNutritionForPortion();
}

function fillFoodFormForEdit(food) {
  editingFoodId = food.id;
  const amount = Number(food.amount || 1);
  const divisor = food.unit === "g" ? 1 : amount || 1;
  selectedFoodBase = {
    ...food,
    calories: food.unit === "g" ? Math.round(Number(food.calories || 0)) : Math.round(Number(food.calories || 0) / divisor),
    protein: food.unit === "g" ? Math.round(Number(food.protein || 0)) : Math.round(Number(food.protein || 0) / divisor),
    carbs: food.unit === "g" ? Math.round(Number(food.carbs || 0)) : Math.round(Number(food.carbs || 0) / divisor),
    fat: food.unit === "g" ? Math.round(Number(food.fat || 0)) : Math.round(Number(food.fat || 0) / divisor),
    servingGrams: food.unit === "g" ? amount || 100 : null,
  };
  elements.manualFoodName.value = food.name;
  elements.manualFoodName.readOnly = true;
  elements.foodEditName.textContent = food.name || "Food entry";
  elements.foodAmount.value = food.amount || 1;
  elements.foodUnit.value = food.unit || "serving";
  elements.foodMeal.value = food.meal || defaultMealForNow();
  updateFoodAmountStep();
  elements.manualFoodCalories.value = Math.round(Number(food.calories || 0));
  elements.manualFoodProtein.value = Math.round(Number(food.protein || 0));
  elements.manualFoodCarbs.value = Math.round(Number(food.carbs || 0));
  elements.manualFoodFat.value = Math.round(Number(food.fat || 0));
  elements.manualFoodSubmit.textContent = "Save";
  elements.favoriteFoodEdit.classList.toggle("is-saved", isFoodSaved(food));
  elements.favoriteFoodEdit.textContent = isFoodSaved(food) ? "♥" : "♡";
  elements.favoriteFoodEdit.title = isFoodSaved(food) ? "Remove saved food" : "Save food";
  elements.favoriteFoodEdit.setAttribute("aria-label", isFoodSaved(food) ? "Remove saved food" : "Save food");
  elements.foodSuggestions.innerHTML = "";
  elements.searchNote.textContent = "Editing this food entry. Adjust serving, meal, or nutrition values, then save.";
  setFoodSearchActive(false);
  elements.foodSection.classList.add("is-adding", "is-editing");
  document.body.classList.add("modal-open");
  syncFoodModeHeader();
  renderEntries();
  elements.foodAmount.focus();
}

function resetFoodForm() {
  elements.manualFoodForm.reset();
  elements.manualFoodName.readOnly = false;
  elements.foodEditName.textContent = "Food";
  elements.foodAmount.value = 1;
  elements.foodUnit.value = "serving";
  elements.foodMeal.value = defaultMealForNow();
  updateFoodAmountStep();
  elements.manualFoodSubmit.textContent = "+ Add";
  editingFoodId = null;
  selectedFoodBase = null;
  latestFoodSuggestions = [];
  elements.foodSection.classList.remove("is-editing", "is-detailing");
  elements.foodSuggestions.innerHTML = "";
  elements.foodPhotoStatus.textContent = "";
  elements.searchNote.textContent = "Search saved foods, USDA, or Open Food Facts.";
  setFoodSearchActive(false);
  clearEntryTransientState();
  syncFoodModeHeader();
}

function syncFoodModeHeader() {
  const isEditing = Boolean(editingFoodId);
  elements.foodModeEyebrow.textContent = isEditing ? "Editing entry" : "Add";
  elements.foodModeTitle.textContent = isEditing ? "Edit food" : "Add";
}

function syncExerciseModeHeader() {
  const isEditing = Boolean(editingExerciseId);
  elements.exerciseModeEyebrow.textContent = isEditing ? "Editing entry" : "Add";
  elements.exerciseModeTitle.textContent = isEditing ? "Edit exercise" : "Add";
}

function setFoodSearchActive(isActive) {
  elements.foodSection.classList.toggle("is-searching", isActive);
}

function updateFoodAmountStep() {
  elements.foodAmount.step = elements.foodUnit.value === "g" ? "5" : "1";
}

function updateFoodAmountForUnit() {
  elements.foodAmount.value = elements.foodUnit.value === "g" ? 100 : 1;
  updateFoodAmountStep();
}

function updateNutritionForPortion() {
  if (!selectedFoodBase) return;

  const multiplier = portionMultiplier(selectedFoodBase, Number(elements.foodAmount.value || 0), elements.foodUnit.value);
  elements.manualFoodCalories.value = scaleCalories(selectedFoodBase.calories, multiplier);
  elements.manualFoodProtein.value = scaleMacro(selectedFoodBase.protein, multiplier);
  elements.manualFoodCarbs.value = scaleMacro(selectedFoodBase.carbs, multiplier);
  elements.manualFoodFat.value = scaleMacro(selectedFoodBase.fat, multiplier);
}

function parseServing(serving = "") {
  const normalized = serving.toLowerCase().replace(",", ".");
  const amountMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? Number(amountMatch[1]) : 1;

  if (/\bg\b|gram/.test(normalized)) return { amount, unit: "g", grams: amount };
  if (amountMatch && !/[a-z]/i.test(normalized.replace(amountMatch[0], ""))) return { amount, unit: "g", grams: amount };
  if (/slice|piece|egg|medium/.test(normalized)) return { amount, unit: "piece", grams: null };
  return { amount, unit: "serving", grams: null };
}

function portionMultiplier(food, amount, unit) {
  if (!amount) return 0;
  if (unit === "g") return amount / (food.servingGrams || 100);
  return amount;
}

function scaleMacro(value, multiplier) {
  return Math.round(Number(value || 0) * multiplier);
}

function scaleCalories(value, multiplier) {
  return Math.round(Number(value || 0) * multiplier);
}

function normalizeCalorieInput() {
  if (elements.manualFoodCalories.value === "") return;
  elements.manualFoodCalories.value = Math.round(Number(elements.manualFoodCalories.value || 0));
}

function normalizeFoodMacroInputs() {
  [elements.manualFoodProtein, elements.manualFoodCarbs, elements.manualFoodFat].forEach((input) => {
    if (input.value !== "") input.value = Math.round(Number(input.value || 0));
  });
}

async function searchFoodSuggestions(query) {
  suggestionAbortController?.abort();
  const localMatches = searchFoodLibrary(query);

  if (query.trim().length < 2) {
    showBrowseFoodSuggestions();
    return;
  }

  if (localMatches.length) {
    renderSuggestions(localMatches);
    elements.searchNote.textContent = "Showing saved foods while searching online sources...";
  } else {
    elements.searchNote.textContent = "Searching USDA and Open Food Facts...";
    setFoodSearchActive(true);
  }

  setFoodSearchActive(true);
  suggestionAbortController = new AbortController();
  const response = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}`, {
    signal: suggestionAbortController.signal,
  });
  const data = await response.json();
  const onlineFoods = data.foods || [];
  renderSuggestions(dedupeFoodSuggestions([...localMatches, ...onlineFoods]).slice(0, 24));
}

async function analyzeFoodPhoto(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    elements.foodPhotoStatus.textContent = "Choose an image file.";
    return;
  }

  const previousScanText = elements.foodScanButton?.querySelector("b")?.textContent || "Scan";
  elements.foodPhotoButton.disabled = true;
  elements.foodGalleryButton.disabled = true;
  elements.foodScanButton?.querySelector("b") && (elements.foodScanButton.querySelector("b").textContent = "Analyzing");
  elements.foodPhotoStatus.textContent = "Estimating nutrition...";

  try {
    const imageDataUrl = await resizeImageForAnalysis(file);
    const response = await fetch("/api/foods/analyze-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || "Food photo analysis failed.");
    fillManualFoodFromPhoto(data.food || {});
  } catch (error) {
    elements.foodPhotoStatus.textContent = error.message || "Photo analysis failed.";
  } finally {
    elements.foodPhotoButton.disabled = false;
    elements.foodGalleryButton.disabled = false;
    elements.foodScanButton?.querySelector("b") && (elements.foodScanButton.querySelector("b").textContent = previousScanText);
    elements.foodPhotoInput.value = "";
    elements.foodGalleryInput.value = "";
  }
}

function fillManualFoodFromPhoto(food) {
  const unit = ["serving", "piece", "g"].includes(food.unit) ? food.unit : "serving";
  const amount = unit === "g"
    ? Math.max(1, Math.round(Number(food.amount || 100)))
    : Math.max(1, Number(food.amount || 1));
  const divisor = unit === "g" ? 1 : amount;

  selectedFoodBase = {
    ...food,
    calories: unit === "g" ? Math.round(Number(food.calories || 0)) : Math.round(Number(food.calories || 0) / divisor),
    protein: unit === "g" ? Math.round(Number(food.protein || 0)) : Math.round(Number(food.protein || 0) / divisor),
    carbs: unit === "g" ? Math.round(Number(food.carbs || 0)) : Math.round(Number(food.carbs || 0) / divisor),
    fat: unit === "g" ? Math.round(Number(food.fat || 0)) : Math.round(Number(food.fat || 0) / divisor),
    servingGrams: unit === "g" ? amount : null,
  };

  editingFoodId = null;
  elements.foodSection.classList.remove("is-editing");
  elements.manualFoodSubmit.textContent = "+ Add";
  elements.manualFoodName.value = food.name || "Unknown food";
  elements.foodAmount.value = amount;
  elements.foodUnit.value = unit;
  elements.foodMeal.value = defaultMealForNow();
  updateFoodAmountStep();
  updateNutritionForPortion();
  elements.foodSuggestions.innerHTML = "";
  elements.searchNote.textContent = food.notes || "Photo estimate filled in. Review it, then add it to your log.";
  elements.foodPhotoStatus.textContent = `AI estimate: ${food.confidence || "low"} confidence.`;
  setFoodSearchActive(false);
}

function resizeImageForAnalysis(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.onerror = () => reject(new Error("Could not read this image."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

function addFood(food) {
  const now = new Date().toISOString();
  const nextFood = {
    ...food,
    calories: Math.round(Number(food.calories || 0)),
    protein: Math.round(Number(food.protein || 0)),
    carbs: Math.round(Number(food.carbs || 0)),
    fat: Math.round(Number(food.fat || 0)),
  };
  let addedId = null;
  if (editingFoodId) {
    currentDay().foods = currentDay().foods.map((entry) =>
      entry.id === editingFoodId ? { ...entry, ...nextFood, updatedAt: new Date().toISOString() } : entry,
    );
  } else {
    addedId = crypto.randomUUID();
    currentDay().foods.unshift({ ...nextFood, id: addedId, loggedAt: now, createdAt: now });
    recentSuccess = { collection: "foods", id: addedId };
  }
  rememberFoods([{ ...nextFood, source: nextFood.source || "Local", serving: nextFood.amount && nextFood.unit ? `${nextFood.amount} ${nextFood.unit}` : "1 serving" }]);
  saveState();
  render();
  return addedId;
}

function updateCopyYesterdayButton() {
  const sourceDateKey = previousDayKey(state.selectedDate);
  const sourceFoods = state.days[sourceDateKey]?.foods || [];

  elements.copyYesterdayButton.disabled = sourceFoods.length === 0;
  elements.copyYesterdayButton.title = sourceFoods.length
    ? `Copy ${sourceFoods.length} food ${sourceFoods.length === 1 ? "entry" : "entries"} from the previous day`
    : "No food entries on the previous day";
}

function copyFoodsFromYesterday() {
  const sourceDateKey = previousDayKey(state.selectedDate);
  const sourceFoods = state.days[sourceDateKey]?.foods || [];

  if (!sourceFoods.length) {
    elements.searchNote.textContent = "No food entries found on the previous day.";
    updateCopyYesterdayButton();
    return;
  }

  const copiedAt = new Date().toISOString();
  const copiedFoods = sourceFoods.map(({ id, createdAt, updatedAt, copiedFromDate, ...food }) => ({
    ...food,
    id: crypto.randomUUID(),
    loggedAt: copiedAt,
    createdAt: copiedAt,
    copiedFromDate: sourceDateKey,
  }));

  if (editingFoodId) resetFoodForm();
  currentDay().foods = [...copiedFoods, ...currentDay().foods];
  elements.searchNote.textContent = `${copiedFoods.length} food ${copiedFoods.length === 1 ? "entry" : "entries"} copied from the previous day.`;
  saveState();
  render();
}

elements.manualFoodForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const isEditing = Boolean(editingFoodId);
  addFood({
    name: elements.manualFoodName.value.trim(),
    brand: selectedFoodBase?.brand || "",
    source: selectedFoodBase?.source || "Local",
    serving: selectedFoodBase?.serving || "",
    amount: Number(elements.foodAmount.value || 1),
    unit: elements.foodUnit.value,
    meal: elements.foodMeal.value,
    calories: Math.round(Number(elements.manualFoodCalories.value || 0)),
    protein: Math.round(Number(elements.manualFoodProtein.value || 0)),
    carbs: Math.round(Number(elements.manualFoodCarbs.value || 0)),
    fat: Math.round(Number(elements.manualFoodFat.value || 0)),
  });
  resetFoodForm();
  if (!isEditing) playSubmitSuccess(elements.manualFoodSubmit);
  closeMobileLogForm(elements.foodSection);
});

elements.manualFoodName.addEventListener("input", () => {
  if (editingFoodId) return;
  selectedFoodBase = null;
  clearTimeout(autocompleteTimer);
  autocompleteTimer = setTimeout(() => {
    searchFoodSuggestions(elements.manualFoodName.value).catch((error) => {
      if (error.name !== "AbortError") {
        elements.foodSuggestions.innerHTML = "";
        elements.searchNote.textContent = "Food search failed. You can still enter the nutrition manually.";
        setFoodSearchActive(false);
      }
    });
  }, 350);
});

elements.foodAmount.addEventListener("input", updateNutritionForPortion);
elements.foodUnit.addEventListener("change", () => {
  updateFoodAmountForUnit();
  updateNutritionForPortion();
});
elements.manualFoodCalories.addEventListener("input", normalizeCalorieInput);
elements.manualFoodProtein.addEventListener("input", normalizeFoodMacroInputs);
elements.manualFoodCarbs.addEventListener("input", normalizeFoodMacroInputs);
elements.manualFoodFat.addEventListener("input", normalizeFoodMacroInputs);
elements.copyYesterdayButton.addEventListener("click", copyFoodsFromYesterday);
elements.addFoodToggle.addEventListener("click", () => {
  openAddFoodFromFab();
});
elements.addModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.addMode === "exercise") {
      openAddExerciseFromFab();
    } else {
      openAddFoodFromFab();
    }
  });
});
elements.closeFoodModal.addEventListener("click", () => {
  closeMobileLogForm(elements.foodSection);
  resetFoodForm();
  elements.foodSection.classList.remove("is-viewing-saved");
});
elements.backFoodModal.addEventListener("click", showFoodFormFromSavedFoods);
elements.cancelFoodEdit.addEventListener("click", () => {
  resetFoodForm();
  renderEntries();
  elements.manualFoodName.focus();
});
elements.favoriteFoodEdit.addEventListener("click", () => {
  if (!editingFoodId) return;
  const entry = currentDay().foods.find((food) => food.id === editingFoodId);
  if (!entry) return;
  toggleSavedFood(entry);
  const isSaved = isFoodSaved(entry);
  elements.favoriteFoodEdit.classList.toggle("is-saved", isSaved);
  elements.favoriteFoodEdit.textContent = isSaved ? "♥" : "♡";
  elements.favoriteFoodEdit.title = isSaved ? "Remove saved food" : "Save food";
  elements.favoriteFoodEdit.setAttribute("aria-label", isSaved ? "Remove saved food" : "Save food");
});
elements.deleteFoodEdit.addEventListener("click", () => {
  if (!editingFoodId) return;
  const entry = currentDay().foods.find((food) => food.id === editingFoodId);
  if (!entry) return;
  closeMobileLogForm(elements.foodSection);
  resetFoodForm();
  deleteEntryWithUndo("foods", entry);
});
elements.foodFilterTabs.forEach((button) => {
  button.addEventListener("click", () => {
    foodSearchFilter = button.dataset.foodFilter || "all";
    updateFoodFilterTabs();
    if (showBrowseFoodSuggestions()) return;
    renderSuggestions(latestFoodSuggestions);
  });
});
elements.foodScanButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = elements.foodScanMenu?.classList.toggle("is-open");
  elements.foodScanButton.setAttribute("aria-expanded", String(Boolean(isOpen)));
  elements.foodScanMenu?.setAttribute("aria-hidden", String(!isOpen));
});
elements.foodPhotoButton.addEventListener("click", () => {
  elements.foodScanMenu?.classList.remove("is-open");
  elements.foodScanMenu?.setAttribute("aria-hidden", "true");
  elements.foodScanButton?.setAttribute("aria-expanded", "false");
  elements.foodPhotoInput.click();
});
elements.foodGalleryButton.addEventListener("click", () => {
  elements.foodScanMenu?.classList.remove("is-open");
  elements.foodScanMenu?.setAttribute("aria-hidden", "true");
  elements.foodScanButton?.setAttribute("aria-expanded", "false");
  elements.foodGalleryInput.click();
});
elements.foodPhotoInput.addEventListener("change", () => analyzeFoodPhoto(elements.foodPhotoInput.files?.[0]));
elements.foodGalleryInput.addEventListener("change", () => analyzeFoodPhoto(elements.foodGalleryInput.files?.[0]));
document.addEventListener("click", (event) => {
  if (!elements.foodScanMenu?.classList.contains("is-open")) return;
  if (event.target.closest("#foodScanMenu") || event.target.closest("#foodScanButton")) return;
  elements.foodScanMenu.classList.remove("is-open");
  elements.foodScanMenu.setAttribute("aria-hidden", "true");
  elements.foodScanButton?.setAttribute("aria-expanded", "false");
});

function estimateExerciseCalories() {
  const preset = exercisePresets[elements.exerciseType.value] || exercisePresets.Running;
  const minutes = Number(elements.exerciseMinutes.value || preset.minutes);
  const weightKg = Number(state.user?.weightKg || 75);
  const calories = (preset.met * 3.5 * weightKg * minutes) / 200;
  elements.exerciseCalories.value = Math.round(calories);
}

function applyExercisePreset() {
  const preset = exercisePresets[elements.exerciseType.value] || exercisePresets.Running;
  elements.exerciseMinutes.value = preset.minutes;
  estimateExerciseCalories();
}

function fillExerciseFormForEdit(exercise) {
  editingExerciseId = exercise.id;
  elements.exerciseType.value = exercise.name;
  elements.exerciseMinutes.value = exercise.minutes;
  elements.exerciseCalories.value = Math.round(Number(exercise.calories || 0));
  elements.exerciseSubmit.textContent = "Save";
  elements.exerciseSection.classList.add("is-adding", "is-editing");
  document.body.classList.add("modal-open");
  syncExerciseModeHeader();
  renderEntries();
  elements.exerciseType.focus();
}

function resetExerciseForm() {
  elements.exerciseForm.reset();
  elements.exerciseSubmit.textContent = "+";
  editingExerciseId = null;
  elements.exerciseSection.classList.remove("is-editing");
  applyExercisePreset();
  clearEntryTransientState();
  syncExerciseModeHeader();
}

function normalizeExerciseCalories() {
  if (elements.exerciseCalories.value === "") return;
  elements.exerciseCalories.value = Math.round(Number(elements.exerciseCalories.value || 0));
}

elements.exerciseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const isEditing = Boolean(editingExerciseId);
  const exercise = {
    name: elements.exerciseType.value,
    minutes: Number(elements.exerciseMinutes.value),
    weightKg: Number(state.user?.weightKg || 75),
    calories: Math.round(Number(elements.exerciseCalories.value || 0)),
  };

  if (editingExerciseId) {
    currentDay().exercises = currentDay().exercises.map((entry) =>
      entry.id === editingExerciseId ? { ...entry, ...exercise, updatedAt: new Date().toISOString() } : entry,
    );
  } else {
    const addedId = crypto.randomUUID();
    currentDay().exercises.unshift({
      ...exercise,
      id: addedId,
      createdAt: new Date().toISOString(),
    });
    recentSuccess = { collection: "exercises", id: addedId };
  }

  saveState();
  render();
  resetExerciseForm();
  if (!isEditing) playSubmitSuccess(elements.exerciseSubmit);
  closeMobileLogForm(elements.exerciseSection);
});

elements.exerciseType.addEventListener("change", () => {
  if (editingExerciseId) {
    estimateExerciseCalories();
    return;
  }
  applyExercisePreset();
});
elements.exerciseMinutes.addEventListener("input", estimateExerciseCalories);
elements.exerciseCalories.addEventListener("input", normalizeExerciseCalories);
elements.addExerciseToggle.addEventListener("click", () => {
  openAddExerciseFromFab();
});
elements.closeExerciseModal.addEventListener("click", () => {
  closeMobileLogForm(elements.exerciseSection);
  resetExerciseForm();
});
elements.cancelExerciseEdit.addEventListener("click", () => {
  resetExerciseForm();
  renderEntries();
  elements.exerciseType.focus();
});
elements.deleteExerciseEdit.addEventListener("click", () => {
  if (!editingExerciseId) return;
  const entry = currentDay().exercises.find((exercise) => exercise.id === editingExerciseId);
  if (!entry) return;
  closeMobileLogForm(elements.exerciseSection);
  resetExerciseForm();
  deleteEntryWithUndo("exercises", entry);
});

elements.previousWeekButton.addEventListener("click", () => {
  state.selectedDate = localDateKey(addDays(dateFromKey(state.selectedDate), -7));
  ensureDay(state.selectedDate);
  saveState();
  render();
});

elements.nextWeekButton.addEventListener("click", () => {
  state.selectedDate = localDateKey(addDays(dateFromKey(state.selectedDate), 7));
  ensureDay(state.selectedDate);
  saveState();
  render();
});

elements.floatingAddButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  openAddFoodFromFab();
});
elements.fabAddFood?.addEventListener("click", openAddFoodFromFab);
elements.fabAddExercise?.addEventListener("click", openAddExerciseFromFab);
elements.fabSavedFoods?.addEventListener("click", openSavedFoodsFromFab);
elements.mobileFoodsTab?.addEventListener("click", (event) => {
  event.preventDefault();
  closeMobileLogForm(elements.foodSection);
  closeMobileLogForm(elements.exerciseSection);
  setFabMenuOpen(false);
  elements.foodSection.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.fabSheetClose?.addEventListener("click", () => setFabMenuOpen(false));
elements.fabOverlay?.addEventListener("click", () => {
  setFabMenuOpen(false);
  if (!document.body.classList.contains("modal-open")) return;
  closeMobileLogForm(elements.foodSection);
  closeMobileLogForm(elements.exerciseSection);
  resetFoodForm();
  resetExerciseForm();
});
document.addEventListener("click", (event) => {
  if (!elements.fabActions?.classList.contains("is-open")) return;
  if (event.target.closest("#fabActions") || event.target.closest("#floatingAddButton") || event.target.closest("#fabOverlay")) return;
  setFabMenuOpen(false);
});

elements.todayButton.addEventListener("click", () => {
  const todayKey = localDateKey(new Date());
  state.selectedDate = todayKey;
  ensureDay(todayKey);
  saveState();
  render();
});

elements.logoutButton.addEventListener("click", () => {
  if (!window.confirm("Are you sure you want to log out?")) return;
  state.user = null;
  saveState();
  window.location.href = "profile.html";
});

elements.sidebarToggle.addEventListener("click", () => {
  if (isMobileSidebar()) {
    setMobileSidebarOpen(false);
    return;
  }

  elements.appShell.classList.toggle("sidebar-collapsed");
  const isCollapsed = elements.appShell.classList.contains("sidebar-collapsed");
  localStorage.setItem("calorie-counter-sidebar-collapsed", String(isCollapsed));
});

elements.mobileMenuButton?.addEventListener("click", () => setMobileSidebarOpen(true));
elements.sidebarBackdrop?.addEventListener("click", () => setMobileSidebarOpen(false));
elements.appShell.querySelectorAll(".side-nav a").forEach((link) => {
  link.addEventListener("click", () => setMobileSidebarOpen(false));
});
let wasMobileViewport = isMobileSidebar();
window.addEventListener("resize", () => {
  const isNowMobile = isMobileSidebar();
  if (wasMobileViewport && !isNowMobile) {
    closeMobileOnlyViewsForDesktop();
  } else if (!isNowMobile) {
    setMobileSidebarOpen(false);
  }
  wasMobileViewport = isNowMobile;
});

window.addEventListener("focus", syncSelectedDateWithToday);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncSelectedDateWithToday();
});
setInterval(syncSelectedDateWithToday, 60 * 1000);

if (localStorage.getItem("calorie-counter-sidebar-collapsed") === "true") {
  elements.appShell.classList.add("sidebar-collapsed");
}
elements.foodMeal.value = defaultMealForNow();
updateFoodFilterTabs();
render();
requestAnimationFrame(openFoodsFromHash);
applyExercisePreset();
