import { nestedFrames, nestedPageTiming } from './nested-page.js?v=2';
// Full-screen task/nested presentation only. No viewport, form or gesture ownership.
export const addPresentationTiming = Object.freeze({
  opening: {duration:170,easing:'cubic-bezier(.2,.8,.2,1)'},
  closing: {duration:180,easing:'cubic-bezier(.2,.8,.2,1)'},
});

export function createAddPresentation(surface, win, onClosed, { fullExit = false, nested = fullExit } = {}) {
  // Food and Exercise share horizontal entry/Back, matching their live edge
  // gesture. Keep the short legacy Exercise-edit profile separate.
  const timing = nested ? nestedPageTiming : addPresentationTiming;
  const exitsFully = fullExit || !nested;
  const openingFrame = {...nestedFrames(true)[0],opacity:1};
  const closingFrame = {...nestedFrames(false)[1],...(exitsFully ? {transform:'translateX(100%)'} : {}),opacity:1};
  const rest = {...nestedFrames(true)[1],opacity:1};
  let state = 'closed', animation, timer = 0, frame = 0, sequence = 0;
  const currentFrame = () => {
    const style = win.getComputedStyle(surface);
    return { transform: style.transform, opacity: Number(style.opacity) };
  };
  const setState = value => { state = value; surface.dataset.addState = value; };
  function cancel() {
    sequence++;
    win.clearTimeout(timer); timer = 0;
    win.cancelAnimationFrame(frame); frame = 0;
    const previous = animation; animation = null; previous?.cancel();
  }
  function complete(next) {
    cancel();
    // Remove the transient containing block once open. On close the callback
    // unmounts the cover synchronously, before another frame can paint.
    setState(next);
    if (next === 'closed') onClosed();
  }
  function move(next, from, to, immediate) {
    cancel(); setState(next);
    const destination = next === 'opening' ? 'open' : 'closed';
    if (immediate || !surface.animate || win.document.visibilityState === 'hidden') {
      complete(destination); return;
    }
    const ticket = sequence, phase = fullExit && next === 'closing' ? {...timing.closing,duration:180} : timing[next];
    animation = surface.animate([from,to], {...phase,fill:'both'});
    const finish = () => { if (ticket === sequence) complete(destination); };
    animation.finished.then(finish, finish);
    if (exitsFully && next === 'closing') {
      // This surface is already rendered. Start from its sampled visible frame,
      // without the new-surface entrance paint hold or another exit phase.
      animation.startTime = win.document.timeline.currentTime;
      timer = win.setTimeout(finish, phase.duration + 80);
      return;
    }
    // WebKit can start a new animation against the previous render timestamp
    // after the synchronous mount/layout work. Its first paint then skips most
    // of the entrance. Hold the actual effect at zero through one render phase;
    // only the next frame starts the clock, for both entry and exit.
    animation.pause(); animation.currentTime = 0;
    frame = win.requestAnimationFrame(() => {
      if (ticket !== sequence) return;
      frame = win.requestAnimationFrame(() => {
        frame = 0; if (ticket !== sequence) return;
        animation.play();
        // Use this render's timeline, not the task that mounted the form.
        animation.startTime = win.document.timeline.currentTime;
        // Lost-event safety starts with playback, never during the paint boundary.
        timer = win.setTimeout(finish, phase.duration + 80);
      });
    });
  }
  return {
    get state() { return state; },
    get frame() { return currentFrame(); },
    open({from=openingFrame,immediate=false}={}) { move('opening',from,rest,immediate); },
    close({immediate=false}={}) {
      if (state === 'closed' || state === 'closing') return;
      // Read before cancelling the entrance: immediate Back reverses from the
      // currently visible position, never from a newly snapped-to-top frame.
      move('closing',currentFrame(),closingFrame,immediate);
    },
    settle() { if(state==='opening')complete('open');else if(state==='closing')complete('closed'); },
    dispose() { cancel();setState('closed'); },
  };
}
