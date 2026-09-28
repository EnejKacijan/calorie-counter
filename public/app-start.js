/* Classic entry: the HTML marks the existing UI inert until its module mounts. */
(function startIntake() {
  const status = document.querySelector('#appStartupStatus');
  window.IntakeStartup = {
    complete() {
      document.documentElement.removeAttribute('data-intake-starting');
      document.body.removeAttribute('data-app-loading');
      document.querySelectorAll('[data-startup-surface]').forEach(surface => {
        surface.removeAttribute('data-startup-surface');
        surface.removeAttribute('aria-busy');
        surface.inert = false;
      });
      status?.remove();
    },
    fail() {
      if (!status) return;
      document.querySelectorAll('[data-startup-surface]').forEach(surface => { surface.inert = true; });
      status.querySelector('span').textContent = "Intake couldn't open. Reload to try again.";
      status.querySelector('button').hidden = false;
      status.setAttribute('role', 'alert');
    },
  };
  status?.querySelector('button').addEventListener('click', () => location.reload());
  import('./app-router.js?v=48').catch(() => window.IntakeStartup.fail());
})();
