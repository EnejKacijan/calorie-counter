const storageKey = "calorie-counter-state";
const state = loadState();

const elements = {
  progressForm: document.querySelector("#progressForm"),
  progressDate: document.querySelector("#progressDate"),
  progressWeight: document.querySelector("#progressWeight"),
  progressGoalLabel: document.querySelector("#progressGoalLabel"),
  progressSummary: document.querySelector("#progressSummary"),
  progressTrendBadge: document.querySelector("#progressTrendBadge"),
  progressMeterFill: document.querySelector("#progressMeterFill"),
  progressStats: document.querySelector("#progressStats"),
  progressChart: document.querySelector("#progressChart"),
  progressList: document.querySelector("#progressList"),
  appShell: document.querySelector(".app-shell"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  profileSummary: document.querySelector("#profileSummary"),
  profileMeta: document.querySelector("#profileMeta"),
  logoutButton: document.querySelector("#logoutButton"),
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  const fallback = { user: null, progress: [], theme: localStorage.getItem("calorie-counter-theme") || "light" };
  if (!saved) return fallback;

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.progress)) parsed.progress = [];
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

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const total = Math.abs(target - start);
  if (!total) return 100;
  return Math.max(0, Math.min(100, Math.round((Math.abs(current - start) / total) * 100)));
}

function goalLabel(goalType) {
  return { lose: "Lose fat", maintain: "Maintain", gain: "Build muscle" }[goalType] || "Goal";
}

function weightDirectionVerb() {
  if (!state.user) return "changed";
  const start = Number(state.user.startWeightKg || state.user.weightKg);
  const target = Number(state.user.targetWeightKg);
  return target < start ? "lost" : target > start ? "gained" : "changed";
}

function trendSummary(entries) {
  if (entries.length < 2) return { label: "No trend yet", value: "0.0 kg", tone: "neutral" };
  const latest = entries.at(-1);
  const previous = entries.at(-2);
  const delta = Number(latest.weightKg) - Number(previous.weightKg);
  const value = `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`;
  if (Math.abs(delta) < 0.05) return { label: "Steady", value: "0.0 kg", tone: "neutral" };
  return {
    label: delta > 0 ? "Up since last" : "Down since last",
    value,
    tone: delta > 0 ? "up" : "down",
  };
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
  const trend = trendSummary(entries);
  elements.profileSummary.textContent = state.user.name;
  elements.profileMeta.textContent = `${state.user.weightKg} kg · ${state.user.heightCm} cm`;
  elements.progressGoalLabel.textContent = `${current} kg now · ${target} kg goal`;
  elements.progressSummary.textContent = `${percent}% to goal`;
  elements.progressTrendBadge.textContent = `${trend.label}: ${trend.value}`;
  elements.progressTrendBadge.className = `progress-badge is-${trend.tone}`;
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
    <article class="progress-stat-card is-${trend.tone}">
      <span>Trend</span>
      <strong>${trend.value}</strong>
      <small>${trend.label}</small>
    </article>
  `;
  elements.progressDate.value = elements.progressDate.value || localDateKey(new Date());
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
  const targetY = 86 - ((target - min) / (max - min || 1)) * 72;
  const points = chartEntries.map((entry, index) => {
    const x = chartEntries.length === 1 ? 50 : 8 + (index / (chartEntries.length - 1)) * 84;
    const y = 86 - ((Number(entry.weightKg) - min) / (max - min || 1)) * 72;
    return `${x},${y}`;
  });

  elements.progressChart.innerHTML = `
    <svg viewBox="0 0 100 100" role="img" aria-label="Weight progress chart">
      <defs>
        <linearGradient id="weightArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity=".18"></stop>
          <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <path class="chart-grid" d="M8 20 H92 M8 50 H92 M8 80 H92"></path>
      <path class="chart-target-line" d="M8 ${targetY.toFixed(2)} H92"></path>
      <text class="chart-target-label" x="91" y="${Math.max(9, targetY - 3).toFixed(2)}" text-anchor="end">Goal ${target} kg</text>
      <polygon class="chart-area" points="${points.join(" ")} 92,92 8,92"></polygon>
      <polyline class="chart-line" points="${points.join(" ")}"></polyline>
      ${points.map((point) => {
    const [x, y] = point.split(",");
    return `<circle class="chart-dot" cx="${x}" cy="${y}" r="2.5"></circle>`;
  }).join("")}
    </svg>
  `;
}

function renderList(entries) {
  elements.progressList.innerHTML = "";
  [...entries].reverse().forEach((entry) => {
    const card = document.querySelector("#entryTemplate").content.firstElementChild.cloneNode(true);
    card.querySelector("strong").textContent = `${entry.weightKg} kg`;
    card.querySelector("p").textContent = entry.date;
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
  elements.appShell.classList.toggle("sidebar-collapsed");
  const isCollapsed = elements.appShell.classList.contains("sidebar-collapsed");
  localStorage.setItem("calorie-counter-sidebar-collapsed", String(isCollapsed));
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
