// AEOM's landing page. Start it with `node site/server.mjs` (PORT defaults to 4400).
//
// pages/   one HTML file per page
// shared/  what pages share: CSS and JS served at /shared/<file>, and HTML
//          partials inserted where a page writes <!-- include: <name> -->
// run/     what AEOM's own run on this page produced, served as is
// api/     the functions Vercel runs; this server answers the same routes
import { createServer } from "node:http";
import { PAGES, TYPES, read, renderPage } from "./render.mjs";
import { starsResponse } from "./stars.mjs";

const PORT = Number(process.env.PORT ?? 4400);

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
  if (path === "/api/stars") {
    // Like the Vercel function, which only exports GET.
    if (req.method !== "GET") {
      res.writeHead(405, { allow: "GET", "content-type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed");
      return;
    }
    const answer = await starsResponse();
    res.writeHead(answer.status, Object.fromEntries(answer.headers));
    res.end(await answer.text());
    return;
  }
  const asset = path.match(/^\/(shared|run)\/((?:[a-z0-9-]+\/)*[a-z0-9@._-]+)$/);
  if (asset && !asset[2].includes("..") && (await serveFile(res, asset[1], asset[2]))) return;
  const file = PAGES[path.replace(/\/+$/, "") || "/"];
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(await renderPage(file));
}).listen(PORT, () => console.log(`AEOM landing on http://localhost:${PORT}`));
