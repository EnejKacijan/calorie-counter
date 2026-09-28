// Viewer policy only: the existing viewer pointer map remains the single
// pan/pinch/dismiss owner. Like sheet/edge Back, velocity is the latest movement
// sample, expires after 100ms, and never substitutes for a minimum distance.
export function photoDismissIntent(dx, dy) {
  if (dy < -10 || Math.abs(dx) >= 10 && Math.abs(dx) * 1.3 >= dy) return 'ignore';
  return dy > 10 && dy > Math.abs(dx) * 1.3 ? 'dismiss' : 'pending';
}
export const photoDismissEligible = (scale, count) => scale === 1 && count === 1;
export const photoDismissCommits = (distance, height, velocity) => distance >= height * .26 || distance >= 72 && velocity >= .65;
export const photoDismissDuration = (distance, height) => Math.max(80, Math.min(180, 80 + 100 * distance / (height * .26)));
export function photoDismissPose(dx, dy, height) {
  const distance = Math.max(0, dy), progress = Math.max(0, Math.min(1, distance / (height * .4)));
  const x = Math.max(-24, Math.min(24, dx * .15)), scale = 1 - progress * .14;
  return {distance, progress, scale, transform:`translate3d(${x}px,${distance}px,0) scale(${scale})`, scrim:1 - progress * .78, chrome:1 - progress};
}
export function createPhotoDismiss({x, y, at, height, scale, count}) {
  if (!photoDismissEligible(scale, count) || !(height > 0)) return null;
  let phase = 'pending', lastY = y, lastAt = at, velocity = 0, pose = photoDismissPose(0,0,height);
  return {
    get active() { return phase === 'dismiss'; },
    move(nextX, nextY, time) {
      if (phase === 'ignore') return null;
      const dx = nextX - x, dy = nextY - y;
      if (phase === 'pending') phase = photoDismissIntent(dx,dy);
      velocity = (nextY - lastY) / Math.max(1,time - lastAt); lastY = nextY; lastAt = time;
      if (phase !== 'dismiss') return null;
      pose = photoDismissPose(dx,dy,height); return pose;
    },
    end(time, cancelled = false) {
      const active = phase === 'dismiss'; phase = 'ignore';
      return {active, height, distance:pose.distance, commit:active && !cancelled && photoDismissCommits(pose.distance,height,time - lastAt < 100 ? velocity : 0)};
    },
  };
}
