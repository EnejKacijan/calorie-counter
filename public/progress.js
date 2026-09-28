import { localRecordId } from './local-record-id.js?v=1';
import { createSheetSurface } from './mobile-surface.js?v=3';
import { bindCalendarSwipe } from './calendar-swipe.js?v=3';
export function mountPage({ localStorage, window, document, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, MutationObserver, fetch, onDispose, onBeforeLeave, viewState = {} }) {
const storageKey = "calorie-counter-state";
const state = loadState();
document.body.classList.add("progress-page");

const elements = {
  progressForm: document.querySelector("#progressForm"),
  progressDate: document.querySelector("#progressDate"),
  progressWeight: document.querySelector("#progressWeight"),
  weightFormTitle: document.querySelector("#weightFormTitle"),
  weightSave: document.querySelector("#weightSave"),
  weightCancel: document.querySelector("#weightCancel"),
  weightFormError: document.querySelector("#weightFormError"),
  weightSheet: document.querySelector('#weightSheet'),
  weightSheetBackdrop: document.querySelector('#weightSheetBackdrop'),
  weightSheetHandle: document.querySelector('#weightSheetHandle'),
  weightSheetContent: document.querySelector('#weightSheetContent'),
  weightSheetNotice: document.querySelector('#weightSheetNotice'),
  weightUndoToast: document.querySelector('#weightUndoToast'),
  weightLogJump: document.querySelector("#weightLogJump"),
  currentWeightValue: document.querySelector("#currentWeightValue"),
  weightTrendText: document.querySelector("#weightTrendText"),
  weightTargetStatus: document.querySelector("#weightTargetStatus"),
  progressChart: document.querySelector("#progressChart"),
  weightChartAxis: document.querySelector(".weight-chart-axis"),
  weightRangeButtons: Array.from(document.querySelectorAll("[data-weight-range]")),
  weightPreviousPeriod: document.querySelector("#weightPreviousPeriod"),
  weightNextPeriod: document.querySelector("#weightNextPeriod"),
  weightPeriodLabel: document.querySelector("#weightPeriodLabel"),
  progressList: document.querySelector("#progressList"),
  progressViewButtons: Array.from(document.querySelectorAll("[data-progress-view]")),
  progressViews: Array.from(document.querySelectorAll("[data-progress-panel]")),
  nutritionMetricButtons: Array.from(document.querySelectorAll("[data-nutrition-metric]")),
  nutritionRangeButtons: Array.from(document.querySelectorAll("[data-nutrition-range]")),
  nutritionChart: document.querySelector("#nutritionChart"),
  nutritionChartAxis: document.querySelector("#nutritionChartAxis"),
  nutritionChartDetailDate: document.querySelector("#nutritionChartDetailDate"),
  nutritionChartDetail: document.querySelector("#nutritionChartDetail"),
  nutritionPreviousRange: document.querySelector("#nutritionPreviousRange"),
  nutritionNextRange: document.querySelector("#nutritionNextRange"),
  nutritionSummaryLabels: [1, 2, 3].map(i => document.querySelector(`#nutritionSummaryLabel${i}`)),
  nutritionSummaryValues: [1, 2, 3].map(i => document.querySelector(`#nutritionSummaryValue${i}`)),
  nutritionLoggedDays: document.querySelector("#nutritionLoggedDays"),
  nutritionInsightTitle: document.querySelector("#nutritionInsightTitle"),
  nutritionInsightText: document.querySelector("#nutritionInsightText"),
  appShell: document.querySelector(".app-shell"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  profileSummary: document.querySelector("#profileSummary"),
  profileMeta: document.querySelector("#profileMeta"),
};

let activeProgressView = window.location.hash === "#nutrition" ? "nutrition" : viewState.view || "weight";
let nutritionMetric = localStorage.getItem("daily-fuel-nutrition-metric") || "calories";
let nutritionRange = Number(localStorage.getItem("daily-fuel-nutrition-range") || 7);
let nutritionRangeOffset = viewState.nutritionOffset || 0;
let selectedNutritionDate = viewState.day || localDateKey(new Date());
let weightRange = Number(localStorage.getItem("daily-fuel-weight-range") || 30);
let weightRangeOffset = viewState.weightOffset || 0;
let editingWeightId = null;
let weightDraftDate = null;
let weightSheet = null;
let weightSaving = false;
let weightReturnId = null;
let weightPager = null;
let nutritionPager = null;
const weightFeedback = createWeightFeedback({ setTimeout, clearTimeout, render: renderWeightFeedback });

const nutritionMetrics = {
  calories: { label: "Calories", unit: "kcal", goalKey: "calories", valueKey: "calories" },
  net: { label: "Net", unit: "kcal", goalKey: "calories", valueKey: "netCalories" },
  macros: { label: "Macros", unit: "%", isMacro: true },
};

if (!nutritionMetrics[nutritionMetric]) nutritionMetric = "calories";
if (![7, 30].includes(nutritionRange)) nutritionRange = 7;
if (![7, 30].includes(weightRange)) weightRange = 30;

function loadState() {
  const saved = localStorage.getItem(storageKey);
  const fallback = {
    user: null,
    progress: [],
    days: {},
    goals: { calories: 2300, protein: 150, carbs: 260, fat: 75 },
    theme: localStorage.getItem("calorie-counter-theme") || "light",
  };
  if (!saved) return fallback;

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.progress)) parsed.progress = [];
    if (!parsed.days) parsed.days = {};
    if (!parsed.goals) parsed.goals = fallback.goals;
    if (parsed.user && !parsed.user.startWeightKg) parsed.user.startWeightKg = parsed.user.weightKg;
    if (!parsed.theme) parsed.theme = parsed.user?.theme || fallback.theme;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function saveState(next) {
  if (localStorage.setItemConfirmed) localStorage.setItemConfirmed(storageKey, JSON.stringify(next));
  else localStorage.setItem(storageKey, JSON.stringify(next));
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

function isMobileSidebar() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function setMobileSidebarOpen(isOpen) {
  elements.appShell.classList.toggle("mobile-sidebar-open", isOpen);
  elements.mobileMenuButton?.setAttribute("aria-expanded", String(isOpen));
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

function summarizeDay(day = { foods: [], exercises: [] }) {
  const foodTotals = (day.foods || []).reduce(
    (sum, food) => ({
      calories: sum.calories + Math.round(Number(food.calories || 0)),
      protein: sum.protein + Math.round(Number(food.protein || 0)),
      carbs: sum.carbs + Math.round(Number(food.carbs || 0)),
      fat: sum.fat + Math.round(Number(food.fat || 0)),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const exerciseCalories = (day.exercises || []).reduce((sum, exercise) => sum + Math.round(Number(exercise.calories || 0)), 0);
  return { ...foodTotals, exerciseCalories, netCalories: foodTotals.calories - exerciseCalories };
}

function currentWeight() {
  const latest = dailyWeightEntries(state.progress).at(-1);
  return Number(latest?.weightKg || state.user?.weightKg || 0);
}

function dailyWeightEntries(entries) {
  const byDate = new Map();
  [...entries]
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.date || "")) && Number.isFinite(Number(entry?.weightKg)))
    .sort((left, right) => (
      left.date.localeCompare(right.date)
      || String(left.updatedAt || left.createdAt || "").localeCompare(String(right.updatedAt || right.createdAt || ""))
    ))
    .forEach((entry) => byDate.set(entry.date, entry));
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function formatWeight(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function trendForEntries(entries) {
  if (!entries.length) return { delta: 0, days: 0, label: "Log your first weight to see a trend.", tone: "neutral" };
  if (entries.length === 1) return { delta: 0, days: 0, label: "Add another entry to see trend.", tone: "neutral" };

  const latest = entries.at(-1);
  const latestDate = dateFromKey(latest.date);
  const fourteenDaysAgo = addDays(latestDate, -14);
  const baseline = [...entries].reverse().find((entry) => dateFromKey(entry.date) <= fourteenDaysAgo) || entries[0];
  const days = Math.max(1, Math.round((latestDate - dateFromKey(baseline.date)) / 86400000));
  const delta = Number(latest.weightKg) - Number(baseline.weightKg);
  const tone = "neutral";
  const change = Math.abs(delta) <= 0.05 ? "No change" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`;
  const label = `${change} in ${days} ${days === 1 ? "day" : "days"}`;
  return { delta, days, label, tone };
}

function targetStatus(currentWeight) {
  const targetWeight = Number(state.user?.targetWeightKg);
  if (!Number.isFinite(targetWeight) || targetWeight <= 0) return "Target not set";

  const difference = Number(currentWeight) - targetWeight;
  if (Math.abs(difference) <= 0.05) return "At target";
  return `${formatWeight(Math.abs(difference))} kg ${difference > 0 ? "above" : "below"} target`;
}

function render() {
  applyTheme(state.user?.theme || state.theme || "light");

  if (!state.user) {
    window.location.href = "profile.html";
    return;
  }

  const entries = dailyWeightEntries(state.progress);
  const current = currentWeight();
  const trend = trendForEntries(entries);
  elements.profileSummary.textContent = state.user.name;
  elements.profileMeta.textContent = `${state.user.weightKg} kg · ${state.user.heightCm} cm`;
  elements.currentWeightValue.textContent = formatWeight(current);
  elements.weightTrendText.textContent = trend.label;
  elements.weightTrendText.className = `weight-trend is-${trend.tone}`;
  elements.weightTargetStatus.textContent = targetStatus(current);
  const today = localDateKey(new Date());
  elements.progressDate.max = today;
  syncProgressView();
  renderChart(entries);
  renderList(entries);
  renderNutrition();
}

function isMobileWeightChart() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function selectedWeightPeriod(offset = weightRangeOffset) {
  const today = dateFromKey(localDateKey(new Date()));
  const end = addDays(today, offset);
  const start = addDays(end, -(weightRange - 1));
  return {
    start,
    end,
    startKey: localDateKey(start),
    endKey: localDateKey(end),
  };
}

function formatWeightPeriodDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

function syncWeightPeriodControls(period) {
  elements.weightRangeButtons.forEach((button) => {
    const isActive = Number(button.dataset.weightRange) === weightRange;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  if (elements.weightPeriodLabel) {
    elements.weightPeriodLabel.textContent = `${formatWeightPeriodDate(period.start)} \u2013 ${formatWeightPeriodDate(period.end)}`;
  }
  if (elements.weightNextPeriod) elements.weightNextPeriod.disabled = weightRangeOffset >= 0;
  window.IntakeMotion?.selection(elements.weightRangeButtons, 'segment', { duration: 140 });
}

function clippedWeightLinePoints(entries, period, xForDate, yForWeight) {
  if (entries.length < 2) return [];
  const windowStart = period.start.getTime();
  const windowEnd = period.end.getTime();
  const points = [];

  const appendPoint = (time, weight) => {
    const point = `${xForDate(localDateKey(new Date(time)))},${yForWeight(weight)}`;
    if (points.at(-1) !== point) points.push(point);
  };

  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const next = entries[index];
    const previousTime = dateFromKey(previous.date).getTime();
    const nextTime = dateFromKey(next.date).getTime();
    if (nextTime < windowStart || previousTime > windowEnd) continue;

    const visibleStart = Math.max(previousTime, windowStart);
    const visibleEnd = Math.min(nextTime, windowEnd);
    if (visibleStart > visibleEnd) continue;

    const duration = Math.max(1, nextTime - previousTime);
    const previousWeight = Number(previous.weightKg);
    const weightDelta = Number(next.weightKg) - previousWeight;
    const weightAt = (time) => previousWeight + weightDelta * ((time - previousTime) / duration);
    appendPoint(visibleStart, weightAt(visibleStart));
    appendPoint(visibleEnd, weightAt(visibleEnd));
  }

  return points;
}

function renderChart(entries, periodOffset = weightRangeOffset, chartTarget = elements.progressChart,
  axisTarget = elements.weightChartAxis) {
  const usePeriodWindow = isMobileWeightChart();
  const period = selectedWeightPeriod(periodOffset);
  const chartEntries = usePeriodWindow
    ? entries.filter((entry) => entry.date >= period.startKey && entry.date <= period.endKey)
    : entries;
  if (chartTarget === elements.progressChart) syncWeightPeriodControls(period);

  if (!chartEntries.length && !usePeriodWindow) {
    chartTarget.innerHTML = "";
    axisTarget?.replaceChildren();
    axisTarget?.classList.remove("is-single-entry");
    return;
  }

  const latestEntry = chartEntries.at(-1) || null;
  const todayKey = localDateKey(new Date());
  const weights = chartEntries.map((entry) => Number(entry.weightKg));
  const targetWeight = Number(state.user?.targetWeightKg || 0);
  const scaleWeights = targetWeight > 0 ? [...weights, targetWeight] : weights;
  const fallbackWeight = targetWeight > 0 ? targetWeight : Number(currentWeight() || 80);
  const scaleMinimum = scaleWeights.length ? Math.min(...scaleWeights) : fallbackWeight;
  const scaleMaximum = scaleWeights.length ? Math.max(...scaleWeights) : fallbackWeight;
  const min = Math.floor((scaleMinimum - (chartEntries.length ? 0.7 : 2.5)) / 5) * 5;
  const mobileOrEmptyMax = Math.max(min + 5, Math.ceil((scaleMaximum + (chartEntries.length ? 0.7 : 2.5)) / 5) * 5);
  const max = usePeriodWindow
    ? mobileOrEmptyMax
    : Math.ceil((Math.max(...weights) + 0.7) / 5) * 5;
  const rect = chartTarget.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width || chartTarget.clientWidth || 320));
  const frameHeight = Math.round(rect.height || chartTarget.clientHeight || 240);
  const targetLegendHeight = targetWeight > 0 ? 24 : 0;
  const height = Math.max(usePeriodWindow ? 186 : 210, frameHeight - targetLegendHeight);
  // Reserve a real left gutter on phones so grid and target lines never run
  // through the weight-scale labels.
  const xInset = width >= 700 ? 56 : 44;
  const chartOuterRight = width - xInset;
  const targetLabel = targetWeight > 0 ? `TARGET ${formatWeight(targetWeight)} KG` : "";
  const chart = {
    left: xInset,
    right: chartOuterRight,
    top: Math.round(height * 0.18),
    bottom: height - (width >= 700 ? 26 : 18),
  };
  const range = max - min || 1;
  const firstDate = usePeriodWindow ? period.start : dateFromKey(chartEntries[0].date);
  const lastDate = usePeriodWindow ? period.end : dateFromKey(latestEntry.date);
  const dateSpan = Math.max(1, Math.round((lastDate - firstDate) / 86400000));
  const yForWeight = (weight) => chart.bottom - ((weight - min) / range) * (chart.bottom - chart.top);
  const xForDate = (dateKey) => {
    const daysFromStart = Math.max(0, Math.round((dateFromKey(dateKey) - firstDate) / 86400000));
    return chart.left + (Math.min(daysFromStart, dateSpan) / dateSpan) * (chart.right - chart.left);
  };
  const xForEntry = (entry) => !usePeriodWindow && chartEntries.length === 1
    ? chart.right
    : xForDate(entry.date);
  const points = usePeriodWindow
    ? chartEntries.length >= 1
      ? clippedWeightLinePoints(entries, period, xForDate, yForWeight)
      : []
    : chartEntries.map((entry) => {
      const x = xForEntry(entry);
      const y = yForWeight(Number(entry.weightKg));
      return `${x},${y}`;
    });
  const markerStep = usePeriodWindow && chartEntries.length > 14 ? Math.ceil(chartEntries.length / 12) : 1;
  const markerEntries = chartEntries.filter((_, index) => (
    markerStep === 1 || index === 0 || index === chartEntries.length - 1 || index % markerStep === 0
  ));
  const entryDots = markerEntries.map((entry) => ({
    x: xForEntry(entry),
    y: yForWeight(Number(entry.weightKg)),
    isToday: entry.date === todayKey,
    isLatest: entry === latestEntry,
  }));
  const gridLines = [];
  for (let weight = max; weight >= min; weight -= 5) {
    gridLines.push({ y: yForWeight(weight), label: `${weight} kg` });
  }
  const middleEntry = chartEntries[Math.floor((chartEntries.length - 1) / 2)];
  const mobileAxisOffsets = weightRange === 7 ? [0, 2, 4, 6] : [0, 14, 29];
  const axisTicks = usePeriodWindow
    ? mobileAxisOffsets.map((offset) => ({ date: localDateKey(addDays(period.start, offset)) }))
    : chartEntries.length === 1
      ? [latestEntry]
      : chartEntries.length === 2
        ? [chartEntries[0], latestEntry]
        : [chartEntries[0], middleEntry, latestEntry];
  const targetY = targetWeight > 0 ? yForWeight(targetWeight) : null;
  if (axisTarget) {
    axisTarget.replaceChildren();
    axisTarget.classList.toggle("is-single-entry", chartEntries.length === 1);
    axisTicks.forEach((tick) => {
      const span = document.createElement("span");
      span.textContent = shortAxisDate(tick.date);
      span.style.setProperty("--axis-x", `${((usePeriodWindow ? xForDate(tick.date) : xForEntry(tick)) / width) * 100}%`);
      axisTarget.appendChild(span);
    });
  }

  chartTarget.classList.toggle("has-target-legend", targetY !== null);
  chartTarget.innerHTML = `
    ${targetY !== null ? `<div class="weight-target-legend" style="padding-inline:${chart.left}px" aria-label="Dashed line: ${targetLabel}"><span aria-hidden="true"></span><b>${targetLabel}</b></div>` : ""}
    <div class="weight-chart-plot">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Weight progress chart">
        ${gridLines.map((line) => `<path class="chart-grid" d="M${chart.left} ${line.y} H${chart.right}"></path>`).join("")}
        ${gridLines.map((line) => `<text class="weight-y-label" x="${Math.max(2, chart.left - 48)}" y="${line.y + 3}">${line.label}</text>`).join("")}
        ${targetY === null ? "" : `<path class="weight-target-line" d="M${chart.left} ${targetY} H${chart.right}"></path>`}
        ${points.length > 1 ? `<polyline class="chart-line" points="${points.join(" ")}"></polyline>` : ""}
        ${entryDots.map((dot) => `<circle class="chart-dot${dot.isToday ? " is-today" : ""}${dot.isLatest ? " is-latest" : ""}" cx="${dot.x}" cy="${dot.y}" r="${dot.isLatest ? 3.75 : 3}"></circle>`).join("")}
      </svg>
    </div>
    ${chartEntries.length ? "" : '<p class="weight-chart-empty">No weight entries in this period.</p>'}
  `;
}

function shortAxisDate(dateKey) {
  const date = dateFromKey(dateKey);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

function shortDateLabel(dateKey) {
  const [, month, day] = dateKey.split("-");
  return `${Number(day)}.${Number(month)}`;
}

function renderList(entries) {
  elements.progressList.innerHTML = "";
  [...entries].reverse().forEach((entry) => {
    const card = document.querySelector("#entryTemplate").content.firstElementChild.cloneNode(true);
    const previousEntry = [...entries].filter((item) => item.date < entry.date).at(-1);
    const delta = previousEntry ? Number(entry.weightKg) - Number(previousEntry.weightKg) : 0;
    const hasChanged = Math.abs(delta) > 0.05;
    const deltaText = previousEntry
      ? hasChanged ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg` : "No change"
      : "Start";
    const deltaClass = !previousEntry || !hasChanged ? "neutral" : delta > 0 ? "up" : "down";

    card.classList.add("progress-entry-card", `is-${deltaClass}`);
    card.querySelector("strong").textContent = shortEntryDate(entry.date);
    card.querySelector("p").innerHTML = `<span>${formatWeight(entry.weightKg)}</span><small>${deltaText}</small>`;
    const remove = card.querySelector("button");
    remove.dataset.deleteWeight = entry.id;
    const spokenDate = dateFromKey(entry.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    remove.setAttribute("aria-label", `Delete weight entry for ${spokenDate}`);
    remove.title = 'Delete weight entry';
    remove.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
    remove.addEventListener("click", () => deleteWeight(entry.id));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "weight-entry-edit";
    edit.dataset.editWeight = entry.id;
    edit.setAttribute("aria-label", `Edit ${formatWeight(entry.weightKg)} kg on ${spokenDate}`);
    const details = card.querySelector("div");
    edit.append(...details.childNodes);
    details.replaceWith(edit);
    edit.addEventListener("click", () => editWeight(entry.id));
    elements.progressList.appendChild(card);
  });
}

function syncProgressView() {
  document.body.dataset.progressView = activeProgressView;
  elements.progressViewButtons.forEach((button) => {
    const isActive = button.dataset.progressView === activeProgressView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  elements.progressViews.forEach((view) => {
    const isActive = view.dataset.progressPanel === activeProgressView;
    view.classList.toggle("is-active", isActive);
    view.hidden = !isActive;
  });
  window.IntakeMotion?.selection(elements.progressViewButtons);
}

function setProgressView(view) {
  if (!["weight", "nutrition"].includes(view) || view === activeProgressView) return;
  weightPager?.reset(); nutritionPager?.reset();
  activeProgressView = view;
  if (editingWeightId) resetWeightForm();
  const nextHash = view === "nutrition" ? "#nutrition" : window.location.pathname;
  window.history.replaceState(window.history.state, "", nextHash);
  render();
  progressMotion([elements.progressViews.find((panel) => panel.dataset.progressPanel === view)], 'mode', view === 'nutrition' ? 1 : -1);
}

function progressMotion(targets, kind = 'mode', direction = 1) {
  window.IntakeMotion?.transition(targets, kind, { direction, group: elements.progressViewButtons[0].parentElement });
}
function nutritionMotion(kind = 'filter', direction = 1) {
  progressMotion([elements.nutritionChart, elements.nutritionChartDetail.parentElement,
    elements.nutritionChartAxis, document.querySelector('.nutrition-summary-grid'), document.querySelector('.nutrition-insight')], kind, direction);
}
function weightMotion(kind = 'filter', direction = 1) {
  progressMotion([elements.progressChart, elements.weightChartAxis, elements.weightPeriodLabel], kind, direction);
}

function nutritionRows(range, offset = nutritionRangeOffset) {
  const today = dateFromKey(localDateKey(new Date()));
  return Array.from({ length: range }, (_, index) => {
    const date = addDays(today, index - range + 1 + offset);
    const dateKey = localDateKey(date);
    const day = state.days?.[dateKey] || { foods: [], exercises: [] };
    const summary = summarizeDay(day);
    const foodCount = (day.foods || []).length;
    const exerciseCount = (day.exercises || []).length;
    return {
      dateKey,
      foodCount,
      exerciseCount,
      hasEntries: foodCount > 0,
      calories: summary.calories,
      protein: summary.protein,
      carbs: summary.carbs,
      fat: summary.fat,
      exerciseCalories: summary.exerciseCalories,
      netCalories: summary.netCalories,
    };
  });
}

function renderNutrition() {
  const rows = nutritionRows(nutritionRange);
  const metric = nutritionMetrics[nutritionMetric] || nutritionMetrics.calories;
  const goal = Number(state.goals?.[metric.goalKey] || 0);
  const summary = summarizeNutritionRange(rows, nutritionMetric, Number(state.goals?.calories || 0));
  summary.labels.forEach((label, index) => { elements.nutritionSummaryLabels[index].textContent = label; });
  summary.values.forEach((value, index) => { elements.nutritionSummaryValues[index].textContent = value; });
  elements.nutritionLoggedDays.textContent = `${summary.loggedCount}/${rows.length}`;
  elements.nutritionInsightTitle.textContent = summary.loggedCount ? "This range" : "No logged days";
  elements.nutritionInsightText.textContent = summary.text;
  if (!rows.some((row) => row.dateKey === selectedNutritionDate)) {
    selectedNutritionDate = rows.at(-1)?.dateKey || localDateKey(new Date());
  }
  elements.nutritionNextRange.disabled = nutritionRangeOffset >= 0;

  elements.nutritionMetricButtons.forEach((button) => {
    const isActive = button.dataset.nutritionMetric === nutritionMetric;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  elements.nutritionRangeButtons.forEach((button) => {
    const isActive = Number(button.dataset.nutritionRange) === nutritionRange;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  window.IntakeMotion?.selection(elements.nutritionMetricButtons);
  window.IntakeMotion?.selection(elements.nutritionRangeButtons, 'segment', { duration: 140 });
  renderNutritionChart(rows, metric, goal);
}

function renderNutritionChart(rows, metric, goal, chartTarget = elements.nutritionChart,
  selectedDate = selectedNutritionDate) {
  if (metric.isMacro) {
    renderMacroNutritionChart(rows, chartTarget, selectedDate);
    return;
  }

  const values = rows.map((row) => Number(row[metric.valueKey] || 0));
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(goal || 0, ...values, 1);
  const padding = Math.max(10, (maxValue - minValue) * 0.12);
  const min = minValue < 0 ? Math.floor(minValue - padding) : 0;
  const max = Math.ceil(maxValue + padding);
  const { width, height, chart } = nutritionChartFrame();
  const range = max - min || 1;
  const yFor = (value) => chart.bottom - ((value - min) / range) * (chart.bottom - chart.top);
  const zeroY = yFor(0);
  const goalY = goal > 0 ? yFor(goal) : null;
  const slot = (chart.right - chart.left) / rows.length;
  const barWidth = Math.max(5, Math.min(nutritionRange === 7 ? 28 : 12, slot * 0.48));
  const bars = rows.map((row, index) => {
    if (!row.hasEntries) return "";
    const value = Number(row[metric.valueKey] || 0);
    const x = chart.left + index * slot + (slot - barWidth) / 2;
    const y = Math.min(yFor(value), zeroY);
    const heightValue = Math.max(2, Math.abs(zeroY - yFor(value)));
    const tone = "is-neutral";
    const selectionClass = row.dateKey === selectedDate ? " is-selected" : "";
    const label = `${formatNutritionDate(row.dateKey)}: ${Math.round(value)} ${metric.unit}`;
    return `<rect class="nutrition-bar ${tone}${selectionClass}" x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="0"><title>${label}</title></rect>`;
  });
  const dayControls = rows.map((row, index) => {
    const x = chart.left + index * slot;
    const label = nutritionDayDetail(row, metric, goal);
    const marker = row.dateKey === selectedDate
      ? `<path class="nutrition-selection-marker" d="M${x + slot / 2 - 8} ${chart.bottom + 34} H${x + slot / 2 + 8}"></path>`
      : "";
    return `<rect class="nutrition-day-hit" data-nutrition-date="${row.dateKey}" x="${x}" y="${chart.top}" width="${slot}" height="${chart.bottom - chart.top + 16}" role="button" tabindex="0" aria-pressed="${row.dateKey === selectedDate}" aria-label="${label}"><title>${label}</title></rect>${marker}`;
  });
  const valueLabels = nutritionRange === 7
    ? rows.map((row, index) => {
        if (!row.hasEntries) return "";
        const value = Number(row[metric.valueKey] || 0);
        const x = chart.left + index * slot + slot / 2;
        const y = Math.max(chart.top + 10, yFor(value) - 8);
        return `<text class="nutrition-value-label" x="${x}" y="${y}">${Math.round(value)}</text>`;
      })
    : [];
  const goalLabel = `${Math.round(goal)} ${metric.unit}`;
  const axisLabels = nutritionAxisLabels(rows, chart, slot);
  const axisTicks = nutritionAxisTicks(rows, chart, slot);
  const axisLabelY = chart.bottom + 27;

  chartTarget.innerHTML = `
    <div class="nutrition-chart-header" style="padding-inline:${chart.left}px" aria-hidden="true">
      <span class="nutrition-goal-header-label has-line-key">${goalLabel}</span>
    </div>
    <div class="nutrition-chart-plot">
      <svg viewBox="0 0 ${width} ${height}" role="group" aria-label="${metric.label} trend chart">
        <path class="nutrition-grid" d="M${chart.left} ${chart.bottom} H${chart.right}"></path>
        ${Math.abs(zeroY - chart.bottom) < 0.5 ? "" : `<path class="nutrition-zero-line" d="M${chart.left} ${zeroY} H${chart.right}"></path>`}
        ${goalY === null ? "" : `<path class="nutrition-goal-line" d="M${chart.left} ${goalY} H${chart.right}"></path>`}
        ${goalY === null ? "" : `<text class="nutrition-goal-label" x="${chart.left}" y="${Math.max(12, goalY - 8)}">${goalLabel}</text>`}
        ${bars.join("")}
        ${dayControls.join("")}
        ${valueLabels.join("")}
        ${axisTicks.map((tick) => `<path class="nutrition-axis-tick" d="M${tick.x} ${chart.bottom + 7} V${chart.bottom + 12}"></path>`).join("")}
        ${axisLabels.map((label) => `<text class="nutrition-axis-label${label.dateKey === selectedDate ? " is-selected" : ""}" x="${label.x}" y="${axisLabelY}">${label.text}</text>`).join("")}
      </svg>
    </div>
  `;

  if (chartTarget === elements.nutritionChart) {
    elements.nutritionChartAxis.textContent = nutritionDateRange(rows);
    bindNutritionDayControls(rows, metric, goal);
  }
}

function renderMacroNutritionChart(rows, chartTarget = elements.nutritionChart,
  selectedDate = selectedNutritionDate) {
  const goals = {
    protein: Number(state.goals?.protein || 150),
    carbs: Number(state.goals?.carbs || 260),
    fat: Number(state.goals?.fat || 75),
  };
  const { width, height, chart } = nutritionChartFrame();
  const maxPercent = Math.max(
    130,
    ...rows.flatMap((row) => macroKeys().map((key) => macroPercent(row, key, goals[key]))),
  );
  const chartMax = Math.min(180, Math.ceil(maxPercent / 10) * 10);
  const yFor = (value) => chart.bottom - (Math.min(value, chartMax) / chartMax) * (chart.bottom - chart.top);
  const slot = (chart.right - chart.left) / rows.length;
  const groupWidth = Math.min(nutritionRange === 7 ? 36 : 18, slot * 0.62);
  const gap = groupWidth * 0.12;
  const barWidth = (groupWidth - gap * 2) / 3;
  const goalY = yFor(100);
  const bars = rows.flatMap((row, index) => {
    if (!row.hasEntries) return [];
    const groupX = chart.left + index * slot + (slot - groupWidth) / 2;
    return macroKeys().map((key, macroIndex) => {
      const percent = macroPercent(row, key, goals[key]);
      const x = groupX + macroIndex * (barWidth + gap);
      const y = yFor(percent);
      const heightValue = Math.max(2, chart.bottom - y);
      const label = `${formatNutritionDate(row.dateKey)}: ${key} ${Math.round(percent)}% of goal`;
      return `<rect class="nutrition-bar nutrition-macro-bar is-${key}${row.dateKey === selectedDate ? " is-selected" : ""}" x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="0" role="img" aria-label="${label}"><title>${label}</title></rect>`;
    });
  });
  const axisLabels = nutritionAxisLabels(rows, chart, slot);
  const axisTicks = nutritionAxisTicks(rows, chart, slot);
  const axisLabelY = chart.bottom + 27;
  const dayControls = rows.map((row, index) => {
    const x = chart.left + index * slot;
    const label = nutritionDayDetail(row, nutritionMetrics.macros, 100);
    const marker = row.dateKey === selectedDate
      ? `<path class="nutrition-selection-marker" d="M${x + slot / 2 - 8} ${chart.bottom + 34} H${x + slot / 2 + 8}"></path>`
      : "";
    return `<rect class="nutrition-day-hit" data-nutrition-date="${row.dateKey}" x="${x}" y="${chart.top}" width="${slot}" height="${chart.bottom - chart.top + 16}" role="button" tabindex="0" aria-pressed="${row.dateKey === selectedDate}" aria-label="${label}"><title>${label}</title></rect>${marker}`;
  });

  chartTarget.innerHTML = `
    <div class="nutrition-chart-header" style="padding-inline:${chart.left}px" aria-hidden="true">
      <span class="nutrition-goal-header-label has-line-key">100% goal</span>
      <div class="nutrition-macro-legend">
        <span class="is-protein">Protein</span>
        <span class="is-carbs">Carbs</span>
        <span class="is-fat">Fat</span>
      </div>
    </div>
    <div class="nutrition-chart-plot">
      <svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Macro percent of goal chart">
        <path class="nutrition-grid" d="M${chart.left} ${chart.bottom} H${chart.right}"></path>
        <path class="nutrition-goal-line" d="M${chart.left} ${goalY} H${chart.right}"></path>
        <text class="nutrition-goal-label" x="${chart.left}" y="${Math.max(12, goalY - 8)}">100% goal</text>
        ${bars.join("")}
        ${dayControls.join("")}
        ${axisTicks.map((tick) => `<path class="nutrition-axis-tick" d="M${tick.x} ${chart.bottom + 7} V${chart.bottom + 12}"></path>`).join("")}
        ${axisLabels.map((label) => `<text class="nutrition-axis-label${label.dateKey === selectedDate ? " is-selected" : ""}" x="${label.x}" y="${axisLabelY}">${label.text}</text>`).join("")}
      </svg>
    </div>
  `;
  if (chartTarget === elements.nutritionChart) {
    elements.nutritionChartAxis.textContent = nutritionDateRange(rows);
    bindNutritionDayControls(rows, nutritionMetrics.macros, 100);
  }
}

function bindNutritionDayControls(rows, metric, goal) {
  elements.nutritionChart.querySelectorAll("[data-nutrition-date]").forEach((control) => {
    const select = (restoreFocus = false) => {
      const dateKey = control.dataset.nutritionDate;
      selectedNutritionDate = dateKey;
      renderNutrition();
      progressMotion([elements.nutritionChartDetail], 'detail');
      if (restoreFocus) {
        requestAnimationFrame(() => {
          elements.nutritionChart.querySelector(`[data-nutrition-date="${dateKey}"]`)?.focus({ preventScroll: true });
        });
      }
    };
    control.addEventListener("click", () => select(false));
    control.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      select(true);
    });
  });
  const selected = rows.find((row) => row.dateKey === selectedNutritionDate) || rows.at(-1);
  const summary = nutritionDaySummary(selected, metric, goal);
  elements.nutritionChartDetailDate.replaceChildren(...rows.map(row => {
    const option = document.createElement("option");
    option.value = row.dateKey;
    option.textContent = formatNutritionDate(row.dateKey);
    return option;
  }));
  elements.nutritionChartDetailDate.value = selectedNutritionDate;
  elements.nutritionChartDetail.textContent = summary.value;
}

elements.nutritionChartDetailDate.addEventListener("change", () => {
  selectedNutritionDate = elements.nutritionChartDetailDate.value;
  renderNutrition();
  progressMotion([elements.nutritionChartDetail], 'detail');
});

function nutritionDaySummary(row, metric, goal) {
  if (!row) return { date: "", value: "" };

  const date = formatNutritionDate(row.dateKey).toUpperCase();
  if (!row.hasEntries) return { date, value: "No food logged" };

  if (metric.isMacro) {
    const protein = Math.round(macroPercent(row, "protein", Number(state.goals?.protein || 150)));
    const carbs = Math.round(macroPercent(row, "carbs", Number(state.goals?.carbs || 260)));
    const fat = Math.round(macroPercent(row, "fat", Number(state.goals?.fat || 75)));
    return { date, value: `Protein ${protein}% · Carbs ${carbs}% · Fat ${fat}%` };
  }

  const value = Math.round(Number(row[metric.valueKey] || 0));
  if (!goal) return { date, value: `${value} ${metric.unit}` };

  const delta = Math.round(value - Number(goal));
  const comparison = delta === 0
    ? "At goal"
    : `${Math.abs(delta).toLocaleString()} ${metric.unit} ${delta > 0 ? "over" : "under"} goal`;
  return { date, value: `${value.toLocaleString()} ${metric.unit} · ${comparison}` };
}

function nutritionDayDetail(row, metric, goal) {
  if (!row) return "";
  const date = formatNutritionDate(row.dateKey);
  if (!row.hasEntries) return `${date}: no food logged`;
  if (metric.isMacro) {
    const protein = Math.round(macroPercent(row, "protein", Number(state.goals?.protein || 150)));
    const carbs = Math.round(macroPercent(row, "carbs", Number(state.goals?.carbs || 260)));
    const fat = Math.round(macroPercent(row, "fat", Number(state.goals?.fat || 75)));
    return `${date}: protein ${protein}%, carbs ${carbs}%, fat ${fat}% of goal`;
  }
  const value = Math.round(Number(row[metric.valueKey] || 0));
  const delta = Math.round(value - Number(goal || 0));
  const comparison = goal ? delta === 0 ? ", on target" : `, ${Math.abs(delta)} ${metric.unit} ${delta > 0 ? "over" : "under"} target` : "";
  return `${date}: ${value} ${metric.unit}${comparison}`;
}

function formatNutritionDate(dateKey) {
  return dateFromKey(dateKey).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function nutritionDateRange(rows) {
  if (!rows.length) return "";
  return `${formatNutritionDate(rows[0].dateKey)} – ${formatNutritionDate(rows.at(-1).dateKey)}`;
}

function nutritionChartSize() {
  const rect = elements.nutritionChart.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width || elements.nutritionChart.clientWidth || 320));
  const frameHeight = Math.round(rect.height || (width >= 700 ? 340 : 280));
  const headerHeight = 28;
  const height = Math.max(224, frameHeight - headerHeight);
  const sidePadding = width >= 700 ? 50 : 18;
  const maxPlotWidth = nutritionRange <= 7 && width >= 900 ? 560 : width - sidePadding * 2;
  const plotWidth = Math.max(260, Math.min(width - sidePadding * 2, maxPlotWidth));
  return { width, height, plotWidth, headerHeight };
}

function nutritionChartFrame() {
  const { width, height, plotWidth, headerHeight } = nutritionChartSize();
  const xInset = Math.round((width - plotWidth) / 2);
  return {
    width,
    height,
    headerHeight,
    chart: {
      left: xInset,
      right: xInset + plotWidth,
      top: 0,
      bottom: height - 56,
    },
  };
}

function nutritionAxisLabels(rows, chart, slot) {
  const every = rows.length <= 7 ? 1 : rows.length <= 14 ? 2 : 5;
  return rows
    .map((row, index) => ({
      index,
      dateKey: row.dateKey,
      x: chart.left + index * slot + slot / 2,
      text: rows.length <= 7 ? shortWeekday(row.dateKey) : shortDateLabel(row.dateKey),
    }))
    .filter((label) => label.index === 0 || label.index === rows.length - 1 || label.index % every === 0);
}

function nutritionAxisTicks(rows, chart, slot) {
  return rows.map((_, index) => ({
    x: chart.left + index * slot + slot / 2,
  }));
}

function macroKeys() {
  return ["protein", "carbs", "fat"];
}

function macroPercent(row, key, goal) {
  if (!goal) return 0;
  return Math.max(0, (Number(row[key] || 0) / goal) * 100);
}


function shortWeekday(dateKey) {
  return dateFromKey(dateKey).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}


function shortEntryDate(dateKey) {
  const date = dateFromKey(dateKey);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

function showWeightError(message = "", field = "", focusField = true) {
  elements.weightFormError.textContent = message;
  elements.weightFormError.hidden = !message;
  for (const [name, input] of [["date", elements.progressDate], ["weightKg", elements.progressWeight]]) {
    input.setAttribute("aria-invalid", String(name === field));
    const description = [name === 'weightKg' ? 'weightUnit' : '', name === field ? 'weightFormError' : ''].filter(Boolean).join(' ');
    if (description) input.setAttribute('aria-describedby', description); else input.removeAttribute('aria-describedby');
    if (name === field && focusField) input.focus({ preventScroll: true });
  }
}
function restoreWeightFocus(id) {
  const button = [...elements.progressList.querySelectorAll("[data-edit-weight]")].find(button => button.dataset.editWeight === id);
  (button || elements.weightLogJump)?.focus({ preventScroll: true });
}
function resetWeightForm(restoreFocus = false) {
  const previousId = editingWeightId;
  weightDraftDate = null;
  elements.weightCancel.hidden = false;
  elements.progressDate.value = localDateKey(new Date());
  syncWeightDateSelection();
  if (restoreFocus) restoreWeightFocus(previousId);
}
function editWeight(id) {
  const entry = state.progress.find(item => item.id === id);
  if (!entry) return;
  weightDraftDate = null;
  elements.weightCancel.hidden = false;
  elements.progressDate.value = entry.date;
  syncWeightDateSelection();
  openWeightSheet(id);
}
function syncWeightDateSelection() {
  const date = elements.progressDate.value;
  if (date === weightDraftDate) return;
  weightDraftDate = date;
  const selection = weightEntryForDate(state.progress, date);
  editingWeightId = selection.entry?.id || null;
  const updating = Boolean(selection.entry || selection.duplicate);
  elements.progressForm.classList.toggle("is-editing", updating);
  elements.weightFormTitle.textContent = updating ? "Edit weight" : "Log weight";
  elements.weightSave.textContent = updating ? "Update weight" : "Save weight";
  elements.progressWeight.value = selection.duplicate ? "" : formatWeight(selection.entry?.weightKg ?? currentWeight());
  showWeightError(selection.duplicate
    ? "Multiple weight entries exist for this date. Resolve the duplicate records before updating."
    : "", selection.duplicate ? "date" : "", false);
}
function persistWeightChange(entries) {
  const latest = dailyWeightEntries(entries).at(-1);
  const next = { ...state, progress: entries,
    user: latest && state.user ? { ...state.user, weightKg: Number(latest.weightKg) } : state.user };
  // Commit visible/in-memory state only after the native write succeeds.
  saveState(next);
  Object.assign(state, next);
  weightPager?.reset();
  nutritionPager?.reset();
  render();
}
function submitWeight(event) {
  event.preventDefault();
  if (weightSaving || !weightSheet?.active || weightSheet.closing) return;
  weightSaving = true; elements.weightSave.disabled = true;
  try {
    const result = updateWeightEntries(state.progress, editingWeightId, {
      date: elements.progressDate.value, weightKg: elements.progressWeight.value,
    }, localDateKey(new Date()));
    if (result.error) { showWeightError(result.error, result.field); return; }
    persistWeightChange(result.entries);
    closeWeightSheet({ stableViewportExit: true });
  } catch (error) {
    showWeightError(error.code === 'local-id-unavailable'
      ? 'This browser could not create a weight entry. Please try again in a secure browser.'
      : 'Weight could not be saved. Your draft is still here. Please try again.');
  } finally { weightSaving = false; elements.weightSave.disabled = false; }
}
function deleteWeight(id) {
  const entry = state.progress.find(item => item.id === id);
  if (!entry) return;
  const deleted = structuredClone(entry);
  try { persistWeightChange(state.progress.filter(item => item.id !== id)); }
  catch { weightFeedback.message('Weight could not be deleted. Please try again.'); return; }
  weightFeedback.deleted(() => {
    const restored = restoreWeightEntry(state.progress, deleted);
    if (restored.error) return restored.error;
    try { persistWeightChange(restored.entries); }
    catch { return 'Weight could not be restored. Try Undo again.'; }
    if (!weightSheet?.active) restoreWeightFocus(id);
  });
}
function positionWeightFeedback() {
  const toast = elements.weightUndoToast;
  const host = weightSheet?.active ? elements.weightSheetNotice : document.body;
  if (toast.parentElement !== host) host.appendChild(toast);
  if (!weightSheet?.active) {
    const nav = document.querySelector('.mobile-tabbar');
    const clearance = nav?.getClientRects().length ? window.innerHeight - nav.getBoundingClientRect().top : 0;
    toast.style.setProperty('--weight-notice-bottom', `${Math.max(0, clearance) + 12}px`);
  }
}
function renderWeightFeedback(notice) {
  const toast = elements.weightUndoToast, undo = toast.querySelector('button');
  toast.hidden = !notice;
  toast.querySelector('span').textContent = notice?.message || '';
  toast.dataset.phase = notice?.phase || 'idle';
  undo.hidden = !notice?.undo; undo.disabled = !notice?.undo; undo.onclick = notice?.undo || null;
  positionWeightFeedback();
}
function openWeightSheet(id = null) {
  weightReturnId = id;
  weightSheet ||= createSheetSurface({ panel: elements.weightSheet, backdrop: elements.weightSheetBackdrop,
    handle: elements.weightSheetHandle, scroller: elements.weightSheetContent,
    background: () => [elements.appShell, document.querySelector('.mobile-tabbar')],
    initialFocus: () => elements.progressWeight,
    restoreTarget: () => [...elements.progressList.querySelectorAll('[data-edit-weight]')].find(button => button.dataset.editWeight === weightReturnId) || elements.weightLogJump,
    onDismiss: closeWeightSheet, onBack: closeWeightSheet, win: window,
  });
  document.body.classList.add('weight-sheet-open');
  weightSheet.open({ returnTo: id ? document.activeElement : elements.weightLogJump });
  elements.weightLogJump.setAttribute('aria-expanded', 'true');
  positionWeightFeedback();
  // Stay in the opening gesture so iOS can present its decimal keyboard.
  elements.progressWeight.select();
}
function closeWeightSheet(options = {}) {
  if (!weightSheet?.active || weightSheet.closing) return;
  // After a confirmed save, start the exit against the keyboard-open geometry
  // before dismissing the keyboard. The updated parent is already rendered.
  if (!options.stableViewportExit) elements.weightFormTitle.focus({ preventScroll: true });
  const done = weightSheet.close(options);
  if (options.stableViewportExit && elements.weightSheet.contains(document.activeElement)) document.activeElement.blur();
  elements.weightSheet.inert = true;
  const finish = () => {
    document.body.classList.remove('weight-sheet-open');
    elements.weightLogJump.setAttribute('aria-expanded', 'false');
    resetWeightForm(); positionWeightFeedback();
  };
  if (!weightSheet.active) finish(); else done.then(finish);
}

elements.progressForm.addEventListener("submit", submitWeight);
elements.progressDate.addEventListener("change", syncWeightDateSelection);
elements.progressDate.addEventListener("input", syncWeightDateSelection);
elements.weightCancel.addEventListener("click", () => closeWeightSheet());
onBeforeLeave?.(() => {
  if (!weightSheet?.active) return true;
  closeWeightSheet({ immediate: true });
  return false;
});
onDispose?.(() => {
  weightPager?.destroy(); nutritionPager?.destroy();
  weightFeedback.dispose(); weightSheet?.dispose(); elements.weightUndoToast.remove();
  document.body.classList.remove('weight-sheet-open');
  Object.assign(viewState, { view: activeProgressView, nutritionOffset: nutritionRangeOffset, weightOffset: weightRangeOffset, day: selectedNutritionDate });
});
elements.weightLogJump?.addEventListener("click", () => {
  resetWeightForm();
  openWeightSheet();
});

elements.progressViewButtons.forEach((button) => {
  button.addEventListener("click", () => setProgressView(button.dataset.progressView));
});

function changeWeightPeriod(direction) {
  if (direction > 0 && weightRangeOffset >= 0) return;
  weightRangeOffset = Math.min(0, weightRangeOffset + direction * weightRange);
  renderChart(dailyWeightEntries(state.progress));
}

function changeNutritionRange(direction) {
  if (direction > 0 && nutritionRangeOffset >= 0) return;
  nutritionRangeOffset = Math.min(0, nutritionRangeOffset + direction * nutritionRange);
  selectedNutritionDate = localDateKey(addDays(new Date(), nutritionRangeOffset));
  renderNutrition();
}

// Keep the live chart in the middle page. Adjacent pages are inert, read-only
// previews prepared before the first horizontal movement, just like Today.
function createChartPager(chart, axis, prepare, commit, canMove) {
  const parent = chart.parentElement;
  const viewport = document.createElement('div');
  viewport.className = 'progress-range-viewport';
  const track = document.createElement('div');
  track.className = 'progress-range-track';
  const pages = [-1, 0, 1].map((direction) => {
    const page = document.createElement('div');
    page.className = 'progress-range-page';
    if (direction) { page.inert = true; page.setAttribute('aria-hidden', 'true'); }
    return page;
  });
  parent.insertBefore(viewport, chart);
  viewport.appendChild(track);
  track.append(...pages);
  pages[1].appendChild(chart);
  if (axis) pages[1].appendChild(axis);
  const previews = [pages[0], pages[2]].map((page) => {
    const previewChart = document.createElement('div');
    previewChart.className = chart.className;
    page.appendChild(previewChart);
    const previewAxis = axis && document.createElement('div');
    if (previewAxis) { previewAxis.className = axis.className; page.appendChild(previewAxis); }
    return { chart: previewChart, axis: previewAxis };
  });
  return bindCalendarSwipe({ viewport, track, win: window,
    canMove,
    prepare: () => {
      if (canMove(-1)) prepare(-1, previews[0]);
      if (canMove(1)) prepare(1, previews[1]);
    },
    clear: () => previews.forEach(({ chart: previewChart, axis: previewAxis }) => {
      previewChart.replaceChildren();
      previewAxis?.replaceChildren();
    }),
    commit,
  });
}

function setupChartPagers() {
  weightPager = createChartPager(elements.progressChart, elements.weightChartAxis,
    (direction, preview) => renderChart(dailyWeightEntries(state.progress),
      weightRangeOffset + direction * weightRange, preview.chart, preview.axis),
    changeWeightPeriod, (direction) => direction < 0 || weightRangeOffset < 0);
  nutritionPager = createChartPager(elements.nutritionChart, null,
    (direction, preview) => {
      const rows = nutritionRows(nutritionRange, nutritionRangeOffset + direction * nutritionRange);
      const metric = nutritionMetrics[nutritionMetric];
      renderNutritionChart(rows, metric, Number(state.goals?.[metric.goalKey] || 0),
        preview.chart, rows.at(-1)?.dateKey);
    },
    changeNutritionRange, (direction) => direction < 0 || nutritionRangeOffset < 0);
}

elements.weightRangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    weightPager?.reset();
    const changed = weightRange !== Number(button.dataset.weightRange || 30) || weightRangeOffset !== 0;
    weightRange = Number(button.dataset.weightRange || 30);
    weightRangeOffset = 0;
    localStorage.setItem("daily-fuel-weight-range", String(weightRange));
    renderChart(dailyWeightEntries(state.progress));
    if (changed) weightMotion();
  });
});

elements.weightPreviousPeriod?.addEventListener("click", (event) => weightPager.arrow(-1, event));
elements.weightNextPeriod?.addEventListener("click", (event) => weightPager.arrow(1, event));

elements.nutritionMetricButtons.forEach((button) => {
  button.addEventListener("click", () => {
    nutritionPager?.reset();
    const changed = nutritionMetric !== (button.dataset.nutritionMetric || "calories");
    nutritionMetric = button.dataset.nutritionMetric || "calories";
    localStorage.setItem("daily-fuel-nutrition-metric", nutritionMetric);
    renderNutrition();
    if (changed) nutritionMotion();
  });
});

elements.nutritionRangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      nutritionPager?.reset();
      const changed = nutritionRange !== Number(button.dataset.nutritionRange || 7) || nutritionRangeOffset !== 0;
      nutritionRange = Number(button.dataset.nutritionRange || 7);
      nutritionRangeOffset = 0;
      selectedNutritionDate = localDateKey(new Date());
      localStorage.setItem("daily-fuel-nutrition-range", String(nutritionRange));
      renderNutrition();
      if (changed) nutritionMotion();
    });
  });

elements.nutritionPreviousRange?.addEventListener("click", (event) => nutritionPager.arrow(-1, event));
elements.nutritionNextRange?.addEventListener("click", (event) => nutritionPager.arrow(1, event));

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
let resizeRenderTimer = null;
  window.addEventListener("resize", () => {
  weightPager?.reset(); nutritionPager?.reset();
  positionWeightFeedback();
  if (!isMobileSidebar()) setMobileSidebarOpen(false);
  clearTimeout(resizeRenderTimer);
  resizeRenderTimer = setTimeout(() => {
    // Geometry changes must not replace a focused edit/delete weight action.
    renderChart(dailyWeightEntries(state.progress));
    renderNutrition();
  }, 120);
});

// Charts size themselves from their panels, not from the viewport. This also
// catches app-shell column transitions when the desktop sidebar is toggled.
if ("ResizeObserver" in window) {
  let observedChartSize = "";
  const chartResizeObserver = new ResizeObserver((entries) => {
    const nextSize = entries
      .map(({ target, contentRect }) => `${target.id}:${Math.round(contentRect.width)}x${Math.round(contentRect.height)}`)
      .sort()
      .join("|");
    if (!nextSize || nextSize === observedChartSize) return;
    observedChartSize = nextSize;
    clearTimeout(resizeRenderTimer);
    resizeRenderTimer = setTimeout(() => {
      if (!state.user) return;
      renderChart(dailyWeightEntries(state.progress));
      renderNutrition();
    }, 80);
  });
  chartResizeObserver.observe(elements.progressChart);
  chartResizeObserver.observe(elements.nutritionChart);
}


if (localStorage.getItem("calorie-counter-sidebar-collapsed") === "true") {
  elements.appShell.classList.add("sidebar-collapsed");
}

resetWeightForm();
render();
setupChartPagers();
}

// Presentation only: underlying diary totals and targets remain unchanged.
export function summarizeNutritionRange(rows, metric, target) {
  const logged = rows.filter(row => row.hasEntries);
  const mean = key => logged.length ? logged.reduce((sum, row) => sum + Number(row[key] || 0), 0) / logged.length : null;
  const format = value => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const loggedCount = logged.length;
  const prefix = `${loggedCount} of ${rows.length} days logged.`;
  const averages = { calories: mean("calories"), net: mean("netCalories"), protein: mean("protein"), carbs: mean("carbs"), fat: mean("fat") };
  if (metric === "macros") return {
    loggedCount, averages, difference: null,
    labels: ["Average protein", "Average carbs", "Average fat"],
    values: ["protein", "carbs", "fat"].map(key => loggedCount ? `${format(averages[key])} g` : "—"),
    text: loggedCount ? `${prefix} Averages use only days with food logged.` : "No food logged in this range yet.",
  };
  const average = averages[metric === "net" ? "net" : "calories"];
  const difference = loggedCount && target > 0 ? average - target : null;
  const comparison = difference === null ? "—" : difference === 0 ? "On target"
    : `${format(Math.abs(difference)) === "0" ? "<0.1" : format(Math.abs(difference))} kcal ${difference > 0 ? "over" : "under"}`;
  return { loggedCount, averages, difference,
    labels: [metric === "net" ? "Average net calories" : "Average intake", "Target", "Average difference"],
    values: [loggedCount ? `${format(average)} kcal` : "—", target > 0 ? `${format(target)} kcal` : "Not set", comparison],
    text: !loggedCount ? "No food logged in this range yet." : difference === null ? `${prefix} No calorie target is set.`
      : `${prefix} Average ${metric === "net" ? "net calories were" : "intake was"} ${difference === 0 ? "on target" : `${comparison} your target`}.`,
  };
}

export function weightEntryForDate(entries, date) {
  const matches = entries.filter(entry => entry.date === date);
  return { entry: matches.length === 1 ? matches[0] : null, duplicate: matches.length > 1 };
}

export function updateWeightEntries(entries, id, values, today, newId = localRecordId) {
  const date = String(values.date || "");
  const weightText = String(values.weightKg ?? "").trim();
  const weightKg = /^\d+(?:[.,]\d+)?$/.test(weightText) ? Number(weightText.replace(",", ".")) : NaN;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
    return { error: "Enter a valid date.", field: "date" };
  if (date > today) return { error: "You can't log weight for a future date.", field: "date" };
  const selection = weightEntryForDate(entries, date);
  if (selection.duplicate)
    return { error: "Multiple weight entries exist for this date. Resolve the duplicate records before updating.", field: "date" };
  if (!Number.isFinite(weightKg) || weightKg < 35 || weightKg > 250)
    return { error: "Enter a weight between 35 and 250 kg.", field: "weightKg" };
  if (Math.abs(weightKg * 10 - Math.round(weightKg * 10)) > 1e-8)
    return { error: "Use at most one decimal place for weight.", field: "weightKg" };
  if (id && !entries.some(entry => entry.id === id))
    return { error: "This weight entry is no longer available.", field: "date" };
  // The selected date, not a previous form draft, owns the record identity.
  const existing = selection.entry;
  const entry = { ...(existing || {}), id: existing?.id || newId(), date, weightKg, updatedAt: new Date().toISOString() };
  return { entry, entries: existing ? entries.map(item => item === existing ? entry : item) : [...entries, entry] };
}

export function restoreWeightEntry(entries, deleted) {
  if (entries.some(entry => entry.id === deleted.id || entry.date === deleted.date))
    return { error: "Cannot undo: another weight entry already uses this date." };
  return { entries: [...entries, { ...deleted }] };
}

// One host/state, latest deletion wins. Automatic Undo focus previously
// cancelled its own expiry. Old callbacks are invalidated on every change.
export function createWeightFeedback({ setTimeout, clearTimeout, render }) {
  let timer = null, active = null;
  function clear() { clearTimeout(timer); timer = null; active = null; render(null); }
  function show(message, duration, restore = null, phase = 'message') {
    clearTimeout(timer);
    const notice = { message, phase, undo: null };
    active = notice;
    if (restore) notice.undo = () => {
      if (active !== notice) return;
      const error = restore();
      if (error) { notice.message = error; render(notice); return; }
      show('Weight entry restored', 2000, null, 'restored');
    };
    timer = setTimeout(() => { if (active === notice) clear(); }, duration);
    render(notice);
  }
  return { deleted: restore => show('Weight entry deleted', 8000, restore, 'deleted'),
    message: text => show(text, 4000), dispose: clear };
}
