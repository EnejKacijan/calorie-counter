import { askNutritionAssistant } from "../../server/nutrition-assistant.js";

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const payload = await request.json();
    const result = await askNutritionAssistant(payload);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message || "The AI assistant could not respond." }, { status: error.status || 500 });
  }
};
