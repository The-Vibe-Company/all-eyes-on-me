import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { mergeProduct, productBrief, validateProduct, type ProductMerge } from "@aeom/core";
import { readIfThere, sheetFile, updateSheet } from "../sheet-file.js";

const PRODUCT = sheetFile("product");
const SHEET = PRODUCT.sheet;

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

  return updateSheet(PRODUCT, (holder) => `Another aeom product (process ${holder}) is writing the sheet. Run again once it is done.`, async ({ sheet: current, base }) => {
    const merged = mergeProduct({ base, current, proposed: draft });
    const left = validateProduct(merged.text);
    if (left.length) {
      console.error(`With the corrections in .aeom/product.md, the sheet would not be complete, so nothing was written:\n${left.map((p) => `  ${p}`).join("\n")}\nRestore what is missing in .aeom/product.md, keeping its headings as they are, and run again.`);
      return 1;
    }
    return { text: merged.text, base: draft, after: () => say(merged, current === undefined) };
  });
}

function say(merged: ProductMerge, first: boolean): void {
  if (first) {
    console.log(`Wrote .aeom/product.md, a first sheet with ${merged.added.filter((key) => key.startsWith("journey ")).length} key journeys`);
    return;
  }
  console.log("Wrote .aeom/product.md");
  if (merged.kept.length) console.log(`  Kept your edits: ${merged.kept.join(", ")}`);
  if (merged.updated.length) console.log(`  Updated: ${merged.updated.join(", ")}`);
  if (merged.added.length) console.log(`  Added: ${merged.added.join(", ")}`);
  if (merged.removed.length) console.log(`  Removed, no longer in AEOM's draft: ${merged.removed.join(", ")}`);
  if (!merged.kept.length && !merged.updated.length && !merged.added.length && !merged.removed.length) console.log("  Nothing changed");
}
