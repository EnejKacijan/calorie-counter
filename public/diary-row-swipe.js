// Today-only contextual actions. The row surface moves; the shelf never does.
export const diarySwipeWidth = 132;
export function diarySwipeIntent(dx, dy) {
  if (Math.hypot(dx, dy) < 10) return 'pending';
  if (Math.abs(dy) >= Math.abs(dx) / 1.35) return 'vertical';
  return dx < -10 ? 'open' : dx > 10 ? 'close' : 'pending';
}
export function diarySwipeShouldOpen(offset, dx, velocity, wasOpen, width = diarySwipeWidth) {
  if (wasOpen && dx > 0) return dx < width * .36 && velocity < .55;
  return offset <= -width * .4 || (offset < -20 && velocity < -.55);
}

export function createDiaryRowSwipe(root, win = window) {
  let openRow = null;
  let active = null;
  let suppressClickUntil = 0;
  const settleTimers = new WeakMap();
  const reduced = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = () => win.performance?.now?.() ?? Date.now();
  const setOffset = (card, x) => {
    card.style.setProperty('--diary-swipe-x', `${x}px`);
    card.style.setProperty('--diary-reveal-progress', String(Math.min(1, Math.max(0, -x / diarySwipeWidth))));
  };
  const setAccessible = (card, open) => {
    const shelf = card.querySelector('.diary-row-swipe-actions');
    if (!shelf) return;
    shelf.inert = !open;
    shelf.setAttribute('aria-hidden', String(!open));
    card.classList.toggle('is-swipe-open', open);
  };
  const settle = (card, open, immediate = false) => {
    win.clearTimeout(settleTimers.get(card));
    card.classList.remove('is-swipe-dragging');
    card.classList.toggle('is-swipe-settling', !immediate && !reduced());
    setAccessible(card, open);
    setOffset(card, open ? -diarySwipeWidth : 0);
    if (open) openRow = card;
    else if (openRow === card) openRow = null;
    if (!immediate && !reduced()) settleTimers.set(card, win.setTimeout(() => {
      card.classList.remove('is-swipe-settling');
      settleTimers.delete(card);
    }, 200));
  };
  const close = (immediate = false) => {
    if (!openRow) return;
    settle(openRow, false, immediate);
  };
  const reset = () => { active = null; close(true); };

  const onPointerDown = event => {
    suppressClickUntil = 0;
    if (!event.isPrimary || event.button !== 0) return;
    const card = event.target.closest?.('#foodList .entry-card[data-food-entry-id]');
    if (openRow && openRow !== card) close();
    if (!card || !root.contains(card) || event.target.closest('.diary-row-swipe-actions')) return;
    active = {card, id:event.pointerId, x:event.clientX, y:event.clientY,
      wasOpen:card === openRow, intent:'pending', samples:[{x:event.clientX,t:now()}]};
  };
  const onPointerMove = event => {
    const gesture = active;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (gesture.intent === 'pending') {
      const intent = diarySwipeIntent(dx, dy);
      if (intent === 'vertical' || (intent === 'close' && !gesture.wasOpen)) {
        active = null;
        return;
      }
      if (intent !== 'open' && intent !== 'close') return;
      gesture.intent = intent;
      win.clearTimeout(settleTimers.get(gesture.card));
      gesture.card.classList.remove('is-swipe-settling');
      gesture.card.classList.add('is-swipe-dragging');
      try { gesture.card.setPointerCapture(event.pointerId); } catch { /* detached or cancelled */ }
    }
    event.preventDefault();
    const raw = (gesture.wasOpen ? -diarySwipeWidth : 0) + dx;
    const x = raw < -diarySwipeWidth ? -diarySwipeWidth - Math.min(18, (-diarySwipeWidth - raw) * .16)
      : Math.min(0, raw);
    setOffset(gesture.card, x);
    gesture.samples.push({x:event.clientX,t:now()});
    gesture.samples = gesture.samples.filter(sample => now() - sample.t <= 110);
  };
  const end = (event, cancelled = false) => {
    const gesture = active;
    if (!gesture || event.pointerId !== gesture.id) return;
    active = null;
    if (gesture.intent === 'pending') return;
    const dx = event.clientX - gesture.x;
    const last = gesture.samples.at(-1), first = gesture.samples[0];
    const velocity = last && first && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    const offset = Number.parseFloat(gesture.card.style.getPropertyValue('--diary-swipe-x')) || 0;
    const open = cancelled ? gesture.wasOpen : diarySwipeShouldOpen(offset, dx, velocity, gesture.wasOpen);
    settle(gesture.card, open);
    // A compatibility click may target a newly exposed button or the row.
    suppressClickUntil = now() + 350;
  };
  const onPointerCancel = event => end(event, true);
  const onScroll = event => {
    // A clipped row may still receive a browser's internal scroll-into-view
    // event for an exposed button; only the Today page's vertical scroll owns
    // dismissal, not movement inside that row.
    if (event.target?.closest?.('#foodList .entry-card')) return;
    if (active?.intent === 'open' || active?.intent === 'close') return;
    close();
  };
  const onClick = event => {
    if (event.isTrusted && event.detail > 0 && now() < suppressClickUntil) {
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!openRow || openRow.contains(event.target)) return;
    close();
  };
  const onKeydown = event => { if (event.key === 'Escape') close(); };
  win.document.addEventListener('pointerdown', onPointerDown, true);
  win.document.addEventListener('pointermove', onPointerMove, {passive:false});
  win.document.addEventListener('pointerup', end);
  win.document.addEventListener('pointercancel', onPointerCancel);
  win.document.addEventListener('scroll', onScroll, true);
  win.document.addEventListener('click', onClick, true);
  win.document.addEventListener('keydown', onKeydown);
  return {close, reset, destroy() {
    reset();
    win.document.removeEventListener('pointerdown', onPointerDown, true);
    win.document.removeEventListener('pointermove', onPointerMove);
    win.document.removeEventListener('pointerup', end);
    win.document.removeEventListener('pointercancel', onPointerCancel);
    win.document.removeEventListener('scroll', onScroll, true);
    win.document.removeEventListener('click', onClick, true);
    win.document.removeEventListener('keydown', onKeydown);
  }};
}

export async function collapseDiaryFoodRow(card, win = window) {
  if (!card?.isConnected || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const height = card.getBoundingClientRect().height;
  if (!height) return;
  try {
    const animation = card.animate([
      {height:`${height}px`, opacity:1},
      {height:'0px', opacity:0},
    ], {duration:190, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards'});
    await animation.finished;
    animation.cancel();
  } catch { /* Rendering the committed state remains authoritative. */ }
}
