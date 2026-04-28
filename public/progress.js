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
  appShell: document.querySelector(".app-shell"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  profileSummary: document.querySelector("#profileSummary"),
  profileMeta: document.querySelector("#profileMeta"),
  logoutButton: document.querySelector("#logoutButton"),
};

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
    }),
    { calories: 0, protein: 0 },
  );
  const exerciseCalories = (day.exercises || []).reduce((sum, exercise) => sum + Math.round(Number(exercise.calories || 0)), 0);
  return { ...foodTotals, exerciseCalories, netCalories: foodTotals.calories - exerciseCalories };
}

function isClearDay(day) {
  const summary = summarizeDay(day);
  const hasEntries = (day?.foods || []).length > 0 || (day?.exercises || []).length > 0;
  return hasEntries && summary.netCalories <= Number(state.goals?.calories || 2300);
}

function clearDayStreak() {
  const today = localDateKey(new Date());
  let cursor = dateFromKey(today);

  if (!isClearDay(state.days?.[today])) {
    cursor = addDays(cursor, -1);
  }

  let streak = 0;
  while (true) {
    const dateKey = localDateKey(cursor);
    const day = state.days?.[dateKey];
    if (!day || !isClearDay(day)) return streak;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
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
  renderChart(entries);
  renderList(entries);
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
