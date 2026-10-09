import { access, readFile, writeFile } from "node:fs/promises";
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
the result page (aeom report) shows apart.

Options:
  --missing <journey>=<sentence>  What the blocked journey misses, by its slug`;

/** The journeys of the product sheet, in its order: the main loop comes first. */
async function sheetOrder(): Promise<string[]> {
  const text = await readFile(join(".aeom", "product.md"), "utf8").catch(() => "");
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
  if (!runDir) {
    console.error(`No run in .aeom/runs: run /aeom first.`);
    return 1;
  }
  const exists = (f: string) => access(f).then(() => true, () => false);
  const folder = (await exists(join(runDir, "journeys-end", "report.json"))) ? "journeys-end" : (await exists(join(runDir, "journeys-after", "report.json"))) ? "journeys-after" : null;
  const save = (data: unknown) => writeFile(join(runDir, "features.json"), JSON.stringify(data, null, 2) + "\n");
  if (!folder) {
    console.log(`No replay of the journeys in ${runDir}: no feature to name.`);
    await save({ entries: [], more: 0 });
    return 0;
  }
  const replay = JSON.parse(await readFile(join(runDir, folder, "report.json"), "utf8")) as JourneyReport;
  const critique = await readFile(join(runDir, folder, "judge-journeys.json"), "utf8").then((t) => JSON.parse(t) as JudgeReport, () => undefined);
  const { entries, more } = blockedJourneys({ replay, critique, order: await sheetOrder() });
  if (!entries.length) {
    console.log(`Every key journey reaches its end: no feature is missing.`);
    await save({ entries: [], more: 0 });
    return 0;
  }

  const missing = new Map<string, string>();
  for (const given of values.missing ?? []) {
    const at = given.indexOf("=");
    const slug = given.slice(0, at), sentence = given.slice(at + 1).trim();
    if (at < 1 || !sentence) {
      console.error(`--missing takes <journey>=<sentence>, such as --missing "${entries[0]!.slug}=A way to ...".`);
      return 1;
    }
    if (!entries.some((e) => e.slug === slug)) {
      const name = replay.journeys.find((j) => j.slug === slug)?.name ?? slug;
      console.error(`${name} is not blocked: name a feature only for a journey that cannot reach its end.`);
      return 1;
    }
    missing.set(slug, sentence);
  }
  const column = Math.max(...entries.map((e) => e.name.length)) + 2;
  for (const e of entries) console.log(`${e.name.padEnd(column)}blocks at step ${e.step}: ${e.why}${missing.has(e.slug) ? `\n${"".padEnd(column)}missing: ${missing.get(e.slug)}` : ""}`);
  if (more) console.log(`${more} more blocked journey${more === 1 ? "" : "s"}, not named: three at most per run.`);
  const unsaid = entries.filter((e) => !missing.has(e.slug));
  if (unsaid.length) {
    console.error(`\nSay what each one misses, in one sentence and without a technical solution: ${unsaid.map((e) => `--missing "${e.slug}=<sentence>"`).join(" ")}`);
    return 1;
  }
  await save({ entries: entries.map((e) => ({ ...e, capture: e.capture ? `${folder}/${e.capture}` : null, missing: missing.get(e.slug)! })), more });
  console.log(`\nKept for the result page: ${join(runDir, "features.json")}`);
  return 0;
}
