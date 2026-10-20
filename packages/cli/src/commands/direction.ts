import { existsSync } from "node:fs";
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export const DIRECTION_HELP = `Usage: aeom direction keep <folder> --sentence "<its sentence>" --source "<what it was drawn from>" [--why "<their words>"]
       aeom direction show
       aeom direction drop

The direction the person chose with /aeom directions, kept in the project's
.aeom/direction/ until a run builds on it: /aeom redo carries it into the app,
/aeom build --from-scratch builds its front on it, instead of drawing new ones.

  keep <folder>  Keep the mockup in that folder (a direction of a run, such as
                 .aeom/runs/<run>/directions/<slug>): its pages and their
                 styles, never an image a commit would carry, and what
                 describes it in .aeom/direction/direction.json. It replaces
                 the direction kept before, and says which.
  show           Say which direction is kept, or exit 1 when none is
  drop           Forget it: the next run draws new directions`;

const KEPT = join(".aeom", "direction");
/** The mockup's pages, styles and drawings; a capture or a picture stays in the run. */
const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?)$/i;

interface Kept {
  slug: string;
  sentence: string;
  source: string;
  why?: string;
  run: string | null;
  kept: string;
}

const read = async () => readFile(join(KEPT, "direction.json"), "utf8").then((t) => JSON.parse(t) as Kept, () => null);

export async function runDirection(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { sentence: { type: "string" }, source: { type: "string" }, why: { type: "string" }, help: { type: "boolean", short: "h" } } });
  const [action, folder] = positionals;
  if (values.help || !action || !["keep", "show", "drop"].includes(action)) {
    console.log(DIRECTION_HELP);
    return values.help ? 0 : 1;
  }
  if (action === "show") {
    const kept = await read();
    if (!kept) {
      console.log("No direction kept: /aeom directions proposes some.");
      return 1;
    }
    const pages = (await readdir(KEPT)).filter((f) => f.endsWith(".html")).map((f) => join(KEPT, f));
    console.log(`${kept.slug}: ${kept.sentence}\nFrom ${kept.source}${kept.run ? `, chosen in ${kept.run}` : ""}${kept.why ? `: ${kept.why}` : ""}.\nIts pages: ${pages.join(", ") || "none"}`);
    return 0;
  }
  if (action === "drop") {
    const kept = await read();
    await rm(KEPT, { recursive: true, force: true });
    console.log(kept ? `Forgot ${kept.slug}: the next run draws new directions.` : "No direction was kept.");
    return 0;
  }
  if (!folder || !values.sentence?.trim() || !values.source?.trim()) {
    console.error(`aeom direction keep <folder> --sentence "<its sentence>" --source "<what it was drawn from>".`);
    return 1;
  }
  const from = resolve(folder);
  if (!existsSync(join(from, "index.html"))) {
    console.error(`${folder} holds no index.html: give the folder of a direction's mockup.`);
    return 1;
  }
  const before = await read();
  await rm(KEPT, { recursive: true, force: true });
  await cp(from, KEPT, { recursive: true, filter: (src) => !IMAGE.test(src) });
  // The run it was chosen in, when the folder is a run's: .aeom/runs/<run>/directions/<slug>.
  const run = basename(dirname(dirname(from))).startsWith("run-") ? basename(dirname(dirname(from))) : null;
  const kept: Kept = { slug: basename(from), sentence: values.sentence.trim(), source: values.source.trim(), ...(values.why?.trim() ? { why: values.why.trim() } : {}), run, kept: new Date().toISOString() };
  await writeFile(join(KEPT, "direction.json"), `${JSON.stringify(kept, null, 2)}\n`);
  console.log(`Kept ${kept.slug} in ${KEPT}/${before && before.slug !== kept.slug ? `; it replaces ${before.slug}` : ""}. /aeom redo carries it into the app, /aeom build --from-scratch builds on it; aeom direction drop forgets it.`);
  return 0;
}
