import test from "node:test";
import assert from "node:assert/strict";
import { summarizeNutritionRange, updateWeightEntries, restoreWeightEntry } from "../public/progress.js";
const row = (calories, more = {}) => ({ hasEntries: true, calories, netCalories: calories - 100, protein: 100, carbs: 200, fat: 50, ...more });
for (const goalType of ["lose", "maintain", "gain"]) {
  test(`Progress ${goalType}: factual over/under/equal averages, no goal-direction scoring`, () => {
    for (const [amount, direction] of [[1800, "under"], [2200, "over"], [2000, "On target"]]) {
      const summary = summarizeNutritionRange([row(amount, { goalType })], "calories", 2000);
      assert.equal(summary.difference, amount - 2000);
      assert.match(summary.values[2], new RegExp(direction));
      assert.doesNotMatch(summary.text, /good|gap|steady|success|should|next week/i);
    }
  });
}
test("Progress no logged days has no invented zero average or score", () => {
  for (const metric of ["calories", "net", "macros"]) {
    const summary = summarizeNutritionRange(Array.from({length:7}, () => row(0, {hasEntries:false})), metric, 2000);
    assert.equal(summary.loggedCount, 0); assert.equal(summary.averages.calories, null);
    assert.equal(summary.values[0], "—"); assert.equal(summary.difference, null);
    assert.equal(summary.text, "No food logged in this range yet.");
  }
});
test("Progress partial range averages only food-logged days, including zero-calorie entries", () => {
  const summary = summarizeNutritionRange([row(2000), row(0), row(0, {hasEntries:false, netCalories:-500})], "net", 2000);
  assert.equal(summary.loggedCount, 2); assert.equal(summary.averages.net, 900);
  assert.equal(summary.values[0], "900 kcal"); assert.match(summary.text, /2 of 3 days logged/);
});
test("Progress full 7/30-day ranges and macro averages are factual", () => {
  for (const length of [7,30]) {
    const summary = summarizeNutritionRange(Array.from({length}, () => row(2000)), "macros", 2000);
    assert.equal(summary.loggedCount, length);
    assert.deepEqual(summary.values, ["100 g", "200 g", "50 g"]);
  }
});
test("Progress near-target rounding never invents an on-target result", () => {
  const summary = summarizeNutritionRange([row(2000),row(2001), ...Array.from({length:28},()=>row(2000))], "calories", 2000);
  assert.equal(summary.values[2], "<0.1 kcal over");
});
test("Progress historical rows use their supplied values, not today's diary", () => {
  const summary = summarizeNutritionRange([row(1700,{dateKey:"2025-01-01"}),row(1900,{dateKey:"2025-01-02"})], "calories", 2000);
  assert.equal(summary.averages.calories, 1800); assert.equal(summary.values[2], "200 kcal under");
});
const entries = [{ id:"a", date:"2026-09-01", weightKg:80, createdAt:"original", note:"keep" }, {id:"b",date:"2026-09-02",weightKg:79}];
test("Weight edit preserves identity, metadata, ordering and input snapshot", () => {
  const result = updateWeightEntries(entries, "a", {date:"2026-09-01",weightKg:"80,5"}, "2026-09-11");
  assert.equal(result.entries.length, 2); assert.equal(result.entries[0].id,"a"); assert.equal(result.entries[0].weightKg,80.5);
  assert.equal(result.entries[0].note,"keep"); assert.equal(result.entries[0].createdAt,"original"); assert.equal(entries[0].weightKg,80);
});
test("Weight date selection updates the unique record for that day and preserves its identity", () => {
  for (const oldDraftId of [null, "a"]) {
    const result = updateWeightEntries(entries, oldDraftId, {date:"2026-09-02",weightKg:"81"}, "2026-09-11");
    assert.deepEqual(result.entries.map(e=>e.id),["a","b"]);
    assert.equal(result.entry.id,"b"); assert.equal(result.entries[1].weightKg,81);
    assert.equal(entries[1].weightKg,79);
  }
  const result = updateWeightEntries(entries,"a",{date:"2026-09-03",weightKg:81},"2026-09-11",()=>"c");
  assert.deepEqual(result.entries.map(e=>e.id),["a","b","c"]);
  assert.equal(result.entries[0].date,"2026-09-01");
});
test("Weight same-date retry preserves metadata and never allocates another ID", () => {
  const original = [{id:"daily",date:"2026-09-02",weightKg:80,createdAt:"original",note:"keep"}];
  let allocated=0;
  const first=updateWeightEntries(original,null,{date:"2026-09-02",weightKg:"80,5"},"2026-09-11",()=>{allocated++;return "new";});
  const second=updateWeightEntries(first.entries,null,{date:"2026-09-02",weightKg:"80.5"},"2026-09-11",()=>{allocated++;return "new";});
  assert.equal(allocated,0); assert.equal(second.entries.length,1);
  assert.equal(second.entry.id,"daily"); assert.equal(second.entry.createdAt,"original");
  assert.equal(second.entry.note,"keep"); assert.equal(second.entry.weightKg,80.5);
});
test("Weight updates one legacy ID-less measurement without touching another day", () => {
  const old=[{date:"2026-09-01",weightKg:80},{date:"2026-09-02",weightKg:79}];
  const result=updateWeightEntries(old,null,{date:"2026-09-02",weightKg:78},"2026-09-11",()=>"recovered-id");
  assert.equal(result.entries.length,2); assert.equal(result.entries[0],old[0]);
  assert.equal(result.entries[1].id,"recovered-id"); assert.equal(result.entries[1].weightKg,78);
});
test("Weight legacy same-date duplicates are blocked without choosing or mutating either record", () => {
  const duplicate=[...entries,{id:"legacy",date:"2026-09-02",weightKg:78,updatedAt:"2026-09-10"}];
  const result=updateWeightEntries(duplicate,null,{date:"2026-09-02",weightKg:77},"2026-09-11");
  assert.match(result.error,/Multiple weight entries/); assert.equal(result.field,"date");
  assert.deepEqual(duplicate,[...entries,{id:"legacy",date:"2026-09-02",weightKg:78,updatedAt:"2026-09-10"}]);
});
test("Weight validation rejects malformed/future dates, invalid values and missing edit IDs", () => {
  for (const date of ["","bad","2026-02-30","2026-09-12"]) assert.ok(updateWeightEntries(entries,"a",{date,weightKg:80},"2026-09-11").error);
  for (const weightKg of ["",0,34,251,"NaN","0x50", "80abc", "80.55"]) {
    assert.ok(updateWeightEntries(entries,"a",{date:"2026-09-01",weightKg},"2026-09-11").error);
  }
  assert.ok(updateWeightEntries(entries,"missing",{date:"2026-09-03",weightKg:80},"2026-09-11").error);
});
test("Weight add creates one ID and Undo restores only the removed entry", () => {
  let calls=0;
  const added = updateWeightEntries(entries,null,{date:"2026-09-03",weightKg:78},"2026-09-11",()=>{calls++;return "c";});
  assert.equal(calls,1); assert.equal(added.entries.length,3);
  const remaining = added.entries.filter(e=>e.id!=="a");
  const restored = restoreWeightEntry(remaining,entries[0]);
  assert.deepEqual(restored.entries.find(e=>e.id==="a"),entries[0]); assert.equal(restored.entries.find(e=>e.id==="c").weightKg,78);
  assert.ok(restoreWeightEntry(entries,entries[0]).error);
  assert.ok(restoreWeightEntry([{id:"new",date:entries[0].date,weightKg:70}],entries[0]).error);
});
