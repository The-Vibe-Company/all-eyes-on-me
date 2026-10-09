import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { verdictOf, type CheckReport, type JourneyReport, type JudgeReport } from "@aeom/core";

export const VERDICT_HELP = `Usage: aeom verdict [options]

Says whether the front needs redoing, from what AEOM last measured: the
checks and the judge on every screen and, when the project has key journeys,
their replay and their critique. Exits with 0 when nothing fails, 1 when
something does, and 2 when it cannot decide.

Options:
  --reports <dir>   check.json, judge.json and judge-journeys.json (default .aeom/reports)
  --journeys <dir>  The last replay of the journeys (default .aeom/captures/journeys)`;

async function read<T>(file: string, problems: string[]): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    problems.push((error as NodeJS.ErrnoException).code === "ENOENT" ? `${file} is missing` : `${file} cannot be read`);
    return undefined;
  }
}

export async function runVerdict(argv: string[]): Promise<number> {
  const { values } = parseArgs({ args: argv, options: { reports: { type: "string", default: ".aeom/reports" }, journeys: { type: "string", default: ".aeom/captures/journeys" }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(VERDICT_HELP);
    return 0;
  }
  const problems: string[] = [];
  const check = await read<CheckReport>(join(values.reports, "check.json"), problems);
  const judge = await read<JudgeReport>(join(values.reports, "judge.json"), problems);
  // Key journeys recorded but not replayed or critiqued: the verdict would leave them out.
  const recorded = await readdir(".aeom/journeys").then((files) => files.some((f) => f.endsWith(".json")), () => false);
  const journeys = recorded ? await read<JourneyReport>(join(values.journeys, "report.json"), problems) : undefined;
  const journeyJudge = recorded ? await read<JudgeReport>(join(values.reports, "judge-journeys.json"), problems) : undefined;
  if (problems.length || !check || !judge) {
    console.error(`Cannot decide: ${problems.join(", ")}. Run aeom check and the judge first${recorded ? ", then aeom journey and the journey judge" : ""}.`);
    return 2;
  }

  const { measured: m, failures, nothingToRedo } = verdictOf({ check, judge, journeys, journeyJudge });
  const s = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const journeyPart = m.journeys ? `; ${s(m.journeys, "journey")} on ${s(m.journeyPrinciples, "principle")}` : "";
  console.log(`Measured: ${s(m.screens, "screen")} at ${m.widths.join(", ")} px, ${s(m.checks, "check")} and ${s(m.principles, "principle")} each${journeyPart}.`);
  if (nothingToRedo) {
    console.log(`\nNothing to redo: nothing fails.`);
    return 0;
  }
  const column = Math.max(...failures.map((f) => f.where.length)) + 2;
  console.log("");
  for (const f of failures) console.log(`✗ ${f.where.padEnd(column)}${f.what}`);
  console.log(`\n${s(failures.length, "thing")} to redo.`);
  return 1;
}
