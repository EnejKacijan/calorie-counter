const PREFIXES = ["calorie-counter-", "daily-fuel-"];
const JOURNAL = "intake-restore-journal-v1";
const CONFLICT_PROTECTED = new Set([
  "calorie-counter-state",
  "calorie-counter-food-library",
  "calorie-counter-saved-foods",
  "calorie-counter-saved-meals",
  "calorie-counter-assistant-conversations-v1",
]);
const owned = key => PREFIXES.some(prefix => key.startsWith(prefix));
const structured = key => /(?:-state|-food-library|-saved-foods|-saved-meals|-conversations-v1|-conversation-v1)$/.test(key);
function validateValue(key, value) {
  if (!owned(key) || typeof value !== "string") throw Error("Unknown or invalid backup entry.");
  if (!structured(key)) return;
  const data = JSON.parse(value, (name, item) => {
    if (["__proto__", "constructor", "prototype"].includes(name)) throw Error("Unsafe backup data.");
    return item;
  });
  if (key.endsWith("-state")) {
    if (!data || Array.isArray(data) || typeof data !== "object" || !data.days || typeof data.days !== "object" || Array.isArray(data.days)
      || !Array.isArray(data.progress) || !data.goals || typeof data.goals !== "object") throw Error("Invalid diary structure.");
    for (const day of Object.values(data.days)) {
      if (!day || typeof day !== "object" || (day.foods && !Array.isArray(day.foods)) || (day.exercises && !Array.isArray(day.exercises))) throw Error("Invalid day in backup.");
    }
  } else if (!Array.isArray(data)) throw Error("Invalid library in backup.");
}
export function parseBackup(text) {
  if (typeof text !== "string" || text.length > 12_000_000) throw Error("Backup is too large (maximum 12 MB).");
  const backup = JSON.parse(text, (key, value) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw Error("Unsafe backup data.");
    return value;
  });
  if (backup?.format !== "intake-backup" || backup.version !== 1 || !backup.data || Array.isArray(backup.data) || typeof backup.data !== "object") throw Error("Not a supported Intake backup.");
  for (const [key, value] of Object.entries(backup.data)) validateValue(key, value);
  if (!backup.data["calorie-counter-state"]) throw Error("Backup does not contain a diary.");
  const state = JSON.parse(backup.data["calorie-counter-state"]);
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const nonnegative = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (state.user !== null && !record(state.user)) throw Error("Invalid profile in backup.");
  if (!["calories", "protein", "carbs", "fat"].every(name => nonnegative(state.goals[name]))) throw Error("Invalid nutrition targets in backup.");
  for (const entry of state.progress) if (!record(entry) || typeof entry.date !== "string" || !nonnegative(entry.weightKg)) throw Error("Invalid weight history in backup.");
  for (const [date, day] of Object.entries(state.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("Invalid diary date in backup.");
    for (const food of day.foods || []) if (!record(food) || typeof food.name !== "string" || !["calories", "protein", "carbs", "fat"].every(name => nonnegative(food[name]))) throw Error("Invalid food entry in backup.");
    for (const exercise of day.exercises || []) if (!record(exercise) || !nonnegative(exercise.calories)) throw Error("Invalid exercise entry in backup.");
  }
  for (const [key, value] of Object.entries(backup.data)) {
    if (structured(key) && !key.endsWith("-state") && JSON.parse(value).some(item => !record(item))) throw Error("Invalid library entry in backup.");
  }
  // A backup is not permission to share data on this device.
  delete backup.data["calorie-counter-ai-consent-v1"];
  return backup.data;
}
export function createSafeStorage(native, notify = () => {}) {
  const pending = new Map();
  const lastRead = new Map();
  const blocked = new Set();
  let locked = false;
  let problem = "";
  function fail(message) { problem = message; notify(message); }
  function hasConflict(key) {
    if (!CONFLICT_PROTECTED.has(key) || !lastRead.has(key) || native.getItem(key) === lastRead.get(key)) return false;
    locked = true;
    fail("Your data changed in another window. Your edits are temporary. Export a recovery copy, then reload to see the other window's saved data.");
    return true;
  }
  function snapshot() {
    const data = Object.create(null);
    for (let i = 0; i < native.length; i++) { const key = native.key(i); if (owned(key)) data[key] = native.getItem(key); }
    return data;
  }
  function replace(data) {
    for (const key of Object.keys(snapshot())) if (!(key in data)) native.removeItem(key);
    for (const [key, value] of Object.entries(data)) native.setItem(key, value);
  }
  try {
    const journal = native.getItem(JOURNAL);
    if (journal) { const data = JSON.parse(journal); if (!data || typeof data !== "object" || Array.isArray(data)) throw Error(); for (const [k,v] of Object.entries(data)) if (!owned(k) || typeof v !== "string") throw Error(); replace(data); native.removeItem(JOURNAL); }
    for (const [key, value] of Object.entries(snapshot())) {
      try { validateValue(key, value); } catch { blocked.add(key); }
    }
    if (blocked.size) fail("Some stored data is damaged. It has not been overwritten. Export a recovery copy before restoring a backup.");
  } catch { locked = true; fail("Device storage is unavailable or a restore needs recovery. Export your data before closing this app."); }
  return {
    get status() { return problem; },
    get pendingCount() { return pending.size; },
    getItem(key) { if (pending.has(key)) return pending.get(key); try { const value = native.getItem(key); lastRead.set(key, value); return value; } catch { fail("Device storage is unavailable. Changes are temporary; export before closing."); return lastRead.get(key) ?? null; } },
    setItem(key, value) {
      value = String(value);
      if (blocked.has(key)) { fail("Damaged data was protected from overwrite. Export a recovery copy or restore a valid backup in Profile."); return; }
      pending.set(key, value);
      if (locked) { fail("Storage is protected during recovery. New changes are temporary; export before closing, then reload or restore a backup."); return; }
      try {
        if (hasConflict(key)) return;
        native.setItem(key, value); lastRead.set(key, value); pending.delete(key);
      } catch { fail("Changes are only in memory, not saved on this device. Export before closing or retry saving in Profile."); }
    },
    // Explicit edits such as Rename must either persist or remain uncommitted.
    // Ordinary write failures do not enqueue a cancelled mutation. Conflicts
    // retain recovery data, but lock retry so it cannot overwrite another window.
    setItemConfirmed(key, value) {
      if (blocked.has(key) || locked) throw Error("Stored data is protected.");
      value = String(value);
      validateValue(key, value);
      if (hasConflict(key)) {
        pending.set(key, value);
        throw Error("Another window changed the stored data.");
      }
      native.setItem(key, value);
      lastRead.set(key, value);
      pending.delete(key);
    },
    removeItem(key) { if (blocked.has(key) || locked) { fail("Stored data is protected. Export a recovery copy or restore a backup before making further changes."); return; } pending.set(key, null); try { if (hasConflict(key)) return; native.removeItem(key); lastRead.set(key, null); pending.delete(key); } catch { fail("Could not save this change. Retry in Profile before closing."); } },
    export() {
      let data; try { data = snapshot(); } catch { data = Object.fromEntries([...lastRead].filter(([, value]) => value !== null)); }
      for (const [key, value] of pending) { if (value === null) delete data[key]; else data[key] = value; }
      return JSON.stringify({ format: "intake-backup", version: 1, createdAt: new Date().toISOString(), data }, null, 2);
    },
    retry() {
      if (locked) throw Error("Export your recovery copy, then reload or restore a backup.");
      // Preflight every pending key before writing any of them.
      for (const key of pending.keys()) if (hasConflict(key)) throw Error("Another window changed the stored data.");
      for (const [key, value] of pending) { if (value === null) native.removeItem(key); else native.setItem(key, value); lastRead.set(key, value); pending.delete(key); }
      if (!blocked.size) { problem = ""; notify(""); }
    },
    restore(text) {
      const data = parseBackup(text);
      const previous = snapshot();
      // Journal is written before any changes. An interrupted import rolls back on startup.
      native.setItem(JOURNAL, JSON.stringify(previous));
      try { replace(data); native.removeItem(JOURNAL); }
      catch (error) { try { replace(previous); native.removeItem(JOURNAL); } catch { locked = true; fail("Restore could not finish. Keep this app open and export your data. Recovery will retry on next launch."); } throw error; }
      pending.clear(); lastRead.clear(); blocked.clear(); locked = false; problem = ""; notify("");
    },
    erase() {
      for (const key of Object.keys(snapshot())) native.removeItem(key);
      native.removeItem(JOURNAL); pending.clear(); lastRead.clear(); blocked.clear(); locked = false; problem = "";
    },
  };
}
