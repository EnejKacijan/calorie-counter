import { createFoodMediaStore, collectPhotoReferences } from './food-media.js?v=2';
let recoveryData = () => ({}), timer;
export function configurePhotoRecovery(read) { recoveryData = read; }
export function hasRecoverablePhoto(id) {
  try { return collectPhotoReferences(recoveryData()).has(id); }
  catch { return true; } // Inaccessible recovery data is not permission to delete.
}
const nativeReferences = () => {
  const data = {};
  for (const key of Object.keys(localStorage)) if (key.startsWith('calorie-counter-')) data[key] = localStorage.getItem(key);
  return collectPhotoReferences(data);
};
export const foodMedia = createFoodMediaStore({ confirmedReferences: nativeReferences, references: () => {
  const ids = nativeReferences();
  const journal = localStorage.getItem('intake-restore-journal-v1');
  if (journal) for (const id of collectPhotoReferences(JSON.parse(journal))) ids.add(id);
  for (const id of collectPhotoReferences(recoveryData())) ids.add(id);
  return ids;
} });
export function collectFoodMediaSoon() {
  clearTimeout(timer); timer = setTimeout(() => foodMedia.collect().catch(() => {}), 500);
}
export async function withFoodPhotos(ids, action) {
  if (!ids.filter(Boolean).length) return action(new Set());
  const lease = await foodMedia.hold(ids);
  try { return await action(new Set(lease.ids)); }
  finally { await lease.release().catch(() => {}); collectFoodMediaSoon(); }
}
export function foodPhotoNotice(message) {
  let node = document.getElementById('foodPhotoNotice');
  if (!node) { node = document.createElement('aside'); node.id = 'foodPhotoNotice'; node.className = 'food-photo-notice'; node.setAttribute('role', 'status'); document.body.append(node); }
  node.replaceChildren(); const p = document.createElement('span'); p.textContent = message;
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Dismiss'; close.onclick = () => node.remove(); node.append(p, close);
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', collectFoodMediaSoon);
  collectFoodMediaSoon();
}
