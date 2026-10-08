import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { mergeProduct, validateProduct } from "@aeom/core";

const SHEET = join(".aeom", "product.md");
/** What AEOM last proposed: it tells the user's corrections from AEOM's own words. */
const BASE = join(".aeom", "product.base.md");

const USAGE = `Usage: aeom product <draft.md>

Writes the product sheet AEOM drafted to .aeom/product.md: what the app is for,
who uses it, its main loop and three to five key journeys. A draft that misses
any of it is refused and nothing is written. What the user corrected in the
sheet since AEOM last wrote it stays as they wrote it.`;

async function readIfThere(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Writes next to the file, then renames, so a reader never sees half of it. */
async function writeWhole(file: string, text: string): Promise<void> {
  await writeFile(`${file}.tmp`, text);
  await rename(`${file}.tmp`, file);
}

export async function runProduct(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length !== 1) {
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
  const problems = validateProduct(draft);
  if (problems.length) {
    console.error(`The draft is not a product sheet yet, so nothing was written:\n${problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }

  const current = await readIfThere(SHEET);
  const merged = mergeProduct({ base: await readIfThere(BASE), current, proposed: draft });
  await mkdir(".aeom", { recursive: true });
  await writeWhole(SHEET, merged.text);
  await writeWhole(BASE, draft);

  if (current === undefined) {
    console.log(`Wrote .aeom/product.md, a first sheet with ${merged.added.filter((key) => key.startsWith("journey ")).length} key journeys`);
    return 0;
  }
  console.log("Wrote .aeom/product.md");
  if (merged.kept.length) console.log(`  Kept your edits: ${merged.kept.join(", ")}`);
  if (merged.updated.length) console.log(`  Updated: ${merged.updated.join(", ")}`);
  if (merged.added.length) console.log(`  Added: ${merged.added.join(", ")}`);
  if (!merged.kept.length && !merged.updated.length && !merged.added.length) console.log("  Nothing changed");
  return 0;
}
