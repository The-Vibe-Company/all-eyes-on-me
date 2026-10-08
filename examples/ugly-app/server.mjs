// The ugly demo app: four deliberately bad pages, one broken link, and orders
// behind a sign-in with a fake account (fixtures/compte.json).
// Start it with `node examples/ugly-app/server.mjs` (PORT defaults to 4317).
//
// pages/   one HTML file per page, owned by that page alone
// shared/  what every page shares: kit.css, served at /shared/kit.css, and
//          HTML partials such as header.html, inserted where a page writes
//          <!-- include: header -->
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 4317);
const PAGES = {
  "/": "index.html",
  "/produits": "produits.html",
  "/commandes": "commandes.html",
  "/contact": "contact.html",
  "/connexion": "connexion.html",
};
/** Pages only a signed-in customer sees; the others are public. */
const PRIVATE = new Set(["/commandes"]);
const sessions = new Set();
const account = JSON.parse(await readFile(new URL("./fixtures/compte.json", import.meta.url), "utf8"));

const signedIn = (req) => (req.headers.cookie ?? "").split(/;\s*/).some((c) => sessions.has(c.replace(/^session=/, "")));

async function body(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return new URLSearchParams(text);
}
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
  if (path === "/connexion" && req.method === "POST") {
    const form = await body(req);
    if (form.get("email") === account["Email"] && form.get("mdp") === account["Mot de passe"]) {
      const session = randomUUID();
      sessions.add(session);
      res.writeHead(303, { location: "/commandes", "set-cookie": `session=${session}; Path=/; HttpOnly; SameSite=Lax` });
    } else {
      res.writeHead(303, { location: "/connexion?erreur=1" });
    }
    res.end();
    return;
  }
  if (PRIVATE.has(path) && !signedIn(req)) {
    res.writeHead(303, { location: "/connexion" });
    res.end();
    return;
  }
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
  let html = String(await read(`./pages/${file}`));
  const failed = new URL(req.url ?? "/", "http://localhost").searchParams.has("erreur");
  html = html.replace("<!-- include: erreur -->", failed ? `<p class="erreur">Email ou mot de passe incorrect.</p>` : "");
  res.end(await withIncludes(html));
}).listen(PORT, () => console.log(`ugly-app on http://localhost:${PORT}`));
