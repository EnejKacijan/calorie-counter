import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function setup({ exact, fallback, alias, pathname, fetch }) {
  const handlers = {};
  const writes = [];
  const cache = { match: async (request, options) => {
    if (typeof request === "string" && request.endsWith(".html")) return alias;
    if (typeof request === "string") return pathname;
    return options?.ignoreSearch ? fallback : exact;
  }, put: async (...args) => writes.push(args) };
  vm.runInNewContext(source, { URL, fetch, caches: { open: async () => cache }, self: { location: { origin: "https://intake.test" }, addEventListener: (name, fn) => handlers[name] = fn } });
  let response, background;
  return { writes, run(path, mode = "navigate") {
    handlers.fetch({ request: { url: `https://intake.test${path}`, method: "GET", mode }, respondWith: p => response = p, waitUntil: p => background = p });
    return { response, background };
  } };
}
const fresh = { ok: true, status: 200, clone() { return this; } };
test("warm tab stays on its controlling worker's immutable HTML", async () => {
  let fetched = 0;
  const cached = { cached: true };
  const f = setup({ exact: cached, fetch: async () => { fetched++; return fresh; } });
  const request = f.run("/progress.html");
  assert.equal(await request.response, cached);
  assert.equal(fetched, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(request.background, undefined);
});
test("a versioned asset uses its worker's precached deployment, not newer network bytes", async () => {
  let fetched = 0;
  const cached = { build: "worker-build" };
  const f = setup({ pathname: cached, fetch: async () => { fetched++; return fresh; } });
  assert.equal(await f.run("/styles.css?v=new", "cors").response, cached);
  assert.equal(fetched, 0);
});
test("offline navigation keeps the cached page usable", async () => {
  const cached = { cached: true };
  const f = setup({ exact: cached, fetch: async () => { throw Error("offline"); } });
  const request = f.run("/profile.html");
  assert.equal(await request.response, cached);
});
test("offline extensionless Pretty URL resolves to its precached route", async () => {
  const cached = { profile: true };
  const f = setup({ alias: cached, fetch: async () => { throw Error("offline"); } });
  assert.equal(await f.run("/profile").response, cached);
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
test("a new service worker waits for old clients unless the user accepts the update", () => {
  assert.doesNotMatch(source.slice(source.indexOf('self.addEventListener("install"'), source.indexOf('self.addEventListener("message"')), /skipWaiting|clients\.claim/);
  assert.match(source, /event\.data\?\.type === "ACTIVATE_UPDATE"\) self\.skipWaiting\(\)/);
  assert.doesNotMatch(source.slice(source.indexOf('function serveShell'), source.indexOf('function urlPath')), /fetchAndCache\(request\)[\s\S]*event\.waitUntil/);
});
