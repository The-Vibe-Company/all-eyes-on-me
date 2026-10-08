// The landing as static files, for a host that does not run Node.
// `node site/build.mjs [out]` writes every page with its partials inserted,
// plus the published files of shared/ and run/, to out (default site/dist).
// Vercel runs it with the project's Root Directory set to site, where
// site/vercel.json lives; without that setting Vercel never reads the file.
import { existsSync } from "node:fs";
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, TYPES, renderPage } from "./render.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, "dist"));

// out is emptied first, so it must be a folder of its own: never site/ or a
// folder that holds it, such as the repository.
const fromOut = relative(out, here);
if (fromOut === "" || !fromOut.startsWith("..")) {
  console.error(`Refusing to build into ${out}: it holds the site itself. Pick an empty folder of its own.`);
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
for (const [route, file] of Object.entries(PAGES)) {
  const dir = resolve(out, `.${route}`);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "index.html"), await renderPage(file));
}
for (const folder of ["shared", "run"]) {
  const from = resolve(here, folder);
  if (!existsSync(from)) continue;
  // Only folders and the types the server serves go out: no partial, no dotfile.
  const published = async (src) => !basename(src).startsWith(".") && ((await stat(src)).isDirectory() || extname(src) in TYPES);
  await cp(from, resolve(out, folder), { recursive: true, filter: published });
}
console.log(`Built the landing in ${out}`);
