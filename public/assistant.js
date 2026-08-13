const storageKey = "calorie-counter-state";
const legacyConversationKey = "calorie-counter-assistant-conversation-v1";
const conversationsKey = "calorie-counter-assistant-conversations-v1";
const activeConversationKey = "calorie-counter-assistant-active-conversation-v1";
const diaryPreferenceKey = "calorie-counter-assistant-diary-enabled";
const rangePreferenceKey = "calorie-counter-assistant-range";
const safetyIdentifierKey = "calorie-counter-assistant-safety-id";

const state = loadState();
if (!state.user) window.location.href = "profile.html";

const elements = {
  appShell: document.querySelector("#appShell"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  profileSummary: document.querySelector("#profileSummary"),
  profileMeta: document.querySelector("#profileMeta"),
  logoutButton: document.querySelector("#logoutButton"),
  clear: document.querySelector("#assistantClear"),
  historyOpen: document.querySelector("#assistantHistoryOpen"),
  history: document.querySelector("#assistantHistory"),
  historyBackdrop: document.querySelector("#assistantHistoryBackdrop"),
  historyClose: document.querySelector("#assistantHistoryClose"),
  historyList: document.querySelector("#assistantHistoryList"),
  historyDeleteAll: document.querySelector("#assistantHistoryDeleteAll"),
  diaryToggle: document.querySelector("#assistantDiaryToggle"),
  range: document.querySelector("#assistantRange"),
  contextNote: document.querySelector("#assistantContextNote"),
  empty: document.querySelector("#assistantEmpty"),
  messages: document.querySelector("#assistantMessages"),
  typing: document.querySelector("#assistantTyping"),
  form: document.querySelector("#assistantForm"),
  input: document.querySelector("#assistantInput"),
  send: document.querySelector("#assistantSend"),
  starters: Array.from(document.querySelectorAll("[data-assistant-prompt]")),
};

let conversations = loadConversations();
let activeConversationId = loadActiveConversationId();
let messages = activeConversation()?.messages.map((message) => ({ ...message })) || [];
let transientError = "";
let isSending = false;

applyTheme();
hydrateProfile();
hydratePreferences();
renderConversation();
renderHistory();
updateContextNote();

function loadState() {
  const fallback = {
    user: null,
    days: {},
    goals: { calories: 2300, protein: 150, carbs: 260, fat: 75 },
    theme: localStorage.getItem("calorie-counter-theme") || "light",
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      ...fallback,
      ...parsed,
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
      goals: { ...fallback.goals, ...(parsed.goals || {}) },
    };
  } catch {
    return fallback;
  }
}

function loadConversations() {
  try {
    const parsed = JSON.parse(localStorage.getItem(conversationsKey) || "[]");
    const normalized = Array.isArray(parsed)
      ? parsed.map(normalizeConversation).filter(Boolean).slice(0, 50)
      : [];
    if (normalized.length) return normalized;
  } catch {
    // Fall through to the legacy single-conversation migration.
  }

  const legacyMessages = loadLegacyMessages();
  if (!legacyMessages.length) return [];

  const now = legacyMessages.at(-1)?.createdAt || new Date().toISOString();
  const migrated = {
    id: crypto.randomUUID(),
    title: conversationTitle(legacyMessages.find((message) => message.role === "user")?.content),
    createdAt: legacyMessages[0]?.createdAt || now,
    updatedAt: now,
    diaryEnabled: localStorage.getItem(diaryPreferenceKey) !== "false",
    diaryRange: Number(localStorage.getItem(rangePreferenceKey) || 7),
    messages: legacyMessages,
  };
  localStorage.setItem(conversationsKey, JSON.stringify([migrated]));
  localStorage.setItem(activeConversationKey, migrated.id);
  localStorage.removeItem(legacyConversationKey);
  return [migrated];
}

function loadLegacyMessages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(legacyConversationKey) || "[]");
    return normalizeMessages(parsed);
  } catch {
    return [];
  }
}

function normalizeConversation(conversation) {
  if (!conversation || typeof conversation !== "object") return null;
  const normalizedMessages = normalizeMessages(conversation.messages);
  if (!normalizedMessages.length) return null;
  const firstUserMessage = normalizedMessages.find((message) => message.role === "user")?.content;
  return {
    id: String(conversation.id || crypto.randomUUID()),
    title: String(conversation.title || conversationTitle(firstUserMessage)).slice(0, 70),
    createdAt: validDateString(conversation.createdAt),
    updatedAt: validDateString(conversation.updatedAt || conversation.createdAt),
    diaryEnabled: conversation.diaryEnabled !== false,
    diaryRange: [7, 30].includes(Number(conversation.diaryRange)) ? Number(conversation.diaryRange) : 7,
    messages: normalizedMessages,
  };
}

function normalizeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message) => ["user", "assistant"].includes(message?.role) && typeof message?.content === "string")
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 8_000),
      createdAt: validDateString(message.createdAt),
    }))
    .slice(-40);
}

function validDateString(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function loadActiveConversationId() {
  const storedId = localStorage.getItem(activeConversationKey);
  if (conversations.some((conversation) => conversation.id === storedId)) return storedId;
  return conversations[0]?.id || null;
}

function activeConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId) || null;
}

function ensureActiveConversation(firstMessage) {
  if (activeConversation()) return;
  const now = new Date().toISOString();
  const conversation = {
    id: crypto.randomUUID(),
    title: conversationTitle(firstMessage),
    createdAt: now,
    updatedAt: now,
    diaryEnabled: elements.diaryToggle.checked,
    diaryRange: Number(elements.range.value || 7),
    messages: [],
  };
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
  localStorage.setItem(activeConversationKey, activeConversationId);
}

function saveConversation() {
  const conversation = activeConversation();
  if (!conversation) return;
  conversation.messages = messages.slice(-40).map((message) => ({ ...message }));
  conversation.updatedAt = new Date().toISOString();
  conversation.diaryEnabled = elements.diaryToggle.checked;
  conversation.diaryRange = Number(elements.range.value || 7);
  conversations.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  conversations = conversations.slice(0, 50);
  localStorage.setItem(conversationsKey, JSON.stringify(conversations));
  localStorage.setItem(activeConversationKey, conversation.id);
  renderHistory();
}

function conversationTitle(message) {
  const clean = String(message || "New conversation").replace(/\s+/g, " ").trim();
  if (clean.length <= 46) return clean || "New conversation";
  return `${clean.slice(0, 43).trim()}…`;
}

function applyTheme() {
  document.body.dataset.theme = (state.user?.theme || state.theme) === "dark" ? "dark" : "light";
}

function hydrateProfile() {
  elements.profileSummary.textContent = state.user?.name || "Your plan";
  elements.profileMeta.textContent = state.user
    ? `${formatNumber(state.user.weightKg)} kg · ${formatNumber(state.user.heightCm)} cm`
    : "Goal";
}

function hydratePreferences() {
  elements.diaryToggle.checked = localStorage.getItem(diaryPreferenceKey) !== "false";
  const savedRange = Number(localStorage.getItem(rangePreferenceKey) || 7);
  elements.range.value = [7, 30].includes(savedRange) ? String(savedRange) : "7";
  elements.range.disabled = !elements.diaryToggle.checked;
}

function renderConversation() {
  elements.messages.replaceChildren();
  elements.empty.hidden = messages.length > 0;
  elements.clear.disabled = isSending || (messages.length === 0 && !transientError);

  messages.forEach((message) => elements.messages.appendChild(createMessage(message)));
  if (transientError) {
    elements.messages.appendChild(createMessage({ role: "assistant", content: transientError, error: true }));
  }

  requestAnimationFrame(() => {
    const conversation = document.querySelector(".assistant-conversation");
    if (messages.length || transientError) conversation.scrollTop = conversation.scrollHeight;
  });
}

function renderHistory() {
  elements.historyList.replaceChildren();
  elements.historyOpen.textContent = conversations.length
    ? `Conversations · ${conversations.length}`
    : "Conversations";
  elements.historyDeleteAll.disabled = conversations.length === 0;

  if (!conversations.length) {
    const empty = document.createElement("div");
    empty.className = "assistant-history-empty";
    empty.innerHTML = "<strong>No saved conversations</strong><p>Your first question will appear here automatically.</p>";
    elements.historyList.appendChild(empty);
    return;
  }

  conversations.forEach((conversation) => {
    const item = document.createElement("article");
    item.className = `assistant-history-item${conversation.id === activeConversationId ? " is-active" : ""}`;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "assistant-history-select";
    openButton.dataset.conversationId = conversation.id;
    const title = document.createElement("strong");
    title.textContent = conversation.title;
    const meta = document.createElement("span");
    const context = conversation.diaryEnabled ? `${conversation.diaryRange}-day diary` : "No diary";
    meta.textContent = `${formatConversationDate(conversation.updatedAt)} · ${context}`;
    openButton.append(title, meta);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "assistant-history-delete";
    deleteButton.dataset.deleteConversationId = conversation.id;
    deleteButton.setAttribute("aria-label", `Delete ${conversation.title}`);
    deleteButton.textContent = "×";
    item.append(openButton, deleteButton);
    elements.historyList.appendChild(item);
  });
}

function formatConversationDate(value) {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return isToday
    ? `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function setHistoryOpen(isOpen) {
  elements.history.hidden = !isOpen;
  elements.historyBackdrop.hidden = !isOpen;
  elements.historyOpen.setAttribute("aria-expanded", String(isOpen));
  document.body.classList.toggle("has-assistant-history-open", isOpen);
  if (isOpen) renderHistory();
}

function openConversation(conversationId) {
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation || isSending) return;
  activeConversationId = conversation.id;
  messages = conversation.messages.map((message) => ({ ...message }));
  transientError = "";
  localStorage.setItem(activeConversationKey, activeConversationId);
  renderConversation();
  renderHistory();
  setHistoryOpen(false);
}

function deleteConversation(conversationId) {
  if (isSending) return;
  const conversationToDelete = conversations.find((conversation) => conversation.id === conversationId);
  if (!conversationToDelete) return;
  if (!window.confirm(`Delete “${conversationToDelete.title}” from this device?`)) return;
  const wasActive = conversationId === activeConversationId;
  conversations = conversations.filter((conversation) => conversation.id !== conversationId);
  localStorage.setItem(conversationsKey, JSON.stringify(conversations));

  if (wasActive) {
    activeConversationId = conversations[0]?.id || null;
    messages = activeConversation()?.messages.map((message) => ({ ...message })) || [];
    transientError = "";
    if (activeConversationId) localStorage.setItem(activeConversationKey, activeConversationId);
    else localStorage.removeItem(activeConversationKey);
    renderConversation();
  }
  renderHistory();
}

function deleteAllConversations() {
  if (!conversations.length || isSending) return;
  if (!window.confirm("Delete all AI assistant conversations from this device?")) return;
  conversations = [];
  activeConversationId = null;
  messages = [];
  transientError = "";
  localStorage.removeItem(conversationsKey);
  localStorage.removeItem(activeConversationKey);
  localStorage.removeItem(legacyConversationKey);
  renderConversation();
  renderHistory();
  setHistoryOpen(false);
}

function createMessage(message) {
  const article = document.createElement("article");
  article.className = `assistant-message is-${message.role}${message.error ? " is-error" : ""}`;

  const label = document.createElement("span");
  label.textContent = message.role === "assistant" ? "Assistant" : "You";
  const content = document.createElement("p");
  content.textContent = message.content;
  article.append(label, content);
  return article;
}

async function sendMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  if (!message || isSending) return;

  const history = messages.slice(-16).map(({ role, content }) => ({ role, content }));
  ensureActiveConversation(message);
  messages.push({ role: "user", content: message, createdAt: new Date().toISOString() });
  transientError = "";
  saveConversation();
  setSending(true);
  elements.input.value = "";
  resizeComposer();
  renderConversation();

  try {
    const response = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history,
        appContext: buildAppContext(),
        safetyIdentifier: getSafetyIdentifier(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The assistant could not respond.");

    messages.push({ role: "assistant", content: String(data.message || "").trim(), createdAt: new Date().toISOString() });
    saveConversation();
  } catch (error) {
    transientError = `${error.message || "The assistant could not respond."} Your message is still saved — try sending it again.`;
  } finally {
    setSending(false);
    renderConversation();
    if (!isMobileSidebar()) elements.input.focus();
  }
}

function buildAppContext() {
  if (!elements.diaryToggle.checked) return { diaryEnabled: false };

  const rangeDays = Number(elements.range.value || 7);
  const days = [];
  for (let offset = rangeDays - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const dateKey = localDateKey(date);
    const day = state.days?.[dateKey] || { foods: [] };
    days.push({
      date: dateKey,
      foods: (day.foods || []).map((food) => ({
        name: food.name,
        meal: food.meal,
        amount: food.amount,
        unit: food.unit,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
      })),
    });
  }

  return {
    diaryEnabled: true,
    rangeDays,
    profile: {
      goal: state.user?.goalType || "",
      weightKg: state.user?.weightKg || 0,
      goals: state.goals,
    },
    days,
  };
}

function updateContextNote() {
  elements.range.disabled = !elements.diaryToggle.checked;
  if (!elements.diaryToggle.checked) {
    elements.contextNote.textContent = "Diary access is off. The assistant will only use what you write in the chat.";
    return;
  }

  const context = buildAppContext();
  const foodCount = context.days.reduce((sum, day) => sum + day.foods.length, 0);
  elements.contextNote.textContent = foodCount
    ? `${foodCount} logged ${foodCount === 1 ? "food" : "foods"} from the last ${context.rangeDays} days can be included.`
    : `No foods are logged in the last ${context.rangeDays} days yet.`;
}

function startNewConversation() {
  if (isSending) return;
  activeConversationId = null;
  messages = [];
  transientError = "";
  localStorage.removeItem(activeConversationKey);
  renderConversation();
  renderHistory();
  setHistoryOpen(false);
}

function resetForContextChange() {
  if (messages.length) startNewConversation();
  updateContextNote();
}

function setSending(sending) {
  isSending = sending;
  elements.send.disabled = sending;
  elements.input.disabled = sending;
  elements.clear.disabled = sending || messages.length === 0;
  elements.historyOpen.disabled = sending;
  elements.typing.hidden = !sending;
  elements.form.classList.toggle("is-sending", sending);
}

function resizeComposer() {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(132, elements.input.scrollHeight)}px`;
}

function getSafetyIdentifier() {
  let identifier = localStorage.getItem(safetyIdentifierKey);
  if (!identifier) {
    identifier = crypto.randomUUID();
    localStorage.setItem(safetyIdentifierKey, identifier);
  }
  return identifier;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function isMobileSidebar() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function setMobileSidebarOpen(isOpen) {
  elements.appShell.classList.toggle("mobile-sidebar-open", isOpen);
  elements.mobileMenuButton?.setAttribute("aria-expanded", String(isOpen));
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(elements.input.value);
});

elements.input.addEventListener("input", resizeComposer);
elements.input.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  elements.form.requestSubmit();
});

elements.starters.forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.assistantPrompt));
});

elements.clear.addEventListener("click", startNewConversation);
elements.historyOpen.addEventListener("click", () => setHistoryOpen(true));
elements.historyClose.addEventListener("click", () => setHistoryOpen(false));
elements.historyBackdrop.addEventListener("click", () => setHistoryOpen(false));
elements.historyList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-conversation-id]");
  if (deleteButton) {
    deleteConversation(deleteButton.dataset.deleteConversationId);
    return;
  }
  const openButton = event.target.closest("[data-conversation-id]");
  if (openButton) openConversation(openButton.dataset.conversationId);
});
elements.historyDeleteAll.addEventListener("click", deleteAllConversations);
elements.diaryToggle.addEventListener("change", () => {
  localStorage.setItem(diaryPreferenceKey, String(elements.diaryToggle.checked));
  resetForContextChange();
});
elements.range.addEventListener("change", () => {
  localStorage.setItem(rangePreferenceKey, elements.range.value);
  resetForContextChange();
});

elements.sidebarToggle.addEventListener("click", () => {
  if (isMobileSidebar()) {
    setMobileSidebarOpen(false);
    return;
  }
  elements.appShell.classList.toggle("sidebar-collapsed");
  localStorage.setItem("calorie-counter-sidebar-collapsed", String(elements.appShell.classList.contains("sidebar-collapsed")));
});
elements.mobileMenuButton?.addEventListener("click", () => setMobileSidebarOpen(true));
elements.sidebarBackdrop?.addEventListener("click", () => setMobileSidebarOpen(false));
elements.appShell.querySelectorAll(".side-nav a").forEach((link) => link.addEventListener("click", () => setMobileSidebarOpen(false)));
window.addEventListener("resize", () => {
  if (!isMobileSidebar()) setMobileSidebarOpen(false);
});

elements.logoutButton.addEventListener("click", () => {
  if (!window.confirm("Are you sure you want to log out?")) return;
  state.user = null;
  localStorage.setItem(storageKey, JSON.stringify(state));
  localStorage.removeItem(conversationsKey);
  localStorage.removeItem(activeConversationKey);
  localStorage.removeItem(legacyConversationKey);
  window.location.href = "profile.html";
});

if (localStorage.getItem("calorie-counter-sidebar-collapsed") === "true") {
  elements.appShell.classList.add("sidebar-collapsed");
}
