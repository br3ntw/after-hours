// Serves the static export (out/) under /after-hours/, the way GitHub Pages serves a
// project site, for the browser-demo E2E tests: node e2e-pages/serve.mjs [port]
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../out/", import.meta.url));
const BASE = "/after-hours";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};
const port = Number(process.argv[2] ?? 4173);

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (!path.startsWith(`${BASE}/`)) {
    res.writeHead(path === BASE ? 301 : 404, { Location: `${BASE}/` }).end();
    return;
  }
  let file = normalize(join(ROOT, path.slice(BASE.length)));
  if (!file.startsWith(ROOT)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  const found = existsSync(file);
  const target = found ? file : join(ROOT, "404.html");
  res.writeHead(found ? 200 : 404, { "Content-Type": TYPES[extname(target)] ?? "application/octet-stream" });
  createReadStream(target).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Serving out/ at http://127.0.0.1:${port}${BASE}/`));
