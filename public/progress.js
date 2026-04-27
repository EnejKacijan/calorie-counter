const storageKey = "calorie-counter-state";
const state = loadState();
document.body.classList.add("progress-page");

const elements = {
  progressForm: document.querySelector("#progressForm"),
  progressDate: document.querySelector("#progressDate"),
  progressWeight: document.querySelector("#progressWeight"),
  progressGoalLabel: document.querySelector("#progressGoalLabel"),
  progressSummary: document.querySelector("#progressSummary"),
  progressMeterFill: document.querySelector("#progressMeterFill"),
  progressStats: document.querySelector("#progressStats"),
  progressChart: document.querySelector("#progressChart"),
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

function goalProgressPercent() {
  if (!state.user) return 0;
  const start = Number(state.user.startWeightKg || state.user.weightKg);
  const current = currentWeight();
  const target = Number(state.user.targetWeightKg);
  const total = target - start;
  if (Math.abs(total) < 0.05) return Math.abs(current - target) < 0.05 ? 100 : 0;

  const progress = ((current - start) / total) * 100;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function goalLabel(goalType) {
  return { lose: "Lose fat", maintain: "Maintain", gain: "Build muscle" }[goalType] || "Goal";
}

function weightDirectionVerb() {
  if (!state.user) return "changed";
  const start = Number(state.user.startWeightKg || state.user.weightKg);
  const current = currentWeight();
  const delta = current - start;
  if (Math.abs(delta) < 0.05) return "Changed";
  return delta < 0 ? "Lost" : "Gained";
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
  const percent = goalProgressPercent();
  const start = Number(state.user.startWeightKg || state.user.weightKg);
  const current = currentWeight();
  const target = Number(state.user.targetWeightKg);
  const changed = Math.abs(current - start).toFixed(1);
  const remaining = Math.abs(target - current).toFixed(1);
  const streak = clearDayStreak();
  elements.profileSummary.textContent = state.user.name;
  elements.profileMeta.textContent = `${state.user.weightKg} kg · ${state.user.heightCm} cm`;
  elements.progressGoalLabel.textContent = `${current} kg now · ${target} kg goal`;
  elements.progressSummary.textContent = `${percent}% to goal`;
  elements.progressMeterFill.style.width = `${percent}%`;
  elements.progressStats.innerHTML = `
    <article class="progress-stat-card">
      <span>Start</span>
      <strong>${start} kg</strong>
      <small>First logged weight</small>
    </article>
    <article class="progress-stat-card">
      <span>${weightDirectionVerb()}</span>
      <strong>${changed} kg</strong>
      <small>Total body-weight change</small>
    </article>
    <article class="progress-stat-card">
      <span>Remaining</span>
      <strong>${remaining} kg</strong>
      <small>Until target weight</small>
    </article>
    <article class="progress-stat-card">
      <span>Streak</span>
      <strong>${streak} ${streak === 1 ? "day" : "days"}</strong>
      <small>Logged days within calorie goal</small>
    </article>
  `;
  const today = localDateKey(new Date());
  elements.progressDate.max = today;
  elements.progressDate.value = elements.progressDate.value || today;
  if (elements.progressDate.value > today) elements.progressDate.value = today;
  elements.progressWeight.value = elements.progressWeight.value || currentWeight();
  renderChart(entries);
  renderList(entries);
}

function renderChart(entries) {
  const chartEntries = entries.length ? entries : [{ date: localDateKey(new Date()), weightKg: state.user.weightKg }];
  const weights = chartEntries.map((entry) => Number(entry.weightKg));
  const min = Math.min(...weights, Number(state.user.targetWeightKg)) - 1;
  const max = Math.max(...weights, Number(state.user.startWeightKg || state.user.weightKg)) + 1;
  const target = Number(state.user.targetWeightKg);
  const chart = { left: 15, right: 93, top: 14, bottom: 82 };
  const range = max - min || 1;
  const yForWeight = (weight) => chart.bottom - ((weight - min) / range) * (chart.bottom - chart.top);
  const targetY = yForWeight(target);
  const points = chartEntries.map((entry, index) => {
    const x = chartEntries.length === 1
      ? (chart.left + chart.right) / 2
      : chart.left + (index / (chartEntries.length - 1)) * (chart.right - chart.left);
    const y = yForWeight(Number(entry.weightKg));
    return `${x},${y}`;
  });
  const latestEntry = chartEntries.at(-1);
  const [latestX, latestY] = points.at(-1).split(",").map(Number);
  const latestLabelX = Math.min(chart.right - 15, Math.max(chart.left + 15, latestX));
  const latestLabelY = Math.max(chart.top + 8, latestY - 8);
  const yTicks = [max, (max + min) / 2, min].map((weight) => ({
    weight,
    y: yForWeight(weight),
  }));
  const dateTickIndexes = chartEntries.length === 1
    ? [0]
    : [...new Set([0, Math.floor((chartEntries.length - 1) / 2), chartEntries.length - 1])];
  const dateTicks = dateTickIndexes.map((index) => {
    const x = chartEntries.length === 1
      ? (chart.left + chart.right) / 2
      : chart.left + (index / (chartEntries.length - 1)) * (chart.right - chart.left);
    return { x, label: shortDateLabel(chartEntries[index].date) };
  });

  elements.progressChart.innerHTML = `
    <svg viewBox="0 0 100 100" role="img" aria-label="Weight progress chart">
      <defs>
        <linearGradient id="weightArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity=".18"></stop>
          <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${yTicks.map((tick) => `
        <path class="chart-grid" d="M${chart.left} ${tick.y.toFixed(2)} H${chart.right}"></path>
        <text class="chart-axis-label chart-y-label" x="${chart.left - 2}" y="${(tick.y + 1.2).toFixed(2)}" text-anchor="end">${tick.weight.toFixed(1)} kg</text>
      `).join("")}
      <path class="chart-target-line" d="M${chart.left} ${targetY.toFixed(2)} H${chart.right}"></path>
      <text class="chart-target-label" x="${chart.right - 1}" y="${Math.max(9, targetY - 3).toFixed(2)}" text-anchor="end">Goal ${target} kg</text>
      <polygon class="chart-area" points="${points.join(" ")} ${chart.right},${chart.bottom} ${chart.left},${chart.bottom}"></polygon>
      <polyline class="chart-line" points="${points.join(" ")}"></polyline>
      ${points.map((point) => {
    const [x, y] = point.split(",");
    return `<circle class="chart-dot" cx="${x}" cy="${y}" r="2.5"></circle>`;
  }).join("")}
      <circle class="chart-latest-pulse" cx="${latestX}" cy="${latestY}" r="5.2"></circle>
      <circle class="chart-latest-dot" cx="${latestX}" cy="${latestY}" r="3.1"></circle>
      <g class="chart-latest-label" transform="translate(${latestLabelX.toFixed(2)} ${latestLabelY.toFixed(2)})">
        <rect x="-13" y="-7" width="26" height="11" rx="5.5"></rect>
        <text x="0" y="-2.2" text-anchor="middle">Today</text>
        <text x="0" y="2.4" text-anchor="middle">${Number(latestEntry.weightKg)} kg</text>
      </g>
      ${dateTicks.map((tick) => `
        <text class="chart-axis-label chart-x-label" x="${tick.x.toFixed(2)}" y="94" text-anchor="middle">${tick.label}</text>
      `).join("")}
    </svg>
  `;
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
    const deltaText = previousEntry
      ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`
      : "Start";
    const deltaClass = !previousEntry ? "neutral" : delta > 0 ? "up" : delta < 0 ? "down" : "neutral";

    card.classList.add("progress-entry-card", `is-${deltaClass}`);
    card.querySelector("strong").textContent = `${entry.weightKg} kg`;
    card.querySelector("p").innerHTML = `<span>${entry.date}</span><small>${deltaText}</small>`;
    card.querySelector("button").addEventListener("click", () => {
      state.progress = state.progress.filter((item) => item.id !== entry.id);
      saveState();
      render();
    });
    elements.progressList.appendChild(card);
  });
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
window.addEventListener("resize", () => {
  if (!isMobileSidebar()) setMobileSidebarOpen(false);
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
