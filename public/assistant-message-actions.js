import {guardResidualClick} from './semantic-back.js?v=3';

export function clipboardEnvironment(win) {
  const host = win.location?.hostname || '';
  return {
    protocol: win.location?.protocol || '',
    originCategory: win.location?.protocol === 'https:' ? 'https' : /^(localhost$|127\.|\[::1\]$)/.test(host) ? 'loopback-http' : 'non-loopback-http',
    secureContext: !!win.isSecureContext,
    clipboardAvailable: !!win.navigator?.clipboard,
    writeAvailable: typeof win.navigator?.clipboard?.writeText === 'function',
    focused: !!win.document?.hasFocus(),
    activation: win.navigator?.userActivation?.isActive ?? null,
    topLevel: win.self === win.top,
  };
}

export function requestAssistantCopy({navigator, text, onSuccess, onFailure, context = globalThis, diagnose}) {
  const environment = clipboardEnvironment({navigator, location: context.location, document: context.document,
    isSecureContext: context.isSecureContext, self: context.self, top: context.top});
  const trace = (phase, reason) => { try { diagnose?.({...environment, phase, ...(reason ? {reason} : {})}); } catch {} };
  trace('activation');
  const failed = (phase, error) => {
    const reason = ['NotAllowedError','SecurityError','NotFoundError','AbortError'].includes(error?.name) ? error.name : phase;
    trace(phase, reason); onFailure?.({reason, secureContext: environment.secureContext});
  };
  if (typeof text !== 'string' || !text.trim()) { failed('empty-text'); return false; }
  const write = navigator?.clipboard?.writeText;
  if (typeof write !== 'function') { failed('clipboard-unavailable'); return false; }
  try {
    // Invoke in the actual Copy click stack; no dismissal/permission/format await.
    const result = write.call(navigator.clipboard, text);
    trace('write-called');
    Promise.resolve(result).then(() => { trace('resolved'); onSuccess?.(); }, error => failed('rejected', error));
    return true;
  } catch (error) { failed('threw', error); return false; }
}

export function copyFallbackText(details) {
  return details.secureContext === false
    ? "Automatic copying isn't available on this connection. Select text to copy."
    : details.reason === 'clipboard-unavailable'
      ? "Automatic copying isn't available in this browser. Select text to copy."
      : "Automatic copying was declined. Select text to copy.";
}

// A message-scoped recognizer, not another navigation gesture engine.
export function bindMessageHold({root, window: win, open}) {
  const doc = root.ownerDocument, off = [];
  let contact, timer, accepted;
  const listen = (el, type, fn, options) => { el.addEventListener(type, fn, options); off.push(() => el.removeEventListener(type, fn, options)); };
  const selection = () => { const s = doc.getSelection(); return s && !s.isCollapsed; };
  const cancel = () => { win.clearTimeout(timer); timer = null; contact = null; };
  const finish = () => { cancel(); if (accepted) { guardResidualClick(win); accepted = false; } };
  listen(root, 'pointerdown', e => {
    if (contact || e.isPrimary === false) { cancel(); return; }
    if (e.pointerType !== 'touch' || e.button !== 0 || selection()
      || e.target.closest('a,button,input,textarea,select,[contenteditable],img,video,[role=slider]')) return;
    const body = e.target.closest('[data-message-hold]'), article = body?.closest('.assistant-message');
    if (!article || !root.contains(article)) return;
    contact = {id:e.pointerId, x:e.clientX, y:e.clientY, article};
    timer = win.setTimeout(() => {
      timer = null;
      if (!contact || !article.isConnected || selection() || doc.hidden) return cancel();
      accepted = true; open(article, {x:contact.x, y:contact.y});
    }, 480);
  }, {passive:true});
  listen(doc, 'pointermove', e => { if (contact && e.pointerId === contact.id && Math.hypot(e.clientX-contact.x,e.clientY-contact.y)>8) cancel(); }, {passive:true});
  listen(doc, 'pointerdown', e => { if (contact && e.pointerId !== contact.id) cancel(); }, {capture:true,passive:true});
  listen(doc, 'touchstart', e => { if (e.touches.length>1) cancel(); }, {passive:true});
  listen(root, 'pointerout', e => { if (contact && e.pointerId === contact.id && !contact.article.contains(e.relatedTarget)) cancel(); }, {passive:true});
  for (const type of ['pointerup','pointercancel','touchcancel']) listen(doc,type,finish,{capture:true,passive:true});
  listen(doc,'click',e=>{ if(accepted && e.detail>0){ e.preventDefault();e.stopImmediatePropagation();finish(); } },true);
  listen(root,'contextmenu',e=>{ if(win.matchMedia('(pointer:coarse)').matches && e.target.closest('[data-message-hold]') && !e.target.closest('a,img') && !selection())e.preventDefault(); });
  for (const type of ['scroll','visibilitychange','selectionchange']) listen(doc,type,cancel,true);
  listen(win,'blur',finish);
  return {cancel, dispose(){ finish();off.forEach(f=>f()); }};
}

export function createAssistantMessageActions({window:win, messages, region, panel, selection, status,
  resolve, openSurface, closeSurface, chatScroll}) {
  const doc = messages.ownerDocument, off=[];
  const body=selection.querySelector('.assistant-text-selection-body'),note=selection.querySelector('[data-selection-note]');
  const copy=panel.querySelector('[data-message-action=copy]');
  let target, generation=0, pending=false, handoff=false, releaseReading, feedbackTimer, dead=false;
  const listen=(el,type,fn,options)=>{el.addEventListener(type,fn,options);off.push(()=>el.removeEventListener(type,fn,options));};
  // Opt-in local diagnosis contains capability/phase categories only, never text,
  // IDs, URLs, diary data, exception messages, or clipboard reads.
  const diagnose = new URLSearchParams(win.location.search).get('copyDiagnostics') === '1'
    ? detail => doc.dispatchEvent(new win.CustomEvent('intake:copy-diagnostic',{detail})) : undefined;
  const valid=t=>!dead && target===t && !!resolve(t.conversationId,t.messageId);
  function clearFeedback(){win.clearTimeout(feedbackTimer);feedbackTimer=null;status.textContent='';status.classList.remove('is-visible');status.classList.add('sr-only');messages.querySelectorAll('[data-copy-confirmed]').forEach(e=>{delete e.dataset.copyConfirmed;e.querySelector('span').textContent='•••';});}
  function reset(){
    generation++;hold.cancel();pending=false;copy.disabled=false;clearFeedback();target=null;handoff=false;
    if(panel.open)closeSurface(panel,{immediate:true});
    if(selection.open)closeSurface(selection,{immediate:true});
    releaseReading?.();releaseReading=null;
  }
  function position(){
    if(!panel.open || !target){if(status.classList.contains('is-visible'))clearFeedback();return;}
    const r=region.getBoundingClientRect(),v=win.visualViewport,box=panel.getBoundingClientRect();
    const a=target.article.getBoundingClientRect(),margin=8;
    const left=Math.max(r.left+margin,Math.min(r.right-box.width-margin,target.point?.x ?? a.left));
    const topMin=Math.max(r.top,v?.offsetTop||0)+margin;
    const bottom=Math.min(r.bottom,(v?.offsetTop||0)+(v?.height||win.innerHeight))-margin;
    const y=target.point?.y ?? Math.min(bottom,Math.max(topMin,a.bottom));
    panel.style.left=`${left}px`;panel.style.top=`${Math.max(topMin,Math.min(bottom-box.height,y-box.height-8))}px`;
  }
  async function open(article,point){
    if(dead || panel.open || selection.open)return;
    const {messageId,conversationId}=article.dataset,message=resolve(conversationId,messageId);
    if(!message || !String(message.content||'').trim())return;
    reset();
    const t=target={article,point,messageId,conversationId,text:String(message.content),trigger:article.querySelector('[data-message-actions]')};
    releaseReading=chatScroll.hold();
    await openSurface(panel,t.trigger,()=>valid(t));
    if(!valid(t) || !panel.open)return;
    t.trigger?.setAttribute('aria-expanded','true');position();copy.focus({preventScroll:true});
  }
  async function selectText(t,explanation=''){
    if(!valid(t))return;
    // Choosing native selection supersedes any still-pending Copy UI result.
    generation++;pending=false;copy.disabled=false;
    body.textContent=t.text;body.scrollTop=0;note.textContent=explanation;note.hidden=!explanation;
    handoff=true;
    await openSurface(selection,t.trigger,()=>valid(t));
    handoff=false;
    if(!valid(t) || !selection.open)return;
    selection.querySelector('h2').focus({preventScroll:true});
  }
  function copied(t){
    const trigger=t.trigger, menuRect=panel.getBoundingClientRect();
    closeSurface(panel);
    if(!trigger?.isConnected)return;
    trigger.dataset.copyConfirmed='';trigger.querySelector('span').textContent='Copied';
    const action=trigger.getBoundingClientRect(),visible=region.getBoundingClientRect();
    if(action.top<visible.top || action.bottom>visible.bottom){
      // A long answer's overflow button may be offscreen. Keep its brief
      // confirmation where the menu was, without moving text or the composer.
      status.style.left=`${menuRect.left}px`;status.style.top=`${menuRect.top}px`;
      status.classList.remove('sr-only');
      status.classList.add('is-visible');
    }
    status.textContent='Copied';
    const current=generation;
    feedbackTimer=win.setTimeout(()=>{if(!dead && generation===current)clearFeedback();},1800);
  }
  function activateCopy(){
    const t=target;if(pending || !t || !valid(t))return;
    pending=true;copy.disabled=true;const operation=++generation;
    requestAssistantCopy({navigator:win.navigator,text:t.text,context:win,diagnose,
      onSuccess(){if(!valid(t)||generation!==operation)return;pending=false;copy.disabled=false;copied(t);},
      onFailure(details){if(!valid(t)||generation!==operation)return;pending=false;copy.disabled=false;void selectText(t,copyFallbackText(details));},
    });
  }
  const hold=bindMessageHold({root:messages,window:win,open});
  listen(region,'scroll',clearFeedback,{passive:true});
  listen(messages,'click',e=>{const trigger=e.target.closest('[data-message-actions]');if(trigger){e.preventDefault();void open(trigger.closest('.assistant-message'));}});
  listen(panel,'click',e=>{if(e.target.closest('[data-message-action=copy]'))activateCopy();else if(e.target.closest('[data-message-action=select]')&&target)void selectText(target);});
  function surfaceClosed(closed){
    if(closed!==panel && closed!==selection)return;
    // A Range left in the now-hidden snapshot is no longer native selection
    // the reader can use. Do not let it disable subsequent message holds.
    const range=doc.getSelection();
    if(closed===selection && range && selection.contains(range.anchorNode))range.removeAllRanges();
    target?.trigger?.setAttribute('aria-expanded','false');
    if(handoff)return;
    generation++;pending=false;copy.disabled=false;target=null;
    releaseReading?.();releaseReading=null;
  }
  return {reset,position,surfaceClosed,dispose(){dead=true;reset();hold.dispose();off.forEach(f=>f());}};
}
