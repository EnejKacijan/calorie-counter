import { analyzeFoodImage } from "../../server/food-image-analysis.js";

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const body = await request.json();
    const food = await analyzeFoodImage(body.imageDataUrl);

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
    return Response.json({ error: error.message || "Food photo analysis failed." }, { status: error.status || 500 });
  }
};
