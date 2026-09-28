// A visit-local discovery gesture, not a new answer or validation requirement.
export function bindOnboardingPace(content, win = window) {
  let used = false, frame = 0;
  const cancel = () => { win.cancelAnimationFrame(frame); frame = 0; };
  function reveal(section) {
    if (used || !section) return;
    used = true;
    // Give the native radio its selected paint before measuring the section.
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      if (!content.contains(section)) return;
      const bounds = content.getBoundingClientRect(), rect = section.getBoundingClientRect();
      if (rect.top >= bounds.top && rect.bottom <= bounds.bottom) return;
      const top = bounds.top + 8, bottom = bounds.bottom - 8;
      // On very short viewports keep the legend and beginning reachable;
      // never shrink the choices or center the entire screen.
      const delta = rect.height > bottom - top || rect.top < top ? rect.top - top : Math.max(0, rect.bottom - bottom);
      const start = content.scrollTop;
      const end = Math.max(0, Math.min(content.scrollHeight - content.clientHeight, start + delta));
      if (Math.abs(end - start) < 1) return;
      if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) { content.scrollTop = end; return; }
      const began = win.performance.now();
      const tick = now => {
        const t = Math.min(1, (now - began) / 220);
        content.scrollTop = start + (end - start) * (1 - (1 - t) ** 3);
        frame = t < 1 ? win.requestAnimationFrame(tick) : 0;
      };
      frame = win.requestAnimationFrame(tick);
    });
  }
  // User intent wins even before the first animation frame. Do not cancel on
  // scroll events emitted by our own scrollTop writes.
  const interruptions = ['wheel', 'touchmove', 'pointerdown', 'keydown'];
  for (const type of interruptions) content.addEventListener(type, cancel, { passive: true });
  return { reveal, reset() { cancel(); used = false; }, dispose() {
    cancel(); for (const type of interruptions) content.removeEventListener(type, cancel);
  } };
}
