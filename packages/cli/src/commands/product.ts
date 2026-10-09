import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { mergeProduct, productBrief, validateProduct } from "@aeom/core";

const SHEET = join(".aeom", "product.md");
/** What AEOM last proposed: it tells the user's corrections from AEOM's own words. */
const BASE = join(".aeom", "product.base.md");
/**
 * The new base while an update is in progress, with the fingerprint of the
 * sheet written with it. Left behind only if an update stopped halfway: the
 * next run finishes it or drops it, so the sheet and its base always match.
 */
const PENDING = join(".aeom", "product.pending.json");
/** Held while a run reads and writes the sheet, so two runs never interleave. */
const LOCK = join(".aeom", "product.lock");

const USAGE = `Usage: aeom product <draft.md>
       aeom product --brief

Writes the product sheet AEOM drafted to .aeom/product.md: what the app is for,
who uses it, its main loop and three to five key journeys. A draft that misses
any of it is refused and nothing is written. What the user corrected in the
sheet since AEOM last wrote it stays as they wrote it.

With --brief, prints what the art directions start from: what the app is for,
who uses it and its main loop, without their sources, and names what the sheet
marks (to confirm) or gives no source for, which no direction may rest on.
Exits with 1 when a part is missing or nothing is confirmed.`;

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

/** Takes the lock, or says who holds it. A lock left by a process that no longer runs is taken over. */
async function lock(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(LOCK, String(process.pid), { flag: "wx" });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const holder = Number(await readIfThere(LOCK));
      let alive = false;
      try {
        alive = Number.isInteger(holder) && holder > 0 && process.kill(holder, 0);
      } catch {
        alive = false;
      }
      if (alive) {
        console.error(`Another aeom product (process ${holder}) is writing the sheet. Run again once it is done.`);
        return false;
      }
      await rm(LOCK, { force: true });
    }
  }
  return false;
}

/** Finishes an update that stopped between the sheet and its base, or drops it if the sheet was never written. */
async function recover(): Promise<void> {
  const pending = await readIfThere(PENDING);
  if (pending === undefined) return;
  const { base, sheet } = JSON.parse(pending) as { base: string; sheet: string };
  if (fingerprint(await readIfThere(SHEET)) === sheet) await writeWhole(BASE, base);
  await rm(PENDING, { force: true });
}

async function printBrief(): Promise<number> {
  const sheet = await readIfThere(SHEET);
  if (sheet === undefined) {
    console.error(`No product sheet in ${SHEET}: run /aeom, which writes it before the directions.`);
    return 1;
  }
  const { name, parts, unconfirmed, missing } = productBrief(sheet);
  if (missing.length) {
    console.error(`${SHEET} has no ${missing.map((m) => `"${m}"`).join(", ")}: put the heading back as it was, or write the part, then run aeom product --brief again.`);
    return 1;
  }
  if (!parts.length) {
    console.error(`Nothing in ${SHEET} is confirmed: what the app is for, who uses it and its loop are all marked (to confirm) or have no source. Look at the app again (read its code, capture its screens) and write what you saw, with its source.`);
    return 1;
  }
  console.log(`${name ? `${name}\n\n` : ""}${parts.map((p) => `${p.part}: ${p.text}`).join("\n")}`);
  if (unconfirmed.length) console.log(`\nLeft out, to confirm:\n${unconfirmed.map((u) => `- ${u}`).join("\n")}`);
  return 0;
}

export async function runProduct(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { brief: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.brief && !values.help && positionals.length === 0) return printBrief();
  if (values.help || values.brief || positionals.length !== 1) {
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
  if (!(await lock())) return 1;
  try {
    return await update(draft);
  } finally {
    await rm(LOCK, { force: true });
  }
}

async function update(draft: string): Promise<number> {
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
