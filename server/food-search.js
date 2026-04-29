const foodCache = new Map();

export async function searchFoods(query, { usdaApiKey = process.env.USDA_API_KEY || "DEMO_KEY" } = {}) {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 2) return [];

  if (foodCache.has(cleanQuery)) return foodCache.get(cleanQuery);

  const [usdaFoods, offFoods] = await Promise.allSettled([
    searchUsda(cleanQuery, usdaApiKey),
    searchOpenFoodFacts(cleanQuery),
  ]);
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

  return (data.foods || []).map((food) => {
    const nutrients = nutrientMap(food.foodNutrients || []);
    return normalizeFood({
      id: `usda-${food.fdcId}`,
      name: titleCase(food.description || food.brandName || query),
      brand: food.brandName || "",
      source: "USDA",
      serving: food.servingSize && food.servingSizeUnit ? `${food.servingSize} ${food.servingSizeUnit}` : "100 g",
      calories: nutrients.calories,
      protein: nutrients.protein,
      carbs: nutrients.carbs,
      fat: nutrients.fat,
    });
  });
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

  return (data.products || []).map((product) =>
    normalizeFood({
      id: `off-${product.code}`,
      name: product.product_name || query,
      brand: product.brands || "",
      source: "Open Food Facts",
      serving: product.serving_size || "100 g",
      calories: product.nutriments?.["energy-kcal_serving"] || product.nutriments?.["energy-kcal_100g"],
      protein: product.nutriments?.proteins_serving || product.nutriments?.proteins_100g,
      carbs: product.nutriments?.carbohydrates_serving || product.nutriments?.carbohydrates_100g,
      fat: product.nutriments?.fat_serving || product.nutriments?.fat_100g,
    }),
  );
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
    calories: round(food.calories),
    protein: roundWhole(food.protein),
    carbs: roundWhole(food.carbs),
    fat: roundWhole(food.fat),
  };
}

function dedupeFoods(foods) {
  const seen = new Set();
  return foods.filter((food) => {
    const key = `${food.name}-${food.brand}-${food.serving}`.toLowerCase();
    if (seen.has(key) || !food.name || !Number.isFinite(food.calories)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
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
