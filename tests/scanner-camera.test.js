import test from "node:test";
import assert from "node:assert/strict";
import { createScannerCamera, cameraPermissionState } from "../public/scanner-camera.js";
test("permission preflight distinguishes granted, prompt, denied and unsupported without requesting media", async () => {
  let requests = 0;
  for (const state of ["granted", "prompt", "denied"]) {
    const navigatorLike = { permissions: { query: async () => ({ state }) }, mediaDevices: { getUserMedia: () => { requests++; } } };
    assert.equal(await cameraPermissionState(navigatorLike), state);
  }
  assert.equal(await cameraPermissionState({}), "unsupported");
  assert.equal(await cameraPermissionState({ permissions: { query: async () => { throw Error("not supported"); } } }), "unsupported");
  assert.equal(requests, 0);
});
test("camera stops a stream arriving after close", async () => {
  let resolve, stopped = 0;
  const video = { srcObject: null, play: async () => {} };
  const camera = createScannerCamera(video, { getUserMedia: () => new Promise(r => resolve = r) });
  const pending = camera.start(); camera.stop();
  resolve({ getTracks: () => [{ stop: () => stopped++ }] });
  assert.equal(await pending, false); assert.equal(stopped, 1); assert.equal(video.srcObject, null);
});
test("mode restart and disposal release all camera tracks", async () => {
  let stopped = 0;
  const video = { srcObject: null, play: async () => {} };
  const camera = createScannerCamera(video, { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) });
  assert.equal(await camera.start(), true);
  assert.equal(await camera.start(), true); assert.equal(stopped, 1);
  camera.stop(); camera.stop(); assert.equal(stopped, 2); assert.equal(video.srcObject, null);
});
test("unavailable camera has an actionable fallback", async () => {
  await assert.rejects(createScannerCamera({ srcObject: null }).start(), /Take or choose a photo/);
});

test("permission rejection leaves no attached stream", async () => {
  const video = { srcObject: null, hidden: false };
  const camera = createScannerCamera(video, { getUserMedia: async () => { throw new Error("Permission denied"); } });
  await assert.rejects(camera.start(), /Permission denied/);
  assert.equal(video.srcObject, null); assert.equal(video.hidden, true);
});

test("failed video playback releases the stream", async () => {
  let stopped = 0;
  const video = { srcObject: null, play: async () => { throw new Error("Playback failed"); } };
  const camera = createScannerCamera(video, { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) });
  await assert.rejects(camera.start(), /Playback failed/);
  assert.equal(stopped, 1); assert.equal(video.srcObject, null);
});

test("late permission for an old mode cannot replace a newer camera stream", async () => {
  const pending = [], stopped = [];
  const stream = id => ({ id, getTracks: () => [{ stop: () => stopped.push(id) }] });
  const video = { srcObject: null, play: async () => {} };
  const camera = createScannerCamera(video, { getUserMedia: () => new Promise(resolve => pending.push(resolve)) });
  const old = camera.start(), fresh = camera.start();
  const freshStream = stream("fresh");
  pending[1](freshStream); assert.equal(await fresh, true);
  pending[0](stream("old")); assert.equal(await old, false);
  assert.equal(video.srcObject, freshStream); assert.deepEqual(stopped, ["old"]);
  camera.stop(); assert.deepEqual(stopped, ["old", "fresh"]);
});

test("camera diagnostics separate acquisition from preview playback", async () => {
  const events = [];
  const video = { srcObject: null, readyState: 4, videoWidth: 640, play: async () => {} };
  const camera = createScannerCamera(video, { getUserMedia: async () => ({ getTracks: () => [] }) }, event => events.push(event));
  assert.equal(await camera.start(), true);
  assert.deepEqual(events.map(e => e.phase), ['requesting', 'playing', 'ready']);
  assert.deepEqual(events.map(e => e.request), ['pending', 'resolved', 'resolved']);
});
test("a resolved play with no usable frame is not capture-ready and releases stream", async () => {
  let stopped = 0; const events = [];
  const video = { srcObject: null, readyState: 0, videoWidth: 0, play: async () => {} };
  const camera = createScannerCamera(video, { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) }, e => events.push(e));
  await assert.rejects(camera.start(), { name: 'CameraPreviewError' });
  assert.equal(stopped, 1); assert.equal(events.at(-1).phase, 'play-error');
});
test("retry after rejected acquisition makes a new request with truthful error diagnostics", async () => {
  let attempts = 0; const events = [];
  const video = { srcObject: null, play: async () => {} };
  const camera = createScannerCamera(video, { getUserMedia: async () => {
    if (++attempts === 1) throw new DOMException('denied', 'NotAllowedError'); return { getTracks: () => [] };
  } }, e => events.push(e));
  await assert.rejects(camera.start(), { name: 'NotAllowedError' });
  assert.equal(events.at(-1).request, 'rejected'); assert.equal(events.at(-1).errorName, 'NotAllowedError');
  assert.equal(await camera.start(), true); assert.equal(attempts, 2);
});
test("failed stream attachment releases the acquired stream", async () => {
  let stopped=0;
  const video={get srcObject(){return null;},set srcObject(value){if(value)throw Error('attach failed');}};
  const camera=createScannerCamera(video,{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})});
  await assert.rejects(camera.start(),/attach failed/);assert.equal(stopped,1);
});
