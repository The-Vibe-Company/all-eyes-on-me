import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ConfigError, loadConfig, mergeProduct, PARTS, platformOf, PLATFORMS, productBrief, validateProduct, withPlatform, type Platform } from "@aeom/core";
import { readIfThere, sayMerge, sheetFile, updateSheet } from "../sheet-file.js";

const PRODUCT = sheetFile("product");
const SHEET = PRODUCT.sheet;

const USAGE = `Usage: aeom product <draft.md>
       aeom product --brief
       aeom product --widths
       aeom product --used-on <mobile|desktop|both> --by <name>

Writes the product sheet AEOM drafted to .aeom/product.md: what kind of
product the app is (a tool, a game or a creative product), what it is for, who
uses it, its main loop and three to five key journeys, and for a game or a
creative product its world. A draft that misses any of it is refused and
nothing is written. What the user corrected in the sheet since AEOM last wrote
it stays as they wrote it.

With --brief, prints what the art directions start from: what kind of product
the app is, what it is for, who uses it and its main loop, and for a game or a
creative product its genre and fiction, the feeling it aims for, its
references and its visual assets, without their sources. It names what the
sheet marks (to confirm) or gives no source for, which no direction may rest
on.
Exits with 1 when a part is missing or nothing is confirmed.

With --widths, says the widths the front is judged at and where they come
from: "widths" in .aeom/config.json, or where the sheet saw the front is used
(390 on mobile, 1280 on desktop, both). Exits with 2 when only the user can
say: no sheet, or a sheet that only guesses.

With --used-on, records the user's answer in the sheet, as their own
correction, which every later run keeps.`;

async function printWidths(): Promise<number> {
  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    return 1;
  }
  if (config.widths) {
    console.log(`Widths: ${config.widths.join(",")}. From "widths" in .aeom/config.json.`);
    return 0;
  }
  const sheet = await readIfThere(SHEET);
  const used = sheet === undefined ? null : platformOf(sheet);
  if (used?.seen) {
    console.log(`Widths: ${used.widths.join(",")}. The front is used on ${used.platform} (seen: ${used.source}).`);
    return 0;
  }
  const why = sheet === undefined ? "there is no product sheet" : used ? `the sheet guesses ${used.platform} (to confirm)` : `the sheet does not say where the front is used`;
  console.log(`Not known: ${why}. Ask the user whether the front is used on mobile, desktop or both, then record it: aeom product --used-on <mobile|desktop|both> --by <their name>. Until then, 390,1280.`);
  return 2;
}

async function recordUsedOn(platform: string, by: string | undefined): Promise<number> {
  if (!(PLATFORMS as readonly string[]).includes(platform)) {
    console.error(`--used-on is mobile, desktop or both.`);
    return 1;
  }
  if (!by?.trim()) {
    console.error(`--by names who answered, such as --by Antoine: the sheet says whose word it is.`);
    return 1;
  }
  return updateSheet(PRODUCT, (holder) => `Another aeom product (process ${holder}) is writing the sheet. Run again once it is done.`, async ({ sheet: current, base }) => {
    if (current === undefined) {
      console.error(`No product sheet in ${SHEET}: write it first, with aeom product <draft>.`);
      return 1;
    }
    // AEOM's last draft stays the base: the answer reads as the user's correction, and every later merge keeps it.
    return { text: withPlatform(current, platform as Platform, by.trim()), base: base ?? current, after: () => console.log(`${SHEET} says the front is used on ${platform}, as ${by.trim()} said.`) };
  });
}

async function printBrief(): Promise<number> {
  const sheet = await readIfThere(SHEET);
  if (sheet === undefined) {
    console.error(`No product sheet in ${SHEET}: run /aeom, which writes it before the directions.`);
    return 1;
  }
  const { name, kind, parts, unconfirmed, missing } = productBrief(sheet);
  if (missing.length) {
    console.error(`${SHEET} has no ${missing.map((m) => `"${m}"`).join(", ")}: put the heading back as it was, or write the part, then run aeom product --brief again.`);
    return 1;
  }
  if (!parts.some((p) => (PARTS as readonly string[]).includes(p.part))) {
    console.error(`Nothing in ${SHEET} is confirmed: what the app is for, who uses it and its loop are all marked (to confirm) or have no source. Look at the app again (read its code, capture its screens) and write what you saw, with its source.`);
    return 1;
  }
  const said = kind === "game" || kind === "creative" ? `${kind}: the directions start from its world, its visual assets and its genre's interface, not from the real things it names` : kind ?? "not said: the sheet was written before AEOM said it, so it reads as a tool's. Draft the sheet again and write it with aeom product, so it says the kind first.";
  console.log(`${name ? `${name}\n` : ""}Kind: ${said}\n\n${parts.map((p) => `${p.part}: ${p.text}`).join("\n")}`);
  if (unconfirmed.length) console.log(`\nLeft out, to confirm:\n${unconfirmed.map((u) => `- ${u}`).join("\n")}`);
  return 0;
}

export async function runProduct(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { brief: { type: "boolean" }, widths: { type: "boolean" }, "used-on": { type: "string" }, by: { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.brief && !values.help && positionals.length === 0) return printBrief();
  if (values.widths && !values.help && positionals.length === 0) return printWidths();
  if (values["used-on"] !== undefined && !values.help && positionals.length === 0) return recordUsedOn(values["used-on"], values.by);
  if (values.help || values.brief || values.widths || values["used-on"] !== undefined || positionals.length !== 1) {
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
    const journeys = merged.added.filter((key) => key.startsWith("journey ")).length;
    return { text: merged.text, base: draft, after: () => (current === undefined ? console.log(`Wrote .aeom/product.md, a first sheet with ${journeys} key journeys`) : sayMerge(".aeom/product.md", merged, "no longer in AEOM's draft")) };
  });
}
