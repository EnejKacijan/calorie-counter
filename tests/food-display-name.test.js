import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {formatFoodDisplayName} from '../public/food-display-name.js';
import {rankFoodMatches} from '../public/food-search.js';
import {mediaIdValid, savedPhotoDefinition} from '../public/food-media.js';
import '../public/food-persistence.js';
import '../public/food-reuse.js';
import '../public/scanned-food.js';
const persistence = globalThis.IntakeFoodPersistence, reuse = globalThis.IntakeFoodReuse;
const ai = (name, extra = {}) => ({name, source:'OpenAI photo estimate', ...extra});
for (const [raw, expected] of [
  ['grilled sausage links','Grilled sausage links'], ['flatbread, toasted','Flatbread, toasted'],
  ['chicken breast with rice','Chicken breast with rice'], ['BBQ chicken','BBQ chicken'],
  ["McDonald's fries","McDonald's fries"], ['Greek yogurt','Greek yogurt'], ['USDA turkey sandwich','USDA turkey sandwich'],
  ['coca-Cola','Coca-Cola'], ['2 eggs','2 Eggs'], ['(grilled) chicken','(Grilled) chicken'],
  ['"homemade" soup','"Homemade" soup'], ['čokoladni puding','Čokoladni puding'],
  ['🥚 2 œufs','🥚 2 Œufs'], ['e\u0301clair','E\u0301clair'], ['寿司','寿司'],
  ['суп','Суп'], ['𐐨 food','𐐀 food'], ['ß food','ß food'], ['123 🥚','123 🥚'],
  ['  grilled  sausage links  ','  Grilled  sausage links  '], ['eBay protein bar','eBay protein bar'],
]) test(`AI display: ${JSON.stringify(raw)} → ${JSON.stringify(expected)}`, () => {
  const food = Object.freeze(ai(raw));
  assert.equal(formatFoodDisplayName(food), expected);
  assert.equal(food.name, raw);
});

test('invalid/blank names retain caller fallback; no coercion of malformed legacy objects', () => {
  for (const food of [null, undefined, {}, ai(null), ai(undefined), ai(''), ai(' \n '), ai({}), ai(23), ai([])]) {
    assert.equal(formatFoodDisplayName(food), '');
    assert.equal(formatFoodDisplayName(food,'Food entry'), 'Food entry');
  }
});

test('all three AI sources, original source and retained AI provenance share one display rule', () => {
  for (const extra of [
    {source:'OpenAI photo estimate'}, {source:'AI ESTIMATE'}, {source:'Label · AI transcription'},
    {source:'Photo'}, {source:'photo estimate'}, {source:'Saved',originalSource:'OpenAI photo estimate'},
    {source:'Recent',aiEstimate:{inputMode:'text'}},
  ]) assert.equal(formatFoodDisplayName(ai('flatbread, toasted',extra)), 'Flatbread, toasted');
});

test('manual/catalog/unknown provenance and explicit user casing are never normalized', () => {
  for (const source of ['Manual','USDA','Open Food Facts','OFF','Saved','','Daily foods']) {
    assert.equal(formatFoodDisplayName({name:'raw food',source}), 'raw food');
  }
  for (const source of ['Manual','USDA','Open Food Facts']) {
    assert.equal(formatFoodDisplayName({name:'raw food',source,aiEstimate:{inputMode:'text'}}), 'raw food');
  }
  for (const name of ['eBay protein bar','my own food','bbq chicken','čokoladni puding']) {
    assert.equal(formatFoodDisplayName(ai(name,{nameEdited:true})),name);
  }
});

const source = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function code(name) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf('\n}',start)+2;
  assert.ok(start >= 0 && end > start);
  return source.slice(start,end);
}
function fixture() {
  const c = vm.createContext({foodPersistence:persistence, mediaIdValid, structuredClone,
    roundNutritionValue:n=>Math.round(Number(n||0)*10)/10,
    formatScannedFoodPortion:()=> '1 serving', scannedFoodAnalysis:{inputMode:'photo'},
    IntakeScannedFood:globalThis.IntakeScannedFood, localRecordId:()=> 'scan-fixture',
  });
  vm.runInContext(['foodSource','normalizeFoodForLibrary','scannedFoodToReusableEntry','createScannedFoodItem'].map(code).join('\n'),c);
  return c;
}

test('AI creation, Today, Recent, Saved and Saved Meal snapshots retain raw identity and edited-name provenance', () => {
  const c = fixture();
  for (const edited of [false,true]) {
    const raw = edited ? 'my eBay protein bar' : 'grilled sausage links';
    const scan = c.createScannedFoodItem(ai(raw,{amount:1,unit:'serving',calories:100,protein:4,carbs:8,fat:6}));
    if (edited) scan.nameEdited = true;
    const diary = persistence.ensureStableFoodIdentity(c.scannedFoodToReusableEntry(scan,'lunch'));
    const normalized = c.normalizeFoodForLibrary(diary);
    const recent = persistence.updateRecentFoods([], [normalized])[0];
    const saved = persistence.uniqueSavedFoods([savedPhotoDefinition(normalized)])[0];
    const meal = reuse.snapshotFoodEntry(saved);
    for (const food of [scan,diary,normalized,recent,saved,meal]) {
      assert.equal(food.name,raw);
      assert.equal(food.nameEdited,edited ? true : undefined);
      assert.equal(formatFoodDisplayName(food),edited ? raw : 'Grilled sausage links');
    }
    for (const food of [normalized,recent,saved,meal]) assert.equal(persistence.foodIdentityKey(food),persistence.foodIdentityKey(diary));
    assert.equal(normalized.displayName,raw);
    assert.equal(normalized.resolvedFoodName,raw);
  }
});

test('formatting existing records leaves every stored property, identity and search ranking untouched', () => {
  const foods = [ai('flatbread, toasted',{id:'a',calories:123,amount:2,unit:'piece'}), ai('flatbread',{id:'b'})];
  const before = JSON.stringify(foods), keys = foods.map(persistence.foodIdentityKey);
  const ranking = rankFoodMatches(foods,'flatbread').map(f=>f.id);
  foods.forEach(formatFoodDisplayName);
  assert.equal(JSON.stringify(foods),before);
  assert.deepEqual(foods.map(persistence.foodIdentityKey),keys);
  assert.deepEqual(rankFoodMatches(foods,'flatbread').map(f=>f.id),ranking);
});

test('Edit Food/label form displays names but saves canonical names; only real name input marks ownership', () => {
  assert.match(code('fillFoodFormForEdit'), /foodEditName\.textContent = formatFoodDisplayName\(food, "Food entry"\)/);
  assert.match(code('fillManualFood'), /manualFoodName\.value = formatFoodDisplayName\(food\)/);
  assert.match(source, /name: \(selectedFoodBase\?\.name \?\? elements\.manualFoodName\.value\)\.trim\(\)/);
  const input = source.slice(source.indexOf('elements.manualFoodName.addEventListener("input"'), source.indexOf('elements.manualFoodName.addEventListener("keydown"'));
  assert.match(input, /!elements\.manualFoodName\.readOnly/);
  assert.match(input, /selectedFoodBase\.name = elements\.manualFoodName\.value;\s+selectedFoodBase\.nameEdited = true/);
});
