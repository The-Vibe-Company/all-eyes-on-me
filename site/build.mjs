// The landing as static files, for a host that does not run Node.
// `node site/build.mjs [out]` writes every page with its partials inserted,
// plus the published files of shared/ and run/, to out (default site/dist).
import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, TYPES, renderPage } from "./render.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, "dist"));

await rm(out, { recursive: true, force: true });
for (const [route, file] of Object.entries(PAGES)) {
  const dir = resolve(out, `.${route}`);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "index.html"), await renderPage(file));
}
for (const folder of ["shared", "run"]) {
  const from = resolve(here, folder);
  if (!existsSync(from)) continue;
  // Partials and anything the server would not serve stay out.
  await cp(from, resolve(out, folder), { recursive: true, filter: (src) => src === from || !extname(src) || extname(src) in TYPES });
}
console.log(`Built the landing in ${out}`);
