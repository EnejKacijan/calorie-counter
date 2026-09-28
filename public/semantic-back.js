// ROOK's edgeBack policy: browser tabs retain native history gestures. Only
// explicit parent actions opt in; the recognizer never owns application state.
export function backIntent(dx, dy) {
  if (dx < -10 || Math.abs(dy) >= 10 && Math.abs(dy) * 1.4 >= dx) return "ignore";
  return dx > 10 && dx > Math.abs(dy) * 1.4 ? "back" : "pending";
}
export const commitsBack = (distance, width, velocity) => distance >= width * .33 || distance >= 56 && velocity >= .65;
export const backSettleDuration = (distance, width, commit) => Math.min(200, Math.max(40, 200 * (commit ? width - distance : distance) / width));
export function edgeTraceEnabled(location) {
  return new URLSearchParams(location?.search || '').get('edgeTrace') === '1' && /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/.test(location?.hostname || '');
}

// Move live nodes, never copies of forms/conversations. Restore only the three
// properties we own so viewport updates cannot be overwritten on release.
export function liveBackMotion(targets, win) {
  const nodes = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
  if (!nodes.length) return null;
  const keys = ['transform', 'transition', 'will-change'];
  const original = nodes.map(node => keys.map(key => [key, node.style.getPropertyValue(key), node.style.getPropertyPriority(key)]));
  let frame = 0, mounted = false, next = 0, painted = 0;
  const paint = (x, ms) => nodes.forEach(node => {
    node.style.setProperty('transition', ms ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none', 'important');
    node.style.setProperty('transform', `translate3d(${x}px,0,0)`, 'important');
  });
  return {
    // A fast release can arrive before the last queued touch position paints.
    // Settle from the rendered position, not that unpainted input sample.
    readDistance() {
      const transform = win.getComputedStyle?.(nodes[0]).transform;
      const matrix = transform?.match(/^matrix(3d)?\((.+)\)$/);
      const x = matrix ? Number(matrix[2].split(',')[matrix[1] ? 12 : 4]) : transform === 'none' ? 0 : painted;
      return Number.isFinite(x) ? x : painted;
    },
    render(x, ms) {
      if (!mounted) {
        mounted = true;
        nodes.forEach(node => { node.getAnimations().forEach(a => a.cancel()); node.style.setProperty('will-change', 'transform'); });
      }
      next = x;
      if (ms) {
        win.cancelAnimationFrame(frame); frame = 0; paint(x, ms);
        // getAnimations flushes the new CSS transition. Its finished promise
        // owns completion; a wall-clock timer can expire before WebKit paints
        // the endpoint. Keep the live surface mounted until that transition ends.
        const transitions = nodes.flatMap(node => node.getAnimations()).filter(a => a.transitionProperty === 'transform');
        if (transitions.length) {
          // WebKit can leave a transition promise pending when the surface is
          // backgrounded or its presentation layer is replaced. The owner
          // gets a deadline derived from this exact transition as a safety net.
          const finished = Promise.all(transitions.map(a => a.finished));
          Object.defineProperty(finished, '__intakeFallbackMs', { value: ms + 34 });
          Object.defineProperty(finished, '__intakeFinish', { value: () => {
            transitions.forEach(animation => { try { animation.finish(); } catch { /* Detached transition: the owner still restores its styles. */ } });
          } });
          return finished;
        }
      }
      else if (!frame) frame = win.requestAnimationFrame(() => { frame = 0; painted = next; paint(next, 0); });
    },
    clear() {
      win.cancelAnimationFrame(frame); frame = 0;
      if (!mounted) return;
      nodes.forEach((node, i) => original[i].forEach(([key, value, priority]) => value ? node.style.setProperty(key, value, priority) : node.style.removeProperty(key)));
      mounted = false;
    },
  };
}

// The committed surface may disappear before a compatibility click arrives.
const clickGuards = new WeakMap();
export function guardResidualClick(win) {
  const doc = win.document;
  clickGuards.get(doc)?.();
  const click = event => { if (event.isTrusted && event.detail > 0) { event.preventDefault(); event.stopImmediatePropagation(); } };
  const clear = () => {
    win.clearTimeout(timer); doc.removeEventListener('click', click, true);
    doc.removeEventListener('pointerdown', clear, true); doc.removeEventListener('touchstart', clear, true);
    clickGuards.delete(doc);
  };
  const timer = win.setTimeout(clear, 350);
  doc.addEventListener('click', click, true);
  doc.addEventListener('pointerdown', clear, true); doc.addEventListener('touchstart', clear, true);
  clickGuards.set(doc, clear);
}

export function bindSemanticBack(surface, getBack, win = window, { motionTargets, createMotion, getState = () => null, allowFocusedControl = () => false } = {}) {
  const doc = win.document;
  let gesture, motion, timer, committing = false, removeTargetListeners;
  let phase = 'IDLE', sequence = 0, generation = 0;
  const tracing = edgeTraceEnabled(win.location);
  const settling = () => phase === 'SETTLING_COMMIT' || phase === 'SETTLING_CANCEL';
  const trace = (event, detail = {}) => {
    if (!tracing) return;
    const entries = win.__intakeEdgeTrace ||= [];
    entries.push({ event, time: Math.round(win.performance?.now?.() ?? Date.now()), phase, gestureId: gesture?.id ?? null,
      surface: surface.id || surface.className, route: win.location?.pathname, ...detail });
    if (entries.length > 2000) entries.splice(0, entries.length - 2000);
  };
  const setPhase = (next, detail = {}) => { const from = phase; phase = next; if (from !== next) trace('phase', { from, to: next, ...detail }); };
  const reset = (reason = 'cleanup') => {
    trace('cleanup:start', { reason });
    win.clearTimeout(timer); timer = null; generation++;
    removeTargetListeners?.(); removeTargetListeners = null;
    motion?.clear(); motion = null; delete surface.dataset.edgeBackActive;
    setPhase('IDLE', { reason }); trace('cleanup:end', { reason, transform: surface.style?.getPropertyValue?.('transform') || '' });
    gesture = null;
  };
  const available = () => {
    const button = getBack();
    // A parent cannot borrow a topmost overlay's edge. Actual sheets retain
    // their vertical gesture owner, even if they contain a visible Back.
    if (surface.closest('[data-presentation="sheet"]')) return null;
    const layers = doc.querySelectorAll?.('dialog[open],[role="dialog"],[role="alertdialog"],[role="menu"]') || [];
    if ([...layers].some(layer => layer !== surface && !layer.contains(surface) &&
      !layer.closest('[hidden],[inert],[aria-hidden="true"]') && layer.getClientRects().length)) return null;
    return button && !button.hidden && !button.disabled && button.getClientRects().length &&
      !surface.closest('[inert],[hidden],[aria-hidden="true"],[aria-busy="true"],.is-exiting') ? button : null;
  };
  const valid = () => gesture && surface.isConnected && available() === gesture.button && getState() === gesture.state;
  const start = event => {
    if (event.touches.length !== 1) { trace('multitouch'); reset('multitouch'); return; }
    if (settling()) return;
    reset('new-touch');
    if (!(win.navigator.standalone === true || win.matchMedia('(display-mode: standalone)').matches) || (win.visualViewport?.scale ?? 1) !== 1) return;
    if (doc.querySelector('[data-edge-back-active]') || event.target.closest('input,textarea,select,button,a,[contenteditable],[role=slider],[role=tablist],canvas,svg,img,.ux-sheet-handle,.modal-drag-handle,[data-no-edge-back]')) return;
    // A closed native picker/keyboard can leave its field focused on iOS.
    // Only a viewport-owning caller may distinguish that from active editing;
    // touches starting on controls remain excluded above in either case.
    if (doc.activeElement?.matches('input,textarea,select,[contenteditable]') && !allowFocusedControl(doc.activeElement) || String(win.getSelection?.() || '')) return;
    const button = available();
    if (!button) return;
    const point = event.touches[0], rect = surface.getBoundingClientRect();
    if (![point.clientX, point.clientY, rect.left, rect.width].every(Number.isFinite) || rect.width <= 0) return;
    if (point.clientX < rect.left || point.clientX > rect.left + 24 || point.clientY < rect.top || point.clientY > rect.bottom) return;
    gesture = { id: ++sequence, generation: ++generation, button, state: getState(), touchId: point.identifier, x: point.clientX, y: point.clientY, width: rect.width, last: point.clientX, at: event.timeStamp, velocity: 0, distance: 0 };
    // Touch Events keep targeting the original node even if an async render
    // detaches it. Retain this terminal path as well as the surface/document.
    const target = event.target;
    if (target !== surface) {
      target.addEventListener('touchend', end, true); target.addEventListener('touchcancel', end, true);
      removeTargetListeners = () => { target.removeEventListener('touchend', end, true); target.removeEventListener('touchcancel', end, true); };
    }
    setPhase('TRACKING'); trace('touchstart', { touchId: point.identifier, x: point.clientX, y: point.clientY, width: rect.width });
  };
  const move = event => {
    if (!gesture || settling()) return;
    if (!valid() || event.touches.length !== 1 || event.touches[0].identifier !== gesture.touchId) { trace('touch-invalid'); reset('invalid-move'); return; }
    const point = event.touches[0], dx = point.clientX - gesture.x;
    if (!Number.isFinite(dx) || !Number.isFinite(point.clientY)) { trace('non-finite'); reset('non-finite'); return; }
    const intent = backIntent(dx, point.clientY - gesture.y);
    if (phase === 'TRACKING' && intent === "ignore") { trace('intent-ignore', { dx }); reset('intent-ignore'); return; }
    if (phase === 'TRACKING' && intent !== "back") return;
    if (!event.cancelable) { trace('native-scroll'); reset('non-cancelable'); return; }
    if (phase === 'TRACKING') {
      motion = createMotion ? createMotion() : liveBackMotion(motionTargets?.(), win);
      // No coherent parent/child presentation, no interception. Never turn a
      // captured edge drag into a cut or expose a fallback route/background.
      if (!motion) { trace('parent-not-ready'); reset('no-motion'); return; }
      surface.dataset.edgeBackActive = 'true'; setPhase('DRAGGING', { parentReady: true }); trace('intent-locked');
    }
    event.preventDefault(); event.stopPropagation();
    gesture.velocity = (point.clientX - gesture.last) / Math.max(1, event.timeStamp - gesture.at);
    gesture.last = point.clientX; gesture.at = event.timeStamp;
    gesture.distance = Math.max(0, Math.min(gesture.width, dx));
    trace('move', { dx, visualDx: gesture.distance, progress: gesture.width ? gesture.distance / gesture.width : 0, velocity: gesture.velocity });
    motion?.render(gesture.distance, 0);
  };
  const end = event => {
    if (!gesture || settling()) return;
    if (event.changedTouches?.length && ![...event.changedTouches].some(point => point.identifier === gesture.touchId)) { trace('terminal-other-touch'); reset('terminal-other-touch'); return; }
    if (phase !== 'DRAGGING') { reset('terminal-before-drag'); return; }
    if (event.cancelable) event.preventDefault();
    event.stopPropagation(); guardResidualClick(win);
    const commit = event.type !== 'touchcancel' && valid() && commitsBack(gesture.distance, gesture.width, event.timeStamp - gesture.at < 100 ? gesture.velocity : 0);
    const sampled = motion?.readDistance?.() ?? gesture.distance;
    const visualDistance = Math.max(0, Math.min(gesture.width, Number.isFinite(sampled) ? sampled : gesture.distance));
    const ms = !motion || win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.min(motion.maxSettleDuration ?? 200, backSettleDuration(visualDistance, gesture.width, commit));
    const owner = gesture;
    const ownerGeneration = generation;
    setPhase(commit ? 'SETTLING_COMMIT' : 'SETTLING_CANCEL', { terminal: event.type, visualDx: visualDistance, commit });
    trace('settle:start', { terminal: event.type, visualDx: visualDistance, commit });
    const finished = motion?.render(commit ? gesture.width : 0, ms);
    const complete = () => {
      if (gesture !== owner || generation !== ownerGeneration || !settling()) { trace('settle:stale'); return; }
      const button = commit && valid() ? gesture.button : null, animated = Boolean(motion);
      trace('settle:end', { commit: Boolean(button), finalTransform: surface.style?.getPropertyValue?.('transform') || '' });
      reset(button ? 'committed' : 'cancelled');
      if (!button) return;
      // Existing handlers own cleanup, history, focus and draft semantics.
      committing = true;
      if (animated) surface.dataset.swipeBackCommitted = 'true';
      trace('semantic-back', { gestureId: owner.id, dispatchCount: 1 });
      try { button.click(); } finally { committing = false; delete surface.dataset.swipeBackCommitted; }
    };
    if (ms && finished?.then) {
      finished.then(complete, () => { if (gesture === owner && generation === ownerGeneration) reset('transition-rejected'); });
      const fallbackMs = Number(finished.__intakeFallbackMs);
      if (Number.isFinite(fallbackMs)) timer = win.setTimeout(() => {
        if (gesture !== owner || generation !== ownerGeneration) return;
        trace('settle:deadline'); finished.__intakeFinish?.(); complete();
      }, Math.max(0, fallbackMs));
    }
    else if (ms) timer = win.setTimeout(complete, ms); else complete();
  };
  const click = event => { if (!committing && !(event.isTrusted && event.detail > 0 && clickGuards.has(doc))) reset('click-interrupt'); };
  const keydown = event => { if (event.key === 'Escape') reset('escape'); };
  const changed = () => { if (gesture && !valid()) reset('lifecycle-change'); };
  const terminalCancel = event => { if (gesture) { trace(event.type); reset(event.type); } };
  // Pointer cancellation is expected when native touch panning takes over.
  // It is diagnostic only: the owned Touch identifier remains authoritative.
  const pointerDiagnostic = event => { if (gesture) trace(event.type, { owner: 'touch' }); };
  const otherContact = event => { if (gesture && !settling()) reset(event.touches.length > 1 ? 'multitouch' : 'fresh-contact'); };
  const observer = new win.MutationObserver(changed);
  observer.observe(surface, { attributes: true, subtree: true, attributeFilter: ['class','hidden','inert','open','aria-hidden','aria-busy','aria-label','disabled','data-food-detail'] });
  surface.addEventListener('touchstart', start, { passive: true, capture: true });
  surface.addEventListener('touchmove', move, { passive: false, capture: true });
  surface.addEventListener('touchend', end, true); surface.addEventListener('touchcancel', end, true);
  doc.addEventListener('touchstart', otherContact, true);
  doc.addEventListener('touchend', end, true); doc.addEventListener('touchcancel', end, true);
  surface.addEventListener('pointercancel', pointerDiagnostic, true); surface.addEventListener('lostpointercapture', pointerDiagnostic, true);
  doc.addEventListener('click', click, true); doc.addEventListener('keydown', keydown, true);
  win.addEventListener('resize', terminalCancel); win.addEventListener('orientationchange', terminalCancel); win.addEventListener('blur', terminalCancel); doc.addEventListener('visibilitychange', terminalCancel);
  win.visualViewport?.addEventListener('resize', terminalCancel);
  return () => {
    reset('dispose'); observer.disconnect();
    surface.removeEventListener('touchstart', start, true); surface.removeEventListener('touchmove', move, true);
    surface.removeEventListener('touchend', end, true); surface.removeEventListener('touchcancel', end, true);
    doc.removeEventListener('touchstart', otherContact, true);
    doc.removeEventListener('touchend', end, true); doc.removeEventListener('touchcancel', end, true);
    surface.removeEventListener('pointercancel', pointerDiagnostic, true); surface.removeEventListener('lostpointercapture', pointerDiagnostic, true);
    doc.removeEventListener('click', click, true); doc.removeEventListener('keydown', keydown, true);
    win.removeEventListener('resize', terminalCancel); win.removeEventListener('orientationchange', terminalCancel); win.removeEventListener('blur', terminalCancel); doc.removeEventListener('visibilitychange', terminalCancel);
    win.visualViewport?.removeEventListener('resize', terminalCancel);
  };
}
