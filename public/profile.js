const defaults = {
  user: null,
  theme: localStorage.getItem("calorie-counter-theme") || "light",
  goals: { calories: 2300, protein: 150, carbs: 260, fat: 75 },
  goalsAreCustom: false,
  selectedDate: localDateKey(new Date()),
  progress: [],
  days: {},
};

document.body.classList.add("profile-page");

let state = loadState();
let goalsAreCustom = false;
let isIntroActive = !state.user;

const activityDescriptions = {
  "1.2": "Mostly sitting: desk work and little planned exercise.",
  "1.375": "Lightly active: light exercise or walks a few days per week.",
  "1.55": "Moderately active: training or active work most days.",
  "1.725": "Very active: hard training, physical work, or both.",
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  mobileTabLinks: [...document.querySelectorAll(".mobile-tabbar a")],
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  logoutButton: document.querySelector("#logoutButton"),
  profilePageLogoutButton: document.querySelector("#profilePageLogoutButton"),
  profileSummary: document.querySelector("#profileSummary"),
  profileMeta: document.querySelector("#profileMeta"),
  profilePageTitle: document.querySelector("#profilePageTitle"),
  introShell: document.querySelector("#introShell"),
  introStartButton: document.querySelector("#introStartButton"),
  profileForm: document.querySelector("#profileForm"),
  profileFormTitle: document.querySelector("#profileFormTitle"),
  profileFormCopy: document.querySelector("#profileFormCopy"),
  profileSubmitButton: document.querySelector("#profileSubmitButton"),
  profileName: document.querySelector("#profileName"),
  profileSex: document.querySelector("#profileSex"),
  profileAge: document.querySelector("#profileAge"),
  profileHeight: document.querySelector("#profileHeight"),
  profileWeight: document.querySelector("#profileWeight"),
  profileTargetWeight: document.querySelector("#profileTargetWeight"),
  profileGoalType: document.querySelector("#profileGoalType"),
  profileActivity: document.querySelector("#profileActivity"),
  profileGoalPace: document.querySelector("#profileGoalPace"),
  activityHint: document.querySelector("#activityHint"),
  goalPaceHint: document.querySelector("#goalPaceHint"),
  profileTheme: document.querySelector("#profileTheme"),
  recommendationPreview: document.querySelector("#recommendationPreview"),
  recommendedCalories: document.querySelector("#recommendedCalories"),
  recommendedProtein: document.querySelector("#recommendedProtein"),
  recommendedCarbs: document.querySelector("#recommendedCarbs"),
  recommendedFat: document.querySelector("#recommendedFat"),
  maintenancePreview: document.querySelector("#maintenancePreview"),
  goalEditButton: document.querySelector("#goalEditButton"),
  goalResetButton: document.querySelector("#goalResetButton"),
  goalEditor: document.querySelector("#goalEditor"),
  customTargets: document.querySelector("#customTargets"),
  goalCalories: document.querySelector("#goalCalories"),
  goalProtein: document.querySelector("#goalProtein"),
  goalCarbs: document.querySelector("#goalCarbs"),
  goalFat: document.querySelector("#goalFat"),
};

function loadState() {
  const saved = localStorage.getItem("calorie-counter-state");
  if (!saved) return structuredClone(defaults);

  try {
    const parsed = JSON.parse(saved);
    const nextState = { ...structuredClone(defaults), ...parsed };

    if (!nextState.days) nextState.days = {};
    if (!Array.isArray(nextState.progress)) nextState.progress = [];
    if (!nextState.selectedDate) nextState.selectedDate = localDateKey(new Date());
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

function saveState() {
  state.theme = state.user?.theme || elements.profileTheme.value || state.theme || "light";
  localStorage.setItem("calorie-counter-theme", state.theme);
  localStorage.setItem("calorie-counter-state", JSON.stringify(state));
}

function ensureDay(dateKey, targetState = state) {
  if (!targetState.days[dateKey]) {
    targetState.days[dateKey] = { foods: [], exercises: [] };
  }
  return targetState.days[dateKey];
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function applyTheme(theme) {
  document.body.dataset.theme = theme === "dark" ? "dark" : "light";
}

function isMobileSidebar() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function setMobileSidebarOpen(isOpen) {
  elements.appShell.classList.toggle("mobile-sidebar-open", isOpen);
  elements.mobileMenuButton?.setAttribute("aria-expanded", String(isOpen));
}

function renderProfileShell() {
  applyTheme(state.user?.theme || state.theme || "light");
  document.body.classList.toggle("is-logged-out-profile", !state.user);
  document.body.classList.toggle("profile-landing-active", !state.user && isIntroActive);
  elements.appShell.classList.toggle("is-auth-only", !state.user);
  updateSetupNavigationLock();
  if (!state.user) elements.appShell.classList.remove("sidebar-collapsed");

  if (!state.user) {
    elements.profileSummary.textContent = "Your plan";
    elements.profileMeta.textContent = "Set up profile";
    elements.profilePageTitle.textContent = "Set Up Profile";
    elements.profileFormTitle.textContent = "Set Up Your Goals";
    elements.profileFormCopy.textContent = "Create a local profile so the app can estimate daily calories and macros from your body stats and goal.";
    elements.profileSubmitButton.textContent = "Start tracking";
    elements.profilePageLogoutButton.hidden = true;
    return;
  }

  elements.profileSummary.textContent = state.user.name;
  elements.profileMeta.textContent = `${state.user.weightKg} kg · ${state.user.heightCm} cm`;
  elements.profilePageTitle.textContent = "Profile";
  elements.profileFormTitle.textContent = "Edit Profile";
  elements.profileFormCopy.textContent = "Adjust your body stats and goal. Daily calories and macros will refresh from the updated plan.";
  elements.profileSubmitButton.textContent = "Update goals";
  elements.profilePageLogoutButton.hidden = false;
}

function updateSetupNavigationLock() {
  const shouldLock = !state.user;
  elements.mobileTabLinks.forEach((link) => {
    const isProfileLink = link.getAttribute("href") === "profile.html";
    const isLocked = shouldLock && !isProfileLink;
    link.classList.toggle("is-disabled-during-setup", isLocked);
    link.setAttribute("aria-disabled", String(isLocked));
    if (isLocked) {
      link.setAttribute("tabindex", "-1");
    } else {
      link.removeAttribute("tabindex");
    }
  });
}

elements.mobileTabLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    if (link.classList.contains("is-disabled-during-setup")) {
      event.preventDefault();
    }
  });
});

function fillProfileForm() {
  const user = state.user || {};
  elements.profileName.value = user.name || "";
  elements.profileSex.value = user.sex || "male";
  elements.profileAge.value = user.age || "";
  elements.profileHeight.value = user.heightCm || "";
  elements.profileWeight.value = user.weightKg || "";
  elements.profileTargetWeight.value = user.targetWeightKg || user.weightKg || "";
  elements.profileGoalType.value = user.goalType || "lose";
  elements.profileActivity.value = String(user.activityMultiplier || 1.375);
  elements.profileGoalPace.value = String(user.weeklyRateKg || 0.5);
  elements.profileTheme.value = user.theme || state.theme || localStorage.getItem("calorie-counter-theme") || "light";
  setGoalEditing(false);
  applyTheme(elements.profileTheme.value);
  updateActivityHints();
  updateRecommendationPreview();
}

function profileFromForm() {
  const existingStartWeight = state.user?.startWeightKg;
  return {
    name: elements.profileName.value.trim(),
    sex: elements.profileSex.value,
    age: Number(elements.profileAge.value),
    heightCm: Number(elements.profileHeight.value),
    weightKg: Number(elements.profileWeight.value),
    startWeightKg: existingStartWeight || Number(elements.profileWeight.value),
    targetWeightKg: Number(elements.profileTargetWeight.value),
    goalType: elements.profileGoalType.value,
    activityMultiplier: Number(elements.profileActivity.value),
    weeklyRateKg: Number(elements.profileGoalPace.value),
    theme: elements.profileTheme.value,
  };
}

function calculateRecommendedGoals(profile) {
  const sexOffset = profile.sex === "male" ? 5 : -161;
  const bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + sexOffset;
  const tdee = bmr * profile.activityMultiplier;
  const paceAdjustment = Math.round(((profile.weeklyRateKg || 0.5) * 7700) / 7 / 50) * 50;
  const goalAdjustments = { lose: -paceAdjustment, maintain: 0, gain: paceAdjustment };
  const calories = Math.max(1200, Math.round((tdee + goalAdjustments[profile.goalType]) / 50) * 50);
  const proteinMultipliers = { lose: 2, maintain: 1.6, gain: 1.8 };
  const proteinWeight = profile.goalType === "lose" ? profile.targetWeightKg : profile.weightKg;
  const protein = Math.round(proteinWeight * proteinMultipliers[profile.goalType]);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return { calories, protein, carbs, fat, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

function updateActivityHints() {
  elements.activityHint.textContent = activityDescriptions[elements.profileActivity.value] || activityDescriptions["1.375"];
  const goalType = elements.profileGoalType.value;
  const pace = elements.profileGoalPace.value;
  elements.profileGoalPace.disabled = goalType === "maintain";
  elements.goalPaceHint.textContent = goalType === "maintain"
    ? "Maintain uses your estimated maintenance calories."
    : `${goalType === "lose" ? "Lose" : "Gain"} about ${pace} kg per week in the calorie recommendation.`;
}

function updateRecommendationPreview() {
  const profile = profileFromForm();
  const complete = profile.name && profile.age && profile.heightCm && profile.weightKg && profile.targetWeightKg;

  if (!complete) {
    elements.recommendationPreview.textContent = "Fill in your profile to preview your recommended daily calories and macros.";
    updateRecommendedSummary(null);
    fillGoalInputs(goalsAreCustom ? state.goals : { calories: "", protein: "", carbs: "", fat: "" });
    return;
  }

  const goals = calculateRecommendedGoals(profile);
  elements.recommendationPreview.textContent = goalsAreCustom
    ? "Suggested baseline from your profile."
    : "These suggestions will be used unless you edit them.";
  updateRecommendedSummary(goals);

  if (!goalsAreCustom) {
    fillGoalInputs(goals);
  }

  updateSubmitState();
}

function updateRecommendedSummary(goals) {
  const empty = "--";
  elements.recommendedCalories.textContent = goals ? `${goals.calories}` : empty;
  elements.recommendedProtein.textContent = goals ? `${goals.protein}g` : empty;
  elements.recommendedCarbs.textContent = goals ? `${goals.carbs}g` : empty;
  elements.recommendedFat.textContent = goals ? `${goals.fat}g` : empty;
  elements.maintenancePreview.textContent = goals
    ? `Maintenance: ${goals.tdee} kcal/day`
    : "Maintenance will appear after your profile is complete.";
}

function fillGoalInputs(goals) {
  elements.goalCalories.value = goals.calories;
  elements.goalProtein.value = goals.protein;
  elements.goalCarbs.value = goals.carbs;
  elements.goalFat.value = goals.fat;
  updateSubmitState();
}

function goalsFromInputs() {
  return {
    calories: Number(elements.goalCalories.value),
    protein: Number(elements.goalProtein.value),
    carbs: Number(elements.goalCarbs.value),
    fat: Number(elements.goalFat.value),
  };
}

function setGoalEditing(isEditing) {
  goalsAreCustom = isEditing;
  [elements.goalCalories, elements.goalProtein, elements.goalCarbs, elements.goalFat].forEach((input) => {
    input.readOnly = !isEditing;
  });
  elements.goalEditor.classList.toggle("is-editing-custom", isEditing);
  elements.customTargets.hidden = !isEditing;
  elements.goalEditButton.classList.toggle("is-active", isEditing);
  elements.goalEditButton.setAttribute("aria-pressed", String(isEditing));
  elements.goalEditButton.title = isEditing ? "Custom targets are open" : "Edit custom targets";
  elements.goalEditButton.setAttribute("aria-label", isEditing ? "Custom targets are open" : "Edit custom targets");
  elements.goalEditButton.textContent = "Edit manually";
  elements.goalResetButton.disabled = !isEditing;
  updateSubmitState();
}

function isProfileReady() {
  const requiredFields = [
    elements.profileName,
    elements.profileSex,
    elements.profileAge,
    elements.profileHeight,
    elements.profileWeight,
    elements.profileTargetWeight,
    elements.profileGoalType,
    elements.profileActivity,
  ];
  const profileFieldsValid = requiredFields.every((field) => field.value && field.checkValidity());
  const goalsValid = [elements.goalCalories, elements.goalProtein, elements.goalCarbs, elements.goalFat]
    .every((input) => input.value !== "" && input.checkValidity());

  return profileFieldsValid && goalsValid;
}

function updateSubmitState() {
  const isReady = isProfileReady();
  elements.profileSubmitButton.disabled = !isReady;
  elements.profileSubmitButton.setAttribute("aria-disabled", String(!isReady));
  elements.profileSubmitButton.title = isReady ? "" : "Fill in your profile to start tracking";
}

elements.profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  updateSubmitState();
  if (elements.profileSubmitButton.disabled) {
    elements.profileForm.reportValidity();
    return;
  }

  const profile = profileFromForm();
  state.user = profile;

  const latestWeight = [...state.progress].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weightKg;
  if (!state.progress.length || Number(latestWeight) !== Number(profile.weightKg)) {
    const today = localDateKey(new Date());
    state.progress = state.progress.filter((entry) => entry.date !== today);
    state.progress.push({ id: crypto.randomUUID(), date: today, weightKg: profile.weightKg });
  }

  state.goals = goalsFromInputs();
  state.goalsAreCustom = goalsAreCustom;

  saveState();
  window.location.href = "index.html";
});

[
  elements.profileName,
  elements.profileSex,
  elements.profileAge,
  elements.profileHeight,
  elements.profileWeight,
  elements.profileTargetWeight,
  elements.profileGoalType,
  elements.profileActivity,
  elements.profileGoalPace,
].forEach((input) => {
  input.addEventListener("input", () => {
    updateActivityHints();
    updateRecommendationPreview();
    updateSubmitState();
  });
  input.addEventListener("change", () => {
    updateActivityHints();
    updateRecommendationPreview();
    updateSubmitState();
  });
});

elements.profileTheme.addEventListener("change", () => {
  state.theme = elements.profileTheme.value;
  if (state.user) state.user.theme = state.theme;
  saveState();
  applyTheme(state.theme);
});

elements.goalEditButton.addEventListener("click", () => {
  setGoalEditing(!goalsAreCustom);
  if (!goalsAreCustom) updateRecommendationPreview();
});

elements.goalResetButton.addEventListener("click", () => {
  setGoalEditing(false);
  updateRecommendationPreview();
});

[elements.goalCalories, elements.goalProtein, elements.goalCarbs, elements.goalFat].forEach((input) => {
  input.addEventListener("input", updateSubmitState);
  input.addEventListener("change", updateSubmitState);
});

elements.introStartButton.addEventListener("click", () => {
  isIntroActive = false;
  renderProfileShell();
  elements.profileName.focus();
});

function handleLogout() {
  if (!window.confirm("Are you sure you want to log out?")) return;
  state.user = null;
  isIntroActive = true;
  state.goalsAreCustom = false;
  saveState();
  fillProfileForm();
  renderProfileShell();
}

elements.logoutButton.addEventListener("click", handleLogout);
elements.profilePageLogoutButton.addEventListener("click", handleLogout);

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

if (localStorage.getItem("calorie-counter-sidebar-collapsed") === "true") {
  elements.appShell.classList.add("sidebar-collapsed");
}

fillProfileForm();
renderProfileShell();
