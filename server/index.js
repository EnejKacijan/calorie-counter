import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { searchFoods } from "./food-search.js";
import { analyzeFoodImage, correctFoodImageItem } from "./food-image-analysis.js";
import { askNutritionAssistant } from "./nutrition-assistant.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = normalize(join(__dirname, ".."));
const publicDir = join(rootDir, "public");

loadEnvFile(join(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const displayHost = host === "0.0.0.0" ? "localhost" : host;
const usdaApiKey = process.env.USDA_API_KEY || "DEMO_KEY";
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL;
const openAiAssistantModel = process.env.OPENAI_ASSISTANT_MODEL || openAiModel;
const aiScanRateLimit = {
  maxRequests: positiveInteger(process.env.AI_SCAN_RATE_LIMIT, 5),
  windowMs: positiveInteger(process.env.AI_SCAN_RATE_WINDOW_MS, 60_000),
};
const aiScanBuckets = new Map();
const assistantRateLimit = {
  maxRequests: positiveInteger(process.env.AI_ASSISTANT_RATE_LIMIT, 20),
  windowMs: positiveInteger(process.env.AI_ASSISTANT_RATE_WINDOW_MS, 10 * 60_000),
};
const assistantBuckets = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/foods/search" && request.method === "GET") {
      return sendJson(response, 200, { foods: await searchFoods(url.searchParams.get("q") || "", { usdaApiKey }) });
    }

    if (url.pathname === "/api/foods/analyze-image" && request.method === "POST") {
      const rateLimit = consumeAiScanRateLimit(request);
      if (!rateLimit.allowed) {
        return sendJson(
          response,
          429,
          { error: `Too many scans. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
          rateLimit.headers,
        );
      }

      const body = await readJsonBody(request);
      const analysis = await analyzeFoodImage(body.imageDataUrl, { openAiApiKey, model: openAiModel });
      return sendJson(response, 200, { analysis }, rateLimit.headers);
    }

    if (url.pathname === "/api/foods/correct-image-item" && request.method === "POST") {
      const rateLimit = consumeAiScanRateLimit(request);
      if (!rateLimit.allowed) {
        return sendJson(
          response,
          429,
          { error: `Too many scans. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
          rateLimit.headers,
        );
      }

      const body = await readJsonBody(request);
      const food = await correctFoodImageItem(body, { openAiApiKey, model: openAiModel });
      return sendJson(response, 200, { food }, rateLimit.headers);
    }

    if (url.pathname === "/api/assistant/chat" && request.method === "POST") {
      const rateLimit = consumeAssistantRateLimit(request);
      if (!rateLimit.allowed) {
        return sendJson(
          response,
          429,
          { error: `Too many messages. Try again in ${rateLimit.retryAfterSeconds} seconds.` },
          rateLimit.headers,
        );
      }

      const body = await readJsonBody(request);
      const result = await askNutritionAssistant(body, {
        openAiApiKey,
        model: openAiAssistantModel,
      });
      return sendJson(response, 200, result, rateLimit.headers);
    }

    if (url.pathname.startsWith("/api/")) {
      return sendJson(response, 404, { error: "API endpoint does not exist." });
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    if (!error.status || error.status >= 500) console.error(error);
    return sendJson(response, error.status || 500, { error: error.message || "Something went wrong on the server." });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. The app may already be running at http://${displayHost}:${port}`);
    console.error("Stop the existing server with Ctrl+C in its terminal, or set PORT to another value in .env.");
    process.exit(1);
  }

  throw error;
});

server.listen(port, host, () => {
  console.log(`Calorie Counter running at http://${displayHost}:${port}`);
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

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(data));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function consumeAiScanRateLimit(request) {
  return consumeRateLimit(request, aiScanRateLimit, aiScanBuckets);
}

function consumeAssistantRateLimit(request) {
  return consumeRateLimit(request, assistantRateLimit, assistantBuckets);
}

function consumeRateLimit(request, config, buckets) {
  const now = Date.now();
  const key = clientRateLimitKey(request);
  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + config.windowMs };

  pruneRateLimitBuckets(buckets, now);

  if (bucket.count >= config.maxRequests) {
    buckets.set(key, bucket);
    return rateLimitResult(false, bucket, config);
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return rateLimitResult(true, bucket, config);
}

function rateLimitResult(allowed, bucket, config) {
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
  const remaining = Math.max(0, config.maxRequests - bucket.count);
  return {
    allowed,
    retryAfterSeconds,
    headers: {
      "Retry-After": String(retryAfterSeconds),
      "X-RateLimit-Limit": String(config.maxRequests),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
    },
  };
}

function clientRateLimitKey(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);
  return forwardedFor || request.socket.remoteAddress || "unknown";
}

function pruneRateLimitBuckets(buckets, now) {
  if (buckets.size < 1000) return;
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) buckets.delete(key);
  });
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
