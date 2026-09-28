// Questionnaire-only adaptation of ROOK's current step-forward/edge owner.
// Use interior swipes here; leave both browser edges and all controls alone.
export const questionnaireSwipe = Object.freeze({ edge: 24, intent: 10, ratio: 1.4, fraction: .33, flickDistance: 56, velocity: .65 });
export function swipeIntent(dx, dy) {
  const x = Math.abs(dx), y = Math.abs(dy);
  if (y >= questionnaireSwipe.intent && y * questionnaireSwipe.ratio >= x) return "cancel";
  return x > questionnaireSwipe.intent && x > y * questionnaireSwipe.ratio ? (dx > 0 ? "back" : "forward") : "pending";
}
export function commitsSwipe(distance, width, velocity) {
  return distance >= width * questionnaireSwipe.fraction || distance >= questionnaireSwipe.flickDistance && velocity >= questionnaireSwipe.velocity;
}
export function bindOnboardingSwipe(root, { window: win, enabled, identity, back, forward }) {
  let drag, suppressUntil = 0;
  const reset = () => { if (drag?.direction) suppressUntil = win.performance.now() + 350; drag = null; };
  const blocked = target => {
    if (target.closest('input,textarea,select,button,a,[contenteditable],[role="slider"],[role="tablist"],[data-no-swipe],canvas')) return true;
    for (let node = target; node && node !== root; node = node.parentElement) {
      if (node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(win.getComputedStyle(node).overflowX)) return true;
    }
    return false;
  };
  const start = event => {
    reset(); suppressUntil = 0;
    if (event.touches.length !== 1 || !enabled() || blocked(event.target) ||
      win.document.activeElement?.matches('input:not([type="radio"]),textarea,select,[contenteditable="true"]') ||
      String(win.getSelection?.() || '') || (win.visualViewport?.scale || 1) !== 1) return;
    const p = event.touches[0];
    if (p.clientX <= questionnaireSwipe.edge || p.clientX >= win.innerWidth - questionnaireSwipe.edge) return;
    drag = { id: p.identifier, key: identity(), x: p.clientX, y: p.clientY, lastX: p.clientX, at: win.performance.now(), width: root.clientWidth, direction: null, distance: 0, velocity: 0 };
  };
  const move = event => {
    if (!drag) return;
    if (!enabled() || identity() !== drag.key || event.touches.length !== 1 || event.touches[0].identifier !== drag.id) { reset(); return; }
    const p = event.touches[0], dx = p.clientX - drag.x, intent = swipeIntent(dx, p.clientY - drag.y);
    if (intent === "cancel" || drag.direction && intent !== "pending" && intent !== drag.direction) { reset(); return; }
    if (intent === "pending") return;
    if (!event.cancelable) { reset(); return; }
    event.preventDefault(); // Horizontal intent only; never cancel vertical scrolling.
    drag.direction = intent;
    const now = win.performance.now(), sign = intent === "back" ? 1 : -1;
    drag.velocity = (p.clientX - drag.lastX) * sign / Math.max(1, now - drag.at);
    drag.lastX = p.clientX; drag.at = now; drag.distance = Math.abs(dx);
  };
  const end = event => {
    const gesture = drag; reset();
    if (!gesture?.direction) return;
    suppressUntil = win.performance.now() + 350;
    if (event.cancelable) event.preventDefault();
    if (event.type !== "touchend" || !enabled() || identity() !== gesture.key) return;
    const velocity = win.performance.now() - gesture.at > 100 ? 0 : gesture.velocity;
    if (commitsSwipe(gesture.distance, gesture.width, velocity)) (gesture.direction === "back" ? back : forward)();
  };
  const click = event => {
    if (event.detail !== 0 && win.performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    reset();
  };
  const pointer = event => { if (event.pointerType !== "touch") { reset(); suppressUntil = 0; } };
  const multi = event => { if (event.touches.length > 1) reset(); };
  root.addEventListener("touchstart", start, { capture: true, passive: true });
  root.addEventListener("touchmove", move, { capture: true, passive: false });
  root.addEventListener("touchend", end, { capture: true, passive: false });
  root.addEventListener("touchcancel", end, { capture: true, passive: false });
  // This owner never captures a pointer. Browsers release their implicit touch
  // capture before touchend; treating that normal release as cancellation
  // would discard every completed swipe. Genuine pointercancel still cancels.
  root.addEventListener("pointercancel", reset);
  root.addEventListener("pointerdown", pointer, true); root.addEventListener("click", click, true);
  win.document.addEventListener("touchstart", multi, { passive: true });
  win.addEventListener("blur", reset); win.addEventListener("resize", reset);
  win.visualViewport?.addEventListener("resize", reset); win.document.addEventListener("visibilitychange", reset);
  return () => {
    reset();
    for (const [type,fn] of [["touchstart",start],["touchmove",move],["touchend",end],["touchcancel",end],["click",click],["pointerdown",pointer]]) root.removeEventListener(type,fn,true);
    root.removeEventListener("pointercancel",reset);
    win.document.removeEventListener("touchstart",multi); win.removeEventListener("blur",reset); win.removeEventListener("resize",reset);
    win.visualViewport?.removeEventListener("resize",reset); win.document.removeEventListener("visibilitychange",reset);
  };
}
