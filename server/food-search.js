const foodCache = new Map();

export async function lookupFoodBarcode(barcode) {
  const cleanBarcode = String(barcode || "").replace(/\D/g, "");
  if (!/^\d{8,14}$/.test(cleanBarcode)) throw new Error("Enter a valid 8–14 digit barcode.");

  const data = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json?fields=code,product_name,brands,nutriments,serving_size`);
  if (data.status !== 1 || !data.product) return null;

  const product = data.product;
  const serving = openFoodFactsServing(product);
  const nutrientValue = (name) => openFoodFactsNutrient(product, name, serving);
  return normalizeFood({
    id: `off-${product.code || cleanBarcode}`,
    name: product.product_name || `Product ${cleanBarcode}`,
    brand: product.brands || "",
    source: "Open Food Facts",
    serving: serving.label,
    servingGrams: serving.grams,
    calories: nutrientValue("energy-kcal"),
    protein: nutrientValue("proteins"),
    carbs: nutrientValue("carbohydrates"),
    fat: nutrientValue("fat"),
  });
}

export async function searchFoods(query, { usdaApiKey = process.env.USDA_API_KEY || "DEMO_KEY" } = {}) {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 2) return [];

  if (foodCache.has(cleanQuery)) return foodCache.get(cleanQuery);

  const [usdaFoods, offFoods] = await Promise.allSettled([
    searchUsda(cleanQuery, usdaApiKey),
    searchOpenFoodFacts(cleanQuery),
  ]);
  if (usdaFoods.status === "rejected" && offFoods.status === "rejected") {
    throw new Error("Food sources are temporarily unavailable.");
  }
  const combined = [
    ...(usdaFoods.status === "fulfilled" ? usdaFoods.value : []),
    ...(offFoods.status === "fulfilled" ? offFoods.value : []),
  ];

  const unique = dedupeFoods(combined).slice(0, 30);
  foodCache.set(cleanQuery, unique);
  setTimeout(() => foodCache.delete(cleanQuery), 10 * 60 * 1000).unref?.();
  return unique;
}

async function searchUsda(query, usdaApiKey) {
  const params = new URLSearchParams({
    api_key: usdaApiKey,
    query,
    pageSize: "20",
  });
  const data = await fetchJson(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`);

  return (data.foods || []).map((food, index) => {
    const nutrients = nutrientMap(food.foodNutrients || []);
    const serving = usdaGramServing(food);
    const multiplier = serving.grams / 100;
    return {
      index,
      score: usdaRelevanceScore(food, query),
      food: normalizeFood({
        id: `usda-${food.fdcId}`,
        name: titleCase(food.description || food.brandName || query),
        brand: food.brandName || "",
        source: "USDA",
        serving: serving.label,
        servingGrams: serving.grams,
        calories: nutrients.calories * multiplier,
        protein: nutrients.protein * multiplier,
        carbs: nutrients.carbs * multiplier,
        fat: nutrients.fat * multiplier,
      }),
    };
  }).sort((a, b) => b.score - a.score || a.index - b.index).map((result) => result.food);
}

function usdaRelevanceScore(food, query) {
  const name = String(food.description || "").trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);
  const dataType = String(food.dataType || "").toLowerCase();
  let score = 0;

  if (name === query) score += 120;
  else if (name.startsWith(`${query},`) || name.startsWith(`${query} `)) score += 80;
  else if (name.includes(query)) score += 45;
  score += words.filter((word) => name.includes(word)).length * 12;

  if (/foundation|sr legacy|survey/.test(dataType)) score += 30;
  if (dataType.includes("branded")) score -= 18;
  if (food.brandName) score -= 8;
  score -= Math.min(name.length, 100) * 0.12;
  return score;
}

async function searchOpenFoodFacts(query) {
  const params = new URLSearchParams({
    search_terms: query,
    page_size: "20",
    fields: "code,product_name,brands,nutriments,serving_size",
  });
  const data = await fetchJson(`https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&${params}`, {
    headers: { "User-Agent": "CalorieCounter/0.1 (local-dev@example.com)" },
  });

  return (data.products || []).map((product) => {
    const serving = openFoodFactsServing(product);
    const nutrientValue = (name) => openFoodFactsNutrient(product, name, serving);
    return normalizeFood({
      id: `off-${product.code}`,
      name: product.product_name || query,
      brand: product.brands || "",
      source: "Open Food Facts",
      serving: serving.label,
      servingGrams: serving.grams,
      calories: nutrientValue("energy-kcal"),
      protein: nutrientValue("proteins"),
      carbs: nutrientValue("carbohydrates"),
      fat: nutrientValue("fat"),
    });
  });
}

function openFoodFactsNutrient(product, name, serving) {
  const nutriments = product?.nutriments || {};
  if (!serving.useServingNutrition) return nutriments[`${name}_100g`];

  const perServing = Number(nutriments[`${name}_serving`]);
  if (Number.isFinite(perServing)) return perServing;

  const per100g = Number(nutriments[`${name}_100g`]);
  if (Number.isFinite(per100g) && Number.isFinite(serving.grams)) {
    return per100g * serving.grams / 100;
  }
  return 0;
}

function usdaGramServing(food) {
  const amount = Number(food?.servingSize || 0);
  const unit = String(food?.servingSizeUnit || "").trim().toLowerCase();
  const isGrams = ["g", "gr", "grm", "gram", "grams"].includes(unit);
  if (!Number.isFinite(amount) || amount <= 0 || !isGrams) return { label: "100 g", grams: 100 };
  return { label: `${round(amount)} g`, grams: round(amount) };
}

function openFoodFactsServing(product) {
  const label = String(product?.serving_size || "").trim();
  const calories = Number(product?.nutriments?.["energy-kcal_serving"]);
  const useServingNutrition = Boolean(label) && Number.isFinite(calories) && calories > 0;
  if (!useServingNutrition) return { label: "100 g", grams: 100, useServingNutrition: false };

  const gramsMatch = label.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grm|gram|grams)\b/);
  return {
    label,
    grams: gramsMatch ? Number(gramsMatch[1]) : null,
    useServingNutrition: true,
  };
}

function nutrientMap(nutrients) {
  const get = (names, unit = null) => {
    const match = nutrients.find((nutrient) => {
      const nutrientName = nutrient.nutrientName?.toLowerCase() || "";
      const unitName = nutrient.unitName?.toLowerCase() || "";
      const nameMatches = names.some((name) => nutrientName.includes(name));
      const unitMatches = !unit || unitName === unit;
      return nameMatches && unitMatches;
    });
    return Number(match?.value || 0);
  };

  return {
    calories: get(["energy"], "kcal"),
    protein: get(["protein"]),
    carbs: get(["carbohydrate"]),
    fat: get(["total lipid", "total fat"]),
  };
}

function normalizeFood(food) {
  return {
    id: food.id,
    name: titleCase(food.name || "Unknown food"),
    brand: food.brand || "",
    source: food.source || "USDA",
    serving: food.serving || "1 serving",
    servingGrams: Number(food.servingGrams || 0) || null,
    calories: round(food.calories),
    protein: roundWhole(food.protein),
    carbs: roundWhole(food.carbs),
    fat: roundWhole(food.fat),
  };
}

function dedupeFoods(foods) {
  const seen = new Set();
  return foods.filter((food) => {
    const sourceId = String(food.id || "").trim().toLowerCase();
    const key = sourceId || `${food.source}-${food.name}-${food.brand}-${food.serving}`.toLowerCase();
    if (seen.has(key) || !food.name || !Number.isFinite(food.calories)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Request failed ${response.status}: ${url}`);
  return response.json();
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function round(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function roundWhole(value) {
  return Math.round(Number(value || 0));
}
