import { localRecordId } from './local-record-id.js?v=1';

export const MEDIA_DB = 'intake-food-media-v1';
export const mediaIdValid = id => typeof id === 'string' && /^photo-[a-zA-Z0-9-]{8,80}$/.test(id);
export const photoFields = ['photoMediaId', 'coverImageId', 'captureId'];
const contentKeys = ['calorie-counter-state', 'calorie-counter-food-library', 'calorie-counter-saved-foods', 'calorie-counter-saved-meals'];
export function transformPhotoReferences(data, transform) {
  const next = { ...data };
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const field of photoFields) if (field in value) {
      const id = transform(value[field]);
      if (mediaIdValid(id)) value[field] = id; else delete value[field];
    }
    for (const item of Object.values(value)) if (item && typeof item === 'object') visit(item);
  };
  for (const key of contentKeys) if (typeof next[key] === 'string') {
    const value = JSON.parse(next[key]); visit(value); next[key] = JSON.stringify(value);
  }
  return next;
}
export function collectPhotoReferences(data) {
  const ids = new Set(); transformPhotoReferences(data, id => { if (mediaIdValid(id)) ids.add(id); return id; }); return ids;
}
export function savedPhotoDefinition(food, existing) {
  const copy = { ...food };
  delete copy.photoMediaId;
  delete copy.coverImageId;
  delete copy.captureId;
  const cover = existing ? existing.coverImageId : food.coverImageId || food.photoMediaId;
  if (mediaIdValid(cover)) copy.coverImageId = cover;
  return copy;
}
export function retainedScannerPhoto(mode, file, foodCount) { return mode === 'food' && foodCount > 0 && file instanceof Blob ? file : null; }
function storedPhotoBlob(record) { return record?.blob instanceof Blob ? record.blob : record?.bytes instanceof ArrayBuffer ? new Blob([record.bytes], { type: 'image/jpeg' }) : null; }

// Re-encoding raster pixels strips EXIF/GPS. Decoders apply EXIF orientation;
// createImageBitmap's explicit from-image option is also used where supported.
export async function normalizeFoodPhoto(file, { longEdge = 1920, thumbnailEdge = 160 } = {}) {
  if (!(file instanceof Blob) || !file.size || file.size > 60_000_000) throw Error('Choose a photo smaller than 60 MB.');
  if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/i.test(file.type)) throw Error('Choose a supported photo (JPEG, PNG, WebP or a device-supported HEIC).');
  let decoded, url;
  try {
    try { decoded = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {
      url = URL.createObjectURL(file); decoded = new Image(); decoded.src = url; await decoded.decode();
    }
    const width = decoded.width || decoded.naturalWidth, height = decoded.height || decoded.naturalHeight;
    if (!width || !height || width * height > 100_000_000) throw Error('This photo is too large to process safely.');
    const encode = async (edge, quality) => {
      const ratio = Math.min(1, edge / Math.max(width, height)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
      const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Photo processing is unavailable.');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob?.size) throw Error('Could not prepare this photo.');
      const result = { blob, width: canvas.width, height: canvas.height }; canvas.width = canvas.height = 1; return result;
    };
    const full = await encode(longEdge, .86), thumbnail = await encode(thumbnailEdge, .78);
    return { full: full.blob, thumbnail: thumbnail.blob, width: full.width, height: full.height,
      thumbnailWidth: thumbnail.width, thumbnailHeight: thumbnail.height, mimeType: 'image/jpeg',
      byteSize: full.blob.size, thumbnailByteSize: thumbnail.blob.size };
  } finally { decoded?.close?.(); if (url) URL.revokeObjectURL(url); }
}

export function createFoodMediaStore({ indexedDB = globalThis.indexedDB, references = () => new Set(), confirmedReferences = () => new Set(), now = Date.now } = {}) {
  let database;
  const open = () => database ||= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(Error('Photo storage is unavailable.')); return; }
    const request = indexedDB.open(MEDIA_DB, 1);
    request.onupgradeneeded = () => {
      for (const name of ['assets', 'blobs', 'leases']) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onerror = () => { database = null; reject(request.error); };
    request.onblocked = () => reject(Error('Close other Intake windows to use photo storage.'));
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = null; }; resolve(request.result); };
  });
  const tx = async (stores, mode, action) => {
    const db = await open(); return new Promise((resolve, reject) => {
      const transaction = db.transaction(stores, mode); let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || Error('Photo storage failed.'));
      try { action(Object.fromEntries(stores.map(name => [name, transaction.objectStore(name)])), value => { result = value; }); }
      catch (error) { transaction.abort(); reject(error); }
    });
  };
  const api = {
    async put(image) {
      if (!(image.full instanceof Blob) || !(image.thumbnail instanceof Blob) || image.mimeType !== 'image/jpeg'
        || ![image.width,image.height,image.thumbnailWidth,image.thumbnailHeight].every(n => Number.isInteger(n) && n > 0)
        || Math.max(image.width, image.height) > 1920 || Math.max(image.thumbnailWidth,image.thumbnailHeight) > 192
        || !image.full.size || !image.thumbnail.size || image.full.type !== 'image/jpeg' || image.thumbnail.type !== 'image/jpeg'
        || image.full.size > 8_000_000 || image.thumbnail.size > 200_000) throw Error('Invalid normalized food photo.');
      const id = 'photo-' + localRecordId(), { full, thumbnail, ...metadata } = image;
      // Binary ArrayBuffers avoid Blob serialization failures in some WebKit
      // storage backends. No base64/JSON expansion; readers return image Blobs.
      const [fullBytes, thumbnailBytes] = await Promise.all([full.arrayBuffer(), thumbnail.arrayBuffer()]);
      await tx(['assets', 'blobs'], 'readwrite', stores => {
        stores.assets.add({ ...metadata, byteSize: full.size, thumbnailByteSize: thumbnail.size, id, createdAt: new Date(now()).toISOString(), stagedUntil: now() + 300_000 });
        stores.blobs.add({ id: id + ':full', bytes: fullBytes }); stores.blobs.add({ id: id + ':thumb', bytes: thumbnailBytes });
      }); return id;
    },
    async get(id, kind = 'thumb') {
      if (!mediaIdValid(id) || !['thumb', 'full'].includes(kind)) return null;
      return tx(['blobs'], 'readonly', (s, done) => { s.blobs.get(id + ':' + kind).onsuccess = e => done(storedPhotoBlob(e.target.result)); });
    },
    getThumbnails(ids) { return tx(['blobs'], 'readonly', (s, done) => {
      const result = new Map(); done(result);
      for (const id of new Set(ids)) if (mediaIdValid(id)) s.blobs.get(id + ':thumb').onsuccess = e => result.set(id, storedPhotoBlob(e.target.result));
    }); },
    list() { return tx(['assets'], 'readonly', (s, done) => { s.assets.getAll().onsuccess = e => done(e.target.result); }); },
    async hold(ids, { undo = false } = {}) {
      const id = 'lease-' + localRecordId(), kept = [];
      await tx(['assets', 'leases'], 'readwrite', s => {
        for (const mediaId of new Set(ids)) if (mediaIdValid(mediaId)) s.assets.get(mediaId).onsuccess = e => {
          if (e.target.result) { kept.push(mediaId); s.leases.put({ id, ids: [...kept], expiresAt: now() + (undo ? 86_400_000 : 300_000) }); }
        };
      });
      return { id, ids: kept, async renew() { await tx(['leases'], 'readwrite', s => s.leases.put({ id, ids: kept, expiresAt: now() + 86_400_000 })); },
        async release() { await tx(['leases'], 'readwrite', s => s.leases.delete(id)); } };
    },
    async settle(ids, { recovery = false } = {}) {
      await tx(['assets'], 'readwrite', s => { for (const id of ids) s.assets.get(id).onsuccess = e => {
        const value = e.target.result; if (value) s.assets.put({ ...value, stagedUntil: 0, recovery, recoveryUntil: recovery ? now() + 86_400_000 : 0 });
      }; });
    },
    async collect() {
      // A lease is acquired BEFORE introducing any new reference. IDB serializes
      // that acquisition with this transaction, including across windows.
      return tx(['assets', 'blobs', 'leases'], 'readwrite', (s, done) => {
        s.leases.getAll().onsuccess = event => {
          const held = new Set(); for (const lease of event.target.result) {
            if (lease.expiresAt > now()) lease.ids.forEach(id => held.add(id)); else s.leases.delete(lease.id);
          }
          s.assets.getAll().onsuccess = event => {
            let refs, confirmed; try { refs = references(); confirmed = confirmedReferences(); } catch { done(0); return; } // Corrupt/inaccessible core or journal: never guess.
            let count = 0;
            for (const asset of event.target.result) {
              const recovered = asset.recovery && confirmed.has(asset.id);
              if (recovered) s.assets.put({ ...asset, recovery: false, recoveryUntil: 0 });
              if (refs.has(asset.id) || held.has(asset.id) || asset.stagedUntil > now() || asset.recovery && !recovered && asset.recoveryUntil > now()) continue;
              s.assets.delete(asset.id); s.blobs.delete(asset.id + ':full'); s.blobs.delete(asset.id + ':thumb'); count++;
            } done(count);
          };
        };
      });
    },
    erase() { return tx(['assets', 'blobs', 'leases'], 'readwrite', s => { for (const store of Object.values(s)) store.clear(); }); },
  };
  return api;
}
