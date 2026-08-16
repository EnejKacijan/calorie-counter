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
const appSessionKey = "calorie-counter-today-session-v1";
let isFreshAppLaunch = true;

try {
  isFreshAppLaunch = sessionStorage.getItem(appSessionKey) !== "active";
  sessionStorage.setItem(appSessionKey, "active");
} catch {
  // If session storage is unavailable, selecting today on load is the safe fallback.
  isFreshAppLaunch = true;
}
const maxRecentFoodItems = 100;
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
let foodNutritionOverridden = false;
let foodNutritionEditing = false;
let editingExerciseId = null;
let exerciseCaloriesOverridden = false;
let foodSearchFilter = "all";
let latestFoodSuggestions = [];
let foodSuggestionVisibleCount = 5;
let scannedFoodItems = [];
let scannedFoodAnalysis = null;
let undoToastTimer = null;
let renderSnapshot = null;
let recentSuccess = null;
let successCueTimer = null;
const foodSwipeHintSeenKey = "daily-fuel-food-swipe-hint-seen";
const foodSwipeHintUsedKey = "daily-fuel-food-swipe-hint-used";
const foodSwipeHintSessionKey = "daily-fuel-food-swipe-hint-session";
const modalOpeners = new WeakMap();
let desktopEditSession = null;
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
  fabScanFood: document.querySelector("#fabScanFood"),
  fabAddExercise: document.querySelector("#fabAddExercise"),
  fabSavedFoods: document.querySelector("#fabSavedFoods"),
  floatingScanButton: document.querySelector("#floatingScanButton"),
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
  ringCopy: document.querySelector(".ring-copy"),
  goalStatus: document.querySelector("#goalStatus"),
  calorieRing: document.querySelector("#calorieRing"),
  clearDayStreak: document.querySelector("#clearDayStreak"),
  clearDayStreakLabel: document.querySelector("#clearDayStreakLabel"),
  mobileClearDayStreak: document.querySelector("#mobileClearDayStreak"),
  mobileStreakValue: document.querySelector("#mobileStreakValue"),
  mobileStreakUnit: document.querySelector("#mobileStreakUnit"),
  mobileStreakBest: document.querySelector("#mobileStreakBest"),
  mobileWeightValue: document.querySelector("#mobileWeightValue"),
  mobileWeightDelta: document.querySelector("#mobileWeightDelta"),
  macroGrid: document.querySelector("#macroGrid"),
  foodSection: document.querySelector("#foodSection"),
  foodModeEyebrow: document.querySelector("#foodModeEyebrow"),
  foodModeTitle: document.querySelector("#foodModeTitle"),
  foodMobileHeaderTitle: document.querySelector("#foodMobileHeaderTitle"),
  cancelFoodEdit: document.querySelector("#cancelFoodEdit"),
  addFoodToggle: document.querySelector("#addFoodToggle"),
  closeFoodModal: document.querySelector("#closeFoodModal"),
  backFoodModal: document.querySelector("#backFoodModal"),
  manualFoodForm: document.querySelector("#manualFoodForm"),
  manualFoodName: document.querySelector("#manualFoodName"),
  foodNameLabel: document.querySelector(".food-name-field > span"),
  foodEditName: document.querySelector("#foodEditName"),
  foodEditSummary: document.querySelector("#foodEditSummary"),
  openScanReview: document.querySelector("#openScanReview"),
  foodAmount: document.querySelector("#foodAmount"),
  foodUnit: document.querySelector("#foodUnit"),
  foodMeal: document.querySelector("#foodMeal"),
  foodNutritionSummary: document.querySelector("#foodNutritionSummary"),
  foodNutritionGrid: document.querySelector("#foodNutritionGrid"),
  editFoodNutrition: document.querySelector("#editFoodNutrition"),
  foodNutritionCalories: document.querySelector("#foodNutritionCalories"),
  foodNutritionProtein: document.querySelector("#foodNutritionProtein"),
  foodNutritionCarbs: document.querySelector("#foodNutritionCarbs"),
  foodNutritionFat: document.querySelector("#foodNutritionFat"),
  manualFoodCalories: document.querySelector("#manualFoodCalories"),
  manualFoodProtein: document.querySelector("#manualFoodProtein"),
  manualFoodCarbs: document.querySelector("#manualFoodCarbs"),
  manualFoodFat: document.querySelector("#manualFoodFat"),
  manualFoodSubmit: document.querySelector("#manualFoodSubmit"),
  foodEditActions: document.querySelector("#foodEditActions"),
  deleteFoodEdit: document.querySelector("#deleteFoodEdit"),
  foodPhotoInput: document.querySelector("#foodPhotoInput"),
  foodGalleryInput: document.querySelector("#foodGalleryInput"),
  foodScanButton: document.querySelector("#foodScanButton"),
  foodScanMenu: document.querySelector("#foodScanMenu"),
  foodFilterBar: document.querySelector(".food-filter-tabs"),
  foodFilterTabs: Array.from(document.querySelectorAll("[data-food-filter]")),
  addModeButtons: Array.from(document.querySelectorAll("[data-add-mode]")),
  foodPhotoButton: document.querySelector("#foodPhotoButton"),
  foodGalleryButton: document.querySelector("#foodGalleryButton"),
  foodGalleryShortcut: document.querySelector("#foodGalleryShortcut"),
  foodPhotoStatus: document.querySelector("#foodPhotoStatus"),
  foodScanLoading: document.querySelector("#foodScanLoading"),
  scanReview: document.querySelector("#scanReview"),
  scanFoodList: document.querySelector("#scanFoodList"),
  scanReviewMeal: document.querySelector("#scanReviewMeal"),
  closeScanReview: document.querySelector("#closeScanReview"),
  scanSelectedCount: document.querySelector("#scanSelectedCount"),
  scanTotalCalories: document.querySelector("#scanTotalCalories"),
  scanTotalProtein: document.querySelector("#scanTotalProtein"),
  scanTotalCarbs: document.querySelector("#scanTotalCarbs"),
  scanTotalFat: document.querySelector("#scanTotalFat"),
  scanAddSelectedFoods: document.querySelector("#scanAddSelectedFoods"),
  copyYesterdayButton: document.querySelector("#copyYesterdayButton"),
  foodSuggestions: document.querySelector("#foodSuggestions"),
  manualFoodShortcut: document.querySelector("#manualFoodShortcut"),
  savedFoods: document.querySelector("#savedFoods"),
  recentFoods: document.querySelector("#recentFoods"),
  searchNote: document.querySelector("#searchNote"),
  foodEntryCount: document.querySelector("#foodEntryCount"),
  foodSwipeHint: document.querySelector("#foodSwipeHint"),
  foodList: document.querySelector("#foodList"),
  exerciseSection: document.querySelector("#exerciseSection"),
  exerciseModeEyebrow: document.querySelector("#exerciseModeEyebrow"),
  exerciseModeTitle: document.querySelector("#exerciseModeTitle"),
  exerciseMobileHeaderTitle: document.querySelector("#exerciseMobileHeaderTitle"),
  cancelExerciseEdit: document.querySelector("#cancelExerciseEdit"),
  exerciseForm: document.querySelector("#exerciseForm"),
  addExerciseToggle: document.querySelector("#addExerciseToggle"),
  closeExerciseModal: document.querySelector("#closeExerciseModal"),
  exerciseType: document.querySelector("#exerciseType"),
  exerciseMinutes: document.querySelector("#exerciseMinutes"),
  exerciseCalories: document.querySelector("#exerciseCalories"),
  exerciseEstimate: document.querySelector("#exerciseEstimate"),
  exerciseEstimateCopy: document.querySelector("#exerciseEstimateCopy"),
  exerciseCaloriesEstimate: document.querySelector("#exerciseCaloriesEstimate"),
  exerciseCaloriesNote: document.querySelector("#exerciseCaloriesNote"),
  exerciseManualEstimateNote: document.querySelector("#exerciseManualEstimateNote"),
  exerciseCaloriesEdit: document.querySelector("#exerciseCaloriesEdit"),
  exerciseSubmit: document.querySelector("#exerciseSubmit"),
  exerciseEditActions: document.querySelector("#exerciseEditActions"),
  deleteExerciseEdit: document.querySelector("#deleteExerciseEdit"),
  exerciseEntryCount: document.querySelector("#exerciseEntryCount"),
  exerciseList: document.querySelector("#exerciseList"),
  desktopEditModal: document.querySelector("#desktopEditModal"),
  desktopEditDialog: document.querySelector("#desktopEditDialog"),
  desktopEditModalBody: document.querySelector("#desktopEditModalBody"),
  desktopEditModalClose: document.querySelector("#desktopEditModalClose"),
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
    if (isFreshAppLaunch || nextState.lastOpenedDate !== todayKey) {
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
    return Array.isArray(saved) ? uniqueRecentFoods(saved.map(normalizeFoodForLibrary).filter(Boolean)).slice(0, maxRecentFoodItems) : [];
  } catch {
    return [];
  }
}

function loadSavedFoods() {
  // Older releases cleared this key during a one-time migration. Keep any
  // existing collection intact: saved foods are explicitly user-owned data.
  if (!localStorage.getItem(savedFoodMigrationKey)) {
    localStorage.setItem(savedFoodMigrationKey, "true");
  }

  try {
    const saved = JSON.parse(localStorage.getItem(savedFoodLibraryKey) || "[]");
    return Array.isArray(saved) ? uniqueSavedFoods(saved.map(normalizeFoodForLibrary).filter(Boolean)) : [];
  } catch {
    return [];
  }
}

function saveFoodLibrary() {
  localStorage.setItem(foodLibraryKey, JSON.stringify(uniqueRecentFoods(foodLibrary).slice(0, maxRecentFoodItems)));
}

function saveSavedFoods() {
  localStorage.setItem(savedFoodLibraryKey, JSON.stringify(uniqueSavedFoods(savedFoods)));
}

function normalizeFoodForLibrary(food) {
  if (!food?.name) return null;
  const originalSource = foodSource(food);
  const catalogId = String(food.catalogId || (/^(?:usda|off)-/i.test(String(food.id || "")) ? food.id : "")).trim();
  return {
    id: food.id || catalogId || `custom-${foodKey(food)}`,
    catalogId,
    name: food.name,
    brand: food.brand || "",
    source: originalSource,
    serving: food.serving || (food.amount && food.unit ? `${food.amount} ${food.unit}` : "1 serving"),
    servingGrams: Number(food.servingGrams || 0) || null,
    calories: Math.round(Number(food.calories || 0)),
    protein: Math.round(Number(food.protein || 0)),
    carbs: Math.round(Number(food.carbs || 0)),
    fat: Math.round(Number(food.fat || 0)),
    savedAt: food.savedAt || new Date().toISOString(),
    lastUsedAt: food.lastUsedAt || food.loggedAt || food.updatedAt || food.createdAt || food.savedAt || new Date().toISOString(),
    useCount: Math.max(1, Number(food.useCount || 0) || 1),
    lastUsedAmount: Number(food.lastUsedAmount ?? food.amount ?? 0) || null,
    lastUsedUnit: food.lastUsedUnit || food.unit || "",
  };
}

function foodKey(food) {
  return `${food.name || ""}-${food.brand || ""}-${food.serving || food.amount || ""}-${food.unit || ""}`.toLowerCase();
}

function savedFoodKey(food) {
  return foodIdentityKey(food);
}

function recentFoodKey(food) {
  return foodIdentityKey(food);
}

function normalizedFoodText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function foodSource(food) {
  const source = String(food?.originalSource || food?.source || "").trim();
  return /^(?:recent|saved)$/i.test(source) ? "" : source;
}

function foodIdentityKey(food) {
  const catalogId = String(food?.catalogId || "").trim();
  const id = String(food?.id || "").trim();
  const stableId = catalogId || (/^(?:usda|off)-/i.test(id) ? id : "");
  if (stableId) return `id:${stableId.toLowerCase()}`;

  const source = normalizedFoodText(foodSource(food));
  const name = normalizedFoodText(food?.name);
  const brand = normalizedFoodText(food?.brand);
  return `${source || "manual"}:${name}:${brand}`;
}

function foodNameBrandKey(food) {
  return `${normalizedFoodText(food?.name)}:${normalizedFoodText(food?.brand)}`;
}

function foodsShareIdentity(left, right) {
  if (foodIdentityKey(left) === foodIdentityKey(right)) return true;
  // Saved entries from the old schema used "Saved" as their source and did
  // not retain the catalog ID. Match those entries by their remaining stable
  // display identity so existing favourites still work after this upgrade.
  return (!foodSource(left) || !foodSource(right)) && foodNameBrandKey(left) === foodNameBrandKey(right);
}

function uniqueSavedFoods(foods) {
  const foodMap = new Map();
  foods.forEach((food) => {
    const key = savedFoodKey(food);
    if (!key.trim()) return;
    const existing = foodMap.get(key);
    if (!existing || String(food.savedAt || "").localeCompare(String(existing.savedAt || "")) >= 0) {
      foodMap.set(key, food);
    }
  });
  return [...foodMap.values()].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

function uniqueRecentFoods(foods) {
  const foodMap = new Map();
  foods.forEach((food) => {
    const key = recentFoodKey(food);
    if (!key) return;
    const existing = foodMap.get(key);
    if (!existing || String(food.lastUsedAt || "").localeCompare(String(existing.lastUsedAt || "")) >= 0) {
      foodMap.set(key, {
        ...existing,
        ...food,
        useCount: Math.max(Number(existing?.useCount || 0), Number(food.useCount || 0), 1),
      });
    }
  });
  return [...foodMap.values()].sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")));
}

function rememberFoods(foods) {
  const nextFoods = foods.map(normalizeFoodForLibrary).filter(Boolean);
  if (!nextFoods.length) return;

  const foodMap = new Map(foodLibrary.map((food) => [recentFoodKey(food), food]));
  const now = new Date().toISOString();
  nextFoods.forEach((food) => {
    const key = recentFoodKey(food);
    const existing = foodMap.get(key);
    foodMap.set(key, {
      ...existing,
      ...food,
      lastUsedAt: now,
      useCount: Number(existing?.useCount || 0) + 1,
    });
  });

  foodLibrary = uniqueRecentFoods([...foodMap.values()]
    .sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")))
  ).slice(0, maxRecentFoodItems);
  saveFoodLibrary();
}

function isFoodSaved(food) {
  const candidate = foodForSaving(food);
  return savedFoods.some((savedFood) => foodsShareIdentity(savedFood, candidate));
}

function foodForSaving(food) {
  return normalizeFoodForLibrary({
    ...food,
    source: foodSource(food) || "Manual",
    serving: food.serving || (food.amount && food.unit ? `${food.amount} ${food.unit}` : "1 serving"),
  });
}

function toggleSavedFood(food) {
  const normalizedFood = foodForSaving(food);

  if (isFoodSaved(normalizedFood)) {
    savedFoods = savedFoods.filter((savedFood) => !foodsShareIdentity(savedFood, normalizedFood));
    elements.searchNote.textContent = `${normalizedFood.name} removed from saved foods.`;
  } else {
    savedFoods = uniqueSavedFoods([
      { ...normalizedFood, savedAt: new Date().toISOString() },
      ...savedFoods.filter((savedFood) => !foodsShareIdentity(savedFood, normalizedFood)),
    ]);
    elements.searchNote.textContent = `${normalizedFood.name} saved.`;
  }

  saveSavedFoods();
  renderEntries();
  renderSavedFoods();
}

function syncDesktopSavedFoodToggle(button) {
  const entry = currentDay().foods.find((food) => food.id === editingFoodId);
  if (!entry) {
    button.hidden = true;
    return;
  }

  const saved = isFoodSaved(entry);
  button.hidden = false;
  button.classList.toggle("is-saved", saved);
  button.textContent = saved ? "\u2665 Saved" : "\u2661 Save food";
  button.title = saved ? "Unsave food" : "Save food";
  button.setAttribute("aria-label", saved ? "Unsave food" : "Save food");
  button.setAttribute("aria-pressed", String(saved));
}

function addDesktopSavedFoodToggle(content) {
  const header = content.querySelector(".food-mode-header");
  if (!header || !editingFoodId) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "desktop-saved-food-toggle";
  button.addEventListener("click", () => {
    const entry = currentDay().foods.find((food) => food.id === editingFoodId);
    if (!entry) return;
    toggleSavedFood(entry);
    syncDesktopSavedFoodToggle(button);
  });
  syncDesktopSavedFoodToggle(button);
  header.append(button);
}

function searchFoodLibrary(query) {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 2) return [];

  const matches = [...savedFoods, ...foodLibrary, ...stapleFoodLibrary]
    .filter((food) => [food.name, food.brand, food.source, food.serving].some((value) => String(value || "").toLowerCase().includes(cleanQuery)));
  return rankFoodSuggestions(dedupeFoodSuggestions(matches), cleanQuery).slice(0, 12);
}

function foodServingLabel(food) {
  const fallback = Number(food?.servingGrams || 0) > 0 ? `${Math.round(Number(food.servingGrams))} g` : "1 serving";
  return String(food?.serving || fallback)
    .trim()
    .replace(/^per\s+/i, "")
    .replace(/(\d)\s*(?:g|gr|grm|gram|grams)\b/gi, "$1 g");
}

function foodSuggestionScore(food, query) {
  const name = String(food?.name || "").trim().toLowerCase();
  const serving = foodServingLabel(food).toLowerCase();
  const source = String(food?.source || food?.brand || "").toLowerCase();
  const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;

  if (name === query) score += 120;
  else if (name.startsWith(`${query},`) || name.startsWith(`${query} `)) score += 84;
  else if (name.startsWith(query)) score += 64;
  else if (name.includes(query)) score += 30;
  score += words.filter((word) => name.includes(word)).length * 12;

  if (/\b(?:small|medium|large|cup|piece|whole)\b/.test(serving)) score += 24;
  if (/\braw\b/.test(name)) score += 16;
  if (/^100 g$/.test(serving)) score += 10;
  if (source.includes("usda")) score += 8;
  if (food?.brand) score -= 5;
  if (/\b(?:dehydrated|dried|powder|flour|chips?|baked|fried|candy|sweetened)\b/.test(name)) score -= 42;
  score -= Math.min(name.length, 100) * 0.1;
  return score;
}

function rankFoodSuggestions(foods, query) {
  const cleanQuery = String(query || "").trim().toLowerCase();
  if (!cleanQuery) return [...foods];
  return [...foods].sort((left, right) => foodSuggestionScore(right, cleanQuery) - foodSuggestionScore(left, cleanQuery));
}

function dedupeFoodSuggestions(foods) {
  const seen = new Set();
  return foods.filter((food) => {
    const key = foodIdentityKey(food);
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

function isPhoneAddFoodLayout() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function isDesktopEditLayout() {
  return window.matchMedia("(min-width: 921px)").matches;
}

function supportsEntrySwipe() {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

function focusWhenKeyboardIsStable(input) {
  if (!input || isMobileSidebar()) return;
  input.focus();
}

function modalFocusableElements(section) {
  return Array.from(section.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function setLogModalBackgroundInert(section, isInert) {
  let current = section;
  while (current.parentElement) {
    Array.from(current.parentElement.children)
      .filter((element) => element !== current)
      .forEach((target) => { target.inert = isInert; });
    current = current.parentElement;
  }
}

function setMobileSidebarOpen(isOpen) {
  elements.appShell.classList.toggle("mobile-sidebar-open", isOpen);
  elements.mobileMenuButton?.setAttribute("aria-expanded", String(isOpen));
}

function openMobileLogForm(section, input) {
  setFabMenuOpen(false);
  modalOpeners.set(section, document.activeElement);
  section.classList.add("is-adding");
  if (elements.foodSwipeHint) elements.foodSwipeHint.hidden = true;
  section.setAttribute("role", "dialog");
  section.setAttribute("aria-modal", "true");
  section.setAttribute("aria-labelledby", section === elements.foodSection ? "foodModeTitle" : "exerciseModeTitle");
  setLogModalBackgroundInert(section, true);
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    if (isMobileSidebar()) {
      (section === elements.foodSection ? elements.closeFoodModal : elements.closeExerciseModal)?.focus();
    } else {
      focusWhenKeyboardIsStable(input);
    }
  });
}

function openDesktopEditModal(section, input) {
  if (!elements.desktopEditModal || !elements.desktopEditModalBody || desktopEditSession) return;

  const isFood = section === elements.foodSection;
  const nodes = [
    section.querySelector(isFood ? ".food-mode-header" : ".exercise-mode-header"),
    section.querySelector(isFood ? "#manualFoodForm" : "#exerciseForm"),
    section.querySelector(isFood ? "#foodEditActions" : "#exerciseEditActions"),
  ].filter(Boolean);
  const placements = nodes.map((node) => {
    const marker = document.createComment("desktop-edit-modal-placement");
    node.before(marker);
    return { node, marker };
  });
  const content = document.createElement("div");
  content.className = `desktop-edit-modal-content log-panel ${isFood ? "food-log is-editing is-detailing" : "exercise-log is-editing"}`;
  nodes.forEach((node) => content.append(node));
  if (isFood) addDesktopSavedFoodToggle(content);

  modalOpeners.set(section, document.activeElement);
  desktopEditSession = { kind: "edit", section, placements, content };
  section.classList.add("is-desktop-editing");
  elements.desktopEditModalBody.replaceChildren(content);
  elements.desktopEditDialog?.setAttribute("aria-labelledby", isFood ? "foodModeTitle" : "exerciseModeTitle");
  elements.desktopEditModal.hidden = false;
  elements.desktopEditModal.setAttribute("aria-hidden", "false");
  elements.appShell.inert = true;
  document.querySelector(".mobile-tabbar")?.setAttribute("inert", "");
  document.body.classList.add("desktop-edit-modal-open");
  if (isFood) syncFoodNutritionMode();

  requestAnimationFrame(() => {
    (input || elements.desktopEditModalClose)?.focus();
  });
}

function isDesktopFoodAddModal() {
  return desktopEditSession?.kind === "add-food" && desktopEditSession.section === elements.foodSection;
}

function syncDesktopFoodAddContentState() {
  if (!isDesktopFoodAddModal()) return;
  const { content } = desktopEditSession;
  const isDetailing = elements.foodSection.classList.contains("is-detailing");
  const isManualEntry = elements.foodSection.classList.contains("is-manual-entry");
  content.classList.toggle("is-browsing", !isDetailing);
  content.classList.toggle("is-detailing", isDetailing);
  content.classList.toggle("is-manual-entry", isManualEntry);
  content.classList.toggle("is-searching", elements.foodSection.classList.contains("is-searching"));
  const backButton = content.querySelector(".desktop-add-food-back");
  if (backButton) backButton.hidden = !isDetailing;
}

function rememberDesktopFoodBrowseState() {
  if (!isDesktopFoodAddModal() || !desktopEditSession.content.classList.contains("is-browsing")) return;
  desktopEditSession.browseQuery = elements.manualFoodName.value;
  desktopEditSession.browseScrollTop = elements.desktopEditModalBody?.scrollTop || 0;
}

function restoreDesktopFoodBrowse() {
  if (!isDesktopFoodAddModal()) return;
  const { browseQuery = "", browseScrollTop = 0 } = desktopEditSession;
  selectedFoodBase = null;
  foodNutritionOverridden = false;
  foodNutritionEditing = false;
  elements.foodSection.classList.remove("is-detailing", "is-manual-entry", "is-nutrition-editing");
  elements.manualFoodName.readOnly = false;
  elements.manualFoodName.placeholder = "Search food";
  elements.manualFoodName.value = browseQuery;
  elements.manualFoodSubmit.disabled = false;
  elements.foodNameLabel.textContent = "Search food";
  syncDesktopFoodAddContentState();
  syncFoodNutritionMode();

  if (browseQuery.trim().length >= 2) {
    renderSuggestions(latestFoodSuggestions, { remember: false, preserveLimit: true });
    if (!latestFoodSuggestions.length) searchFoodSuggestions(browseQuery).catch(() => {});
  } else {
    showBrowseFoodSuggestions();
  }

  requestAnimationFrame(() => {
    if (elements.desktopEditModalBody) elements.desktopEditModalBody.scrollTop = browseScrollTop;
    elements.manualFoodName.focus();
  });
}

function openDesktopAddFoodModal(input) {
  if (!elements.desktopEditModal || !elements.desktopEditModalBody || desktopEditSession) return;

  const section = elements.foodSection;
  const nodes = [
    section.querySelector(".food-mode-header"),
    section.querySelector("#manualFoodForm"),
  ].filter(Boolean);
  const placements = nodes.map((node) => {
    const marker = document.createComment("desktop-add-food-modal-placement");
    node.before(marker);
    return { node, marker };
  });
  const content = document.createElement("div");
  content.className = "desktop-edit-modal-content desktop-add-food-content log-panel food-log is-adding is-browsing";
  nodes.forEach((node) => content.append(node));

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "desktop-add-food-back";
  backButton.textContent = "← Back to search";
  backButton.hidden = true;
  backButton.addEventListener("click", restoreDesktopFoodBrowse);
  content.querySelector(".food-mode-header")?.append(backButton);

  modalOpeners.set(section, document.activeElement);
  desktopEditSession = { kind: "add-food", section, placements, content, browseQuery: elements.manualFoodName.value, browseScrollTop: 0 };
  elements.manualFoodShortcut.textContent = "Enter food manually →";
  elements.foodNameLabel.textContent = "Search food";
  elements.desktopEditModalBody.replaceChildren(content);
  elements.desktopEditDialog?.setAttribute("aria-labelledby", "foodModeTitle");
  elements.desktopEditModal.hidden = false;
  elements.desktopEditModal.setAttribute("aria-hidden", "false");
  elements.appShell.inert = true;
  document.querySelector(".mobile-tabbar")?.setAttribute("inert", "");
  document.body.classList.add("desktop-edit-modal-open");
  syncFoodModeHeader();
  syncDesktopFoodAddContentState();

  requestAnimationFrame(() => {
    (input || elements.desktopEditModalClose)?.focus();
  });
}

function closeDesktopEditModal(section) {
  if (!desktopEditSession || desktopEditSession.section !== section) return false;
  const { placements, kind } = desktopEditSession;
  placements.forEach(({ node, marker }) => {
    if (marker.isConnected) marker.replaceWith(node);
  });
  elements.desktopEditModalBody?.replaceChildren();
  elements.desktopEditModal.hidden = true;
  elements.desktopEditModal.setAttribute("aria-hidden", "true");
  elements.desktopEditDialog?.removeAttribute("aria-labelledby");
  elements.appShell.inert = false;
  document.querySelector(".mobile-tabbar")?.removeAttribute("inert");
  document.body.classList.remove("desktop-edit-modal-open");
  section.classList.remove("is-desktop-editing");
  if (kind === "add-food") {
    elements.manualFoodShortcut.textContent = "Enter food manually";
    elements.foodNameLabel.textContent = "Food name (required)";
  }
  const opener = modalOpeners.get(section);
  modalOpeners.delete(section);
  desktopEditSession = null;
  if (opener?.isConnected) requestAnimationFrame(() => opener.focus());
  return true;
}

function openEditLogForm(section, input) {
  if (isDesktopEditLayout()) {
    openDesktopEditModal(section, input);
    return;
  }
  openMobileLogForm(section, input);
}

function closeEditLogForm(section) {
  if (closeDesktopEditModal(section)) return;
  closeMobileLogForm(section);
}

function closeMobileLogForm(section) {
  const wasOpen = section.classList.contains("is-adding");
  const opener = modalOpeners.get(section);
  const selectedEntry = section.querySelector(".entry-card.is-selected");
  section.classList.remove("is-adding");
  section.removeAttribute("role");
  section.removeAttribute("aria-modal");
  section.removeAttribute("aria-labelledby");
  setLogModalBackgroundInert(section, false);
  clearEntryTransientState();
  if (!document.querySelector(".log-panel.is-adding")) {
    document.body.classList.remove("modal-open");
    updateFoodSwipeHint(currentDay().foods.length > 0);
  }
  const fallback = selectedEntry
    || (section === elements.foodSection ? elements.addFoodToggle : elements.addExerciseToggle);
  const restoreTarget = opener?.isConnected ? opener : fallback;
  if (wasOpen && restoreTarget?.isConnected) requestAnimationFrame(() => restoreTarget.focus());
  modalOpeners.delete(section);
}

document.addEventListener("keydown", (event) => {
  const section = desktopEditSession?.section || document.querySelector(".log-panel.is-adding");
  if (!section) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (desktopEditSession) {
      closeEditLogForm(section);
      if (section === elements.foodSection) resetFoodForm();
      else resetExerciseForm();
    } else {
      (section === elements.foodSection ? elements.closeFoodModal : elements.closeExerciseModal)?.click();
    }
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = modalFocusableElements(desktopEditSession ? elements.desktopEditDialog : section);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

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
    button.removeAttribute("aria-pressed");
    button.setAttribute("aria-selected", String(isActive));
  });
}

function openAddFoodFromFab() {
  const switchingFromExercise = elements.exerciseSection.classList.contains("is-adding");
  const returnTarget = modalOpeners.get(elements.exerciseSection)?.isConnected
    ? modalOpeners.get(elements.exerciseSection)
    : elements.exerciseSection.querySelector(".entry-card.is-selected") || elements.floatingAddButton;
  setFabMenuOpen(false);
  closeMobileLogForm(elements.exerciseSection);
  if (editingExerciseId) resetExerciseForm();
  if (editingFoodId) resetFoodForm();
  foodSearchFilter = "all";
  updateFoodFilterTabs();
  elements.foodSection.classList.remove("is-viewing-saved");
  syncAddModeButtons("food");
  if (isDesktopEditLayout() && !supportsEntrySwipe()) openDesktopAddFoodModal(elements.manualFoodName);
  else openMobileLogForm(elements.foodSection, elements.manualFoodName);
  if (!elements.manualFoodName.value.trim()) showBrowseFoodSuggestions();
  if (switchingFromExercise && returnTarget?.isConnected) modalOpeners.set(elements.foodSection, returnTarget);
}

function openAddExerciseFromFab() {
  const switchingFromFood = elements.foodSection.classList.contains("is-adding");
  const returnTarget = modalOpeners.get(elements.foodSection)?.isConnected
    ? modalOpeners.get(elements.foodSection)
    : elements.foodSection.querySelector(".entry-card.is-selected") || elements.floatingAddButton;
  setFabMenuOpen(false);
  elements.foodSection.classList.remove("is-viewing-saved", "is-searching", "is-detailing", "is-reviewing-scan");
  closeMobileLogForm(elements.foodSection);
  if (editingFoodId || selectedFoodBase || scannedFoodItems.length) resetFoodForm();
  if (editingExerciseId) resetExerciseForm();
  syncAddModeButtons("exercise");
  openMobileLogForm(elements.exerciseSection, elements.exerciseType);
  if (switchingFromFood && returnTarget?.isConnected) modalOpeners.set(elements.exerciseSection, returnTarget);
}

function openSavedFoodsFromFab() {
  setFabMenuOpen(false);
  if (editingFoodId) resetFoodForm();
  elements.foodSection.classList.add("is-viewing-saved");
  openMobileLogForm(elements.foodSection, null);
}

function openFoodScanFromFab() {
  openAddFoodFromFab();
  window.setTimeout(() => elements.foodPhotoInput?.click(), 0);
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
  if (!["#foods", "#add-food"].includes(window.location.hash)) return;
  if (window.location.hash === "#add-food") {
    openAddFoodFromFab();
  } else {
    closeMobileLogForm(elements.foodSection);
    closeMobileLogForm(elements.exerciseSection);
    elements.foodSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

function showFoodFormFromSavedFoods() {
  elements.foodSection.classList.remove("is-viewing-saved");
  focusWhenKeyboardIsStable(elements.manualFoodName);
}

function syncSelectedDateWithToday() {
  const todayKey = localDateKey(new Date());
  if (state.lastOpenedDate === todayKey) return;

  state.lastOpenedDate = todayKey;
  state.selectedDate = todayKey;
  ensureDay(todayKey);
  saveState();
  render();
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

const streakWindowMs = 24 * 60 * 60 * 1000;

function isFutureDateKey(dateKey) {
  return typeof dateKey === "string" && dateKey > localDateKey(new Date());
}

function streakTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function foodLoggedForDate(food, fallbackDateKey) {
  return food.loggedForDate || food.logged_for_date || fallbackDateKey;
}

function isFoodExcludedFromStreak(food, fallbackDateKey) {
  return food.excludedFromStreak === true || isFutureDateKey(foodLoggedForDate(food, fallbackDateKey));
}

function foodActivityTimestamps() {
  return Object.entries(state.days || {})
    .flatMap(([dateKey, day]) =>
      (day?.foods || [])
        .filter((food) => !isFoodExcludedFromStreak(food, dateKey))
        .map((food) => streakTimestamp(food.createdAt || food.created_at))
        .filter((timestamp) => timestamp !== null),
    )
    .sort((a, b) => a - b);
}

function foodActivityStreak(now = new Date()) {
  const nowTime = now.getTime();
  let streak = 0;
  let windowStartedAt = null;
  let lastActivityAt = null;

  foodActivityTimestamps().forEach((activityAt) => {
    if (activityAt > nowTime) return;

    if (lastActivityAt === null || activityAt - lastActivityAt > streakWindowMs) {
      streak = 1;
      windowStartedAt = activityAt;
      lastActivityAt = activityAt;
      return;
    }

    if (activityAt - windowStartedAt >= streakWindowMs) {
      streak += 1;
      windowStartedAt = activityAt;
    }

    lastActivityAt = activityAt;
  });

  if (lastActivityAt === null || nowTime - lastActivityAt > streakWindowMs) return 0;
  return streak;
}

function bestFoodDayStreak() {
  const foodDayKeys = Object.entries(state.days || {})
    .filter(([dateKey, day]) => !isFutureDateKey(dateKey) && (day?.foods || []).some((food) => !isFoodExcludedFromStreak(food, dateKey)))
    .map(([dateKey]) => dateKey)
    .sort();

  let best = 0;
  let current = 0;
  let previousKey = null;

  foodDayKeys.forEach((dateKey) => {
    const isConsecutive = previousKey
      && dateFromKey(dateKey).getTime() - dateFromKey(previousKey).getTime() === streakWindowMs;
    current = isConsecutive ? current + 1 : 1;
    best = Math.max(best, current);
    previousKey = dateKey;
  });

  return best;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
  setAnimatedMetric(elements.consumedCalories, Math.round(isOverGoal ? Math.abs(remaining) : remaining), "", "remainingRing");
  setAnimatedMetric(elements.netCaloriesTotal, Math.round(daily.netCalories), "", "netCalories");
  const streak = foodActivityStreak();
  const streakLabel = `${streak} ${streak === 1 ? "day" : "days"}`;
  elements.clearDayStreak.textContent = streak;
  elements.clearDayStreakLabel.textContent = streak === 1 ? "food day" : "food days";
  elements.mobileClearDayStreak.textContent = `${streakLabel} streak`;
  elements.mobileStreakValue.textContent = streak;
  elements.mobileStreakUnit.textContent = streak === 1 ? "day" : "days";
  const bestStreak = bestFoodDayStreak();
  elements.mobileStreakBest.hidden = bestStreak === 0;
  elements.mobileStreakBest.textContent = bestStreak ? `Best: ${bestStreak} ${bestStreak === 1 ? "day" : "days"}` : "";
  renderMobileWeightStat();
  elements.goalCaloriesText.textContent = state.goals.calories;
  elements.ringCopy.classList.toggle("is-over", isOverGoal);
  elements.calorieRing.style.strokeDashoffset = ringLength - ringLength * calorieProgress;
  elements.calorieRing.classList.toggle("is-empty", calorieProgress === 0);
  elements.calorieRing.classList.toggle("is-under", hasExerciseDeficit);
  elements.calorieRing.classList.toggle("is-over", isOverGoal);
  elements.goalStatus.classList.toggle("is-under", hasExerciseDeficit);
  elements.goalStatus.classList.toggle("is-over", isOverGoal);
  elements.goalStatus.textContent = hasExerciseDeficit ? "Below zero" : isOverGoal ? "Over goal" : "On track";
  elements.goalHelper.textContent = hasExerciseDeficit
    ? "Exercise is higher than food so far. Your net calories are below zero."
    : isOverGoal
      ? `You're ${Math.round(Math.abs(remaining))} kcal over your daily target.`
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
    remainingRing: Math.round(isOverGoal ? Math.abs(remaining) : remaining),
    macros: Object.fromEntries(macroConfig.map((macro) => {
      const goal = state.goals[macro.key];
      const progress = goal > 0 ? Math.max(0, Math.min((daily[macro.key] / goal) * 100, 100)) : 0;
      return [macro.key, progress];
    })),
    macroValues: Object.fromEntries(macroConfig.map((macro) => [macro.key, Math.round(Number(daily[macro.key] || 0))])),
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
  elements.mobileWeightDelta.hidden = !delta;
  elements.mobileWeightDelta.textContent = delta ? `${delta > 0 ? "+" : ""}${formatDecimal(delta, 1)} kg since start` : "";
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
  const glyph = button.querySelector(".floating-add-glyph");
  const previousText = glyph ? glyph.textContent : button.textContent;
  button.classList.add("is-success");
  if (glyph) glyph.textContent = "✓";
  else button.textContent = "✓";
  setTimeout(() => {
    button.classList.remove("is-success");
    if (button === elements.floatingAddButton && glyph) glyph.textContent = "+";
    else if (button === elements.floatingAddButton) button.textContent = "+";
    else if (!editingFoodId && button === elements.manualFoodSubmit) button.textContent = "Add food";
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

  macroConfig.forEach((macro, index) => {
    const consumed = daily[macro.key];
    const roundedConsumed = Math.round(Number(consumed || 0));
    const goal = state.goals[macro.key];
    const progress = goal > 0 ? Math.max(0, Math.min((consumed / goal) * 100, 100)) : 0;
    const isOver = consumed > goal;
    const remaining = Math.abs(goal - consumed);
    const macroOverageLabel = isOver ? `<em class="macro-overage"><span>+${Math.round(Number(remaining || 0))}</span><span class="macro-overage-unit"> ${macro.unit}</span></em>` : "";
    const progressLabel = `${Math.round(progress)}%`;
    const previousConsumed = renderSnapshot?.macroValues?.[macro.key];
    const initialConsumed = previousConsumed === undefined ? roundedConsumed : previousConsumed;
    const macroAmountLabel = `<span class="macro-eaten">${initialConsumed}</span><span class="macro-goal"><span class="macro-goal-desktop"> / ${Math.round(Number(goal || 0))} ${macro.unit}</span><span class="macro-goal-mobile">/${Math.round(Number(goal || 0))}${macro.unit}</span></span>${macroOverageLabel}`;
    const macroConsumedLabel = `${initialConsumed}${macro.unit}`;
    const macroGoalLabel = `of ${Math.round(Number(goal || 0))}${macro.unit}`;
    const previousProgress = renderSnapshot?.macros?.[macro.key];
    const initialBarProgress = previousProgress === undefined ? progress : previousProgress;
    const progressOffset = 113.1 - 113.1 * (progress / 100);
    const initialProgressOffset = previousProgress === undefined
      ? progressOffset
      : 113.1 - 113.1 * (previousProgress / 100);

    const card = document.createElement("article");
    card.className = "macro-card";
    card.classList.add(`is-${macro.key}`);
    card.style.setProperty("--macro-animation-index", index);
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
          <span style="width:${initialBarProgress}%; background:${macro.color}"></span>
        </div>
        <div class="macro-card-footer">
          <p class="label">${isOver ? `${formatMacro(remaining, macro.unit)} over` : `${formatMacro(remaining, macro.unit)} left`}</p>
          <p class="label">${progressLabel}</p>
        </div>
      </div>
    `;
    elements.macroGrid.appendChild(card);
    if (previousConsumed !== undefined && previousConsumed !== roundedConsumed) {
      animateNumber(card.querySelector(".macro-eaten"), previousConsumed, roundedConsumed);
      animateNumber(card.querySelector(".macro-ring-value"), previousConsumed, roundedConsumed, macro.unit);
    }
    if (previousProgress !== undefined && previousProgress !== progress) {
      const progressCircle = card.querySelector(".macro-ring-progress");
      const progressBar = card.querySelector(".macro-bar span");
      progressBar.getBoundingClientRect();
      requestAnimationFrame(() => {
        progressCircle.style.strokeDashoffset = progressOffset;
        progressBar.style.width = `${progress}%`;
      });
    }
  });
}

function renderEntries() {
  const day = currentDay();
  const logHeading = selectedLogHeading();
  syncFoodModeHeader();
  syncExerciseModeHeader();
  elements.foodList.dataset.count = `${day.foods.length} ${day.foods.length === 1 ? "entry" : "entries"}`;
  elements.foodSection.dataset.count = elements.foodList.dataset.count;
  elements.foodSection.style.setProperty("--food-entry-count", `"${elements.foodList.dataset.count}"`);
  elements.foodEntryCount.textContent = elements.foodList.dataset.count;
  elements.foodEntryCount.parentElement.dataset.count = elements.foodList.dataset.count;
  const foodHeadingLabel = elements.foodSection.querySelector(".logged-list-heading > .label");
  if (foodHeadingLabel) foodHeadingLabel.textContent = logHeading;
  elements.exerciseList.dataset.count = `${day.exercises.length} ${day.exercises.length === 1 ? "entry" : "entries"}`;
  elements.exerciseSection.dataset.count = elements.exerciseList.dataset.count;
  elements.exerciseSection.style.setProperty("--exercise-entry-count", `"${elements.exerciseList.dataset.count}"`);
  elements.exerciseEntryCount.textContent = elements.exerciseList.dataset.count;
  elements.exerciseEntryCount.parentElement.dataset.count = elements.exerciseList.dataset.count;

  renderList(elements.foodList, day.foods, "foods", (food) => {
    return `${mealLabel(food.meal)} · ${foodLoggedTime(food)}`;
  });
  updateFoodSwipeHint(day.foods.length > 0);

  renderList(elements.exerciseList, day.exercises, "exercises", (exercise) => {
    return `${exercise.minutes} min`;
  });
}

function updateFoodSwipeHint(hasFoodEntries) {
  if (!elements.foodSwipeHint) return;
  const used = localStorage.getItem(foodSwipeHintUsedKey) === "true";
  const seen = localStorage.getItem(foodSwipeHintSeenKey) === "true";
  const shownThisSession = sessionStorage.getItem(foodSwipeHintSessionKey) === "true";
  const hasOpenEntryModal = Boolean(document.querySelector(".log-panel.is-adding"));
  const shouldShow = supportsEntrySwipe() && hasFoodEntries && !hasOpenEntryModal && !used && (!seen || shownThisSession);
  elements.foodSwipeHint.hidden = !shouldShow;

  if (shouldShow && !seen) {
    localStorage.setItem(foodSwipeHintSeenKey, "true");
    sessionStorage.setItem(foodSwipeHintSessionKey, "true");
  }
}

function markFoodSwipeHintUsed() {
  localStorage.setItem(foodSwipeHintUsedKey, "true");
  sessionStorage.removeItem(foodSwipeHintSessionKey);
  updateFoodSwipeHint(false);
}

function renderList(container, entries, collection, subtitleFactory, titleFactory = (entry) => entry.name) {
  container.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const emptyText = {
      foods: `No food logged ${selectedLogEmptySuffix()}.`,
      exercises: `No exercise logged ${selectedLogEmptySuffix()}.`,
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
    const canSwipe = canEdit && supportsEntrySwipe();
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
      calories.textContent = `${Math.round(entry.calories || 0)} kcal`;
      calories.setAttribute("aria-label", `${Math.round(entry.calories || 0)} kcal`);
      entryMain.appendChild(calories);
      const saved = isFoodSaved(entry);
      swipeSaveButton.classList.toggle("is-saved", saved);
      swipeSaveButton.textContent = saved ? "♥" : "♡";
      swipeSaveButton.title = saved ? "Unsave food" : "Save food";
      swipeSaveButton.setAttribute("aria-label", saved ? "Unsave food" : "Save food");
      swipeSaveButton.addEventListener("click", (event) => {
        event.stopPropagation();
        closeSwipedEntries();
        toggleSavedFood(entry);
      });
    } else if (collection === "exercises") {
      const entryMain = card.querySelector(".entry-main");
      const calories = document.createElement("span");
      entryMain.classList.add("has-kcal", "has-exercise-kcal");
      calories.className = "entry-kcal";
      calories.textContent = `${Math.round(entry.calories || 0)} kcal`;
      calories.setAttribute("aria-label", `${Math.round(entry.calories || 0)} kcal burned`);
      entryMain.appendChild(calories);
      swipeSaveButton.remove();
      card.classList.add("has-no-save-action");
    } else {
      swipeSaveButton.remove();
      card.classList.add("has-no-save-action");
    }
    if (canSwipe && swipeDeleteButton) {
      swipeDeleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        closeSwipedEntries();
        deleteEntryWithUndo(collection, entry);
      });
    }
    if (!canSwipe) card.querySelector(".entry-swipe-actions")?.remove();
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
      if (canSwipe) attachEntrySwipe(card, collection, entry);
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
  document.querySelectorAll(".entry-card.is-swiped-left, .entry-card.is-swiped-right, .entry-card.is-revealing-left, .entry-card.is-revealing-right").forEach((entryCard) => {
    if (entryCard === exceptCard) return;
    entryCard.classList.remove("is-swiped-left", "is-swiped-right", "is-revealing-left", "is-revealing-right", "is-dragging");
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
    const maxRightOffset = collection === "foods" ? dragLimit : 0;
    const offset = Math.max(-dragLimit, Math.min(maxRightOffset, value));
    card.style.setProperty("--swipe-x", `${offset}px`);
    card.classList.toggle("is-revealing-right", offset > 0);
    card.classList.toggle("is-revealing-left", offset < 0);
  }

  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    closeSwipedEntries(card);
    startX = event.clientX;
    startY = event.clientY;
    latestX = startX;
    isTracking = true;
    isDragging = false;
    card.classList.remove("is-swiped-left", "is-swiped-right", "is-revealing-left", "is-revealing-right");
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
    card.classList.remove("is-revealing-left", "is-revealing-right");
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
      if (collection === "foods") markFoodSwipeHintUsed();
      return;
    }

    if (collection === "foods") {
      card.classList.add("is-swiped-right");
      markFoodSwipeHintUsed();
    }
  });

  card.addEventListener("pointercancel", () => {
    isTracking = false;
    isDragging = false;
    card.classList.remove("is-dragging", "is-revealing-left", "is-revealing-right");
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
    const hasFoodLog = day.foods.length > 0;
    const hasEntries = day.foods.length > 0 || day.exercises.length > 0;
    const isFuture = dateKey > todayKey;
    const isOverGoal = summary.netCalories > state.goals.calories;
    const status = hasEntries && !isFuture ? (isOverGoal ? "over" : "complete") : "empty";
    const statusLabel = isFuture && hasEntries
      ? "Planned entries"
      : status === "empty"
        ? "No entries"
        : status === "over"
          ? "Over calorie goal"
          : "Within calorie goal";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-tile";
    button.classList.toggle("is-selected", dateKey === state.selectedDate);
    button.classList.toggle("has-food-log", hasFoodLog);
    button.classList.toggle("is-calorie-over", hasFoodLog && isOverGoal);
    button.setAttribute("aria-pressed", String(dateKey === state.selectedDate));
    button.classList.toggle("is-today", dateKey === todayKey);
    button.dataset.dateKey = dateKey;
    button.dataset.status = status;
    button.title = statusLabel;
    const dateDescription = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const calendarState = [
      dateKey === todayKey ? "Today" : "",
      dateKey === state.selectedDate ? "Selected" : "",
      statusLabel
    ].filter(Boolean).join(", ");
    button.setAttribute("aria-label", `${dateDescription}: ${calendarState}`);
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
      requestAnimationFrame(() => elements.calendarStrip.querySelector(`[data-date-key="${dateKey}"]`)?.focus());
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
    savedFoods.forEach((food) => {
      elements.savedFoods.appendChild(createLibraryFoodCard(food, { saved: true }));
    });
  }

  if (!elements.recentFoods) return;
  const recentFoods = uniqueRecentFoods(foodLibrary);
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
        <strong>${escapeHtml(food.name)}</strong>
        <span>${escapeHtml(food.serving)} · ${Math.round(food.calories)} kcal</span>
      </button>
      <button class="saved-food-heart ${saved ? "is-saved" : ""}" type="button" title="${saved ? "Unsave food" : "Save food"}" aria-label="${saved ? "Unsave food" : "Save food"}">${saved ? "♥" : "♡"}</button>
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
  const originalSource = foodSource(food);
  const source = String(originalSource || food.brand || "").toLowerCase();
  if (source.includes("openai photo") || source.includes("photo estimate")) return "PHOTO ESTIMATE";
  if (source.includes("open food facts") || source === "off") return "OPEN FOOD FACTS";
  if (source.includes("usda")) return "USDA";
  if (source.includes("manual")) return "MANUAL";
  if (source.includes("starter") || source.includes("local")) return "STARTER";
  return originalSource ? originalSource.toUpperCase() : "";
}

function foodMatchesActiveFilter(food) {
  const source = String(food.source || food.brand || "").toLowerCase();
  if (foodSearchFilter === "my") return isFoodSaved(food) || source.includes("saved");
  if (foodSearchFilter === "recent") return foodLibrary.some((recentFood) => recentFoodKey(recentFood) === recentFoodKey(food));
  if (foodSearchFilter === "usda") return source.includes("usda");
  if (foodSearchFilter === "off") return source.includes("open food facts") || source === "off";
  return true;
}

function activeFoodFilterLabel() {
  const labels = {
    my: "saved foods",
    recent: "recent foods",
    usda: "USDA",
    off: "products",
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

function foodSearchSummary(count, total = count) {
  const query = elements.manualFoodName.value.trim();
  if (!query && foodSearchFilter === "my") return `${count} saved ${count === 1 ? "food" : "foods"}`;
  if (!query && foodSearchFilter === "recent") return `${count} recent ${count === 1 ? "food" : "foods"}`;
  if (!query) return "Search saved foods, USDA, or Open Food Facts.";
  if (!count) {
    const source = activeFoodFilterLabel();
    return source ? `0 ${source} matches for "${query}"` : `0 matches for "${query}"`;
  }
  if (total > count) return `Showing ${count} of ${total} matches for "${query}"`;
  return `${count} ${count === 1 ? "match" : "matches"} for "${query}"`;
}

function showBrowseFoodSuggestions() {
  if (elements.manualFoodName.value.trim()) return false;

  if (foodSearchFilter === "my") {
    renderSuggestions(savedFoods, { remember: false });
    return true;
  }

  if (foodSearchFilter === "recent") {
    renderSuggestions(foodLibrary, { remember: false });
    return true;
  }

  if (foodSearchFilter === "all") {
    renderRecentFoodSuggestions();
    return true;
  }

  elements.foodSuggestions.innerHTML = "";
  latestFoodSuggestions = [];
  elements.foodSection.classList.remove("has-food-suggestions");
  elements.searchNote.textContent = "Search saved foods, USDA, or Open Food Facts.";
  setFoodSearchActive(false);
  return true;
}

function renderRecentFoodSuggestions() {
  const recentFoods = uniqueRecentFoods(foodLibrary).slice(0, 4);
  elements.foodSection.classList.remove("has-search-fallback");
  elements.foodSuggestions.innerHTML = "";
  latestFoodSuggestions = [];
  setFoodSearchActive(false);

  if (!recentFoods.length) {
    elements.foodSection.classList.remove("has-food-suggestions");
    elements.searchNote.textContent = "Search saved foods, USDA, or Open Food Facts.";
    return;
  }

  const heading = document.createElement("div");
  heading.className = "recent-foods-heading";
  const title = document.createElement("span");
  title.textContent = "Recent foods";
  const viewAll = document.createElement("button");
  viewAll.type = "button";
  viewAll.textContent = "View all →";
  viewAll.addEventListener("click", () => {
    foodSearchFilter = "recent";
    updateFoodFilterTabs();
    showBrowseFoodSuggestions();
  });
  heading.append(title, viewAll);
  elements.foodSuggestions.appendChild(heading);
  recentFoods.forEach((food) => elements.foodSuggestions.appendChild(createFoodSuggestionCard(food)));
  elements.foodSection.classList.add("has-food-suggestions");
  elements.searchNote.textContent = "";
}

function addSuggestedFood(food) {
  const portion = parseServing(food.serving);
  addFood({
    catalogId: food.catalogId || food.id || "",
    name: food.name,
    brand: food.brand || "",
    source: food.source || "Recent",
    serving: food.serving || "",
    amount: 1,
    unit: "serving",
    servingGrams: Number(food.servingGrams || portion.grams || 0) || null,
    meal: defaultMealForNow(),
    calories: Number(food.calories || 0),
    protein: Number(food.protein || 0),
    carbs: Number(food.carbs || 0),
    fat: Number(food.fat || 0),
  });
  elements.searchNote.textContent = `${food.name} added.`;
  playSubmitSuccess(elements.floatingAddButton || elements.manualFoodSubmit);
  closeMobileLogForm(elements.foodSection);
  resetFoodForm();
}

function renderSuggestions(foods, options = {}) {
  const { remember = true, preserveLimit = false } = options;
  const sourceFoods = [...foods];
  if (remember) latestFoodSuggestions = sourceFoods;
  if (!preserveLimit) foodSuggestionVisibleCount = 5;
  elements.foodSection.classList.remove("has-search-fallback");
  elements.foodSuggestions.innerHTML = "";
  const filteredFoods = rankFoodSuggestions(
    sourceFoods.filter(foodMatchesActiveFilter),
    elements.manualFoodName.value,
  );
  const hasSearch = elements.manualFoodName.value.trim().length >= 2;
  elements.foodSection.classList.toggle("has-food-suggestions", filteredFoods.length > 0);

  if (!filteredFoods.length) {
    if (elements.manualFoodName.value.trim().length < 2 && foodSearchFilter === "my") {
      elements.searchNote.textContent = "No saved foods yet. Save foods with the heart.";
      setFoodSearchActive(false);
      return;
    }
    elements.searchNote.textContent = hasSearch ? foodSearchSummary(0) : "Search saved foods, USDA, or Open Food Facts.";
    if (hasSearch) renderFoodSearchFallbacks();
    setFoodSearchActive(hasSearch);
    return;
  }

  const visibleFoods = filteredFoods.slice(0, foodSuggestionVisibleCount);
  elements.searchNote.textContent = foodSearchSummary(visibleFoods.length, filteredFoods.length);
  setFoodSearchActive(hasSearch);

  visibleFoods.forEach((food) => elements.foodSuggestions.appendChild(createFoodSuggestionCard(food)));

  if (visibleFoods.length < filteredFoods.length) {
    const showMoreButton = document.createElement("button");
    showMoreButton.className = "food-suggestions-more";
    showMoreButton.type = "button";
    showMoreButton.textContent = "Show more";
    showMoreButton.addEventListener("click", () => {
      foodSuggestionVisibleCount = filteredFoods.length;
      renderSuggestions(sourceFoods, { remember: false, preserveLimit: true });
    });
    elements.foodSuggestions.appendChild(showMoreButton);
  }
}

function createFoodSuggestionCard(food) {
  const button = document.createElement("button");
  button.className = "suggestion-card";
  button.type = "button";
  button.innerHTML = `
    <div>
      <strong>${escapeHtml(food.name)}</strong>
      <p>${escapeHtml(sourceLabel(food))} · ${escapeHtml(food.serving || "per 100g")}</p>
    </div>
    <span class="suggestion-kcal">${Math.round(food.calories)} kcal</span>
  `;
  const meta = button.querySelector("p");
  const serving = document.createElement("span");
  serving.className = "suggestion-serving";
  serving.textContent = foodServingLabel(food);
  const separator = document.createElement("span");
  separator.setAttribute("aria-hidden", "true");
  separator.textContent = " · ";
  const source = document.createElement("span");
  source.className = "suggestion-source";
  source.textContent = sourceLabel(food);
  meta.replaceChildren(serving);
  if (source.textContent) meta.append(separator, source);
  button.addEventListener("click", () => fillManualFood(food));
  return button;
}

function renderFoodSearchFallbacks() {
  elements.foodSection.classList.add("has-search-fallback");
  const emptyTitle = {
    my: "Not in Saved",
    recent: "Not in Recent",
    usda: "No USDA match",
    off: "No product match",
  }[foodSearchFilter] || "No exact match";
  const emptyHint = foodSearchFilter === "off"
    ? "Try a brand name, or search all sources."
    : "Try all sources, or add this food yourself.";
  const actions = document.createElement("div");
  actions.className = "food-search-fallbacks";
  actions.setAttribute("aria-live", "polite");
  actions.innerHTML = `<div class="food-search-fallback-copy"><strong>${emptyTitle}</strong><p>${emptyHint}</p></div><div><button type="button" data-food-fallback="all">Search all sources</button><button type="button" data-food-fallback="manual">Add manually</button></div>`;
  actions.querySelector('[data-food-fallback="all"]').addEventListener("click", () => {
    foodSearchFilter = "all";
    updateFoodFilterTabs();
    renderSuggestions(latestFoodSuggestions);
  });
  actions.querySelector('[data-food-fallback="manual"]').addEventListener("click", () => {
    const name = elements.manualFoodName.value.trim();
    fillManualFood({ name, source: "Manual", serving: "1 serving", servingGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
  elements.foodSuggestions.appendChild(actions);
}

async function estimateTypedFood(event) {
  const button = event.currentTarget;
  const description = elements.manualFoodName.value.trim();
  button.disabled = true;
  button.textContent = "Estimating...";
  elements.searchNote.textContent = "Estimating nutrition. You'll review it before adding.";
  try {
    const response = await fetch("/api/foods/estimate-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AI food estimate failed.");
    showSimpleScannedPlate(data.analysis);
  } catch (error) {
    elements.searchNote.textContent = error.message || "AI estimate failed. Add the food manually instead.";
    button.disabled = false;
    button.textContent = "Estimate with AI";
  }
}

function fillManualFood(food, options = {}) {
  rememberDesktopFoodBrowseState();
  const portion = parseServing(food.serving);
  const isManualEntry = options.editableName === true || foodSource(food).toLowerCase() === "manual";
  selectedFoodBase = {
    ...food,
    servingGrams: Number(food.servingGrams || portion.grams || 0) || 100,
  };

  elements.foodSection.classList.add("is-detailing");
  elements.foodSection.classList.toggle("is-manual-entry", isManualEntry);
  elements.foodNameLabel.textContent = isManualEntry ? "Food name" : "Search food";
  foodNutritionOverridden = isManualEntry;
  foodNutritionEditing = false;
  elements.manualFoodName.readOnly = !isManualEntry;
  elements.manualFoodName.placeholder = isManualEntry ? "Food name" : "Search food";
  elements.manualFoodName.value = food.name;
  elements.foodEditName.textContent = food.name;
  elements.foodEditSummary.querySelector("small").textContent = isManualEntry
    ? "Set the serving and nutrition, then add it to your log."
    : "Adjust serving and meal, or edit nutrition.";
  const lastUsedUnit = ["serving", "piece", "g"].includes(food.lastUsedUnit) ? food.lastUsedUnit : "serving";
  const lastUsedAmount = Number(food.lastUsedAmount || 0);
  elements.foodAmount.value = lastUsedAmount > 0 ? lastUsedAmount : 1;
  elements.foodUnit.value = lastUsedUnit;
  elements.foodMeal.value = defaultMealForNow();
  elements.manualFoodSubmit.textContent = "Add food";
  updateFoodAmountStep();
  elements.foodSuggestions.innerHTML = "";
  setFoodSearchActive(false);
  updateNutritionForPortion(true);
  syncFoodNutritionMode();
  syncDesktopFoodAddContentState();
  elements.manualFoodSubmit.disabled = isManualEntry && !String(food.name || "").trim();
}

function fillFoodFormForEdit(food) {
  elements.foodSection.classList.remove("is-manual-entry");
  editingFoodId = food.id;
  foodNutritionOverridden = Boolean(food.nutritionOverridden)
    || foodSource(food).toLowerCase() === "manual";
  foodNutritionEditing = false;
  const amount = Number(food.amount || 1);
  const divisor = food.unit === "g" ? 1 : amount || 1;
  const portion = parseServing(food.serving);
  selectedFoodBase = {
    ...food,
    calories: food.unit === "g" ? Math.round(Number(food.calories || 0)) : Math.round(Number(food.calories || 0) / divisor),
    protein: food.unit === "g" ? Math.round(Number(food.protein || 0)) : Math.round(Number(food.protein || 0) / divisor),
    carbs: food.unit === "g" ? Math.round(Number(food.carbs || 0)) : Math.round(Number(food.carbs || 0) / divisor),
    fat: food.unit === "g" ? Math.round(Number(food.fat || 0)) : Math.round(Number(food.fat || 0) / divisor),
    servingGrams: food.unit === "g"
      ? amount || 100
      : Number(food.servingGrams || portion.grams || 0) || 100,
  };
  elements.manualFoodName.value = food.name;
  elements.manualFoodName.readOnly = true;
  elements.foodEditName.textContent = food.name || "Food entry";
  elements.foodEditSummary.querySelector("small").textContent = "Adjust serving, meal, or nutrition values, then save.";
  elements.foodAmount.value = food.amount || 1;
  elements.foodUnit.value = food.unit || "serving";
  elements.foodMeal.value = food.meal || defaultMealForNow();
  updateFoodAmountStep();
  elements.manualFoodCalories.value = Math.round(Number(food.calories || 0));
  elements.manualFoodProtein.value = Math.round(Number(food.protein || 0));
  elements.manualFoodCarbs.value = Math.round(Number(food.carbs || 0));
  elements.manualFoodFat.value = Math.round(Number(food.fat || 0));
  elements.manualFoodSubmit.textContent = "Save changes";
  elements.foodSuggestions.innerHTML = "";
  elements.searchNote.textContent = "Editing this food entry. Adjust serving, meal, or nutrition values, then save.";
  setFoodSearchActive(false);
  elements.foodSection.classList.add("is-editing", "is-detailing");
  syncFoodNutritionSummaryFromInputs();
  syncFoodNutritionMode();
  openEditLogForm(elements.foodSection, elements.foodAmount);
  syncFoodModeHeader();
  renderEntries();
  elements.foodAmount.focus();
}

function resetFoodForm() {
  elements.manualFoodForm.reset();
  elements.manualFoodName.readOnly = false;
  elements.foodEditName.textContent = "Food";
  elements.foodEditSummary.querySelector("small").textContent = "Adjust serving, meal, or nutrition values.";
  elements.foodAmount.value = 1;
  elements.foodUnit.value = "serving";
  elements.foodMeal.value = defaultMealForNow();
  updateFoodAmountStep();
  elements.manualFoodSubmit.textContent = "Add food";
  elements.manualFoodSubmit.disabled = false;
  editingFoodId = null;
  selectedFoodBase = null;
  foodNutritionOverridden = false;
  foodNutritionEditing = false;
  latestFoodSuggestions = [];
  foodSuggestionVisibleCount = 5;
  scannedFoodItems = [];
  scannedFoodAnalysis = null;
  elements.scanReview.hidden = true;
  elements.openScanReview.hidden = true;
  elements.scanFoodList.replaceChildren();
  elements.foodSection.classList.remove("is-editing", "is-detailing", "is-reviewing-scan", "is-manual-entry", "has-food-suggestions");
  syncFoodNutritionMode();
  elements.manualFoodName.placeholder = "Search food";
  elements.foodNameLabel.textContent = "Food name (required)";
  elements.foodSuggestions.innerHTML = "";
  elements.foodPhotoStatus.textContent = "";
  elements.foodScanLoading.hidden = true;
  document.body.classList.remove("food-scan-active");
  elements.searchNote.textContent = "Search saved foods, USDA, or Open Food Facts.";
  setFoodSearchActive(false);
  clearEntryTransientState();
  syncFoodModeHeader();
}

function syncFoodModeHeader() {
  const isEditing = Boolean(editingFoodId);
  const isReviewingScan = elements.foodSection.classList.contains("is-reviewing-scan");
  const isDesktopAdd = isDesktopFoodAddModal();
  elements.foodModeEyebrow.textContent = isEditing ? "Editing entry" : isReviewingScan ? "Photo estimate" : isDesktopAdd ? "Add food" : "Add";
  elements.foodModeTitle.textContent = isEditing ? "Edit food" : isReviewingScan ? "Review scan" : isDesktopAdd ? "Add food" : "Add";
  elements.foodMobileHeaderTitle.textContent = elements.foodModeTitle.textContent;
}

function syncExerciseModeHeader() {
  const isEditing = Boolean(editingExerciseId);
  elements.exerciseModeEyebrow.textContent = isEditing ? "Editing entry" : "Add";
  elements.exerciseModeTitle.textContent = isEditing ? "Edit exercise" : "Add";
  elements.exerciseMobileHeaderTitle.textContent = elements.exerciseModeTitle.textContent;
}

function setFoodSearchActive(isActive) {
  elements.foodSection.classList.toggle("is-searching", isActive);
  syncDesktopFoodAddContentState();
}

function updateFoodAmountStep() {
  elements.foodAmount.step = "0.1";
}

function updateFoodAmountForUnit() {
  elements.foodAmount.value = elements.foodUnit.value === "g"
    ? Number(selectedFoodBase?.servingGrams || 100)
    : 1;
  updateFoodAmountStep();
}

function hasSourceNutritionSummary() {
  return Boolean(selectedFoodBase)
    && !elements.foodSection.classList.contains("is-manual-entry")
    && !elements.foodSection.classList.contains("is-reviewing-scan");
}

function formatFoodNutritionValue(value, unit) {
  return `${formatDecimal(Number(value || 0))} ${unit}`;
}

function syncFoodNutritionSummary(values) {
  elements.foodNutritionCalories.textContent = formatFoodNutritionValue(values.calories, "kcal");
  elements.foodNutritionProtein.textContent = formatFoodNutritionValue(values.protein, "g");
  elements.foodNutritionCarbs.textContent = formatFoodNutritionValue(values.carbs, "g");
  elements.foodNutritionFat.textContent = formatFoodNutritionValue(values.fat, "g");
}

function syncFoodNutritionMode() {
  const showSummary = hasSourceNutritionSummary();
  const isFoodDetail = elements.foodSection.classList.contains("is-detailing") || Boolean(editingFoodId);
  const nutritionFields = [
    elements.manualFoodCalories,
    elements.manualFoodProtein,
    elements.manualFoodCarbs,
    elements.manualFoodFat,
  ].map((input) => input.closest(".food-form-field"));

  elements.foodFilterBar.hidden = isFoodDetail;
  elements.foodNutritionSummary.hidden = !showSummary;
  elements.foodNutritionGrid.hidden = showSummary && foodNutritionEditing;
  elements.foodSection.classList.toggle("is-nutrition-editing", showSummary && foodNutritionEditing);
  desktopEditSession?.content.classList.toggle("is-nutrition-editing", showSummary && foodNutritionEditing);
  elements.editFoodNutrition.textContent = foodNutritionEditing ? "Done" : "Edit nutrition";
  nutritionFields.forEach((field) => {
    const isHidden = showSummary && !foodNutritionEditing;
    field.hidden = isHidden;
    if (desktopEditSession?.section === elements.foodSection) {
      if (isHidden) field.style.setProperty("display", "none", "important");
      else field.style.removeProperty("display");
    }
  });
  if (desktopEditSession?.section === elements.foodSection) {
    if (elements.foodNutritionGrid.hidden) {
      elements.foodNutritionGrid.style.setProperty("display", "none", "important");
    } else {
      elements.foodNutritionGrid.style.removeProperty("display");
    }
  }
}

function syncFoodNutritionSummaryFromInputs() {
  syncFoodNutritionSummary({
    calories: Number(elements.manualFoodCalories.value || 0),
    protein: Number(elements.manualFoodProtein.value || 0),
    carbs: Number(elements.manualFoodCarbs.value || 0),
    fat: Number(elements.manualFoodFat.value || 0),
  });
}

function updateNutritionForPortion(forceSourceValues = false) {
  if (!selectedFoodBase) return;

  const multiplier = portionMultiplier(selectedFoodBase, Number(elements.foodAmount.value || 0), elements.foodUnit.value);
  const values = {
    calories: scaleCalories(selectedFoodBase.calories, multiplier),
    protein: scaleMacro(selectedFoodBase.protein, multiplier),
    carbs: scaleMacro(selectedFoodBase.carbs, multiplier),
    fat: scaleMacro(selectedFoodBase.fat, multiplier),
  };

  if (!foodNutritionOverridden || forceSourceValues) {
    elements.manualFoodCalories.value = values.calories;
    elements.manualFoodProtein.value = values.protein;
    elements.manualFoodCarbs.value = values.carbs;
    elements.manualFoodFat.value = values.fat;
    syncFoodNutritionSummary(values);
  } else {
    syncFoodNutritionSummaryFromInputs();
  }
}

function parseServing(serving = "") {
  const normalized = serving.toLowerCase().replace(",", ".");
  const amountMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? Number(amountMatch[1]) : 1;

  if (/(?:^|[^a-z])(?:g|gr|grm|gram|grams)\b/.test(normalized)) return { amount, unit: "g", grams: amount };
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

async function searchFoodSuggestions(query) {
  suggestionAbortController?.abort();
  elements.foodSection.classList.remove("has-search-fallback");
  const localMatches = searchFoodLibrary(query);

  if (!query.trim()) {
    showBrowseFoodSuggestions();
    return;
  }

  if (query.trim().length < 2) {
    elements.foodSuggestions.innerHTML = "";
    elements.foodSection.classList.remove("has-food-suggestions");
    elements.searchNote.textContent = "Keep typing to search foods.";
    setFoodSearchActive(true);
    return;
  }

  if (localMatches.length) {
    renderSuggestions(localMatches);
    elements.searchNote.textContent = "Showing saved and recent foods while searching online sources...";
  } else {
    elements.searchNote.textContent = "Searching USDA and Open Food Facts...";
    setFoodSearchActive(true);
  }

  setFoodSearchActive(true);
  if (!localMatches.length) {
    elements.foodSuggestions.innerHTML = '<p class="food-search-status" role="status">Searching food sources...</p>';
  }
  suggestionAbortController = new AbortController();
  const response = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}`, {
    signal: suggestionAbortController.signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Food search failed.");
  const onlineFoods = data.foods || [];
  renderSuggestions(dedupeFoodSuggestions([...localMatches, ...onlineFoods]).slice(0, 24));
}

async function analyzeFoodPhoto(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    elements.foodPhotoStatus.textContent = "Choose an image file.";
    return;
  }

  const previousScanText = elements.foodScanButton?.querySelector("b")?.textContent || "Scan food";
  const scanLoadingText = isPhoneAddFoodLayout() ? "Scan" : "Analyzing";
  elements.foodPhotoButton.disabled = true;
  elements.foodGalleryButton.disabled = true;
  if (elements.foodScanButton) elements.foodScanButton.disabled = true;
  if (elements.foodGalleryShortcut) elements.foodGalleryShortcut.disabled = true;
  elements.foodScanButton?.querySelector("b") && (elements.foodScanButton.querySelector("b").textContent = scanLoadingText);
  elements.foodScanButton?.setAttribute("aria-label", "Scanning food");
  elements.foodPhotoStatus.textContent = "Scanning food...";
  elements.foodScanLoading.hidden = false;
  document.body.classList.add("food-scan-active");

  try {
    const barcode = await detectBarcode(file);
    if (barcode) {
      await lookupBarcode(barcode);
      return;
    }

    const imageDataUrl = await resizeImageForAnalysis(file);
    const response = await fetch("/api/foods/analyze-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(data.error || "Food photo analysis failed.");
    const analysis = data.analysis || { foods: data.food ? [data.food] : [] };
    showSimpleScannedPlate(analysis, imageDataUrl);
  } catch (error) {
    elements.foodPhotoStatus.textContent = error.message || "Photo analysis failed.";
  } finally {
    elements.foodPhotoButton.disabled = false;
    elements.foodGalleryButton.disabled = false;
    if (elements.foodScanButton) elements.foodScanButton.disabled = false;
    if (elements.foodGalleryShortcut) elements.foodGalleryShortcut.disabled = false;
    elements.foodScanButton?.querySelector("b") && (elements.foodScanButton.querySelector("b").textContent = previousScanText);
    elements.foodScanButton?.setAttribute("aria-label", "Scan food");
    elements.foodScanLoading.hidden = true;
    document.body.classList.remove("food-scan-active");
    elements.foodPhotoInput.value = "";
    elements.foodGalleryInput.value = "";
  }
}

function showSimpleScannedPlate(analysis = null, imageDataUrl = "") {
  const foods = Array.isArray(analysis?.foods) ? analysis.foods : [];
  if (!scannedFoodItems.length && !foods.length) throw new Error("No food was detected in this photo.");

  if (foods.length) {
    scannedFoodItems = foods.map((food) => createScannedFoodItem(food));
    scannedFoodAnalysis = {
      confidence: analysis.confidence || "low",
      notes: String(analysis.notes || "").trim(),
      imageDataUrl,
    };
  }

  const includedFoods = scannedFoodItems.filter((food) => food.included);
  const total = (key) => Math.round(includedFoods.reduce((sum, food) => sum + Number(food[key] || 0), 0) * 10) / 10;
  const plateName = includedFoods.length === 1
    ? includedFoods[0].name
    : includedFoods.length > 1
      ? includedFoods.length <= 3
        ? includedFoods.map((food) => food.name).join(", ")
        : `Scanned plate (${includedFoods.length} foods)`
      : "Scanned plate";
  const servingGrams = includedFoods.reduce((sum, food) => sum + Number(food.servingGrams || 0), 0);

  selectedFoodBase = {
    name: plateName,
    source: "OpenAI photo estimate",
    serving: "1 serving",
    servingGrams: servingGrams || 100,
    calories: total("calories"),
    protein: total("protein"),
    carbs: total("carbs"),
    fat: total("fat"),
  };

  editingFoodId = null;
  foodNutritionOverridden = false;
  elements.foodSection.classList.remove("is-editing");
  elements.foodSection.classList.remove("is-reviewing-scan");
  elements.foodSection.classList.add("is-detailing");
  elements.scanReview.hidden = true;
  elements.openScanReview.hidden = scannedFoodItems.length === 0;
  elements.openScanReview.textContent = scannedFoodItems.length === 1
    ? "Review estimate"
    : `Review your plate · ${scannedFoodItems.length} items`;
  elements.manualFoodSubmit.textContent = includedFoods.length === 1
    ? "+ Add 1 food"
    : `+ Add ${includedFoods.length} foods`;
  elements.manualFoodSubmit.disabled = includedFoods.length === 0;
  elements.manualFoodName.value = plateName;
  elements.manualFoodName.readOnly = true;
  elements.foodEditName.textContent = plateName;
  elements.foodAmount.value = 1;
  elements.foodUnit.value = "serving";
  if (!elements.foodMeal.value) elements.foodMeal.value = defaultMealForNow();
  updateFoodAmountStep();
  updateNutritionForPortion(true);
  syncFoodNutritionMode();
  elements.foodSuggestions.innerHTML = "";
  elements.searchNote.textContent = scannedFoodAnalysis?.notes || "The detected foods will be added separately. Review the plate only if something needs changing.";
  elements.foodPhotoStatus.textContent = `${scannedFoodItems.length} ${scannedFoodItems.length === 1 ? "food" : "foods"} detected · ${scannedFoodAnalysis?.confidence || "low"} confidence.`;
  setFoodSearchActive(false);
  syncFoodModeHeader();
}

async function lookupBarcode(code) {
  const cleanCode = String(code || "").replace(/\D/g, "");
  if (!/^\d{8,14}$/.test(cleanCode)) throw new Error("Enter a valid 8–14 digit barcode.");
  elements.foodPhotoStatus.textContent = "Looking up barcode...";
  const response = await fetch(`/api/foods/barcode?code=${encodeURIComponent(cleanCode)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.food) throw new Error(data.error || "Product not found.");
  fillManualFood(data.food);
  elements.foodPhotoStatus.textContent = `${data.food.name} found.`;
}

async function detectBarcode(file) {
  if (!("BarcodeDetector" in window)) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    const codes = await detector.detect(bitmap);
    bitmap.close?.();
    return codes[0]?.rawValue || null;
  } catch {
    return null;
  }
}

function selectedLogHeading() {
  const today = localDateKey(new Date());
  const yesterday = previousDayKey(today);
  if (state.selectedDate === today) return "Today's log";
  if (state.selectedDate === yesterday) return "Yesterday's log";
  return `${dateFromKey(state.selectedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} log`;
}

function selectedLogEmptySuffix() {
  const today = localDateKey(new Date());
  const yesterday = previousDayKey(today);
  if (state.selectedDate === today) return "today";
  if (state.selectedDate === yesterday) return "yesterday";
  return `on ${dateFromKey(state.selectedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function showScannedFoodsReview() {
  if (!scannedFoodItems.length) return;
  elements.foodSection.classList.add("is-detailing", "is-reviewing-scan");
  elements.scanReview.hidden = false;
  elements.scanReviewMeal.value = elements.foodMeal.value || defaultMealForNow();
  selectedFoodBase = null;
  syncFoodModeHeader();
  renderScanReview();
}

function createScannedFoodItem(food) {
  const servingGrams = Math.max(0, Number(food.servingGrams || (food.unit === "g" ? food.amount : 0)) || 0);
  const nutrients = {
    calories: Math.max(0, Number(food.calories || 0)),
    protein: Math.max(0, Number(food.protein || 0)),
    carbs: Math.max(0, Number(food.carbs || 0)),
    fat: Math.max(0, Number(food.fat || 0)),
  };

  return {
    id: crypto.randomUUID(),
    included: true,
    name: String(food.name || "Unknown food").trim() || "Unknown food",
    amount: 1,
    unit: "serving",
    servingGrams,
    confidence: food.confidence || "low",
    notes: String(food.notes || "").trim(),
    source: food.source || "OpenAI photo estimate",
    correctionOpen: false,
    correctionText: "",
    correctionStatus: "",
    isCorrecting: false,
    detailsOpen: false,
    ...nutrients,
    baseNutrition: { ...nutrients },
  };
}

function renderScanReview() {
  elements.scanFoodList.replaceChildren();
  scannedFoodItems.forEach((food, index) => {
    const card = document.createElement("article");
    card.className = `scan-food-card${food.included ? "" : " is-excluded"}`;
    card.dataset.scanFoodId = food.id;

    const top = document.createElement("div");
    top.className = "scan-food-card-top";
    const number = document.createElement("span");
    number.className = "scan-food-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const summary = document.createElement("div");
    summary.className = "scan-food-summary";
    const name = document.createElement("strong");
    name.textContent = food.name;
    const meta = document.createElement("span");
    meta.textContent = `${formatScannedFoodPortion(food)} · ${Math.round(Number(food.calories || 0))} kcal`;
    summary.append(name, meta);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "scan-food-remove";
    removeButton.dataset.scanAction = "toggle";
    removeButton.textContent = food.included ? "Remove" : "Restore";
    removeButton.setAttribute("aria-pressed", String(!food.included));
    const actions = document.createElement("div");
    actions.className = "scan-food-card-actions";
    const correctButton = document.createElement("button");
    correctButton.type = "button";
    correctButton.className = "scan-food-correct";
    correctButton.dataset.scanAction = "correct";
    correctButton.textContent = food.correctionOpen ? "Close" : "Change food";
    correctButton.setAttribute("aria-expanded", String(food.correctionOpen));
    if (food.included) actions.append(correctButton);
    actions.append(removeButton);
    top.append(number, summary, actions);

    let correction = null;
    if (food.correctionOpen) {
      correction = document.createElement("div");
      correction.className = "scan-food-correction";
      const correctionLabel = document.createElement("label");
      const correctionCaption = document.createElement("span");
      correctionCaption.textContent = "What is it instead?";
      const correctionInput = document.createElement("input");
      correctionInput.type = "text";
      correctionInput.maxLength = 240;
      correctionInput.placeholder = "e.g. mashed potatoes, not rice";
      correctionInput.value = food.correctionText;
      correctionInput.dataset.scanCorrectionInput = "";
      correctionInput.disabled = food.isCorrecting;
      correctionLabel.append(correctionCaption, correctionInput);
      const correctionSubmit = document.createElement("button");
      correctionSubmit.type = "button";
      correctionSubmit.dataset.scanAction = "apply-correction";
      correctionSubmit.disabled = food.isCorrecting || food.correctionText.trim().length < 2;
      correctionSubmit.textContent = food.isCorrecting ? "Checking…" : "Update estimate";
      correction.append(correctionLabel, correctionSubmit);
      if (food.correctionStatus) {
        const correctionStatus = document.createElement("p");
        correctionStatus.className = "scan-food-correction-status";
        correctionStatus.textContent = food.correctionStatus;
        correction.append(correctionStatus);
      }
    }

    const fields = document.createElement("div");
    fields.className = "scan-food-fields";
    fields.append(
      createScanField("Amount", "amount", food.amount, "number"),
      createScanUnitField(food.unit),
      createScanField("Calories", "calories", food.calories, "number"),
      createScanField("Protein", "protein", food.protein, "number", "g"),
      createScanField("Carbs", "carbs", food.carbs, "number", "g"),
      createScanField("Fat", "fat", food.fat, "number", "g"),
    );

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "scan-food-details-toggle";
    detailsButton.dataset.scanAction = "details";
    detailsButton.setAttribute("aria-expanded", String(food.detailsOpen));
    detailsButton.textContent = food.detailsOpen ? "Hide nutrition details ↑" : "Edit portion & nutrition ↓";

    card.append(top);
    if (correction) card.append(correction);
    if (food.included) card.append(detailsButton);
    if (food.detailsOpen && food.notes) {
      const notes = document.createElement("p");
      notes.className = "scan-food-notes";
      notes.textContent = food.notes;
      card.append(fields, notes);
    } else if (food.detailsOpen) {
      card.append(fields);
    }
    elements.scanFoodList.append(card);
  });
  updateScanReviewTotals();
}

function formatScannedFoodPortion(food) {
  const amount = Math.round(Number(food.amount || 0) * 10) / 10;
  if (food.unit === "g") return `${amount} g`;
  const unit = food.unit === "piece"
    ? amount === 1 ? "piece" : "pieces"
    : amount === 1 ? "serving" : "servings";
  return `${amount} ${unit}`;
}

function createScanField(label, field, value, type, suffix = "") {
  const wrapper = document.createElement("label");
  wrapper.className = `scan-item-field scan-item-${field}`;
  const caption = document.createElement("span");
  caption.textContent = label;
  const inputWrap = document.createElement("span");
  inputWrap.className = "scan-item-input";
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  input.dataset.scanField = field;
  input.disabled = false;
  if (type === "number") {
    input.min = "0";
    input.step = "0.1";
    input.inputMode = "decimal";
  }
  inputWrap.append(input);
  if (suffix) {
    const unit = document.createElement("small");
    unit.textContent = suffix;
    inputWrap.append(unit);
  }
  wrapper.append(caption, inputWrap);
  return wrapper;
}

function createScanUnitField(value) {
  const wrapper = document.createElement("label");
  wrapper.className = "scan-item-field scan-item-unit";
  const caption = document.createElement("span");
  caption.textContent = "Unit";
  const select = document.createElement("select");
  select.dataset.scanField = "unit";
  [["serving", "serving"], ["piece", "piece"], ["g", "g"]].forEach(([optionValue, label]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    option.selected = optionValue === value;
    select.append(option);
  });
  wrapper.append(caption, select);
  return wrapper;
}

function scannedFoodMultiplier(food) {
  if (food.unit === "g") return food.amount / (food.servingGrams || 100);
  return food.amount;
}

function updateScanFoodPortion(food) {
  const multiplier = scannedFoodMultiplier(food);
  ["calories", "protein", "carbs", "fat"].forEach((key) => {
    food[key] = Math.round(Number(food.baseNutrition[key] || 0) * multiplier * 10) / 10;
  });
}

function updateScanReviewTotals() {
  const selected = scannedFoodItems.filter((food) => food.included);
  const total = (key) => Math.round(selected.reduce((sum, food) => sum + Number(food[key] || 0), 0) * 10) / 10;
  elements.scanSelectedCount.textContent = `${selected.length} ${selected.length === 1 ? "food" : "foods"}`;
  elements.scanTotalCalories.textContent = total("calories");
  elements.scanTotalProtein.textContent = total("protein");
  elements.scanTotalCarbs.textContent = total("carbs");
  elements.scanTotalFat.textContent = total("fat");
  elements.scanAddSelectedFoods.disabled = selected.length === 0;
  elements.scanAddSelectedFoods.textContent = selected.length === 1 ? "Add food" : `Add ${selected.length} foods`;
}

function syncScanCardNutrition(card, food) {
  ["calories", "protein", "carbs", "fat"].forEach((key) => {
    const input = card.querySelector(`[data-scan-field="${key}"]`);
    if (input) input.value = food[key];
  });
}

async function correctScannedFood(foodId) {
  const food = scannedFoodItems.find((item) => item.id === foodId);
  const correction = food?.correctionText.trim();
  if (!food || correction.length < 2 || food.isCorrecting) return;

  if (!scannedFoodAnalysis?.imageDataUrl) {
    food.correctionStatus = "The original photo is no longer available. Scan the plate again.";
    renderScanReview();
    return;
  }

  food.isCorrecting = true;
  food.correctionStatus = "";
  renderScanReview();

  try {
    const response = await fetch("/api/foods/correct-image-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: scannedFoodAnalysis.imageDataUrl,
        currentFood: {
          name: food.name,
          servingGrams: food.servingGrams,
        },
        correction,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Food correction failed.");

    const corrected = createScannedFoodItem(data.food || {});
    Object.assign(food, corrected, {
      id: food.id,
      included: food.included,
      correctionOpen: false,
      correctionText: "",
      correctionStatus: "",
      isCorrecting: false,
    });
  } catch (error) {
    food.isCorrecting = false;
    food.correctionStatus = error.message || "Food correction failed. Try again.";
  }

  renderScanReview();
}

function addSelectedScannedFoods() {
  const selected = scannedFoodItems.filter((food) => food.included && food.name.trim());
  logScannedFoods(selected, elements.scanReviewMeal.value);
}

function addSimpleScannedFoods() {
  const selected = scannedFoodItems.filter((food) => food.included && food.name.trim());
  if (!selected.length) return;

  const baseTotals = Object.fromEntries(["calories", "protein", "carbs", "fat"].map((key) => [
    key,
    selected.reduce((sum, food) => sum + Number(food[key] || 0), 0),
  ]));
  const desiredTotals = {
    calories: Math.max(0, Number(elements.manualFoodCalories.value || 0)),
    protein: Math.max(0, Number(elements.manualFoodProtein.value || 0)),
    carbs: Math.max(0, Number(elements.manualFoodCarbs.value || 0)),
    fat: Math.max(0, Number(elements.manualFoodFat.value || 0)),
  };
  const quantityMultiplier = selectedFoodBase
    ? portionMultiplier(selectedFoodBase, Number(elements.foodAmount.value || 0), elements.foodUnit.value)
    : 1;

  const scaledFoods = selected.map((food) => {
    const scaled = { ...food };
    scaled.amount = Math.round(Number(food.amount || 1) * quantityMultiplier * 10) / 10;
    ["calories", "protein", "carbs", "fat"].forEach((key) => {
      scaled[key] = baseTotals[key] > 0
        ? Math.round(Number(food[key] || 0) * (desiredTotals[key] / baseTotals[key]) * 10) / 10
        : Math.round((desiredTotals[key] / selected.length) * 10) / 10;
    });
    return scaled;
  });

  logScannedFoods(scaledFoods, elements.foodMeal.value);
}

function logScannedFoods(foods, meal) {
  if (!foods.length) return;

  [...foods].reverse().forEach((food) => {
    addFood({
      name: food.name.trim(),
      brand: "",
      source: food.source,
      serving: food.unit === "serving" ? "1 serving" : `${food.amount} ${food.unit}`,
      servingGrams: food.servingGrams || null,
      amount: food.amount,
      unit: food.unit,
      meal,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
    }, { deferSaveRender: true });
  });

  saveState();
  render();
  resetFoodForm();
  closeMobileLogForm(elements.foodSection);
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

function addFood(food, options = {}) {
  const now = new Date().toISOString();
  const loggedForDate = state.selectedDate;
  const excludedFromStreak = isFutureDateKey(loggedForDate);
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
      entry.id === editingFoodId
        ? {
          ...entry,
          ...nextFood,
          loggedForDate: foodLoggedForDate(entry, loggedForDate),
          excludedFromStreak: entry.excludedFromStreak ?? isFutureDateKey(foodLoggedForDate(entry, loggedForDate)),
          updatedAt: now,
        }
        : entry,
    );
  } else {
    addedId = crypto.randomUUID();
    currentDay().foods.unshift({
      ...nextFood,
      id: addedId,
      loggedAt: now,
      createdAt: now,
      loggedForDate,
      excludedFromStreak,
    });
    recentSuccess = { collection: "foods", id: addedId };
  }
  rememberFoods([{
    ...nextFood,
    source: foodSource(nextFood) || "Manual",
    lastUsedAmount: nextFood.amount,
    lastUsedUnit: nextFood.unit,
  }]);
  if (!options.deferSaveRender) {
    saveState();
    render();
  }
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
  const loggedForDate = state.selectedDate;
  const excludedFromStreak = isFutureDateKey(loggedForDate);
  const copiedFoods = sourceFoods.map(({
    id,
    createdAt,
    updatedAt,
    copiedFromDate,
    loggedForDate: _loggedForDate,
    logged_for_date: _loggedForDateLegacy,
    excludedFromStreak: _excludedFromStreak,
    ...food
  }) => ({
    ...food,
    id: crypto.randomUUID(),
    loggedAt: copiedAt,
    createdAt: copiedAt,
    loggedForDate,
    excludedFromStreak,
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
  if (elements.foodSection.classList.contains("is-reviewing-scan")) {
    addSelectedScannedFoods();
    return;
  }
  if (scannedFoodItems.length && selectedFoodBase) {
    addSimpleScannedFoods();
    return;
  }
  const amount = Number(elements.foodAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    elements.foodAmount.setCustomValidity("Enter an amount greater than zero.");
    elements.foodAmount.reportValidity();
    elements.foodAmount.focus();
    return;
  }
  elements.foodAmount.setCustomValidity("");
  const isEditing = Boolean(editingFoodId);
  addFood({
    catalogId: selectedFoodBase?.catalogId || selectedFoodBase?.id || "",
    name: elements.manualFoodName.value.trim(),
    brand: selectedFoodBase?.brand || "",
    source: foodSource(selectedFoodBase) || "Manual",
    serving: selectedFoodBase?.serving || "",
    servingGrams: Number(selectedFoodBase?.servingGrams || 0) || null,
    amount,
    unit: elements.foodUnit.value,
    meal: elements.foodMeal.value,
    nutritionOverridden: foodNutritionOverridden,
    calories: Number(elements.manualFoodCalories.value || 0),
    protein: Number(elements.manualFoodProtein.value || 0),
    carbs: Number(elements.manualFoodCarbs.value || 0),
    fat: Number(elements.manualFoodFat.value || 0),
  });
  resetFoodForm();
  if (!isEditing) playSubmitSuccess(elements.manualFoodSubmit);
  closeEditLogForm(elements.foodSection);
});

elements.manualFoodName.addEventListener("input", () => {
  if (editingFoodId) return;
  if (elements.foodSection.classList.contains("is-manual-entry")) {
    elements.manualFoodSubmit.disabled = elements.manualFoodName.value.trim().length === 0;
    return;
  }
  selectedFoodBase = null;
  clearTimeout(autocompleteTimer);
  autocompleteTimer = setTimeout(() => {
    searchFoodSuggestions(elements.manualFoodName.value).catch((error) => {
      if (error.name !== "AbortError") {
        elements.searchNote.textContent = "Search unavailable.";
        elements.foodSuggestions.innerHTML = '<div class="food-search-error" role="alert"><strong>Food search failed</strong><p>Check your connection, try again, or enter the nutrition yourself.</p><div><button type="button" data-search-retry>Try again</button><button type="button" data-search-manual>Enter manually</button></div></div>';
        elements.foodSuggestions.querySelector("[data-search-retry]").addEventListener("click", () => {
          searchFoodSuggestions(elements.manualFoodName.value).catch(() => {});
        });
        elements.foodSuggestions.querySelector("[data-search-manual]").addEventListener("click", () => {
          const name = elements.manualFoodName.value.trim();
          fillManualFood({ name, source: "Manual", serving: "1 serving", servingGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 });
        });
        setFoodSearchActive(true);
        elements.foodSection.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }, 350);
});

elements.foodAmount.addEventListener("input", () => {
  elements.foodAmount.setCustomValidity("");
  updateNutritionForPortion();
});
elements.foodUnit.addEventListener("change", () => {
  updateFoodAmountForUnit();
  updateNutritionForPortion();
});
elements.editFoodNutrition.addEventListener("click", () => {
  if (!hasSourceNutritionSummary()) return;
  foodNutritionEditing = !foodNutritionEditing;
  if (!foodNutritionEditing) syncFoodNutritionSummaryFromInputs();
  syncFoodNutritionMode();
});
[elements.manualFoodCalories, elements.manualFoodProtein, elements.manualFoodCarbs, elements.manualFoodFat]
  .forEach((input) => input.addEventListener("input", () => {
    if (!hasSourceNutritionSummary() || !foodNutritionEditing) return;
    foodNutritionOverridden = true;
  }));
elements.scanFoodList.addEventListener("input", (event) => {
  const correctionInput = event.target.closest("[data-scan-correction-input]");
  const input = event.target.closest("[data-scan-field]");
  const card = event.target.closest("[data-scan-food-id]");
  if (!card) return;
  const food = scannedFoodItems.find((item) => item.id === card.dataset.scanFoodId);
  if (!food) return;

  if (correctionInput) {
    food.correctionText = correctionInput.value;
    food.correctionStatus = "";
    const submit = card.querySelector('[data-scan-action="apply-correction"]');
    if (submit) submit.disabled = food.correctionText.trim().length < 2;
    return;
  }

  if (!input) return;

  const field = input.dataset.scanField;
  if (field === "name") {
    food.name = input.value;
  } else if (field === "amount") {
    food.amount = Math.max(0, Number(input.value || 0));
    updateScanFoodPortion(food);
    syncScanCardNutrition(card, food);
  } else if (["calories", "protein", "carbs", "fat"].includes(field)) {
    food[field] = Math.max(0, Number(input.value || 0));
    const multiplier = scannedFoodMultiplier(food);
    food.baseNutrition[field] = multiplier ? food[field] / multiplier : food[field];
  }
  updateScanReviewTotals();
});
elements.scanFoodList.addEventListener("change", (event) => {
  const select = event.target.closest('[data-scan-field="unit"]');
  const card = event.target.closest("[data-scan-food-id]");
  if (!select || !card) return;
  const food = scannedFoodItems.find((item) => item.id === card.dataset.scanFoodId);
  if (!food) return;
  food.unit = select.value;
  food.amount = food.unit === "g" ? food.servingGrams || 100 : 1;
  updateScanFoodPortion(food);
  renderScanReview();
});
elements.scanFoodList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scan-action]");
  const card = event.target.closest("[data-scan-food-id]");
  if (!button || !card) return;
  const food = scannedFoodItems.find((item) => item.id === card.dataset.scanFoodId);
  if (!food) return;
  if (button.dataset.scanAction === "toggle") {
    food.included = !food.included;
    renderScanReview();
  } else if (button.dataset.scanAction === "correct") {
    food.correctionOpen = !food.correctionOpen;
    if (food.correctionOpen) food.detailsOpen = false;
    food.correctionStatus = "";
    renderScanReview();
    if (food.correctionOpen) {
      elements.scanFoodList.querySelector(`[data-scan-food-id="${food.id}"] [data-scan-correction-input]`)?.focus();
    }
  } else if (button.dataset.scanAction === "apply-correction") {
    correctScannedFood(food.id);
  } else if (button.dataset.scanAction === "details") {
    food.detailsOpen = !food.detailsOpen;
    if (food.detailsOpen) food.correctionOpen = false;
    renderScanReview();
  }
});
elements.scanFoodList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-scan-correction-input]")) return;
  event.preventDefault();
  const card = event.target.closest("[data-scan-food-id]");
  if (card) correctScannedFood(card.dataset.scanFoodId);
});
elements.openScanReview.addEventListener("click", showScannedFoodsReview);
elements.closeScanReview.addEventListener("click", () => {
  elements.foodMeal.value = elements.scanReviewMeal.value;
  showSimpleScannedPlate();
});
elements.scanAddSelectedFoods.addEventListener("click", addSelectedScannedFoods);
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
  closeEditLogForm(elements.foodSection);
  resetFoodForm();
  elements.foodSection.classList.remove("is-viewing-saved");
});
elements.desktopEditModalClose?.addEventListener("click", () => {
  const section = desktopEditSession?.section;
  if (!section) return;
  closeEditLogForm(section);
  if (section === elements.foodSection) resetFoodForm();
  else resetExerciseForm();
});
elements.backFoodModal.addEventListener("click", showFoodFormFromSavedFoods);
elements.cancelFoodEdit.addEventListener("click", () => {
  const wasDesktopEdit = Boolean(desktopEditSession?.section === elements.foodSection);
  resetFoodForm();
  renderEntries();
  if (wasDesktopEdit) closeEditLogForm(elements.foodSection);
  else elements.manualFoodName.focus();
});
elements.deleteFoodEdit.addEventListener("click", () => {
  if (!editingFoodId) return;
  const entry = currentDay().foods.find((food) => food.id === editingFoodId);
  if (!entry) return;
  if (!window.confirm("Delete this entry?")) return;
  closeEditLogForm(elements.foodSection);
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
  elements.foodScanMenu?.classList.remove("is-open");
  elements.foodScanMenu?.setAttribute("aria-hidden", "true");
  elements.foodScanButton?.setAttribute("aria-expanded", "false");
  elements.foodPhotoInput.click();
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

elements.manualFoodShortcut?.addEventListener("click", () => {
  fillManualFood({ name: "", source: "Manual", serving: "1 serving", servingGrams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 }, { editableName: true });
  elements.foodEditName.textContent = "Manual food";
  elements.manualFoodName.focus();
});
elements.foodGalleryShortcut?.addEventListener("click", () => {
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
  const roundedCalories = Math.round(calories);
  elements.exerciseCaloriesEstimate.textContent = roundedCalories;
  elements.exerciseCaloriesNote.textContent = "Based on your profile";
  if (!exerciseCaloriesOverridden) elements.exerciseCalories.value = roundedCalories;
  updateExerciseManualEstimateNote(roundedCalories);
  return roundedCalories;
}

function setExerciseCaloriesEditing(isEditing) {
  const caloriesField = elements.exerciseCalories.closest(".exercise-calories-field");
  elements.exerciseEstimateCopy.hidden = isEditing;
  caloriesField.hidden = !isEditing;
  elements.exerciseManualEstimateNote.hidden = !isEditing;
  elements.exerciseEstimate.classList.toggle("is-manual-mode", isEditing);
  elements.exerciseSection.classList.toggle("is-calories-editing", isEditing);
  desktopEditSession?.content.classList.toggle("is-calories-editing", isEditing);
  elements.exerciseCaloriesEdit.textContent = isEditing ? "Use estimate" : "Edit";
  elements.exerciseCaloriesEdit.setAttribute("aria-expanded", String(isEditing));
  updateExerciseManualEstimateNote(Number(elements.exerciseCaloriesEstimate.textContent || 0));
  if (isEditing) requestAnimationFrame(() => elements.exerciseCalories.focus());
}

function updateExerciseManualEstimateNote(estimate) {
  if (!elements.exerciseManualEstimateNote) return;
  elements.exerciseManualEstimateNote.textContent = editingExerciseId
    ? `Estimate: ${estimate} kcal`
    : exerciseCaloriesOverridden
    ? `Manual override · Estimate: ${estimate} kcal`
    : `Estimate: ${estimate} kcal`;
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
  const savedCaloriesWereManual = exercise.caloriesManual !== false;
  // The shared rounded estimate is authoritative unless this entry explicitly
  // carries a manual override. In automatic mode it updates display and input.
  exerciseCaloriesOverridden = savedCaloriesWereManual;
  estimateExerciseCalories();
  elements.exerciseSubmit.textContent = "Save changes";
  elements.exerciseSection.classList.add("is-editing");
  openEditLogForm(elements.exerciseSection, elements.exerciseType);
  setExerciseCaloriesEditing(true);
  syncExerciseModeHeader();
  renderEntries();
  elements.exerciseType.focus();
}

function resetExerciseForm() {
  elements.exerciseForm.reset();
  elements.exerciseSubmit.textContent = "Add exercise";
  editingExerciseId = null;
  exerciseCaloriesOverridden = false;
  elements.exerciseSection.classList.remove("is-editing");
  setExerciseCaloriesEditing(false);
  applyExercisePreset();
  clearEntryTransientState();
  syncExerciseModeHeader();
}

function normalizeExerciseCalories() {
  if (elements.exerciseCalories.value === "") return;
  elements.exerciseCalories.value = Math.round(Number(elements.exerciseCalories.value || 0));
  exerciseCaloriesOverridden = true;
  updateExerciseManualEstimateNote(Number(elements.exerciseCaloriesEstimate.textContent || 0));
}

elements.exerciseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const isEditing = Boolean(editingExerciseId);
  const exercise = {
    name: elements.exerciseType.value,
    minutes: Number(elements.exerciseMinutes.value),
    weightKg: Number(state.user?.weightKg || 75),
    calories: Math.round(Number(elements.exerciseCalories.value || 0)),
    caloriesManual: exerciseCaloriesOverridden,
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
  closeEditLogForm(elements.exerciseSection);
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
elements.exerciseCaloriesEdit.addEventListener("click", () => {
  const isEditing = elements.exerciseSection.classList.contains("is-calories-editing");
  if (isEditing) {
    exerciseCaloriesOverridden = false;
    estimateExerciseCalories();
    if (editingExerciseId) {
      setExerciseCaloriesEditing(true);
      return;
    }
  }
  setExerciseCaloriesEditing(!isEditing);
});
elements.addExerciseToggle.addEventListener("click", () => {
  openAddExerciseFromFab();
});
elements.closeExerciseModal.addEventListener("click", () => {
  closeEditLogForm(elements.exerciseSection);
  resetExerciseForm();
});
elements.cancelExerciseEdit.addEventListener("click", () => {
  const wasDesktopEdit = Boolean(desktopEditSession?.section === elements.exerciseSection);
  resetExerciseForm();
  renderEntries();
  if (wasDesktopEdit) closeEditLogForm(elements.exerciseSection);
  else elements.exerciseType.focus();
});
elements.deleteExerciseEdit.addEventListener("click", () => {
  if (!editingExerciseId) return;
  const entry = currentDay().exercises.find((exercise) => exercise.id === editingExerciseId);
  if (!entry) return;
  if (!window.confirm("Delete this exercise?")) return;
  closeEditLogForm(elements.exerciseSection);
  resetExerciseForm();
  deleteEntryWithUndo("exercises", entry);
});

function changeCalendarWeek(days, event) {
  const trigger = event.currentTarget;
  state.selectedDate = localDateKey(addDays(dateFromKey(state.selectedDate), days));
  ensureDay(state.selectedDate);
  saveState();
  render();

  // A pointer tap should not leave a button looking permanently pressed.
  // Keep focus for keyboard activation, where it remains useful feedback.
  if (event.detail > 0) requestAnimationFrame(() => trigger?.blur());
}

elements.previousWeekButton.addEventListener("click", (event) => {
  changeCalendarWeek(-7, event);
});

elements.nextWeekButton.addEventListener("click", (event) => {
  changeCalendarWeek(7, event);
});

elements.floatingAddButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  openAddFoodFromFab();
});
elements.fabAddFood?.addEventListener("click", openAddFoodFromFab);
elements.fabScanFood?.addEventListener("click", openFoodScanFromFab);
elements.fabAddExercise?.addEventListener("click", openAddExerciseFromFab);
elements.fabSavedFoods?.addEventListener("click", openSavedFoodsFromFab);
elements.floatingScanButton?.addEventListener("click", openFoodScanFromFab);
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
