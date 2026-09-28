// Vanilla adaptation of ROOK's ModalLayer / SheetActionFooter ownership.
// One document lock, even when a scanner opens above an existing sheet.
const locks = new WeakMap();
export function lockSurfaceScroll(win, { restorePosition } = {}) {
  const body = win.document.body;
  let lock = locks.get(body);
  if (!lock) {
    const keys = ["position", "top", "left", "right", "width", "overflow"];
    const root = win.document.documentElement;
    const width = body.getBoundingClientRect?.().width;
    lock = { count: 0, interactions: 0, x: win.scrollX || 0, y: win.scrollY, root, restorePosition,
      visualTop: win.visualViewport?.offsetTop || 0,
      rootMinHeight: root?.style.minHeight, rootOverscroll: root?.style.overscrollBehavior,
      prior: Object.fromEntries(keys.map(key => [key, body.style[key]])) };
    locks.set(body, lock);
    // Preserve the root's existing scroll range while the body is out of flow.
    // This keeps scrollTop AND the native gutter; no zero-scroll viewport reset
    // or scrollbar-width compensation. Only the root box, not app layout, owns it.
    if (root) { root.style.minHeight = `${win.document.scrollingElement.scrollHeight}px`; root.style.overscrollBehavior = 'none'; }
    Object.assign(body.style, { position: "fixed", top: `${-lock.y}px`, left: `${-lock.x}px`, right: "auto", width: width ? `${width}px` : "100%", overflow: "hidden" });
    const blockBackground = event => {
      if (!event.target.closest?.('dialog[open],[role=dialog]:not([hidden])') || event.target.closest?.('[inert]')) event.preventDefault();
    };
    win.document.addEventListener?.('touchmove',blockBackground,{passive:false});
    win.document.addEventListener?.('wheel',blockBackground,{passive:false});
    lock.releaseEvents = () => { win.document.removeEventListener?.('touchmove',blockBackground); win.document.removeEventListener?.('wheel',blockBackground); };
  }
  lock.count++; lock.interactions++;
  let released = false, prepared = false;
  // A revealing overlay can restore its parent's layout before measuring the
  // destination, while keeping background gestures blocked until it is gone.
  // A nested owner relinquishes only its own share; the outer layout stays locked.
  const prepareLayout = () => {
    if (prepared) return;
    prepared = true;
    if (--lock.count) return;
    Object.assign(body.style, lock.prior);
    if (lock.root) { lock.root.style.minHeight = lock.rootMinHeight; lock.root.style.overscrollBehavior = lock.rootOverscroll; }
    locks.delete(body);
    const saved = { left: lock.x, top: lock.y };
    // The first lock owner may resolve a stable reading anchor after its
    // content changes. Nested sheets never replace that owner's restoration.
    win.scrollTo({ ...(lock.restorePosition?.(saved) || saved), behavior: "instant" });
  };
  const release = () => {
    if (released) return;
    released = true;
    prepareLayout();
    if (!--lock.interactions) lock.releaseEvents();
  };
  release.prepareLayout = prepareLayout;
  return release;
}

export function bindSurfaceViewport(panel, win = window, { scroller = panel.querySelector('.food-reuse-content,.scanner-body') } = {}) {
  const viewport = win.visualViewport;
  const keys = ['height', 'top', 'bottom', 'safe-bottom'];
  const prior = keys.map(key => [key, panel.style.getPropertyValue(`--surface-${key}`), panel.style.getPropertyPriority(`--surface-${key}`)]);
  const hadClass = panel.classList.contains('mobile-surface');
  let frame = 0;
  let frozen = false;
  const update = () => {
    frame = 0;
    if (!viewport || viewport.scale !== 1) return; // Never counteract pinch zoom.
    // Native input focus can pan the visual viewport even with body fixed.
    // Keep the locked background at its original *visible* reading position.
    // The existing surface viewport owner drives this; never scroll the page.
    const lock = locks.get(win.document.body);
    if (lock) win.document.body.style.top = `${-lock.y + viewport.offsetTop - lock.visualTop}px`;
    if (frozen) return;
    panel.style.setProperty("--surface-height", `${viewport.height}px`);
    panel.style.setProperty("--surface-top", `${viewport.offsetTop}px`);
    panel.style.setProperty("--surface-bottom", `${Math.max(0, win.document.documentElement.clientHeight - viewport.height - viewport.offsetTop)}px`);
    panel.style.setProperty('--surface-safe-bottom', viewport.height < win.document.documentElement.clientHeight - 1 ? '0px' : 'env(safe-area-inset-bottom)');
    const input = win.document.activeElement;
    if (!scroller?.contains(input) || !input.matches("input,textarea,select")) return;
    const field = input.closest?.('label') || input;
    const rect = field.getBoundingClientRect();
    const bounds = scroller.getBoundingClientRect();
    const fieldHeight = rect.bottom - rect.top;
    const gap = Math.max(0, Math.min(8, (bounds.bottom - bounds.top - fieldHeight) / 2));
    const top = Math.max(bounds.top, viewport.offsetTop) + gap;
    const bottom = Math.min(bounds.bottom, viewport.offsetTop + viewport.height) - gap;
    // Reveal only inside the content owner. scrollIntoView can pan the fixed
    // layer, body and visual viewport, even when the document is locked.
    if (fieldHeight > bottom - top || rect.top < top) scroller.scrollTop += rect.top - top;
    else if (rect.bottom > bottom) scroller.scrollTop += rect.bottom - bottom;
  };
  const queue = () => { if (!frame) frame = win.requestAnimationFrame(update); };
  // Resize/pan already carries the new visible bounds. Apply their geometry
  // together in this event, before another frame can paint the old body/sheet
  // position against the new viewport. Focus-only reveal remains frame-batched.
  const viewportChanged = () => { win.cancelAnimationFrame(frame); update(); };
  panel.classList.add("mobile-surface");
  viewport?.addEventListener("resize", viewportChanged); viewport?.addEventListener("scroll", viewportChanged);
  const editing = event => { if (event.target.matches('input,textarea,select')) queue(); };
  win.addEventListener('resize', viewportChanged); win.addEventListener('focus', viewportChanged);
  win.document.addEventListener('visibilitychange', queue);
  panel.addEventListener("focusin", editing); panel.addEventListener('click', editing); update();
  const release = () => {
    win.cancelAnimationFrame(frame);
    viewport?.removeEventListener("resize", viewportChanged); viewport?.removeEventListener("scroll", viewportChanged);
    win.removeEventListener('resize', viewportChanged); win.removeEventListener('focus', viewportChanged);
    win.document.removeEventListener('visibilitychange', queue);
    panel.removeEventListener("focusin", editing); panel.removeEventListener('click', editing); if (!hadClass) panel.classList.remove("mobile-surface");
    for (const [key,value,priority] of prior) value ? panel.style.setProperty(`--surface-${key}`,value,priority) : panel.style.removeProperty(`--surface-${key}`);
  };
  release.freeze = () => { frozen = true; win.cancelAnimationFrame(frame); frame = 0; };
  return release;
}

export const sheetDismisses = (distance, velocity) => distance >= 72 || distance >= 24 && velocity > .65;
// ROOK's touch-scroll-first contract, with one sequence owner for both input
// adapters. Touch keeps its original identifier (not per-move hit targets);
// mouse/pen starts on the handle and captures on the panel. Capture delivery prevents child
// controls from swallowing moves/end after acquisition. Native scroll stays
// native: never translate a sheet on a move the browser cannot cancel.
export function bindSheetGestures({ surface, scroller, handle, disabled = () => false,
  setPosition, onDragStart, onDismiss, onReset, pressSelector, win = window }) {
  const doc = win.document;
  let gesture = null, pressed = null, suppressClickUntil = 0;
  const clearPress = () => { pressed?.removeAttribute('data-sheet-pressed'); pressed = null; };
  const now = () => win.performance.now();
  const available = () => !disabled() && (win.visualViewport?.scale ?? 1) === 1;
  const state = value => { if (value) surface.dataset.sheetGesture = value; else delete surface.dataset.sheetGesture; };
  const within = event => {
    if (!surface.contains(event.target) || event.target.closest?.('[inert]')) return false;
    // A native dialog backdrop is retargeted to the dialog, not a real child.
    const r = surface.getBoundingClientRect(), p = event.touches?.[0] || event;
    return p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom;
  };
  const scrollOwner = target => {
    if (!scroller?.contains(target)) return null; // Header/footer never scroll the parent.
    for (let node = target; node && node !== scroller; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(win.getComputedStyle(node).overflowY)) return node;
    }
    return scroller;
  };
  const canScroll = (owner, step) => owner && (step > 0 ? owner.scrollTop > 0 : owner.scrollTop < owner.scrollHeight - owner.clientHeight - 1);
  const consume = event => { if (event.cancelable) event.preventDefault(); };
  const releaseCapture = prior => {
    if (prior?.kind === 'pointer' && surface.hasPointerCapture?.(prior.id)) surface.releasePointerCapture(prior.id);
  };
  const finish = (cancelled = false) => {
    clearPress();
    const prior = gesture; gesture = null; state(); releaseCapture(prior);
    if (!prior) return;
    if (prior.moved) suppressClickUntil = now() + 350;
    if (!prior.dragging) return;
    const threshold = Math.min(140, surface.offsetHeight * .24);
    const velocityFloor = Math.min(72, threshold * .72);
    const velocity = now() - prior.lastAt < 100 ? prior.velocity : 0;
    const dismiss = prior.kind === 'pointer' ? sheetDismisses(prior.distance, velocity)
      : prior.distance >= threshold || prior.distance >= velocityFloor && velocity >= .55;
    if (!cancelled && dismiss) onDismiss(prior.distance); else onReset(prior.distance);
  };
  const begin = (event, point, kind) => {
    if (!available() || !within(event)) return;
    // Controls are valid vertical origins, not separate touch owners. Keep
    // touchstart native for taps/pickers/editing; resolve intent on movement.
    const owner = kind === 'pointer' ? null : scrollOwner(event.target);
    suppressClickUntil = 0;
    gesture = { kind, owner, id: kind === 'touch' ? point.identifier : point.pointerId,
      startX: point.clientX, startY: point.clientY, lastY: point.clientY, lastAt: now(),
      velocity: 0, distance: 0, dragging: false, moved: false, atTop: !owner || owner.scrollTop <= 0 };
    state('pending');
    const candidate = kind === 'touch' && pressSelector && event.target.closest?.(pressSelector);
    if (candidate && surface.contains(candidate) && !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true') {
      pressed = candidate; pressed.setAttribute('data-sheet-pressed', '');
    }
    if (kind === 'pointer') { try { surface.setPointerCapture(point.pointerId); } catch { /* Detached/synthetic pointer. */ } }
  };
  const move = (event, point) => {
    const g = gesture;
    if (!g) return;
    if (!available()) { finish(true); return; }
    const y = point.clientY, at = now(), step = y - g.lastY;
    const dx = Math.abs(point.clientX - g.startX), dy = y - g.startY;
    const record = () => { g.lastY = y; g.lastAt = at; };
    if (!g.dragging) {
      if (g.horizontal || dx > 10 && dx > Math.abs(dy) * 1.4) { clearPress(); g.horizontal = g.moved = true; state('horizontal'); return; }
      if (Math.abs(dy) >= 7) { clearPress(); g.moved = true; }
      // Pointer cancellation is normal during native touch scrolling. Touch
      // events still arrive, but non-cancelable ones cannot transfer ownership.
      if (!event.cancelable) { clearPress(); g.native = true; state('scroll'); record(); return; }
      if (g.native) { record(); return; }
      if (g.owner && g.owner.scrollTop > 0) {
        g.atTop = false; state('scroll');
        if (step && !canScroll(g.owner, step)) consume(event);
        record(); return;
      }
      if (!g.atTop) { g.atTop = true; g.startY = y; record(); return; }
      if (dy <= 0) {
        state(canScroll(g.owner, step) ? 'scroll' : 'clamped');
        if (step && !canScroll(g.owner, step)) consume(event);
        record(); return;
      }
      if (dy < 7) return;
      clearPress(); g.dragging = g.moved = true; state('drag'); onDragStart?.();
    }
    if (!event.cancelable) { finish(true); return; }
    consume(event); event.stopPropagation();
    g.distance = Math.max(0, y - g.startY);
    g.velocity = step / Math.max(1, at - g.lastAt); record(); setPosition(g.distance);
  };
  const cancel = () => finish(true);
  const touchStart = event => { finish(true); if (event.touches.length === 1) begin(event, event.touches[0], 'touch'); };
  const touchMove = event => {
    if (gesture?.kind !== 'touch') return;
    const point = [...event.touches].find(p => p.identifier === gesture.id);
    if (event.touches.length !== 1 || !point) { finish(true); return; }
    move(event, point);
  };
  const touchEnd = event => {
    if (gesture?.kind !== 'touch') return;
    if (gesture.moved && !gesture.horizontal) { consume(event); event.stopPropagation(); }
    finish(disabled() || event.type === 'touchcancel');
  };
  const pointerStart = event => {
    if (gesture && (gesture.kind !== 'pointer' || event.pointerId !== gesture.id)) finish(true);
    if (event.pointerType === 'touch') return; // Touch adapter is the sole finger owner.
    if (within(event)) suppressClickUntil = 0;
    if (event.isPrimary !== false && event.button === 0 && handle?.contains(event.target)) begin(event, event, 'pointer');
  };
  const pointerMove = event => {
    // Pointer movement can arrive before the browser's touch-scroll slop is
    // crossed. Cancel only the pending row tap here; Touch remains the sole
    // scroll/translation owner and keeps its original target/identifier.
    if (pressed && gesture?.kind === 'touch' && event.pointerType === 'touch' &&
      (Math.abs(event.clientY - gesture.startY) >= 7 || Math.abs(event.clientX - gesture.startX) > 10)) {
      clearPress(); gesture.moved = true;
    }
    if (gesture?.kind === 'pointer' && event.pointerId === gesture.id) move(event, event);
  };
  const pointerEnd = event => {
    // Native scrolling cancels its PointerEvent stream, but Touch continues to
    // own arbitration. Clear the visual without creating a second drag owner.
    if (event.pointerType === 'touch') clearPress();
    if (gesture?.kind === 'pointer' && event.pointerId === gesture.id) finish(event.type !== 'pointerup' || disabled());
  };
  const suppressClick = event => {
    if (!surface.contains(event.target) || event.detail === 0 || !gesture?.moved && now() >= suppressClickUntil) return;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const wheel = event => {
    if (!surface.contains(event.target) || disabled()) return;
    if (!canScroll(scrollOwner(event.target), -event.deltaY)) consume(event);
  };
  const listeners = [
    ['touchstart', touchStart, true], ['touchmove', touchMove, false], ['touchend', touchEnd, false], ['touchcancel', touchEnd, false],
    ['pointerdown', pointerStart, false], ['pointermove', pointerMove, false], ['pointerup', pointerEnd, false], ['pointercancel', pointerEnd, false],
    ['lostpointercapture', pointerEnd, true], ['click', suppressClick, false], ['wheel', wheel, false],
  ];
  for (const [type, fn, passive] of listeners) doc.addEventListener(type, fn, {capture:true, passive});
  win.addEventListener('resize', cancel); win.addEventListener('blur', cancel); doc.addEventListener('visibilitychange', cancel);
  doc.addEventListener('intake:press-reset', clearPress);
  const release = () => {
    clearPress();
    const prior = gesture; gesture = null; state(); releaseCapture(prior);
    for (const [type, fn] of listeners) doc.removeEventListener(type, fn, true);
    win.removeEventListener('resize', cancel); win.removeEventListener('blur', cancel); doc.removeEventListener('visibilitychange', cancel);
    doc.removeEventListener('intake:press-reset', clearPress);
  };
  release.cancel = cancel;
  return release;
}

const inertOwners = new WeakMap();
export function isolateSurfaceBackground(elements) {
  const owned = [...new Set(elements)].filter(Boolean);
  for (const element of owned) {
    let entry = inertOwners.get(element);
    if (!entry) { entry = { count: 0, inert: element.inert }; inertOwners.set(element, entry); }
    entry.count++; element.inert = true;
  }
  let released = false;
  return () => {
    if (released) return; released = true;
    for (const element of owned) { const entry = inertOwners.get(element); if (!--entry.count) { element.inert = entry.inert; inertOwners.delete(element); } }
  };
}

const focusable = panel => [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')]
  .filter(el => !el.closest('[inert],[hidden]') && el.getClientRects().length);
export function focusSurfaceTarget(target) {
  if (target?.isConnected && !target.closest('[inert],[hidden]')) target.focus({ preventScroll: true });
}

// One physical sheet lifetime. Semantic child views stay with their existing
// owner; updating the contents never releases the parent lock or replays entry.
export function createSheetSurface({ panel, backdrop, handle, scroller, background = () => [], initialFocus,
  restoreTarget, onDismiss, onBack = onDismiss, pressSelector, win = window }) {
  const doc = win.document, native = panel.tagName === 'DIALOG';
  let active = false, closing = false, opener, unlock, restoreInert, releaseViewport, releaseGesture;
  let timer, animation, backdropAnimation, outsideStart = false, resolveClose;
  const reduced = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const heading = () => initialFocus?.() || panel.querySelector('h2');
  const focus = target => focusSurfaceTarget(target || heading() || focusable(panel)[0]);
  const outside = event => {
    if (backdrop) return event.target === backdrop;
    if (event.target !== panel) return false;
    const r = panel.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  const pointerStart = event => { outsideStart = event.isPrimary !== false && outside(event); };
  const backdropClick = event => {
    const allowed = outsideStart && outside(event); outsideStart = false;
    if (active && !closing && allowed) onDismiss();
  };
  const blockScroll = event => { if (event.target === backdrop || outside(event)) event.preventDefault(); };
  const keydown = event => {
    if (!active || panel.inert) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!closing) onBack(); return; }
    if (event.key !== 'Tab') return;
    const items = focusable(panel), first = items[0], last = items.at(-1);
    if (closing || !first) { event.preventDefault(); return; }
    if (!items.includes(doc.activeElement) || event.shiftKey && doc.activeElement === first || !event.shiftKey && doc.activeElement === last) {
      event.preventDefault(); focus(event.shiftKey ? last : first);
    }
  };
  const cancel = event => { event.preventDefault(); if (!closing) onBack(); };
  function update({ focusIfOutside = true } = {}) {
    if (!active) return;
    releaseGesture?.cancel(); // Nested content replaces the old tap candidate.
    const hasInputs = Boolean(panel.querySelector('input:not([type=hidden]),textarea,select'));
    if (hasInputs && !releaseViewport) releaseViewport = bindSurfaceViewport(panel, win, {scroller});
    else if (!hasInputs && releaseViewport) { releaseViewport(); releaseViewport = null; }
    if (focusIfOutside && (!panel.contains(doc.activeElement) || !doc.activeElement.isConnected)) focus();
  }
  function open({ returnTo = doc.activeElement } = {}) {
    const entering = !active;
    win.clearTimeout(timer); animation?.cancel(); backdropAnimation?.cancel();
    resolveClose?.(); resolveClose = null; closing = false;
    if (entering) {
      opener = returnTo; unlock = lockSurfaceScroll(win); active = true;
      panel.hidden = false; panel.inert = false;
      if (backdrop) { backdrop.hidden = false; backdrop.inert = false; backdrop.tabIndex = -1; }
      if (native && !panel.open) panel.showModal();
      restoreInert = isolateSurfaceBackground(background());
      panel.classList.add('intake-sheet');
      panel.addEventListener('keydown', keydown); panel.addEventListener('cancel', cancel);
      for (const target of [panel, backdrop].filter(Boolean)) {
        target.addEventListener('pointerdown', pointerStart); target.addEventListener('click', backdropClick);
        target.addEventListener('touchmove', blockScroll, { passive: false }); target.addEventListener('wheel', blockScroll, { passive: false });
      }
      releaseGesture = bindSheetGestures({ surface: panel, scroller, handle, pressSelector, win,
        disabled: () => !active || closing || panel.hidden || panel.inert,
        onDragStart: () => { animation?.cancel(); },
        setPosition: distance => { panel.style.translate = `0 ${distance}px`; },
        onDismiss: distance => { panel.style.removeProperty('translate'); onDismiss({ dragDistance: distance }); },
        onReset: distance => {
          if (!active || closing) return;
          panel.style.removeProperty('translate');
          if (!reduced()) animation = panel.animate([{translate:`0 ${distance}px`},{translate:'0 0'}],{duration:180,easing:'ease-out'});
        },
      });
    }
    panel.dataset.sheetState = 'open';
    // Establish final, untransformed field geometry before intentional focus.
    // An autofocus editor uses the keyboard's own arrival, not a second moving
    // target for WebKit's native focus/selection reveal. Non-editing sheets
    // retain the existing slide presentation.
    update({ focusIfOutside: false }); focus();
    const editingEntry = panel.contains(doc.activeElement) && doc.activeElement.matches('input,textarea,select');
    if (entering && !reduced()) {
      if (!editingEntry) animation = panel.animate([{transform:'translateY(100%)'},{transform:'translateY(0)'}], {duration:200,easing:'cubic-bezier(.22,1,.36,1)'});
      if (backdrop) backdropAnimation = backdrop.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});
    }
  }
  function finish(restoreFocus) {
    if (!active) return;
    win.clearTimeout(timer); animation?.cancel(); backdropAnimation?.cancel();
    releaseGesture?.(); releaseGesture = null; panel.style.removeProperty('translate');
    releaseViewport?.(); releaseViewport = null;
    panel.hidden = true; if (native && panel.open) panel.close(); if (backdrop) backdrop.hidden = true;
    panel.classList.remove('intake-sheet'); delete panel.dataset.sheetState;
    panel.removeEventListener('keydown', keydown); panel.removeEventListener('cancel', cancel);
    for (const target of [panel, backdrop].filter(Boolean)) {
      target.removeEventListener('pointerdown', pointerStart); target.removeEventListener('click', backdropClick);
      target.removeEventListener('touchmove', blockScroll); target.removeEventListener('wheel', blockScroll);
    }
    restoreInert?.(); unlock?.(); restoreInert = unlock = null;
    active = closing = outsideStart = false;
    if (restoreFocus) focusSurfaceTarget(restoreTarget?.(opener) || opener);
    opener = null; resolveClose?.(); resolveClose = null;
  }
  function close({ restoreFocus = true, immediate = false, dragDistance = 0, stableViewportExit = false } = {}) {
    if (!active) return Promise.resolve();
    dragDistance ||= Number.parseFloat(panel.style.translate?.split(' ')[1]) || 0;
    releaseGesture?.cancel();
    if (stableViewportExit) releaseViewport?.freeze?.();
    if (immediate || reduced()) { finish(restoreFocus); return Promise.resolve(); }
    if (closing) return new Promise(resolve => { const previous = resolveClose; resolveClose = () => { previous?.(); resolve(); }; });
    closing = true;
    const transform = dragDistance ? `translateY(${dragDistance}px)` : win.getComputedStyle(panel).transform;
    // A keyboard can still be retreating as a form sheet exits. With frozen
    // sheet geometry, 100% would stop at the old keyboard edge; finish beyond
    // the layout viewport so the departure stays continuous all the way out.
    const rect = stableViewportExit ? panel.getBoundingClientRect() : null;
    const exit = rect ? `translateY(${Math.max(rect.height, doc.documentElement.clientHeight - rect.top + 2)}px)` : 'translateY(100%)';
    const opacity = backdrop ? win.getComputedStyle(backdrop).opacity : null;
    animation?.cancel(); backdropAnimation?.cancel(); panel.style.removeProperty('translate'); panel.dataset.sheetState = 'closing';
    animation = panel.animate([{transform},{transform:exit}],{duration:200,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
    if (backdrop) backdropAnimation = backdrop.animate([{opacity},{opacity:0}],{duration:200,fill:'forwards'});
    const done = new Promise(resolve => { resolveClose = resolve; });
    // Cleanup is bounded and does not depend on transitionend/animation delivery.
    timer = win.setTimeout(() => finish(restoreFocus),200);
    return done;
  }
  return { open, update, focus, close, get active() { return active; }, get closing() { return closing; }, dispose() { finish(false); } };
}
