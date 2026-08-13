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

function normalizeAnalysis(analysis) {
  const rawFoods = Array.isArray(analysis?.foods)
    ? analysis.foods
    : analysis?.name
      ? [analysis]
      : [];

  return {
    foods: rawFoods.slice(0, 8).map(normalizeFoodItem),
    confidence: normalizeConfidence(analysis?.confidence),
    notes: String(analysis?.notes || "").trim(),
  };
}

function normalizeFoodItem(food) {
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
    source: "OpenAI photo estimate",
  };
}

function normalizeNutritionNumber(value) {
  return Math.max(0, Math.round(Number(value || 0) * 10) / 10);
}

function normalizeConfidence(value) {
  return ["low", "medium", "high"].includes(value) ? value : "low";
}
