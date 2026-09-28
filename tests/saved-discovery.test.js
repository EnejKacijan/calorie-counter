import test from "node:test";
import assert from "node:assert/strict";
await import("../public/food-reuse.js");
const { savedLibraryHint } = globalThis.IntakeFoodReuse;
test("saved-meal hint stays absent when there are no meals", () => {
  assert.equal(savedLibraryHint(0, 5), "");
  assert.equal(savedLibraryHint(undefined, 0), "");
  assert.equal(savedLibraryHint(1, 1, "my"), "");
});
test("saved-meal hint uses real counts and singular/plural labels", () => {
  assert.equal(savedLibraryHint(1, 1), "Saved includes 1 meal + 1 food.");
  assert.equal(savedLibraryHint(2, 0), "Saved includes 2 meals + 0 foods.");
  assert.equal(savedLibraryHint(3, 4), "Saved includes 3 meals + 4 foods.");
});
