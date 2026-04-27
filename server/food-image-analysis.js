const openAiResponsesUrl = "https://api.openai.com/v1/responses";
const maxImageDataUrlLength = 9_000_000;

const nutritionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "amount", "unit", "calories", "protein", "carbs", "fat", "confidence", "notes"],
  properties: {
    name: { type: "string" },
    amount: { type: "number" },
    unit: { type: "string", enum: ["serving", "piece", "g"] },
    calories: { type: "number" },
    protein: { type: "number" },
    carbs: { type: "number" },
    fat: { type: "number" },
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
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "You estimate nutrition from food photos for a calorie tracking app. Return cautious, editable estimates only. If multiple foods are visible, summarize the whole plate. If the photo is not food, use name 'Unknown food' and zero nutrition.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Identify the visible food and estimate the total portion, calories, protein, carbs, and fat. Use grams only when you can make a reasonable portion estimate; otherwise use serving or piece. Keep notes short.",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "low",
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
  const unit = ["serving", "piece", "g"].includes(analysis.unit) ? analysis.unit : "serving";
  const amount = Math.max(0, Number(analysis.amount || 1));

  return {
    name: String(analysis.name || "Unknown food").trim() || "Unknown food",
    amount: unit === "g" ? Math.round(amount || 100) : Math.max(1, Math.round(amount || 1)),
    unit,
    calories: Math.max(0, Math.round(Number(analysis.calories || 0))),
    protein: Math.max(0, Math.round(Number(analysis.protein || 0))),
    carbs: Math.max(0, Math.round(Number(analysis.carbs || 0))),
    fat: Math.max(0, Math.round(Number(analysis.fat || 0))),
    confidence: ["low", "medium", "high"].includes(analysis.confidence) ? analysis.confidence : "low",
    notes: String(analysis.notes || "").trim(),
    source: "OpenAI photo estimate",
  };
}
