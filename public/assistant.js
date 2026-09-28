import { lockSurfaceScroll, createSheetSurface } from "./mobile-surface.js?v=3";
import { bindSemanticBack } from "./semantic-back.js?v=3";
import {animateNestedPage,nestedFrames} from './nested-page.js?v=1';
import { localRecordId } from "./local-record-id.js?v=1";
import { createDiaryContextFocus } from './diary-context-focus.js?v=2';
import { createAssistantScroll } from './assistant-scroll.js?v=1';
import {createAssistantMessageActions} from './assistant-message-actions.js?v=1';
export {requestAssistantCopy} from './assistant-message-actions.js?v=1';
// Presentation-only scroll positions, scoped to this browser window/app session.
const conversationScrolls = new Map();
// Copy feedback is presentation state only. Message objects are deliberately
// not given enumerable IDs: the persisted conversation format stays unchanged.
const messageIdentities = new WeakMap();
let nextMessageIdentity = 0;
export function assistantMessageIdentity(message) {
  if (!message || typeof message !== "object") return "";
  let identity = messageIdentities.get(message);
  if (!identity) {
    identity = `assistant-message-${++nextMessageIdentity}`;
    messageIdentities.set(message, identity);
  }
  return identity;
}


export function assistantContextLabel(enabled, range) {
  return enabled ? `Diary · ${Number(range || 7)} days` : "Diary off";
}
export function assistantKeyboardOpen({ visualHeight, layoutHeight, scale, editing, wasOpen }) {
  return scale === 1 && (editing || wasOpen) && visualHeight < layoutHeight - 120;
}
export function assistantHistoryFrames(opening, start = "translateX(0px)") {
  return nestedFrames(opening,start);
}
export function mountPage({ localStorage, window, document, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, MutationObserver, fetch, onDispose }) {
const storageKey = "calorie-counter-state";
const legacyConversationKey = "calorie-counter-assistant-conversation-v1";
const conversationsKey = "calorie-counter-assistant-conversations-v1";
const activeConversationKey = "calorie-counter-assistant-active-conversation-v1";
const activeConversationSessionKey = "calorie-counter-assistant-active-conversation-session-v1";
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
  clear: document.querySelector("#assistantClear"),
  historyOpen: document.querySelector("#assistantHistoryOpen"),
  history: document.querySelector("#assistantHistory"),
  historyClose: document.querySelector("#assistantHistoryClose"),
  historyNew: document.querySelector("#assistantHistoryNew"),
  historyList: document.querySelector("#assistantHistoryList"),
  historyDeleteAll: document.querySelector("#assistantHistoryDeleteAll"),
  diaryToggle: document.querySelector("#assistantDiaryToggle"),
  diaryState: document.querySelector("#assistantDiaryState"),
  range: document.querySelector("#assistantRange"),
  contextNote: document.querySelector("#assistantContextNote"),
  contextBar: document.querySelector("#assistantContextBar"),
  contextDisclosure: document.querySelector("#assistantContextDisclosure"),
  contextSummary: document.querySelector("#assistantContextSummary"),
  contextControls: document.querySelector("#assistantContextControls"),
  contextClose: document.querySelector("#assistantContextClose"),
  contextDone: document.querySelector("#assistantContextDone"),
  empty: document.querySelector("#assistantEmpty"),
  messages: document.querySelector("#assistantMessages"),
  typing: document.querySelector("#assistantTyping"),
  sendStatus: document.querySelector("#assistantSendStatus"),
  copyStatus: document.querySelector("#assistantCopyStatus"),
  textSelection: document.querySelector("#assistantTextSelection"),
  textSelectionBack: document.querySelector("#assistantTextSelectionBack"),
  textSelectionClose: document.querySelector("#assistantTextSelectionClose"),
  textSelectionBody: document.querySelector("#assistantTextSelectionBody"),
  messageActions: document.querySelector("#assistantMessageActions"),
  form: document.querySelector("#assistantForm"),
  input: document.querySelector("#assistantInput"),
  send: document.querySelector("#assistantSend"),
  jump: document.querySelector("#assistantJumpLatest"),
  starters: Array.from(document.querySelectorAll("[data-assistant-prompt]")),
};

let conversations = loadConversations();
let activeConversationId = loadActiveConversationId();
// Older versions stored the active selection persistently. Keep the conversations,
// but discard that selection so a new app session always starts empty.
localStorage.removeItem(activeConversationKey);
let messages = activeConversation()?.messages.map((message) => ({ ...message })) || [];
let transientError = "";
let isSending = false;
let contextExpanded = false;
let renderedConversationId, surface, surfaceIntent = 0, surfaceUnwind, disposed = false;
const conversationRegion = document.querySelector(".assistant-conversation");
const chatScroll = createAssistantScroll({ region: conversationRegion, messages: elements.messages,
  pending: elements.typing, jump: elements.jump, window, requestAnimationFrame, cancelAnimationFrame, ResizeObserver });
const diaryContextFocus = createDiaryContextFocus({ root: elements.appShell, panel: elements.contextControls,
  getTrigger: () => elements.appShell.querySelector('#assistantContextDisclosure') });
const messageActions = createAssistantMessageActions({window, messages:elements.messages, region:conversationRegion,
  panel:elements.messageActions, selection:elements.textSelection, status:elements.copyStatus, chatScroll,
  resolve:(conversationId,messageId)=>!disposed && conversationId===String(activeConversationId||'') && renderedConversationId===activeConversationId
    ? messages.find(message=>assistantMessageIdentity(message)===messageId) : null,
  openSurface:openAssistantSurface, closeSurface:closeAssistantSurface});
onDispose?.(() => {
  disposed = true; surfaceIntent++;
  messageActions.dispose();
  conversationScrolls.set(activeConversationId, chatScroll.snapshot());
  chatScroll.dispose();
  if (surface) closeAssistantSurface(surface.panel, { fromHistory: true, restoreFocus: false, immediate: true });
  diaryContextFocus.dispose();
});

applyTheme();
hydrateProfile();
hydratePreferences();
restoreTurnComposer();
renderConversation();
renderHistory();
updateContextNote();
syncContextDisclosure();
bindComposerViewport();

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
  }

  const legacyMessages = loadLegacyMessages();
  if (!legacyMessages.length) return [];

  const now = legacyMessages.at(-1)?.createdAt || new Date().toISOString();
  const migrated = {
    id: localRecordId(),
    title: conversationTitle(legacyMessages.find((message) => message.role === "user")?.content),
    createdAt: legacyMessages[0]?.createdAt || now,
    updatedAt: now,
    diaryEnabled: localStorage.getItem(diaryPreferenceKey) !== "false",
    diaryRange: Number(localStorage.getItem(rangePreferenceKey) || 7),
    messages: legacyMessages,
  };
  localStorage.setItem(conversationsKey, JSON.stringify([migrated]));
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
    id: String(conversation.id || localRecordId()),
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
  try {
    const storedId = sessionStorage.getItem(activeConversationSessionKey);
    return conversations.some((conversation) => conversation.id === storedId) ? storedId : null;
  } catch {
    return null;
  }
}

function setActiveConversationId(conversationId) {
  activeConversationId = conversationId;
  try {
    if (conversationId) sessionStorage.setItem(activeConversationSessionKey, conversationId);
    else sessionStorage.removeItem(activeConversationSessionKey);
  } catch {
    // Without session storage, fall back to an empty Assistant view on navigation.
  }
}

function activeConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId) || null;
}

function ensureActiveConversation(firstMessage) {
  if (activeConversation()) return;
  const now = new Date().toISOString();
  const conversation = {
    id: localRecordId(),
    title: conversationTitle(firstMessage),
    createdAt: now,
    updatedAt: now,
    diaryEnabled: elements.diaryToggle.checked,
    diaryRange: Number(elements.range.value || 7),
    messages: [],
  };
  conversations.unshift(conversation);
  setActiveConversationId(conversation.id);
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
  renderHistory();
}

function conversationTitle(message) {
  const clean = String(message || "New conversation").replace(/\s+/g, " ").trim();
  if (clean.length <= 46) return clean || "New conversation";
  return `${clean.slice(0, 43).trim()}…`;
}

function applyTheme() {
  const isDark = (state.user?.theme || state.theme) === "dark";
  const chromeColor = isDark ? "#1b1a16" : "#fbfaf6";
  document.body.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.style.backgroundColor = chromeColor;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", chromeColor);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", isDark ? "black-translucent" : "default");
}

function hydrateProfile() {
  elements.profileSummary.textContent = state.user?.name || "Your Plan";
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
  const changed = renderedConversationId !== activeConversationId;
  const initial = renderedConversationId === undefined;
  if (changed && renderedConversationId !== undefined) messageActions.reset();
  const fromEmpty = !elements.empty.hidden && messages.length > 0;
  const toEmpty = elements.empty.hidden && messages.length === 0;
  // New removes its own button. Keep focus on the named page, not a vanished
  // action or the composer. A nested surface restores its own opener on Back.
  if (toEmpty && !surface) document.querySelector("#assistantTitle").focus({ preventScroll: true });
  renderedConversationId = activeConversationId;
  document.body.classList.toggle("assistant-has-messages", messages.length > 0 || Boolean(transientError));
  elements.empty.hidden = messages.length > 0;
  elements.clear.hidden = messages.length === 0 && !transientError;
  elements.historyNew.hidden = elements.clear.hidden;
  elements.clear.disabled = isSending || (messages.length === 0 && !transientError);
  // Keep unchanged live-region nodes in place: old replies should not be
  // re-announced (or re-animated) whenever a request starts or fails.
  messages.forEach((message, index) => {
    const failed = !isSending && index === messages.length - 1 && message.role === "user";
    const messageId = assistantMessageIdentity(message);
    const signature = JSON.stringify([activeConversationId, messageId, message.role, message.content, failed, failed ? transientError : ""]);
    const existing = elements.messages.children[index];
    if (existing?.dataset.signature === signature) return;
    if (existing?.dataset.messageId === messageId && existing.dataset.conversationId === String(activeConversationId || "")
        && existing.querySelector(':scope > p')?.textContent === message.content) {
      // A request finishing only changes its recovery chrome. Retain the actual
      // text node (and native selection), focus and copy action in place.
      existing.classList.toggle('is-failed', failed);
      const recovery = existing.querySelector('.assistant-failed-turn');
      if (failed) {
        const next = createFailedTurn();
        if (recovery) recovery.replaceWith(next); else existing.appendChild(next);
      } else recovery?.remove();
      existing.dataset.signature = signature;
      return;
    }
    const article = createMessage(message, failed, activeConversationId);
    article.dataset.signature = signature;
    if (existing) existing.replaceWith(article);
    else elements.messages.appendChild(article);
  });
  while (elements.messages.children.length > messages.length) elements.messages.lastElementChild.remove();

  if (fromEmpty) window.IntakeMotion?.reveal(elements.messages, { duration: 160, distance: 4 });
  if (toEmpty) window.IntakeMotion?.reveal(elements.empty, { duration: 160, distance: 4 });
  // Tab return restores reading intent/anchor; choosing another History entry
  // deliberately opens latest. Merely closing History does not render/reset.
  if (initial) chatScroll.restore(conversationScrolls.get(activeConversationId));
  else if (changed) chatScroll.latest();
  chatScroll.changed();
}

function renderHistory() {
  const focusedRow = elements.history.open && elements.historyList.contains(document.activeElement)
    ? [...elements.historyList.children].indexOf(document.activeElement.closest(".assistant-history-item")) : -1;
  elements.historyList.replaceChildren();
  elements.historyOpen.textContent = "History";
  elements.historyOpen.setAttribute("aria-label", conversations.length ? `History, ${conversations.length} conversations` : "History");
  elements.historyDeleteAll.disabled = conversations.length === 0;
  elements.historyDeleteAll.hidden = conversations.length === 0;
  elements.historyNew.hidden = messages.length === 0;
  elements.historyNew.disabled = isSending;

  if (!conversations.length) {
    const empty = document.createElement("div");
    empty.className = "assistant-history-empty";
    empty.innerHTML = "<strong>No saved conversations yet.</strong><p>Your first conversation will appear here.</p>";
    elements.historyList.appendChild(empty);
    if (focusedRow >= 0) elements.historyClose.focus({ preventScroll: true });
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
    meta.className = "assistant-history-meta";
    const date = document.createElement("span");
    date.className = "assistant-history-date";
    date.textContent = formatConversationDate(conversation.updatedAt);
    const contextBadge = document.createElement("span");
    contextBadge.className = "assistant-history-context";
    contextBadge.textContent = "Current";
    if (conversation.id === activeConversationId) openButton.setAttribute("aria-current", "true");
    const preview = document.createElement("p");
    preview.className = "assistant-history-preview";
    preview.textContent = (conversation.messages.at(-1)?.content || "").replace(/\s+/g, " ").slice(0, 120);
    openButton.append(title, preview, meta);
    meta.append(date);
    if (conversation.id === activeConversationId) meta.append(contextBadge);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "assistant-history-delete";
    deleteButton.dataset.deleteConversationId = conversation.id;
    deleteButton.setAttribute("aria-label", `Delete ${conversation.title}`);
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M7 7l1 14h8l1-14" /></svg>';
    item.append(openButton, deleteButton);
    elements.historyList.appendChild(item);
  });
  if (focusedRow >= 0) (elements.historyList.children[Math.min(focusedRow, conversations.length - 1)]?.querySelector("button") || elements.historyClose).focus({ preventScroll: true });
}

function formatConversationDate(value) {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return isToday
    ? `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Native dialogs reuse the scanner's scroll/viewport/back ownership. Only the
// active nested Assistant surface owns a same-URL history entry.
async function openAssistantSurface(panel, trigger, isCurrent = () => true) {
  if (surface?.panel === panel && !surface.closing) return;
  const intent = ++surfaceIntent;
  if (surface) await closeAssistantSurface(surface.panel, { restoreFocus: false });
  if (surfaceUnwind) await surfaceUnwind;
  if (disposed || intent !== surfaceIntent || !isCurrent()) return;
  const parents = [...document.querySelectorAll('.assistant-shell > :not(dialog), #sidebar, .mobile-tabbar')];
  const sheet = panel === elements.contextControls ? createSheetSurface({
    panel, handle: panel.querySelector('.ux-sheet-handle'), scroller: panel.querySelector('.assistant-context-body'),
    background: () => parents, onDismiss: options => closeAssistantSurface(panel, options), onBack: () => closeAssistantSurface(panel),
  }) : null;
  const marker = `assistant-surface-${Date.now()}-${intent}`;
  // Capture the native history parent before presenting its child.
  window.history.pushState({ ...window.history.state, intakeAssistantSurface: marker }, "", window.location.href);
  let unlock = () => {};
  if (sheet) { diaryContextFocus.begin(); sheet.open({ returnTo: trigger }); }
  else { unlock = lockSurfaceScroll(window); panel.hidden = false; panel.showModal(); }
  const releaseBack = sheet || panel === elements.messageActions ? () => {} : bindSemanticBack(panel, () => panel.open && !surface?.closing ? panel.querySelector("header button") : null, window, {
    motionTargets: () => [elements.history,elements.textSelection].includes(panel) && window.matchMedia('(max-width:700px)').matches ? panel : null,
  });
  // Dialog modality blocks the document. Explicit sibling ownership also keeps
  // the parent out of focus/accessibility during the entire exit animation.
  const prior = sheet ? [] : parents.map(el => ({ el, inert: el.inert, hidden: el.getAttribute("aria-hidden") }));
  prior.forEach(({el}) => { el.inert = true; el.setAttribute("aria-hidden", "true"); });
  surface = { panel, trigger, marker, sheet, release: () => {
    releaseBack(); sheet?.dispose(); unlock();
    prior.forEach(({ el, inert, hidden }) => { el.inert = inert; if (hidden === null) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", hidden); });
  } };
  contextExpanded = panel === elements.contextControls;
  elements.contextDisclosure.setAttribute("aria-expanded", String(contextExpanded));
  elements.historyOpen.setAttribute("aria-expanded", String(panel === elements.history));
  if ([elements.history,elements.textSelection].includes(panel)) {
    surface.animation = animateNestedPage(panel,true,window);
  }
}

function closeAssistantSurface(panel, { fromHistory = false, restoreFocus = true, immediate = false, dragDistance = 0 } = {}) {
  if (surface?.panel !== panel) return;
  immediate ||= panel.dataset.swipeBackCommitted === 'true';
  const previous = surface;
  if (previous.closing) { if (immediate) previous.finish(); return previous.closing; }
  const diaryFocusReturn = previous.sheet ? diaryContextFocus.capture({ dragDistance }) : null;
  const start = window.getComputedStyle(panel).transform;
  previous.animation?.cancel();
  window.IntakeMotion?.stop(panel);
  let resolveClose;
  previous.closing = new Promise(resolve => { resolveClose = resolve; });
  panel.querySelector("h2").focus({ preventScroll: true });
  const controls = [...panel.querySelectorAll('button,input,select,textarea,a[href]')].map(el => ({ el, inert: el.inert }));
  controls.forEach(({ el }) => { el.inert = true; });
  panel.classList.add("is-exiting");
  let finished = false;
  previous.finish = () => {
    if (finished) return; finished = true;
    previous.animation?.cancel();
    surface = null;
    panel.close(); panel.hidden = true; panel.classList.remove("is-exiting");
    controls.forEach(({ el, inert }) => { el.inert = inert; });
    previous.release();
    messageActions.surfaceClosed(panel);
    contextExpanded = false;
    elements.contextDisclosure.setAttribute("aria-expanded", "false");
    elements.historyOpen.setAttribute("aria-expanded", "false");
    if (restoreFocus && !disposed) {
      if (previous.sheet) diaryContextFocus.restore(diaryFocusReturn);
      else if (previous.trigger?.isConnected) previous.trigger.focus({ preventScroll: true });
    }
    if (!fromHistory && !disposed && window.history.state?.intakeAssistantSurface === previous.marker) {
      surfaceUnwind = new Promise(resolve => {
        window.addEventListener("popstate", () => { surfaceUnwind = null; resolve(); }, { once: true });
        window.history.back();
      });
    }
    resolveClose();
  };
  if (previous.sheet) {
    const done = previous.sheet.close({ restoreFocus: false, immediate, dragDistance });
    if (previous.sheet.active) done.then(previous.finish); else previous.finish();
  } else if ([elements.history,elements.textSelection].includes(panel) && !immediate && !window.IntakeMotion?.reduced()) {
    previous.animation = animateNestedPage(panel,false,window,start==='none'?undefined:start);
    if(previous.animation)previous.animation.finished.then(previous.finish, previous.finish);
    else previous.finish();
  } else previous.finish();
  return previous.closing;
}

window.addEventListener("popstate", () => {
  if (surface && window.history.state?.intakeAssistantSurface !== surface.marker)
    closeAssistantSurface(surface.panel, { fromHistory: true });
});
for (const panel of [elements.history, elements.contextControls, elements.messageActions, elements.textSelection]) {
  panel.addEventListener("close", () => { if (!panel.open) closeAssistantSurface(panel); });
  if (panel === elements.contextControls) continue; // Shared sheet owns Back, trap and backdrop gesture origin.
  panel.addEventListener("cancel", event => {
    if (event.target !== panel) return;
    event.preventDefault(); closeAssistantSurface(panel);
  });
  panel.addEventListener("click", event => {
    if (event.target !== panel) return;
    const bounds = panel.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeAssistantSurface(panel);
  });
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeAssistantSurface(panel); return; }
    if (surface?.closing) { event.preventDefault(); return; }
    if (event.key !== "Tab") return;
    const targets = [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(el => el.getClientRects().length);
    const first = targets[0], last = targets.at(-1);
    if (document.activeElement === panel.querySelector("h2")) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}

function setHistoryOpen(isOpen) {
  if (isOpen) { renderHistory(); void openAssistantSurface(elements.history, elements.historyOpen); }
  else closeAssistantSurface(elements.history);
}

function openConversation(conversationId) {
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation || isSending) return;
  setActiveConversationId(conversation.id);
  messages = conversation.messages.map((message) => ({ ...message }));
  transientError = "";
  restoreTurnComposer();
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
    setActiveConversationId(null);
    messages = [];
    transientError = "";
    restoreTurnComposer();
    renderConversation();
  }
  renderHistory();
}

function deleteAllConversations() {
  if (!conversations.length || isSending) return;
  if (!window.confirm("Delete all AI assistant conversations from this device?")) return;
  conversations = [];
  setActiveConversationId(null);
  messages = [];
  transientError = "";
  restoreTurnComposer();
  localStorage.removeItem(conversationsKey);
  localStorage.removeItem(activeConversationKey);
  localStorage.removeItem(legacyConversationKey);
  renderConversation();
  renderHistory();
  setHistoryOpen(false);
}

function createMessage(message, failed = false, conversationId) {
  const article = document.createElement("article");
  article.className = `assistant-message is-${message.role}${failed ? " is-failed" : ""}`;
  const messageId = assistantMessageIdentity(message);
  article.dataset.messageId = messageId;
  article.dataset.conversationId = String(conversationId || "");

  const label = document.createElement("span");
  label.className = `assistant-attribution${message.role === "user" ? " sr-only" : ""}`;
  label.textContent = message.role === "assistant" ? "Intake" : "You";
  const content = document.createElement("p");
  content.textContent = message.content;
  if (String(message.content || '').trim()) content.dataset.messageHold = '';
  article.append(label, content);
  if (String(message.content || "").trim()) {
    article.appendChild(createMessageCopyAction(message, conversationId, messageId));
  }
  if (failed) article.appendChild(createFailedTurn());
  return article;
}

function createFailedTurn() {
    const recovery = document.createElement("div");
    recovery.className = "assistant-failed-turn";
    recovery.setAttribute("role", "group");
    recovery.setAttribute("aria-label", "Intake response failed");
    const attribution = document.createElement("span");
    attribution.className = "assistant-attribution";
    attribution.textContent = "Intake";
    const explanation = document.createElement("p");
    explanation.textContent = `${transientError || "No reply received."} Your message is saved. Edit it below or retry.`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.dataset.assistantRetry = "";
    retry.textContent = "Retry";
    recovery.append(attribution, explanation, retry);
    return recovery;
}

function createMessageCopyAction(message, conversationId, messageId) {
  const actions = document.createElement("div");
  actions.className = "assistant-message-actions";
  actions.setAttribute('aria-live', 'off');
  const menu = document.createElement("button");
  menu.type = "button";
  menu.className = "assistant-message-menu-trigger";
  menu.dataset.messageActions = "";
  menu.dataset.messageId = messageId;
  menu.dataset.conversationId = String(conversationId || "");
  menu.setAttribute('aria-haspopup','dialog');
  menu.setAttribute('aria-expanded','false');
  menu.setAttribute('aria-controls','assistantMessageActions');
  menu.setAttribute("aria-label", message.role === "assistant" ? "Actions for Assistant response" : "Actions for your message");
  menu.innerHTML = '<span aria-hidden="true">•••</span>';
  actions.appendChild(menu);
  return actions;
}


function unansweredTurn() {
  return messages.at(-1)?.role === "user" ? messages.at(-1) : null;
}

function restoreTurnComposer() {
  elements.input.value = unansweredTurn()?.content || "";
  elements.sendStatus.textContent = "";
  resizeComposer();
  updateComposerState();
}

function retryFailedMessage() {
  const turn = unansweredTurn();
  if (!turn || isSending) return;
  // The visible composer is the edited replacement, never a second turn.
  return sendMessage(elements.input.value.trim() || turn.content);
}

async function sendMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  if (!message || isSending) return;

  // A trailing user turn has no reply yet (failed or interrupted request).
  // Reuse it, including after reopening history, and keep it out of history:
  // the server receives this turn once through `message`.
  const retryTurn = unansweredTurn();
  const history = (retryTurn ? messages.slice(0, -1) : messages).slice(-16)
    .map(({ role, content }) => ({ role, content }));
  // Capture diary access for this request. Preference changes made while the
  // assistant is replying intentionally apply to the next message instead.
  const requestAppContext = buildAppContext();
  ensureActiveConversation(message);
  if (retryTurn) {
    retryTurn.content = message;
  } else {
    messages.push({ role: "user", content: message, createdAt: new Date().toISOString() });
  }
  transientError = "";
  saveConversation();
  setSending(true);
  elements.input.value = "";
  resizeComposer();
  renderConversation();

  chatScroll.latest(); // Send/Retry/starters all rejoin the same live turn.

  try {
    const response = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history,
        appContext: requestAppContext,
        safetyIdentifier: getSafetyIdentifier(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The assistant could not respond.");

    messages.push({ role: "assistant", content: String(data.message || "").trim(), createdAt: new Date().toISOString() });
    saveConversation();
  } catch (error) {
    elements.input.value = message;
    resizeComposer();
    transientError = error.message || "The assistant could not respond.";
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
  elements.diaryState.textContent = elements.diaryToggle.checked ? "On" : "Off";
  elements.contextSummary.textContent = assistantContextLabel(elements.diaryToggle.checked, elements.range.value);
  if (!elements.diaryToggle.checked) {
    elements.contextNote.textContent = "Diary access is off. The assistant will only use what you write in the chat.";
    return;
  }

  const context = buildAppContext();
  const foodCount = context.days.reduce((sum, day) => sum + day.foods.length, 0);
  elements.contextNote.textContent = foodCount
    ? `${foodCount} logged ${foodCount === 1 ? "food" : "foods"} from the last ${context.rangeDays} days will be included.`
    : `No foods are logged in the last ${context.rangeDays} days yet.`;
  elements.contextNote.textContent += " Your selected diary entries are sent only when you ask a question.";
}

function startNewConversation() {
  if (isSending) return;
  setActiveConversationId(null);
  messages = [];
  transientError = "";
  restoreTurnComposer();
  setContextDisclosure(false);
  renderConversation();
  renderHistory();
  setHistoryOpen(false);
}

function applyContextPreferenceChange() {
  updateContextNote();
}

function syncContextDisclosure() {
  elements.contextDisclosure.setAttribute("aria-expanded", String(contextExpanded));
  elements.contextControls.hidden = !contextExpanded;
}

function setContextDisclosure(isExpanded) {
  if (isExpanded) void openAssistantSurface(elements.contextControls, elements.contextDisclosure);
  else closeAssistantSurface(elements.contextControls);
}

function toggleContextDisclosure() {
  setContextDisclosure(!contextExpanded);
}

function setSending(sending) {
  isSending = sending;
  elements.starters.forEach(button => { button.disabled = sending; });
  elements.input.disabled = sending;
  elements.clear.disabled = sending || messages.length === 0;
  elements.historyNew.disabled = sending;
  elements.historyOpen.disabled = sending;
  elements.typing.hidden = !sending;
  elements.sendStatus.textContent = sending ? "Intake is thinking."
    : transientError ? "No reply received. Your message is saved. Retry is available beside your message." : "";
  elements.form.classList.toggle("is-sending", sending);
  updateComposerState();
}

function updateComposerState() {
  elements.send.disabled = isSending || !elements.input.value.trim();
}

function resizeComposer() {
  elements.input.style.height = "auto";
  elements.input.style.height = `${Math.min(132, elements.input.scrollHeight)}px`;
}

function shouldSendOnEnter(event) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.repeat) return false;
  // A phone/tablet Return key is for writing. Desktop keyboards retain Enter
  // to send and Shift+Enter for a newline; Send is available on every device.
  return !window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
}

function bindComposerViewport() {
  const viewport = window.visualViewport;
  const doc = elements.appShell.ownerDocument;
  const nav = doc.querySelector(".mobile-tabbar");
  const update = () => {
    if (!viewport || viewport.scale !== 1) return; // Do not counteract pinch zoom.
    const keyboard = assistantKeyboardOpen({ visualHeight: viewport.height, layoutHeight: doc.documentElement.clientHeight,
      scale: viewport.scale, editing: doc.activeElement === elements.input, wasOpen: doc.body.classList.contains("assistant-keyboard-open") });
    // Shared nav owns its geometry. Reserve its measured height, never move it.
    elements.appShell.style.setProperty("--assistant-nav-height", `${parseFloat(window.getComputedStyle(nav).height) || 0}px`);
    doc.body.classList.toggle("assistant-keyboard-open", keyboard);
    if (keyboard) {
      elements.appShell.style.setProperty("--assistant-viewport-height", `${viewport.height}px`);
      elements.appShell.style.setProperty("--assistant-viewport-top", `${viewport.offsetTop}px`);
    } else {
      elements.appShell.style.removeProperty("--assistant-viewport-height");
      elements.appShell.style.removeProperty("--assistant-viewport-top");
    }
    chatScroll.changed();
    messageActions.position();
  };
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  doc.addEventListener("focusin", update);
  update();
  onDispose?.(() => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    doc.removeEventListener("focusin", update);
    elements.appShell.style.removeProperty("--assistant-viewport-height");
    elements.appShell.style.removeProperty("--assistant-viewport-top");
    elements.appShell.style.removeProperty("--assistant-nav-height");
    doc.body.classList.remove("assistant-keyboard-open");
  });
}

function getSafetyIdentifier() {
  let identifier = localStorage.getItem(safetyIdentifierKey);
  if (!identifier) {
    identifier = localRecordId();
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

elements.input.addEventListener("input", () => {
  resizeComposer();
  updateComposerState();
});
elements.input.addEventListener("keydown", (event) => {
  if (!shouldSendOnEnter(event)) return;
  event.preventDefault();
  elements.form.requestSubmit();
});

elements.starters.forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.assistantPrompt));
});

elements.clear.addEventListener("click", startNewConversation);
elements.historyOpen.addEventListener("click", () => setHistoryOpen(true));
elements.historyClose.addEventListener("click", () => setHistoryOpen(false));
elements.historyNew.addEventListener("click", startNewConversation);
elements.contextClose.addEventListener("click", () => setContextDisclosure(false));
elements.contextDone.addEventListener("click", () => setContextDisclosure(false));
elements.messages.addEventListener("click", (event) => {
  if (event.target.closest("[data-assistant-retry]")) retryFailedMessage();
});
elements.textSelectionBack?.addEventListener("click", () => closeAssistantSurface(elements.textSelection));
elements.textSelectionClose?.addEventListener("click", () => closeAssistantSurface(elements.textSelection));
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
elements.contextDisclosure.addEventListener("click", toggleContextDisclosure);
elements.diaryToggle.addEventListener("change", () => {
  localStorage.setItem(diaryPreferenceKey, String(elements.diaryToggle.checked));
  applyContextPreferenceChange();
});
elements.range.addEventListener("change", () => {
  localStorage.setItem(rangePreferenceKey, elements.range.value);
  applyContextPreferenceChange();
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


if (localStorage.getItem("calorie-counter-sidebar-collapsed") === "true") {
  elements.appShell.classList.add("sidebar-collapsed");
}
}
