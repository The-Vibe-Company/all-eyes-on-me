// The ugly demo app: four deliberately bad pages and one broken link.
// Start it with `node examples/ugly-app/server.mjs` (PORT defaults to 4317).
//
// pages/   one HTML file per page, owned by that page alone
// shared/  what every page shares: kit.css, served at /shared/kit.css, and
//          HTML partials such as header.html, inserted where a page writes
//          <!-- include: header -->
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT ?? 4317);
const PAGES = {
  "/": "index.html",
  "/produits": "produits.html",
  "/commandes": "commandes.html",
  "/contact": "contact.html",
};
const TYPES = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };

const read = (path) => readFile(new URL(path, import.meta.url));

async function withIncludes(html) {
  const parts = [...html.matchAll(/<!-- include: ([a-z0-9-]+) -->/g)];
  for (const [marker, name] of parts) {
    const partial = await read(`./shared/${name}.html`).then(String, () => `<!-- missing partial: ${name} -->`);
    html = html.replace(marker, partial);
  }
  return html;
}

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname.replace(/\/+$/, "") || "/";
  if (path === "/aide") {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
    return;
  }
  const shared = path.match(/^\/shared\/([a-z0-9-]+(\.[a-z]+))$/);
  if (shared && TYPES[shared[2]]) {
    try {
      const body = await read(`./shared/${shared[1]}`);
      res.writeHead(200, { "content-type": TYPES[shared[2]] });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    }
    return;
  }
  const file = PAGES[path];
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(await withIncludes(String(await read(`./pages/${file}`))));
}).listen(PORT, () => console.log(`ugly-app on http://localhost:${PORT}`));
