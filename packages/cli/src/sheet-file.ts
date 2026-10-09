import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SheetMerge } from "@aeom/core";

/**
 * A file AEOM writes for the user to correct, such as the product sheet: the
 * file itself, AEOM's last draft next to it, which tells the user's
 * corrections from AEOM's own words, and what keeps two writers apart.
 */
export interface SheetFile {
  /** What the user reads and corrects, such as `.aeom/product.md`. */
  sheet: string;
  /** What AEOM last proposed. */
  base: string;
  /**
   * The new base while an update is in progress, with the fingerprint of the
   * file written with it. Left behind only if an update stopped halfway: the
   * next run finishes it or drops it, so the file and its base always match.
   */
  pending: string;
  /** Held while a run reads and writes the file, so two runs never interleave. */
  lock: string;
}

export const sheetFile = (name: string): SheetFile => ({
  sheet: join(".aeom", `${name}.md`),
  base: join(".aeom", `${name}.base.md`),
  pending: join(".aeom", `${name}.pending.json`),
  lock: join(".aeom", `${name}.lock`),
});

export async function readIfThere(file: string): Promise<string | undefined> {
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
async function lock(file: SheetFile, busy: (holder: number) => string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(file.lock, String(process.pid), { flag: "wx" });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const holder = Number(await readIfThere(file.lock));
      let alive = false;
      try {
        alive = Number.isInteger(holder) && holder > 0 && process.kill(holder, 0);
      } catch {
        alive = false;
      }
      if (alive) {
        console.error(busy(holder));
        return false;
      }
      await rm(file.lock, { force: true });
    }
  }
  return false;
}

/** Finishes an update that stopped between the file and its base, or drops it if the file was never written. */
async function recover(file: SheetFile): Promise<void> {
  const pending = await readIfThere(file.pending);
  if (pending === undefined) return;
  const { base, sheet } = JSON.parse(pending) as { base: string; sheet: string };
  if (fingerprint(await readIfThere(file.sheet)) === sheet) await writeWhole(file.base, base);
  await rm(file.pending, { force: true });
}

/**
 * Runs `update` alone on the file, once any update left halfway is finished.
 * `update` reads the file and its base and returns what to write and what to
 * say once it is written, or an exit code when nothing is written.
 */
export async function updateSheet(
  file: SheetFile,
  busy: (holder: number) => string,
  update: (current: { sheet?: string; base?: string }) => Promise<{ text: string; base: string; after: () => void } | number>,
): Promise<number> {
  await mkdir(".aeom", { recursive: true });
  if (!(await lock(file, busy))) return 1;
  try {
    await recover(file);
    const next = await update({ sheet: await readIfThere(file.sheet), base: await readIfThere(file.base) });
    if (typeof next === "number") return next;
    await writeWhole(file.pending, JSON.stringify({ base: next.base, sheet: fingerprint(next.text) }));
    await writeWhole(file.sheet, next.text);
    await writeWhole(file.base, next.base);
    await rm(file.pending, { force: true });
    next.after();
    return 0;
  } finally {
    await rm(file.lock, { force: true });
  }
}

/** Says what a merge kept of the user's edits and what it changed; `gone` says why AEOM removed what it removed. */
export function sayMerge(file: string, merged: SheetMerge, gone: string): void {
  console.log(`Wrote ${file}`);
  if (merged.kept.length) console.log(`  Kept your edits: ${merged.kept.join(", ")}`);
  if (merged.updated.length) console.log(`  Updated: ${merged.updated.join(", ")}`);
  if (merged.added.length) console.log(`  Added: ${merged.added.join(", ")}`);
  if (merged.removed.length) console.log(`  Removed, ${gone}: ${merged.removed.join(", ")}`);
  if (!merged.kept.length && !merged.updated.length && !merged.added.length && !merged.removed.length) console.log("  Nothing changed");
}
