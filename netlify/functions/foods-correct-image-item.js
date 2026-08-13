import { correctFoodImageItem } from "../../server/food-image-analysis.js";

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const payload = await request.json();
    const food = await correctFoodImageItem(payload);

    return Response.json(
      { food },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message || "Food correction failed." }, { status: error.status || 500 });
  }
};
