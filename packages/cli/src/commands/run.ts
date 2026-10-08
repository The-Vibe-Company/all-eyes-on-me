import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { comparePages, ConfigError, DuelVoteError, guardJourneys, loadConfig, ratchetJourneys, readDuelVotes, scorePages, snapshot, SnapshotPathError, tallyDuels, type CheckReport, type JourneyReport, type JudgeReport } from "@aeom/core";
import { changedSince, problemWith, protectedAt } from "./guard.js";

export async function runSnapshot(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length !== 1) {
    console.log(`Usage: aeom snapshot <dir>\n\nCopies .aeom/captures and .aeom/reports into <dir>, such as .aeom/runs/<run>/before,\nso the next capture cannot overwrite them.`);
    return values.help ? 0 : 1;
  }
  try {
    await snapshot(".aeom", positionals[0]!);
  } catch (error) {
    if (!(error instanceof SnapshotPathError)) throw error;
    console.error(error.message);
    return 1;
  }
  console.log(`Captures and reports copied to ${positionals[0]}`);
  return 0;
}

/** Reads a report a snapshot must have; a missing or unreadable one is an error naming the file. */
async function readReport<T>(file: string, problems: string[]): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    problems.push(code === "ENOENT" ? `${file} is missing` : `${file} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

const COMPARE_HELP = `Usage: aeom compare <before-dir> <after-dir>
       aeom compare --journeys <before-dir> <after-dir> [--duels <dir>] [--base <ref>]

Compares two snapshots page by page: what fails before and after (checks + principles).
Writes compare.json in <after-dir>.

With --journeys, the ratchet of the journeys: each folder holds a replay
(report.json, from aeom journey) and its critique (judge-journeys.json, from
aeom judge --journeys --out). A new journey stays only if it goes to its end
wherever the old one did, the guard refuses nothing it does, and the judges
prefer it in the duel; otherwise the old one comes back. Writes ratchet.json
in <after-dir>.

Options:
  --journeys           Compare journeys, not pages
  --duels <dir>        The judges' duel votes (default <after-dir>/duels)
  --base <ref>         The commit the change started from, for the guard
  --voters <n>         How many duel votes to expect (default 3)`;

export async function runCompare(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { journeys: { type: "boolean" }, duels: { type: "string" }, base: { type: "string" }, voters: { type: "string", default: "3" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help || positionals.length !== 2) {
    console.log(COMPARE_HELP);
    return values.help ? 0 : 1;
  }
  if (values.journeys) return compareJourneys(positionals[0]!, positionals[1]!, values);
  const [beforeDir, afterDir] = positionals as [string, string];
  const problems: string[] = [];
  const read = async (dir: string) => ({
    check: await readReport<CheckReport>(join(dir, "reports", "check.json"), problems),
    judge: await readReport<JudgeReport>(join(dir, "reports", "judge.json"), problems),
  });
  const before = await read(beforeDir);
  const after = await read(afterDir);
  if (problems.length) {
    console.error(`Both snapshots need check.json and judge.json:\n${problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }
  const comparison = comparePages(scorePages(before.check, before.judge), scorePages(after.check, after.judge));
  if (comparison.length === 0) {
    console.error(`No page to compare in ${beforeDir} and ${afterDir}.`);
    return 1;
  }
  await writeFile(join(afterDir, "compare.json"), JSON.stringify(comparison, null, 2) + "\n");

  const column = Math.max(...comparison.map((c) => c.page.length)) + 2;
  const mark = { better: "↑ better", same: "= same", worse: "↓ worse", missing: "✗ missing after", new: "+ new page" };
  console.log(`${"page".padEnd(column)}before  after   (checks + principles failing)`);
  for (const c of comparison) {
    console.log(`${c.page.padEnd(column)}${String(c.before?.total ?? "-").padEnd(8)}${String(c.after?.total ?? "-").padEnd(8)}${mark[c.verdict]}`);
  }
  return 0;
}

async function compareJourneys(beforeDir: string, afterDir: string, values: { duels?: string; base?: string; voters: string }): Promise<number> {
  const problems: string[] = [];
  const before = await readReport<JourneyReport>(join(beforeDir, "report.json"), problems);
  const after = await readReport<JourneyReport>(join(afterDir, "report.json"), problems);
  const beforeVerdict = await readReport<JudgeReport>(join(beforeDir, "judge-journeys.json"), problems);
  const afterVerdict = await readReport<JudgeReport>(join(afterDir, "judge-journeys.json"), problems);
  // The guard's own check: each replay lists its journeys and the calls each made.
  for (const [dir, report] of [[beforeDir, before], [afterDir, after]] as const) {
    const problem = report && problemWith(report);
    if (problem) problems.push(`${join(dir, "report.json")}: ${problem}`);
  }
  if (problems.length || !before || !after) {
    console.error(`Both folders need report.json (aeom journey) and judge-journeys.json (aeom judge --journeys --out):\n${problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }
  const slugs = after.journeys.filter((j) => before.journeys.some((b) => b.slug === j.slug)).map((j) => j.slug);
  let duels;
  try {
    duels = tallyDuels(await readDuelVotes(values.duels ?? join(afterDir, "duels")), slugs, { voters: Number(values.voters) });
  } catch (error) {
    if (!(error instanceof DuelVoteError)) throw error;
    console.error(`The duel votes cannot be counted:\n${error.problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }
  let protectedFiles: string[] = [];
  try {
    protectedFiles = (await loadConfig()).protected ?? [];
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    return 1;
  }
  // A file protected at the base stays protected, even if the change took it off the list.
  if (values.base) protectedFiles = [...new Set([...(await protectedAt(values.base)), ...protectedFiles])];
  const changed = values.base ? await changedSince(values.base) : [];
  const guard = guardJourneys({ before, after, changed, protectedFiles });
  const verdicts = ratchetJourneys({ before, after, beforeVerdict, afterVerdict, duels, guard });
  await writeFile(join(afterDir, "ratchet.json"), JSON.stringify(verdicts, null, 2) + "\n");

  const column = Math.max(...verdicts.map((v) => v.name.length)) + 2;
  for (const v of verdicts) {
    console.log(`${v.kept ? "✓" : "✗"} ${v.name.padEnd(column)}${v.kept ? "kept" : "back"}  ${v.steps.before} → ${v.steps.after} steps  ${v.why}`);
    if (v.kept) console.log(`  ${" ".repeat(column)}cleared: ${v.cleared.join(", ") || "nothing"}; still failing: ${v.remaining.join(", ") || "nothing"}`);
  }
  const back = verdicts.filter((v) => !v.kept);
  console.log(`\n${verdicts.length - back.length} kept, ${back.length} back.${back.length ? " Revert the merges that brought the journeys back, replay, and compare again." : ""} Report: ${join(afterDir, "ratchet.json")}`);
  return 0;
}
