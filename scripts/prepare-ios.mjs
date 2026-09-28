import { cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const preview = process.argv.includes("--preview");
const input = process.env.INTAKE_API_ORIGIN;
let origin = "";
if (input) {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error("INTAKE_API_ORIGIN must be a plain HTTPS origin without credentials, path or query.");
  origin = url.origin;
} else if (!preview) throw Error("Set INTAKE_API_ORIGIN to your deployed HTTPS backend. Use --preview for an offline/manual-only development build.");
const destination = join(root, "native", "www");
await mkdir(destination, { recursive: true });
await cp(join(root, "public"), destination, { recursive: true });
await writeFile(join(destination, "runtime-config.js"), `export const apiOrigin = ${JSON.stringify(origin)};\n`);
const config = JSON.parse(await readFile(join(root, "capacitor.config.json"), "utf8"));
console.log(`Prepared ${config.appName} (${config.appId}). ${origin ? "HTTPS backend configured." : "PREVIEW ONLY: online features disabled in native app."}`);
