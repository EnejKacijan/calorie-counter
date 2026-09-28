import { lockSurfaceScroll } from './mobile-surface.js?v=3';
import { motionScale } from './motion.js?v=7';
import { createAddPresentation } from './add-presentation.js?v=6';
import { liveBackMotion } from './semantic-back.js?v=4';
import { captureBackPreview } from './back-preview.js?v=1';

const foodStepAnimations = new WeakMap();
// Visual feedback only: never capture, retarget, synthesize or cancel a click.
// Binding starts after the opener's pointerup/click. Only a fresh pointerdown
// on an actual row can own the state; native scrolling still cancels activation.
export function bindAddActionPress(surface, win) {
  const doc = win.document, listeners = [];
  let press;
  const clear = () => { press?.row.removeAttribute('data-add-pressed'); press = null; };
  const listen = (target, type, handler, capture = false) => {
    const options = { capture, passive: true };
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  listen(surface, 'pointerdown', event => {
    clear();
    if (!event.isPrimary || event.button !== 0 || surface.inert) return;
    const row = event.target.closest?.('.manual-food-shortcut,.food-ai-description-trigger');
    if (!row || !surface.contains(row) || row.disabled) return;
    press = { row, id: event.pointerId, x: event.clientX, y: event.clientY };
    row.setAttribute('data-add-pressed', '');
  });
  listen(win, 'pointermove', event => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX-press.x, event.clientY-press.y) > 8) clear();
  }, true);
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    listen(win, type, event => { if (press?.id === event.pointerId) clear(); }, true);
  }
  listen(doc, 'scroll', clear, true);
  listen(doc, 'visibilitychange', clear);
  listen(doc, 'touchcancel', clear);
  listen(doc, 'intake:press-reset', clear);
  listen(win, 'blur', clear);
  return () => { clear(); listeners.splice(0).forEach(remove => remove()); };
}
export function settleNestedParent(doc) {
  // Render has committed the totals. Finish only the retained parent's visual
  // effects (including the CSS ring transition) before the first reveal frame.
  for (const animation of doc.querySelector('.app-shell')?.getAnimations({subtree:true}) || []) {
    if (animation.effect?.getTiming().iterations === Infinity) continue;
    try { animation.finish(); } catch { animation.cancel(); }
  }
}
// Keep the document offset when the dashboard/header is in view. Only a user
// already reading below the diary header needs an entry anchor when insertion
// changes the content above it. Add's own scroll positions stay independent.
export function diaryReadingPosition(win) {
  const doc = win.document, list = doc.querySelector('#foodList');
  const header = list?.parentElement.querySelector('.logged-list-heading');
  const top = win.visualViewport?.offsetTop || 0;
  if (!header || header.getBoundingClientRect().bottom > top) return undefined;
  const cards = () => [...list.querySelectorAll('[data-food-entry-id]')];
  const anchor = cards().find(card => {
    const rect = card.getBoundingClientRect();
    return rect.bottom > top && rect.top < (win.visualViewport?.height || win.innerHeight) + top;
  });
  if (!anchor) return undefined;
  const id = anchor.dataset.foodEntryId, y = anchor.getBoundingClientRect().top;
  return saved => {
    const current = cards().find(card => card.dataset.foodEntryId === id);
    return current ? { ...saved, top: Math.max(0, win.scrollY + current.getBoundingClientRect().top - y) } : saved;
  };
}
// The real destination is already mounted. Never clone controls or wait for
// animation completion to establish the state, focus or scroll position.
export function animateFoodStep(content, direction, win) {
  foodStepAnimations.get(content)?.cancel();
  foodStepAnimations.delete(content);
  if (!content?.animate || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const animation = content.animate([
    { opacity: .75, transform: `translateX(${direction === 'back' ? -12 : 12}px)` },
    { opacity: 1, transform: 'translateX(0)' },
  ], { duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' });
  foodStepAnimations.set(content, animation);
}

export function animateAddMode(indicator, content, from, to, win) {
  const transform = index => `translateX(${index * 100}%)`;
  indicator.style.transform = transform(to);
  if (from === null || from === to || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return [];
  const timing = { duration: motionScale.mode, easing: motionScale.easing };
  return [
    indicator.animate([{ transform: transform(from) }, { transform: transform(to) }], timing),
    content.animate([{ opacity: .72 }, { opacity: 1 }], timing),
  ];
}

// Reuse and temporarily reparent the one active Add section/form. Optional
// inert browse previews have no application/controller or focus ownership.
// The existing diary placement is restored on close; a mode switch keeps one
// scroll lock and the same background isolation for the whole Add session.
export function createAddSurface(win = window) {
  const doc = win.document, positions = new WeakMap();
  let active = null, closing = null, unlock, opener, host, stage, presentation, diaries = [], isolation = [], frame = 0, pendingInput, committedTap;
  const resets = new Set();
  const parents = new Map();
  const clearParents = () => { parents.forEach(parent => parent.dispose()); parents.clear(); };
  const preference = win.matchMedia('(prefers-reduced-motion: reduce)');
  // The legacy section contains both an editor and the Today log. Keep the
  // actual log nodes at their existing place while only the editor travels.
  // No cloned entries, IDs, forms or stale screenshot behind a successful save.
  function retainDiary(section) {
    const diary=doc.createElement('div');diary.className=section.classList.contains('food-log')?'log-panel food-log add-flow-diary-food':'log-panel exercise-log';
    diary.dataset.addDiary='';
    const style=win.getComputedStyle(section);
    for(const key of ['display','padding','margin','border','gap','grid-template-columns','align-items'])diary.style.setProperty(key,style.getPropertyValue(key),'important');
    const placements=[];
    for(const node of section.querySelectorAll(':scope > .logged-list-heading,:scope > .entry-list')) {
      const marker=doc.createComment('Today log placement');node.before(marker);placements.push({node,marker});diary.append(node);
    }
    section.before(diary);
    return {diary,placements};
  }
  // Closing synchronously must not let the second click of a double tap hit
  // the now-exposed diary/navigation. A new independent click is never blocked.
  const repeatClick = event => {
    const prior = committedTap; committedTap = null;
    if (prior && event.detail > 1 && Math.abs(event.clientX-prior.x)<8 && Math.abs(event.clientY-prior.y)<8) {
      event.preventDefault();event.stopImmediatePropagation();
    }
  };
  doc.addEventListener('click', repeatClick, true);
  const editing = e => { if (e.target.matches('input,textarea,select')) reveal(e.target); };
  const queue = () => { if (!frame) frame = win.requestAnimationFrame(update); };
  function update() {
    frame = 0; if (!active || (win.visualViewport?.scale ?? 1) !== 1) return;
    const vv = win.visualViewport, height = vv?.height || win.innerHeight;
    active.section.style.setProperty('--add-height', height + 'px');
    active.section.style.setProperty('--add-top', Math.max(0, vv?.offsetTop || 0) + 'px');
    active.section.dataset.keyboard = String(height < doc.documentElement.clientHeight - 1);
    if (active.section.classList.contains('is-photo-plate')) {
      active.section.dataset.reviewScroll = String(active.content.scrollHeight > active.content.clientHeight + 1);
    } else delete active.section.dataset.reviewScroll;
    const field = pendingInput?.closest('label') || pendingInput;
    if (field && active.content.contains(field)) {
      const bounds = active.content.getBoundingClientRect(), rect = field.getBoundingClientRect();
      const gap = Math.max(0, Math.min(8, (bounds.height - rect.height) / 2));
      if (rect.height > bounds.height || rect.top < bounds.top + gap) active.content.scrollTop += rect.top - bounds.top - gap;
      else if (rect.bottom > bounds.bottom - gap) active.content.scrollTop += rect.bottom - bounds.bottom + gap;
    }
    pendingInput = null;
  }
  const viewportChanged = () => { if (active?.content.contains(doc.activeElement)) pendingInput = doc.activeElement; queue(); };
  function reveal(input) { pendingInput = input; queue(); }
  function unmount(session = active) {
    if (!session) return;
    session.disposePress();
    session.reviewResize?.disconnect();
    clearParents();
    const {section,content,placements,marker,observer,animations,indicator,backIcon} = session;
    backIcon.remove();
    animations.forEach(animation => animation.cancel());indicator.remove();
    positions.set(section,content.scrollTop); observer.disconnect();
    for (const type of ['focusin','click','input']) section.removeEventListener(type,editing);
    for (const {node,marker,form} of placements) { marker.replaceWith(node); if (form !== undefined) form === null ? node.removeAttribute('form') : node.setAttribute('form',form); }
    for (const el of section.querySelectorAll(':scope > .add-flow-header,:scope > .add-flow-content,:scope > .add-flow-footer')) el.remove();
    marker.replaceWith(section); section.classList.remove('add-flow-surface','is-adding');
    for (const key of ['role','aria-modal','aria-labelledby','data-keyboard','aria-hidden','data-add-exiting','data-review-scroll']) section.removeAttribute(key);
    section.inert=false;
    section.style.removeProperty('--add-height');section.style.removeProperty('--add-top');
    if (active === session) active=null;
    pendingInput=null;
  }
  function open(section, {returnTo=doc.activeElement, nested=false} = {}) {
    const reopening = Boolean(closing), from = reopening ? presentation.frame : undefined;
    if (reopening) {
      // Retain the one background lock and viewport host while superseding an
      // old exit. Old callbacks lose ownership before a new session is mounted.
      if (typeof returnTo !== 'function' && closing.section.contains(returnTo)) returnTo = opener;
      finishClose({preserve:true});
    }
    if (active?.section===section) return;
    const switching = Boolean(active), previousMode = active ? Number(active.section.id === 'exerciseSection') : null; unmount();
    if (!unlock) {
      win.IntakeMotion?.stopAll();
      opener=returnTo; unlock=lockSurfaceScroll(win, { restorePosition: diaryReadingPosition(win) });
      diaries=[...doc.querySelectorAll('#foodSection,#exerciseSection')].map(retainDiary);
      host=doc.createElement('div');host.className='add-flow-host';
      stage=doc.createElement('div');stage.className='add-flow-backdrop';host.append(stage);doc.body.append(host);
      isolation=[...doc.querySelectorAll('.app-shell,.mobile-tabbar')].map(e=>({e,inert:e.inert}));isolation.forEach(({e})=>e.inert=true);
    }
    if (!switching) {
      // One host moves header + form + footer together for Add and Edit,
      // revealing the real, stationary diary. Logical task identity stays intact.
      host.dataset.presentation = nested ? 'nested' : 'task';
      presentation=createAddPresentation(host,win,finishClose,{nested:nested || section.classList.contains('is-editing'),fullExit:nested && section.id==='foodSection'});
    }
    const marker=doc.createComment('Add section placement');section.before(marker);stage.append(section);section.inert=false;
    section.classList.add('is-adding','add-flow-surface');section.setAttribute('role','dialog');section.setAttribute('aria-modal','true');
    section.setAttribute('aria-labelledby',section.id==='foodSection'?'foodModeTitle':'exerciseModeTitle');
    doc.body.classList.add('modal-open','add-flow-open');
    const header=doc.createElement('div'),content=doc.createElement('div'),footer=doc.createElement('footer');
    header.className='add-flow-header';content.className='add-flow-content';footer.className='add-flow-footer';
    const placements=[],form=section.querySelector('form');
    const move=(node,to,submit=false)=>{if(!node)return;const marker=doc.createComment('Add child placement');node.before(marker);placements.push({node,marker,...(submit?{form:node.getAttribute('form')}: {})});if(submit)node.setAttribute('form',form.id);to.append(node);};
    move(section.querySelector('.panel-title'),header);move(section.querySelector('.add-mode-switch'),header);
    // The shared task header owns one vector Back control.
    const backIcon=doc.createElementNS('http://www.w3.org/2000/svg','svg');
    backIcon.setAttribute('viewBox','0 0 24 24');backIcon.setAttribute('aria-hidden','true');backIcon.classList.add('add-back-icon');
    const backPath=doc.createElementNS('http://www.w3.org/2000/svg','path');
    backPath.setAttribute('d','M19 12H5m7-7-7 7 7 7');backIcon.append(backPath);header.querySelector('.modal-close-button').append(backIcon);
    move(form,content);move(section.querySelector('.edit-modal-actions'),content);
    move(form.querySelector('.add-entry-status'),footer);move(form.querySelector('button[type=submit]'),footer,true);
    section.append(header,content,footer);
    const sync=()=>{footer.hidden=section.id==='foodSection'&&(!section.matches('.is-detailing,.is-editing')||section.matches('.is-reviewing-scan,.is-describing-ai'));
      header.querySelector('.add-mode-switch').hidden=section.matches('.is-detailing,.is-editing,.is-reviewing-scan')||section.querySelector('[data-food-detail=scan]')!==null;queue();};
    const observer=new win.MutationObserver(sync);observer.observe(section,{attributes:true,attributeFilter:['class']});
    const indicator = doc.createElement('span');indicator.className='add-mode-indicator';indicator.setAttribute('aria-hidden','true');
    header.querySelector('.add-mode-switch').prepend(indicator);
    const animations = animateAddMode(indicator,content,previousMode,Number(section.id==='exerciseSection'),win);
    const disposePress = bindAddActionPress(section,win);
    const reviewResize = new win.ResizeObserver(queue);reviewResize.observe(form);reviewResize.observe(content);
    active={section,content,header,footer,placements,marker,observer,animations,indicator,backIcon,sync,disposePress,reviewResize};sync();update();
    content.scrollTop=positions.get(section)||0;
    for(const type of ['focusin','click','input'])section.addEventListener(type,editing);
    const focus=switching?header.querySelector('[aria-selected=true]'):header.querySelector('.modal-close-button');focus?.focus({preventScroll:true});
    if (!switching) presentation.open({from,immediate:preference.matches});
  }
  function finishClose({preserve=false} = {}) {
    if (!closing) return;
    const session = closing; closing = null;
    presentation?.dispose();unmount(session);
    if (!preserve) {
      host?.remove();host=stage=presentation=null;
      for(const {diary,placements} of diaries){for(const {node,marker} of placements)marker.replaceWith(node);diary.remove();}diaries=[];
    }
    // Finalize the hidden editor's reset before the one document restoration.
    // Otherwise the unlock measures a temporary, expanded detail form.
    session.beforeRestore?.();
    const callbacks=[...resets];resets.clear();callbacks.forEach(reset=>reset());
    if (!preserve) {
      isolation.forEach(({e,inert})=>e.inert=inert);isolation=[];
      doc.body.classList.remove('modal-open','add-flow-open');unlock?.();unlock=null;
    }
    if (preserve) return;
    const requested = typeof opener === 'function' ? opener() : opener;
    const target = requested?.isConnected && requested.getClientRects().length && !requested.closest('[inert]')
      ? requested : doc.querySelector('#floatingAddButton');
    if(target?.isConnected&&!target.closest('[inert]'))target.focus({preventScroll:true});opener=null;
  }
  function close(section, {immediate=false, returnTo, beforeRestore} = {}) {
    if (!active || section && active.section!==section) return false;
    settleNestedParent(doc);
    if (returnTo) opener=returnTo;
    const session = active;active=null;closing=session;session.beforeRestore=beforeRestore;
    session.disposePress();
    win.cancelAnimationFrame(frame);frame=0;pendingInput=null;
    session.observer.disconnect();session.animations.forEach(animation=>animation.cancel());
    // Logical close is immediate. Keep only the same inert live presentation
    // briefly, on an opaque stage. No form/chart clone or second active tree.
    session.section.inert=true;session.section.setAttribute('aria-hidden','true');
    session.section.removeAttribute('role');session.section.removeAttribute('aria-modal');
    // is-adding owns the mobile header/form geometry, not the logical session.
    // Keep it until unmount: removing it here exposes the diary/desktop rules
    // underneath the still-visible exiting surface (X header, narrow fields).
    session.section.dataset.addExiting='true';
    presentation.close({immediate:immediate || preference.matches || session.section.dataset.swipeBackCommitted==='true' || session.section.dataset.keyboard==='true'});
    return true;
  }
  const stopExit=()=>{if(preference.matches||doc.visibilityState==='hidden'){active?.animations.forEach(animation=>animation.cancel());presentation?.settle();}};
  preference.addEventListener?.('change',stopExit);doc.addEventListener('visibilitychange',stopExit);
  win.visualViewport?.addEventListener('resize',viewportChanged);win.visualViewport?.addEventListener('scroll',viewportChanged);win.addEventListener('resize',viewportChanged);
  return {open,close,reveal,
    prepareChild() { presentation?.settle(); active?.sync(); update(); },
    captureParent(key) {
      if (!active) return;
      active.sync();
      parents.get(key)?.dispose(); parents.delete(key);
      const parent = captureBackPreview(stage,win);
      if (parent) parents.set(key,parent);
    },
    forgetParent(key) { parents.get(key)?.dispose(); parents.delete(key); },
    backMotion(parentKey) {
      if (!active) return null;
      const parent = parentKey && parents.get(parentKey);
      if (parentKey && !parent) return null;
      // End entrance before the finger takes ownership; never compose the
      // programmed host motion with the live horizontal drag.
      presentation.settle();
      foodStepAnimations.get(active.content)?.cancel();
      active.animations.forEach(animation=>animation.cancel());
      const motion = liveBackMotion(parent ? stage : host,win);
      parent?.show();
      return {render:motion.render,readDistance:motion.readDistance,maxSettleDuration:host.dataset.presentation==='nested'?160:200,clear(){motion.clear();parent?.hide();}};
    },
    deferReset(section,reset){if(closing?.section!==section)return false;resets.add(reset);return true;},
    committed(event){if(active&&event?.detail)committedTap={x:event.clientX,y:event.clientY};},get section(){return active?.section;},content(section){return active?.section===section?active.content:section;},reset(section){positions.delete(section);if(active?.section===section)active.content.scrollTop=0;},dispose(){close(undefined,{immediate:true});finishClose();preference.removeEventListener?.('change',stopExit);doc.removeEventListener('visibilitychange',stopExit);doc.removeEventListener('click',repeatClick,true);win.visualViewport?.removeEventListener('resize',viewportChanged);win.visualViewport?.removeEventListener('scroll',viewportChanged);win.removeEventListener('resize',viewportChanged);}};
}
