import { access, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { blockedJourneys, type JourneyReport, type JudgeReport } from "@aeom/core";
import { latestRun } from "./report.js";

const FEATURES_HELP = `Usage: aeom features [run-dir] [--missing <journey>=<sentence>]...

Names what a key journey would need to reach its end, when it does not at the
end of the run (it breaks, its result is not shown, or it ends nowhere): at most
three, the journeys of the product sheet's main loop first. Nothing is built.
Each one gets a sentence saying what is missing, in the user's words, without a
technical solution; with one for each, they are kept in features.json, which
the result page (aeom report) shows apart. Exits with 2 when the journeys were
not all replayed and critiqued.

Options:
  --missing <journey>=<sentence>  What the blocked journey misses, by its slug or its name`;

/** The journeys of the product sheet, in its order: the main loop comes first. */
async function sheetOrder(): Promise<string[] | null> {
  const text = await readFile(join(".aeom", "product.md"), "utf8").catch(() => null);
  if (text === null) return null;
  const order: string[] = [];
  let inJourneys = false;
  for (const line of text.split("\n")) {
    if (/^## /.test(line)) inJourneys = line.trim() === "## Key journeys";
    else if (inJourneys && /^### /.test(line)) order.push(line.slice(4).trim());
  }
  return order;
}

export async function runFeatures(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { missing: { type: "string", multiple: true }, help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length > 1) {
    console.log(FEATURES_HELP);
    return values.help ? 0 : 1;
  }
  const runDir = positionals[0] ?? (await latestRun());
  if (!runDir || !(await stat(runDir).then((s) => s.isDirectory(), () => false))) {
    console.error(runDir ? `No run folder ${runDir}.` : `No run in .aeom/runs: run /aeom first.`);
    return 2;
  }
  const file = join(runDir, "features.json");
  // What an older pass named may no longer hold: it goes as soon as the journeys are looked at again.
  await rm(file, { force: true });
  const save = (data: unknown) => writeFile(file, JSON.stringify(data, null, 2) + "\n");

  const exists = (f: string) => access(f).then(() => true, () => false);
  const folder = (await exists(join(runDir, "journeys-end", "report.json"))) ? "journeys-end" : (await exists(join(runDir, "journeys-after", "report.json"))) ? "journeys-after" : null;
  if (!folder) {
    console.log(`No replay of the journeys in ${runDir}: no feature to name.`);
    await save({ entries: [], more: 0 });
    return 0;
  }
  const where = join(runDir, folder);
  let replay: JourneyReport, critique: JudgeReport;
  try {
    replay = JSON.parse(await readFile(join(where, "report.json"), "utf8"));
  } catch (error) {
    console.error(`${join(where, "report.json")} cannot be read: ${(error as Error).message}`);
    return 2;
  }
  try {
    critique = JSON.parse(await readFile(join(where, "judge-journeys.json"), "utf8"));
  } catch {
    console.error(`No critique of the journeys in ${where}: run aeom judge --journeys --captures ${where} --votes ${join(where, "votes")} --out ${where} after the journey judges, then aeom features again.`);
    return 2;
  }
  // A journey the critique left out could be blocked without anyone saying so.
  const unjudged = replay.journeys.filter((j) => !critique.pages?.some((p) => p.page === j.slug));
  if (unjudged.length) {
    console.error(`The critique in ${where} does not judge ${unjudged.map((j) => j.name).join(", ")}: judge every replayed journey, then aeom features again.`);
    return 2;
  }

  const order = await sheetOrder();
  if (order) for (const j of replay.journeys) if (!order.includes(j.name) && !order.includes(j.slug)) console.log(`${j.name} is not in .aeom/product.md: it comes after the journeys the sheet lists.`);
  const { entries, more } = blockedJourneys({ replay, critique, order: order ?? [] });
  const everyBlocked = blockedJourneys({ replay, critique, order: order ?? [], limit: Infinity }).entries;
  if (!entries.length) {
    console.log(`Every key journey reaches its end: no feature is missing.`);
    await save({ entries: [], more: 0 });
    return 0;
  }

  const missing = new Map<string, string>();
  for (const given of values.missing ?? []) {
    const at = given.indexOf("=");
    const key = given.slice(0, at).trim(), sentence = given.slice(at + 1).trim();
    if (at < 1 || !sentence) {
      console.error(`--missing takes <journey>=<sentence>, such as --missing "${entries[0]!.slug}=A way to ...".`);
      return 1;
    }
    const journey = replay.journeys.find((j) => j.slug === key || j.name === key);
    if (!journey) {
      console.error(`No journey ${key}: the blocked ones are ${entries.map((e) => e.slug).join(", ")}.`);
      return 1;
    }
    if (!everyBlocked.some((e) => e.slug === journey.slug)) {
      console.error(`${journey.name} reaches its end: name a feature only for a journey that cannot.`);
      return 1;
    }
    if (!entries.some((e) => e.slug === journey.slug)) {
      console.error(`${journey.name} is blocked, but not among the three named: the product sheet's main loop comes first.`);
      return 1;
    }
    if (missing.has(journey.slug)) {
      console.error(`Two sentences for ${journey.slug}: give each journey one.`);
      return 1;
    }
    missing.set(journey.slug, sentence);
  }
  const slugs = Math.max(...entries.map((e) => e.slug.length)) + 2;
  const names = Math.max(...entries.map((e) => e.name.length)) + 2;
  for (const e of entries) console.log(`${e.slug.padEnd(slugs)}${e.name.padEnd(names)}blocks at step ${e.step}: ${e.why}${missing.has(e.slug) ? `\n${"".padEnd(slugs + names)}missing: ${missing.get(e.slug)}` : ""}`);
  if (more) console.log(`${more} more blocked journey${more === 1 ? "" : "s"}, not named: three at most per run.`);
  const unsaid = entries.filter((e) => !missing.has(e.slug));
  if (unsaid.length) {
    console.error(`\nSay what each one misses, in one sentence and without a technical solution: ${unsaid.map((e) => `--missing "${e.slug}=<sentence>"`).join(" ")}`);
    return 1;
  }
  await save({ entries: entries.map((e) => ({ ...e, capture: e.capture ? `${folder}/${e.capture}` : null, missing: missing.get(e.slug)! })), more });
  console.log(`\nKept for the result page: ${file}`);
  return 0;
}
