import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]));
  return paths.flat();
}
const version = (await readFile(".next/BUILD_ID", "utf8")).trim();
const files = await walk(".next/static");
const assets = files.filter(path => /\.(js|css|woff2?)$/.test(path)).map(path => path.replace(".next/static", "/_next/static"));
await writeFile("public/precache.json", JSON.stringify({ version, assets: ["/", "/privacy", "/terms", "/manifest.webmanifest", "/brand.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png", ...assets] }));
const worker = await readFile("scripts/service-worker.js", "utf8");
await writeFile("public/sw.js", worker.replace("__BUILD_VERSION__", version));
console.log(`Offline shell includes ${assets.length} build assets.`);
