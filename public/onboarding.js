import { bindOnboardingViewport } from "./onboarding-viewport.js?v=3";
import { bindOnboardingPace } from "./onboarding-pace.js?v=1";
import { bindOnboardingSwipe } from "./onboarding-swipe.js?v=1";
import { validateTargets, targetKeys, targetNumber } from "./target-validation.js?v=1";

const draftKey = "calorie-counter-onboarding-draft-v1";
export const onboardingStages = ["Welcome", "Goal", "Basics", "Activity", "Daily target"];
const legacyStages = { welcome: 0, goalType: 1, targetWeightKg: 2, basics: 2, sex: 2, age: 2, heightCm: 2, weightKg: 2, activity: 3, activityMultiplier: 3, weeklyRateKg: 3, target: 4 };
const goalNames = { lose: "Lose weight", maintain: "Maintain weight", gain: "Gain weight" };
const numeric = value => Number(String(value ?? "").replace(",", "."));
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const conditional = draft => ["lose", "gain"].includes(draft.goalType);
export const onboardingProgress = step => step * 25;
export function restoreOnboardingTargets(saved) {
  if (saved?.goalsAreCustom !== true || Object.keys(validateTargets(saved.goals)).length) return null;
  return { goalsAreCustom: true, goals: Object.fromEntries(targetKeys.map(key => [key, targetNumber(saved.goals[key])])) };
}

export function validateOnboardingStep(step, draft) {
  const errors = {};
  const number = (key, message, min, max, integer = false) => {
    const value = numeric(draft[key]);
    if (!String(draft[key] ?? "").trim() || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) errors[key] = message;
  };
  if (step === 1 && !["lose", "maintain", "gain"].includes(draft.goalType)) errors.goalType = "Choose your goal.";
  if (step === 2) {
    if (!["male", "female"].includes(draft.sex)) errors.sex = "Choose an option for the calorie estimate.";
    number("age", "Enter an age from 18 to 100.", 18, 100, true);
    number("heightCm", "Enter a height from 120 to 230 cm.", 120, 230, true);
    number("weightKg", "Enter a weight from 35 to 250 kg.", 35, 250);
    if (conditional(draft)) number("targetWeightKg", "Enter a weight from 35 to 250 kg.", 35, 250);
  }
  if (step === 3) {
    if (![1.2, 1.375, 1.55, 1.725].includes(numeric(draft.activityMultiplier))) errors.activityMultiplier = "Choose your activity level.";
    if (conditional(draft) && ![.25, .5, .75].includes(numeric(draft.weeklyRateKg))) errors.weeklyRateKg = "Choose a goal pace.";
  }
  return errors;
}
export function restoreOnboardingStep(saved, draft) {
  const requested = Object.hasOwn(legacyStages, saved?.question) ? legacyStages[saved.question]
    : Number.isInteger(saved?.step) && saved.step >= 0 && saved.step <= 4 ? saved.step : 0;
  for (let step = 1; step < requested; step++) if (Object.keys(validateOnboardingStep(step, draft)).length) return step;
  return requested;
}
export function onboardingSummary(draft, descriptions) {
  return [
    goalNames[draft.goalType] + " · " + (descriptions[String(draft.activityMultiplier)]?.split(":")[0] || ""),
    (draft.sex === "male" ? "Male" : "Female") + " · " + numeric(draft.age) + " years · " + numeric(draft.heightCm) + " cm · " + numeric(draft.weightKg) + " kg",
    ...(draft.goalType === "maintain" ? [] : ["Goal " + numeric(draft.targetWeightKg) + " kg · " + numeric(draft.weeklyRateKg) + " kg/week"]),
  ];
}
export function onboardingProfile(draft, theme, mealSchedule) {
  return {
    name: "", sex: draft.sex, age: numeric(draft.age), heightCm: numeric(draft.heightCm),
    weightKg: numeric(draft.weightKg), startWeightKg: numeric(draft.weightKg),
    targetWeightKg: draft.goalType === "maintain" ? numeric(draft.weightKg) : numeric(draft.targetWeightKg),
    goalType: draft.goalType, activityMultiplier: numeric(draft.activityMultiplier),
    weeklyRateKg: draft.goalType === "maintain" ? 0 : numeric(draft.weeklyRateKg),
    theme, mealSchedule: { ...mealSchedule },
  };
}
export function completionDiagnostics(error, win) {
  return { code: error?.code || "completion-failed", errorName: error?.name || "Error",
    origin: win.location.origin, protocol: win.location.protocol, secureContext: win.isSecureContext,
    randomUUID: typeof win.crypto?.randomUUID, getRandomValues: typeof win.crypto?.getRandomValues,
    build: "onboarding-five-screens-v1" };
}

export function mountOnboarding({ root, window: win, onDispose, activityDescriptions, recommend, complete, restore, privacyRoot, MutationObserver }) {
  const draft = { goalType: "", targetWeightKg: "", sex: "", age: "", heightCm: "", weightKg: "", activityMultiplier: "", weeklyRateKg: "0.5" };
  let saved, errors = {}, busy = false, finished = false, advancing = false, transition, unlockTimer, restoreFocus;
  try {
    saved = JSON.parse(win.sessionStorage.getItem(draftKey) || "null");
    if (saved?.draft && typeof saved.draft === "object") for (const key of Object.keys(draft)) if (typeof saved.draft[key] === "string") draft[key] = saved.draft[key];
  } catch { /* The optional draft never resets user data. */ }
  let step = restoreOnboardingStep(saved, draft);
  let targets = restoreOnboardingTargets(saved?.targets), targetEdit = null;
  if (step === 4 && saved?.targetEdit?.goals && targetKeys.every(key => typeof saved.targetEdit.goals[key] === "string"))
    targetEdit = { goals: Object.fromEntries(targetKeys.map(key => [key, saved.targetEdit.goals[key]])), goalsAreCustom: saved.targetEdit.goalsAreCustom === true };
  const selectedGoals = () => targets?.goals || recommend(draft);
  const remember = () => { try { win.sessionStorage.setItem(draftKey, JSON.stringify({ draft, step, targets, targetEdit })); } catch {} };
  const error = key => '<span class="onboarding-error" id="onboarding-' + key + '-error" role="alert" aria-atomic="true" hidden></span>';
  const field = (key, label, unit, mode = "decimal", values = draft) => '<label class="onboarding-field"><span>' + label + '</span><span class="onboarding-number"><input id="onboarding-' + key + '" name="' + key + '" type="text" inputmode="' + mode + '" autocomplete="off" enterkeyhint="' + (key === "fat" || key === "targetWeightKg" || key === "weightKg" && !conditional(draft) ? "done" : "next") + '" value="' + escape(values[key]) + '" aria-describedby="onboarding-' + key + '-unit onboarding-' + key + '-error"><span id="onboarding-' + key + '-unit" class="onboarding-unit">' + unit + '</span></span>' + error(key) + '</label>';
  const choices = (key, legend, options, compact = false) => '<fieldset class="onboarding-choices' + (compact ? ' onboarding-compact' : '') + '"><legend class="' + (compact ? '' : 'onboarding-sr-only') + '">' + legend + '</legend>' + options.map(([value, title, copy]) => '<label class="onboarding-choice"><input type="radio" name="' + key + '" value="' + value + '" ' + (String(draft[key]) === String(value) ? "checked" : "") + ' aria-describedby="onboarding-' + key + '-error"><span><strong>' + escape(title) + '</strong>' + (copy ? '<small>' + escape(copy) + '</small>' : "") + '</span></label>').join("") + error(key) + '</fieldset>';
  const heading = (title, copy) => '<h1 id="onboardingTitle" tabindex="-1">' + title + '</h1><p class="onboarding-copy">' + copy + '</p>';
  // Header/progress/footer keep their identity across every stage and input edit.
  root.innerHTML = '<form class="onboarding-form" novalidate><header class="onboarding-header"><span class="onboarding-brand"><img src="favicon.svg" width="30" height="30" alt="">Intake</span><button type="button" data-onboarding-back aria-label="Back one screen">← Back</button></header><div class="onboarding-orientation"><p class="onboarding-step"></p><div class="onboarding-progress" role="progressbar" aria-label="Position in setup" aria-valuemin="0" aria-valuemax="100"><span></span></div></div><div class="onboarding-content"></div><footer class="onboarding-footer"><p data-onboarding-status role="status" aria-live="polite" tabindex="-1" hidden></p><button class="onboarding-primary" type="submit"></button><button type="button" data-onboarding-restore>Restore backup</button><button type="button" data-onboarding-adjust>Adjust targets</button></footer></form>';
  const content = root.querySelector(".onboarding-content"), progress = root.querySelector(".onboarding-progress"), primary = root.querySelector(".onboarding-primary");
  const paceReveal = bindOnboardingPace(content, win);
  const status = message => { const node = root.querySelector("[data-onboarding-status]"); node.textContent = message; node.hidden = !message; };
  let viewport;
  function render(focus = true, direction = 1) {
    paceReveal.reset();
    let html;
    if (step === 0) html = '<p class="onboarding-kicker">A little clarity, every day.</p><h1 id="onboardingTitle" tabindex="-1">Know what\'s left for today.</h1><p class="onboarding-copy">Track calories and macros against a daily target that starts with you.</p><p class="onboarding-note">Your data stays on this device. Export a backup whenever you need one.</p>';
    if (step === 1) html = heading("What's your goal?", "Choose a direction. You can change it later.") + choices("goalType", "Your goal", Object.entries(goalNames));
    if (step === 2) html = heading("A few basics.", "Used to estimate your daily targets.") + choices("sex", "Sex used for the calorie estimate", [["male", "Male"], ["female", "Female"]], true) + '<div class="onboarding-fields">' + field("age", "Age", "years", "numeric") + field("heightCm", "Height", "cm", "numeric") + field("weightKg", "Current weight", "kg") + (conditional(draft) ? field("targetWeightKg", "Goal weight", "kg") : "") + '</div>';
    if (step === 3) html = heading("Your everyday activity.", conditional(draft) ? "Choose your activity and goal pace." : "Pick the closest fit to a typical week.") + choices("activityMultiplier", "Activity level", Object.entries(activityDescriptions).map(([value, description]) => [value, description.split(":")[0], description.split(": ")[1]])) + (conditional(draft) ? choices("weeklyRateKg", "Goal pace · kg per week", [["0.25", "0.25"], ["0.5", "0.5"], ["0.75", "0.75"]], true) : "");
    if (step === 4) {
      const goals = selectedGoals();
      html = targetEdit ? heading("Adjust your targets.", "Save these for your daily plan, or keep the recommendation.") + '<div class="onboarding-fields">' + targetKeys.map(key => field(key, key[0].toUpperCase() + key.slice(1), key === "calories" ? "kcal" : "g", "numeric", targetEdit.goals)).join("") + '</div><button type="button" data-onboarding-recommended>Use recommended</button>'
        : heading("Your daily starting point.", targets ? "Your custom daily targets." : "An estimate based on your answers.") + '<div class="onboarding-calories"><span>Daily calories</span><strong>' + goals.calories + '</strong><span>kcal / day</span></div><div class="onboarding-macros">' + ["protein", "carbs", "fat"].map(key => '<div><span>' + key + '</span><strong>' + goals[key] + ' <small>g</small></strong></div>').join("") + '</div><div class="onboarding-summary"><span>' + (targets ? "Your answers · custom targets stay unchanged" : "Based on") + '</span>' + onboardingSummary(draft, activityDescriptions).map(line => '<p>' + escape(line) + '</p>').join("") + '</div><p class="onboarding-note">Nutrition targets are estimates, not medical advice. You can change your plan in Profile.</p>';
    }
    content.innerHTML = html; content.scrollTop = 0; status("");
    root.dataset.step = String(step);
    root.dataset.targetEditing = String(Boolean(targetEdit));
    root.querySelector(".onboarding-step").textContent = onboardingStages[step];
    progress.setAttribute("aria-valuenow", String(onboardingProgress(step)));
    progress.setAttribute("aria-valuetext", onboardingStages[step] + ", screen " + (step + 1) + " of 5");
    progress.firstElementChild.style.width = onboardingProgress(step) + "%";
    root.querySelector("[data-onboarding-back]").hidden = step === 0;
    root.querySelector("[data-onboarding-restore]").hidden = step !== 0;
    root.querySelector("[data-onboarding-adjust]").hidden = step !== 4;
    root.querySelector("[data-onboarding-adjust]").textContent = targetEdit ? "Cancel" : "Adjust targets";
    primary.textContent = targetEdit ? "Save targets" : step === 0 ? "Get started" : step === 4 ? "Start tracking" : step === 3 ? "See my target" : "Continue";
    root.querySelectorAll("button").forEach(button => { button.disabled = busy || advancing; });
    transition?.cancel();
    if (focus) {
      root.querySelector("h1").focus({ preventScroll: true });
      if (!win.matchMedia("(prefers-reduced-motion: reduce)").matches) transition = content.animate([{ opacity: .5, transform: "translateY(" + direction * 4 + "px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 150, easing: "ease-out" });
    }
  }
  const locked = () => busy || finished || advancing;
  function lockTransition() {
    advancing = true;
    root.querySelectorAll("button").forEach(button => { button.disabled = true; });
    win.clearTimeout(unlockTimer);
    // Re-entry guard, not a delay before committing state/navigation.
    unlockTimer = win.setTimeout(() => {
      advancing = false;
      if (!busy && !finished) { root.querySelectorAll("button").forEach(button => { button.disabled = false; }); restoreFocus?.focus({ preventScroll: true }); }
      restoreFocus = null;
    }, win.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150);
  }
  function cancelTargets() {
    targetEdit = null; errors = {}; remember(); render();
    restoreFocus = root.querySelector("[data-onboarding-adjust]");
  }
  function adjustTargets() {
    if (locked()) return;
    lockTransition();
    if (targetEdit) { cancelTargets(); return; }
    targetEdit = { goals: Object.fromEntries(targetKeys.map(key => [key, String(selectedGoals()[key])])), goalsAreCustom: Boolean(targets) };
    errors = {}; remember(); render(false);
    root.querySelector("h1").focus({ preventScroll: true });
  }
  function back() {
    if (locked() || step === 0) return;
    lockTransition();
    if (targetEdit) { cancelTargets(); return; }
    step--; errors = {}; remember(); render(true, -1);
  }
  function showError(key, message) {
    root.querySelectorAll('[name="' + key + '"]').forEach(input => { if (message) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); });
    const node = root.querySelector("#onboarding-" + key + "-error");
    if (node) { node.hidden = !message; node.textContent = message || ""; }
  }
  function focusError(key) {
    const input = root.querySelector('[name="' + key + '"]:checked') || root.querySelector('[name="' + key + '"]');
    input.focus({ preventScroll: true }); viewport.reveal(input);
  }
  function check() {
    errors = targetEdit ? validateTargets(targetEdit.goals) : validateOnboardingStep(step, draft);
    for (const input of root.querySelectorAll("[name]")) showError(input.name, errors[input.name]);
    const key = Object.keys(errors)[0];
    if (key) focusError(key);
    return !key;
  }
  async function finish() {
    if (locked()) return;
    for (let s = 1; s <= 3; s++) if (Object.keys(validateOnboardingStep(s, draft)).length) { step = s; remember(); render(false); check(); return; }
    busy = true; root.setAttribute("aria-busy", "true");
    root.querySelectorAll("button").forEach(button => { button.disabled = true; }); status("Saving your plan…");
    try {
      await complete(draft, { goals: { ...selectedGoals() }, goalsAreCustom: Boolean(targets) }, () => { finished = true; });
      try { win.sessionStorage.removeItem(draftKey); } catch {}
    } catch (error) {
      finished = false; busy = false; root.removeAttribute("aria-busy");
      root.querySelectorAll("button").forEach(button => { button.disabled = false; });
      win.console.error("Onboarding completion failed", completionDiagnostics(error, win));
      status(error?.code === "local-id-unavailable" ? "This browser could not save your plan. Reopen Intake in an updated browser and try again." : "Your plan could not be saved on this device. Try again. Your setup answers are still here.");
      root.querySelector("[data-onboarding-status]").focus({ preventScroll: true });
    }
  }
  root.addEventListener("input", event => {
    if (busy || finished) return;
    if (targetEdit && targetKeys.includes(event.target.name)) {
      const name = event.target.name; targetEdit.goals[name] = event.target.value; targetEdit.goalsAreCustom = true; remember();
      if (errors[name] && !validateTargets(targetEdit.goals)[name]) { delete errors[name]; showError(name, ""); }
      return;
    }
    const name = event.target.name; if (!Object.hasOwn(draft, name)) return;
    draft[name] = event.target.value; remember();
    if (errors[name] && !validateOnboardingStep(step, draft)[name]) { delete errors[name]; showError(name, ""); }
    if (name === "activityMultiplier") revealPace();
  });
  function revealPace() {
    if (step === 3 && conditional(draft)) paceReveal.reveal(root.querySelector('[name="weeklyRateKg"]')?.closest("fieldset"));
  }
  function forward() {
    if (locked() || step === 4) return;
    if (check()) {
      lockTransition(); step++; errors = {}; remember(); render();
    }
  }
  root.addEventListener("submit", event => {
    event.preventDefault(); if (locked()) return;
    if (targetEdit) {
      if (check()) { lockTransition(); targets = restoreOnboardingTargets(targetEdit); targetEdit = null; errors = {}; remember(); render(); }
      return;
    }
    if (step === 4) { void finish(); return; }
    forward();
  });
  root.addEventListener("click", event => {
    // Clicking an already selected activity is deliberate too (no input event).
    if (event.target.matches('input[name="activityMultiplier"]')) revealPace();
    if (event.detail > 1 && event.target.closest(".onboarding-primary")) { event.preventDefault(); return; }
    if (event.target.closest("[data-onboarding-back]")) back();
    if (event.target.closest("[data-onboarding-adjust]")) adjustTargets();
    if (event.target.closest("[data-onboarding-recommended]") && targetEdit && !locked()) {
      targetEdit.goals = Object.fromEntries(targetKeys.map(key => [key, String(recommend(draft)[key])])); targetEdit.goalsAreCustom = false;
      for (const key of targetKeys) { root.querySelector('[name="' + key + '"]').value = targetEdit.goals[key]; showError(key, ""); }
      errors = {}; remember();
    }
    if (event.target.closest("[data-onboarding-restore]")) restore();
  });
  root.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.repeat || event.isComposing)) { event.preventDefault(); return; }
    if (event.key === "Enter" && (step === 2 || targetEdit) && event.target.matches('input[type="text"]')) {
      event.preventDefault();
      const key = event.target.name, message = (targetEdit ? validateTargets(targetEdit.goals) : validateOnboardingStep(step, draft))[key];
      if (message) { errors[key] = message; showError(key, message); focusError(key); return; }
      const inputs = [...root.querySelectorAll('input[type="text"]')], next = inputs[inputs.indexOf(event.target) + 1];
      if (next) { next.focus({ preventScroll: true }); viewport.reveal(next); }
      else root.querySelector("form").requestSubmit();
    }
    if (event.key === "Escape" && step !== 0) { event.preventDefault(); back(); }
  });
  const observer = new MutationObserver(() => { const message = privacyRoot.querySelector("[data-status]")?.textContent; if (message) status(message); });
  observer.observe(privacyRoot, { childList: true, subtree: true, characterData: true });
  root.hidden = false; render(false); viewport = bindOnboardingViewport(root, win);
  const disposeSwipe = bindOnboardingSwipe(root, { window: win, enabled: () => !locked(), identity: () => step + ":" + Boolean(targetEdit), back, forward });
  onDispose(() => { observer.disconnect(); viewport.dispose(); paceReveal.dispose(); disposeSwipe(); win.clearTimeout(unlockTimer); transition?.cancel(); });
  return { canLeave: () => finished, back };
}
