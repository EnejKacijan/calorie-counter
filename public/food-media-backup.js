import { parseBackup } from './data-safety.js?v=1';
import { collectPhotoReferences, transformPhotoReferences, mediaIdValid } from './food-media.js?v=2';
const MAGIC = 'INTAKE-PHOTOS-2\n', MAX_PACKAGE = 256_000_000, MAX_MANIFEST = 16_000_000;
const digest = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
async function decodesAsPhoto(blob, expected) {
  // Header bounds are checked first, so a corrupt body cannot request an
  // unbounded decode. The browser decoder validates the actual JPEG pixels.
  if (typeof Image === 'undefined') return true; // Data-only Node test runtime.
  const image = new Image(), url = URL.createObjectURL(blob);
  try { image.src = url; await image.decode(); return image.naturalWidth === expected.width && image.naturalHeight === expected.height; }
  catch { return false; }
  finally { image.removeAttribute('src'); URL.revokeObjectURL(url); }
}
export function jpegDimensions(bytes) {
  if (bytes[0] !== 255 || bytes[1] !== 216) return null;
  for (let i = 2; i + 8 < bytes.length;) {
    if (bytes[i++] !== 255) return null;
    let marker = bytes[i++]; while (marker === 255) marker = bytes[i++];
    if (marker === 217 || marker === 218) return null;
    const length = bytes[i] * 256 + bytes[i + 1]; if (length < 2) return null;
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return { width: bytes[i+5]*256+bytes[i+6], height: bytes[i+3]*256+bytes[i+4] };
    i += length;
  } return null;
}
export async function exportPhotoBackup(storage, media, include = true) {
  const backup = JSON.parse(storage.export()), references = collectPhotoReferences(backup.data);
  if (!include) return { blob: new Blob([JSON.stringify({ ...backup, photosIncluded: false, data: transformPhotoReferences(backup.data, () => null) }, null, 2)], { type: 'application/json' }), extension: 'json', missing: 0, omitted: references.size };
  const available = new Map((await media.list()).map(a => [a.id,a]));
  const files = [], chunks = [], valid = new Set(); let offset = 0, missing = 0;
  for (const id of references) {
    const metadata = available.get(id), full = await media.get(id, 'full'), thumbnail = await media.get(id, 'thumb');
    if (!metadata || !full || !thumbnail) { missing++; continue; }
    if (offset + full.size + thumbnail.size > MAX_PACKAGE - MAX_MANIFEST) throw Error('Photo backup exceeds 240 MB. Export without photos or remove unneeded photos first.');
    const { stagedUntil, recovery, recoveryUntil, ...clean } = metadata;
    files.push({ ...clean, offset, byteSize: full.size, thumbnailByteSize: thumbnail.size, fullHash: await digest(full), thumbnailHash: await digest(thumbnail) });
    chunks.push(full, thumbnail); offset += full.size + thumbnail.size; valid.add(id);
  }
  backup.data = transformPhotoReferences(backup.data, id => valid.has(id) ? id : null);
  const manifest = new Blob([JSON.stringify({ ...backup, version: 2, photosIncluded: true, media: files })]);
  if (manifest.size > MAX_MANIFEST) throw Error('Backup metadata is too large.');
  const length = new Uint8Array(4); new DataView(length.buffer).setUint32(0, manifest.size);
  return { blob: new Blob([MAGIC, length, manifest, ...chunks], { type: 'application/vnd.intake.backup' }), extension: 'intake', missing, omitted: 0 };
}
export async function readPhotoBackup(file) {
  if (file.size > MAX_PACKAGE) throw Error('Backup is too large (maximum 256 MB).');
  if (await file.slice(0, MAGIC.length).text() !== MAGIC) {
    if (file.size > 12_000_000) throw Error('JSON backup is too large (maximum 12 MB).');
    const text = await file.text(); return { data: parseBackup(text), media: [], missing: 0 };
  }
  const bytes = await file.slice(MAGIC.length, MAGIC.length + 4).arrayBuffer();
  if (bytes.byteLength !== 4) throw Error('Incomplete photo backup.');
  const length = new DataView(bytes).getUint32(0), start = MAGIC.length + 4 + length;
  if (length > MAX_MANIFEST || start > file.size) throw Error('Invalid photo backup manifest.');
  const manifest = JSON.parse(await file.slice(MAGIC.length + 4, start).text(), (key, value) => {
    if (['__proto__','constructor','prototype'].includes(key)) throw Error('Unsafe backup data.'); return value;
  });
  if (manifest.version !== 2 || manifest.format !== 'intake-backup' || !Array.isArray(manifest.media) || manifest.media.length > 5000) throw Error('Unsupported photo backup.');
  const data = parseBackup(JSON.stringify({ ...manifest, version: 1, media: undefined })), media = [], ids = new Set(); let missing = 0, end = 0;
  for (const item of manifest.media) {
    // Only bounded offsets and generated IDs are accepted. No paths are read,
    // extracted or trusted, and no ID is allowed to overwrite a local asset.
    if (!mediaIdValid(item.id) || ids.has(item.id)) { missing++; continue; } ids.add(item.id);
    const validSize = n => Number.isSafeInteger(n) && n > 0;
    if (!Number.isSafeInteger(item.offset) || item.offset < end || !validSize(item.byteSize) || item.byteSize > 8_000_000 || !validSize(item.thumbnailByteSize) || item.thumbnailByteSize > 200_000
      || start + item.offset + item.byteSize + item.thumbnailByteSize > file.size) { missing++; continue; }
    end = item.offset + item.byteSize + item.thumbnailByteSize;
    const full = file.slice(start + item.offset, start + item.offset + item.byteSize, 'image/jpeg'), thumbnail = file.slice(start + item.offset + item.byteSize, start + end, 'image/jpeg');
    const fullDimensions = jpegDimensions(new Uint8Array(await full.slice(0, 65536).arrayBuffer())), thumbDimensions = jpegDimensions(new Uint8Array(await thumbnail.slice(0, 65536).arrayBuffer()));
    if (!fullDimensions?.width || !fullDimensions.height || Math.max(fullDimensions.width, fullDimensions.height) > 1920 || !thumbDimensions?.width || !thumbDimensions.height || Math.max(thumbDimensions.width, thumbDimensions.height) > 192
      || await digest(full) !== item.fullHash || await digest(thumbnail) !== item.thumbnailHash
      || !await decodesAsPhoto(full, fullDimensions) || !await decodesAsPhoto(thumbnail, thumbDimensions)) { missing++; continue; }
    media.push({ oldId: item.id, full, thumbnail, mimeType: 'image/jpeg', ...fullDimensions, thumbnailWidth: thumbDimensions.width, thumbnailHeight: thumbDimensions.height });
  }
  return { data, media, missing };
}
export async function restorePhotoBackup(storage, media, parsed) {
  const mapping = new Map(), created = []; let missing = parsed.missing;
  const references = collectPhotoReferences(parsed.data);
  try {
    for (const item of parsed.media) {
      if (!references.has(item.oldId)) continue;
      try { const { oldId, ...image } = item, id = await media.put(image); created.push(id); mapping.set(oldId, id); }
      catch { missing++; } // Optional photo failures cannot discard the valid diary.
    }
    const data = transformPhotoReferences(parsed.data, id => mapping.get(id));
    storage.restore(JSON.stringify({ format: 'intake-backup', version: 1, data }));
    await media.settle(created).catch(() => {});
    await media.collect().catch(() => {});
    return { missing: Math.max(missing, references.size - mapping.size) };
  } catch (error) { await media.settle(created).catch(() => {}); await media.collect().catch(() => {}); throw error; }
}
