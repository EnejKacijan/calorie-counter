const storageKey = "calorie-counter-state";
const state = loadState();
document.body.classList.add("progress-page");

const elements = {
  progressForm: document.querySelector("#progressForm"),
  progressDate: document.querySelector("#progressDate"),
  progressWeight: document.querySelector("#progressWeight"),
  currentWeightValue: document.querySelector("#currentWeightValue"),
  weightTrendText: document.querySelector("#weightTrendText"),
  progressChart: document.querySelector("#progressChart"),
  weightChartAxis: document.querySelector(".weight-chart-axis"),
  progressList: document.querySelector("#progressList"),
  progressViewButtons: Array.from(document.querySelectorAll("[data-progress-view]")),
  progressViews: Array.from(document.querySelectorAll("[data-progress-panel]")),
  nutritionMetricButtons: Array.from(document.querySelectorAll("[data-nutrition-metric]")),
  nutritionRangeButtons: Array.from(document.querySelectorAll("[data-nutrition-range]")),
  nutritionChart: document.querySelector("#nutritionChart"),
  nutritionChartAxis: document.querySelector("#nutritionChartAxis"),
  nutritionAverageCalories: document.querySelector("#nutritionAverageCalories"),
  nutritionGoalDays: document.querySelector("#nutritionGoalDays"),
  nutritionMacroHit: document.querySelector("#nutritionMacroHit"),
  nutritionLoggedDays: document.querySelector("#nutritionLoggedDays"),
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

const nutritionMetrics = {
  calories: { label: "Calories", unit: "kcal", goalKey: "calories", valueKey: "calories" },
  net: { label: "Net", unit: "kcal", goalKey: "calories", valueKey: "netCalories" },
  macros: { label: "Macros", unit: "%", isMacro: true },
};

if (!nutritionMetrics[nutritionMetric]) nutritionMetric = "calories";
if (![7, 30].includes(nutritionRange)) nutritionRange = 7;

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
  document.body.dataset.theme = theme === "dark" ? "dark" : "light";
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
  const latest = [...state.progress].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return Number(latest?.weightKg || state.user?.weightKg || 0);
}

function formatWeight(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function trendForEntries(entries) {
  if (entries.length < 2) return { delta: 0, days: 0, label: "Add another entry to see trend.", tone: "neutral" };

  const latest = entries.at(-1);
  const latestDate = dateFromKey(latest.date);
  const fourteenDaysAgo = addDays(latestDate, -14);
  const baseline = [...entries].reverse().find((entry) => dateFromKey(entry.date) <= fourteenDaysAgo) || entries[0];
  const days = Math.max(1, Math.round((latestDate - dateFromKey(baseline.date)) / 86400000));
  const delta = Number(latest.weightKg) - Number(baseline.weightKg);
  const arrow = delta < -0.05 ? "↓" : delta > 0.05 ? "↑" : "→";
  const tone = delta < -0.05 ? "good" : delta > 0.05 ? "bad" : "neutral";
  const target = Number(state.user?.targetWeightKg || state.user?.startWeightKg || latest.weightKg);
  const label = `${arrow} ${Math.abs(delta).toFixed(1)} kg in ${days} ${days === 1 ? "day" : "days"} · target ${formatWeight(target)} kg`;
  return { delta, days, label, tone };
}

function ensureInitialProgress() {
  if (!state.user || state.progress.length) return;
  state.progress.push({
    id: crypto.randomUUID(),
    date: localDateKey(new Date()),
    weightKg: Number(state.user.weightKg),
  });
  saveState();
}

function render() {
  applyTheme(state.user?.theme || state.theme || "light");
  ensureInitialProgress();

  if (!state.user) {
    window.location.href = "profile.html";
    return;
  }

  const entries = [...state.progress].sort((a, b) => a.date.localeCompare(b.date));
  const current = currentWeight();
  const trend = trendForEntries(entries);
  elements.profileSummary.textContent = state.user.name;
  elements.profileMeta.textContent = `${state.user.weightKg} kg · ${state.user.heightCm} cm`;
  elements.currentWeightValue.textContent = formatWeight(current);
  elements.weightTrendText.textContent = trend.label;
  elements.weightTrendText.className = `weight-trend is-${trend.tone}`;
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

function renderChart(entries) {
  const todayKey = localDateKey(new Date());
  const chartEntries = entries.length ? entries : [{ date: todayKey, weightKg: state.user.weightKg }];
  const latestEntry = chartEntries.at(-1);
  const todayProjection = latestEntry.date === todayKey
    ? null
    : { date: todayKey, weightKg: latestEntry.weightKg, isProjection: true };
  const lineEntries = todayProjection ? [...chartEntries, todayProjection] : chartEntries;
  const weights = lineEntries.map((entry) => Number(entry.weightKg));
  const min = Math.floor((Math.min(...weights) - 0.7) / 5) * 5;
  const max = Math.ceil((Math.max(...weights) + 0.7) / 5) * 5;
  const rect = elements.progressChart.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width || elements.progressChart.clientWidth || 320));
  const height = Math.max(210, Math.round(rect.height || elements.progressChart.clientHeight || 240));
  const xInset = width >= 700 ? 56 : 10;
  const chart = {
    left: xInset,
    right: width - xInset,
    top: Math.round(height * 0.18),
    bottom: height - (width >= 700 ? 26 : 18),
  };
  const range = max - min || 1;
  const firstDate = dateFromKey(chartEntries[0].date);
  const todayDate = dateFromKey(todayKey);
  const dateSpan = Math.max(1, Math.round((todayDate - firstDate) / 86400000));
  const yForWeight = (weight) => chart.bottom - ((weight - min) / range) * (chart.bottom - chart.top);
  const xForDate = (dateKey) => {
    const daysFromStart = Math.max(0, Math.round((dateFromKey(dateKey) - firstDate) / 86400000));
    return chart.left + (Math.min(daysFromStart, dateSpan) / dateSpan) * (chart.right - chart.left);
  };
  const points = lineEntries.map((entry) => {
    const x = chartEntries.length === 1 && !todayProjection ? chart.right : xForDate(entry.date);
    const y = yForWeight(Number(entry.weightKg));
    return `${x},${y}`;
  });
  const entryDots = chartEntries.map((entry) => ({
    x: chartEntries.length === 1 && entry.date === todayKey ? chart.right : xForDate(entry.date),
    y: yForWeight(Number(entry.weightKg)),
    isToday: entry.date === todayKey,
  }));
  const todayDot = {
    x: chart.right,
    y: yForWeight(Number(latestEntry.weightKg)),
  };
  const gridLines = [];
  for (let weight = max; weight >= min; weight -= 5) {
    gridLines.push({ y: yForWeight(weight), label: `${weight} kg` });
  }
  const axisLabels = chartEntries.length < 2
    ? ["Start", "", "Now"]
    : [shortAxisDate(chartEntries[0].date), `${dateSpan} ${dateSpan === 1 ? "day" : "days"}`, "Now"];
  const currentAxisLabel = `${formatWeight(latestEntry.weightKg)} kg`;

  if (elements.weightChartAxis) {
    elements.weightChartAxis.querySelectorAll("span").forEach((span, index) => {
      span.textContent = index === 2 ? `${axisLabels[index]} · ${currentAxisLabel}` : axisLabels[index] || "";
    });
  }

  elements.progressChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Weight progress chart">
      ${gridLines.map((line) => `<path class="chart-grid" d="M${chart.left} ${line.y} H${chart.right}"></path>`).join("")}
      ${gridLines.map((line) => `<text class="weight-y-label" x="${Math.max(2, chart.left - 48)}" y="${line.y + 3}">${line.label}</text>`).join("")}
      <polyline class="chart-line" points="${points.join(" ")}"></polyline>
      ${entryDots.map((dot) => `<circle class="chart-dot${dot.isToday ? " is-today" : ""}" cx="${dot.x}" cy="${dot.y}" r="${dot.isToday ? 4.2 : 3}"></circle>`).join("")}
      ${todayProjection ? `<circle class="chart-today-dot" cx="${todayDot.x}" cy="${todayDot.y}" r="4.2"></circle>` : ""}
    </svg>
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
    const deltaText = previousEntry
      ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`
      : "Start";
    const deltaClass = !previousEntry ? "neutral" : delta > 0 ? "up" : delta < 0 ? "down" : "neutral";

    card.classList.add("progress-entry-card", `is-${deltaClass}`);
    card.querySelector("strong").textContent = shortEntryDate(entry.date);
    card.querySelector("p").innerHTML = `<span>${formatWeight(entry.weightKg)}</span><small>${deltaText}</small>`;
    card.querySelector("button").addEventListener("click", () => {
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
    const date = addDays(today, index - range + 1);
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
  elements.nutritionInsightText.textContent = nutritionInsight(rows, loggedRows, goalDays);

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
  const min = Math.min(0, Math.floor(minValue - padding));
  const max = Math.ceil(maxValue + padding);
  const { width, height, plotWidth } = nutritionChartSize();
  const xInset = Math.round((width - plotWidth) / 2);
  const chart = {
    left: xInset,
    right: xInset + plotWidth,
    top: 28,
    bottom: height - 56,
  };
  const range = max - min || 1;
  const yFor = (value) => chart.bottom - ((value - min) / range) * (chart.bottom - chart.top);
  const zeroY = yFor(0);
  const goalY = goal > 0 ? yFor(goal) : null;
  const slot = (chart.right - chart.left) / rows.length;
  const barWidth = Math.max(5, Math.min(nutritionRange === 7 ? 28 : 12, slot * 0.48));
  const bars = rows.map((row, index) => {
    const value = Number(row[metric.valueKey] || 0);
    const x = chart.left + index * slot + (slot - barWidth) / 2;
    const y = Math.min(yFor(value), zeroY);
    const heightValue = Math.max(2, Math.abs(zeroY - yFor(value)));
    const tone = row.netCalories > Number(state.goals?.calories || 2300) ? "is-over" : "is-good";
    return `<rect class="nutrition-bar ${tone}" x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="0"></rect>`;
  });
  const goalLabel = `${Math.round(goal)} ${metric.unit}`;
  const axisLabels = nutritionAxisLabels(rows, chart, slot);
  const axisTicks = nutritionAxisTicks(rows, chart, slot);
  const axisLabelY = chart.bottom + 27;

  elements.nutritionChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric.label} trend chart">
      <path class="nutrition-grid" d="M${chart.left} ${zeroY} H${chart.right}"></path>
      ${goalY === null ? "" : `<path class="nutrition-goal-line" d="M${chart.left} ${goalY} H${chart.right}"></path>`}
      ${goalY === null ? "" : `<text class="nutrition-goal-label" x="${chart.left}" y="${Math.max(12, goalY - 8)}">${goalLabel}</text>`}
      ${bars.join("")}
      ${axisTicks.map((tick) => `<path class="nutrition-axis-tick" d="M${tick.x} ${chart.bottom + 7} V${chart.bottom + 12}"></path>`).join("")}
      ${axisLabels.map((label) => `<text class="nutrition-axis-label" x="${label.x}" y="${axisLabelY}">${label.text}</text>`).join("")}
    </svg>
  `;

  elements.nutritionChartAxis.innerHTML = "";
}

function renderMacroNutritionChart(rows) {
  const goals = {
    protein: Number(state.goals?.protein || 150),
    carbs: Number(state.goals?.carbs || 260),
    fat: Number(state.goals?.fat || 75),
  };
  const { width, height, plotWidth } = nutritionChartSize();
  const xInset = Math.round((width - plotWidth) / 2);
  const chart = {
    left: xInset,
    right: xInset + plotWidth,
    top: 30,
    bottom: height - 56,
  };
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
    const groupX = chart.left + index * slot + (slot - groupWidth) / 2;
    return macroKeys().map((key, macroIndex) => {
      const percent = macroPercent(row, key, goals[key]);
      const x = groupX + macroIndex * (barWidth + gap);
      const y = yFor(percent);
      const heightValue = Math.max(2, chart.bottom - y);
      return `<rect class="nutrition-bar nutrition-macro-bar is-${key}" x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="0"></rect>`;
    });
  });
  const axisLabels = nutritionAxisLabels(rows, chart, slot);
  const axisTicks = nutritionAxisTicks(rows, chart, slot);
  const axisLabelY = chart.bottom + 27;

  elements.nutritionChart.innerHTML = `
    <div class="nutrition-macro-legend" aria-hidden="true">
      <span class="is-protein">P</span>
      <span class="is-carbs">C</span>
      <span class="is-fat">F</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Macro percent of goal chart">
      <path class="nutrition-grid" d="M${chart.left} ${chart.bottom} H${chart.right}"></path>
      <path class="nutrition-goal-line" d="M${chart.left} ${goalY} H${chart.right}"></path>
      <text class="nutrition-goal-label" x="${chart.left}" y="${Math.max(12, goalY - 8)}">100% goal</text>
      ${bars.join("")}
      ${axisTicks.map((tick) => `<path class="nutrition-axis-tick" d="M${tick.x} ${chart.bottom + 7} V${chart.bottom + 12}"></path>`).join("")}
      ${axisLabels.map((label) => `<text class="nutrition-axis-label" x="${label.x}" y="${axisLabelY}">${label.text}</text>`).join("")}
    </svg>
  `;
  elements.nutritionChartAxis.innerHTML = "";
}

function nutritionChartSize() {
  const rect = elements.nutritionChart.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width || elements.nutritionChart.clientWidth || 320));
  const height = width >= 700 ? 340 : 280;
  const sidePadding = width >= 700 ? 50 : 18;
  const maxPlotWidth = nutritionRange <= 7 && width >= 900 ? 560 : width - sidePadding * 2;
  const plotWidth = Math.max(260, Math.min(width - sidePadding * 2, maxPlotWidth));
  return { width, height, plotWidth };
}

function nutritionAxisLabels(rows, chart, slot) {
  const every = rows.length <= 7 ? 1 : rows.length <= 14 ? 2 : 5;
  return rows
    .map((row, index) => ({
      index,
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

  if (!loggedCount) {
    return "Start logging meals and this note will turn into a weekly read of calories, protein, and consistency.";
  }

  const overGoalDays = loggedRows.filter((row) => row.netCalories > calorieGoal).length;
  const avgProtein = average(loggedRows.map((row) => row.protein));
  const avgCarbsPercent = average(loggedRows.map((row) => macroPercent(row, "carbs", Number(state.goals?.carbs || 260))));
  const avgFatPercent = average(loggedRows.map((row) => macroPercent(row, "fat", Number(state.goals?.fat || 75))));
  const consistency = loggedCount / rows.length;

  if (consistency < 0.5) {
    return `You logged ${loggedCount} of ${rows.length} days. Next week, the biggest win is simply filling more days so the pattern becomes easier to trust.`;
  }

  if (overGoalDays === 0 && avgProtein >= proteinGoal * 0.8) {
    return `Strong stretch: ${goalDays} goal days and protein is close to target. Keep the same structure next week.`;
  }

  if (overGoalDays >= Math.max(2, Math.ceil(loggedCount * 0.35))) {
    return `${overGoalDays} logged days went over your calorie goal. Next week, watch the highest-calorie meal window first instead of trying to change everything.`;
  }

  if (avgProtein < proteinGoal * 0.7) {
    return `Calories are fairly controlled, but protein is averaging ${Math.round(avgProtein)}g. Add one reliable protein anchor earlier in the day next week.`;
  }

  if (avgFatPercent > 120) {
    return `Calories are close, but fat is averaging ${Math.round(avgFatPercent)}% of target. Watch oils, sauces, and snack portions first.`;
  }

  if (avgCarbsPercent < 70) {
    return `Protein is in a decent place, but carbs are averaging ${Math.round(avgCarbsPercent)}% of target. Add steady carbs around training or busy days if energy dips.`;
  }

  return `Good baseline: ${goalDays} of ${loggedCount} logged days landed within goal. Keep logging and look for the meal that most often pushes net calories up.`;
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

elements.progressViewButtons.forEach((button) => {
  button.addEventListener("click", () => setProgressView(button.dataset.progressView));
});

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
    localStorage.setItem("daily-fuel-nutrition-range", String(nutritionRange));
    renderNutrition();
  });
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
