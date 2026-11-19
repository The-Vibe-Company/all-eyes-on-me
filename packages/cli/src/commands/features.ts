import { access, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { blockedJourneys, buildCommand, type JourneyReport, type JudgeReport } from "@aeom/core";
import { latestRun } from "./report.js";

const FEATURES_HELP = `Usage: aeom features [run-dir] [--missing <journey>=<sentence>]... [--front <journey>]... [--back <journey>=<sentence>]...

Names what a key journey would need to reach its end, when it does not at the
end of the run (it breaks, its result is not shown, or it ends nowhere): at most
three, the journeys of the product sheet's main loop first. Nothing is built.
Each one gets a sentence saying what is missing, in the user's words, without a
technical solution, and whether the front alone builds it or the back too; with
both for each, they are kept in features.json, which the result page (aeom
report) shows apart, a feature of the front with the command that builds it on
demand. Exits with 2 when the journeys were not all replayed and critiqued.

Options:
  --missing <journey>=<sentence>  What the blocked journey misses, by its slug or its name
  --front <journey>               The front alone builds it: a state, a result screen,
                                  a message, on data the front already has
  --back <journey>=<sentence>     It needs the back too (new data, a call to a server,
                                  business logic): what the back would have to provide`;

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
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { missing: { type: "string", multiple: true }, front: { type: "string", multiple: true }, back: { type: "string", multiple: true }, help: { type: "boolean", short: "h" } } });
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

  // A journey named by its slug or its name, blocked and among the three named: the same checks for every option.
  const blockedOne = (key: string): { slug: string } | string => {
    const journey = replay.journeys.find((j) => j.slug === key || j.name === key);
    if (!journey) return `No journey ${key}: the blocked ones are ${entries.map((e) => e.slug).join(", ")}.`;
    if (!everyBlocked.some((e) => e.slug === journey.slug)) return `${journey.name} reaches its end: name a feature only for a journey that cannot.`;
    if (!entries.some((e) => e.slug === journey.slug)) return `${journey.name} is blocked, but not among the three named: the product sheet's main loop comes first.`;
    return journey;
  };
  const missing = new Map<string, string>();
  for (const given of values.missing ?? []) {
    const at = given.indexOf("=");
    const key = given.slice(0, at).trim(), sentence = given.slice(at + 1).trim();
    if (at < 1 || !sentence) {
      console.error(`--missing takes <journey>=<sentence>, such as --missing "${entries[0]!.slug}=A way to ...".`);
      return 1;
    }
    const journey = blockedOne(key);
    if (typeof journey === "string") {
      console.error(journey);
      return 1;
    }
    if (missing.has(journey.slug)) {
      console.error(`Two sentences for ${journey.slug}: give each journey one.`);
      return 1;
    }
    missing.set(journey.slug, sentence);
  }
  // Front alone, or the back too: each named one says which, and only one.
  const needs = new Map<string, { needs: "front" } | { needs: "back"; back: string }>();
  const nameOf = (slug: string) => entries.find((e) => e.slug === slug)!.name;
  const said = (slug: string, need: { needs: "front" } | { needs: "back"; back: string }) => {
    if (needs.has(slug)) return `${nameOf(slug)} needs the front alone or the back too, not both: say it once.`;
    needs.set(slug, need);
    return null;
  };
  for (const key of values.front ?? []) {
    const journey = blockedOne(key.trim());
    const wrong = typeof journey === "string" ? journey : said(journey.slug, { needs: "front" });
    if (wrong) {
      console.error(wrong);
      return 1;
    }
  }
  for (const given of values.back ?? []) {
    const at = given.indexOf("=");
    const key = given.slice(0, at).trim(), back = given.slice(at + 1).trim();
    if (at < 1 || !back) {
      console.error(`--back takes <journey>=<what the back would have to provide>, such as --back "${entries[0]!.slug}=A route that keeps the order".`);
      return 1;
    }
    const journey = blockedOne(key);
    const wrong = typeof journey === "string" ? journey : said(journey.slug, { needs: "back", back });
    if (wrong) {
      console.error(wrong);
      return 1;
    }
  }
  const slugs = Math.max(...entries.map((e) => e.slug.length)) + 2;
  const names = Math.max(...entries.map((e) => e.name.length)) + 2;
  const needLine = (slug: string) => {
    const need = needs.get(slug);
    if (!need || !missing.has(slug)) return "";
    return `\n${"".padEnd(slugs + names)}${need.needs === "front" ? `front alone: ${buildCommand({ slug, missing: missing.get(slug)! })}` : `the back too: ${need.back}`}`;
  };
  for (const e of entries) console.log(`${e.slug.padEnd(slugs)}${e.name.padEnd(names)}blocks at step ${e.step}: ${e.why}${missing.has(e.slug) ? `\n${"".padEnd(slugs + names)}missing: ${missing.get(e.slug)}` : ""}${needLine(e.slug)}`);
  if (more) console.log(`${more} more blocked journey${more === 1 ? "" : "s"}, not named: three at most per run.`);
  const unsaid = entries.filter((e) => !missing.has(e.slug));
  if (unsaid.length) {
    console.error(`\nSay what each one misses, in one sentence and without a technical solution: ${unsaid.map((e) => `--missing "${e.slug}=<sentence>"`).join(" ")}`);
    return 1;
  }
  const unsorted = entries.filter((e) => !needs.has(e.slug));
  if (unsorted.length) {
    console.error(`\nSay for each whether the front alone builds it (a state, a result screen, a message, on data the front already has): ${unsorted.map((e) => `--front ${e.slug}`).join(" ")}; or whether it needs the back too (new data, a call to a server, business logic): ${unsorted.map((e) => `--back "${e.slug}=<what the back would have to provide>"`).join(" ")}, in the same call as the --missing sentences.`);
    return 1;
  }
  await save({ entries: entries.map((e) => ({ ...e, capture: e.capture ? `${folder}/${e.capture}` : null, missing: missing.get(e.slug)!, ...needs.get(e.slug)! })), more });
  console.log(`\nKept for the result page: ${file}`);
  return 0;
}
