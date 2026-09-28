import { bindSemanticBack } from "./semantic-back.js?v=3";
import { resolveAppearance, paintAppearance } from "./appearance.js?v=1";
import { validateTargets } from "./target-validation.js?v=1";
import { createProfileSurface } from './profile-surface.js?v=3';

export const settingFields = {
  plan: ["goalType", "weightKg", "targetWeightKg", "activityMultiplier", "weeklyRateKg"],
  personal: ["name", "sex", "age", "heightCm"],
  schedule: ["mealSchedule"], appearance: ["themePreference"],
};
const targetKeys = ["calories", "protein", "carbs", "fat"];
const number = value => /^\d+(?:[.,]\d+)?$/.test(String(value ?? "").trim()) ? Number(String(value).trim().replace(",", ".")) : NaN;
const goalsOnly = goals => Object.fromEntries(targetKeys.map(key => [key, goals[key]]));
const goalNames = { lose: "Lose fat", maintain: "Maintain weight", gain: "Build muscle" };
const activityNames = { "1.2": "Mostly sitting", "1.375": "Lightly active", "1.55": "Moderately active", "1.725": "Very active" };
const format = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—";

export function createSettingsDraft(state, mealSchedule) {
  return {
    user: { ...state.user, name: state.user.name || "", targetWeightKg: state.user.targetWeightKg ?? state.user.weightKg,
      activityMultiplier: state.user.activityMultiplier ?? 1.375, weeklyRateKg: state.user.weeklyRateKg ?? state.user.goalPace ?? .5,
      mealSchedule: mealSchedule.normalizeMealSchedule(state.user.mealSchedule), themePreference: state.user.themePreference || state.user.theme || state.theme || "light" },
    goals: { ...state.goals }, goalsAreCustom: Boolean(state.goalsAreCustom),
  };
}

export function validateSettings(section, draft, mealSchedule) {
  const errors = {}, user = draft.user;
  const numeric = (key, label, min, max, step = 1) => {
    const value = number(user[key]);
    if (!Number.isFinite(value) || value < min || value > max || Math.abs(value / step - Math.round(value / step)) > 1e-7)
      errors[key] = `${label}: enter ${step === 1 ? "a whole number" : "a number"} from ${min} to ${max}${step === .1 ? " (up to one decimal place)" : ""}.`;
  };
  if (section === "personal") {
    if (!["male", "female"].includes(user.sex)) errors.sex = "Select a sex for the calorie estimate.";
    numeric("age", "Age (18+)", 18, 100); numeric("heightCm", "Height", 120, 230);
  }
  if (section === "plan") {
    if (!goalNames[user.goalType]) errors.goalType = "Choose your goal.";
    numeric("weightKg", "Current weight", 35, 250, .1);
    if (user.goalType !== "maintain") {
      numeric("targetWeightKg", "Goal weight", 35, 250, .1);
      if (![.25, .5, .75].includes(number(user.weeklyRateKg))) errors.weeklyRateKg = "Choose a pace.";
    }
    if (!activityNames[String(user.activityMultiplier)]) errors.activityMultiplier = "Choose your activity level.";
    Object.assign(errors, validateTargets(draft.goals));
  }
  if (section === "schedule") {
    if (mealSchedule.timeToMinutes(user.mealSchedule.breakfastEnd) === null) errors.breakfastEnd = "Choose when breakfast ends.";
    if (mealSchedule.timeToMinutes(user.mealSchedule.lunchEnd) === null) errors.lunchEnd = "Choose when lunch ends.";
    else if (!errors.breakfastEnd && !mealSchedule.isValidMealSchedule(user.mealSchedule)) errors.lunchEnd = "Lunch must end after breakfast.";
  }
  if (section === "appearance" && !["system", "light", "dark"].includes(user.themePreference)) errors.themePreference = "Choose an appearance.";
  return errors;
}

export function recalculateSettingsDraft(state, draft, recommend, force = false) {
  if (draft.goalsAreCustom && !force) return;
  const keys = ["sex", "age", "heightCm", "weightKg", "targetWeightKg", "goalType", "activityMultiplier", "weeklyRateKg"];
  if (!force && !keys.some(key => String(draft.user[key]) !== String(state.user[key] ?? (key === "weeklyRateKg" ? state.user.goalPace ?? .5 : "")))) {
    // Undoing an input change restores its original automatic targets too.
    // Explicitly replacing custom targets with recommendations remains intentional.
    if (!state.goalsAreCustom && !draft.applyRecommendations) { draft.goals = { ...state.goals }; return; }
  }
  const user = { ...draft.user };
  for (const key of ["age", "heightCm", "weightKg", "targetWeightKg", "activityMultiplier", "weeklyRateKg"]) user[key] = number(user[key]);
  if (user.goalType === "maintain") { user.targetWeightKg = user.weightKg; user.weeklyRateKg = 0; }
  if (!["male", "female"].includes(user.sex) || !goalNames[user.goalType] || !activityNames[String(user.activityMultiplier)] || user.age < 18
    || ![user.age, user.heightCm, user.weightKg, user.targetWeightKg, user.weeklyRateKg].every(Number.isFinite)) return;
  draft.goals = goalsOnly(recommend(user));
  if (force) { draft.goalsAreCustom = false; draft.applyRecommendations = true; }
}

export function buildSettingsState(state, draft, section, { today, dark = false, newId = () => crypto.randomUUID() } = {}) {
  const next = { ...state, user: { ...state.user } };
  for (const key of settingFields[section]) next.user[key] = ["mealSchedule"].includes(key) ? { ...draft.user[key] }
    : ["weightKg", "targetWeightKg", "activityMultiplier", "weeklyRateKg", "age", "heightCm"].includes(key) ? number(draft.user[key]) : String(draft.user[key] ?? "").trim();
  if (section === "plan") {
    if (next.user.goalType === "maintain") { next.user.targetWeightKg = next.user.weightKg; next.user.weeklyRateKg = 0; }
    if (Number(next.user.weightKg) !== Number(state.user.weightKg)) {
      next.user.startWeightKg = state.user.startWeightKg || state.user.weightKg;
      const existing = state.progress.find(entry => entry.date === today);
      const entry = { ...(existing || { id: newId(), date: today }), weightKg: next.user.weightKg, updatedAt: new Date().toISOString() };
      next.progress = existing ? state.progress.map(item => item === existing ? entry : item) : [...state.progress, entry];
    }
  }
  if (section === "plan" || section === "personal") {
    next.goals = goalsOnly(draft.goals); next.goalsAreCustom = draft.goalsAreCustom;
  }
  if (section === "appearance") { next.theme = resolveAppearance(draft.user.themePreference, dark); next.user.theme = next.theme; }
  return next;
}

export function settingsSummary(state, mealSchedule) {
  const user = state.user, maintain = user.goalType === "maintain";
  return {
    goal: goalNames[user.goalType] || "Your plan", calories: format(state.goals.calories),
    plan: [["Current weight", user.weightKg ? `${format(user.weightKg)} kg` : "Not set"],
      ...(!maintain ? [["Goal weight", `${format(user.targetWeightKg)} kg`]] : []),
      ["Activity", activityNames[String(user.activityMultiplier)] || "Not set"],
      ...(!maintain ? [["Pace", `${format(user.weeklyRateKg ?? user.goalPace ?? .5)} kg/week`]] : [])],
    macros: [["Protein", `${format(state.goals.protein)} g`], ["Carbs", `${format(state.goals.carbs)} g`], ["Fat", `${format(state.goals.fat)} g`]],
    personal: [["Name", user.name?.trim() || "Not set · optional"], ["Sex", user.sex === "male" ? "Male" : user.sex === "female" ? "Female" : "Not set"], ["Age", format(user.age)], ["Height", `${format(user.heightCm)} cm`]],
    schedule: (() => { const s=mealSchedule.normalizeMealSchedule(user.mealSchedule);return [['Breakfast',`before ${s.breakfastEnd}`],['Lunch',`${s.breakfastEnd} – ${s.lunchEnd}`],['Dinner',`after ${s.lunchEnd}`]]; })(), appearance: ({ system: "System", light: "Light", dark: "Dark" })[user.themePreference || user.theme || state.theme || "light"],
  };
}

export function mountProfileSettings({ state: initialState, localStorage: storage, window: win, document: doc, mealSchedule, recommend, activityDescriptions, onBeforeLeave, onDispose }) {
  let state = initialState, draft, section = null, attempted = false, editingTargets = false, busy = false;
  const root = doc.querySelector("#profileSettings"), overview = doc.querySelector("#profileSettingsOverview"), form = doc.querySelector("#profileForm");
  const navigation = doc.querySelector(".mobile-tabbar");
  const background=()=>[overview,doc.querySelector('.topbar'),doc.querySelector('#sidebar'),navigation,doc.querySelector('#profileSettingsStatus')];
  const editor=createProfileSurface({panel:form,backdrop:doc.querySelector('#profileEditorBackdrop'),scroller:doc.querySelector('#profileEditorScroll'),heading:doc.querySelector('#profileFormTitle'),handle:doc.querySelector('#profileSheetHandle'),background,onBack:options=>leave('',options),win});
  const dataPanel=doc.querySelector('#profileDataScreen');let privacyOpen=false;
  const privacy=createProfileSurface({panel:dataPanel,scroller:dataPanel.querySelector('.settings-editor-scroll'),heading:doc.querySelector('#profileDataTitle'),background,onBack:options=>closePrivacy(options),win});
  onDispose(()=>{editor.dispose();privacy.dispose();});
  const view=name=>{root.dataset.profileView=name;};view('summary');
  async function closePrivacy(options={}){if(!privacyOpen||privacy.closing)return;await privacy.close(options);privacyOpen=false;view('summary');}
  doc.querySelector('#profilePrivacyOpen').addEventListener('click',()=>{if(section||privacyOpen)return;privacyOpen=true;view('privacy');privacy.open('page',doc.querySelector('#profilePrivacyOpen'));});
  doc.querySelector('#profileDataBack').addEventListener('click',closePrivacy);
  const status = doc.querySelector("#profileSettingsStatus"), saveError = doc.querySelector("#profileSaveError"), save = doc.querySelector("#profileSubmitButton"), back = doc.querySelector("#profileEditBack");
  const targetChange = doc.querySelector("#profileTargetChange");
  const mapping = { name: "profileName", sex: "profileSex", age: "profileAge", heightCm: "profileHeight", weightKg: "profileWeight", targetWeightKg: "profileTargetWeight", goalType: "profileGoalType", activityMultiplier: "profileActivity", weeklyRateKg: "profileGoalPace", breakfastEnd: "profileBreakfastEnd", lunchEnd: "profileLunchEnd", themePreference: "profileTheme", calories: "goalCalories", protein: "goalProtein", carbs: "goalCarbs", fat: "goalFat" };
  const fields = Object.fromEntries(Object.entries(mapping).map(([key, id]) => [key, doc.querySelector(`#${id}`)]));
  const errors = {};
  for (const [key, field] of Object.entries(fields)) {
    const error = doc.createElement("span"); error.id = `${field.id}-error`; error.className = "settings-error"; error.hidden = true;
    field.after(error); errors[key] = error;
    field.setAttribute("aria-describedby", [field.getAttribute("aria-describedby"), error.id].filter(Boolean).join(" "));
  }
  const editButton = name => root.querySelector(`[data-edit-settings="${name}"]`);
  function renderSummary() {
    const summary = settingsSummary(state, mealSchedule);
    doc.querySelector("#planGoal").textContent = summary.goal; doc.querySelector("#planCalories").textContent = summary.calories;
    for (const [selector, rows] of [["#planValues", summary.plan], ["#planMacros", summary.macros], ["#personalValues", summary.personal], ["#savedMealSchedule",summary.schedule]]) {
      const list = doc.querySelector(selector); list.replaceChildren();
      for (const [name, value] of rows) { const row = doc.createElement("div"), dt = doc.createElement("dt"), dd = doc.createElement("dd"); dt.textContent = name; dd.textContent = value; row.append(dt, dd); list.append(row); }
    }
    doc.querySelector("#savedAppearance").textContent = summary.appearance;
    doc.querySelector("#profileSummary").textContent = state.user.name || "Your plan";
    doc.querySelector("#profileMeta").textContent = `${format(state.user.weightKg)} kg · ${format(state.user.heightCm)} cm`;
  }
  function showErrors(values = {}) {
    for (const [key, field] of Object.entries(fields)) {
      errors[key].textContent = values[key] || ""; errors[key].hidden = !values[key];
      field.setCustomValidity(values[key] || "");
      if (values[key]) field.setAttribute("aria-invalid", "true"); else field.removeAttribute("aria-invalid");
      const group = field.parentElement.querySelector('[role=radiogroup]');
      if (group) { group.setAttribute('aria-describedby', errors[key].id); if (values[key]) group.setAttribute('aria-invalid','true'); else group.removeAttribute('aria-invalid'); }
    }
  }
  function syncEditor() {
    const maintain = draft.user.goalType === "maintain";
    for (const key of ["targetWeightKg", "weeklyRateKg"]) { fields[key].closest("label").hidden = maintain; fields[key].disabled = maintain; }
    doc.querySelector("#activityHint").textContent = activityDescriptions[String(draft.user.activityMultiplier)] || "";
    for (const key of targetKeys) { fields[key].readOnly = !editingTargets; if (doc.activeElement !== fields[key]) fields[key].value = Number.isFinite(Number(draft.goals[key])) ? draft.goals[key] : ""; }
    doc.querySelector("#targetModeNote").textContent = draft.goalsAreCustom ? "Custom targets. Profile changes won't replace them. Use recommended to apply new estimates."
      : editingTargets ? "Changes to these values will be saved as custom targets." : "Based on your plan. Changes to your plan can update these estimates when you save.";
    const changes = targetKeys.some(key => Number(draft.goals[key]) !== Number(state.goals[key]));
    targetChange.hidden = !["plan", "personal"].includes(section);
    targetChange.textContent = changes ? `Saving will update daily targets to ${format(draft.goals.calories)} kcal · ${format(draft.goals.protein)} g protein · ${format(draft.goals.carbs)} g carbs · ${format(draft.goals.fat)} g fat.`
      : draft.goalsAreCustom ? "Your custom calorie and macro targets will stay unchanged." : "Daily targets are unchanged.";
    if (attempted) showErrors(validateSettings(section, draft, mealSchedule));
  }
  function enter(name) {
    if(section||privacyOpen)return;
    section = name; draft = createSettingsDraft(state, mealSchedule); attempted = false; editingTargets = draft.goalsAreCustom;
    saveError.hidden = true; status.textContent = ""; showErrors();
    for (const [key, field] of Object.entries(fields)) field.value = targetKeys.includes(key) ? draft.goals[key] : ["breakfastEnd", "lunchEnd"].includes(key) ? draft.user.mealSchedule[key] : draft.user[key] ?? "";
    for (const fieldset of form.querySelectorAll("[data-settings-fields]")) { fieldset.hidden = fieldset.dataset.settingsFields !== name; fieldset.disabled = fieldset.hidden; }
    root.dataset.editing = name;view(name);
    doc.querySelector("#profileFormTitle").textContent = ({ plan: "Edit plan", personal: "Personal details", schedule: "Meal schedule", appearance: "Appearance" })[name];
    for(const [name,key] of [['profileSexChoice','sex'],['profileThemeChoice','themePreference']])for(const radio of form.querySelectorAll(`[name=${name}]`))radio.checked=radio.value===draft.user[key];
    syncEditor();editor.open(name==='plan'?'page':'sheet',editButton(name));
  }
  async function leave(message = "",options={}) {
    if(!section||editor.closing)return;
    await editor.close(options);
    const previous = section; section = null; draft = null; attempted = false;
    form.hidden = true; overview.hidden = false; delete root.dataset.editing;view('summary'); showErrors(); saveError.hidden = true;
    if (win.location.hash === "#targets") win.history.replaceState(win.history.state, "", "profile.html");
    renderSummary(); status.textContent = message; editButton(previous)?.focus({preventScroll:true});
  }
  function closeNested({pop=false}={}) {
    const confirmation = doc.querySelector("#deleteDataConfirm");
    if (confirmation?.open) { confirmation.close(); return false; }
    // Top-level navigation is unavailable until this editor is resolved.
    // Browser Back resolves the nested surface; a tab request never drops drafts.
    if (section) { if(pop)leave(); return false; }
    if (privacyOpen) { if(pop)closePrivacy(); return false; }
    return true;
  }
  root.querySelectorAll("[data-edit-settings]").forEach(button => button.addEventListener("click", () => enter(button.dataset.editSettings)));
  back.addEventListener("click", () => leave()); doc.querySelector("#profileCancelButton").addEventListener("click", () => leave());
  onBeforeLeave(closeNested);
  onDispose(bindSemanticBack(form, () => section==='plan' && !editor.closing ? back : null, win, {motionTargets:()=>form}));
  onDispose(bindSemanticBack(dataPanel, () => privacyOpen && !privacy.closing ? doc.querySelector('#profileDataBack') : null, win, {motionTargets:()=>dataPanel}));
  form.addEventListener("input", event => {
    if (!section) return;
    const choice=({profileSexChoice:'sex',profileThemeChoice:'themePreference'})[event.target.name];
    const key = choice || Object.keys(fields).find(key => fields[key] === event.target); if (!key) return;
    if(choice)fields[key].value=event.target.value;
    if (targetKeys.includes(key)) { draft.goals[key] = number(event.target.value); draft.goalsAreCustom = true; }
    else if (["breakfastEnd", "lunchEnd"].includes(key)) draft.user.mealSchedule[key] = event.target.value;
    else draft.user[key] = event.target.value;
    if (key === "goalType" && draft.user.goalType !== "maintain" && ![.25,.5,.75].includes(number(draft.user.weeklyRateKg))) { draft.user.weeklyRateKg = .5; fields.weeklyRateKg.value = "0.5"; }
    if (["plan", "personal"].includes(section) && !targetKeys.includes(key) && key !== "name") recalculateSettingsDraft(state, draft, recommend);
    saveError.hidden = true; syncEditor();
  });
  // Change also covers native time/select pickers that don't emit input.
  form.addEventListener("change", event => event.target.dispatchEvent(new win.Event("input", { bubbles: true })));
  doc.querySelector("#goalEditButton").addEventListener("click", () => { editingTargets = true; syncEditor(); fields.calories.focus({preventScroll:true});editor.reveal(fields.calories); });
  doc.querySelector("#goalResetButton").addEventListener("click", () => { recalculateSettingsDraft(state, draft, recommend, true); editingTargets = false; syncEditor(); });
  doc.querySelector("#mealScheduleReset").addEventListener("click", () => { draft.user.mealSchedule = { ...mealSchedule.DEFAULT_MEAL_SCHEDULE }; fields.breakfastEnd.value = draft.user.mealSchedule.breakfastEnd; fields.lunchEnd.value = draft.user.mealSchedule.lunchEnd; syncEditor(); });
  form.addEventListener("submit", event => {
    event.preventDefault(); if (!section || busy || editor.closing) return; attempted = true;
    const invalid = validateSettings(section, draft, mealSchedule); showErrors(invalid);
    const first = Object.keys(invalid)[0];
    if (first) { if (targetKeys.includes(first)) { editingTargets = true; syncEditor(); } const target=first==='sex'?form.querySelector('[name=profileSexChoice]'):fields[first];target.focus({preventScroll:true});editor.reveal(target); return; }
    const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const next = buildSettingsState(state, draft, section, { today, dark: win.matchMedia("(prefers-color-scheme: dark)").matches });
    if (JSON.stringify(next) === JSON.stringify(state)) { leave("No changes to save."); return; }
    busy = true; save.disabled = true;
    try {
      storage.setItemConfirmed("calorie-counter-state", JSON.stringify(next));
      const appearance = section === "appearance"; state = next;
      if (appearance) { storage.setItem("calorie-counter-theme", state.theme); win.dispatchEvent(new win.CustomEvent("intake:appearance", { detail: state.user.themePreference })); }
      leave("Changes saved on this device.");
    } catch (error) { saveError.textContent = `Changes weren't saved. ${/another window|protected/i.test(error.message) ? "Another window or recovery state is protecting your data. Export a recovery copy before reloading." : "Your edits are still here. Check device storage and try Save changes again."}`; saveError.hidden = false;editor.reveal(saveError); }
    finally { busy = false; save.disabled = false; }
  });
  win.addEventListener("beforeunload", event => { if (!section || JSON.stringify(draft) === JSON.stringify(createSettingsDraft(state, mealSchedule))) return; event.preventDefault(); event.returnValue = ""; });
  const shell = doc.querySelector(".app-shell"), sidebarToggle = doc.querySelector("#sidebarToggle");
  const closeSidebar = () => shell.classList.remove("mobile-sidebar-open");
  sidebarToggle.addEventListener("click", () => {
    if (win.matchMedia("(max-width: 920px)").matches) closeSidebar();
    else { shell.classList.toggle("sidebar-collapsed"); storage.setItem("calorie-counter-sidebar-collapsed", String(shell.classList.contains("sidebar-collapsed"))); }
  });
  doc.querySelector("#mobileMenuButton")?.addEventListener("click", () => shell.classList.add("mobile-sidebar-open"));
  doc.querySelector("#sidebarBackdrop").addEventListener("click", closeSidebar);
  shell.querySelectorAll(".side-nav a").forEach(link => link.addEventListener("click", closeSidebar));
  if (storage.getItem("calorie-counter-sidebar-collapsed") === "true") shell.classList.add("sidebar-collapsed");
  root.hidden = false; renderSummary(); paintAppearance(doc, resolveAppearance(state.user.themePreference || state.user.theme || state.theme, win.matchMedia("(prefers-color-scheme: dark)").matches));
  if (win.location.hash === "#targets") { enter("plan"); editingTargets = true; syncEditor();editor.reveal(doc.querySelector('#goalEditor')); }
  else if (!Number.isInteger(Number(state.user.age)) || Number(state.user.age) < 18) { enter("personal"); attempted = true; showErrors(validateSettings("personal", draft, mealSchedule)); fields.age.focus(); }
}
