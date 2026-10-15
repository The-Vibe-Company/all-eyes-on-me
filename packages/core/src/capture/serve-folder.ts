import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
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
  const server = createServer(async (req, res) => {
    const notFound = () => {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    };
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    } catch {
      return notFound();
    }
    // A folder's index is the folder: /index.html and / are one page, not two.
    if (/(^|\/)index\.html$/.test(path)) {
      res.writeHead(301, { location: path.replace(/index\.html$/, "") || "/" });
      return res.end();
    }
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) return notFound();
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      notFound();
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
