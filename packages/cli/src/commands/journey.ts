import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { ConfigError, JourneyError, loadConfig, loadJourneys, planJourneyWave, replayJourneys, type JourneyReport } from "@aeom/core";
import { APP_OPTIONS, APP_OPTIONS_HELP, parseWidths, plural, signInFromConfig, withApp, withConfig } from "./app.js";

export const JOURNEY_HELP = `Usage: aeom journey [--url <url>] [--start "<command>"] [options]

Replays each key journey in a browser, step by step, at every width, and
captures the screen after each step. Exits with 1 when a journey breaks.

Options:
${APP_OPTIONS_HELP}
  --journeys <dir>     Where the journeys are, one .json file each (default .aeom/journeys)
  --out <dir>          Where to write the captures, sheets and report.json
                       (default .aeom/captures/journeys)
  --reset "<command>"  Put the app's data back as it was before each journey
                       (default: reset in .aeom/config.json)
  --plan               Replay nothing: from the last replay in --out, say which
                       screens several journeys cross (one worker, first) and
                       which belong to one journey (its own worker)`;

export async function runJourney(argv: string[]): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    options: { ...APP_OPTIONS, journeys: { type: "string", default: ".aeom/journeys" }, out: { type: "string", default: ".aeom/captures/journeys" }, reset: { type: "string" }, plan: { type: "boolean" } },
  }).values;
  if (parsed.help) {
    console.log(JOURNEY_HELP);
    return 0;
  }
  if (parsed.plan) return printPlan(parsed.out);
  if (parsed.url !== undefined && !parsed.url.trim()) {
    console.error(`--url cannot be empty.`);
    return 1;
  }
  const values = await withConfig(parsed);
  if (!values.url) {
    console.error(`--url is required, here or in .aeom/config.json.\n\n${JOURNEY_HELP}`);
    return 1;
  }
  const widths = parseWidths(values.widths);
  if (typeof widths === "string") {
    console.error(widths);
    return 1;
  }
  let journeys;
  try {
    journeys = await loadJourneys(values.journeys);
  } catch (error) {
    if (!(error instanceof JourneyError)) throw error;
    console.error(`These journeys cannot be replayed:\n${error.problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }
  let reset = values.reset;
  if (reset === undefined) {
    try {
      reset = (await loadConfig()).reset;
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      console.error(error.message);
      return 1;
    }
  }
  const url = values.url;

  return withApp({ ...values, url }, async () => {
    const session = await signInFromConfig(url);
    if (session === "failed") return 1;
    const report = await replayJourneys({ url, journeys, outDir: values.out, widths, ...(reset ? { reset } : {}), ...(session ?? {}) });
    const out = relative(process.cwd(), values.out) || ".";
    const column = Math.max(...report.journeys.map((j) => j.name.length)) + 2;
    let broken = 0;
    console.log("");
    for (const journey of report.journeys) {
      for (const run of journey.runs) {
        const head = `${run.broken ? "✗" : "✓"} ${journey.name.padEnd(column)}${`${run.width} px`.padEnd(9)}`;
        if (run.broken) {
          broken++;
          const step = run.steps[run.broken.step - 1]!;
          console.log(`${head}breaks at step ${run.broken.step}, ${step.action}: ${run.broken.reason}`);
        } else {
          console.log(`${head}${plural(run.counts.steps, "step")}, ${plural(run.counts.screens, "screen")}, ${run.counts.back} back`);
        }
        console.log(`  ${" ".repeat(column)}${" ".repeat(9)}${out}/${run.sheet}`);
      }
    }
    for (const warning of report.warnings) console.log(`\n${warning}`);
    console.log(`\nReport: ${out}/report.json`);
    if (broken) console.log(`${plural(broken, "replay")} broke.`);
    return broken ? 1 : 0;
  });
}

/** Prints who rebuilds which screens, from the last replay. */
async function printPlan(out: string): Promise<number> {
  let report: JourneyReport;
  try {
    report = JSON.parse(await readFile(join(out, "report.json"), "utf8"));
  } catch {
    console.error(`No replayed journeys in ${out}. Run aeom journey first.`);
    return 1;
  }
  const wave = planJourneyWave(report);
  console.log(`Shared, one worker first, with the navigation: ${wave.shared.join(", ") || "no screen"}`);
  for (const journey of report.journeys) console.log(`${journey.name}: ${wave.own[journey.slug]!.join(", ") || "no screen of its own"}`);
  return 0;
}
