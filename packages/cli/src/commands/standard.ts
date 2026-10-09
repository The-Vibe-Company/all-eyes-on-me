import { readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { champion, draftStandard, mergeStandard, productBrief, standardProblems, type StandardMerge, type Tournament } from "@aeom/core";
import { readIfThere, sheetFile, updateSheet } from "../sheet-file.js";

const STANDARD = sheetFile("standard");

const USAGE = `Usage: aeom standard --draft <file>... [--run <run folder>]
       aeom standard <draft.md>

The standard of the front, in .aeom/standard.md: the art direction kept, its
tokens and its kit, each with the file of the code where it lives, and the
product's own rules. Words only: no image, no capture.

With --draft, prints a first standard from the shared files of the front:
every custom property of the style sheets with its value, every class they
name, and every other file as a component of its own. With --run, the
direction the run's knockout chose, with its sentence. The rest of the
direction and the rules are left for AEOM to write.

aeom standard <draft.md> writes .aeom/standard.md. A draft that names a token,
a value or a component the code does not hold, still holds a placeholder, or
holds an image, is refused and nothing is written. What the user corrected in
the standard since AEOM last wrote it stays as they wrote it, and AEOM says
what it changed.`;

/** A path given on the command line, from the project's root, or null when it is outside the project. */
function fromRoot(path: string): string | null {
  let full = resolve(path);
  try {
    full = realpathSync(full);
  } catch {
    // A file that does not exist is said so once it is read.
  }
  const inside = relative(realpathSync(process.cwd()), full);
  return !inside || inside.startsWith("..") || isAbsolute(inside) ? null : inside.split(sep).join("/");
}

/** A file of the project by its path from the root, or null when there is none. */
function readProject(path: string): string | null {
  try {
    return readFileSync(join(process.cwd(), path), "utf8");
  } catch {
    return null;
  }
}

async function json<T>(file: string): Promise<T | null> {
  const text = await readIfThere(file);
  return text === undefined ? null : (JSON.parse(text) as T);
}

async function printDraft(paths: string[], runDir: string | undefined): Promise<number> {
  const files = [];
  for (const path of paths) {
    const inside = fromRoot(path);
    if (inside === null) {
      console.error(`${path} is outside the project: give the shared files of the front from the project's root, such as shared/kit.css.`);
      return 1;
    }
    const text = readProject(inside);
    if (text === null) {
      console.error(`Cannot read ${inside}: give the shared files of the front, such as the kit's style sheet and its partials.`);
      return 1;
    }
    files.push({ path: inside, text });
  }
  const sheet = await readIfThere(join(".aeom", "product.md"));
  const tournament = runDir ? await json<Tournament>(join(runDir, "directions", "tournament.json")) : null;
  const winner = tournament ? champion(tournament) : null;
  const notes = runDir ? ((await json<{ label: string; note?: string }[]>(join(runDir, "directions", "sheet.json"))) ?? []) : [];
  const direction = winner ? { champion: winner, sentence: notes.find((n) => n.label === winner)?.note ?? null } : null;
  process.stdout.write(draftStandard(files, { name: sheet === undefined ? undefined : productBrief(sheet).name, direction }));
  return 0;
}

export async function runStandard(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { draft: { type: "boolean" }, run: { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.draft && !values.help && positionals.length) return printDraft(positionals, values.run);
  if (values.help || values.draft || values.run || positionals.length !== 1) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }
  const draftFile = positionals[0]!;
  let draft: string;
  try {
    draft = await readFile(draftFile, "utf8");
  } catch (error) {
    console.error(`Cannot read the draft ${draftFile}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const problems = standardProblems(draft, readProject);
  if (problems.length) {
    console.error(`The draft is not a standard yet, so nothing was written:\n${problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }

  return updateSheet(STANDARD, (holder) => `Another aeom standard (process ${holder}) is writing the standard. Run again once it is done.`, async ({ sheet: current, base }) => {
    const merged = mergeStandard({ base, current, proposed: draft });
    const left = standardProblems(merged.text, readProject);
    if (left.length) {
      console.error(`With your corrections in .aeom/standard.md, the standard would not hold, so nothing was written:\n${left.map((p) => `  ${p}`).join("\n")}\nIn .aeom/standard.md, write each value as the code writes it, put back a heading you renamed, or take the line out, then run again.`);
      return 1;
    }
    return { text: merged.text, base: draft, after: () => say(merged, current === undefined, draft) };
  });
}

function say(merged: StandardMerge, first: boolean, draft: string): void {
  if (first) {
    const count = (part: string) => (draft.split(`\n## ${part}\n`)[1]?.split("\n## ")[0] ?? "").split("\n").filter((l) => /^[-*] `/.test(l)).length;
    console.log(`Wrote .aeom/standard.md: ${count("Tokens")} tokens and ${count("Components")} components, each where it lives in the code`);
    return;
  }
  console.log("Wrote .aeom/standard.md");
  if (merged.kept.length) console.log(`  Kept your edits: ${merged.kept.join(", ")}`);
  if (merged.updated.length) console.log(`  Updated: ${merged.updated.join(", ")}`);
  if (merged.added.length) console.log(`  Added: ${merged.added.join(", ")}`);
  if (merged.removed.length) console.log(`  Removed, no longer in the code: ${merged.removed.join(", ")}`);
  if (!merged.kept.length && !merged.updated.length && !merged.added.length && !merged.removed.length) console.log("  Nothing changed");
}
