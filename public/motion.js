export const motionScale = Object.freeze({
  easing: "cubic-bezier(.2,.7,.2,1)",
  selection: 160, mode: 160, route: 170, add: 180, filter: 140, period: 170, detail: 120,
});

const tabOrder = ["/index.html", "/assistant.html", "/progress.html", "/profile.html"];
export function routeDirection(from, to) {
  const index = path => tabOrder.indexOf(path === "/" ? "/index.html" : path);
  return index(from) < 0 || index(to) < 0 ? 0 : Math.sign(index(to) - index(from));
}

// Explicit content targets avoid transforming a fixed FAB's containing block,
// the Assistant viewport shell, safe-area chrome, or any modal/sheet surface.
export function animateRouteContent(doc, from, to, motion = globalThis.IntakeMotion) {
  const direction = routeDirection(from, to);
  if (!direction) return;
  const selectors = {
    // The heading owns a viewport-fixed Add action. Transforming the heading
    // reparents that action into a clipped containing block until motion ends.
    // Commit the food-log heading and its fixed action without motion. Moving
    // even just the heading's text would clip its first letters at the log edge.
    // The remaining content retains the same shared route timing and travel.
    "/index.html": ".topbar-heading,.mobile-profile-chip,.calendar-panel,.dashboard,.exercise-list-heading,#foodList,#exerciseList",
    "/assistant.html": ".assistant-header,.assistant-conversation,.assistant-chat-footer",
    "/progress.html": ".topbar-heading,.progress-view-switch,.progress-view:not([hidden])",
    "/profile.html": ".topbar-heading,#profileSettingsOverview",
  };
  const targets = doc.querySelectorAll(selectors[to] || selectors["/index.html"]);
  motion?.transition(targets, "route", { direction, group: doc.querySelector(".main-content") });
}

(function attachMotion(root) {
  // Motion decorates an already committed UI state; it never delays data writes
  // or presents intermediate nutrition totals.
  function createMotion(environment = root) {
    const active = new Map();
    const groups = new Map();
    const navigationSelections = new WeakMap();
    const preference = environment.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduced = () => Boolean(preference?.matches);
    function stop(element) {
      active.get(element)?.cancel();
      active.delete(element);
    }
    function stopAll({ except = [] } = {}) {
      for (const element of active.keys()) if (!except.includes(element)) stop(element);
      groups.clear();
    }
    preference?.addEventListener?.("change", () => { if (reduced()) stopAll(); });
    environment.document?.addEventListener?.("visibilitychange", () => {
      if (environment.document.visibilityState === "hidden") stopAll();
    });
    function play(element, frames, options) {
      if (!element) return;
      stop(element);
      if (reduced() || environment.document?.visibilityState === "hidden" || !element.animate) return;
      const animation = element.animate(frames, options);
      active.set(element, animation);
      animation.onfinish = animation.oncancel = () => {
        if (active.get(element) === animation) active.delete(element);
      };
      return animation;
    }
    function transition(elements, kind = "mode", { direction = 1, group } = {}) {
      const targets = Array.from(elements || []).filter(Boolean);
      if (group) {
        groups.get(group)?.forEach(stop);
        groups.set(group, targets);
      }
      const distance = kind === "route" ? 8 * direction : kind === "period" ? 10 * direction : kind === "mode" ? 6 * direction : 0;
      const frames = [{ opacity: .72, ...(distance ? { transform: `translateX(${distance}px)` } : {}) },
        { opacity: 1, ...(distance ? { transform: "translateX(0)" } : {}) }];
      return targets.map(element => play(element, frames, { duration: motionScale[kind] || motionScale.mode, easing: motionScale.easing })).filter(Boolean);
    }
    function selection(buttons, kind = "segment", { duration = motionScale.selection } = {}) {
      const items = Array.from(buttons || []), container = items[0]?.parentElement;
      const to = items.findIndex(button => button.getAttribute("aria-selected") === "true" || button.getAttribute("aria-pressed") === "true" || button.getAttribute("aria-current") === "page");
      if (!container || to < 0) return;
      if (kind === "navigation") {
        // ARIA/route state has already committed. No travelling marker, and no
        // callback ever selects a route. First render and active re-taps are quiet.
        const from = navigationSelections.get(container);
        navigationSelections.set(container, to);
        if (from === undefined || from === to) return;
        items.forEach(item => stop(item.querySelector('.nav-icon')));
        play(items[to].querySelector('.nav-icon'), [
          { transform: 'scale(.96)', offset: 0 },
          { transform: 'scale(1.045)', offset: .55 },
          { transform: 'scale(1)', offset: 1 },
        ], { duration: 170, easing: 'cubic-bezier(.22,1,.36,1)' });
        return;
      }
      let indicator = container.querySelector(":scope > .motion-selection");
      const from = indicator ? Number(indicator.dataset.index) : null;
      if (!indicator) {
        indicator = environment.document.createElement("span");
        indicator.className = "motion-selection";
        indicator.setAttribute("aria-hidden", "true");
        container.prepend(indicator);
        container.dataset.motionSelection = kind;
      }
      indicator.style.width = `${100 / items.length}%`;
      const transform = index => `translateX(${index * 100}%)`;
      // Read the current presentation before committing the destination style.
      // A just-finished animation may still await its finish callback; reading
      // afterward would sample the new style and erase the next travel.
      const current = active.has(indicator) ? environment.getComputedStyle?.(indicator).transform : null;
      // The final position and semantic state do not depend on a callback.
      indicator.style.transform = transform(to);
      indicator.dataset.index = String(to);
      if (from === null || from === to) return;
      play(indicator, [{ transform: current || transform(from) }, { transform: transform(to) }],
        { duration, easing: motionScale.easing });
    }
    function reveal(element, { duration = 180, distance = 0 } = {}) {
      const frames = distance
        ? [{ opacity: 0.65, transform: `translateY(${distance}px)` }, { opacity: 1, transform: "translateY(0)" }]
        : [{ opacity: 0.65 }, { opacity: 1 }];
      play(element, frames, { duration, easing: "cubic-bezier(.2,.7,.2,1)" });
    }
    function growBars(elements, baseline) {
      if (!Number.isFinite(baseline)) return;
      Array.from(elements).forEach((element, index) => {
        play(element, [
          { transformOrigin: "0 0", transformBox: "view-box", transform: `translateY(${baseline}px) scaleY(0) translateY(${-baseline}px)` },
          { transformOrigin: "0 0", transformBox: "view-box", transform: `translateY(${baseline}px) scaleY(1) translateY(${-baseline}px)` },
        ], { duration: 520, delay: Math.min(index * 18, 120), fill: "backwards", easing: "cubic-bezier(.2,.7,.2,1)" });
      });
    }
    return Object.freeze({ reveal, growBars, transition, selection, play, stop, stopAll, reduced, scrollBehavior: () => reduced() ? "auto" : "smooth" });
  }
  root.IntakeMotion = createMotion();
  root.IntakeCreateMotion = createMotion;
})(globalThis);
