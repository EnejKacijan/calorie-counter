if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
    });
  });
}

document.querySelectorAll("a.is-active[href]").forEach((link) => {
  link.setAttribute("aria-current", "page");
});

document.querySelectorAll('[role="tablist"] button').forEach((tab) => {
  tab.setAttribute("role", "tab");
  if (!tab.hasAttribute("aria-selected")) {
    tab.setAttribute("aria-selected", String(tab.getAttribute("aria-pressed") === "true"));
  }
  tab.removeAttribute("aria-pressed");
  const controls = tab.dataset.addMode === "food"
    ? "foodSection"
    : tab.dataset.addMode === "exercise"
      ? "exerciseSection"
      : tab.dataset.progressView
        ? `${tab.dataset.progressView}ProgressView`
        : tab.dataset.nutritionMetric || tab.dataset.nutritionRange
          ? "nutritionChart"
          : "";
  if (controls) tab.setAttribute("aria-controls", controls);
  const syncTabIndex = () => {
    const selected = tab.getAttribute("aria-selected") === "true" || tab.getAttribute("aria-pressed") === "true";
    tab.tabIndex = selected ? 0 : -1;
  };
  syncTabIndex();
  new MutationObserver(syncTabIndex).observe(tab, { attributes: true, attributeFilter: ["aria-selected", "aria-pressed"] });
});

document.querySelectorAll('[role="tablist"]').forEach((tablist) => {
  tablist.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]:not([disabled])'));
    if (!tabs.length) return;
    const currentIndex = Math.max(0, tabs.indexOf(document.activeElement));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (currentIndex + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  });
});

document.querySelectorAll("[data-progress-panel]").forEach((panel) => {
  panel.setAttribute("role", "tabpanel");
});
