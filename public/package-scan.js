import { normalizeBarcode } from "./barcode.js?v=1";
import { createScannerCamera } from "./scanner-camera.js?v=2";
import { lockSurfaceScroll, bindSurfaceViewport, isolateSurfaceBackground } from "./mobile-surface.js?v=3";
import { bindSemanticBack, liveBackMotion } from "./semantic-back.js?v=4";
import { createAddPresentation } from './add-presentation.js?v=6';
import { animateAddMode } from "./add-surface.js?v=16";
import { normalizeFoodPhoto } from './food-media.js?v=2';
import { createScannerPhoto } from './scanner-photo.js?v=1';
let decoderLoading;
export const CAMERA_PENDING_MS = 5000;
export const SCANNER_BUILD = "scanner-8";
let sessionNumber = 0;
export function scannerTraceEnabled(location) {
  return new URLSearchParams(location.search).get("scannerTrace") === "1"
    && /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/.test(location.hostname);
}
export function cameraExplanation(errorName, secure = true) {
  if (!secure) return "Live camera needs a secure (HTTPS) connection. Choose a photo instead.";
  if (errorName === "CameraUnsupportedError") return "Live camera is not available in this browser. Choose a photo instead.";
  if (errorName === "NotAllowedError" || errorName === "SecurityError") return "Camera access was not allowed. Check this site's camera permission, or choose a photo.";
  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") return "No camera was found. Choose a photo instead.";
  if (errorName === "NotReadableError" || errorName === "TrackStartError") return "The camera could not start. It may be in use. Try again or choose a photo.";
  return "The camera preview could not start. Try again or choose a photo.";
}
async function decodePhoto(imageUrl) {
  if (!globalThis.ZXingBrowser) {
    decoderLoading ||= new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = "/vendor/zxing-browser-0.2.1.min.js";
      script.onload = resolve; script.onerror = () => { script.remove(); decoderLoading = null; reject(Error("Barcode reader could not load. Enter the printed number instead.")); };
      document.head.append(script);
    });
    await decoderLoading;
  }
  try { return normalizeBarcode((await new globalThis.ZXingBrowser.BrowserMultiFormatReader().decodeFromImageUrl(imageUrl)).getText()); }
  catch { throw Error("No readable barcode found. Try a sharper photo or enter the printed number."); }
}
export function mountPackageScan({ document, window, fetch, isActive, onDispose, prepareParent, resizeImage, onFood, onFoodAnalysis, onManual }) {
  let current, suspend, historyRelease, intent = 0;
  const close = (reason = "owner-close") => { intent++; current?.({ reason }); };
  // Keep file inputs alive while the system camera/gallery covers the web view.
  const background = () => { if (document.hidden) suspend?.(); };
  const pagehide = () => { intent++; current?.({ fromHistory: true, reason: "pagehide" }); };
  document.addEventListener("visibilitychange", background);
  window.addEventListener("pagehide", pagehide);
  onDispose?.(() => {
    close("route-dispose");
    document.removeEventListener("visibilitychange", background);
    window.removeEventListener("pagehide", pagehide);
  });
  async function open(initialMode = "food", { photoSession = null } = {}) {
    close("superseded");
    const request = intent;
    // Let the previous scanner's history entry unwind before a rapid reopening.
    if (historyRelease) await historyRelease;
    if (request !== intent || !isActive()) return;
    let mode = ["food", "barcode", "label"].includes(initialMode) ? initialMode : "food", job = 0, controller, busy = false, ready = false, closed = false;
    let cameraGeneration = 0, pendingTimer, cameraState = "idle", pickerGeneration = 0, lastAttempt, capturing = false;
    let selectedIndex = null, animations = [], presentation;
    let photoUrl = null, foodPhase = 'source';
    // This is an ephemeral history marker, not a persisted record or security token.
    // Do not require secure-context-only randomUUID before wiring any controls.
    const historyMarker = `scanner-${Date.now()}-${++sessionNumber}`;
    const focused = document.activeElement;
    const opener = focused?.matches("input,textarea,select") || focused === document.body || !focused?.getClientRects().length
      ? document.querySelector("#foodScanButton") : focused;
    focused?.blur?.();
    prepareParent?.();
    const dialog = document.createElement("dialog");
    dialog.className = "package-scan-dialog unified-scanner";
    dialog.setAttribute("aria-labelledby", "packageScanTitle");
    dialog.innerHTML = `<div class="scanner-header"><header><button type="button" class="package-scan-close" aria-label="Close scanner"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg></button><h2 id="packageScanTitle" tabindex="-1" autofocus>Scan food</h2></header>
      <div class="scanner-modes" role="group" aria-label="Scan type"><span class="scanner-mode-indicator" aria-hidden="true"></span><button type="button" data-mode="food">Food photo</button><button type="button" data-mode="barcode">Barcode</button><button type="button" data-mode="label" aria-label="Nutrition label">Label</button></div></div>
      <div class="scanner-body"><p class="scanner-hint" id="scannerHint" aria-live="polite"></p>
      <div class="scanner-surface"><video muted playsinline aria-label="Camera preview" hidden></video><img class="scanner-photo-preview" alt="Selected food photo" hidden><div class="scanner-placeholder" role="status">Opening camera…</div></div>
      <div class="scanner-photo-status" role="status" aria-live="polite" aria-atomic="true" hidden><span class="scanner-photo-spinner" aria-hidden="true"></span><div><strong></strong><p></p></div></div>
      <p class="package-scan-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <button type="button" data-food-analyze hidden>Analyze photo</button>
      <div class="scanner-controls"><button type="button" data-shutter disabled aria-label="Capture food photo">Take photo</button><button type="button" data-gallery>Choose photo</button><button type="button" data-camera>Use device camera</button></div>
      <button type="button" data-camera-retry hidden>Resume camera</button>
      <input data-photo type="file" accept="image/*" capture="environment" hidden><input data-gallery-file type="file" accept="image/*" hidden>
      <div data-manual hidden><label class="package-code-label">Barcode number<input data-code type="text" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="Enter printed number"></label><button type="button" data-find>Find product</button></div>
      <div class="scanner-recovery" hidden><button type="button" data-retry>Try again</button><button type="button" data-label>Scan nutrition label</button></div>
      <button type="button" data-enter-manual>Add food manually</button></div>`;
    dialog.setAttribute("aria-describedby", "scannerHint");
    const tracing = scannerTraceEnabled(window.location), traceListeners = [];
    function trace(event, detail = {}) {
      if (!tracing) return;
      const entry = { event, time: Math.round(window.performance.now()), session: historyMarker, mode, job, pickerGeneration, busy, capturing, cameraState, closed, ...detail };
      const entries = window.__intakeScannerTrace ||= [];
      entries.push(entry); if (entries.length > 200) entries.shift();
      window.console.debug("[scanner trace]", entry);
    }
    if (tracing) {
      const targetName = target => target === dialog ? "dialog" : target?.matches?.('input[type=file]') ? "file-input" : target?.matches?.('input') ? "input" : target?.closest?.('[data-mode]') ? "mode-button" : target?.tagName?.toLowerCase() || "window";
      for (const [owner, types] of [[dialog, ["click", "submit", "cancel", "close", "focusin", "focusout"]], [window, ["focus", "blur", "pagehide", "popstate"]], [document, ["visibilitychange"]]]) {
        for (const type of types) {
          const listener = event => trace(type, { target: targetName(event.target), hidden: document.hidden });
          owner.addEventListener(type, listener, true); traceListeners.push(() => owner.removeEventListener(type, listener, true));
        }
      }
    }
    document.body.append(dialog);
    const unlock = lockSurfaceScroll(window);
    // Explicitly isolate retained parents as well as native modal isolation:
    // shared gesture arbitration must not mistake Add's role=dialog for an
    // overlay ABOVE this scanner. Restore only each owner's prior inert state.
    const restoreParent = isolateSurfaceBackground([...document.querySelectorAll('.app-shell,.add-flow-host,.mobile-tabbar')]);
    dialog.showModal(); trace("opened");
    const releaseViewport = bindSurfaceViewport(dialog, window);
    const find = selector => dialog.querySelector(selector);
    const video = find("video"), status = find(".package-scan-status"), placeholder = find(".scanner-placeholder");
    function showPhoto() {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = photoSession ? URL.createObjectURL(photoSession.normalized?.full || photoSession.file) : null;
      const image = find('.scanner-photo-preview');
      if (photoUrl) image.src = photoUrl; else image.removeAttribute('src');
      image.hidden = !photoUrl;
    }
    function foodState(phase) {
      foodPhase = phase; dialog.dataset.foodPhase = mode === 'food' ? phase : '';
      const focused = mode === 'food' && phase !== 'source';
      const progress = find('.scanner-photo-status'); progress.hidden = !focused;
      progress.querySelector('strong').textContent = phase === 'error' ? "Couldn't analyze this photo." : 'Analyzing your photo';
      progress.querySelector('p').textContent = phase === 'error' ? 'Try again, choose another photo, or add food manually.' : 'Identifying foods and estimating portions…';
      progress.querySelector('.scanner-photo-spinner').hidden = phase !== 'analyzing';
      find('.scanner-modes').hidden = focused;
      find('.scanner-hint').hidden = focused;
      find('.scanner-controls').hidden = mode === 'food' && phase === 'analyzing';
      find('[data-enter-manual]').hidden = mode === 'food' && phase === 'analyzing';
      find('[data-food-analyze]').hidden = mode !== 'food' || phase !== 'source' || !photoSession;
      status.hidden = mode === 'food' && (focused || !!photoSession);
      placeholder.hidden = mode === 'food' && !!photoSession || ready;
      find('[data-gallery]').textContent = photoSession ? 'Choose another photo' : 'Choose photo';
      find('[data-retry]').textContent = mode === 'food' ? 'Retry' : 'Try again';
      find('[data-camera]').hidden = ready || mode === 'food' && focused;
    }
    const diagnostics = { build: SCANNER_BUILD, session: historyMarker, origin: window.location.origin, protocol: window.location.protocol,
      secureContext: window.isSecureContext, mediaDevices: Boolean(window.navigator.mediaDevices),
      getUserMedia: typeof window.navigator.mediaDevices?.getUserMedia === "function", phase: "opening", request: "not-requested", errorName: "" };
    function diagnose(update = {}) {
      Object.assign(diagnostics, update, { videoReadyState: video.readyState, videoWidth: video.videoWidth, videoHeight: video.videoHeight });
      // Bounded, ephemeral capability/lifecycle diagnostics only; no image or food content.
      dialog.dataset.scannerBuild = SCANNER_BUILD; dialog.dataset.cameraState = cameraState;
      window.dispatchEvent(new CustomEvent("intake:scanner-diagnostic", { detail: { ...diagnostics } }));
    }
    const camera = createScannerCamera(video, window.navigator.mediaDevices, update => diagnose(update));
    function stop() {
      cameraGeneration++; window.clearTimeout(pendingTimer); camera.stop(); ready = false; cameraState = "paused";
      video.hidden = true; placeholder.hidden = false; find("[data-shutter]").disabled = true;
      diagnose({ phase: "stopped" });
    }
    function cancel() { job++; controller?.abort(); controller = null; busy = false; capturing = false; }
    window.history.pushState({ ...window.history.state, intakeScanner: historyMarker }, "", window.location.href);
    const back = () => {
      if (window.history.state?.intakeScanner === historyMarker) return;
      if (mode === 'food' && foodPhase !== 'source') {
        sourceBack('history-back');
        window.history.pushState({ ...window.history.state, intakeScanner: historyMarker }, '', window.location.href);
      } else dismiss({ fromHistory: true, reason: 'history-back' });
    };
    window.addEventListener("popstate", back);
    const shutdown = ({ fromHistory = false, reason = "owner-close" } = {}) => {
      if (closed) return;
      presentation?.dispose();
      trace("shutdown", { closeReason: reason });
      animations.forEach(animation => animation.cancel());
      traceListeners.forEach(remove => remove());
      closed = true; pickerGeneration++; lastAttempt = null; cancel(); stop(); diagnose({ phase: "closed" }); releaseBack(); releaseViewport(); unlock();
      if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = null; photoSession = null;
      window.removeEventListener("popstate", back);
      dialog.close(); dialog.remove();
      restoreParent();
      if (opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
      if (current === shutdown) { current = null; suspend = null; }
      if (!fromHistory && window.history.state?.intakeScanner === historyMarker) {
        historyRelease = new Promise(resolve => {
          window.addEventListener("popstate", () => { historyRelease = null; resolve(); }, { once: true });
          window.history.back();
        });
      }
    };
    // Add is the SAME live parent throughout this native modal lifetime. Its
    // fields/results/scroll are never unmounted or reconstructed. The native
    // modal keeps it interaction-inert; the transparent backdrop lets it paint.
    let dismissal;
    presentation = createAddPresentation(dialog, window, () => shutdown(dismissal), { fullExit: true });
    const releaseBack = bindSemanticBack(dialog,
      () => foodPhase === 'source' ? find('.package-scan-close') : null, window, {
        getState: () => `${mode}:${foodPhase}`,
        createMotion() {
          presentation.settle();
          return { ...liveBackMotion(dialog, window), maxSettleDuration: 160 };
        },
      });
    function dismiss(options) {
      if (closed || dismissal) return;
      dismissal = options;
      // A committed edge already finished its remaining distance. Visible Back
      // uses the same full-screen exit owner, not a second sheet/route animation.
      dialog.classList.add('is-exiting');
      presentation.close({ immediate: dialog.dataset.swipeBackCommitted === 'true'
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    }
    function sourceBack(reason) {
      if (mode === 'food' && foodPhase !== 'source') {
        cancel(); pickerGeneration++; stop(); status.textContent = ''; find('.scanner-recovery').hidden = true;
        foodState('source'); controls(); find('#packageScanTitle').focus({ preventScroll: true });
        return;
      }
      dismiss({ reason });
    }
    current = shutdown;
    presentation.open({ immediate: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
    dialog.addEventListener("close", event => { if (event.target === dialog) shutdown({ reason: "dialog-close" }); });
    dialog.addEventListener("cancel", event => {
      // File inputs also emit a bubbling `cancel`. Only this dialog's own
      // dismissal request closes the scanner; picker cancellation is local.
      if (event.target !== dialog) return;
      event.preventDefault(); sourceBack("dialog-cancel");
    });
    find(".package-scan-close").onclick = () => sourceBack("close-button");
    dialog.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); sourceBack("escape"); return; }
      if (event.key !== "Tab") return;
      const targets = [...dialog.querySelectorAll("button:not(:disabled),input:not(:disabled)")].filter(el => el.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === find("#packageScanTitle"))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    const alive = token => !closed && isActive() && job === token;
    function controls() {
      // Keep the live analysis status outside a busy subtree so assistive
      // technology can announce it while the request is still pending.
      dialog.setAttribute("aria-busy", String(mode !== 'food' && (busy || capturing)));
      find('.scanner-surface').setAttribute('aria-busy', String(busy || capturing));
      dialog.querySelectorAll(".scanner-controls button,input,[data-find],.scanner-recovery button").forEach(button => button.disabled = busy || capturing);
      find("[data-shutter]").disabled = busy || capturing || !ready;
      find("[data-shutter]").hidden = !ready;
      find("[data-camera]").hidden = ready;
      dialog.dataset.cameraReady = String(ready);
      dialog.dataset.cameraState = cameraState;
      const cameraRetry = find("[data-camera-retry]");
      if (cameraRetry) {
        cameraRetry.hidden = busy || !["error", "paused"].includes(cameraState) || !diagnostics.getUserMedia || !diagnostics.secureContext;
        cameraRetry.disabled = busy; cameraRetry.textContent = cameraState === "error" ? "Retry camera" : "Resume camera";
      }
      const manual = find("[data-enter-manual]");
      if (manual) manual.disabled = busy;
      foodState(foodPhase);
    }
    suspend = () => { if (busy && mode === 'food') return; cancel(); stop(); status.textContent = ""; placeholder.textContent = diagnostics.getUserMedia && diagnostics.secureContext ? "Camera paused. Resume the camera or choose a photo." : "Choose a photo to continue."; controls(); };
    async function start() {
      stop(); const token = cameraGeneration; cameraState = "starting";
      placeholder.textContent = "Opening camera… You can also choose a photo.";
      diagnose({ phase: "opening", request: "not-requested", errorName: "" }); controls();
      pendingTimer = window.setTimeout(() => {
        if (closed || token !== cameraGeneration || cameraState !== "starting") return;
        cameraState = "pending";
        placeholder.textContent = diagnostics.request === "resolved"
          ? "The camera preview is taking longer than expected. You can choose a photo or go back."
          : "Still waiting for camera access. Respond to any permission request, or choose a photo. You can also go back.";
        diagnose({ phase: "pending-explanation" }); controls();
      }, CAMERA_PENDING_MS);
      try {
        const started = await camera.start();
        if (closed || token !== cameraGeneration || !started) return;
        window.clearTimeout(pendingTimer); cameraState = "ready";
        ready = true; video.hidden = false; placeholder.hidden = true; diagnose(); controls();
      } catch (error) { if (!closed && token === cameraGeneration) {
        window.clearTimeout(pendingTimer); cameraState = "error";
        placeholder.textContent = cameraExplanation(error.name, diagnostics.secureContext);
        diagnose(); controls();
      } }
    }
    function select(next) {
      const nextIndex = ["food", "barcode", "label"].indexOf(next);
      if (nextIndex === selectedIndex) return;
      const previousIndex = selectedIndex; selectedIndex = nextIndex;
      const indicator = find(".scanner-mode-indicator");
      const interrupted = animations.some(animation => animation.playState === "running")
        ? window.getComputedStyle(indicator).transform : null;
      animations.forEach(animation => animation.cancel());
      cancel(); pickerGeneration++; lastAttempt = null; mode = next; status.textContent = ""; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
      if (previousIndex !== null) { photoSession = null; showPhoto(); }
      foodState('source');
      find(".scanner-recovery").hidden = true;
      dialog.querySelectorAll("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
      find("[data-manual]").hidden = mode !== "barcode";
      find(".scanner-hint").textContent = mode === "food" ? "Fit your food in the frame. Review AI estimates before adding." : mode === "barcode" ? "Keep the barcode sharp and fully visible. The photo stays on your device." : "Include the entire nutrition table and portion heading. Check AI-transcribed values before adding.";
      find("[data-shutter]").setAttribute("aria-label", `Capture ${mode} photo`);
      find("[data-shutter]").textContent = mode === "barcode" ? "Read barcode" : "Take photo";
      animations = animateAddMode(find(".scanner-mode-indicator"), find(".scanner-hint"), previousIndex, nextIndex, window);
      // Continue a rapid reversal from the visible position, not the previous
      // destination. Only presentation changes; the selected mode is already final.
      if (interrupted && animations[0]) animations[0].effect.setKeyframes([{ transform: interrupted }, { transform: indicator.style.transform }]);
      trace("mode-selected");
      // The same preview serves all modes. A pending permission request must not
      // multiply whenever the user selects a tab; only the processing job changes.
      controls(); if (!photoSession && ["idle", "paused"].includes(cameraState)) void start();
    }
    dialog.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => select(button.dataset.mode));
    async function lookup(code, signal) {
      const normalized = normalizeBarcode(code);
      find("[data-code]").value = normalized;
      const response = await fetch(`/api/foods/barcode?code=${normalized}`, { signal });
      const data = await response.json();
      if (!response.ok || !data.food) throw Error(data.error || "Product not found. Try scanning again, scan its nutrition label, or add it manually.");
      return data.food;
    }
    async function run(action, capturedMode) {
      if (busy || closed) return;
      lastAttempt = { action, capturedMode };
      cancel(); stop(); const token = job; controller = new AbortController(); const signal = controller.signal;
      busy = true; controls(); find(".scanner-recovery").hidden = true; placeholder.textContent = "Processing…";
      status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.textContent = capturedMode === "barcode" ? "Reading barcode…" : capturedMode === "label" ? "Reading nutrition label…" : "Analyzing food…";
      if (capturedMode === 'food') { status.textContent = ''; placeholder.textContent = ''; foodState('analyzing'); }
      try {
        const result = await action(signal, () => alive(token));
        if (!alive(token)) return;
        if (capturedMode === "food") { const session = photoSession; shutdown({ reason: "food-review" }); onFoodAnalysis(result.analysis, result.imageDataUrl, result.sourcePhoto, session); }
        else {
          if (!result) throw Error("Could not read complete nutrition values. Try a sharper photo or enter food manually.");
          shutdown({ reason: "product-review" }); onFood(result, capturedMode === "label");
        }
      } catch (error) { if (alive(token)) {
        if (capturedMode === 'food') foodState('error');
        else { status.setAttribute("role", "alert"); status.setAttribute("aria-live", "assertive"); status.textContent = error.message || "Scan failed. Please try again."; }
        find(".scanner-recovery").hidden = false;
        find("[data-label]").hidden = capturedMode !== "barcode";
      } }
      finally { if (alive(token)) { busy = false; placeholder.textContent = "Choose another photo or try again below."; controls(); } }
    }
    function photo(file, capturedMode, reuse = false) {
      if (!file || busy || closed) return;
      if (capturedMode === 'food' && !reuse) {
        photoSession = createScannerPhoto(file, { normalize: normalizeFoodPhoto, resize: resizeImage }); showPhoto();
      }
      const session = photoSession;
      return run(async (signal, active) => {
        if (!file.type.startsWith("image/")) throw Error("Choose an image file.");
        const imageDataUrl = capturedMode === 'food' ? (await session.prepare()).imageDataUrl : await resizeImage(file);
        if (!active()) return;
        if (capturedMode === 'food') showPhoto();
        if (capturedMode === "barcode") { const code = await decodePhoto(imageDataUrl); return active() ? lookup(code, signal) : null; }
        const response = await fetch(capturedMode === "label" ? "/api/foods/analyze-label" : "/api/foods/analyze-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl }), signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Scan failed. Please try again.");
        return capturedMode === "label" ? data.food : { imageDataUrl, sourcePhoto: file, analysis: data.analysis || { foods: data.food ? [data.food] : [], outcome: data.food ? "food_detected" : "no_food" } };
      }, capturedMode);
    }
    for (const [button, inputSelector] of [["[data-camera]", "[data-photo]"], ["[data-gallery]", "[data-gallery-file]"]]) {
      const input = find(inputSelector); let selection;
      if (!find(button)) continue;
      find(button).onclick = () => {
        if (busy || closed) return;
        selection = { mode, generation: ++pickerGeneration }; stop(); controls();
        placeholder.textContent = diagnostics.getUserMedia && diagnostics.secureContext ? "Choose a photo to continue, or resume the camera." : "Choose a photo to continue.";
        trace("picker-request", { source: button === "[data-gallery]" ? "gallery" : "camera" });
        input.value = ""; input.click(); // Synchronous native picker, independent of camera permission.
      };
      input.onchange = () => {
        const file = input.files?.[0], chosen = selection; selection = null; input.value = "";
        trace("picker-change", { hasFile: Boolean(file), stale: closed || Boolean(chosen && chosen.generation !== pickerGeneration) });
        if (closed || chosen && chosen.generation !== pickerGeneration) return;
        void photo(file, chosen?.mode || mode);
      };
      input.addEventListener("cancel", () => { trace("picker-cancel"); selection = null; controls(); });
    }
    find("[data-shutter]").onclick = () => {
      if (!ready || busy || capturing || !video.videoWidth) return;
      function captureFailed() {
        capturing = false; stop(); cameraState = "error";
        placeholder.textContent = "The photo could not be captured. Retry the camera or choose a photo.";
        diagnose({ phase: "capture-error", errorName: "CameraCaptureError" }); controls();
      }
      const capturedMode = mode;
      try {
        const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        capturing = true; controls();
        const token = job;
        canvas.toBlob(blob => { if (alive(token)) { if (blob) void photo(blob, capturedMode); else captureFailed(); } }, "image/jpeg", .9);
      } catch { captureFailed(); }
    };
    find("[data-find]").onclick = () => run(signal => lookup(find("[data-code]").value, signal), "barcode");
    find("[data-code]").onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); find("[data-find]").click(); } };
    find("[data-retry]").onclick = () => { if (lastAttempt) void run(lastAttempt.action, lastAttempt.capturedMode); };
    find('[data-food-analyze]').onclick = () => {
      if (!busy && photoSession) {
        if (lastAttempt) void run(lastAttempt.action, 'food');
        else void photo(photoSession.file, 'food', true);
      }
    };
    const retryCamera = find("[data-camera-retry]");
    if (retryCamera) retryCamera.onclick = () => { if (!busy && !closed) { photoSession = null; lastAttempt = null; showPhoto(); foodState('source'); void start(); } };
    find("[data-label]").onclick = () => { select("label"); find('[data-mode="label"]').focus(); };
    find("[data-enter-manual]").onclick = () => { shutdown({ reason: "enter-manual" }); onManual?.(); };
    select(mode);
    if (photoSession) { showPhoto(); foodState('source'); }
    // Native dialog autofocus stays on its heading, not a selected touch
    // segment. Buttons retain their normal :focus-visible keyboard treatment.
  }
  return { open, close };
}
