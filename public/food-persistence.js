(function attachFoodPersistence(root) {
  const MAX_RECENT_FOODS = 100;

  function text(value) {
    return String(value || "").trim().toLowerCase();
  }

  function legacyFingerprint(food) {
    const value = [
      estimateKind(food) ? `estimate:${estimateKind(food)}` : food?.originalSource || food?.source,
      food?.name,
      food?.resolvedFoodName,
      food?.brand,
      food?.serving,
      food?.amount,
      food?.unit,
      food?.servingGrams,
      food?.calories,
      food?.protein,
      food?.carbs,
      food?.fat,
      food?.nutritionSource,
      food?.nutritionOverridden,
      JSON.stringify(food?.manualNutritionOverride || null),
    ].map(text).join("|");
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `legacy-${(hash >>> 0).toString(36)}`;
  }

  function estimateKind(food) {
    const inputMode = text(food?.aiEstimate?.inputMode);
    if (inputMode === "photo" || inputMode === "text") return inputMode;
    const source = text([food?.originalSource, food?.source, food?.nutritionSource].filter(Boolean).join(" "));
    if (/photo|image|vision/.test(source)) return "photo";
    if (/ai|estimate|openai/.test(source)) return "text";
    return "";
  }

  function reusableEstimateId(food) {
    const kind = estimateKind(food);
    return kind ? `estimate-${kind}-${legacyFingerprint(food).replace(/^legacy-/, "")}` : "";
  }

  function catalogIdentity(food) {
    const sourceId = String(food?.sourceId || food?.catalogId || "").trim();
    if (sourceId) return sourceId;
    const id = String(food?.id || "").trim();
    return /^(?:usda|off)-/i.test(id) ? id : "";
  }

  function sourceNamespace(food) {
    const source = text([food?.originalSource, food?.source, food?.nutritionSource].filter(Boolean).join(" "));
    if (source.includes("usda")) return "usda";
    if (source.includes("open food facts") || source === "off") return "off";
    return source || "source";
  }

  function ensureStableFoodIdentity(food, options = {}) {
    if (!food || typeof food !== "object") return food;
    if (catalogIdentity(food) || food.reusableFoodId) return { ...food };

    const estimateId = reusableEstimateId(food);
    if (estimateId) {
      return {
        ...food,
        reusableFoodId: estimateId,
      };
    }
    if (food.localFoodId) return { ...food };

    const existingId = String(food.id || "").trim();
    const generatedId = typeof options.idFactory === "function"
      ? options.idFactory()
      : legacyFingerprint(food);
    return {
      ...food,
      localFoodId: existingId || String(generatedId),
    };
  }

  function foodIdentityKey(food) {
    const catalogId = catalogIdentity(food);
    if (catalogId) {
      const normalizedCatalogId = text(catalogId);
      const namespace = normalizedCatalogId.startsWith("usda-")
        ? "usda"
        : normalizedCatalogId.startsWith("off-")
          ? "off"
          : sourceNamespace(food);
      return `catalog:${namespace}:${normalizedCatalogId}`;
    }
    const reusableFoodId = String(food?.reusableFoodId || "").trim();
    if (reusableFoodId) return `reusable:${text(reusableFoodId)}`;
    const localFoodId = String(food?.localFoodId || "").trim();
    if (localFoodId) return `local:${text(localFoodId)}`;
    return `local:${legacyFingerprint(food)}`;
  }

  function uniqueRecentFoods(foods) {
    const records = new Map();
    (Array.isArray(foods) ? foods : []).forEach((candidate) => {
      const food = ensureStableFoodIdentity(candidate);
      const key = foodIdentityKey(food);
      const existing = records.get(key);
      if (!existing || String(food.lastUsedAt || "").localeCompare(String(existing.lastUsedAt || "")) >= 0) {
        records.set(key, {
          ...existing,
          ...food,
          useCount: existing
            ? Math.max(1, Number(existing.useCount || 0)) + Math.max(1, Number(food.useCount || 0))
            : Math.max(1, Number(food.useCount || 0)),
        });
      }
    });
    return [...records.values()].sort((left, right) =>
      String(right.lastUsedAt || "").localeCompare(String(left.lastUsedAt || ""))
    );
  }

  function uniqueSavedFoods(foods) {
    const records = new Map();
    (Array.isArray(foods) ? foods : []).forEach((candidate) => {
      const food = ensureStableFoodIdentity(candidate);
      const key = foodIdentityKey(food);
      const existing = records.get(key);
      if (!existing || String(food.savedAt || "").localeCompare(String(existing.savedAt || "")) >= 0) {
        records.set(key, food);
      }
    });
    return [...records.values()].sort((left, right) =>
      String(right.savedAt || "").localeCompare(String(left.savedAt || ""))
    );
  }

  function updateRecentFoods(currentFoods, usedFoods, options = {}) {
    const maximum = Number(options.maximum || MAX_RECENT_FOODS);
    const timestamp = options.now || new Date().toISOString();
    const records = new Map(uniqueRecentFoods(currentFoods).map((food) => [foodIdentityKey(food), food]));

    (Array.isArray(usedFoods) ? usedFoods : []).forEach((candidate) => {
      const food = ensureStableFoodIdentity(candidate, { idFactory: options.idFactory });
      const key = foodIdentityKey(food);
      const existing = records.get(key);
      records.set(key, {
        ...existing,
        ...food,
        lastUsedAt: timestamp,
        useCount: Number(existing?.useCount || 0) + 1,
      });
    });

    return uniqueRecentFoods([...records.values()]).slice(0, maximum);
  }

  function prepareSavedMeals(meals) {
    return (Array.isArray(meals) ? meals : []).map((meal) => ({
      ...meal,
      foods: (Array.isArray(meal?.foods) ? meal.foods : []).map((food) => ensureStableFoodIdentity(food)),
    }));
  }

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function timestampForNewDiaryEntry(targetDate, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
    const safeNow = Number.isFinite(now.getTime()) ? now : new Date();
    const dateKey = String(targetDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey === localDateKey(safeNow)) {
      return safeNow.toISOString();
    }

    const [year, month, day] = dateKey.split("-").map(Number);
    const isPast = dateKey < localDateKey(safeNow);
    return new Date(year, month - 1, day, isPast ? 23 : 0, isPast ? 59 : 0, 0, 0).toISOString();
  }

  root.IntakeFoodPersistence = Object.freeze({
    MAX_RECENT_FOODS,
    ensureStableFoodIdentity,
    reusableEstimateId,
    foodIdentityKey,
    uniqueRecentFoods,
    uniqueSavedFoods,
    updateRecentFoods,
    prepareSavedMeals,
    timestampForNewDiaryEntry,
  });
})(globalThis);
