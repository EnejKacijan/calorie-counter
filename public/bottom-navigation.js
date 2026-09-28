// The persistent footer owns only press feedback. Route/ARIA selection stays
// in the router; this cannot navigate, delay a commit, or queue selection.
export function mountNavigationPress(nav, win = window) {
  let pressed = null, pointer = null;
  const clear = event => {
    if (event?.pointerId != null && event.pointerId !== pointer) return;
    pressed?.classList.remove('is-pressed');
    pressed = null;
    pointer = null;
  };
  nav.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    const link = event.target.closest('a[href]');
    if (!link || !nav.contains(link) || nav.inert) return;
    clear();
    pressed = link;
    pointer = event.pointerId;
    pressed.classList.add('is-pressed');
  });
  win.addEventListener('pointerup', clear, true);
  win.addEventListener('pointercancel', clear, true);
  win.document.addEventListener('intake:press-reset', () => clear());
  win.addEventListener('blur', () => clear());
  win.document.addEventListener('visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') clear();
  });
  return clear;
}
