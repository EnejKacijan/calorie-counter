import { createSafeStorage } from "./data-safety.js?v=1";
import { apiOrigin } from "./runtime-config.js";
import { lockSurfaceScroll } from "./mobile-surface.js?v=3";
import { foodMedia, configurePhotoRecovery, foodPhotoNotice } from './food-media-runtime.js?v=2';
import { exportPhotoBackup, readPhotoBackup, restorePhotoBackup } from './food-media-backup.js?v=2';
let native;
try { native = window.localStorage; } catch { native = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); }, get length() { throw Error(); } }; }
export const storage = createSafeStorage(native, () => renderWarning());
configurePhotoRecovery(() => JSON.parse(storage.export()).data);
async function download(includePhotos = true) {
  let result;
  try { result = await exportPhotoBackup(storage, foodMedia, includePhotos); }
  catch {
    // Recovery must still be possible when IndexedDB or core parsing fails.
    result = { blob: new Blob([JSON.stringify({ ...JSON.parse(storage.export()), photosIncluded: false })], { type: 'application/json' }), extension: 'json' };
    foodPhotoNotice('Data-only recovery copy downloaded. Food photos are NOT included because photo export was unavailable.');
  }
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a"); link.href = url; link.download = `intake-backup-${new Date().toISOString().slice(0,10)}.${result.extension}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (result.missing) foodPhotoNotice(`Backup saved. ${result.missing} unavailable food photos could not be included; food records are preserved.`);
}
function renderWarning() {
  // Initialization can report a problem before the singleton has been assigned.
  queueMicrotask(() => {
    document.dispatchEvent(new Event('intake:storage-status'));
    document.querySelector("#storageWarning")?.remove();
    if (!storage.status) return;
    const banner = document.createElement("aside"); banner.id = "storageWarning"; banner.className = "storage-warning"; banner.setAttribute("role", "alert");
    const message = document.createElement("p"); message.textContent = storage.status;
    const button = document.createElement("button"); button.textContent = "Export recovery copy"; button.onclick = () => download(true);
    banner.append(message, button); document.body.append(banner);
  });
}
export function mountPrivacy(scope) {
  renderWarning();
  const root = document.querySelector("#privacyControls");
  if (!root) return;
  root.innerHTML = `<section class="privacy-group"><h3>Data storage</h3><p>Your profile, diary, saved foods and meals, and Assistant conversations stay on this device. There is no cloud sync or automatic backup. Clearing browser data or removing the app can erase them.</p></section>
    <section class="privacy-group"><h3>Food photos</h3><p>Optional photos stay on this device, separately from diary text. Retained copies are resized and re-encoded without location metadata. They are not shared with Assistant.</p><p data-photo-size>Checking local photo storage…</p></section>
    <section class="privacy-group"><h3>Backup</h3><p>Backups contain personal health information. Keep them somewhere private.</p><label class="photo-backup-choice"><input type="checkbox" data-include-photos checked> Include food photos</label><p data-photo-backup-note>On: data and photos in an .intake package. Off: text-only JSON without photo attachments. Older JSON backups are still supported.</p><div class="data-actions"><button type="button" data-action="export">Export backup</button><button type="button" data-action="import">Restore backup</button></div></section>
    <section class="privacy-group" data-recovery hidden><h3>Unsaved changes</h3><p data-recovery-message></p><div class="data-actions"><button type="button" data-action="retry">Retry saving</button></div></section>
    <section class="privacy-group"><h3>AI permissions</h3><p>Choose again what you share before your next AI request.</p><div class="data-actions"><button type="button" data-action="revoke">Reset AI permissions</button></div></section>
    <section class="privacy-group"><h3>Danger zone</h3><p>Permanently remove all INTAKE data from this device. Export a backup first if you want to keep it.</p><div class="data-actions"><button type="button" data-action="erase">Delete all local data</button></div></section>
    <section class="privacy-group"><h3>Support &amp; privacy</h3><p><a href="privacy.html">Privacy &amp; support</a></p></section><input type="file" accept=".intake,.json,application/json,application/vnd.intake.backup" hidden><p role="status" data-status></p>
    <dialog id="deleteDataConfirm" role="alertdialog" aria-labelledby="deleteDataTitle" aria-describedby="deleteDataDescription">
      <h2 id="deleteDataTitle">Delete all local data?</h2>
      <p id="deleteDataDescription">This permanently deletes your profile, body measurements, targets, food and exercise diary, food library, saved foods and meals, food photos, Assistant conversations, drafts, settings and AI permissions from this device.</p>
      <p>Export a backup first if you want to keep them. Exported copies and data already sent to providers are not deleted. This cannot be undone.</p>
      <p data-delete-status role="alert"></p>
      <form method="dialog"><button value="cancel" autofocus>Cancel</button><button id="deleteDataConfirmButton" type="button">Delete all data</button></form>
    </dialog>`;
  const status = root.querySelector("[data-status]");
  foodMedia.list().then(items => { if (scope.isActive()) root.querySelector('[data-photo-size]').textContent = `${items.length} food ${items.length === 1 ? 'photo' : 'photos'} · ${((items.reduce((sum,item) => sum+item.byteSize+item.thumbnailByteSize,0))/1_000_000).toFixed(1)} MB on this device`; }).catch(() => { if (scope.isActive()) root.querySelector('[data-photo-size]').textContent = 'Photo storage is unavailable. Your text data can still be backed up.'; });
  try { const note = sessionStorage.getItem('calorie-counter-photo-restore-note'); if (note) { sessionStorage.removeItem('calorie-counter-photo-restore-note'); foodPhotoNotice(note); } } catch {}
  const renderRecovery=()=>{root.querySelector('[data-recovery]').hidden=storage.pendingCount===0;root.querySelector('[data-recovery-message]').textContent=storage.status||'Some changes are only in memory. Retry saving or export a recovery copy before closing.';};
  renderRecovery();(scope.document||document).addEventListener?.('intake:storage-status',renderRecovery);
  scope.onDispose?.(()=>document.removeEventListener('intake:storage-status',renderRecovery));
  const file = root.querySelector('input[type="file"]');
  const confirmation = root.querySelector("#deleteDataConfirm");
  const confirmButton = root.querySelector("#deleteDataConfirmButton");
  let releaseConfirmation;
  const release = () => { releaseConfirmation?.(); releaseConfirmation = null; };
  confirmation.addEventListener('close', () => { if (!confirmation.open) release(); });
  scope.onDispose?.(() => { if (confirmation.open) confirmation.close(); release(); });
  confirmButton.addEventListener("click", async () => {
    if (!confirmation.open || confirmButton.disabled) return;
    confirmButton.disabled = true;
    try {
      storage.erase();
      await foodMedia.erase();
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("calorie-counter-") || key.startsWith("daily-fuel-")) sessionStorage.removeItem(key);
      window.IntakeResetSession?.(); location.replace("profile.html");
    } catch { root.querySelector("[data-delete-status]").textContent = "Deletion could not be completed. Export a recovery copy before trying again."; confirmButton.disabled = false; }
  });
  root.addEventListener("click", async event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    try {
      if (action === "export") {
        const button = event.target.closest('button'); if (button.disabled) return; button.disabled = true;
        try { await download(root.querySelector('[data-include-photos]').checked); } finally { button.disabled = false; }
      }
      if (action === "import") file.click();
      if (action === "retry") { storage.retry(); status.textContent = storage.status || "All pending changes are saved on this device."; }
      if (action === "revoke") { storage.removeItem("calorie-counter-ai-consent-v1"); status.textContent = "AI permissions reset. You will be asked before the next AI request. This does not recall data already sent."; }
      if (action === "erase" && !confirmation.open) {
        release(); // A previous native close event may still be queued.
        releaseConfirmation = lockSurfaceScroll(window);
        try { confirmation.showModal(); } catch (error) { release(); throw error; }
      }
    } catch { status.textContent = "Device storage could not complete this action. Your data may not be saved; export a recovery copy."; }
    renderRecovery();
  });
  file.addEventListener("change", async () => {
    try {
      const selected = file.files[0]; if (!selected) return;
      const parsed = await readPhotoBackup(selected); const data = parsed.data;
      if (!scope.isActive()) return;
      const state = JSON.parse(data["calorie-counter-state"]);
      if (!window.confirm(`Replace this device's data with this backup (${Object.keys(state.days).length} diary days)? Export your current data first. AI permissions will reset.`)) return;
      const result = await restorePhotoBackup(storage, foodMedia, parsed);
      if (result.missing) sessionStorage.setItem('calorie-counter-photo-restore-note', `Diary restored. ${result.missing} photos were missing, damaged or could not fit on this device. Food records were preserved.`);
      window.IntakeResetSession?.(); location.reload();
    } catch (error) { status.textContent = `Restore failed: ${error.message}`; }
    finally { file.value = ""; }
  });
}
export async function consentFetch(fetch, input, options = {}) {
  const path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
  if (location.protocol === "capacitor:" && path.startsWith("/api/")) {
    if (!apiOrigin) throw Error("Online features are not configured in this preview. You can still log food manually.");
    input = new URL(path + new URL(typeof input === "string" ? input : input.url, location.href).search, apiOrigin).href;
  }
  if (!["/api/foods/analyze-image", "/api/foods/analyze-label", "/api/foods/estimate-text", "/api/foods/correct-image-item", "/api/assistant/chat"].includes(path)) return fetch(input, options);
  if (!navigator.onLine) throw Error("You are offline. Your input is still here; reconnect and try again.");
  const kind = path.includes("assistant") ? "assistant" : path.includes("analyze-label") ? "label" : path.includes("analyze-image") ? "photo" : "food-text";
  let permissions; try { permissions = JSON.parse(storage.getItem("calorie-counter-ai-consent-v1") || "{}"); } catch { permissions = {}; }
  if (permissions?.[kind] !== true) {
    const description = kind === "label" ? "Your selected nutrition label photo will be sent through Intake's server to OpenAI to transcribe the printed nutrition values. Avoid photos containing personal information."
      : kind === "assistant"
      ? "Your message and conversation history will be sent through Intake's server to OpenAI. If diary context is enabled, your selected food and exercise logs, body measurements and nutrition goals are included. Previous messages can also contain diary details."
      : kind === "photo" ? "Your selected food photo will be sent through Intake's server to OpenAI to estimate foods and portions. Avoid photos containing faces or other personal information."
      : "Your food description or correction and the food details being corrected will be sent through Intake's server to OpenAI to estimate nutrition. Food search terms may also be sent to USDA.";
    if (!window.confirm(`${description}\n\nAI estimates can be wrong; review them before logging. You can use manual logging without AI and reset this permission in Profile.\n\nAllow this type of AI request?`)) throw Error("Not sent. AI sharing was not allowed; you can use manual logging instead.");
    storage.setItem("calorie-counter-ai-consent-v1", JSON.stringify({ ...permissions, [kind]: true }));
  }
  const headers = new Headers(options.headers); headers.set("X-Intake-AI-Consent", "1");
  return fetch(input, { ...options, headers });
}
