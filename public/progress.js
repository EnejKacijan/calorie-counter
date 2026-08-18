const storageKey = "calorie-counter-state";
const state = loadState();
document.body.classList.add("progress-page");

const elements = {
  progressForm: document.querySelector("#progressForm"),
  progressDate: document.querySelector("#progressDate"),
  progressWeight: document.querySelector("#progressWeight"),
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
  nutritionAverageCalories: document.querySelector("#nutritionAverageCalories"),
  nutritionGoalDays: document.querySelector("#nutritionGoalDays"),
  nutritionMacroHit: document.querySelector("#nutritionMacroHit"),
  nutritionLoggedDays: document.querySelector("#nutritionLoggedDays"),
  nutritionInsightTitle: document.querySelector("#nutritionInsightTitle"),
  nutritionInsightText: document.querySelector("#nutritionInsightText"),
  appShell: document.querySelector(".app-shell"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  profileSummary: document.querySelector("#profileSummary"),
  profileMeta: document.querySelector("#profileMeta"),
  logoutButton: document.querySelector("#logoutButton"),
};

let activeProgressView = window.location.hash === "#nutrition" ? "nutrition" : "weight";
let nutritionMetric = localStorage.getItem("daily-fuel-nutrition-metric") || "calories";
let nutritionRange = Number(localStorage.getItem("daily-fuel-nutrition-range") || 7);
let nutritionRangeOffset = 0;
let selectedNutritionDate = localDateKey(new Date());
let weightRange = Number(localStorage.getItem("daily-fuel-weight-range") || 30);
let weightRangeOffset = 0;

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

function saveState() {
  state.theme = state.user?.theme || state.theme || "light";
  localStorage.setItem("calorie-counter-theme", state.theme);
  localStorage.setItem(storageKey, JSON.stringify(state));
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
  const goalType = state.user?.goalType || "maintain";
  const isMovingAgainstGoal = (goalType === "lose" && delta > 0.05)
    || (goalType === "gain" && delta < -0.05);
  const tone = isMovingAgainstGoal ? "bad" : "neutral";
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
  elements.progressDate.value = elements.progressDate.value || today;
  if (elements.progressDate.value > today) elements.progressDate.value = today;
  elements.progressWeight.value = elements.progressWeight.value || currentWeight();
  syncProgressView();
  renderChart(entries);
  renderList(entries);
  renderNutrition();
}

function isMobileWeightChart() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function selectedWeightPeriod() {
  const today = dateFromKey(localDateKey(new Date()));
  const end = addDays(today, weightRangeOffset);
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

function renderChart(entries) {
  const usePeriodWindow = isMobileWeightChart();
  const period = selectedWeightPeriod();
  const chartEntries = usePeriodWindow
    ? entries.filter((entry) => entry.date >= period.startKey && entry.date <= period.endKey)
    : entries;
  syncWeightPeriodControls(period);

  if (!chartEntries.length && !usePeriodWindow) {
    elements.progressChart.innerHTML = "";
    elements.weightChartAxis?.replaceChildren();
    elements.weightChartAxis?.classList.remove("is-single-entry");
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
  const rect = elements.progressChart.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width || elements.progressChart.clientWidth || 320));
  const frameHeight = Math.round(rect.height || elements.progressChart.clientHeight || 240);
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
  if (elements.weightChartAxis) {
    elements.weightChartAxis.replaceChildren();
    elements.weightChartAxis.classList.toggle("is-single-entry", chartEntries.length === 1);
    axisTicks.forEach((tick) => {
      const span = document.createElement("span");
      span.textContent = shortAxisDate(tick.date);
      span.style.setProperty("--axis-x", `${((usePeriodWindow ? xForDate(tick.date) : xForEntry(tick)) / width) * 100}%`);
      elements.weightChartAxis.appendChild(span);
    });
  }

  elements.progressChart.classList.toggle("has-target-legend", targetY !== null);
  elements.progressChart.innerHTML = `
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
  [...entries].reverse().slice(0, 6).forEach((entry) => {
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
    card.querySelector("button").setAttribute("aria-label", `Remove weight entry for ${shortEntryDate(entry.date)}`);
    card.querySelector("button").addEventListener("click", () => {
      if (!window.confirm(`Remove the weight entry for ${shortEntryDate(entry.date)}?`)) return;
      state.progress = state.progress.filter((item) => item.id !== entry.id);
      saveState();
      render();
    });
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
}

function setProgressView(view) {
  if (!["weight", "nutrition"].includes(view)) return;
  activeProgressView = view;
  const nextHash = view === "nutrition" ? "#nutrition" : window.location.pathname;
  window.history.replaceState(null, "", nextHash);
  render();
}

function nutritionRows(range) {
  const today = dateFromKey(localDateKey(new Date()));
  return Array.from({ length: range }, (_, index) => {
    const date = addDays(today, index - range + 1 + nutritionRangeOffset);
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
  const loggedRows = rows.filter((row) => row.hasEntries);
  const loggedCount = loggedRows.length;
  const avgCalories = loggedCount ? average(loggedRows.map((row) => row.calories)) : 0;
  const goalDays = loggedRows.filter((row) => row.netCalories <= Number(state.goals?.calories || 2300)).length;
  const macroHitDays = loggedRows.filter(isMacroHitDay).length;

  elements.nutritionAverageCalories.textContent = Math.round(avgCalories);
  elements.nutritionGoalDays.textContent = `${goalDays}/${nutritionRange}`;
  elements.nutritionMacroHit.textContent = `${macroHitDays}/${nutritionRange}`;
  elements.nutritionLoggedDays.textContent = `${loggedCount}/${nutritionRange}`;
  const insight = nutritionInsight(rows, loggedRows, goalDays);
  elements.nutritionInsightTitle.textContent = insight.title;
  elements.nutritionInsightText.textContent = insight.text;
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

  renderNutritionChart(rows, metric, goal);
}

function renderNutritionChart(rows, metric, goal) {
  if (metric.isMacro) {
    renderMacroNutritionChart(rows);
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
    const tone = row.netCalories > Number(state.goals?.calories || 2300) ? "is-over" : "is-good";
    const selectionClass = row.dateKey === selectedNutritionDate ? " is-selected" : "";
    const label = `${formatNutritionDate(row.dateKey)}: ${Math.round(value)} ${metric.unit}`;
    return `<rect class="nutrition-bar ${tone}${selectionClass}" x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="0"><title>${label}</title></rect>`;
  });
  const dayControls = rows.map((row, index) => {
    const x = chart.left + index * slot;
    const label = nutritionDayDetail(row, metric, goal);
    const marker = row.dateKey === selectedNutritionDate
      ? `<path class="nutrition-selection-marker" d="M${x + slot / 2 - 8} ${chart.bottom + 34} H${x + slot / 2 + 8}"></path>`
      : "";
    return `<rect class="nutrition-day-hit" data-nutrition-date="${row.dateKey}" x="${x}" y="${chart.top}" width="${slot}" height="${chart.bottom - chart.top + 16}" role="button" tabindex="0" aria-pressed="${row.dateKey === selectedNutritionDate}" aria-label="${label}"><title>${label}</title></rect>${marker}`;
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

  elements.nutritionChart.innerHTML = `
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
        ${axisLabels.map((label) => `<text class="nutrition-axis-label${label.dateKey === selectedNutritionDate ? " is-selected" : ""}" x="${label.x}" y="${axisLabelY}">${label.text}</text>`).join("")}
      </svg>
    </div>
  `;

  elements.nutritionChartAxis.textContent = nutritionDateRange(rows);
  bindNutritionDayControls(rows, metric, goal);
}

function renderMacroNutritionChart(rows) {
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
  const groupWidth = Math.max(12, Math.min(nutritionRange === 7 ? 36 : 18, slot * 0.62));
  const gap = Math.max(1.5, groupWidth * 0.12);
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
      return `<rect class="nutrition-bar nutrition-macro-bar is-${key}${row.dateKey === selectedNutritionDate ? " is-selected" : ""}" x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="0" role="img" aria-label="${label}"><title>${label}</title></rect>`;
    });
  });
  const axisLabels = nutritionAxisLabels(rows, chart, slot);
  const axisTicks = nutritionAxisTicks(rows, chart, slot);
  const axisLabelY = chart.bottom + 27;
  const dayControls = rows.map((row, index) => {
    const x = chart.left + index * slot;
    const label = nutritionDayDetail(row, nutritionMetrics.macros, 100);
    const marker = row.dateKey === selectedNutritionDate
      ? `<path class="nutrition-selection-marker" d="M${x + slot / 2 - 8} ${chart.bottom + 34} H${x + slot / 2 + 8}"></path>`
      : "";
    return `<rect class="nutrition-day-hit" data-nutrition-date="${row.dateKey}" x="${x}" y="${chart.top}" width="${slot}" height="${chart.bottom - chart.top + 16}" role="button" tabindex="0" aria-pressed="${row.dateKey === selectedNutritionDate}" aria-label="${label}"><title>${label}</title></rect>${marker}`;
  });

  elements.nutritionChart.innerHTML = `
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
        ${axisLabels.map((label) => `<text class="nutrition-axis-label${label.dateKey === selectedNutritionDate ? " is-selected" : ""}" x="${label.x}" y="${axisLabelY}">${label.text}</text>`).join("")}
      </svg>
    </div>
  `;
  elements.nutritionChartAxis.textContent = nutritionDateRange(rows);
  bindNutritionDayControls(rows, nutritionMetrics.macros, 100);
}

function bindNutritionDayControls(rows, metric, goal) {
  elements.nutritionChart.querySelectorAll("[data-nutrition-date]").forEach((control) => {
    const select = (restoreFocus = false) => {
      const dateKey = control.dataset.nutritionDate;
      selectedNutritionDate = dateKey;
      renderNutrition();
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
  elements.nutritionChartDetailDate.textContent = summary.date;
  elements.nutritionChartDetail.textContent = summary.value;
}

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
  const comparison = goal ? `, ${Math.abs(delta)} ${metric.unit} ${delta > 0 ? "over" : "under"} goal` : "";
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

function isMacroHitDay(row) {
  const proteinPercent = macroPercent(row, "protein", Number(state.goals?.protein || 150));
  const carbsPercent = macroPercent(row, "carbs", Number(state.goals?.carbs || 260));
  const fatPercent = macroPercent(row, "fat", Number(state.goals?.fat || 75));
  return proteinPercent >= 80 && carbsPercent >= 70 && carbsPercent <= 130 && fatPercent >= 70 && fatPercent <= 130;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function shortWeekday(dateKey) {
  return dateFromKey(dateKey).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

function nutritionInsight(rows, loggedRows, goalDays) {
  const loggedCount = loggedRows.length;
  const calorieGoal = Number(state.goals?.calories || 2300);
  const proteinGoal = Number(state.goals?.protein || 150);
  const carbsGoal = Number(state.goals?.carbs || 260);
  const fatGoal = Number(state.goals?.fat || 75);
  const minimumUsefulDays = Math.min(4, rows.length);

  if (loggedCount < minimumUsefulDays) {
    return {
      title: "Not enough data yet",
      text: `You logged ${loggedCount} of ${rows.length} days. Log at least ${minimumUsefulDays} days in a 7-day stretch so your weekly trend becomes more reliable.`,
    };
  }

  const overGoalDays = loggedRows.filter((row) => row.netCalories > calorieGoal).length;
  const proteinGapDays = loggedRows.filter((row) => macroPercent(row, "protein", proteinGoal) < 80).length;
  const carbsGapDays = loggedRows.filter((row) => macroPercent(row, "carbs", carbsGoal) < 70).length;
  const fatOverDays = loggedRows.filter((row) => macroPercent(row, "fat", fatGoal) > 130).length;
  const calorieCloseDays = loggedRows.filter((row) => Math.abs(row.netCalories - calorieGoal) <= calorieGoal * 0.12).length;
  const mainGapThreshold = Math.ceil(loggedCount / 2);

  if (overGoalDays >= mainGapThreshold) {
    return {
      title: "Calories are your main gap",
      text: `${overGoalDays} of ${loggedCount} logged days went over your calorie target. Next week, start with the meal or snack that contributes the most calories.`,
    };
  }

  if (proteinGapDays >= mainGapThreshold) {
    const calorieContext = calorieCloseDays >= mainGapThreshold
      ? "You were close to your calorie target on most logged days, but"
      : "";
    return {
      title: "Protein is your main gap",
      text: calorieContext
        ? `${calorieContext} protein was below target on ${proteinGapDays} of ${loggedCount} logged days. Add one reliable protein choice earlier in the day.`
        : `Protein was below target on ${proteinGapDays} of ${loggedCount} logged days. Add one reliable protein choice earlier in the day.`,
    };
  }

  if (fatOverDays >= mainGapThreshold) {
    return {
      title: "Fat is running high",
      text: `Fat went above its target range on ${fatOverDays} of ${loggedCount} logged days. Review oils, sauces, and snack portions before changing the rest of your plan.`,
    };
  }

  if (carbsGapDays >= mainGapThreshold) {
    return {
      title: "Carbs need more consistency",
      text: `Carbs were below target on ${carbsGapDays} of ${loggedCount} logged days. Plan one dependable carb source around your busiest part of the day.`,
    };
  }

  return {
    title: "A steady weekly baseline",
    text: `${goalDays} of ${loggedCount} logged days stayed within your calorie target, with no single macro standing out as the main gap. Keep the same structure next week and continue logging consistently.`,
  };
}

function shortEntryDate(dateKey) {
  const date = dateFromKey(dateKey);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

elements.progressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const today = localDateKey(new Date());
  if (elements.progressDate.value > today) {
    elements.progressDate.setCustomValidity("You can't log weight for a future date.");
    elements.progressDate.reportValidity();
    elements.progressDate.setCustomValidity("");
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    date: elements.progressDate.value,
    weightKg: Number(elements.progressWeight.value),
  };

  state.progress = state.progress.filter((item) => item.date !== entry.date);
  state.progress.push(entry);
  if (state.user) state.user.weightKg = entry.weightKg;
  saveState();
  render();
});

elements.weightLogJump?.addEventListener("click", () => {
  elements.progressForm.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => elements.progressWeight.focus({ preventScroll: true }), 350);
});

elements.progressViewButtons.forEach((button) => {
  button.addEventListener("click", () => setProgressView(button.dataset.progressView));
});

function changeWeightPeriod(direction) {
  if (direction > 0 && weightRangeOffset >= 0) return;
  weightRangeOffset = Math.min(0, weightRangeOffset + direction * weightRange);
  renderChart(dailyWeightEntries(state.progress));
}

elements.weightRangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    weightRange = Number(button.dataset.weightRange || 30);
    weightRangeOffset = 0;
    localStorage.setItem("daily-fuel-weight-range", String(weightRange));
    renderChart(dailyWeightEntries(state.progress));
  });
});

elements.weightPreviousPeriod?.addEventListener("click", () => changeWeightPeriod(-1));
elements.weightNextPeriod?.addEventListener("click", () => changeWeightPeriod(1));

let weightChartTouchStart = null;
elements.progressChart?.addEventListener("touchstart", (event) => {
  if (!isMobileWeightChart() || event.touches.length !== 1) return;
  const touch = event.touches[0];
  weightChartTouchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
elements.progressChart?.addEventListener("touchend", (event) => {
  if (!weightChartTouchStart || !isMobileWeightChart() || event.changedTouches.length !== 1) {
    weightChartTouchStart = null;
    return;
  }
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - weightChartTouchStart.x;
  const deltaY = touch.clientY - weightChartTouchStart.y;
  weightChartTouchStart = null;
  if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
  changeWeightPeriod(deltaX < 0 ? 1 : -1);
}, { passive: true });

elements.nutritionMetricButtons.forEach((button) => {
  button.addEventListener("click", () => {
    nutritionMetric = button.dataset.nutritionMetric || "calories";
    localStorage.setItem("daily-fuel-nutrition-metric", nutritionMetric);
    renderNutrition();
  });
});

elements.nutritionRangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      nutritionRange = Number(button.dataset.nutritionRange || 7);
      nutritionRangeOffset = 0;
      selectedNutritionDate = localDateKey(new Date());
      localStorage.setItem("daily-fuel-nutrition-range", String(nutritionRange));
      renderNutrition();
    });
  });

elements.nutritionPreviousRange?.addEventListener("click", () => {
  nutritionRangeOffset -= nutritionRange;
  selectedNutritionDate = localDateKey(addDays(new Date(), nutritionRangeOffset));
  renderNutrition();
});

elements.nutritionNextRange?.addEventListener("click", () => {
  nutritionRangeOffset = Math.min(0, nutritionRangeOffset + nutritionRange);
  selectedNutritionDate = localDateKey(addDays(new Date(), nutritionRangeOffset));
  renderNutrition();
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
let resizeRenderTimer = null;
window.addEventListener("resize", () => {
  if (!isMobileSidebar()) setMobileSidebarOpen(false);
  clearTimeout(resizeRenderTimer);
  resizeRenderTimer = setTimeout(() => render(), 120);
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

elements.logoutButton.addEventListener("click", () => {
  if (!window.confirm("Are you sure you want to log out?")) return;
  state.user = null;
  saveState();
  window.location.href = "profile.html";
});

if (localStorage.getItem("calorie-counter-sidebar-collapsed") === "true") {
  elements.appShell.classList.add("sidebar-collapsed");
}

render();
