import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { mergeProduct, validateProduct } from "@aeom/core";

const SHEET = join(".aeom", "product.md");
/** What AEOM last proposed: it tells the user's corrections from AEOM's own words. */
const BASE = join(".aeom", "product.base.md");
/**
 * The new base while an update is in progress, with the fingerprint of the
 * sheet written with it. Left behind only if an update stopped halfway: the
 * next run finishes it or drops it, so the sheet and its base always match.
 */
const PENDING = join(".aeom", "product.pending.json");

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

const fingerprint = (text: string | undefined) => createHash("sha256").update(text ?? "").digest("hex");

/**
 * Writes to a new file of its own next to the target, then renames it over the
 * target: a reader never sees half a file, two runs never share a temporary
 * file, and nothing already at the temporary path is followed or overwritten.
 */
async function writeWhole(file: string, text: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, { flag: "wx" });
  try {
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Finishes an update that stopped between the sheet and its base, or drops it if the sheet was never written. */
async function recover(): Promise<void> {
  const pending = await readIfThere(PENDING);
  if (pending === undefined) return;
  const { base, sheet } = JSON.parse(pending) as { base: string; sheet: string };
  if (fingerprint(await readIfThere(SHEET)) === sheet) await writeWhole(BASE, base);
  await rm(PENDING, { force: true });
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

  await mkdir(".aeom", { recursive: true });
  await recover();
  const current = await readIfThere(SHEET);
  const merged = mergeProduct({ base: await readIfThere(BASE), current, proposed: draft });
  const left = validateProduct(merged.text);
  if (left.length) {
    console.error(`With the corrections in .aeom/product.md, the sheet would not be complete, so nothing was written:\n${left.map((p) => `  ${p}`).join("\n")}\nRestore what is missing in .aeom/product.md, keeping its headings as they are, and run again.`);
    return 1;
  }

  await writeWhole(PENDING, JSON.stringify({ base: draft, sheet: fingerprint(merged.text) }));
  await writeWhole(SHEET, merged.text);
  await writeWhole(BASE, draft);
  await rm(PENDING, { force: true });

  if (current === undefined) {
    console.log(`Wrote .aeom/product.md, a first sheet with ${merged.added.filter((key) => key.startsWith("journey ")).length} key journeys`);
    return 0;
  }
  console.log("Wrote .aeom/product.md");
  if (merged.kept.length) console.log(`  Kept your edits: ${merged.kept.join(", ")}`);
  if (merged.updated.length) console.log(`  Updated: ${merged.updated.join(", ")}`);
  if (merged.added.length) console.log(`  Added: ${merged.added.join(", ")}`);
  if (merged.removed.length) console.log(`  Removed, no longer in AEOM's draft: ${merged.removed.join(", ")}`);
  if (!merged.kept.length && !merged.updated.length && !merged.added.length && !merged.removed.length) console.log("  Nothing changed");
  return 0;
}
