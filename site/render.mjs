// What the server and the static build share: which pages exist, which files
// are published, and how a page gets its partials.
import { readFile } from "node:fs/promises";

export const PAGES = { "/": "index.html" };
export const TYPES = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json; charset=utf-8" };

export const read = (path) => readFile(new URL(path, import.meta.url));

/** A partial's HTML; a partial that does not exist leaves a comment saying so. */
async function partial(name) {
  try {
    return String(await read(`./shared/${name}.html`));
  } catch (error) {
    if (error?.code === "ENOENT") return `<!-- missing partial: ${name} -->`;
    throw error;
  }
}

/** Puts each partial where the HTML writes <!-- include: <name> -->. */
export async function insertPartials(html, partialFor = partial) {
  for (const [marker, name] of [...html.matchAll(/<!-- include: ([a-z0-9-]+) -->/g)]) {
    const text = await partialFor(name);
    // A function, so a "$&" or "$'" in the partial is kept as written.
    html = html.replace(marker, () => text);
  }
  return html;
}

export async function renderPage(file) {
  return insertPartials(String(await read(`./pages/${file}`)));
}
