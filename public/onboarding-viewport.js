// Onboarding owns its viewport. It is not a bottom-aligned .mobile-surface sheet.
export function bindOnboardingViewport(panel, win = window) {
  const viewport = win.visualViewport;
  let frame = 0, pendingInput = null;
  function revealField(input) {
    if (!panel.contains(input) || !input.matches("input,select,textarea")) return;
    const content = panel.querySelector(".onboarding-content");
    const field = input.closest(".onboarding-field,.onboarding-choice") || input;
    const bounds = content.getBoundingClientRect(), rect = field.getBoundingClientRect();
    const gap = Math.max(0, Math.min(8, (bounds.height - rect.height) / 2));
    // Scroll only the form region, never the document/header/footer.
    if (rect.height > bounds.height || rect.top < bounds.top + gap) content.scrollTop += rect.top - bounds.top - gap;
    else if (rect.bottom > bounds.bottom - gap) content.scrollTop += rect.bottom - bounds.bottom + gap;
  }
  function update() {
    frame = 0;
    if (viewport && viewport.scale !== 1) return;
    const height = viewport?.height || win.innerHeight;
    // Both values are visual-viewport bounds in layout-viewport coordinates.
    // innerHeight can change independently while the keyboard pans between
    // fields; using it to clamp offsetTop made the entire frame jump upward.
    const top = Math.max(0, viewport?.offsetTop || 0);
    panel.style.setProperty("--onboarding-height", `${height}px`);
    panel.style.setProperty("--onboarding-top", `${top}px`);
    // A shrunken visual viewport already ends above the obstructed area.
    // Do not add the home-indicator inset there a second time.
    const reduced = height < win.document.documentElement.clientHeight - 1;
    panel.dataset.viewportReduced = String(reduced);
    panel.style.setProperty("--onboarding-bottom", reduced ? "12px" : "max(16px, env(safe-area-inset-bottom))");
    if (pendingInput) revealField(pendingInput);
    pendingInput = null;
  }
  const queue = () => { if (!frame) frame = win.requestAnimationFrame(update); };
  const reveal = (input = win.document.activeElement) => { pendingInput = input; queue(); };
  const resize = () => {
    if (win.document.activeElement?.matches('input:not([type="radio"]),textarea,select')) pendingInput = win.document.activeElement;
    queue();
  };
  const editing = event => {
    if (event.target.matches('input:not([type="radio"]),textarea,select')) reveal(event.target);
  };
  viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize);
  win.addEventListener("resize", resize); panel.addEventListener("focusin", editing);
  // A tap on an already-focused input can trigger native input-only scrolling
  // without another focusin; reveal its label/error after that default action.
  panel.addEventListener("click", editing); panel.addEventListener("input", editing); update();
  return { reveal, dispose() {
    win.cancelAnimationFrame(frame);
    viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize);
    win.removeEventListener("resize", resize); panel.removeEventListener("focusin", editing);
    panel.removeEventListener("click", editing); panel.removeEventListener("input", editing);
    for (const key of ["height", "top", "bottom"]) panel.style.removeProperty(`--onboarding-${key}`);
    delete panel.dataset.viewportReduced;
  } };
}
