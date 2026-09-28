import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
// Single-server durable ceiling. Reserve before provider calls; failures also count.
// Multiple instances must use a shared transactional limiter before public release.
export function createAiBudget({ file, dailyLimit = 200, concurrency = 4, now = () => new Date() }) {
  let queue = Promise.resolve();
  let active = 0;
  return {
    async acquire() {
      const result = queue.then(async () => {
        if (active >= concurrency) return null;
        const date = now().toISOString().slice(0, 10);
        let budget = { date, count: 0 };
        try {
          const stored = JSON.parse(await readFile(file, "utf8"));
          if (typeof stored.date !== "string" || !Number.isSafeInteger(stored.count) || stored.count < 0) throw Error("Invalid budget state");
          if (stored.date === date) budget = stored;
        } catch (error) { if (error.code !== "ENOENT") throw error; }
        if (budget.count >= dailyLimit) return null;
        budget.count++;
        await mkdir(dirname(file), { recursive: true });
        await writeFile(`${file}.tmp`, JSON.stringify(budget), { mode: 0o600 });
        await rename(`${file}.tmp`, file);
        active++;
        let released = false;
        return () => { if (!released) { released = true; active--; } };
      });
      queue = result.catch(() => {});
      return result;
    },
  };
}
