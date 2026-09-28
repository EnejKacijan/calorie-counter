import { normalizeFoodPhoto, mediaIdValid } from './food-media.js?v=2';
import { foodMedia } from './food-media-runtime.js?v=2';
import { lockSurfaceScroll, focusSurfaceTarget } from './mobile-surface.js?v=3';
import { bindSemanticBack, liveBackMotion, guardResidualClick } from './semantic-back.js?v=3';
import { createPhotoMotion, photoRevealFrame } from './food-photo-motion.js?v=1';
import { createPhotoDismiss } from './photo-dismiss.js?v=1';

export function boundPhotoView({ scale, x, y }, width, height, imageWidth, imageHeight) {
  scale = Math.max(1, Math.min(5, scale));
  if (scale === 1) return { scale: 1, x: 0, y: 0 };
  const fit = Math.min(width / imageWidth, height / imageHeight), dx = Math.max(0, (imageWidth * fit * scale - width) / 2), dy = Math.max(0, (imageHeight * fit * scale - height) / 2);
  return { scale, x: Math.max(-dx, Math.min(dx, x)), y: Math.max(-dy, Math.min(dy, y)) };
}
export const foodPhotoTitle = kind => kind === 'meal' ? 'Meal photo' : 'Food photo';
// Used only at entry/exit, never during drag. Also works on older WebKit without
// checkVisibility; invisible ancestors are not valid animation/focus targets.
export function photoElementVisible(node, win = window) {
  if (!node?.isConnected || !node.getClientRects().length) return false;
  for (let current = node; current; current = current.parentElement) {
    const style = win.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
  }
  return true;
}

export function createFoodPhotoViewer({ onDispose, isActive = () => true }) {
  let closeCurrent, activeMarker, pendingReturn, generation = 0, disposed = false;
  onDispose?.(() => { disposed = true; generation++; closeCurrent?.(false, true, true); });
  return { async open(id, name, opener, suppliedBlob, {kind='food'}={}) {
    const revision = ++generation, replacing = closeCurrent && history.state?.intakePhotoViewer === activeMarker;
    // A replacement owns the same history slot. A fresh open waits for an
    // already-requested history return, so its late pop cannot close the new photo.
    closeCurrent?.(false, true, true);
    if (pendingReturn) await pendingReturn;
    if (disposed || revision !== generation || !isActive()) return;
    const sourceImage = opener?.querySelector('img');
    const sourceRect = () => {
      if (!photoElementVisible(sourceImage)) return null;
      const r = sourceImage.getBoundingClientRect();
      return r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth ? r : null;
    };
    const origin = sourceRect(), hasPreview = sourceImage?.complete && sourceImage.naturalWidth;
    const title = foodPhotoTitle(kind), marker = 'food-photo-' + Date.now() + '-' + revision;
    const dialog = document.createElement('dialog'); dialog.className = 'food-photo-viewer';
    dialog.setAttribute('aria-labelledby', marker + '-title');
    dialog.innerHTML = '<div class="food-photo-scrim" aria-hidden="true"></div><header><button type="button" data-photo-close aria-label="Close photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg></button><h2 data-photo-title tabindex="-1" autofocus></h2><button type="button" data-photo-fit aria-label="Fit whole photo to screen">Fit to screen</button></header><div class="food-photo-stage"><div class="food-photo-frame"><img data-photo-full draggable="false"></div><p role="status">Opening photo…</p></div><footer><button type="button" data-photo-out aria-label="Zoom out">−</button><output aria-label="Zoom level" aria-live="polite">100%</output><button type="button" data-photo-in aria-label="Zoom in">+</button></footer>';
    const heading = dialog.querySelector('[data-photo-title]'); heading.id = marker + '-title'; heading.textContent = title;
    const image = dialog.querySelector('[data-photo-full]'), stage = dialog.querySelector('.food-photo-stage'), frame = dialog.querySelector('.food-photo-frame'), back = dialog.querySelector('[data-photo-close]'), fit = dialog.querySelector('[data-photo-fit]'), status = dialog.querySelector('[role=status]');
    image.alt = kind === 'meal' ? title : name ? `Food photo: ${name}` : title;
    let preview;
    if (hasPreview) {
      // Copy already-decoded pixels only, not a borrowed/revocable thumbnail URL.
      // This small transient bitmap never touches media storage or the diary.
      try {
        preview = document.createElement('canvas'); const scale = Math.min(1,400 / Math.max(sourceImage.naturalWidth,sourceImage.naturalHeight));
        preview.width = Math.round(sourceImage.naturalWidth * scale); preview.height = Math.round(sourceImage.naturalHeight * scale);
        preview.getContext('2d').drawImage(sourceImage,0,0,preview.width,preview.height); preview.setAttribute('aria-hidden','true'); preview.dataset.photoPreview = '';
        frame.append(preview); image.dataset.loading = ''; status.hidden = true;
      } catch { preview = null; }
    }
    document.body.append(dialog);
    // Native modal inertness is implicit; mark the background explicitly so
    // the shared edge recognizer also sees this as the sole active surface.
    const background = [...document.body.children].filter(node => node !== dialog && !node.inert);
    background.forEach(node => { node.inert = true; });
    const unlock = lockSurfaceScroll(window); dialog.showModal();
    // Announce the entered surface without making its Back button look selected
    // after touch/file-input focus. Keyboard Tab still lands on real controls.
    heading.focus({ preventScroll: true });
    history[replacing ? 'replaceState' : 'pushState']({ ...history.state, intakePhotoViewer: marker }, '', location.href); activeMarker = marker;
    let state = { scale: 1, x: 0, y: 0 }, points = new Map(), start, dismiss, url, imageReveal, closing = false, removed = false, restoreOnClose = true, historyClose = false;
    const dimensions = () => image.naturalWidth ? image : sourceImage;
    const paint = () => {
      const d = dimensions();
      if (d?.naturalWidth) state = boundPhotoView(state, stage.clientWidth, stage.clientHeight, d.naturalWidth, d.naturalHeight);
      image.style.transform = `translate(${state.x}px,${state.y}px) scale(${state.scale})`;
      if (preview) preview.style.transform = image.style.transform;
      dialog.dataset.photoScale = String(state.scale); dialog.querySelector('output').value = `${Math.round(state.scale * 100)}%`;
      dialog.querySelector('[data-photo-out]').disabled = state.scale === 1; dialog.querySelector('[data-photo-in]').disabled = state.scale === 5;
      fit.disabled = state.scale === 1;
    };
    const revealFrame = rect => { const d = dimensions(); return photoRevealFrame(rect,stage.getBoundingClientRect(),d?.naturalWidth,d?.naturalHeight); };
    const motion = createPhotoMotion({ frame, scrim:dialog.querySelector('.food-photo-scrim'), chrome:[dialog.querySelector('header'),dialog.querySelector('footer')], win:window,
      onState: value => { dialog.dataset.photoState = value; }, onClosed: () => finish() });
    const releaseBack = bindSemanticBack(dialog, () => !closing && !dismiss?.active && state.scale === 1 && points.size < 2 ? back : null, window, { createMotion: () => { motion.settleOpen(); unlock.prepareLayout(); return liveBackMotion(dialog,window); }, getState: () => state.scale });
    function finish() {
      if (removed) return; removed = true; clearPointers(); motion.dispose(); imageReveal?.cancel(); releaseBack();
      window.removeEventListener('popstate', pop); window.removeEventListener('resize', resize);
      window.removeEventListener('blur', interrupt); window.removeEventListener('orientationchange', resize);
      window.visualViewport?.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('keydown', blockPageKeys);
      unlock.prepareLayout();
      dialog.close(); dialog.remove(); background.forEach(node => { node.inert = false; }); unlock(); if (url) URL.revokeObjectURL(url);
      if (restoreOnClose && isActive()) {
        const visible = node => {
          if (!photoElementVisible(node) || node.closest('[inert],[hidden]')) return false;
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
        };
        focusSurfaceTarget([opener,...document.querySelectorAll('[data-photo-id]')].find(node => (node === opener || node.dataset.photoId === id) && visible(node)));
      }
      if (!historyClose && history.state?.intakePhotoViewer === marker) {
        pendingReturn = new Promise(resolve => {
          const returned = () => { clearTimeout(timer); window.removeEventListener('popstate',returned); pendingReturn = null; resolve(); };
          const timer = setTimeout(returned,500); window.addEventListener('popstate',returned); history.back();
        });
      }
      if (closeCurrent === close) closeCurrent = null;
    }
    const close = (restore = true, fromHistory = false, immediate = false, drag = null) => {
      if (removed || closing && !immediate) return;
      closing = true; restoreOnClose = restore; historyClose = fromHistory; clearPointers();
      const committed = dialog.dataset.swipeBackCommitted === 'true';
      releaseBack(); imageReveal?.cancel(); dialog.inert = true;
      // Restore layout/scroll BEFORE reading the live destination or fading the
      // scrim. Modal inertness and the shared gesture blocker stay until finish.
      unlock.prepareLayout();
      if (immediate) finish();
      else motion.close(state.scale === 1 ? revealFrame(sourceRect()) : null, {immediate:committed,dismiss:drag});
    };
    const pop = () => { if (history.state?.intakePhotoViewer !== marker) close(true, true); };
    // A changed viewport invalidates the closing destination. Finish in the
    // current parent geometry, never continue toward a stale thumbnail rect.
    const interrupt = () => { if (closing) finish(); else { clearPointers(); motion.settleOpen(); } };
    const resize = () => { if (closing) finish(); else { interrupt(); paint(); } };
    const visibility = () => { if (document.hidden) interrupt(); };
    const blockPageKeys = e => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key) &&
          (e.key !== ' ' || closing || !e.target.closest?.('button'))) e.preventDefault();
    };
    closeCurrent = close; window.addEventListener('popstate', pop); window.addEventListener('resize', resize);
    window.addEventListener('blur', interrupt); window.addEventListener('orientationchange', resize);
    window.visualViewport?.addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
    document.addEventListener('keydown', blockPageKeys);
    back.onclick = () => close(); dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        const buttons = [...dialog.querySelectorAll('button:not(:disabled)')], first = buttons[0], last = buttons.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement.hasAttribute('data-photo-title'))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement.hasAttribute('data-photo-title')) { e.preventDefault(); first.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (state.scale > 1 && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); state.x += e.key === 'ArrowLeft' ? 40 : e.key === 'ArrowRight' ? -40 : 0; state.y += e.key === 'ArrowUp' ? 40 : e.key === 'ArrowDown' ? -40 : 0; paint(); }
    });
    fit.onclick = () => { dismiss = null; motion.settleOpen(); state = { scale: 1, x: 0, y: 0 }; paint(); };
    for (const [selector, factor] of [['[data-photo-in]',1.5],['[data-photo-out]',1/1.5]]) dialog.querySelector(selector).onclick = () => { dismiss = null; motion.settleOpen(); state.scale *= factor; paint(); };
    function clearPointers() {
      const ids = [...points.keys()]; points.clear(); start = dismiss = null;
      for (const id of ids) if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    }
    const capture = () => {
      const list = [...points.values()], rect = stage.getBoundingClientRect();
      const center = list.length > 1 ? { x: (list[0].x + list[1].x)/2, y: (list[0].y+list[1].y)/2 } : list[0];
      start = center && { ...state, center, local: { x: center.x-rect.x-rect.width/2, y: center.y-rect.y-rect.height/2 }, distance: list.length > 1 ? Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y) : 0 };
    };
    // A second contact on chrome aborts dismissal too; it must not leave the
    // image in a dismiss pose while a native button owns that contact.
    dialog.addEventListener('pointerdown', e => { if (points.size && !stage.contains(e.target)) { dismiss = null; motion.settleOpen(); } },true);
    stage.addEventListener('pointerdown', e => {
      if (closing || e.button !== 0) return;
      motion.settleOpen(); points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      try { stage.setPointerCapture(e.pointerId); } catch { /* Synthetic/cancelled pointer. */ }
      // Restore parent layout while still opaque. The existing lock retains
      // interaction blocking/inertness until finish; no unlock occurs here.
      unlock.prepareLayout();
      const rect = stage.getBoundingClientRect();
      // isPrimary also excludes a second finger whose first contact is on
      // header/footer chrome (and therefore absent from the stage's pan map).
      dismiss = e.isPrimary !== false && e.clientX > rect.left + 24 && e.clientY < innerHeight - 24 && !dialog.dataset.edgeBackActive
        ? createPhotoDismiss({x:e.clientX,y:e.clientY,at:e.timeStamp,height:rect.height,scale:state.scale,count:points.size}) : null;
      capture();
    });
    stage.addEventListener('pointermove', e => {
      if (!points.has(e.pointerId) || !start) return;
      points.set(e.pointerId,{x:e.clientX,y:e.clientY}); const list = [...points.values()];
      const pose = dismiss?.move(e.clientX,e.clientY,e.timeStamp);
      if (pose) { e.preventDefault(); motion.drag(pose); return; }
      if (list.length > 1 && start.distance) {
        const scale = Math.max(1,Math.min(5,start.scale*Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y)/start.distance));
        const center = {x:(list[0].x+list[1].x)/2,y:(list[0].y+list[1].y)/2};
        state = {scale,x:start.x+(center.x-start.center.x)+(start.local.x-start.x)*(1-scale/start.scale),y:start.y+(center.y-start.center.y)+(start.local.y-start.y)*(1-scale/start.scale)};
      } else if (state.scale > 1) { state.x = start.x+list[0].x-start.center.x; state.y = start.y+list[0].y-start.center.y; }
      if (list.length > 1 || state.scale > 1) paint();
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) stage.addEventListener(type, e => {
      if (!points.has(e.pointerId)) return;
      const result = dismiss?.end(e.timeStamp,e.type !== 'pointerup'); dismiss = null;
      points.delete(e.pointerId); if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      if (result?.active) {
        e.preventDefault(); guardResidualClick(window);
        if (result.commit) { close(true,false,false,result); return; }
        motion.cancelDrag(result.distance,result.height);
      }
      capture();
    });
    stage.addEventListener('touchcancel', interrupt);
    stage.addEventListener('wheel', e => { e.preventDefault(); if (closing) return; dismiss = null; motion.settleOpen(); state.scale *= e.deltaY < 0 ? 1.12 : 1/1.12; paint(); },{passive:false});
    dialog.addEventListener('wheel', e => e.preventDefault(),{passive:false});
    paint();
    motion.open(preview ? revealFrame(origin) : null);
    try {
      const blob = suppliedBlob || await foodMedia.get(id,'full'); if (closing || removed || !isActive()) return;
      if (!blob) throw Error(); url = URL.createObjectURL(blob); image.src = url; await image.decode();
      if (!closing && !removed) {
        // Both normalized sizes share the same aspect ratio and frame. Replace
        // only after decode, without resetting zoom or starting a second reveal.
        if (!preview && motion.state === 'open' && !matchMedia('(prefers-reduced-motion: reduce)').matches) imageReveal = image.animate([{opacity:0},{opacity:1}],{duration:120,easing:'ease-out'});
        delete image.dataset.loading; preview?.remove(); preview = null; status.hidden = true; paint();
      }
    } catch { if (!closing && !removed) { image.hidden = true; status.hidden = false; status.textContent = preview ? 'Full-size photo unavailable. Showing preview.' : 'This local photo is unavailable. Your food record is unchanged.'; } }
  } };
}

export function createFoodThumbnails({ root, viewer, onDispose }) {
  const nodes = new Map(), cache = new Map(), pending = new Set(), queued = new Set();
  const cacheLimit = 32, decodeLimit = 6, decodeWaiters = [];
  let frame = 0, disposed = false, decoding = 0;
  const cached = id => {
    const entry = cache.get(id);
    if (entry) { cache.delete(id); cache.set(id, entry); }
    return entry;
  };
  const nearViewport = button => {
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= -120 && rect.top <= innerHeight + 120
      && rect.right >= -120 && rect.left <= innerWidth + 120;
  };
  const wanted = id => [...nodes].some(([button, record]) => record.visible && button.dataset.photoId === id && nearViewport(button));
  const reserveDecode = async () => {
    if (decoding >= decodeLimit) await new Promise(resolve => decodeWaiters.push(resolve));
    else decoding++;
  };
  const releaseDecode = () => { const next = decodeWaiters.shift(); if (next) next(); else decoding--; };
  const show = button => {
    const image = button.querySelector('img'), url = cached(button.dataset.photoId)?.url;
    if (url && image.getAttribute('src') !== url) image.src = url;
    else if (!url) image.removeAttribute('src');
  };
  const trim = () => {
    if (cache.size <= cacheLimit) return;
    for (const [id, entry] of cache) {
      if (cache.size <= cacheLimit) break;
      // The outgoing peer pane is an inert clone. Its src still needs this URL
      // until the transition finishes, even though it is not in nodes.
      if ([...nodes].some(([button, record]) => record.visible && button.dataset.photoId === id && nearViewport(button))
        || [...root.querySelectorAll('[data-peer-outgoing] .food-photo-thumb[data-photo-id]')].some(button =>
          button.dataset.photoId === id && button.querySelector('img')?.getAttribute('src') === entry.url)) continue;
      for (const button of nodes.keys()) if (button.dataset.photoId === id) button.querySelector('img').removeAttribute('src');
      URL.revokeObjectURL(entry.url); cache.delete(id);
    }
  };
  const load = async (ids, {preload=false}={}) => {
    const batch = [...new Set(ids)].filter(id => mediaIdValid(id) && !cache.has(id) && !pending.has(id) && (preload || wanted(id)));
    if (!batch.length || disposed) return;
    batch.forEach(id => pending.add(id));
    let blobs; try { blobs = await foodMedia.getThumbnails(batch); } catch { blobs = new Map(); }
    await Promise.all(batch.map(async id => {
      const blob = blobs.get(id); if (!blob || disposed) return;
      await reserveDecode();
      let url, retained = false;
      try {
        if (disposed || !preload && !wanted(id)) return;
        try { url = URL.createObjectURL(blob); } catch { return; }
        const image = new Image(); image.src = url;
        try { await image.decode(); } catch { return; }
        if (disposed || !preload && !wanted(id)) return;
        cache.set(id, {url});
        retained = true;
        for (const [button, record] of nodes) if (record.visible && button.isConnected && button.dataset.photoId === id && nearViewport(button)) show(button);
        trim();
      } finally { if (url && !retained) URL.revokeObjectURL(url); releaseDecode(); }
    }));
    batch.forEach(id => pending.delete(id)); trim();
  };
  const flush = () => { frame = 0; const ids = [...queued].map(button => button.dataset.photoId); queued.clear(); void load(ids); };
  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      const record = nodes.get(target); if (!record) continue;
      record.visible = isIntersecting;
      if (isIntersecting) { if (cache.has(target.dataset.photoId)) show(target); else queued.add(target); }
      else { queued.delete(target); target.querySelector('img').removeAttribute('src'); }
    }
    if (queued.size && !frame) frame = requestAnimationFrame(flush);
    trim();
  },{rootMargin:'120px'});
  const mutation = new MutationObserver(records => {
    for (const button of nodes.keys()) if (!root.contains(button)) {
      observer.unobserve(button); queued.delete(button); button.querySelector('img').removeAttribute('src'); nodes.delete(button);
    }
    for (const record of records) for (const added of record.addedNodes) if (added.nodeType === 1) {
      for (const button of [added, ...added.querySelectorAll('.food-photo-thumb[data-photo-id]')]) {
        if (!button.matches?.('.food-photo-thumb[data-photo-id]') || nodes.has(button) || !root.contains(button)) continue;
        nodes.set(button, {visible:false}); show(button); observer.observe(button);
      }
    }
    trim();
  }); mutation.observe(root,{childList:true,subtree:true});
  onDispose?.(() => { disposed = true; observer.disconnect(); mutation.disconnect(); cancelAnimationFrame(frame);
    for (const button of nodes.keys()) button.querySelector('img').removeAttribute('src');
    for (const entry of cache.values()) URL.revokeObjectURL(entry.url);
    nodes.clear(); cache.clear(); pending.clear(); queued.clear(); });
  const thumbnail = (id,name,{interactive=true,kind='food'}={}) => {
    if (!mediaIdValid(id)) return null;
    const button = document.createElement(interactive ? 'button' : 'span');
    if (interactive) { button.type = 'button'; button.setAttribute('aria-label', kind === 'meal' ? 'View meal photo' : `View food photo for ${name}`); }
    else button.setAttribute('aria-hidden','true');
    button.className = 'food-photo-thumb'; button.dataset.photoId = id;
    const image = document.createElement('img'); image.alt = ''; image.width = image.height = 48; image.decoding = 'async'; button.append(image);
    if (interactive) button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const row = button.closest('[data-suppress-click]'); if (row?.dataset.suppressClick === 'true') { delete row.dataset.suppressClick; return; }
      viewer.open(id,name,button,undefined,{kind});
    });
    button.addEventListener('keydown', e => { if (['Enter',' '].includes(e.key)) e.stopPropagation(); });
    nodes.set(button,{visible:false}); show(button); observer.observe(button); return button;
  };
  return {button:thumbnail,image:id=>thumbnail(id,'',{interactive:false}),prime:ids=>load(ids,{preload:true})};
}

export function createPhotoEditor({ viewer, title = 'Food photo', onSave, onDispose }) {
  const element = document.createElement('section'); element.className = 'food-photo-edit'; element.setAttribute('aria-label', title);
  element.innerHTML = '<div class="food-photo-edit-preview"></div><div class="food-photo-edit-copy"><span></span><div class="food-photo-edit-actions"><button type="button" data-photo-choose>Add photo</button><button type="button" data-photo-remove hidden>Remove photo</button><button type="button" data-photo-save hidden>Save photo</button></div><p role="status"></p></div><input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" hidden>';
  const file = element.querySelector('input'), status = element.querySelector('[role=status]'), choose = element.querySelector('[data-photo-choose]'), remove = element.querySelector('[data-photo-remove]'), save = element.querySelector('[data-photo-save]');
  let value = { id: null, normalized: null, changed: false }, generation = 0, pending = Promise.resolve(), url, name = '', representative = null, disposed = false, previewOnly = false;
  const paint = async () => {
    const revision = generation; if (url) URL.revokeObjectURL(url); url = null;
    const preview = element.querySelector('.food-photo-edit-preview'); preview.replaceChildren();
    const hasPhoto = !!(value.id || value.normalized); choose.textContent = hasPhoto ? 'Change photo' : 'Add photo'; remove.hidden = !hasPhoto;
    save.hidden = !onSave || !value.changed; element.querySelector('.food-photo-edit-copy > span').textContent = representative && !hasPhoto ? 'Previous photo · not attached to this new log' : title + ' · optional, stored on this device';
    const blob = (previewOnly ? value.normalized?.full : value.normalized?.thumbnail) || await foodMedia.get(value.id || representative, previewOnly ? 'full' : 'thumb').catch(() => null);
    if (disposed || generation !== revision || !blob) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'food-photo-thumb'; button.setAttribute('aria-label',`View food photo for ${name}`);
    const img = document.createElement('img'); img.alt = ''; url = URL.createObjectURL(blob); img.src = url; button.append(img); preview.append(button);
    if (previewOnly) {
      button.classList.add('scan-photo-preview');
      button.innerHTML = '<span class="scan-photo-copy"><strong>Meal photo</strong><small>View photo</small></span><span class="scan-photo-arrow" aria-hidden="true">›</span>';
      button.prepend(img);
      button.setAttribute('aria-label','View meal photo');
    }
    button.onclick = () => viewer.open(value.id || representative,name,button,value.normalized?.full,{kind:previewOnly?'meal':'food'});
  };
  const load = file => {
    const revision = ++generation; choose.disabled = save.disabled = true; status.textContent = 'Preparing photo…';
    pending = normalizeFoodPhoto(file).then(normalized => {
      if (disposed || revision !== generation) return;
      value = {id:null,normalized,changed:true}; representative = null; status.textContent = ''; return paint();
    }).catch(() => { if (revision === generation) status.textContent = 'Could not prepare this photo. Try a JPEG or PNG. Your food is still here.'; })
      .finally(() => { if (revision === generation) choose.disabled = save.disabled = false; });
    return pending;
  };
  choose.onclick = () => { file.value = ''; file.click(); };
  file.onchange = () => { if (file.files[0]) load(file.files[0]); };
  remove.onclick = () => { generation++; pending = Promise.resolve(); choose.disabled = save.disabled = false; value = {id:null,normalized:null,changed:true}; representative = null; status.textContent = ''; paint(); };
  save.onclick = async () => {
    if (!onSave || save.disabled) return; const revision = generation; save.disabled = choose.disabled = remove.disabled = true;
    try { await pending; if (disposed || revision !== generation) return; const id = await onSave({ ...value }, () => !disposed && revision === generation); if (disposed || revision !== generation) return; value = {id,normalized:null,changed:false}; status.textContent = 'Photo saved.'; await paint(); }
    catch (error) { if (!disposed && revision === generation) status.textContent = error.message || 'Could not save this photo. Your saved food is unchanged.'; }
    finally { if (revision === generation) save.disabled = choose.disabled = remove.disabled = false; }
  };
  const reset = ({ id = null, representativeId = null, foodName = '', normalized = null, previewOnly: readonly = false } = {}) => {
    generation++; value = {id,normalized,changed:!!normalized}; representative = representativeId; name = foodName; pending = Promise.resolve();
    previewOnly = readonly; element.classList.toggle('is-photo-preview',previewOnly);
    choose.disabled = save.disabled = remove.disabled = false; status.textContent = ''; paint();
  };
  onDispose?.(() => { disposed = true; generation++; if (url) URL.revokeObjectURL(url); });
  return { element, reset, load, async ready() { const revision = generation; await pending; return { ...value, cancelled: disposed || revision !== generation }; }, get value() { return value; } };
}
