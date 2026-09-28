import { mediaIdValid } from './food-media.js?v=2';

// A capture is the existing immutable media asset, allocated once per scan.
// No byte matching, timestamp clustering, parallel database or legacy guessing.
export function captureContext(food, entries) {
  if (!mediaIdValid(food?.captureId)) return null;
  const foods = entries.filter(entry => entry.captureId === food.captureId);
  if (!foods.length) return null;
  const meals = new Map();
  for (const entry of foods) { const meal = entry.meal || 'snack'; meals.set(meal,(meals.get(meal)||0)+1); }
  const order = ['breakfast','lunch','dinner','snack'];
  const counts = [...meals].sort((a,b)=>b[1]-a[1] || order.indexOf(a[0])-order.indexOf(b[0]) || a[0].localeCompare(b[0]));
  return {id:food.captureId,foods,count:foods.length,meal:counts[0][0],counts};
}
export function captureBlocks(foods, allEntries) {
  const seen = new Set(), blocks = [];
  for (const food of foods) {
    const context = captureContext(food,allEntries);
    if (!context || context.meal !== (food.meal || 'snack')) { blocks.push({foods:[food]}); continue; }
    if (seen.has(context.id)) continue;
    seen.add(context.id);
    blocks.push({capture:context,foods:foods.filter(entry=>entry.captureId===context.id)});
  }
  return blocks;
}
export function sharedPlateCover(foods) {
  const id = foods[0]?.captureId;
  return mediaIdValid(id) && foods.every(food=>food.captureId===id) ? id : undefined;
}
export function createCaptureDraft(media) {
  let draft;
  return {
    async stage(photo) {
      if (!photo.normalized) return mediaIdValid(photo.id) ? photo.id : null;
      if (draft?.normalized !== photo.normalized) {
        const next = {normalized:photo.normalized};
        next.pending = media.put(photo.normalized).catch(error=>{if(draft===next)draft=null;throw error;});
        draft = next;
      }
      return draft.pending;
    },
    clear() { draft = null; },
  };
}
