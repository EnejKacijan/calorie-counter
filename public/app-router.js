import { createPageScope } from "./page-lifecycle.js?v=3";
import { mountAppearance } from "./appearance.js?v=1";
import { presentOnboardingCompletion } from "./onboarding-completion.js?v=1";
import { storage, mountPrivacy, consentFetch } from "./privacy-controls.js?v=7";
import { mountAccessibility } from "./pwa.js?v=10";
import "./meal-schedule.js?v=1";
import "./food-persistence.js?v=3";
import "./food-reuse.js?v=5";
import "./scanned-food.js?v=5";
import { animateRouteContent } from "./motion.js?v=7";
import { focusRouteHeading } from "./route-focus.js?v=1";
import { mountNavigationPress } from "./bottom-navigation.js?v=2";
import { mountTouchFeedback } from './touch-feedback.js?v=2';

const routes = {
  "/index.html": () => import("./app.js?v=91"),
  "/assistant.html": () => import("./assistant.js?v=22"),
  "/progress.html": () => import("./progress.js?v=17"),
  "/profile.html": () => import("./profile.js?v=23"),
};
// Netlify's Pretty URLs rewrite the links in deployed HTML to extensionless
// paths. Keep those URLs and the local .html URLs on the same route/module.
const routeAliases = new Map([
  ["/", "/index.html"], ["/index", "/index.html"],
  ["/assistant", "/assistant.html"],
  ["/progress", "/progress.html"],
  ["/profile", "/profile.html"],
]);
const routePath = url => routeAliases.get(url.pathname) || url.pathname;
function adultRoute(url) {
  try {
    const user = JSON.parse(storage.getItem("calorie-counter-state") || "null")?.user;
    if ((!user || !Number.isFinite(Number(user.age)) || Number(user.age) < 18) && routes[routePath(url)]) { url.pathname = "/profile.html"; url.hash = ""; }
  } catch { /* The storage recovery banner preserves corrupt data. */ }
  return url;
}
const templates = new Map();
const prepared = new Map();
const scrollPositions = new Map();
const viewStates = new Map();
const nav = document.querySelector(".mobile-tabbar");
const clearNavigationPress = mountNavigationPress(nav);
mountTouchFeedback(window);
const shell = document.querySelector(".app-shell");
let current = new URL(location.href);
let scope;
let sequence = 0;
let assistantDraft = "";
let historyIndex = Number(history.state?.intakeIndex || 0);
let restoringPop = false;
history.replaceState({ ...history.state, intakeIndex: historyIndex }, "");
history.scrollRestoration = "manual";

function templateFrom(doc) {
  const body = doc.body.cloneNode(true);
  body.querySelectorAll("script").forEach(script => script.remove());
  body.removeAttribute("data-app-loading");
  body.querySelector("#appStartupStatus")?.remove();
  body.querySelectorAll("[data-startup-surface]").forEach(surface => {
    surface.removeAttribute("data-startup-surface");
    surface.removeAttribute("inert");
    surface.removeAttribute("aria-busy");
  });
  return { body, title: doc.title, styles: [...doc.querySelectorAll('link[rel="stylesheet"]')].map(link => link.getAttribute("href")) };
}
templates.set(routePath(current), templateFrom(document));

async function prepare(path) {
  if (prepared.has(path)) return prepared.get(path);
  const promise = (async () => {
    const [module] = await Promise.all([routes[path](), (async () => {
      if (templates.has(path)) return;
      const response = await fetch(path);
      if (!response.ok) throw Error("Screen could not be loaded");
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      if (!doc.querySelector(".app-shell") || !doc.querySelector(".mobile-tabbar")) throw Error("Invalid screen");
      templates.set(path, templateFrom(doc));
    })()]);
    const template = templates.get(path);
    await Promise.all(template.styles.map(href => {
      const url = new URL(href, location.href).href;
      if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === url)) return;
      return new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet"; link.href = url;
        link.onload = resolve; link.onerror = () => { link.remove(); reject(Error("Styles could not be loaded")); };
        document.head.appendChild(link);
      });
    }));
    return { module, template };
  })();
  prepared.set(path, promise);
  promise.catch(() => prepared.delete(path));
  return promise;
}

function mount(module) {
  scope = createPageScope();
  // Mount runs synchronously; enable programmatic initial focus in the same
  // task that binds handlers, before any user event can be delivered.
  shell.inert = false;
  nav.inert = false;
  mountAccessibility(scope);
  const path = routePath(current);
  if (!viewStates.has(path)) viewStates.set(path, {});
  module.mountPage({ ...scope, viewState: viewStates.get(path), localStorage: storage, fetch: (input, options) => consentFetch(scope.fetch, input, options) });
  mountPrivacy(scope);
  mountAppearance(scope, storage);
  window.IntakeStartup?.complete();
  const input = document.querySelector("#assistantInput");
  if (input && assistantDraft) { input.value = assistantDraft; input.dispatchEvent(new Event("input", { bubbles: true })); }
}

function replaceScreen(template) {
  const body = template.body.cloneNode(true);
  const nextNav = body.querySelector(".mobile-tabbar");
  const nextShell = body.querySelector(".app-shell");
  // Keep the actual shell and footer nodes alive. Only their screen content
  // and selected-tab attributes change; no document navigation takes place.
  for (const attribute of [...document.body.attributes]) document.body.removeAttribute(attribute.name);
  for (const attribute of body.attributes) document.body.setAttribute(attribute.name, attribute.value);
  for (const attribute of [...shell.attributes]) shell.removeAttribute(attribute.name);
  for (const attribute of nextShell.attributes) shell.setAttribute(attribute.name, attribute.value);
  shell.replaceChildren(...nextShell.childNodes);
  nextShell.replaceWith(shell);
  nav.className = nextNav.className;
  nav.inert = false;
  nav.removeAttribute("aria-hidden");
  // Keep the links/icons and full-column hit targets stationary across routes.
  const selected = nextNav.querySelector('a.is-active')?.getAttribute('href');
  const selectedPath = selected && routePath(new URL(selected, location.href));
  for (const link of nav.querySelectorAll('a[href]')) {
    const active = selectedPath && routePath(new URL(link.href)) === selectedPath;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  nextNav.replaceWith(nav);
  document.body.replaceChildren(...body.childNodes);
  document.title = template.title;
}

export async function navigate(value, { pop = false, index = historyIndex, onboardingComplete = false } = {}) {
  const url = adultRoute(new URL(value, location.href));
  const path = routePath(url);
  if (url.origin !== location.origin || !routes[path]) { location.assign(url.href); return; }
  if (!pop && (url.href === location.href || (path === routePath(current) && url.search === current.search && url.hash === current.hash))) {
    if(path==='/profile.html'&&document.querySelector('#profileSettings')?.dataset.profileView==='summary')window.scrollTo({top:0,behavior:'instant'});
    sequence++; return;
  }
  if (scope && !scope.canLeave({pop,to:path})) {
    if (pop) { restoringPop = true; history.go(historyIndex - index); }
    return;
  }
  const ticket = ++sequence;
  try {
    const { module, template } = await prepare(path);
    if (ticket !== sequence) return;
    const completing = onboardingComplete && path === "/index.html" && document.body.classList.contains("first-run-onboarding");
    const commit = () => {
    const from = routePath(current);
    scrollPositions.set(routePath(current), window.scrollY);
    const input = document.querySelector("#assistantInput");
    if (input) assistantDraft = input.value;
    scope?.dispose();
    clearNavigationPress();
    window.IntakeMotion?.stopAll?.();
    // The four routed screens are peer bottom-nav destinations, not a Back
    // hierarchy. Nested surfaces own their separate same-URL pushState entry.
    if (!pop) history.replaceState({ intakeIndex: historyIndex }, "", url);
    else historyIndex = index;
    current = url;
    replaceScreen(template);
    mount(module);
    window.IntakeMotion?.selection(nav.querySelectorAll('a[href]'), 'navigation');
    if (path !== "/profile.html" || document.querySelector('#profileSettings')?.dataset.profileView==='summary') {
      window.scrollTo({ top: path==='/profile.html' ? 0 : scrollPositions.get(path) || 0, behavior: "instant" });
      focusRouteHeading(document);
    }
    document.dispatchEvent(new CustomEvent("intake:navigated", { detail: { path } }));
    if (!completing) animateRouteContent(document, from, path);
    };
    if (completing) await presentOnboardingCompletion(commit);
    else commit();
  } catch (error) {
    if (ticket !== sequence) return;
    console.error("In-app navigation failed", error);
    // Keep a working normal-navigation fallback for offline cache misses or
    // a partially deployed build instead of leaving a blank screen.
    location.assign(url.href);
  }
}

document.addEventListener("click", event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest("a[href]");
  if (!link || link.download || (link.target && link.target !== "_self")) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || !routes[routePath(url)]) return;
  // Keep in-page anchors under the existing screen's own control.
  if (url.pathname === location.pathname && url.hash && !link.closest(".mobile-tabbar,.side-nav")) return;
  event.preventDefault();
  void navigate(url.href);
});
window.addEventListener("popstate", event => {
  if (restoringPop) { restoringPop = false; current = new URL(location.href); return; }
  const index = Number(event.state?.intakeIndex || 0);
  if (index === historyIndex && location.href === current.href) return;
  void navigate(location.href, { pop: true, index });
});

window.IntakeNavigate = navigate;
window.IntakeResetSession = () => { assistantDraft = ""; scrollPositions.clear(); viewStates.clear(); };
// Resolve the first screen before mounting/presenting any page. A clean
// start_url=index.html must never mount Today's placeholder dashboard.
const initialUrl = adultRoute(new URL(current));
const initial = await prepare(routePath(initialUrl));
if (initialUrl.href !== current.href) {
  current = initialUrl;
  history.replaceState({ ...history.state, intakeIndex: historyIndex }, "", current);
  replaceScreen(initial.template);
}
mount(initial.module);
window.IntakeMotion?.selection(nav.querySelectorAll('a[href]'), 'navigation');
// Warm all four views once. Subsequent switches reuse their templates and
// imported code while each screen reads the latest shared diary/profile state.
setTimeout(() => Object.keys(routes).forEach(path => { void prepare(path).catch(() => {}); }), 0);
if (location.protocol !== "capacitor:" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(registration => {
    const offerWaitingUpdate = () => {
      if (!navigator.serviceWorker.controller || !registration.waiting || document.querySelector("#appUpdateNotice")) return;
      const notice = document.createElement("aside"); notice.id = "appUpdateNotice"; notice.className = "app-update-notice"; notice.setAttribute("role", "status");
      const message = document.createElement("span"); message.textContent = "An app update is ready.";
      const reload = document.createElement("button"); reload.textContent = "Reload";
      reload.onclick = () => {
        if (storage.status) { window.alert("Export a recovery copy and resolve the storage warning before reloading."); return; }
        if (window.confirm("Reload to update? Saved diary data stays on this device. Finish or copy any unsaved text first.")) {
          navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
          registration.waiting?.postMessage({ type: "ACTIVATE_UPDATE" });
        }
      };
      const later = document.createElement("button"); later.textContent = "Later"; later.onclick = () => notice.remove();
      notice.append(message, reload, later); document.body.append(notice);
    };
    offerWaitingUpdate();
    registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", event => {
        if (event.target.state === "installed") offerWaitingUpdate();
      });
    });
  }).catch(() => {});
}
