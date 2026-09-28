// One owner for conversation position. Geometry changes never change intent.
export const CHAT_SCROLL = Object.freeze({ resume: 80, show: 140, hide: 60 });
export function chatScrollState(state, event, distance = 0) {
  let following = state.following;
  if (event === 'latest') following = true;
  if (event === 'up') following = false;
  if (event === 'down' && distance <= CHAT_SCROLL.resume) following = true;
  const jump = following || distance <= CHAT_SCROLL.hide ? false
    : distance > CHAT_SCROLL.show ? true : state.jump;
  return { following, jump };
}

export function createAssistantScroll({ region, messages, pending, jump, window,
  requestAnimationFrame, cancelAnimationFrame, ResizeObserver }) {
  let state = { following: true, jump: false }, frame = 0, disposed = false, emptyReset = false, holds = 0;
  let top = region.scrollTop, height = region.scrollHeight, viewport = region.clientHeight;
  let anchor, restore, ownedTop, manualUntil = 0, manualDirection, moved = false, contact;
  const removers = [];
  const document = messages.ownerDocument;
  const selectingMessage = () => {
    const selection = document?.getSelection?.();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
    return [...messages.querySelectorAll(':scope > .assistant-message > p')]
      .some(body => selection.containsNode(body, true));
  };
  const now = () => window.performance.now();
  const distance = () => Math.max(0, region.scrollHeight - region.clientHeight - region.scrollTop);
  const listen = (node, type, fn, options) => {
    node.addEventListener(type, fn, options);
    removers.push(() => node.removeEventListener(type, fn, options));
  };
  function contentTop(node) {
    let value = 0;
    // A reveal transform temporarily makes the message list an offset parent.
    // Include that ancestor's layout offset without including its animated pose.
    for (let current = node; current && current !== region; current = current.offsetParent) value += current.offsetTop;
    return value;
  }
  function captureAnchor() {
    // The ordered message boxes permit O(log n) lookup, not a full-list read on
    // every scroll/response. During reflow only this one anchor is measured.
    // .assistant-conversation is the positioned offset parent. Layout offsets
    // exclude the existing message reveal transform, which otherwise drifts a
    // restored tab position by 2–4px while that animation is still running.
    const children = messages.children, edge = region.scrollTop;
    let lo = 0, hi = children.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (contentTop(children[mid]) + children[mid].offsetHeight <= edge) lo = mid + 1;
      else hi = mid;
    }
    const node = children[lo];
    anchor = node ? { node, fromEnd: children.length - lo, offset: contentTop(node) - edge } : null;
  }
  function write(value) {
    const next = Math.max(0, Math.min(value, region.scrollHeight - region.clientHeight));
    if (Math.abs(region.scrollTop - next) > .5) {
      ownedTop = next;
      region.scrollTop = next; // Always immediate, including long jumps/reduced motion.
    }
  }
  function publish() {
    state = chatScrollState(state, 'geometry', distance());
    region.dataset.chatFollow = state.following ? 'latest' : 'history';
    jump.hidden = !state.jump;
    // An exiting face may still paint for 100ms, but is already out of the
    // keyboard/accessibility/hit-test path. Scroll policy is unchanged.
    jump.inert = !state.jump;
  }
  function flush() {
    frame = 0;
    if (disposed) return;
    if (holds) {
      // Message actions/selection temporarily own reading, not follow intent.
      if (anchor?.node.isConnected) write(contentTop(anchor.node) - anchor.offset);
      top = region.scrollTop; height = region.scrollHeight; viewport = region.clientHeight;
      moved = false; publish(); return;
    }
    if (selectingMessage()) {
      // Native handles/selection own the viewport while reading. Neither a
      // response nor keyboard reflow may drag selected text to latest.
      state = chatScrollState(state, 'up', distance());
      restore = null; moved = false; ownedTop = undefined;
      captureAnchor();
      top = region.scrollTop; height = region.scrollHeight; viewport = region.clientHeight;
      publish();
      return;
    }
    // Starters are a normal scrollable empty page, not a live conversation.
    // Open/New starts at its heading; scrolling to a starter must remain native.
    if (!messages.children.length) {
      if (restore || emptyReset) write(0);
      restore = null; emptyReset = false; anchor = null; moved = false;
      state = { following: true, jump: false };
      top = region.scrollTop; height = region.scrollHeight; viewport = region.clientHeight;
      publish();
      return;
    }
    if (restore) {
      const saved = restore; restore = null;
      state = { following: saved.following, jump: false };
      // Persistence retains the last 40 turns. Count from that stable end so a
      // trimmed prefix or repeated/timestamp-identical text can't pick a wrong
      // turn. No message content is retained in this presentation-only snapshot.
      const node = saved.anchor && messages.children[messages.children.length - saved.anchor.fromEnd];
      write(state.following ? region.scrollHeight : node
        ? contentTop(node) - saved.anchor.offset : saved.top);
      captureAnchor();
    } else if (moved) {
      // User movement wins even when a response/viewport resize arrives in the
      // same frame. Never restore the anchor from before their gesture.
      if (manualDirection === 'down') state = chatScrollState(state, 'down', distance());
      captureAnchor();
    } else if (!state.following && anchor?.node.isConnected) {
      write(contentTop(anchor.node) - anchor.offset);
    }
    if (state.following) {
      write(region.scrollHeight);
      // Do not retain a reader's old anchor after Send/Jump/resume. A touchmove
      // can pause follow a frame BEFORE native scrolling actually moves; using
      // that stale anchor would teleport the first drag back into old history.
      anchor = null;
    }
    top = region.scrollTop; height = region.scrollHeight; viewport = region.clientHeight;
    moved = false;
    publish();
  }
  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(flush);
  }
  function intent(direction) {
    manualUntil = now() + 350;
    manualDirection = direction;
    ownedTop = undefined;
    restore = null;
    if (direction === 'up') state = chatScrollState(state, 'up', distance());
    schedule();
  }
  function scroll() {
    const current = region.scrollTop;
    if (ownedTop !== undefined && Math.abs(current - ownedTop) < 1) {
      ownedTop = undefined;
      top = current;
      return;
    }
    const geometryChanged = height !== region.scrollHeight || viewport !== region.clientHeight;
    // Input identifies touch/wheel/key intent before scroll. The stable-geometry
    // fallback also supports scrollbar dragging and assistive scroll commands.
    // Browser clamping/reflow and our own writes must not count as user intent.
    if (Math.abs(current - top) > .5 && (now() < manualUntil || !geometryChanged)) {
      const direction = current < top ? 'up' : 'down';
      intent(direction);
      moved = true;
      top = current;
    }
    schedule();
  }
  listen(region, 'scroll', scroll, { passive: true });
  if (document) listen(document, 'selectionchange', () => {
    if (!selectingMessage()) return; // Collapse alone never resumes follow.
    state = chatScrollState(state, 'up', distance());
    restore = null; moved = false;
    captureAnchor(); schedule();
  });
  listen(region, 'wheel', e => { if (!e.ctrlKey && e.deltaY) intent(e.deltaY < 0 ? 'up' : 'down'); }, { passive: true });
  listen(region, 'touchstart', e => {
    contact = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  listen(region, 'touchmove', e => {
    if (!contact || e.touches.length !== 1) { contact = null; return; }
    const { clientX: x, clientY: y } = e.touches[0], dy = y - contact.y;
    if (Math.abs(dy) > 4 && Math.abs(dy) > Math.abs(x - contact.x)) {
      intent(dy > 0 ? 'up' : 'down'); contact = { x, y };
    }
  }, { passive: true });
  for (const type of ['touchend', 'touchcancel']) listen(region, type, () => { contact = null; }, { passive: true });
  listen(region, 'keydown', e => {
    if (e.target.closest('button,input,textarea,select,a,[contenteditable=true]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (['ArrowUp', 'PageUp', 'Home'].includes(e.key) || e.key === ' ' && e.shiftKey) intent('up');
    else if (['ArrowDown', 'PageDown', 'End', ' '].includes(e.key)) intent('down');
  });
  function latest() {
    restore = null; moved = false; manualUntil = 0; manualDirection = null;
    emptyReset = !messages.children.length;
    state = chatScrollState(state, 'latest');
    schedule();
  }
  // Mouse activation needn't steal composer focus. Leave native touch dispatch
  // intact: cancelling touch pointerdown suppresses the click in WebKit.
  listen(jump, 'pointerdown', e => {
    if (e.pointerType === 'mouse' && e.isPrimary && e.button === 0) e.preventDefault();
    if (e.isPrimary !== false) jump.dataset.jumpPressed = 'true';
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(jump, type, () => { delete jump.dataset.jumpPressed; });
  listen(jump, 'click', event => {
    delete jump.dataset.jumpPressed;
    if (event.detail === 0 && jump.ownerDocument.activeElement === jump) region.focus({ preventScroll: true });
    latest();
  });
  const observer = new ResizeObserver(schedule);
  for (const node of [region, messages, pending]) observer.observe(node);
  return {
    hold() {
      if (!holds++) captureAnchor();
      let released = false;
      return () => { if (released) return; released = true; holds--; schedule(); };
    },
    latest,
    changed: schedule,
    restore(saved = { top: 0, following: true }) { restore = saved; anchor = null; moved = false; manualUntil = 0; schedule(); },
    snapshot() {
      captureAnchor();
      return { top: region.scrollTop, following: state.following,
        anchor: anchor ? { fromEnd: anchor.fromEnd, offset: anchor.offset } : null };
    },
    dispose() { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); removers.forEach(remove => remove()); },
  };
}
