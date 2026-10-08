// The landing as static files, for a host that does not run Node.
// `node site/build.mjs [out]` writes every page with its partials inserted,
// plus the published files of shared/ and run/, to out (default site/dist).
// Vercel runs it with the project's Root Directory set to site, where
// site/vercel.json lives; without that setting Vercel never reads the file.
import { existsSync, realpathSync } from "node:fs";
import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, TYPES, renderPage } from "./render.mjs";

/** The path with every link resolved, for the part of it that exists. */
function real(path) {
  let existing = path;
  const rest = [];
  while (!existsSync(existing) && dirname(existing) !== existing) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync(existing), ...rest);
}

/** Whether `path` is `folder` or inside it. */
const within = (path, folder) => {
  const from = relative(folder, path);
  return from === "" || (!from.startsWith(`..${sep}`) && from !== ".." && !isAbsolute(from));
};

const here = real(fileURLToPath(new URL(".", import.meta.url)));
const out = real(resolve(process.argv[2] ?? resolve(here, "dist")));

// out is emptied first, so it must be a folder of its own: never a folder that
// holds the site, such as the repository, and inside the site only dist/.
if (within(here, out) || (within(out, here) && !within(out, join(here, "dist")))) {
  console.error(`Refusing to build into ${out}: emptying it would delete the site. Use site/dist or a folder outside the site.`);
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
