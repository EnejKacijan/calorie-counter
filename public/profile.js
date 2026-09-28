import { mountOnboarding, onboardingProfile } from "./onboarding.js?v=5";
import { mountProfileSettings } from "./profile-settings.js?v=7";
import { localRecordId } from "./local-record-id.js?v=1";

export function mountPage(scope) {
const { localStorage, window, document, onBeforeLeave, onDispose, MutationObserver } = scope;
const defaults = {
  user: null,
  theme: localStorage.getItem("calorie-counter-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  goals: { calories: 2300, protein: 150, carbs: 260, fat: 75 },
  goalsAreCustom: false,
  selectedDate: localDateKey(new Date()),
  progress: [],
  days: {},
};

const mealSchedule = window.IntakeMealSchedule;

document.body.classList.add("profile-page");

let state = loadState();

const activityDescriptions = {
  "1.2": "Mostly sitting: desk work and little planned exercise.",
  "1.375": "Lightly active: light exercise or walks a few days per week.",
  "1.55": "Moderately active: training or active work most days.",
  "1.725": "Very active: hard training, physical work, or both.",
};


if (!state.user) {
  document.body.classList.add("first-run-onboarding");
  applyTheme(state.theme);
  const makeProfile = draft => onboardingProfile(draft, state.theme, mealSchedule.DEFAULT_MEAL_SCHEDULE);
  const onboarding = mountOnboarding({
    root: document.querySelector("#onboarding"), window, onDispose, MutationObserver, activityDescriptions,
    privacyRoot: document.querySelector("#privacyControls"),
    recommend: draft => calculateRecommendedGoals(makeProfile(draft)),
    restore: () => document.querySelector('#privacyControls [data-action="import"]')?.click(),
    complete: async (draft, targets, allowNavigation) => {
      const profile = makeProfile(draft);
      const nextState = { ...state, user: profile, goalsAreCustom: targets.goalsAreCustom,
        goals: Object.fromEntries(["calories", "protein", "carbs", "fat"].map(key => [key, targets.goals[key]])),
        progress: [...state.progress] };
      const today = localDateKey(new Date());
      if (!nextState.progress.some(entry => entry.date === today)) nextState.progress.push({ id: localRecordId(), date: today, weightKg: profile.weightKg });
      localStorage.setItemConfirmed("calorie-counter-state", JSON.stringify(nextState));
      state = nextState;
      allowNavigation();
      await window.IntakeNavigate("index.html", { onboardingComplete: true });
    },
  });
  onBeforeLeave(() => {
    if (onboarding.canLeave()) return true;
    onboarding.back();
    return false;
  });
  return;
}


mountProfileSettings({ ...scope, state, mealSchedule, recommend: calculateRecommendedGoals, activityDescriptions });
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

    if (Array.isArray(parsed.foods) || Array.isArray(parsed.exercises)) {
      nextState.days[nextState.selectedDate] = {
        foods: parsed.foods || [],
        exercises: parsed.exercises || [],
      };
      delete nextState.foods;
      delete nextState.exercises;
    }

    return nextState;
  } catch {
    return structuredClone(defaults);
  }
}


function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function applyTheme(theme) {
  const isDark = theme === "dark";
  const chromeColor = isDark ? "#1b1a16" : "#fbfaf6";
  document.body.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.style.backgroundColor = chromeColor;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", chromeColor);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", isDark ? "black-translucent" : "default");
}


}

export function calculateRecommendedGoals(profile) {
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
