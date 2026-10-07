// The ugly demo app: four deliberately bad pages and one broken link.
// Start it with `node examples/ugly-app/server.mjs` (PORT defaults to 4317).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT ?? 4317);
const PAGES = {
  "/": "index.html",
  "/produits": "produits.html",
  "/commandes": "commandes.html",
  "/contact": "contact.html",
};

createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname.replace(/\/+$/, "") || "/";
  if (path === "/aide") {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
    return;
  }
  const file = PAGES[path];
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(await readFile(new URL(`./pages/${file}`, import.meta.url)));
}).listen(PORT, () => console.log(`ugly-app on http://localhost:${PORT}`));
