// Viewer-only image reveal. The image remains uniformly scaled; a temporary
// crop matches the source thumbnail's object-fit:cover rather than stretching it.
import { photoDismissDuration } from './photo-dismiss.js?v=1';
export function photoRevealFrame(source, stage, imageWidth, imageHeight) {
  if (!source || !stage?.width || !stage.height || !source.width || !source.height || !imageWidth || !imageHeight) return null;
  const fit = Math.min(stage.width / imageWidth, stage.height / imageHeight);
  const scale = Math.max(source.width / (imageWidth * fit), source.height / (imageHeight * fit));
  const x = source.x + source.width / 2 - stage.x - stage.width / 2;
  const y = source.y + source.height / 2 - stage.y - stage.height / 2;
  const insetX = Math.max(0, (stage.width - source.width / scale) / 2);
  const insetY = Math.max(0, (stage.height - source.height / scale) / 2);
  return { transform: `translate(${x}px,${y}px) scale(${scale})`, clipPath: `inset(${insetY}px ${insetX}px)`, opacity: 1 };
}

export const photoViewerTiming = Object.freeze({ opening: 180, closing: 160, easing: 'cubic-bezier(.2,.8,.2,1)' });
const rest = { transform: 'translate(0px,0px) scale(1)', clipPath: 'inset(0px 0px)', opacity: 1 };
const compact = { ...rest, transform: 'translate(0px,0px) scale(.96)', opacity: 0 };

export function createPhotoMotion({ frame, scrim, chrome, win, onState, onClosed }) {
  let phase = 'idle', effects = [], epoch = 0, raf = 0, timer = 0, dragRaf = 0, nextPose;
  const set = value => { phase = value; onState?.(value); };
  const sample = node => { const s = win.getComputedStyle(node); return { transform: s.transform, clipPath: s.clipPath, opacity: Number(s.opacity) }; };
  function stop() { epoch++; win.cancelAnimationFrame(raf); win.cancelAnimationFrame(dragRaf); win.clearTimeout(timer); raf = timer = dragRaf = 0; const old = effects; effects = []; old.forEach(a => a.cancel()); }
  function resetPose() { Object.assign(frame.style,rest); [scrim,...chrome].forEach(node => { node.style.opacity = '1'; }); }
  function finish(value) { stop(); if (value === 'open') resetPose(); set(value); if (value === 'closed') onClosed(); }
  function run(next, from, to, immediate, settleDuration) {
    const layers = [scrim, ...chrome], starts = layers.map(n => next === 'opening' ? 0 : Number(win.getComputedStyle(n).opacity));
    stop(); set(next); const destination = next === 'closing' ? 'closed' : 'open';
    if (immediate || win.document.hidden || win.matchMedia('(prefers-reduced-motion: reduce)').matches || !frame.animate) { finish(destination); return; }
    const ticket = epoch, duration = settleDuration ?? photoViewerTiming[next], options = {duration,easing:photoViewerTiming.easing,fill:'both'};
    effects = [frame.animate([from,to],options), ...layers.map((node,i) => node.animate([{opacity:starts[i]},{opacity:destination === 'open' ? 1 : 0}],options))];
    const done = () => { if (epoch === ticket) finish(destination); };
    Promise.all(effects.map(a => a.finished.catch(() => {}))).then(done);
    const play = () => { if (epoch !== ticket) return; effects.forEach(a => { a.play(); a.startTime = win.document.timeline.currentTime; }); timer = win.setTimeout(done,duration + 80); };
    if (next === 'opening') {
      effects.forEach(a => { a.pause(); a.currentTime = 0; });
      raf = win.requestAnimationFrame(() => { raf = win.requestAnimationFrame(() => { raf = 0; play(); }); });
    } else play();
  }
  return {
    get state() { return phase; },
    open(source) { run('opening',source || compact,rest); },
    close(target, {immediate=false,dismiss}={}) {
      if (phase === 'closed' || phase === 'closing') return;
      // Sample the rendered pose, not an unpainted last pointer event. The
      // source is remeasured by the caller only after parent layout is stable.
      const fallback = dismiss ? {...rest,transform:`translate3d(0,${Math.max(dismiss.height * 1.15,dismiss.distance + 100)}px,0) scale(.82)`,opacity:0} : compact;
      run('closing',sample(frame),target || fallback,immediate);
    },
    drag(pose) {
      if (phase === 'closed' || phase === 'closing') return;
      if (phase !== 'dragging') { stop(); resetPose(); set('dragging'); }
      nextPose = pose;
      if (!dragRaf) dragRaf = win.requestAnimationFrame(() => {
        dragRaf = 0; frame.style.transform = nextPose.transform;
        scrim.style.opacity = String(nextPose.scrim);
        chrome.forEach(node => { node.style.opacity = String(nextPose.chrome); });
      });
    },
    cancelDrag(distance, height, immediate=false) {
      if (phase === 'dragging') run('returning',sample(frame),rest,immediate,photoDismissDuration(distance,height));
    },
    settleOpen() { if (['opening','returning','dragging'].includes(phase)) finish('open'); },
    dispose() { stop(); set('closed'); },
  };
}
