// What the server and the static build share: which pages exist, which files
// are published, and how a page gets its partials.
import { readFile } from "node:fs/promises";

export const PAGES = { "/": "index.html" };
export const TYPES = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json; charset=utf-8" };

export const read = (path) => readFile(new URL(path, import.meta.url));

export async function renderPage(file) {
  let html = String(await read(`./pages/${file}`));
  for (const [marker, name] of [...html.matchAll(/<!-- include: ([a-z0-9-]+) -->/g)]) {
    html = html.replace(marker, await read(`./shared/${name}.html`).then(String, () => `<!-- missing partial: ${name} -->`));
  }
  return html;
}
