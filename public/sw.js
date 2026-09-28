const cacheName = "intake-v170";
const appShellFiles = [
  "/",
  "/index.html",
  "/progress.html",
  "/profile.html",
  "/assistant.html",
  "/styles.css",
  "/scroll-surfaces.css",
  "/form-focus.css",
  "/profile-polish.css",
  "/profile-validation.js",
  "/onboarding.js",
  "/onboarding.css",
  "/onboarding-viewport.js",
  "/onboarding-pace.js",
  "/onboarding-swipe.js",
  "/onboarding-completion.js",
  "/target-validation.js",
  "/local-record-id.js",
  "/startup.css",
  "/startup-theme.js",
  "/modern-ux.css",
  "/bottom-navigation.css",
  "/bottom-navigation.js",
  "/mobile-surface.js",
  "/semantic-back.js",
  "/back-preview.js",
  "/nested-page.js",
  "/pwa.js",
  "/app-router.js",
  "/route-focus.js",
  "/app-start.js",
  "/page-lifecycle.js",
  "/data-safety.js",
  "/privacy-controls.js",
  "/privacy.html",
  "/runtime-config.js",
  "/package-scan.js",
  "/scanner-photo.js",
  "/scanned-meal-group.js",
  "/disclosure-reveal.js",
  "/touch-feedback.js",
  "/touch-feedback.css",
  "/package-scan.css",
  "/scanner-camera.js",
  "/barcode.js",
  "/vendor/zxing-browser-0.2.1.min.js",
  "/app.js",
  "/add-entry.js",
  "/add-surface.js",
  "/add-presentation.js",
  "/add-flow.css",
  "/today-diary.js",
  "/diary-row-swipe.js",
  "/today-diary.css",
  "/food-search.js",
  "/food-display-name.js",
  "/food-search.css",
  "/motion.js",
  "/peer-tabs.js",
  "/calendar-swipe.js",
  "/calendar-swipe.css",
  "/meal-schedule.js",
  "/food-persistence.js",
  "/food-reuse.js",
  "/food-reuse.css",
  "/scanned-food.js",
  "/progress.js",
  "/progress.css",
  "/profile.js",
  "/profile-settings.js",
  "/profile-surface.js",
  "/profile-settings.css",
  "/appearance.js",
  "/assistant.js",
  "/assistant-scroll.js",
  "/assistant-message-actions.js",
  "/diary-context-focus.js",
  "/food-media.js",
  "/plate-capture.js",
  "/food-media-runtime.js",
  "/food-media-backup.js",
  "/food-photo-ui.js",
  "/food-photo-motion.js",
  "/photo-dismiss.js",
  "/food-photos.css",
  "/assistant-usability.css",
  "/favicon.svg",
  "/app-icon-180.png",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/app-icon-1024.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName)
      .then((cache) => cache.addAll(appShellFiles)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("intake-v") && key !== cacheName).map((key) => caches.delete(key)))),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    serveShell(event, request, true);
    return;
  }

  if (isVersionedAppAsset(url.pathname)) {
    serveShell(event, request, false);
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});

function serveShell(event, request, navigation) {
  // A controlling worker owns one immutable app shell. Refreshing cached HTML
  // or modules in the background can mix two deployments in an open PWA.
  // A newly installed worker waits until the old clients close before taking
  // over; only cache misses are fetched by this worker.
  event.respondWith(caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request)
      || await cache.match(urlPath(request))
      || (navigation && await cachedNavigationAlias(cache, urlPath(request)));
    if (cached) return cached;
    try {
      const response = await fetchAndCache(request);
      if (response?.ok) return response;
      const fallback = await cache.match(request, { ignoreSearch: true }) || (navigation && await cachedNavigationAlias(cache, urlPath(request)));
      return fallback || response;
    } catch (error) {
      const fallback = await cache.match(request, { ignoreSearch: true }) || (navigation && await cachedNavigationAlias(cache, urlPath(request)));
      if (fallback) return fallback;
      if (navigation) {
        const home = await cache.match("/index.html");
        if (home) return home;
      }
      throw error;
    }
  }));
}

function urlPath(request) {
  return new URL(request.url).pathname;
}

function cachedNavigationAlias(cache, pathname) {
  const target = ({ "/": "/index.html", "/index": "/index.html",
    "/assistant": "/assistant.html", "/progress": "/progress.html",
    "/profile": "/profile.html" })[pathname];
  return target ? cache.match(target) : undefined;
}

function isVersionedAppAsset(pathname) {
  return appShellFiles.includes(pathname) || [".css", ".js", ".webmanifest"].some((extension) => pathname.endsWith(extension));
}

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (!response || response.status !== 200) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}
