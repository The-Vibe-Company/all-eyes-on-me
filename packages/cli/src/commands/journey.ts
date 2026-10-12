import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ConfigError, JourneyError, journeyFindingsByPage, loadConfig, loadJourneys, planJourneyWave, ReplayError, replayJourneys, type JourneyReport, type JudgeReport } from "@aeom/core";
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
                       which belong to one journey (its own worker)
  --by-page            Replay nothing: from the last replay in --out and the
                       critique, say page by page what the journeys break or
                       fail there, for the worker of that page
  --critique <file>    The critique of the journeys, for --by-page
                       (default .aeom/reports/judge-journeys.json)
  --json               With --by-page, write it as JSON`;

export async function runJourney(argv: string[]): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    options: { ...APP_OPTIONS, journeys: { type: "string", default: ".aeom/journeys" }, out: { type: "string", default: ".aeom/captures/journeys" }, reset: { type: "string" }, plan: { type: "boolean" }, "by-page": { type: "boolean" }, critique: { type: "string", default: ".aeom/reports/judge-journeys.json" }, json: { type: "boolean" } },
  }).values;
  if (parsed.help) {
    console.log(JOURNEY_HELP);
    return 0;
  }
  if (parsed.url !== undefined && !parsed.url.trim()) {
    console.error(`--url cannot be empty.`);
    return 1;
  }
  if (!parsed.out.trim()) {
    console.error(`--out cannot be empty.`);
    return 1;
  }
  if (parsed.plan && parsed["by-page"]) {
    console.error(`--plan and --by-page are two answers: ask for one.`);
    return 1;
  }
  if (parsed.plan) return printPlan(parsed.out);
  if (parsed["by-page"]) return printByPage(parsed.out, parsed.critique, Boolean(parsed.json));
  if (parsed.reset !== undefined && !parsed.reset.trim()) {
    console.error(`--reset cannot be empty: give the command that puts the app's data back, or leave the option out.`);
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
    // A saved session cannot be renewed: a reset that ends sessions leaves the next journeys signed out.
    if (reset && session?.kind === "state") console.log(`With a reset, a saved session may end before the next journey: if the journeys land signed out, give "login" a "script" that prints a new one.`);
    let report: JourneyReport;
    try {
      report = await replayJourneys({ url, journeys, outDir: values.out, widths, ...(reset ? { reset } : {}), ...(session ?? {}) });
    } catch (error) {
      if (!(error instanceof ReplayError)) throw error;
      console.error(error.message);
      return 1;
    }
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
  // The plan reads each journey's slug, name and the screens of each replay: anything else is not a replay to plan from.
  const r = report as Partial<JourneyReport> | null;
  const planned =
    Array.isArray(r?.journeys) &&
    r.journeys.length > 0 &&
    r.journeys.every((j) => typeof j?.slug === "string" && typeof j.name === "string" && Array.isArray(j.runs) && j.runs.every((run) => Array.isArray(run?.screens) && run.screens.every((s) => typeof s === "string")));
  if (!planned) {
    console.error(`${join(out, "report.json")} is not a replay of aeom journey to plan from. Run aeom journey again.`);
    return 1;
  }
  const wave = planJourneyWave(report);
  console.log(`Shared, one worker first, with the navigation: ${wave.shared.join(", ") || "no screen"}`);
  // The slug names the journey's file: two journeys can share a name, never a file.
  for (const journey of report.journeys) console.log(`${journey.name} (${journey.slug}): ${wave.own[journey.slug]!.join(", ") || "no screen of its own"}`);
  return 0;
}

/** Prints, page by page, what the journeys break or fail there, from the last replay and its critique. */
async function printByPage(out: string, critiqueFile: string, json: boolean): Promise<number> {
  let replay: JourneyReport;
  try {
    replay = JSON.parse(await readFile(join(out, "report.json"), "utf8"));
  } catch {
    console.error(`No replayed journeys in ${out}. Run aeom journey first.`);
    return 1;
  }
  // Each journey's slug and name, and each run's steps and screens: what the pages are read from.
  const r = replay as Partial<JourneyReport> | null;
  const readable =
    Array.isArray(r?.journeys) &&
    r.journeys.length > 0 &&
    r.journeys.every((j) => typeof j?.slug === "string" && typeof j.name === "string" && Array.isArray(j.runs) && j.runs.every((run) => Array.isArray(run?.steps) && Array.isArray(run.screens)));
  if (!readable) {
    console.error(`${join(out, "report.json")} is not a replay of aeom journey to read the pages from. Run aeom journey again.`);
    return 1;
  }
  let critique: JudgeReport | undefined;
  let missing = `No critique of the journeys in ${critiqueFile}: only where they break.`;
  try {
    const read = JSON.parse(await readFile(critiqueFile, "utf8")) as Partial<JudgeReport> | null;
    const pages = Array.isArray(read?.pages) ? read.pages.filter((p) => typeof p?.page === "string" && Array.isArray(p.verdicts)) : [];
    // The page judge's report, or the critique of other journeys, judges none of these.
    if (pages.some((p) => replay.journeys.some((j) => j.slug === p.page))) critique = { ...(read as JudgeReport), pages };
    else missing = `${critiqueFile} judges none of these journeys: only where they break.`;
  } catch {
    critique = undefined;
  }
  // Each capture as a path the worker can open, wherever it runs from.
  const pages = journeyFindingsByPage({ replay, critique }).map((p) => ({ ...p, findings: p.findings.map((f) => (f.capture ? { ...f, capture: resolve(out, f.capture) } : f)) }));
  if (json) {
    // The JSON is the answer; what it leaves out is said apart, so the coordinator can tell no critique from nothing failing.
    if (!critique) console.error(missing);
    console.log(JSON.stringify(pages, null, 2));
    return 0;
  }
  if (!critique) console.log(missing);
  if (!pages.length) console.log("No journey breaks or fails on any page.");
  for (const { page, findings } of pages) {
    console.log(page);
    for (const f of findings) console.log(`  ${f.name}${f.step ? `, step ${f.step}` : ""}${f.principle ? `, ${f.principle}` : ""}: ${f.reason}${f.capture ? `\n    ${f.capture}` : ""}`);
  }
  return 0;
}
