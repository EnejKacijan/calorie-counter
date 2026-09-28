import { focusSurfaceTarget } from './mobile-surface.js?v=3';

// Local exception for a touch-restored Diary trigger inheriting the sheet's
// native :focus-visible flag. Focus events never establish input modality.
// Other sheets and unknown/AT/programmatic activations keep the native policy.
export function createDiaryContextFocus({ root, panel, getTrigger }) {
  let input = 'unknown', touchCandidate = false, touchDrag = false, currentTouch = null;
  let keyboardRevision = 0, marked, disposed = false;
  const clear = () => { marked?.removeAttribute('data-diary-touch-restored'); marked = null; };
  const within = target => panel.contains(target) || getTrigger()?.contains(target);
  // eventPhase returns to NONE outside dispatch. Unlike a queued microtask,
  // it stays valid between capture and the actual close button's listener.
  const during = event => { currentTouch = event; };
  function pointer(event) {
    input = event.isTrusted && event.pointerType === 'touch' ? 'touch' : 'unknown';
    if (input !== 'touch') clear();
    touchCandidate = input === 'touch' && within(event.target);
  }
  function touchStart(event) {
    input = event.isTrusted && event.touches.length === 1 ? 'touch' : 'unknown';
    if (input !== 'touch') clear();
    touchCandidate = input === 'touch' && within(event.target);
    touchDrag = touchCandidate && panel.contains(event.target);
  }
  function touchEnd(event) {
    // The shared drag owner dismisses during document capture, before this
    // local listener. capture() uses that gesture's trusted touch-start token.
    if (event.isTrusted && input === 'touch' && touchCandidate) during(event);
    touchDrag = false;
  }
  function cancel() { input = 'unknown'; touchCandidate = touchDrag = false; currentTouch = null; }
  function key(event) {
    input = event.isTrusted ? 'keyboard' : 'unknown';
    keyboardRevision++; touchCandidate = touchDrag = false; currentTouch = null; clear();
  }
  function click(event) {
    if (event.isTrusted && event.detail > 0 && touchCandidate && input === 'touch' && within(event.target)) during(event);
    else { currentTouch = null; input = 'unknown'; clear(); }
    touchCandidate = false;
  }
  const focusOut = event => { if (event.target === marked) clear(); };
  const listeners = [['pointerdown', pointer], ['touchstart', touchStart], ['touchend', touchEnd],
    ['touchcancel', cancel], ['keydown', key], ['click', click], ['focusout', focusOut]];
  for (const [type, listener] of listeners) root.addEventListener(type, listener, true);
  return {
    begin() { clear(); touchDrag = false; },
    capture({ dragDistance = 0 } = {}) {
      return { touch: input === 'touch' && Boolean(currentTouch?.eventPhase || dragDistance > 0 && touchDrag), keyboardRevision };
    },
    restore(token) {
      clear();
      const target = getTrigger();
      if (disposed || !root.isConnected || !target?.isConnected || !root.contains(target) || target.closest('[hidden],[inert]')) return;
      if (token?.touch && input === 'touch' && token.keyboardRevision === keyboardRevision) {
        marked = target; target.setAttribute('data-diary-touch-restored', '');
      }
      focusSurfaceTarget(target);
      // No exception is needed when the engine already kept native focus quiet.
      if (!target.matches(':focus-visible')) clear();
      input = 'unknown'; touchCandidate = touchDrag = false; currentTouch = null;
    },
    dispose() {
      disposed = true; clear();
      for (const [type, listener] of listeners) root.removeEventListener(type, listener, true);
    },
  };
}
