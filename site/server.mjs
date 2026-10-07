// AEOM's landing page. Start it with `node site/server.mjs` (PORT defaults to 4400).
//
// pages/   one HTML file per page
// shared/  what pages share: CSS and JS served at /shared/<file>, and HTML
//          partials inserted where a page writes <!-- include: <name> -->
// run/     what AEOM's own run on this page produced, served as is
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT ?? 4400);
const PAGES = { "/": "index.html" };
const TYPES = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json; charset=utf-8" };

const read = (path) => readFile(new URL(path, import.meta.url));

async function withIncludes(html) {
  for (const [marker, name] of [...html.matchAll(/<!-- include: ([a-z0-9-]+) -->/g)]) {
    html = html.replace(marker, await read(`./shared/${name}.html`).then(String, () => `<!-- missing partial: ${name} -->`));
  }
  return html;
}

async function serveFile(res, folder, name) {
  const ext = name.match(/\.[a-z]+$/)?.[0];
  if (!ext || !TYPES[ext]) return false;
  try {
    const body = await read(`./${folder}/${name}`);
    res.writeHead(200, { "content-type": TYPES[ext] });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const asset = path.match(/^\/(shared|run)\/((?:[a-z0-9-]+\/)*[a-z0-9@._-]+)$/);
  if (asset && !asset[2].includes("..") && (await serveFile(res, asset[1], asset[2]))) return;
  const file = PAGES[path.replace(/\/+$/, "") || "/"];
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(await withIncludes(String(await read(`./pages/${file}`))));
}).listen(PORT, () => console.log(`AEOM landing on http://localhost:${PORT}`));
