import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, verdictOf, type CheckReport, type JourneyReport, type JudgeReport } from "@aeom/core";

export const VERDICT_HELP = `Usage: aeom verdict [options]

Says whether the front needs redoing, from what AEOM last measured: the
checks and the judge on every screen and, when the project has key journeys,
their replay and their critique. Exits with 0 when nothing fails, 1 when
something does, and 2 when it cannot decide: a report missing or unreadable,
or a screen or journey one report has and another leaves out. When something
fails, its last line says what comes next: six new art directions, or, with
--keep-style or "style": "keep" in .aeom/config.json, the kit wave on the
existing style.

Options:
  --reports <dir>   check.json, judge.json and judge-journeys.json (default .aeom/reports)
  --journeys <dir>  The key journeys, one file each (default .aeom/journeys)
  --captures <dir>  The last replay of the journeys (default .aeom/captures/journeys)
  --keep-style      Keep the existing style, such as a brand charter: no new direction`;

const isList = (value: unknown) => Array.isArray(value);
const isJudge = (r: Partial<JudgeReport> | null) => !!r && isList(r.principles) && isList(r.pages) && r.pages!.every((p) => typeof p?.page === "string" && isList(p.verdicts));
const SHAPES: Record<string, (report: unknown) => boolean> = {
  check: (report) => {
    const r = report as Partial<CheckReport> | null;
    return !!r && isList(r.pages) && isList(r.errors) && isList(r.findings) && isList(r.widths) && isList(r.checks);
  },
  judge: (report) => isJudge(report as Partial<JudgeReport> | null),
  replay: (report) => {
    const r = report as Partial<JourneyReport> | null;
    return !!r && isList(r.journeys) && r.journeys!.every((j) => typeof j?.slug === "string" && typeof j.name === "string" && isList(j.runs));
  },
};

/** Reads a report, or says why it cannot: missing, not JSON, or not the report it should be. */
async function read<T>(file: string, shape: keyof typeof SHAPES, problems: string[]): Promise<T | undefined> {
  let report: unknown;
  try {
    report = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    problems.push((error as NodeJS.ErrnoException).code === "ENOENT" ? `${file} is missing` : `${file} cannot be read`);
    return undefined;
  }
  if (!SHAPES[shape]!(report)) {
    problems.push(`${file} is not a report of ${shape === "replay" ? "aeom journey" : `aeom ${shape}`}`);
    return undefined;
  }
  return report as T;
}

export async function runVerdict(argv: string[]): Promise<number> {
  try {
    return await verdict(argv);
  } catch (error) {
    // Exit 1 means « something to redo »: a verdict that could not be reached must never read as one.
    console.error(`Cannot decide: ${(error as Error).message}`);
    return 2;
  }
}

async function verdict(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { reports: { type: "string", default: ".aeom/reports" }, journeys: { type: "string", default: ".aeom/journeys" }, captures: { type: "string", default: ".aeom/captures/journeys" }, "keep-style": { type: "boolean" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help) {
    console.log(VERDICT_HELP);
    return 0;
  }
  // A config that cannot be read throws, and the verdict says it cannot decide.
  const config = await loadConfig();
  const problems: string[] = [];
  const check = await read<CheckReport>(join(values.reports, "check.json"), "check", problems);
  const judge = await read<JudgeReport>(join(values.reports, "judge.json"), "judge", problems);
  // Key journeys recorded but not replayed or critiqued: the verdict would leave them out.
  const recorded = await readdir(values.journeys).then(
    (files) => files.filter((f) => f.endsWith(".json")).map((f) => basename(f, ".json")).sort(),
    () => [] as string[],
  );
  const journeys = recorded.length ? await read<JourneyReport>(join(values.captures, "report.json"), "replay", problems) : undefined;
  const journeyJudge = recorded.length ? await read<JudgeReport>(join(values.reports, "judge-journeys.json"), "judge", problems) : undefined;
  if (problems.length || !check || !judge) {
    console.error(`Cannot decide: ${problems.join(", ")}. Run aeom check and the judge first${recorded.length ? ", then aeom journey and the journey judge" : ""}.`);
    return 2;
  }

  const kept = values["keep-style"] ? "--keep-style" : config.style === "keep" ? `"style": "keep" in .aeom/config.json` : null;
  const { measured: m, failures, missing, keptWithStyle, nothingToRedo } = verdictOf({ check, judge, journeys, journeyJudge, recorded, keepStyle: kept !== null });
  if (missing.length) {
    console.error(`Cannot decide: ${missing.join(", ")}. Capture, check and judge again${recorded.length ? ", and replay and judge the journeys again" : ""}, so every report covers the same screens and journeys.`);
    return 2;
  }
  const s = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const journeyPart = m.journeys ? `; ${s(m.journeys, "journey")} on ${s(m.journeyPrinciples, "principle")}` : "";
  console.log(`Measured: ${s(m.screens, "screen")} at ${m.widths.join(", ")} px, ${s(m.checks, "check")} and ${s(m.principles, "principle")} each${journeyPart}.`);
  if (keptWithStyle.length) console.log(`Left to the style kept: ${keptWithStyle.map((f) => `${f.where} ${f.what.split(":")[0]}`).join(", ")}.`);
  if (nothingToRedo) {
    console.log(`\nNothing to redo: nothing fails.`);
    return 0;
  }
  const column = Math.max(...failures.map((f) => f.where.length)) + 2;
  console.log("");
  for (const f of failures) console.log(`✗ ${f.where.padEnd(column)}${f.what}`);
  console.log(`\n${s(failures.length, "thing")} to redo.`);
  console.log(kept ? `Next: the kit wave fixes the existing style, without a new direction (${kept}).` : `Next: six new art directions, drawn from the product sheet.`);
  return 1;
}
