import {createSheetSurface,lockSurfaceScroll,isolateSurfaceBackground,bindSurfaceViewport,focusSurfaceTarget} from './mobile-surface.js?v=3';
import {animateNestedPage,createNestedHistory} from './nested-page.js?v=1';

// Short editors delegate to the shared sheet. Long editors reuse its lock,
// viewport and focus primitives, with opaque directional nested-page motion.
export function createProfileSurface({panel,backdrop,scroller,heading,handle,background,onBack,win=window}) {
  let sheet,unlock,releaseViewport,releaseInert,opener,animation,resolveClose,closePromise,active=false,closing=false;
  const history=createNestedHistory(win,options=>{
    // Native Back closes the top confirmation first, matching the existing
    // Profile route guard. It must not hide privacy underneath an open dialog.
    const confirmation=win.document.querySelector('dialog[open]');
    if(confirmation){confirmation.close();history.open();return;}
    onBack(options);
  });
  const reduced=()=>win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blur=()=>{if(panel.contains(win.document.activeElement))win.document.activeElement.blur();};
  const keydown=event=>{
    if(sheet||!active||panel.inert||win.document.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onBack();}
    if(event.key==='Tab'){
      const items=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(e=>!e.closest('[hidden],[inert]')&&e.getClientRects().length);
      const i=items.indexOf(win.document.activeElement);
      if(i<0||event.shiftKey&&i===0||!event.shiftKey&&i===items.length-1){event.preventDefault();focusSurfaceTarget(event.shiftKey?items.at(-1):items[0]);}
    }
  };
  function finish(restore=true){
    if(!active)return Promise.resolve();
    animation?.cancel();animation=null;blur();panel.hidden=true;panel.inert=false;
    releaseViewport?.();releaseViewport=null;releaseInert?.();releaseInert=null;unlock?.();unlock=null;
    win.document.body.classList.remove('profile-nested-open','profile-page-open');panel.removeEventListener('keydown',keydown);
    active=false;if(restore)focusSurfaceTarget(opener);
    const resolve=resolveClose;resolveClose=null;
    return history.close().then(()=>{closing=false;resolve?.();});
  }
  return {
    open(kind,trigger){
      opener=trigger;active=true;closing=false;panel.dataset.presentation=kind;
      panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');heading.tabIndex=-1;
      if(kind==='sheet'){
        sheet=createSheetSurface({panel,backdrop,handle,scroller,background,initialFocus:()=>heading,onDismiss:onBack,onBack,win});
        sheet.open({returnTo:trigger});
      }else{
        history.open();
        unlock=lockSurfaceScroll(win);panel.hidden=false;releaseInert=isolateSurfaceBackground(background());
        win.document.body.classList.add('profile-nested-open','profile-page-open');releaseViewport=bindSurfaceViewport(panel,win,{scroller});
        panel.addEventListener('keydown',keydown);focusSurfaceTarget(heading);
        animation=animateNestedPage(panel,true,win);
      }
      scroller.scrollTop=0;
    },
    close(options={}){
      if(closing)return closePromise||Promise.resolve();
      if(!active)return Promise.resolve();closing=true;blur();
      if(sheet){const current=sheet;return current.close(options).then(()=>{sheet=null;active=closing=false;});}
      if(options.immediate||reduced()||panel.dataset.swipeBackCommitted==='true')return closePromise=finish(options.restoreFocus!==false);
      const start=win.getComputedStyle(panel).transform;animation?.cancel();panel.inert=true;
      closePromise=new Promise(resolve=>resolveClose=resolve);
      animation=animateNestedPage(panel,false,win,start==='none'?undefined:start);
      if(animation)animation.finished.then(()=>finish(options.restoreFocus!==false),()=>finish(options.restoreFocus!==false));
      else finish(options.restoreFocus!==false);
      return closePromise;
    },
    reveal(field){
      const bounds=scroller.getBoundingClientRect(),r=field.getBoundingClientRect();
      if(r.top<bounds.top+12)scroller.scrollTop+=r.top-bounds.top-12;
      else if(r.bottom>bounds.bottom-12)scroller.scrollTop+=r.bottom-bounds.bottom+12;
    },
    get closing(){return closing;},
    dispose(){history.dispose();if(sheet){blur();sheet.dispose();sheet=null;active=closing=false;}else if(active)finish(false);},
  };
}
