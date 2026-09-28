import test from "node:test";
import assert from "node:assert/strict";
import { lockSurfaceScroll, sheetDismisses } from "../public/mobile-surface.js";
import { backIntent, commitsBack } from "../public/semantic-back.js";
test("nested surface locks restore once, regardless of close order", () => {
  const style = { position: "", top: "", left: "", right: "", width: "", overflow: "auto" };
  const calls = [];
  const win = { document: { body: { style } }, scrollY: 280, scrollTo: value => calls.push(value) };
  const first = lockSurfaceScroll(win), nested = lockSurfaceScroll(win);
  first(); first(); assert.equal(style.position, "fixed"); assert.equal(calls.length, 0);
  nested(); assert.equal(style.position, ""); assert.equal(style.overflow, "auto"); assert.equal(calls.length, 1); assert.equal(calls[0].top, 280);
});
test("sheet threshold accepts deliberate drag or flick, not a tap", () => {
  assert.equal(sheetDismisses(8, 2), false); assert.equal(sheetDismisses(72, 0), true); assert.equal(sheetDismisses(25, .7), true); assert.equal(sheetDismisses(25, .1), false);
});
test("semantic Back preserves vertical scroll intent and requires distance", () => {
  assert.equal(backIntent(4, 20), "ignore"); assert.equal(backIntent(-20, 0), "ignore"); assert.equal(backIntent(30, 3), "back"); assert.equal(backIntent(3, 2), "pending");
  assert.equal(commitsBack(10, 390, 3), false); assert.equal(commitsBack(150, 390, 0), true); assert.equal(commitsBack(60, 390, .8), true);
});
