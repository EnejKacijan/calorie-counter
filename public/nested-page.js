// Nested pages keep their live, committed parent mounted. Translate the opaque
// page, not individual fields (and never a top-level route snapshot).
export const nestedPageTiming = Object.freeze({
  opening: {duration:170, easing:'cubic-bezier(.2,.8,.2,1)'},
  closing: {duration:150, easing:'cubic-bezier(.2,.8,.2,1)'},
});
export const nestedFrames = (opening, start = 'translateX(0px)') => opening
  ? [{transform:'translateX(18px)'},{transform:'translateX(0px)'}]
  : [{transform:start},{transform:'translateX(24px)'}];
export function animateNestedPage(panel, opening, win = window, start) {
  const preference=win.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || win.document.hidden || !panel.animate) return null;
  const animation = panel.animate(nestedFrames(opening,start), {
    ...nestedPageTiming[opening ? 'opening' : 'closing'], fill:'both',
  });
  // WAAPI's inherited timeline can already be a frame old on WebKit. Hold the
  // initial pose through a paint, then start at the current document timestamp.
  animation.pause();animation.currentTime=0;
  let frame=win.requestAnimationFrame(()=>{frame=win.requestAnimationFrame(()=>{
    frame=0;if(animation.playState!=='idle'){animation.play();animation.startTime=win.document.timeline.currentTime;}
  });});
  const cancel=animation.cancel.bind(animation);
  const hidden=()=>{if(win.document.hidden)animation.cancel();};
  const reduce=()=>{if(preference.matches)animation.cancel();};
  win.document.addEventListener?.('visibilitychange',hidden);preference.addEventListener?.('change',reduce);
  animation.cancel=()=>{win.cancelAnimationFrame(frame);frame=0;win.document.removeEventListener?.('visibilitychange',hidden);preference.removeEventListener?.('change',reduce);cancel();};
  animation.finished.then(()=>animation.cancel(),()=>{});
  return animation;
}

// Same-URL nested entry: native browser Back must target the actual parent,
// not the previous top-level route. The router's intakeIndex stays unchanged.
export function createNestedHistory(win, onBack) {
  let marker=null,serial=0,resolveUnwind=null;
  const pop=()=>{
    if(resolveUnwind){const resolve=resolveUnwind;resolveUnwind=null;resolve();return;}
    if(marker && win.history.state?.intakeNestedPage!==marker){marker=null;onBack({fromHistory:true,immediate:true});}
  };
  win.addEventListener('popstate',pop);
  return {
    open(){marker=`nested-${Date.now()}-${++serial}`;win.history.pushState({...win.history.state,intakeNestedPage:marker},'',win.location.href);},
    close(){
      const owned=marker && win.history.state?.intakeNestedPage===marker;marker=null;
      if(!owned)return Promise.resolve();
      const done=new Promise(resolve=>resolveUnwind=resolve);win.history.back();return done;
    },
    dispose(){
      win.removeEventListener('popstate',pop);
      if(marker && win.history.state?.intakeNestedPage===marker){const {intakeNestedPage,...state}=win.history.state;win.history.replaceState(state,'',win.location.href);}
      marker=null;resolveUnwind?.();resolveUnwind=null;
    },
  };
}
