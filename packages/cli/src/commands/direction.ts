import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createTournament, decideDirection } from "@aeom/core";

export const DIRECTION_HELP = `Usage: aeom direction keep <folder> --sentence "<its sentence>" --source "<what it was drawn from>" [--why "<their words>"]
       aeom direction show
       aeom direction use --run <run folder>
       aeom direction drop

The direction the person chose with /aeom directions, kept in the project's
.aeom/direction/ until a run builds on it: /aeom redo carries it into the app,
/aeom build --from-scratch builds its front on it, instead of drawing new ones.

  keep <folder>  Keep the mockup in that folder (a direction of a run, such as
                 .aeom/runs/<run>/directions/<slug>): its pages and their
                 styles, never an image a commit would carry, and what
                 describes it in .aeom/direction/direction.json. It replaces
                 the direction kept before, and says which.
  show           Say which direction is kept, its pages as absolute paths for a
                 worker in another folder; exit 1 when none is, 2 when a run
                 already built on it
  use --run <d>  The run builds on it: written in the run as the direction
                 the person chose, which its result page, its PR and its
                 standard read, and marked as applied
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
  /** The run that built on it: no later run builds on it again. */
  applied?: string;
}

const read = async () => readFile(join(KEPT, "direction.json"), "utf8").then((t) => JSON.parse(t) as Kept, () => null);

export async function runDirection(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { sentence: { type: "string" }, source: { type: "string" }, why: { type: "string" }, run: { type: "string" }, help: { type: "boolean", short: "h" } } });
  const [action, folder] = positionals;
  if (values.help || !action || !["keep", "show", "use", "drop"].includes(action)) {
    console.log(DIRECTION_HELP);
    return values.help ? 0 : 1;
  }
  if (action === "show") {
    const kept = await read();
    if (!kept) {
      console.log("No direction kept: /aeom directions proposes some.");
      return 1;
    }
    const pages = (await readdir(KEPT)).filter((f) => f.endsWith(".html")).map((f) => resolve(KEPT, f));
    console.log(`${kept.slug}: ${kept.sentence}\nFrom ${kept.source}${kept.run ? `, chosen in ${kept.run}` : ""}${kept.why ? `: ${kept.why}` : ""}.\nIts pages: ${pages.join(", ") || "none"}${kept.applied ? `\nAlready built on, in ${kept.applied}: a run draws new directions, or keeps the style.` : ""}`);
    return kept.applied ? 2 : 0;
  }
  if (action === "use") {
    const kept = await read();
    if (!kept || kept.applied) {
      console.error(kept ? `${kept.slug} was already built on, in ${kept.applied}.` : "No direction kept: /aeom directions proposes some.");
      return 1;
    }
    if (!values.run || !existsSync(values.run)) {
      console.error(`aeom direction use --run <the run's folder>, such as .aeom/runs/<run>.`);
      return 1;
    }
    // Written as the run's own decision: the result page, the PR and the standard read the direction there.
    const dir = join(values.run, "directions");
    await mkdir(dir, { recursive: true });
    const why = `chosen with /aeom directions${kept.run ? ` in ${kept.run}` : ""}, from ${kept.source}${kept.why ? `: ${kept.why}` : ""}`;
    const { tournament } = decideDirection(createTournament([kept.slug], { knockout: false }), { choose: kept.slug, why, at: new Date().toISOString() });
    await writeFile(join(dir, "tournament.json"), `${JSON.stringify(tournament, null, 2)}\n`);
    await writeFile(join(dir, "sheet.json"), `${JSON.stringify([{ label: kept.slug, note: kept.sentence }], null, 2)}\n`);
    const run = basename(resolve(values.run));
    await writeFile(join(KEPT, "direction.json"), `${JSON.stringify({ ...kept, applied: run }, null, 2)}\n`);
    console.log(`${run} builds on ${kept.slug}: its result page, its PR and its standard say so. No later run builds on it again.`);
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
  // The same folder by another name (a link, /var and /private/var) is still the one kept.
  const real = (path: string) => realpath(path).catch(() => resolve(path));
  if ((await real(from)) === (await real(KEPT))) {
    console.error(`${folder} is the direction kept already: give the folder of a run's direction.`);
    return 1;
  }
  if (!existsSync(join(from, "index.html"))) {
    console.error(`${folder} holds no index.html: give the folder of a direction's mockup.`);
    return 1;
  }
  const before = await read();
  await rm(KEPT, { recursive: true, force: true });
  const left: string[] = [];
  await cp(from, KEPT, { recursive: true, filter: (src) => (IMAGE.test(src) ? (left.push(relative(from, src)), false) : true) });
  // The run it was chosen in, when the folder is a run's: .aeom/runs/<run>/directions/<slug>.
  const run = basename(dirname(dirname(from))).startsWith("run-") ? basename(dirname(dirname(from))) : null;
  const kept: Kept = { slug: basename(from), sentence: values.sentence.trim(), source: values.source.trim(), ...(values.why?.trim() ? { why: values.why.trim() } : {}), run, kept: new Date().toISOString() };
  await writeFile(join(KEPT, "direction.json"), `${JSON.stringify(kept, null, 2)}\n`);
  console.log(`Kept ${kept.slug} in ${KEPT}/${before && before.slug !== kept.slug ? `; it replaces ${before.slug}` : ""}. /aeom redo carries it into the app, /aeom build --from-scratch builds on it; aeom direction drop forgets it.`);
  // A commit carries no image: one the pages show is left out, and said.
  if (left.length) console.log(`Left out, as images a commit would carry: ${left.join(", ")}. A page that shows one shows a gap.`);
  return 0;
}
