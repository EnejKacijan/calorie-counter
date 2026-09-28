// Own touch feedback, and reject only a release retargeted to a replacement
// control. Native scrolling, focus and navigation retain their existing owners.
export const touchControlSelector = 'button,a[href],[role="button"],[role="tab"],summary,input[type="checkbox"],input[type="radio"],label:has(input[type="checkbox"]),label:has(input[type="radio"])';
// Virtual keyboards can emit keydown, too. Editing a touch-focused text field
// does not turn it into a keyboard-navigation target. Tab, arrows, shortcuts
// and keys on non-editing controls still restore normal keyboard modality.
export function isTextEditingKey(event) {
  const field=event.target;
  if (!field?.matches?.('textarea,input:not([type]),input[type=text],input[type=search],input[type=number],input[type=email],input[type=tel],input[type=url],input[type=password]') || field.disabled || field.readOnly) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.isComposing || event.keyCode===229 || event.key?.length===1 || ['Backspace','Delete','Enter','Process','Unidentified'].includes(event.key);
}
export function mountTouchFeedback(win) {
  const doc=win.document,root=doc.documentElement,listeners=[];let press=null,contact=null,released=null;
  const listen=(target,type,fn,passive=true)=>{const options={capture:true,passive};target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
  const clear=()=>{press?.control.removeAttribute('data-touch-pressed');press=null;doc.dispatchEvent(new win.Event('intake:press-reset'));};
  const mouse=event=>{if(event.pointerType==='mouse'&&!event.sourceCapabilities?.firesTouchEvents)root.removeAttribute('data-intake-touch');};
  // Edge gestures do not focus a button. Keep their source modality through
  // native dialog focus restoration, including WebKit's touch-event path.
  listen(doc,'touchstart',()=>{root.setAttribute('data-intake-touch','');});
  listen(doc,'pointerdown',event=>{
    clear();contact=null;released=null;mouse(event);
    if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
    root.setAttribute('data-intake-touch','');
    if(event.isPrimary===false||event.button!==0)return;
    const control=event.target.closest?.(touchControlSelector);
    if(!control||control.disabled||control.getAttribute('aria-disabled')==='true'||control.closest('[inert],[hidden]'))return;
    contact={control,id:event.pointerId,x:event.clientX,y:event.clientY};
    press=contact;control.setAttribute('data-touch-pressed','');
  });
  listen(win,'pointermove',event=>{
    mouse(event);
    if(press&&press.id===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8)clear();
  });
  listen(win,'pointerup',event=>{
    if(contact?.id===event.pointerId){released={...contact,x:event.clientX,y:event.clientY};contact=null;}
    if(!press||event.pointerId===press.id)clear();
  });
  listen(win,'pointercancel',event=>{if(contact?.id===event.pointerId){contact=null;released=null;}if(!press||event.pointerId===press.id)clear();});
  listen(win,'lostpointercapture',clear);
  listen(doc,'touchcancel',()=>{contact=null;released=null;clear();});
  // Chromium can hit-test a fresh button at touchend after the original was
  // removed during the held touch. Reject that one click, not future input.
  // MouseEvent fallback covers engines without pointerType on compatibility clicks.
  listen(doc,'click',event=>{
    const origin=released;released=null;clear();
    if(!origin)return;
    const target=event.target?.closest?.(touchControlSelector);
    const touchRelease=event.pointerType==='touch'||event.pointerType==='pen'||(!event.pointerType&&event.detail>0&&Math.hypot(event.clientX-origin.x,event.clientY-origin.y)<2);
    if(touchRelease&&target&&target!==origin.control&&(!origin.control.isConnected||origin.control.closest('[hidden],[inert]'))){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },false);
  // No timers, synthetic clicks, pointer capture, focus changes or input lock.
  for(const type of ['scroll','wheel','visibilitychange'])listen(doc,type,clear);
  for(const type of ['blur','popstate','pagehide'])listen(win,type,clear);
  listen(doc,'keydown',event=>{clear();contact=null;released=null;if(!isTextEditingKey(event))root.removeAttribute('data-intake-touch');});
  const observer=new win.MutationObserver(records=>{
    const owner=press?.control||doc.querySelector('.is-pressed,[data-add-pressed],[data-sheet-pressed]');
    if(!owner)return;
    // A replacement surface must never inherit the previous element's press.
    // Recent's swipe owner reasserts inert on OTHER rows' action buttons at
    // touchstart. That is not a new surface and must not erase this row's press.
    const opened=records.some(r=>r.type==='childList'||r.attributeName==='open'&&r.target?.hasAttribute('open')||r.attributeName==='hidden'&&r.target?.hidden===false);
    if(!owner.isConnected||owner.closest('[inert],[hidden]')||opened)clear();
  });
  observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['inert','hidden','open']});
  root.setAttribute('data-touch-feedback-ready','');
  return ()=>{clear();contact=null;released=null;observer.disconnect();listeners.forEach(remove=>remove());root.removeAttribute('data-touch-feedback-ready');root.removeAttribute('data-intake-touch');};
}
