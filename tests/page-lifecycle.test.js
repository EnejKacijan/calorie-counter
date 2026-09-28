import test from "node:test";
import assert from "node:assert/strict";
import { createPageScope } from "../public/page-lifecycle.js";
function fixture() {
  const host = new EventTarget();
  host.document = new EventTarget();
  Object.assign(host, { setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: callback => setTimeout(callback, 1), cancelAnimationFrame: clearTimeout });
  let disconnects = 0;
  host.MutationObserver = host.ResizeObserver = class { disconnect() { disconnects++; } };
  return { host, scope: createPageScope(host), disconnects: () => disconnects };
}
test("departed page removes global listeners, timers, frames and observers", async () => {
  const { host, scope, disconnects } = fixture();
  let calls = 0;
  scope.window.addEventListener("resize", () => calls++);
  scope.document.addEventListener("click", () => calls++);
  scope.setTimeout(() => calls++, 1);
  scope.setInterval(() => calls++, 1);
  scope.requestAnimationFrame(() => calls++);
  new scope.ResizeObserver(() => calls++);
  new scope.MutationObserver(() => calls++);
  scope.dispose();
  host.dispatchEvent(new Event("resize")); host.document.dispatchEvent(new Event("click"));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls, 0); assert.equal(disconnects(), 2);
});
test("leaving guard remains owned by the current page", () => {
  const { scope } = fixture();
  scope.onBeforeLeave(() => false); assert.equal(scope.canLeave(), false);
});
test("navigation aborts fetch and never delivers a stale response", async () => {
  const { host, scope } = fixture();
  let signal, release, delivered = false;
  host.fetch = (_, options) => { signal = options.signal; return new Promise(resolve => release = resolve); };
  void scope.fetch("/api/test").then(() => { delivered = true; });
  scope.dispose(); release({ ok: true });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(signal.aborted, true); assert.equal(delivered, false);
});

test("body parsing completed after navigation cannot update the departed screen", async () => {
  const { host, scope } = fixture();
  let release, delivered = false;
  host.fetch = async () => ({ json: () => new Promise(resolve => release = resolve) });
  const response = await scope.fetch("/api/test");
  void response.json().then(() => { delivered = true; });
  scope.dispose(); release({ value: "stale" });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(delivered, false);
});
