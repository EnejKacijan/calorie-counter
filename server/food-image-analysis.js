import { searchFoods } from "./food-search.js";

const openAiResponsesUrl = "https://api.openai.com/v1/responses";
const maxImageDataUrlLength = 9_000_000;
const minImageDataUrlLength = 500;

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
  required: ["containsFood", "foods", "confidence", "notes"],
  properties: {
    containsFood: { type: "boolean" },
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
  required: ["foods", "confidence", "notes"],
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
          unit: { type: "string", enum: ["serving", "piece", "g", "ml"] },
          servingGrams: { type: "number" },
          qualifiers: { type: "string" },
          fallbackCalories: { type: "number" },
          fallbackProtein: { type: "number" },
          fallbackCarbs: { type: "number" },
          fallbackFat: { type: "number" },
        },
      },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string" },
  },
};

const descriptionUnits = new Set(["serving", "piece", "g", "ml"]);
const identityStopWords = new Set([
  "a", "an", "and", "about", "approximately", "around", "food", "foods", "of", "portion",
  "generic", "product", "serving", "servings", "some", "style", "the", "with",
]);
const measurementWords = new Set([
  "g", "gram", "grams", "kg", "kilogram", "kilograms", "ml", "milliliter", "milliliters",
  "millilitre", "millilitres", "l", "liter", "liters", "litre", "litres",
]);
const qualifierGroups = {
  state: new Set(["raw", "uncooked", "cooked"]),
  method: new Set([
    "baked", "barbecued", "bbq", "boiled", "braised", "broiled", "deepfried", "fried", "grilled",
    "poached", "roasted", "sauteed", "steamed", "stewed",
  ]),
  coating: new Set(["battered", "breaded", "coated"]),
  processing: new Set(["candied", "corned", "cured", "dried", "jerky", "pickled", "smoked"]),
  cut: new Set([
    "breast", "brisket", "chop", "chuck", "drumstick", "fillet", "ground", "leg", "liver", "loin",
    "minced", "rib", "ribs", "sirloin", "steak", "tenderloin", "thigh", "wing",
  ]),
  skin: new Set(["skin", "skinless"]),
  diet: new Set(["diet", "light", "regular", "sugarfree", "sweetened", "unsweetened", "zero"]),
  alcohol: new Set(["alcoholic"]),
  composition: new Set(["fatcomponent", "lean"]),
};
const materialQualifierWords = new Set(Object.values(qualifierGroups).flatMap((group) => [...group]));
const additiveCookingMethods = new Set(["battered", "breaded", "coated", "deepfried", "fried"]);

export async function analyzeFoodImage(imageDataUrl, options = {}) {
  const openAiApiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const fetchFn = options.fetchFn || fetch;

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

  if (imageDataUrl.length < minImageDataUrlLength) {
    const error = new Error("The photo is too small or unreadable. Try another image.");
    error.status = 400;
    throw error;
  }

  if (imageDataUrl.length > maxImageDataUrlLength) {
    const error = new Error("Image is too large. Try a smaller photo.");
    error.status = 413;
    throw error;
  }

  const response = await fetchFn(openAiResponsesUrl, {
    method: "POST",
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You estimate nutrition from food photos for a calorie tracking app. First decide whether clearly visible edible food or drink is present. Blank, unreadable, non-food, packaging-only, and unrelated images must set containsFood false and return an empty foods array. Never infer a meal that is not visibly present. When food is clearly visible, set containsFood true and return cautious, editable estimates only. Split the plate into visually distinct foods that a person might eat or leave behind. Keep a composed dish together while treating a separate side as another food. Return no more than 8 foods. Nutrition for each item must describe its entire visible portion. Prefer amount 1 and unit serving for plated food; use piece only for a clearly discrete count. Set servingGrams to your cautious estimate of the whole visible portion, or 0 when it cannot be estimated.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "If and only if edible food or drink is clearly visible, identify each visually distinct food, then estimate calories, protein, carbs, and fat for each entire visible portion. Keep names and notes short. The user will review, remove, or edit individual foods before logging them.",
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
  const emitDiagnostic = typeof options.onDiagnostic === "function" ? options.onDiagnostic : () => {};

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

  const portionHints = extractPortionHints(cleanDescription);
  emitDiagnostic("description_parsed_locally", {
    description: cleanDescription,
    portionHints,
    descriptionQualifiers: [...qualifiersForText(cleanDescription).all],
  });

  let parsed;
  try {
    parsed = await parseFoodDescriptionWithRepair({
      cleanDescription,
      openAiApiKey,
      model,
      fetchFn: options.fetchFn || fetch,
      portionHints,
      emitDiagnostic,
    });
  } catch (error) {
    emitDiagnostic("parser_failed", diagnosticError(error));
    throw error;
  }

  parsed = reconcileParsedDescription(parsed, cleanDescription, portionHints);
  emitDiagnostic("ai_description_parsed", {
    foods: parsed.foods.map(parsedFoodDiagnostic),
    confidence: parsed.confidence,
  });

  const rawFoods = Array.isArray(parsed?.foods) ? parsed.foods.slice(0, 8) : [];
  if (!rawFoods.length) throw invalidEstimateError();

  const resolvedFoods = await Promise.all(rawFoods.map((food, index) => resolveDescribedFood(food, {
    usdaApiKey: options.usdaApiKey,
    searchFoodsFn: options.searchFoodsFn || searchFoods,
    emitDiagnostic,
    itemIndex: index,
  })));
  resolvedFoods.forEach(validateEstimatedFood);

  const analysis = {
    foods: resolvedFoods,
    confidence: normalizeConfidence(parsed?.confidence),
    notes: String(parsed?.notes || "").trim(),
  };
  emitDiagnostic("estimate_complete", {
    foods: analysis.foods.map((food) => ({
      name: food.name,
      amount: food.amount,
      unit: food.unit,
      servingGrams: food.servingGrams,
      nutritionSource: food.nutritionSource,
    })),
  });
  return analysis;
}

async function parseFoodDescriptionWithRepair(input) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      input.emitDiagnostic("parser_attempt", { attempt: attempt + 1 });
      const response = await input.fetchFn(openAiResponsesUrl, {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: { Authorization: `Bearer ${input.openAiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          instructions: [
            "Parse a natural-language meal description for a nutrition tracker. You are a food and portion parser, not the primary nutrition database.",
            "Split clearly separate foods into separate items, but keep a mixed dish as one item. Return no more than 8 items.",
            "For each item, create a concise English normalized name and a precise searchQuery suitable for USDA FoodData Central. Include material qualifiers such as cut, raw/cooked state, skin, and preparation when the user supplied them.",
            "The normalized name must describe the interpretation actually used for fallback nutrition. Avoid vague names that merely repeat a category word. If you make a generic preparation assumption, state only the assumption actually used; never invent a cut, product type, or fat level that is not supported by the description or resolution.",
            "Preserve explicit quantities exactly. Accept compact or spaced metric forms such as 200g, 200 g, 0.2 kg, and 250 ml. Convert kilograms to grams. For liquids use unit ml and set servingGrams to the best density-aware mass estimate for the full described volume.",
            "servingGrams is the total described portion in grams, not grams per serving. If grams are explicitly given, use unit g, amount equal to those grams, and servingGrams equal to the same value.",
            "Portion details are optional. When the user gives no amount, infer one cautious common portion, set servingGrams to that estimated portion, and keep the result editable.",
            "fallback nutrition is for the entire described portion and is used only if no structured source can be resolved.",
            "Do not request follow-up clarification. For an ambiguous food, use a cautious common interpretation and make the assumption explicit in the normalized name or notes.",
            "If the description is not food or drink, return an empty foods array. Never invent a food merely to satisfy the schema.",
            input.portionHints.length ? `Deterministic quantity parser found these hints; preserve them: ${JSON.stringify(input.portionHints)}.` : "",
            attempt ? "This is a repair attempt. Ensure every required field is finite, non-negative, and internally consistent." : "",
          ].filter(Boolean).join(" "),
          input: [{
            role: "user",
            content: [{
              type: "input_text",
              text: input.cleanDescription,
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
      input.emitDiagnostic("parser_attempt_failed", { attempt: attempt + 1, ...diagnosticError(error) });
      if (error?.status && error.status < 500) break;
    }
  }
  const localFallback = parseDescriptionLocally(input.cleanDescription, input.portionHints);
  if (localFallback.foods.length) {
    input.emitDiagnostic("parser_local_fallback", {
      reason: diagnosticError(lastError),
      foods: localFallback.foods.map(parsedFoodDiagnostic),
    });
    return localFallback;
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
    if (!descriptionUnits.has(food.unit)) throw invalidEstimateError();
  });
}

async function resolveDescribedFood(food, options = {}) {
  const portionGrams = describedPortionGrams(food);
  const resolverQuery = resolverQueryForFood(food);
  let matches = [];
  try {
    matches = await options.searchFoodsFn(resolverQuery, { usdaApiKey: options.usdaApiKey });
    options.emitDiagnostic("structured_candidates", {
      itemIndex: options.itemIndex,
      query: resolverQuery,
      candidates: matches.slice(0, 30).map(candidateDiagnostic),
    });
  } catch (error) {
    options.emitDiagnostic("structured_search_failed", {
      itemIndex: options.itemIndex,
      query: resolverQuery,
      ...diagnosticError(error),
    });
    matches = [];
  }

  const evaluated = matches.map((candidate) => evaluateStructuredCandidate(candidate, resolverQuery));
  options.emitDiagnostic("structured_candidate_decisions", {
    itemIndex: options.itemIndex,
    decisions: evaluated.map(({ candidate, accepted, score, reasons }) => ({
      id: candidate?.id || "",
      name: candidate?.name || "",
      source: candidate?.source || "",
      accepted,
      score,
      reasons,
    })),
  });
  const rankedMatches = evaluated
    .filter((decision) => decision.accepted)
    .sort((left, right) => right.score - left.score);
  const matchDecision = rankedMatches[0] || null;
  const match = matchDecision?.candidate || null;
  const amount = food.unit === "g" ? roundNumber(portionGrams) : roundNumber(food.amount);
  const unit = descriptionUnits.has(food.unit) ? food.unit : "serving";

  if (match) {
    const sourceGrams = Number(match.servingGrams);
    const multiplier = portionGrams > 0
      ? portionGrams / sourceGrams
      : unit === "g" ? amount / sourceGrams : amount;
    const resolved = {
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
    options.emitDiagnostic("resolver_decision", {
      itemIndex: options.itemIndex,
      decision: "structured",
      candidate: candidateDiagnostic(match),
      score: matchDecision.score,
      multiplier,
    });
    return resolved;
  }

  const fallback = {
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
  if (food._hasAiFallback === false) {
    options.emitDiagnostic("resolver_decision", {
      itemIndex: options.itemIndex,
      decision: "failed",
      reason: "no_structured_match_and_no_ai_fallback",
    });
    throw invalidEstimateError();
  }
  options.emitDiagnostic("resolver_decision", {
    itemIndex: options.itemIndex,
    decision: "ai_fallback",
    reason: matches.length ? "no_semantically_compatible_structured_candidate" : "structured_source_unavailable_or_empty",
  });
  return fallback;
}

function resolverQueryForFood(food) {
  const base = String(food.searchQuery || food.name || "").trim();
  const baseTokens = new Set(normalizedTokens(base));
  const qualifierText = `${food.name || ""} ${food.qualifiers || ""}`;
  const missingQualifiers = [...qualifiersForText(qualifierText).all].filter((word) => !baseTokens.has(word));
  return [base, ...missingQualifiers].filter(Boolean).join(" ");
}

export function evaluateStructuredCandidate(candidate, query) {
  const reasons = [];
  const servingGrams = Number(candidate?.servingGrams || 0);
  const nutrients = [candidate?.calories, candidate?.protein, candidate?.carbs, candidate?.fat].map(Number);
  if (!Number.isFinite(servingGrams) || servingGrams <= 0) reasons.push("missing_gram_serving");
  if (nutrients.some((value) => !Number.isFinite(value) || value < 0)) reasons.push("invalid_nutrition");

  const queryIdentity = identityTokens(query);
  const candidateIdentity = identityTokens(candidate?.name);
  const candidateNameSet = new Set(candidateIdentity);
  const identityHits = queryIdentity.filter((word) => candidateNameSet.has(word));
  const identityCoverage = queryIdentity.length ? identityHits.length / queryIdentity.length : 0;
  if (!queryIdentity.length) reasons.push("missing_query_identity");
  if (!identityHits.length) reasons.push("food_identity_mismatch");
  else if (identityCoverage < 0.5) reasons.push("insufficient_identity_coverage");

  const queryQualifiers = qualifiersForText(query);
  const candidateQualifiers = qualifiersForText(candidate?.name);
  reasons.push(...qualifierIncompatibilities(queryQualifiers, candidateQualifiers));

  const queryTokens = new Set(normalizedTokens(query));
  const brandHits = normalizedTokens(candidate?.brand).filter((word) => queryTokens.has(word)).length;
  const qualifierMatches = [...queryQualifiers.all].filter((word) => candidateQualifiers.all.has(word)).length;
  const sourceBonus = String(candidate?.source || "").toUpperCase() === "USDA" ? 4 : 0;
  const compactnessPenalty = Math.max(0, candidateIdentity.length - queryIdentity.length) * 0.35;
  const score = roundNumber(
    (identityCoverage * 60)
    + (identityHits.length * 8)
    + (qualifierMatches * 6)
    + Math.min(brandHits, 2)
    + sourceBonus
    - compactnessPenalty,
  );

  return { candidate, accepted: reasons.length === 0 && score >= 38, score, reasons };
}

function qualifierIncompatibilities(query, candidate) {
  const reasons = [];
  const queryState = canonicalState(query);
  const candidateState = canonicalState(candidate);
  if (queryState === "raw" && candidateState !== "raw") reasons.push("raw_state_not_supported");
  if (queryState === "cooked" && candidateState === "raw") reasons.push("cooked_state_conflict");

  const queryMethods = query.groups.method;
  const candidateMethods = candidate.groups.method;
  if (queryMethods.size) {
    const exactMethod = intersects(queryMethods, candidateMethods);
    const genericCooked = query.groups.state.has("cooked") && candidateState === "cooked";
    if (!exactMethod && !genericCooked) reasons.push("preparation_not_supported");
  } else if ([...candidateMethods].some((word) => additiveCookingMethods.has(word))) {
    reasons.push("unsupported_additive_preparation");
  }

  ["coating", "processing", "cut", "skin", "diet", "alcohol", "composition"].forEach((groupName) => {
    const requested = query.groups[groupName];
    const offered = candidate.groups[groupName];
    if (requested.size && !intersects(requested, offered)) reasons.push(`${groupName}_qualifier_conflict`);
    if (!requested.size && offered.size) reasons.push(`unsupported_${groupName}_qualifier`);
  });
  return [...new Set(reasons)];
}

function canonicalState(qualifiers) {
  if (qualifiers.groups.state.has("raw") || qualifiers.groups.state.has("uncooked")) return "raw";
  if (qualifiers.groups.state.has("cooked") || qualifiers.groups.method.size) return "cooked";
  return "unspecified";
}

function intersects(left, right) {
  return [...left].some((value) => right.has(value));
}

function qualifiersForText(value) {
  const tokens = normalizedTokens(value);
  const groups = Object.fromEntries(Object.entries(qualifierGroups).map(([name, words]) => [
    name,
    new Set(tokens.filter((token) => words.has(token))),
  ]));
  return { groups, all: new Set(Object.values(groups).flatMap((group) => [...group])) };
}

function identityTokens(value) {
  return normalizedTokens(value).filter((word) => (
    word.length > 1
    && !identityStopWords.has(word)
    && !measurementWords.has(word)
    && !materialQualifierWords.has(word)
    && !/^\d+(?:\.\d+)?$/.test(word)
  ));
}

function normalizedTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/sugar[\s-]*free/g, "sugarfree")
    .replace(/deep[\s-]*fried/g, "deepfried")
    .replace(/(?:separable\s+fat|fat\s+only)/g, "fatcomponent")
    .match(/[a-z0-9]+/g)
    ?.map(canonicalToken) || [];
}

function canonicalToken(word) {
  if (["alcohol", "alcoholic", "beer", "brandy", "cocktail", "gin", "liqueur", "rum", "vodka", "whiskey", "whisky", "wine"].includes(word)) return "alcoholic";
  if (word === "fat") return "fatcomponent";
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function extractPortionHints(description) {
  const text = String(description || "");
  const hints = [];
  const occupied = [];
  const metricPattern = /(\d+(?:[.,]\d+)?)\s*(kilograms?|kg|grams?|grm?|g|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l)\b/gi;
  for (const match of text.matchAll(metricPattern)) {
    const numeric = Number(match[1].replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    const normalizedUnit = normalizeMetricUnit(match[2]);
    const isWeight = normalizedUnit === "g";
    const amount = /^(?:kg|kilogram)/i.test(match[2]) ? numeric * 1000
      : /^(?:l|liter|litre)/i.test(match[2]) && !/^ml|millil/i.test(match[2]) ? numeric * 1000
        : numeric;
    hints.push({
      amount: roundNumber(amount),
      unit: normalizedUnit,
      servingGrams: isWeight ? roundNumber(amount) : null,
      context: descriptionContext(text, match.index, match.index + match[0].length),
      index: match.index,
    });
    occupied.push([match.index, match.index + match[0].length]);
  }

  const countPattern = /\b(\d+(?:[.,]\d+)?)\s+(?=[a-z])/gi;
  for (const match of text.matchAll(countPattern)) {
    const start = match.index;
    if (occupied.some(([from, to]) => start >= from && start < to)) continue;
    const amount = Number(match[1].replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    hints.push({
      amount: roundNumber(amount),
      unit: "piece",
      servingGrams: null,
      context: descriptionContext(text, start, start + match[0].length),
      index: start,
    });
  }
  return hints.sort((left, right) => left.index - right.index);
}

function normalizeMetricUnit(unit) {
  return /^(?:ml|millil|l|liter|litre)/i.test(String(unit || "")) ? "ml" : "g";
}

function descriptionContext(text, start, end) {
  const prefix = text.slice(0, start);
  const leftConjunctions = [...prefix.matchAll(/\s+(?:and|plus)\s+/gi)];
  const leftConjunction = leftConjunctions.length
    ? leftConjunctions.at(-1).index + leftConjunctions.at(-1)[0].length - 1
    : -1;
  const leftBreak = Math.max(text.lastIndexOf(",", start), text.lastIndexOf(";", start), leftConjunction);
  const comma = text.indexOf(",", end);
  const semicolon = text.indexOf(";", end);
  const suffix = text.slice(end);
  const rightConjunctionMatch = suffix.match(/\s+(?:and|plus)\s+/i);
  const rightConjunction = rightConjunctionMatch?.index === undefined ? -1 : end + rightConjunctionMatch.index;
  const candidates = [comma, semicolon, rightConjunction].filter((index) => index >= 0);
  const rightBreak = candidates.length ? Math.min(...candidates) : text.length;
  return text.slice(leftBreak + 1, rightBreak).trim();
}

function reconcileParsedDescription(parsed, description, portionHints) {
  const foods = (parsed.foods || []).map((food) => ({ ...food }));
  const unusedFoods = new Set(foods.map((_, index) => index));
  portionHints.forEach((hint) => {
    const contextIdentity = identityTokens(hint.context);
    let bestIndex = -1;
    let bestScore = -1;
    unusedFoods.forEach((index) => {
      const foodIdentity = new Set(identityTokens(`${foods[index].name} ${foods[index].searchQuery}`));
      const score = contextIdentity.filter((word) => foodIdentity.has(word)).length;
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    if (bestIndex < 0) return;
    const food = foods[bestIndex];
    food.amount = hint.amount;
    food.unit = hint.unit;
    if (hint.servingGrams) food.servingGrams = hint.servingGrams;
    unusedFoods.delete(bestIndex);
  });

  const descriptionQualifiers = qualifiersForText(description);
  if (foods.length === 1 && descriptionQualifiers.all.size) {
    const food = foods[0];
    const missing = [...descriptionQualifiers.all].filter((word) => !normalizedTokens(food.searchQuery).includes(word));
    if (missing.length) food.searchQuery = `${food.searchQuery} ${missing.join(" ")}`.trim();
  }
  validateParsedDescription({ ...parsed, foods });
  return { ...parsed, foods };
}

function parseDescriptionLocally(description, portionHints) {
  const segments = String(description || "")
    .split(/\s*(?:,|;|\band\b|\bplus\b)\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 8);
  const foods = segments.map((segment) => {
    const cleanIdentity = segment
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:kilograms?|kg|grams?|grm?|g|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l)\b/gi, " ")
      .replace(/^\s*\d+(?:[.,]\d+)?\s+/, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!identityTokens(cleanIdentity).length) return null;
    return {
      name: titleCaseDescription(cleanIdentity),
      searchQuery: cleanIdentity,
      amount: 1,
      unit: "serving",
      servingGrams: 0,
      qualifiers: [...qualifiersForText(cleanIdentity).all].join(" "),
      fallbackCalories: 0,
      fallbackProtein: 0,
      fallbackCarbs: 0,
      fallbackFat: 0,
      _hasAiFallback: false,
    };
  }).filter(Boolean);
  return reconcileParsedDescription({ foods, confidence: "low", notes: "" }, description, portionHints);
}

function titleCaseDescription(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function describedPortionGrams(food) {
  const grams = Number(food.servingGrams || 0);
  if (grams > 0) return grams;
  if (food.unit === "g") return Number(food.amount || 0);
  return 0;
}

function parsedFoodDiagnostic(food) {
  return {
    name: food.name,
    searchQuery: food.searchQuery,
    amount: food.amount,
    unit: food.unit,
    servingGrams: food.servingGrams,
    qualifiers: food.qualifiers,
  };
}

function candidateDiagnostic(candidate) {
  return {
    id: candidate?.id || "",
    name: candidate?.name || "",
    brand: candidate?.brand || "",
    source: candidate?.source || "",
    servingGrams: candidate?.servingGrams || 0,
  };
}

function diagnosticError(error) {
  return {
    message: String(error?.message || "Unknown error"),
    status: Number(error?.status || 0) || undefined,
    cause: String(error?.cause?.message || "") || undefined,
  };
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
  const rawFoods = analysis?.containsFood === false
    ? []
    : Array.isArray(analysis?.foods)
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
