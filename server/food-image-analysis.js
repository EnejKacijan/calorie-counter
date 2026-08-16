import { searchFoods } from "./food-search.js";

const openAiResponsesUrl = "https://api.openai.com/v1/responses";
const maxImageDataUrlLength = 9_000_000;

const foodItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "amount", "unit", "servingGrams", "calories", "protein", "carbs", "fat", "confidence", "notes"],
  properties: {
    name: { type: "string" },
    amount: { type: "number" },
    unit: { type: "string", enum: ["serving", "piece", "g"] },
    servingGrams: { type: "number" },
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string" },
  },
};

const nutritionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["foods", "confidence", "notes"],
  properties: {
    foods: {
      type: "array",
      items: foodItemSchema,
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string" },
  },
};

const parsedFoodDescriptionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["foods", "clarificationQuestion", "clarificationOptions", "confidence", "notes"],
  properties: {
    foods: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name", "searchQuery", "amount", "unit", "servingGrams", "qualifiers",
          "fallbackCalories", "fallbackProtein", "fallbackCarbs", "fallbackFat",
        ],
        properties: {
          name: { type: "string" },
          searchQuery: { type: "string" },
          amount: { type: "number" },
          unit: { type: "string", enum: ["serving", "piece", "g"] },
          servingGrams: { type: "number" },
          qualifiers: { type: "string" },
          fallbackCalories: { type: "number" },
          fallbackProtein: { type: "number" },
          fallbackCarbs: { type: "number" },
          fallbackFat: { type: "number" },
        },
      },
    },
    clarificationQuestion: { type: "string" },
    clarificationOptions: { type: "array", maxItems: 5, items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string" },
  },
};

export async function analyzeFoodImage(imageDataUrl, options = {}) {
  const openAiApiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!openAiApiKey) {
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.status = 503;
    throw error;
  }

  if (!isSupportedImageDataUrl(imageDataUrl)) {
    const error = new Error("Please upload a PNG, JPEG, WEBP, or GIF image.");
    error.status = 400;
    throw error;
  }

  if (imageDataUrl.length > maxImageDataUrlLength) {
    const error = new Error("Image is too large. Try a smaller photo.");
    error.status = 413;
    throw error;
  }

  const response = await fetch(openAiResponsesUrl, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You estimate nutrition from food photos for a calorie tracking app. Return cautious, editable estimates only. Split the plate into visually distinct foods that a person might eat or leave behind. Do not split ingredients inside a mixed dish: pizza is one food, while a tomato or salad beside it is another. Return no more than 8 foods. Nutrition for each item must describe its entire visible portion. Prefer amount 1 and unit serving for plated food; use piece only for a clearly discrete count. Set servingGrams to your cautious estimate of the whole visible portion, or 0 when it cannot be estimated. If the photo does not contain food, return an empty foods array.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Identify each visually distinct food, then estimate calories, protein, carbs, and fat for each entire visible portion. Keep names and notes short. The user will review, remove, or edit individual foods before logging them.",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "food_photo_nutrition",
          strict: true,
          schema: nutritionSchema,
        },
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error?.message || "Food photo analysis failed.");
    error.status = response.status;
    throw error;
  }

  return normalizeAnalysis(parseResponseText(data));
}

export async function analyzeFoodDescription(description, options = {}) {
  const openAiApiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const cleanDescription = String(description || "").trim().slice(0, 500);
  const clarificationAnswer = String(options.clarificationAnswer || "").trim().slice(0, 240);
  const allowClarification = options.allowClarification !== false;

  if (!openAiApiKey) {
    const error = new Error("AI estimation is unavailable. Add the food manually instead.");
    error.status = 503;
    throw error;
  }
  if (cleanDescription.length < 2) {
    const error = new Error("Describe what you ate.");
    error.status = 400;
    throw error;
  }

  const knownClarification = allowClarification && !clarificationAnswer
    ? materialFoodClarification(cleanDescription)
    : null;
  if (knownClarification) {
    return {
      foods: [],
      confidence: "low",
      notes: "A material food detail is needed before nutrition can be resolved.",
      clarification: knownClarification,
    };
  }

  const parsed = await parseFoodDescriptionWithRepair({
    cleanDescription,
    clarificationAnswer,
    allowClarification,
    openAiApiKey,
    model,
  });

  const clarificationQuestion = String(parsed?.clarificationQuestion || "").trim();
  const clarificationOptions = Array.isArray(parsed?.clarificationOptions)
    ? parsed.clarificationOptions.map((option) => String(option || "").trim()).filter(Boolean).slice(0, 5)
    : [];
  if (allowClarification && !clarificationAnswer && clarificationQuestion && clarificationOptions.length >= 2) {
    return {
      foods: [],
      confidence: normalizeConfidence(parsed?.confidence),
      notes: String(parsed?.notes || "").trim(),
      clarification: { question: clarificationQuestion, options: clarificationOptions },
    };
  }

  const rawFoods = Array.isArray(parsed?.foods) ? parsed.foods.slice(0, 8) : [];
  if (!rawFoods.length) throw invalidEstimateError();

  const resolvedFoods = await Promise.all(rawFoods.map((food) => resolveDescribedFood(food, {
    usdaApiKey: options.usdaApiKey,
    searchFoodsFn: options.searchFoodsFn || searchFoods,
  })));
  resolvedFoods.forEach(validateEstimatedFood);

  return {
    foods: resolvedFoods,
    confidence: normalizeConfidence(parsed?.confidence),
    notes: String(parsed?.notes || "").trim(),
    clarification: null,
  };
}

function materialFoodClarification(description) {
  const text = String(description || "").toLocaleLowerCase("sl");
  const mentionsChicken = /\bchicken\b|pi[sš][cč]an|piščan/u.test(text);
  const mentionsBeef = /\bbeef\b|govedin/u.test(text);
  const hasPreparationState = /\braw\b|\bcooked\b|\broasted\b|\bgrilled\b|\bboiled\b|surov|kuhan|pečen|pecen|na žaru/u.test(text);
  const hasMeasuredWeight = /\d+(?:[.,]\d+)?\s*(?:g|gram|kg)\b/u.test(text);

  if (mentionsBeef && hasMeasuredWeight && !hasPreparationState) {
    return {
      question: "What kind of beef was it, and was that weight raw or cooked?",
      options: [
        "Generic beef, cooked",
        "Generic beef, raw",
        "Lean ground beef, cooked",
        "Regular ground beef, cooked",
        "Other / describe",
      ],
    };
  }

  if (!mentionsChicken) return null;

  const hasCut = /\bbreast\b|\bthigh\b|\bwing\b|\bdrumstick\b|prsi|bedr|perut|krača/u.test(text);

  if (!hasCut) {
    return {
      question: "What kind of chicken was it, and was that weight raw or cooked?",
      options: [
        "Chicken breast, raw",
        "Chicken breast, cooked",
        "Chicken thigh, raw",
        "Chicken thigh, cooked",
        "Other / describe",
      ],
    };
  }
  if (hasMeasuredWeight && !hasPreparationState) {
    return {
      question: "Was the chicken weighed raw or cooked?",
      options: ["Raw weight", "Cooked weight", "Other / describe"],
    };
  }
  return null;
}

async function parseFoodDescriptionWithRepair(input) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(openAiResponsesUrl, {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: { Authorization: `Bearer ${input.openAiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          instructions: [
            "Parse a natural-language meal description for a nutrition tracker. You are a food and portion parser, not the primary nutrition database.",
            "Split clearly separate foods into separate items, but keep a mixed dish as one item. Return no more than 8 items.",
            "For each item, create a concise English normalized name and a precise searchQuery suitable for USDA FoodData Central. Include material qualifiers such as cut, raw/cooked state, skin, and preparation when the user supplied them.",
            "The normalized name must describe the interpretation actually used for fallback nutrition. Avoid vague or awkward labels such as 'beef meat'. If you must make a generic assumption, state only the assumption you actually used, for example 'Beef, cooked'; never invent a cut or fat level that is not supported by the description or resolution.",
            "servingGrams is the total described portion in grams, not grams per serving. If grams are explicitly given, use unit g, amount equal to those grams, and servingGrams equal to the same value.",
            "fallback nutrition is for the entire described portion and is used only if no structured source can be resolved.",
            input.allowClarification
              ? "If a missing qualifier could materially change nutrition (for example chicken cut or raw versus cooked weight), return one short clarification question with 2-5 concise options instead of silently choosing. Do not ask about minor details."
              : "Do not request clarification; use the most cautious common interpretation and make it explicit in the normalized name.",
            "Use empty clarificationQuestion and clarificationOptions when no clarification is needed.",
            attempt ? "This is a repair attempt. Ensure every required field is finite, non-negative, and internally consistent." : "",
          ].filter(Boolean).join(" "),
          input: [{
            role: "user",
            content: [{
              type: "input_text",
              text: input.clarificationAnswer
                ? `Description: ${input.cleanDescription}\nClarification: ${input.clarificationAnswer}`
                : input.cleanDescription,
            }],
          }],
          text: {
            format: {
              type: "json_schema",
              name: "parsed_food_description",
              strict: true,
              schema: parsedFoodDescriptionSchema,
            },
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error?.message || "AI food estimate failed.");
        error.status = response.status;
        throw error;
      }
      const parsed = parseResponseText(data);
      validateParsedDescription(parsed);
      return parsed;
    } catch (error) {
      lastError = error;
      if (error?.status && error.status < 500) break;
    }
  }
  const error = invalidEstimateError();
  error.cause = lastError;
  throw error;
}

function validateParsedDescription(parsed) {
  if (!parsed || !Array.isArray(parsed.foods)) throw invalidEstimateError();
  parsed.foods.forEach((food) => {
    const numeric = [
      food.amount, food.servingGrams, food.fallbackCalories,
      food.fallbackProtein, food.fallbackCarbs, food.fallbackFat,
    ].map(Number);
    if (!String(food.name || "").trim() || !String(food.searchQuery || "").trim()) throw invalidEstimateError();
    if (numeric.some((value) => !Number.isFinite(value) || value < 0)) throw invalidEstimateError();
    if (Number(food.amount) <= 0 || Number(food.amount) > 10_000 || Number(food.servingGrams) > 10_000) throw invalidEstimateError();
  });
}

async function resolveDescribedFood(food, options = {}) {
  const portionGrams = describedPortionGrams(food);
  let matches = [];
  try {
    matches = await options.searchFoodsFn(String(food.searchQuery || food.name), { usdaApiKey: options.usdaApiKey });
  } catch {
    matches = [];
  }

  const credibleMatches = matches.filter((candidate) => (
    Number(candidate.servingGrams) > 0
    && isCredibleStructuredMatch(candidate, food.searchQuery)
  ));
  const match = credibleMatches.find((candidate) => candidate.source === "USDA")
    || credibleMatches[0]
    || null;
  const amount = food.unit === "g" ? roundNumber(portionGrams) : roundNumber(food.amount);
  const unit = ["serving", "piece", "g"].includes(food.unit) ? food.unit : "serving";

  if (match) {
    const sourceGrams = Number(match.servingGrams);
    const multiplier = portionGrams > 0
      ? portionGrams / sourceGrams
      : unit === "g" ? amount / sourceGrams : amount;
    return {
      name: String(match.name || food.name).trim(),
      amount,
      unit,
      servingGrams: roundNumber(portionGrams || sourceGrams * multiplier),
      calories: roundNumber(Number(match.calories) * multiplier),
      protein: roundNumber(Number(match.protein) * multiplier),
      carbs: roundNumber(Number(match.carbs) * multiplier),
      fat: roundNumber(Number(match.fat) * multiplier),
      confidence: "high",
      notes: structuredMatchNote(food, match),
      source: "AI ESTIMATE",
      sourceId: String(match.id || ""),
      nutritionSource: String(match.source || ""),
      resolvedFoodName: String(match.name || food.name).trim(),
    };
  }

  return {
    name: String(food.name || "Estimated food").trim(),
    amount,
    unit,
    servingGrams: roundNumber(portionGrams),
    calories: roundNumber(food.fallbackCalories),
    protein: roundNumber(food.fallbackProtein),
    carbs: roundNumber(food.fallbackCarbs),
    fat: roundNumber(food.fallbackFat),
    confidence: "low",
    notes: String(food.qualifiers || "AI estimate; review the portion and nutrition.").trim(),
    source: "AI ESTIMATE",
    sourceId: "",
    nutritionSource: "AI estimate",
    resolvedFoodName: String(food.name || "Estimated food").trim(),
  };
}

function isCredibleStructuredMatch(candidate, query) {
  const ignoredWords = new Set(["and", "with", "the", "a", "an", "of", "style"]);
  const words = String(query || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((word) => word.length > 1 && !ignoredWords.has(word)) || [];
  if (!words.length) return false;
  const candidateText = `${candidate?.name || ""} ${candidate?.brand || ""}`.toLowerCase();
  const hits = words.filter((word) => candidateText.includes(word)).length;
  return hits >= Math.max(1, Math.ceil(words.length * 0.5));
}

function describedPortionGrams(food) {
  const grams = Number(food.servingGrams || 0);
  if (grams > 0) return grams;
  if (food.unit === "g") return Number(food.amount || 0);
  return 0;
}

function structuredMatchNote(food, match) {
  const qualifiers = String(food.qualifiers || "").trim();
  return [
    `Resolved as ${match.name}.`,
    qualifiers,
    "Nutrition calculated from a structured food match.",
  ].filter(Boolean).join(" ");
}

function validateEstimatedFood(food) {
  const amount = Number(food.amount);
  const servingGrams = Number(food.servingGrams);
  const nutrients = [food.calories, food.protein, food.carbs, food.fat].map(Number);
  if (!String(food.name || "").trim() || !Number.isFinite(amount) || amount <= 0) throw invalidEstimateError();
  if (!Number.isFinite(servingGrams) || servingGrams < 0 || servingGrams > 10_000) throw invalidEstimateError();
  if (nutrients.some((value) => !Number.isFinite(value) || value < 0)) throw invalidEstimateError();
  if (Number(food.calories) > 12_000 || nutrients.slice(1).some((value) => value > 2_000)) throw invalidEstimateError();
}

function invalidEstimateError() {
  const error = new Error("We couldn't create a reliable nutrition estimate. Try adding more detail or enter it manually.");
  error.status = 502;
  return error;
}

function roundNumber(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export async function correctFoodImageItem(input = {}, options = {}) {
  const openAiApiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const imageDataUrl = input.imageDataUrl;
  const correction = String(input.correction || "").trim().slice(0, 240);
  const currentFood = input.currentFood && typeof input.currentFood === "object" ? input.currentFood : {};

  if (!openAiApiKey) {
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.status = 503;
    throw error;
  }

  if (!isSupportedImageDataUrl(imageDataUrl)) {
    const error = new Error("The original food photo is no longer available. Scan the plate again.");
    error.status = 400;
    throw error;
  }

  if (imageDataUrl.length > maxImageDataUrlLength) {
    const error = new Error("Image is too large. Try a smaller photo.");
    error.status = 413;
    throw error;
  }

  if (correction.length < 2) {
    const error = new Error("Tell us what the food is instead.");
    error.status = 400;
    throw error;
  }

  const currentDescription = [
    String(currentFood.name || "unknown food").slice(0, 120),
    Number(currentFood.servingGrams || 0) > 0 ? `${Number(currentFood.servingGrams)} g estimated portion` : "one visible portion",
  ].join(", ");

  const response = await fetch(openAiResponsesUrl, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You correct one food item from an earlier plate-photo estimate. Return only the corrected item, never the other foods on the plate. Treat the user's correction as strong evidence about identity, while using the photo to estimate the entire visible portion. Prefer amount 1 and unit serving for plated food; use piece only for a clearly discrete count. Keep the name and notes short. Nutrition must describe the entire corrected visible portion.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Earlier estimate: ${currentDescription}\nUser correction: ${correction}\nCorrect this one item and recalculate its nutrition.`,
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "corrected_food_photo_item",
          strict: true,
          schema: foodItemSchema,
        },
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error?.message || "Food correction failed.");
    error.status = response.status;
    throw error;
  }

  return normalizeFoodItem(parseResponseText(data));
}

function isSupportedImageDataUrl(value) {
  return /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(String(value || ""));
}

function parseResponseText(data) {
  const outputText =
    data.output_text ||
    data.output
      ?.flatMap((item) => item.content || [])
      .find((content) => content.type === "output_text" && typeof content.text === "string")
      ?.text;

  if (!outputText) {
    const error = new Error("OpenAI returned no nutrition estimate.");
    error.status = 502;
    throw error;
  }

  try {
    return JSON.parse(outputText);
  } catch {
    const error = new Error("OpenAI returned an unreadable nutrition estimate.");
    error.status = 502;
    throw error;
  }
}

function normalizeAnalysis(analysis, source = "OpenAI photo estimate") {
  const rawFoods = Array.isArray(analysis?.foods)
    ? analysis.foods
    : analysis?.name
      ? [analysis]
      : [];

  return {
    foods: rawFoods.slice(0, 8).map((food) => normalizeFoodItem(food, source)),
    confidence: normalizeConfidence(analysis?.confidence),
    notes: String(analysis?.notes || "").trim(),
  };
}

function normalizeFoodItem(food, source = "OpenAI photo estimate") {
  const unit = ["serving", "piece", "g"].includes(food?.unit) ? food.unit : "serving";
  const rawAmount = Math.max(0, Number(food?.amount || 1));
  const amount = unit === "g" ? Math.round(rawAmount || 100) : Math.max(0.1, rawAmount || 1);
  const servingGrams = Math.max(0, Math.round(Number(food?.servingGrams || (unit === "g" ? amount : 0))));

  return {
    name: String(food?.name || "Unknown food").trim() || "Unknown food",
    amount,
    unit,
    servingGrams,
    calories: normalizeNutritionNumber(food?.calories),
    protein: normalizeNutritionNumber(food?.protein),
    carbs: normalizeNutritionNumber(food?.carbs),
    fat: normalizeNutritionNumber(food?.fat),
    confidence: normalizeConfidence(food?.confidence),
    notes: String(food?.notes || "").trim(),
    source,
  };
}

function normalizeNutritionNumber(value) {
  return Math.max(0, Math.round(Number(value || 0) * 10) / 10);
}

function normalizeConfidence(value) {
  return ["low", "medium", "high"].includes(value) ? value : "low";
}
