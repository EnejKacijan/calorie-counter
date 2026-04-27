import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { searchFoods } from "./food-search.js";
import { analyzeFoodImage } from "./food-image-analysis.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = normalize(join(__dirname, ".."));
const publicDir = join(rootDir, "public");

loadEnvFile(join(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const usdaApiKey = process.env.USDA_API_KEY || "DEMO_KEY";
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/foods/search" && request.method === "GET") {
      return sendJson(response, 200, { foods: await searchFoods(url.searchParams.get("q") || "", { usdaApiKey }) });
    }

    if (url.pathname === "/api/foods/analyze-image" && request.method === "POST") {
      const body = await readJsonBody(request);
      const food = await analyzeFoodImage(body.imageDataUrl, { openAiApiKey, model: openAiModel });
      return sendJson(response, 200, { food });
    }

    if (url.pathname.startsWith("/api/")) {
      return sendJson(response, 404, { error: "API endpoint does not exist." });
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error);
    return sendJson(response, error.status || 500, { error: error.message || "Something went wrong on the server." });
  }
}).listen(port, host, () => {
  console.log(`Calorie Counter running at http://${host}:${port}`);
});

async function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch {
    const fallback = await readFile(join(publicDir, "index.html"));
    response.writeHead(200, { "Content-Type": mimeTypes[".html"], "Cache-Control": "no-store" });
    response.end(fallback);
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) {
        const error = new Error("Request body is too large.");
        error.status = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        const error = new Error("Request body must be valid JSON.");
        error.status = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separator = trimmed.indexOf("=");
    if (separator === -1) return;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  });
}
