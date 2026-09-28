// UI-only disclosure; foods and the shared capture remain independent records.
export function bindScannedMealDisclosure({button, content, expanded = false, onChange, window, reveal, cancelReveal}) {
  let open = expanded, animation;
  const state = () => {
    button.setAttribute('aria-expanded', String(open));
    content.inert = !open;
  };
  state(); content.hidden = !open;
  button.addEventListener('click', () => {
    cancelReveal?.();
    const height = content.getBoundingClientRect().height;
    animation?.cancel(); animation = null;
    open = !open; state(); onChange(open);
    content.hidden = false;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !content.animate) {
      content.hidden = !open; if(open)reveal?.(); return;
    }
    const next = content.animate([{height: `${height}px`}, {height: `${open ? content.scrollHeight : 0}px`}], {
      duration: 160, easing: 'cubic-bezier(.2,.7,.2,1)',
    });
    animation = next;
    if(open)reveal?.();
    next.finished.then(() => {
      if (animation !== next) return;
      content.hidden = !open; animation = null;
    }).catch(() => {});
  });
}
