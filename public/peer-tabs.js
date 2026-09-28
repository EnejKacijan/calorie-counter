import { guardResidualClick } from './semantic-back.js?v=4';

export const peerTiming = { duration: 190, easing: 'cubic-bezier(.2,.7,.2,1)' };
export const peerIntent = (dx, dy, slop = 10) => {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'ignore';
  if (Math.abs(dy) >= slop && Math.abs(dx) <= Math.abs(dy) * 1.35) return 'vertical';
  if (Math.abs(dx) < slop) return 'pending';
  return Math.abs(dx) > Math.abs(dy) * 1.35 ? 'horizontal' : 'vertical';
};
export const peerCommits = (distance, width, velocity = 0) =>
  distance >= width * .28 || velocity >= .65 && distance >= 48;
export const peerSettleDuration = (distance, width, commit, max = 210) =>
  Math.min(max, Math.max(40, max * (commit ? width - distance : distance) / Math.max(1, width)));
export const peerTravel = (dx, direction, width) => Math.min(width, Math.max(0, -direction * dx));
export const peerPageSpan = (paneWidth, gutter) => paneWidth + gutter;

// One clipped viewport, one track, two full-width siblings. The inert outgoing
// snapshot is presentation only. prepare retains the REAL prior nodes for cancel
// and reading-position restoration; only the destination owns active listeners.
export function createPeerTabs({ viewport, pane, tabs, getIndex, prepare, win = window,
  reduced = () => win.matchMedia('(prefers-reduced-motion: reduce)').matches,
  enabled = () => true, edgeOwns = () => false } = {}) {
  if (!viewport || !pane || !tabs?.length) return null;
  const doc = win.document;
  let active = null, touch = null, disposed = false, removeContact;
  const indicator = () => tabs[0].parentElement.querySelector(':scope > .motion-selection');
  function indicate(from, next, progress, duration = 0) {
    const marker = indicator();
    if (!marker) return;
    win.IntakeMotion?.stop(marker);
    marker.getAnimations().forEach(animation => animation.cancel());
    marker.style.transition = duration ? `transform ${duration}ms ${peerTiming.easing}` : 'none';
    marker.style.transform = `translateX(${(from + (next - from) * progress) * 100}%)`;
  }
  function cleanup(session, accepted) {
    if (active !== session) return;
    active = null;
    win.clearTimeout(session.timer);
    session.animation?.cancel();
    session.transaction[accepted ? 'commit' : 'rollback']();
    session.track.replaceWith(pane);
    pane.inert = session.inert;
    viewport.style.removeProperty('height');
    delete viewport.dataset.peerActive;
    indicate(getIndex(), getIndex(), 1);
    indicator()?.style.removeProperty('transition');
    session.transaction.settled?.(accepted);
  }
  function interrupt() {
    touch = null; removeContact?.(); removeContact = null;
    // A release/tap decision survives interruption; a live drag rolls back.
    if (active) cleanup(active, active.accepted === true);
  }
  function begin(next, source) {
    const from = getIndex(), direction = Math.sign(next - from);
    if (!direction || next < 0 || next >= tabs.length) return null;
    const width = viewport.getBoundingClientRect().width;
    if (!Number.isFinite(width) || width <= 0) return null;
    const height = pane.getBoundingClientRect().height;
    const copy = pane.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    copy.querySelectorAll('[aria-live]').forEach(node => node.removeAttribute('aria-live'));
    // Preserve the outgoing pane's visibility before prepare changes the
    // form's search state. Its action rows travel with that same snapshot.
    for (const selector of ['[data-peer-results]', '[data-peer-note]', '.manual-food-shortcut', '.food-ai-description-trigger']) {
      const original = pane.querySelector(selector), clone = copy.querySelector(selector);
      if (original && clone) clone.style.setProperty('display', win.getComputedStyle(original).display, 'important');
    }
    copy.inert = true; copy.setAttribute('aria-hidden', 'true'); copy.dataset.peerOutgoing = '';
    const track = doc.createElement('div'); track.className = 'peer-pane-track';
    viewport.style.height = `${height}px`;
    pane.replaceWith(track); track.append(...(direction > 0 ? [copy, pane] : [pane, copy]));
    const gutter = Number.parseFloat(win.getComputedStyle(track).columnGap) || 0;
    const span = peerPageSpan(width, gutter);
    const inert = pane.inert; pane.inert = true;
    const transaction = prepare(next, { source });
    viewport.style.height = `${Math.max(height, pane.getBoundingClientRect().height)}px`;
    const session = { from, next, direction, width, span, track, transaction, inert, progress: 0, accepted: null };
    active = session; viewport.dataset.peerActive = source;
    paint(session, 0);
    return session;
  }
  function paint(session, progress) {
    session.progress = Math.max(0, Math.min(1, progress));
    const x = session.direction > 0 ? -session.progress * session.span : (session.progress - 1) * session.span;
    session.track.style.transform = `translate3d(${x}px,0,0)`;
    indicate(session.from, session.next, session.progress);
  }
  function settle(session, accepted, tap = false) {
    session.accepted = accepted;
    const duration = reduced() ? 0 : tap ? peerTiming.duration
      : peerSettleDuration(session.progress * session.span, session.span, accepted, peerTiming.duration);
    const start = session.track.style.transform, releaseProgress = session.progress;
    paint(session, accepted ? 1 : 0);
    const end = session.track.style.transform;
    if (!duration || !session.track.animate) { cleanup(session, accepted); return; }
    indicate(session.from, session.next, releaseProgress);
    indicator()?.getBoundingClientRect();
    indicate(session.from, session.next, accepted ? 1 : 0, duration);
    session.animation = session.track.animate([{ transform: start }, { transform: end }], { ...peerTiming, duration });
    session.animation.finished.then(() => cleanup(session, accepted), () => {});
    // Animation deadline only: WebKit can lose a finish notification on hide.
    session.timer = win.setTimeout(() => cleanup(session, accepted), duration + 50);
  }
  function select(next, { animate = true } = {}) {
    if (disposed || !Number.isInteger(next) || next < 0 || next >= tabs.length) return;
    interrupt();
    if (next === getIndex() || !enabled() || !animate || reduced()) {
      const transaction = prepare(next, { source: 'tap' });
      transaction.commit(); transaction.settled?.(true); return;
    }
    const session = begin(next, 'tap');
    if (!session) return;
    session.transaction.commit();
    settle(session, true, true);
  }
  const click = event => select(tabs.indexOf(event.currentTarget));
  const excluded = 'input,textarea,select,[contenteditable],[role=slider],[role=tablist],[data-no-peer-swipe],canvas,.ux-sheet-handle,.modal-drag-handle';
  const start = event => {
    if (event.touches?.length !== 1) { interrupt(); return; }
    if (!enabled() || viewport.closest('[inert],[hidden]') || String(win.getSelection?.() || '') || event.target.closest?.(excluded)) return;
    const point = event.touches[0];
    if (edgeOwns(point, event) || doc.querySelector('[data-edge-back-active]') || (win.visualViewport?.scale ?? 1) !== 1) return;
    interrupt();
    touch = { id: point.identifier, target: event.target, x: point.clientX, y: point.clientY,
      at: event.timeStamp, last: point.clientX, velocity: 0, direction: 0 };
    // Rendering detaches the original row, but Touch Events retain that target.
    const target = event.target;
    target.addEventListener('touchmove', move, { passive: false });
    target.addEventListener('touchend', end, { passive: false });
    target.addEventListener('touchcancel', end, { passive: false });
    removeContact = () => { target.removeEventListener('touchmove', move); target.removeEventListener('touchend', end); target.removeEventListener('touchcancel', end); };
  };
  const move = event => {
    if (!touch) return;
    if (event.touches?.length !== 1 || event.touches[0].identifier !== touch.id || !enabled()) { interrupt(); return; }
    const point = event.touches[0], dx = point.clientX - touch.x, dy = point.clientY - touch.y;
    if (![dx, dy].every(Number.isFinite)) { interrupt(); return; }
    if (!active) {
      const intent = peerIntent(dx, dy);
      if (intent === 'vertical' || intent === 'ignore') { interrupt(); return; }
      if (intent !== 'horizontal') return;
      touch.direction = dx < 0 ? 1 : -1;
      if (!event.cancelable || !begin(getIndex() + touch.direction, 'swipe')) { interrupt(); return; }
    }
    if (!event.cancelable) { interrupt(); return; }
    event.preventDefault(); event.stopPropagation();
    touch.velocity = -(point.clientX - touch.last) * touch.direction / Math.max(1, event.timeStamp - touch.at);
    touch.last = point.clientX; touch.at = event.timeStamp;
    paint(active, peerTravel(dx, touch.direction, active.span) / active.span);
  };
  const end = event => {
    if (!touch || ![...event.changedTouches || []].some(point => point.identifier === touch.id)) return;
    const contact = touch; touch = null; removeContact?.(); removeContact = null;
    if (!active) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation(); guardResidualClick(win);
    const session = active;
    const accepted = event.type !== 'touchcancel' && peerCommits(session.progress * session.span, session.width,
      event.timeStamp - contact.at < 100 ? contact.velocity : 0);
    settle(session, accepted);
  };
  const hide = () => { if (doc.visibilityState === 'hidden') interrupt(); };
  const scroll = () => { if (touch && !active) interrupt(); };
  tabs.forEach(tab => tab.addEventListener('click', click));
  viewport.addEventListener('touchstart', start, { passive: true });
  doc.addEventListener('touchmove', move, { passive: false, capture: true });
  doc.addEventListener('touchend', end, { passive: false, capture: true });
  doc.addEventListener('touchcancel', end, { passive: false, capture: true });
  doc.addEventListener('scroll', scroll, true); doc.addEventListener('visibilitychange', hide);
  win.addEventListener('resize', interrupt); win.addEventListener('blur', interrupt);
  return { select, interrupt, dispose() {
    disposed = true; interrupt();
    tabs.forEach(tab => tab.removeEventListener('click', click));
    viewport.removeEventListener('touchstart', start);
    doc.removeEventListener('touchmove', move, true); doc.removeEventListener('touchend', end, true); doc.removeEventListener('touchcancel', end, true);
    doc.removeEventListener('scroll', scroll, true); doc.removeEventListener('visibilitychange', hide);
    win.removeEventListener('resize', interrupt); win.removeEventListener('blur', interrupt);
  } };
}
