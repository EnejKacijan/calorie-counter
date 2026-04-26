import { searchFoods } from "../../server/food-search.js";

export default async (request) => {
  try {
    const url = new URL(request.url);
    const foods = await searchFoods(url.searchParams.get("q") || "");

    return Response.json(
      { foods },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message || "Food search failed." }, { status: 500 });
  }
};

