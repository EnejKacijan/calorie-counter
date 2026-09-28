/* Blocking head script: read only, before any application screen can paint. */
(function resolveStartupAppearance() {
  let state, storedTheme;
  try { state = JSON.parse(localStorage.getItem('calorie-counter-state') || 'null'); storedTheme = localStorage.getItem('calorie-counter-theme'); } catch { /* SafeStorage owns recovery; never reset data here. */ }
  const preference = state?.user?.themePreference || state?.theme || state?.user?.theme || storedTheme || 'system';
  const dark = preference === 'dark' || preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches;
  const color = dark ? '#1b1a16' : '#fbfaf6';
  document.documentElement.style.setProperty('--startup-bg', color);
  document.documentElement.style.setProperty('--startup-ink', dark ? '#f4f1e9' : '#171714');
  document.documentElement.style.backgroundColor = color;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
})();
