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
const maxFoodLibraryItems = 800;

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
let undoToastTimer = null;
const elements = {
  appShell: document.querySelector(".app-shell"),
  mainContent: document.querySelector(".main-content"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  floatingAddButton: document.querySelector("#floatingAddButton"),
  fabOverlay: document.querySelector("#fabOverlay"),
  fabActions: document.querySelector("#fabActions"),
  fabAddFood: document.querySelector("#fabAddFood"),
  fabAddExercise: document.querySelector("#fabAddExercise"),
  appTitle: document.querySelector("#appTitle"),
  profileSummary: document.querySelector("#profileSummary"),
  profileMeta: document.querySelector("#profileMeta"),
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
  consumedCalories: document.querySelector("#consumedCalories"),
  goalCaloriesText: document.querySelector("#goalCaloriesText"),
  goalStatus: document.querySelector("#goalStatus"),
  calorieRing: document.querySelector("#calorieRing"),
  macroGrid: document.querySelector("#macroGrid"),
  foodSection: document.querySelector("#foodSection"),
  addFoodToggle: document.querySelector("#addFoodToggle"),
  closeFoodModal: document.querySelector("#closeFoodModal"),
  manualFoodForm: document.querySelector("#manualFoodForm"),
  manualFoodName: document.querySelector("#manualFoodName"),
  foodAmount: document.querySelector("#foodAmount"),
  foodUnit: document.querySelector("#foodUnit"),
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
  foodPhotoButton: document.querySelector("#foodPhotoButton"),
  foodGalleryButton: document.querySelector("#foodGalleryButton"),
  foodPhotoStatus: document.querySelector("#foodPhotoStatus"),
  copyYesterdayButton: document.querySelector("#copyYesterdayButton"),
  foodSuggestions: document.querySelector("#foodSuggestions"),
  savedFoods: document.querySelector("#savedFoods"),
  searchNote: document.querySelector("#searchNote"),
  foodList: document.querySelector("#foodList"),
  exerciseSection: document.querySelector("#exerciseSection"),
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
    return Array.isArray(saved) ? saved.map(normalizeFoodForLibrary).filter(Boolean).slice(0, maxFoodLibraryItems) : [];
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

function rememberFoods(foods) {
  const nextFoods = foods.map(normalizeFoodForLibrary).filter(Boolean);
  if (!nextFoods.length) return;

  const foodMap = new Map(foodLibrary.map((food) => [foodKey(food), food]));
  nextFoods.forEach((food) => {
    foodMap.set(foodKey(food), { ...foodMap.get(foodKey(food)), ...food, savedAt: new Date().toISOString() });
  });

  foodLibrary = [...foodMap.values()]
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
    .slice(0, maxFoodLibraryItems);
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

  return [...savedFoods, ...foodLibrary]
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

function openAddFoodFromFab() {
  if (editingFoodId) resetFoodForm();
  openMobileLogForm(elements.foodSection, elements.manualFoodName);
}

function openAddExerciseFromFab() {
  if (editingExerciseId) resetExerciseForm();
  openMobileLogForm(elements.exerciseSection, elements.exerciseType);
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

  elements.remainingCalories.textContent = `${Math.round(remaining)} kcal`;
  elements.foodCaloriesTotal.textContent = `${Math.round(daily.calories)} kcal`;
  elements.exerciseCaloriesTotal.textContent = `${Math.round(daily.exerciseCalories)} kcal`;
  elements.consumedCalories.textContent = Math.round(daily.netCalories);
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
}

function applyTheme(theme) {
  document.body.dataset.theme = theme === "dark" ? "dark" : "light";
}

function renderProfileState() {
  if (!state.user) {
    window.location.href = "profile.html";
    return;
  }

  elements.appTitle.textContent = `${state.user.name}'s Counter`;
  elements.profileSummary.textContent = state.user.name;
  elements.profileMeta.textContent = `${state.user.weightKg} kg · ${state.user.heightCm} cm`;
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
    const macroAmountLabel = `${Math.round(Number(consumed || 0))}${macro.unit}/${Math.round(Number(goal || 0))}${macro.unit}`;

    const card = document.createElement("article");
    card.className = "macro-card";
    card.classList.toggle("is-over", isOver);
    card.innerHTML = `
      <div class="macro-card-header">
        <div>
          <p class="label">${macro.label}</p>
          <strong>${macroAmountLabel}</strong>
        </div>
        <span>${progressLabel}</span>
      </div>
      <div class="macro-card-visual" style="color:${macro.color}; --macro-progress:${progress};">
        ${macro.icon}
        <svg class="macro-ring" viewBox="0 0 48 48" aria-label="${macro.label} progress: ${progressLabel}">
          <circle class="macro-ring-track" cx="24" cy="24" r="18"></circle>
          <circle class="macro-ring-progress" cx="24" cy="24" r="18" style="stroke:${macro.color}; stroke-dashoffset:${113.1 - 113.1 * (progress / 100)}"></circle>
        </svg>
        <strong>${progressLabel}</strong>
      </div>
      <div>
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
  });
}

function renderEntries() {
  const day = currentDay();

  renderList(elements.foodList, day.foods, "foods", (food) => {
    const portion = food.amount && food.unit ? `${food.amount} ${food.unit}` : "Manual entry";
    return `${portion} · ${Math.round(food.calories)} kcal · ${Math.round(food.protein || 0)}P · ${Math.round(food.carbs || 0)}C · ${Math.round(food.fat || 0)}F`;
  });

  renderList(elements.exerciseList, day.exercises, "exercises", (exercise) => {
    const weight = exercise.weightKg ? ` · ${exercise.weightKg} kg` : "";
    return `${exercise.minutes} min${weight} · ${Math.round(exercise.calories)} kcal burned`;
  }, (exercise) => `${exerciseIcon(exercise.name)} ${exercise.name}`);
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
    const saveButton = card.querySelector(".save-entry-button");
    const removeButton = card.querySelector(".remove-entry-button");
    const canEdit = collection === "foods" || collection === "exercises";
    card.querySelector("strong").textContent = titleFactory(entry);
    card.querySelector("p").textContent = subtitleFactory(entry);
    if (collection === "foods") {
      const saved = isFoodSaved(entry);
      saveButton.classList.toggle("is-saved", saved);
      saveButton.textContent = saved ? "♥" : "♡";
      saveButton.title = saved ? "Remove saved food" : "Save food";
      saveButton.setAttribute("aria-label", saved ? "Remove saved food" : "Save food");
      saveButton.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleSavedFood(entry);
      });
    } else if (collection === "exercises") {
      saveButton.remove();
    } else {
      saveButton.remove();
    }
    removeButton.textContent = "🗑";
    removeButton.title = "Delete";
    removeButton.setAttribute("aria-label", "Delete");
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
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

function attachEntrySwipe(card, collection, entry) {
  let startX = 0;
  let startY = 0;
  let isTracking = false;

  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    startX = event.clientX;
    startY = event.clientY;
    isTracking = true;
  });

  card.addEventListener("pointerup", (event) => {
    if (!isTracking) return;
    isTracking = false;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) < 54 || Math.abs(deltaY) > 44) return;

    card.dataset.suppressClick = "true";
    setTimeout(() => {
      delete card.dataset.suppressClick;
    }, 260);
    if (deltaX < 0) {
      document.querySelectorAll(".entry-card.is-swiped").forEach((entryCard) => {
        if (entryCard !== card) entryCard.classList.remove("is-swiped");
      });
      card.classList.toggle("is-swiped");
      return;
    }

    if (collection === "foods") toggleSavedFood(entry);
  });

  card.addEventListener("pointercancel", () => {
    isTracking = false;
  });
}

function exerciseIcon(name) {
  return {
    Running: "🏃",
    "Weight lifting": "🏋",
    Cycling: "🚴",
    Walking: "🚶",
  }[name] || "✣";
}

function renderCalendar() {
  const selected = dateFromKey(state.selectedDate);
  const weekStart = startOfWeek(selected);
  const todayKey = localDateKey(new Date());

  elements.selectedDateLabel.textContent = selected.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
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

  if (!savedFoods.length) {
    elements.savedFoods.innerHTML = "<div class=\"saved-foods-empty\">Saved foods will appear here.</div>";
    return;
  }

  savedFoods.slice(0, 8).forEach((food) => {
    const card = document.createElement("div");
    card.className = "saved-food-chip";
    card.innerHTML = `
      <button class="saved-food-load" type="button">
        <strong>${food.name}</strong>
        <span>${food.serving} · ${Math.round(food.calories)} kcal</span>
      </button>
      <button class="saved-food-heart is-saved" type="button" title="Remove saved food" aria-label="Remove saved food">♥</button>
    `;
    card.querySelector(".saved-food-load").addEventListener("click", () => fillManualFood(food));
    card.querySelector(".saved-food-heart").addEventListener("click", () => toggleSavedFood(food));
    elements.savedFoods.appendChild(card);
  });
}

function renderSuggestions(foods) {
  elements.foodSuggestions.innerHTML = "";

  if (!foods.length) {
    elements.searchNote.textContent = elements.manualFoodName.value.trim().length < 2 ? "Start typing to search saved foods, USDA, and Open Food Facts." : "No matches found. You can still enter the nutrition manually.";
    setFoodSearchActive(false);
    return;
  }

  elements.searchNote.textContent = "Choose a match to fill the nutrition fields.";
  setFoodSearchActive(true);

  foods.forEach((food) => {
    const button = document.createElement("button");
    button.className = "suggestion-card";
    button.type = "button";
    button.innerHTML = `
      <div>
        <strong>${food.name}</strong>
        <p>${food.serving || "1 serving"} · ${Math.round(food.calories)} kcal · ${Math.round(food.protein)}P · ${Math.round(food.carbs)}C · ${Math.round(food.fat)}F</p>
      </div>
      <span>${food.source}</span>
    `;
    button.addEventListener("click", () => fillManualFood(food));
    elements.foodSuggestions.appendChild(button);
  });
}

function fillManualFood(food) {
  const portion = parseServing(food.serving);
  selectedFoodBase = { ...food, servingGrams: portion.grams || 100 };

  elements.manualFoodName.value = food.name;
  elements.foodAmount.value = 100;
  elements.foodUnit.value = "g";
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
  elements.foodAmount.value = food.amount || 1;
  elements.foodUnit.value = food.unit || "serving";
  updateFoodAmountStep();
  elements.manualFoodCalories.value = Math.round(Number(food.calories || 0));
  elements.manualFoodProtein.value = Math.round(Number(food.protein || 0));
  elements.manualFoodCarbs.value = Math.round(Number(food.carbs || 0));
  elements.manualFoodFat.value = Math.round(Number(food.fat || 0));
  elements.manualFoodSubmit.textContent = "✓";
  elements.favoriteFoodEdit.classList.toggle("is-saved", isFoodSaved(food));
  elements.favoriteFoodEdit.textContent = isFoodSaved(food) ? "♥" : "♡";
  elements.favoriteFoodEdit.title = isFoodSaved(food) ? "Remove saved food" : "Save food";
  elements.favoriteFoodEdit.setAttribute("aria-label", isFoodSaved(food) ? "Remove saved food" : "Save food");
  elements.foodSuggestions.innerHTML = "";
  elements.searchNote.textContent = "Editing food entry. Change serving size or nutrition, then save.";
  setFoodSearchActive(false);
  elements.foodSection.classList.add("is-adding", "is-editing");
  document.body.classList.add("modal-open");
  elements.manualFoodName.focus();
}

function resetFoodForm() {
  elements.manualFoodForm.reset();
  elements.foodAmount.value = 1;
  elements.foodUnit.value = "serving";
  updateFoodAmountStep();
  elements.manualFoodSubmit.textContent = "+";
  editingFoodId = null;
  selectedFoodBase = null;
  elements.foodSection.classList.remove("is-editing");
  elements.foodSuggestions.innerHTML = "";
  elements.foodPhotoStatus.textContent = "";
  elements.searchNote.textContent = "Start typing to search saved foods, USDA, and Open Food Facts.";
  setFoodSearchActive(false);
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
    elements.foodSuggestions.innerHTML = "";
    elements.searchNote.textContent = "Start typing to search saved foods, USDA, and Open Food Facts.";
    setFoodSearchActive(false);
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
  rememberFoods(onlineFoods);
  renderSuggestions(dedupeFoodSuggestions([...localMatches, ...onlineFoods]).slice(0, 24));
}

async function analyzeFoodPhoto(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    elements.foodPhotoStatus.textContent = "Choose an image file.";
    return;
  }

  const photoButtonLabel = elements.foodPhotoButton.querySelector("b");
  const previousButtonText = photoButtonLabel.textContent;
  elements.foodPhotoButton.disabled = true;
  elements.foodGalleryButton.disabled = true;
  photoButtonLabel.textContent = "Analyzing";
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
    photoButtonLabel.textContent = previousButtonText;
    elements.foodPhotoInput.value = "";
    elements.foodGalleryInput.value = "";
  }
}

function fillManualFoodFromPhoto(food) {
  selectedFoodBase = null;
  editingFoodId = null;
  elements.foodSection.classList.remove("is-editing");
  elements.manualFoodSubmit.textContent = "+";
  elements.manualFoodName.value = food.name || "Unknown food";
  elements.foodAmount.value = food.amount || 1;
  elements.foodUnit.value = food.unit || "serving";
  updateFoodAmountStep();
  elements.manualFoodCalories.value = Math.round(Number(food.calories || 0));
  elements.manualFoodProtein.value = Math.round(Number(food.protein || 0));
  elements.manualFoodCarbs.value = Math.round(Number(food.carbs || 0));
  elements.manualFoodFat.value = Math.round(Number(food.fat || 0));
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
  const nextFood = {
    ...food,
    calories: Math.round(Number(food.calories || 0)),
    protein: Math.round(Number(food.protein || 0)),
    carbs: Math.round(Number(food.carbs || 0)),
    fat: Math.round(Number(food.fat || 0)),
  };
  if (editingFoodId) {
    currentDay().foods = currentDay().foods.map((entry) =>
      entry.id === editingFoodId ? { ...entry, ...nextFood, updatedAt: new Date().toISOString() } : entry,
    );
  } else {
    currentDay().foods.unshift({ ...nextFood, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  }
  saveState();
  render();
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
  addFood({
    name: elements.manualFoodName.value.trim(),
    amount: Number(elements.foodAmount.value || 1),
    unit: elements.foodUnit.value,
    calories: Math.round(Number(elements.manualFoodCalories.value || 0)),
    protein: Math.round(Number(elements.manualFoodProtein.value || 0)),
    carbs: Math.round(Number(elements.manualFoodCarbs.value || 0)),
    fat: Math.round(Number(elements.manualFoodFat.value || 0)),
  });
  resetFoodForm();
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
elements.closeFoodModal.addEventListener("click", () => {
  closeMobileLogForm(elements.foodSection);
  resetFoodForm();
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
elements.foodPhotoButton.addEventListener("click", () => elements.foodPhotoInput.click());
elements.foodGalleryButton.addEventListener("click", () => elements.foodGalleryInput.click());
elements.foodPhotoInput.addEventListener("change", () => analyzeFoodPhoto(elements.foodPhotoInput.files?.[0]));
elements.foodGalleryInput.addEventListener("change", () => analyzeFoodPhoto(elements.foodGalleryInput.files?.[0]));

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
  elements.exerciseSubmit.textContent = "✓";
  elements.exerciseSection.classList.add("is-adding", "is-editing");
  document.body.classList.add("modal-open");
  elements.exerciseType.focus();
}

function resetExerciseForm() {
  elements.exerciseForm.reset();
  elements.exerciseSubmit.textContent = "+";
  editingExerciseId = null;
  elements.exerciseSection.classList.remove("is-editing");
  applyExercisePreset();
}

function normalizeExerciseCalories() {
  if (elements.exerciseCalories.value === "") return;
  elements.exerciseCalories.value = Math.round(Number(elements.exerciseCalories.value || 0));
}

elements.exerciseForm.addEventListener("submit", (event) => {
  event.preventDefault();
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
    currentDay().exercises.unshift({
      ...exercise,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  saveState();
  render();
  resetExerciseForm();
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
  setFabMenuOpen(!elements.fabActions.classList.contains("is-open"));
});
elements.fabAddFood?.addEventListener("click", openAddFoodFromFab);
elements.fabAddExercise?.addEventListener("click", openAddExerciseFromFab);
elements.fabOverlay?.addEventListener("click", () => setFabMenuOpen(false));
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
window.addEventListener("resize", () => {
  if (!isMobileSidebar()) setMobileSidebarOpen(false);
});

window.addEventListener("focus", syncSelectedDateWithToday);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncSelectedDateWithToday();
});
setInterval(syncSelectedDateWithToday, 60 * 1000);

if (localStorage.getItem("calorie-counter-sidebar-collapsed") === "true") {
  elements.appShell.classList.add("sidebar-collapsed");
}
render();
applyExercisePreset();
