import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBarcode } from "../public/barcode.js";
import { normalizeLabel, analyzeFoodLabel } from "../server/food-label.js";
import { readFileSync } from "node:fs";

test("only the canonical scanner owns camera/gallery inputs and image/barcode requests", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  for (const legacy of ["foodGalleryShortcut", "foodScanMenu", "foodPhotoButton", "foodGalleryButton", "foodPhotoInput", "foodGalleryInput", "foodScanLoading", "analyzeFoodPhoto", "detectBarcode", "lookupBarcode"]) {
    assert.equal(app.includes(legacy), false, legacy);
    assert.equal(html.includes(legacy), false, legacy);
  }
  assert.doesNotMatch(app, /\/api\/foods\/(?:analyze-image|barcode\?)/);
  assert.match(app, /mountPackageScan\(/);
  assert.match(app, /function openFoodScanFromFab\(\) \{\s*openAddFoodFromFab\(\);\s*scanner\.open\(\);/);
  assert.match(app, /if \(action === "scan"\) elements\.foodScanButton\.click\(\)/);
});
test("product barcode validates check digits and preserves leading zeros", () => {
  assert.equal(normalizeBarcode("3017 6204 22003"), "3017620422003");
  assert.equal(normalizeBarcode("012345678905"), "012345678905");
  for (const code of ["3017620422004", "123", "abcdef", "123456789"]) assert.throws(() => normalizeBarcode(code));
});
const label = { readable: true, name: "Yogurt", basis: "100g", portionAmount: null, portionUnit: "unknown", calories: 65, protein: 4.5, carbs: 5, fat: 3 };
test("label transcription preserves the printed basis without estimating portion", () => {
  assert.equal(normalizeLabel(label).servingGrams, 100);
  assert.equal(normalizeLabel({ ...label, basis: "100ml" }).servingMl, 100);
  const perServing = normalizeLabel({ ...label, basis: "serving", portionAmount: 30, portionUnit: "g" });
  assert.equal(perServing.servingGrams, 30); assert.equal(perServing.calories, 65);
  assert.equal(normalizeLabel({ ...label, basis: "serving" }).servingGrams, null);
});
test("unreadable, missing and invalid label values never become zero estimates", () => {
  for (const change of [{ readable: false }, { basis: "unknown" }, { protein: null }, { calories: -1 }, { fat: "3" }]) assert.equal(normalizeLabel({ ...label, ...change }), null);
  assert.equal(normalizeLabel({ ...label, calories: 0 }).calories, 0);
});
test("label endpoint requests strict transcription and maps a provider reply", async () => {
  const result = await analyzeFoodLabel("data:image/png;base64," + "A".repeat(600), { openAiApiKey: "test", fetchFn: async (_url, options) => {
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.match(body.instructions, /Never mix columns/);
    return { ok: true, json: async () => ({ output_text: JSON.stringify(label) }) };
  } });
  assert.equal(result.food.protein, 4.5);
});
