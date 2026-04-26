const localFoods = [
  { id: "local-pizza", name: "Slice of pizza", aliases: ["pizza", "pica"], source: "local", serving: "1 slice", calories: 285, protein: 12, carbs: 36, fat: 10 },
  { id: "local-pita", name: "Pita bread", aliases: ["pita"], source: "local", serving: "1 medium", calories: 165, protein: 5.5, carbs: 33, fat: 1.1 },
  { id: "local-fries", name: "Fries", aliases: ["french fries", "pomfri", "krompirček"], source: "local", serving: "150 g", calories: 365, protein: 4, carbs: 48, fat: 17 },
  { id: "local-chicken", name: "Chicken breast", aliases: ["chicken", "piščanec", "piščančje prsi"], source: "local", serving: "150 g", calories: 250, protein: 47, carbs: 0, fat: 5 },
  { id: "local-rice", name: "Rice", aliases: ["riž"], source: "local", serving: "1 cup", calories: 205, protein: 4, carbs: 45, fat: 0.4 },
  { id: "local-salmon", name: "Salmon", aliases: ["losos"], source: "local", serving: "150 g", calories: 310, protein: 34, carbs: 0, fat: 18 },
  { id: "local-salad", name: "Salad", aliases: ["solata"], source: "local", serving: "1 serving", calories: 90, protein: 3, carbs: 12, fat: 4 },
  { id: "local-banana", name: "Banana", aliases: ["banana"], source: "local", serving: "1 medium", calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { id: "local-eggs", name: "Eggs", aliases: ["egg", "jajca", "jajce"], source: "local", serving: "2 eggs", calories: 156, protein: 12.6, carbs: 1.2, fat: 10.6 },
  { id: "local-oats", name: "Oats", aliases: ["oatmeal", "ovseni kosmiči"], source: "local", serving: "60 g", calories: 228, protein: 8, carbs: 40, fat: 4 },
  { id: "local-yogurt", name: "Greek yogurt", aliases: ["yogurt", "jogurt", "grški jogurt"], source: "local", serving: "200 g", calories: 146, protein: 20, carbs: 7, fat: 4 },
];

const foodCache = new Map();

export async function searchFoods(query, { usdaApiKey = process.env.USDA_API_KEY || "DEMO_KEY" } = {}) {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 2) return [];

  if (foodCache.has(cleanQuery)) return foodCache.get(cleanQuery);

  const localMatches = localFoods.filter((food) => localFoodMatches(food, cleanQuery)).slice(0, 10);
  const [usdaFoods, offFoods] = await Promise.allSettled([
    searchUsda(cleanQuery, usdaApiKey),
    searchOpenFoodFacts(cleanQuery),
  ]);
  const combined = [
    ...localMatches,
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
    dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"].join(","),
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
    source: food.source || "local",
    serving: food.serving || "1 serving",
    calories: round(food.calories),
    protein: roundWhole(food.protein),
    carbs: roundWhole(food.carbs),
    fat: roundWhole(food.fat),
  };
}

function localFoodMatches(food, query) {
  return [food.name, ...(food.aliases || [])].some((value) => value.toLowerCase().includes(query));
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
