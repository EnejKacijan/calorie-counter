import { lookupFoodBarcode } from "../../server/food-search.js";

export default async (request) => {
  try {
    const url = new URL(request.url);
    const food = await lookupFoodBarcode(url.searchParams.get("code") || "");
    return Response.json(food ? { food } : { error: "Product not found in Open Food Facts." }, {
      status: food ? 200 : 404,
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    return Response.json({ error: error.message || "Barcode lookup failed." }, { status: 400 });
  }
};
