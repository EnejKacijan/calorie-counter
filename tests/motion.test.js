import test from "node:test";
import assert from "node:assert/strict";
await import("../public/motion.js");

function fixture(reduced = false) {
  const preference = { matches: reduced, addEventListener(type, handler) { this.change = handler; } };
  const document = { visibilityState: "visible", addEventListener(type, handler) { this.change = handler; } };
  const calls = [];
  const element = { animate(frames, options) {
    const animation = { cancelled: false, cancel() { this.cancelled = true; this.oncancel?.(); } };
    calls.push({ frames, options, animation });
    return animation;
  } };
  return { preference, document, calls, element, motion: globalThis.IntakeCreateMotion({ matchMedia: () => preference, document }) };
}

test("motion is short, opacity-only by default and does not change content", () => {
  const f = fixture();
  f.element.textContent = "2350";
  f.motion.reveal(f.element);
  assert.equal(f.calls[0].options.duration, 180);
  assert.deepEqual(f.calls[0].frames, [{ opacity: 0.65 }, { opacity: 1 }]);
  assert.equal(f.element.textContent, "2350");
});
test("repeated feedback cancels the previous animation", () => {
  const f = fixture();
  f.motion.reveal(f.element);
  f.motion.reveal(f.element);
  assert.equal(f.calls[0].animation.cancelled, true);
  assert.equal(f.calls[1].animation.cancelled, false);
});
test("reduced motion skips animation and smooth scrolling", () => {
  const f = fixture(true);
  f.motion.reveal(f.element);
  assert.equal(f.calls.length, 0);
  assert.equal(f.motion.scrollBehavior(), "auto");
});
test("changing reduced-motion preference cancels in-flight motion", () => {
  const f = fixture();
  f.motion.reveal(f.element);
  f.preference.matches = true;
  f.preference.change();
  assert.equal(f.calls[0].animation.cancelled, true);
});
test("backgrounding cancels existing and skips new motion", () => {
  const f = fixture();
  f.motion.reveal(f.element);
  f.document.visibilityState = "hidden";
  f.document.change();
  f.motion.reveal(f.element);
  assert.equal(f.calls[0].animation.cancelled, true);
  assert.equal(f.calls.length, 1);
});
test("unsupported animation and absent elements remain usable", () => {
  const f = fixture();
  assert.doesNotThrow(() => { f.motion.reveal(null); f.motion.reveal({}); });
});

test("chart bars grow from the supplied zero baseline without changing data", () => {
  const f = fixture();
  f.element.height = 42;
  f.motion.growBars([f.element], 180);
  assert.equal(f.calls[0].options.duration, 520);
  assert.equal(f.calls[0].options.fill, "backwards");
  assert.equal(f.calls[0].frames[0].transform, "translateY(180px) scaleY(0) translateY(-180px)");
  assert.equal(f.element.height, 42);
});

test("chart growth respects reduced motion and live cancellation", () => {
  const f = fixture(true);
  f.motion.growBars([f.element], 100);
  assert.equal(f.calls.length, 0);
  f.preference.matches = false;
  f.motion.growBars([f.element], 100);
  f.preference.matches = true;
  f.preference.change();
  assert.equal(f.calls[0].animation.cancelled, true);
});
