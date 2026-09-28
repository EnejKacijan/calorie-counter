import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function setup({ exact, fallback, fetch }) {
  const handlers = {};
  const writes = [];
  const cache = { match: async (request, options) => options?.ignoreSearch ? fallback : exact, put: async (...args) => writes.push(args) };
  vm.runInNewContext(source, { URL, fetch, caches: { open: async () => cache }, self: { location: { origin: "https://intake.test" }, addEventListener: (name, fn) => handlers[name] = fn } });
  let response, background;
  return { writes, run(path, mode = "navigate") {
    handlers.fetch({ request: { url: `https://intake.test${path}`, method: "GET", mode }, respondWith: p => response = p, waitUntil: p => background = p });
    return { response, background };
  } };
}
const fresh = { ok: true, status: 200, clone() { return this; } };
test("warm tab returns cached HTML without waiting for the network", async () => {
  let release;
  const cached = { cached: true };
  const f = setup({ exact: cached, fetch: () => new Promise(resolve => release = resolve) });
  const request = f.run("/progress.html");
  assert.equal(await request.response, cached);
  release(fresh); await request.background;
  assert.equal(f.writes.length, 1);
});
test("new asset version fetches its exact version instead of stale fallback", async () => {
  const f = setup({ fallback: { old: true }, fetch: async () => fresh });
  assert.equal(await f.run("/styles.css?v=new", "cors").response, fresh);
});
test("offline navigation keeps the cached page usable", async () => {
  const cached = { cached: true };
  const f = setup({ exact: cached, fetch: async () => { throw Error("offline"); } });
  const request = f.run("/profile.html");
  assert.equal(await request.response, cached); await request.background;
});
test("uncached version can use existing asset only when network fails", async () => {
  const cached = { cached: true };
  const f = setup({ fallback: cached, fetch: async () => { throw Error("offline"); } });
  assert.equal(await f.run("/styles.css?v=new", "cors").response, cached);
});
test("API requests remain network-only", async () => {
  const f = setup({ exact: { stale: true }, fetch: async () => fresh });
  assert.equal(await f.run("/api/search", "cors").response, fresh);
});
