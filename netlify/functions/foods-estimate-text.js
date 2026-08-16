import { analyzeFoodDescription } from "../../server/food-image-analysis.js";

export default async (request) => {
  try {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
    const body = await request.json();
    const analysis = await analyzeFoodDescription(body.description);
    return Response.json({ analysis }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error.message || "AI food estimate failed." }, { status: error.status || 500 });
  }
};
