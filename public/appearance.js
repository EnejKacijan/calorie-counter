export const resolveAppearance = (preference, dark) => preference === "system" ? dark ? "dark" : "light" : preference === "dark" ? "dark" : "light";
export function paintAppearance(doc, theme) {
  const dark = theme === "dark", color = dark ? "#1b1a16" : "#fbfaf6";
  if (doc.body.dataset.theme !== theme) doc.body.dataset.theme = theme;
  doc.documentElement.style.backgroundColor = color;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute("content", dark ? "black-translucent" : "default");
}
// Resolve the optional appearance setting across the existing shell without
// writing profile/diary data when the OS changes theme.
export function mountAppearance(scope, storage) {
  let preference;
  try { preference = JSON.parse(storage.getItem("calorie-counter-state") || "null")?.user?.themePreference; } catch { /* recovery owns corrupt data */ }
  const media = scope.window.matchMedia("(prefers-color-scheme: dark)");
  const paint = () => { if (["system", "light", "dark"].includes(preference)) paintAppearance(scope.document, resolveAppearance(preference, media.matches)); };
  scope.window.addEventListener("intake:appearance", event => { preference = event.detail; paint(); });
  media.addEventListener("change", paint); scope.onDispose(() => media.removeEventListener("change", paint));
  const observer = new scope.MutationObserver(paint); observer.observe(scope.document.body, { attributes: true, attributeFilter: ["data-theme"] });
  paint();
}
