import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAiBudget } from "../server/ai-budget.js";
test("AI ceiling persists across restart and concurrent requests cannot overspend", async () => {
  const dir = await mkdtemp(join(tmpdir(), "intake-budget-test-")); const file = join(dir, "budget.json");
  const options = { file, dailyLimit: 2, concurrency: 5 };
  const budget = createAiBudget(options); const results = await Promise.all([budget.acquire(), budget.acquire(), budget.acquire()]);
  assert.equal(results.filter(Boolean).length, 2); results.forEach(release => release?.());
  assert.equal(await createAiBudget(options).acquire(), null);
});
test("AI concurrency slot releases exactly once and daily limit rolls over", async () => {
  const dir = await mkdtemp(join(tmpdir(), "intake-budget-test-")); const file = join(dir, "budget.json");
  let date = new Date("2026-09-07T12:00:00Z");
  const budget = createAiBudget({ file, dailyLimit: 1, concurrency: 1, now: () => date });
  const release = await budget.acquire(); assert.equal(await budget.acquire(), null); release(); release();
  assert.equal(await budget.acquire(), null); date = new Date("2026-09-08T12:00:00Z"); const next = await budget.acquire(); assert.equal(typeof next, "function"); next();
});
test("unreadable budget fails closed rather than resetting spending ceiling", async () => {
  const dir = await mkdtemp(join(tmpdir(), "intake-budget-test-")); const file = join(dir, "budget.json"); await writeFile(file, "corrupt");
  await assert.rejects(createAiBudget({ file }).acquire());
});
