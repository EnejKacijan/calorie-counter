// ROOK's current weekPager thresholds. Date/storage ownership stays in Today.
export const WEEK_SWIPE = Object.freeze({ intent:10, ratio:1.35, fraction:.28,
  flickDistance:24, velocity:.5, freshFor:100, minSettle:160, maxSettle:220 });

export function bindCalendarSwipe({ viewport, track, prepare, clear, commit, canMove = () => true, win = window }) {
  const doc = viewport.ownerDocument, now = () => win.performance.now();
  let gesture = null, width = 0, offset = 0, frame = 0, timer = 0;
  let settling = false, generation = 0, suppressUntil = 0, destroyed = false, finishTransition = null;
  const removers = [];
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    removers.push(() => target.removeEventListener(type, fn, options));
  };
  const clamp = x => Math.max(canMove(1) ? -width : 0, Math.min(canMove(-1) ? width : 0, x));
  function paint() { frame = 0; track.style.transform = `translate3d(${-width + offset}px,0,0)`; }
  function flush() { if (frame) win.cancelAnimationFrame(frame); paint(); }
  function cancelSettle() { generation++; win.clearTimeout(timer); timer = 0; settling = false; finishTransition = null; }
  function releaseCapture() {
    if (gesture?.pointer) {
      try { viewport.releasePointerCapture(gesture.id); } catch { /* already cancelled */ }
    }
  }
  function reset() {
    cancelSettle(); releaseCapture(); gesture = null;
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0; offset = 0;
    track.style.transition = 'none'; track.style.transform = 'translate3d(-100%,0,0)';
    delete viewport.dataset.weekMotion; clear();
  }
  // Interrupt at the actual rendered position. A superseded settle must never
  // change the date later, after another gesture/arrow has taken ownership.
  function interrupt() {
    if (!settling) return;
    const matrix = win.getComputedStyle(track).transform;
    const values = matrix.startsWith('matrix') ? matrix.slice(matrix.indexOf('(') + 1, -1).split(',').map(Number) : [];
    const x = values.length === 16 ? values[12] : values.length === 6 ? values[4] : -width + offset;
    offset = clamp(x + width);
    cancelSettle(); track.style.transition = 'none'; flush();
  }
  function ready() {
    width = viewport.getBoundingClientRect().width;
    if (!(width > 0)) return false;
    prepare(); viewport.dataset.weekMotion = 'drag'; return true;
  }
  function settle(direction, event) {
    flush(); cancelSettle(); gesture = null;
    if (direction && !canMove(direction)) direction = 0;
    const target = direction ? -direction * width : 0;
    const remaining = Math.min(1, Math.abs(target - offset) / width);
    const duration = win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0
      : WEEK_SWIPE.minSettle + (WEEK_SWIPE.maxSettle - WEEK_SWIPE.minSettle) * remaining;
    const token = generation;
    let done = false;
    const finish = () => {
      if (done || destroyed || token !== generation) return;
      done = true;
      // The existing action rebuilds the middle page synchronously before reset.
      if (direction) commit(direction, event);
      reset();
    };
    if (!duration || remaining < .001) { finish(); return; }
    settling = true; viewport.dataset.weekMotion = 'settle';
    const started = now();
    finishTransition = () => { if (now() - started >= duration - 16) finish(); };
    // One settle-boundary read. Pointer moves only schedule a transform.
    void track.offsetWidth;
    track.style.transition = `transform ${duration}ms cubic-bezier(.2,0,.2,1)`;
    offset = target; paint();
    timer = win.setTimeout(finish, duration + 32);
  }
  function start(id, x, y, target, pointer = false) {
    if (destroyed || target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    if (gesture) { reset(); suppressUntil = now() + 350; return; }
    const resumed = settling;
    interrupt(); if (!ready()) return;
    suppressUntil = 0; // a new contact is not the preceding drag's ghost click
    track.style.transition = 'none'; flush();
    gesture = { id, x, y, pointer, origin:offset, intent:null, lastX:x, lastAt:now(), velocity:0,
      resumedTap:resumed ? target.closest?.('#calendarStrip button') : null };
  }
  function move(id, x, y, event) {
    const g = gesture; if (!g || g.id !== id) return;
    const dx = x - g.x, dy = y - g.y;
    if (!g.intent && Math.max(Math.abs(dx), Math.abs(dy)) >= WEEK_SWIPE.intent) {
      g.intent = Math.abs(dx) > Math.abs(dy) * WEEK_SWIPE.ratio ? 'horizontal' : 'vertical';
      if (g.intent === 'horizontal' && g.pointer) {
        try { viewport.setPointerCapture(id); } catch { /* detached pointer */ }
      }
    }
    if (g.intent === 'vertical') { offset = 0; flush(); return; }
    if (x !== g.lastX) {
      const at = now(); g.velocity = (x - g.lastX) / Math.max(1, at - g.lastAt);
      g.lastX = x; g.lastAt = at;
    }
    if (g.intent !== 'horizontal') return;
    if (event.cancelable) event.preventDefault();
    suppressUntil = now() + 350;
    offset = clamp(g.origin + dx);
    if (!frame) frame = win.requestAnimationFrame(paint);
  }
  function end(id, x, y, event) {
    const g = gesture; if (!g || g.id !== id) return;
    move(id, x, y, event); releaseCapture();
    if (g.intent !== 'horizontal') {
      reset();
      if (!g.intent && g.resumedTap?.isConnected) {
        suppressUntil = now() + 350; g.resumedTap.click();
      }
      return;
    }
    suppressUntil = now() + 350;
    const distance = Math.abs(offset);
    const flick = distance >= WEEK_SWIPE.flickDistance && now() - g.lastAt <= WEEK_SWIPE.freshFor
      && Math.abs(g.velocity) >= WEEK_SWIPE.velocity && Math.sign(g.velocity) === Math.sign(offset);
    settle(distance / width >= WEEK_SWIPE.fraction || flick ? (offset < 0 ? 1 : -1) : 0);
  }
  const abort = () => { if (gesture?.intent === 'horizontal' || settling) suppressUntil = now() + 350; reset(); };
  listen(viewport, 'touchstart', e => {
    if (e.touches.length !== 1) { abort(); return; }
    const t = e.touches[0]; start(t.identifier, t.clientX, t.clientY, e.target);
  }, { passive:true });
  listen(viewport, 'touchmove', e => {
    if (e.touches.length !== 1) { abort(); return; }
    const t = e.touches[0]; move(t.identifier, t.clientX, t.clientY, e);
  }, { passive:false });
  listen(viewport, 'touchend', e => {
    const t = Array.from(e.changedTouches).find(t => t.identifier === gesture?.id);
    if (t) end(t.identifier, t.clientX, t.clientY, e);
  });
  listen(viewport, 'touchcancel', abort);
  listen(viewport, 'pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (e.button !== 0 || e.isPrimary === false) { abort(); return; }
    start(e.pointerId, e.clientX, e.clientY, e.target, true);
  });
  listen(viewport, 'pointermove', e => { if (e.pointerType !== 'touch') move(e.pointerId, e.clientX, e.clientY, e); });
  listen(viewport, 'pointerup', e => { if (e.pointerType !== 'touch') end(e.pointerId, e.clientX, e.clientY, e); });
  listen(viewport, 'pointercancel', e => { if (e.pointerType !== 'touch') abort(); });
  listen(viewport, 'pointerleave', e => { if (e.pointerType === 'mouse' && !viewport.hasPointerCapture?.(e.pointerId)) abort(); });
  listen(viewport, 'click', e => {
    if (e.detail === 0 || now() >= suppressUntil) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  listen(track, 'transitionend', e => {
    if (e.target === track && e.propertyName === 'transform') finishTransition?.();
  });
  for (const type of ['blur','resize','orientationchange','pagehide']) listen(win, type, abort);
  listen(doc, 'visibilitychange', abort);
  const observer = win.ResizeObserver ? new win.ResizeObserver(() => {
    if ((gesture || settling) && Math.abs(viewport.getBoundingClientRect().width - width) > 1) abort();
  }) : null;
  observer?.observe(viewport);
  return {
    reset,
    arrow(direction, event) {
      if (destroyed) return;
      releaseCapture(); gesture = null; interrupt();
      // DOM Event.currentTarget becomes null after dispatch, before settling ends.
      const trigger = event && { detail:event.detail, currentTarget:event.currentTarget };
      if (ready()) settle(direction, trigger);
    },
    destroy() { destroyed = true; reset(); observer?.disconnect(); removers.forEach(remove => remove()); },
  };
}
