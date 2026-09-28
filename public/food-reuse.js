(function attachFoodReuse(root) {
  const diaryIdentityFields = new Set([
    "id",
    "createdAt",
    "created_at",
    "updatedAt",
    "updated_at",
    "loggedAt",
    "logged_at",
    "loggedForDate",
    "logged_for_date",
    "excludedFromStreak",
    "copiedFromDate",
  ]);

  function deepClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function snapshotFoodEntry(entry) {
    const snapshot = {};
    Object.entries(deepClone(entry || {})).forEach(([key, value]) => {
      if (!diaryIdentityFields.has(key)) snapshot[key] = value;
    });
    return snapshot;
  }

  function snapshotFoodEntries(entries) {
    return (Array.isArray(entries) ? entries : []).map(snapshotFoodEntry);
  }

  function timestampForTargetDate(sourceTimestamp, targetDate, fallbackTimestamp) {
    const source = new Date(sourceTimestamp || fallbackTimestamp || Date.now());
    const safeSource = Number.isFinite(source.getTime()) ? source : new Date();
    const [year, month, day] = String(targetDate).split("-").map(Number);
    const target = new Date(
      year,
      month - 1,
      day,
      safeSource.getHours(),
      safeSource.getMinutes(),
      safeSource.getSeconds(),
      safeSource.getMilliseconds(),
    );
    return target.toISOString();
  }

  function cloneFoodEntries(entries, options = {}) {
    const {
      targetDate,
      targetMeal = null,
      sourceDate = "",
      excludedFromStreak = false,
      now = new Date().toISOString(),
      idFactory = () => crypto.randomUUID(),
    } = options;
    if (!targetDate) throw new Error("A target date is required.");

    return (Array.isArray(entries) ? entries : []).map((entry) => {
      // A copied occurrence has not been photographed. Covers stay on Saved
      // definitions; historical photos/captures stay on the source diary.
      const { photoMediaId, coverImageId, captureId, ...definition } = snapshotFoodEntry(entry);
      const loggedAt = timestampForTargetDate(
        entry?.loggedAt || entry?.logged_at || entry?.createdAt || entry?.created_at,
        targetDate,
        now,
      );
      return {
        ...definition,
        ...(targetMeal ? { meal: targetMeal } : {}),
        id: idFactory(),
        loggedAt,
        createdAt: loggedAt,
        loggedForDate: targetDate,
        excludedFromStreak: Boolean(excludedFromStreak),
        ...(sourceDate ? { copiedFromDate: sourceDate } : {}),
      };
    });
  }

  function groupFoodEntriesByMeal(entries) {
    const groups = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const meal = String(entry?.meal || "snack").trim().toLowerCase() || "snack";
      if (!groups.has(meal)) groups.set(meal, []);
      groups.get(meal).push(entry);
    });
    return [...groups.entries()].map(([meal, foods]) => ({
      meal,
      foods,
      calories: foods.reduce((total, food) => total + Number(food?.calories || 0), 0),
    }));
  }

  function createSavedMeal({ id, name, meal, foods, coverImageId, createdAt, updatedAt, idFactory = () => crypto.randomUUID() }) {
    const now = new Date().toISOString();
    return {
      id: id || idFactory(),
      name: String(name || "").trim(),
      meal: String(meal || "snack").trim().toLowerCase() || "snack",
      createdAt: createdAt || now,
      updatedAt: updatedAt || now,
      // A Saved meal is a reusable definition, not a photo of a future meal.
      foods: snapshotFoodEntries(foods).map(({ photoMediaId, coverImageId, captureId, ...food }) => food),
      ...(typeof coverImageId === 'string' && /^photo-[a-zA-Z0-9-]{8,80}$/.test(coverImageId) ? {coverImageId} : {}),
    };
  }

  function compactMealFoodName(food) {
    const preparationPrefix = /^(?:air[- ]fried|barbecued|bbq|baked|boiled|braised|broiled|cooked|deep[- ]fried|fried|grilled|poached|raw|roasted|sauteed|sautéed|seared|smoked|steamed|stir[- ]fried)\s+/i;
    const sourceName = String(food?.displayName || food?.name || "").trim();
    const primaryName = sourceName
      .split(/\s+(?:with|and)\s+|[,;()]/i)[0]
      .replace(preparationPrefix, "")
      .trim();
    const readableName = primaryName || sourceName;
    if (readableName.length <= 30) return readableName.replace(/^./u, (letter) => letter.toUpperCase());
    const shortened = readableName.slice(0, 30).replace(/\s+\S*$/, "").trim();
    return `${shortened || readableName.slice(0, 30).trim()}…`.replace(/^./u, (letter) => letter.toUpperCase());
  }

  function suggestSavedMealName(foods, maxItems = 2) {
    const names = [];
    (Array.isArray(foods) ? foods : []).forEach((food) => {
      const name = compactMealFoodName(food);
      if (name && !names.some((existing) => existing.toLowerCase() === name.toLowerCase())) names.push(name);
    });
    if (!names.length) return "Saved meal";
    const visibleNames = names.slice(0, Math.max(1, maxItems));
    const baseName = visibleNames.join(" & ");
    return names.length > visibleNames.length ? `${baseName} & more` : baseName;
  }

  function savedLibraryHint(mealCount, foodCount, filter = "all") {
    const meals = Math.max(0, Math.floor(Number(mealCount) || 0));
    const foods = Math.max(0, Math.floor(Number(foodCount) || 0));
    if (!meals || filter === "my") return "";
    return `Saved includes ${meals} ${meals === 1 ? "meal" : "meals"} + ${foods} ${foods === 1 ? "food" : "foods"}.`;
  }

  // Undo restores only the removed item, never an old copy of the whole library.
  function restoreRemovedItem(items, item, index, identity = entry => entry.id) {
    if (items.some(entry => identity(entry) === identity(item))) return items;
    const next = [...items];
    next.splice(Math.min(Math.max(0, index), next.length), 0, deepClone(item));
    return next;
  }

  root.IntakeFoodReuse = Object.freeze({
    restoreRemovedItem,
    savedLibraryHint,
    cloneFoodEntries,
    createSavedMeal,
    groupFoodEntriesByMeal,
    snapshotFoodEntry,
    snapshotFoodEntries,
    suggestSavedMealName,
    timestampForTargetDate,
  });
})(globalThis);
