import { readFile, realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export interface ServedFolder {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Serves a folder of static pages on this machine, as a site: `/` is its
 * `index.html`, `/liste.html` its file, `/liste/` the index of a folder in it,
 * and a link to `index.html` goes to its folder, so it is one page, not two.
 * Nothing outside the folder is ever served. The server does not keep the
 * process alive on its own: a command that ends early does not hang on it.
 */
export async function serveFolder(dir: string, port = 0): Promise<ServedFolder> {
  const root = resolve(dir);
  const realRoot = await realpath(root);
  const server = createServer(async (req, res) => {
    const notFound = () => {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    };
    // Whatever a request holds, it gets an answer: an odd path never stops the server or the command using it.
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const path = decodeURIComponent(url.pathname);
      if (/[\0\r\n]/.test(path)) return notFound();
      let file = normalize(join(root, path));
      if (file !== root && !file.startsWith(root + sep)) return notFound();
      const go = (to: string) => {
        res.writeHead(301, { location: encodeURI(to) + url.search });
        res.end();
      };
      // A folder's index is the folder: /index.html and / are one page, not two.
      if (/(^|\/)index\.html$/.test(path)) return go(path.replace(/index\.html$/, "") || "/");
      if ((await stat(file)).isDirectory()) {
        // A folder without its slash: its own links would resolve one level up.
        if (!path.endsWith("/")) return go(`${path}/`);
        file = join(file, "index.html");
      }
      // A link inside the folder to a file outside it is not followed.
      const real = await realpath(file);
      if (real !== realRoot && !real.startsWith(realRoot + sep)) return notFound();
      const body = await readFile(real);
      res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      if (!res.headersSent) notFound();
      else res.end();
    }
  });
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => done());
  });
  server.unref();
  const { port: bound } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${bound}`,
    stop: () => new Promise<void>((done) => server.close(() => done())),
  };
}
