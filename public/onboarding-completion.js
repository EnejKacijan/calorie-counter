// The caller has confirmed storage and prepared the destination module/styles.
// Navigation never waits for animation completion.
export async function presentOnboardingCompletion(commit, win = window) {
  const doc = win.document;
  if (win.matchMedia("(prefers-reduced-motion: reduce)").matches) { commit(); return; }
  if (typeof doc.startViewTransition === "function") {
    doc.documentElement.classList.add("onboarding-completion");
    const transition = doc.startViewTransition(commit);
    const clean = () => doc.documentElement.classList.remove("onboarding-completion");
    transition.finished.then(clean, clean);
    await transition.updateCallbackDone;
  } else {
    commit();
    // Older engines: destination-only fade, correct values from its first frame.
    doc.querySelector(".app-shell")?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
  }
}
