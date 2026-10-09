import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseArgs, promisify } from "node:util";
import {
  benchTable,
  CHECKS,
  defectsProblems,
  gradeRun,
  guardJourneys,
  JOURNEY_PRINCIPLES_FILE,
  loadPrinciples,
  readRun,
  tokenUsage,
  type Defects,
  type Grading,
  type JourneyReport,
  type RunTokens,
  type SavedVerdict,
} from "@aeom/core";
import { protectedAt } from "./guard.js";

const BENCH_HELP = `Usage: aeom bench grade <run folder> --defects <defects.json> --app <name> [--not-started "<why>"] [--out <file>]
       aeom bench table <grading.json>... [--out <file>]

The bench: apps whose defects were noted by hand, and what a run of AEOM
found and fixed of them.

grade compares a run with the defects noted on its app. A noted defect is
found when AEOM failed the same screen or journey on the same check or
principle before the run, and fixed when it no longer fails there at the end;
each match cites what AEOM said. It also names what fails at the end and
passed before, what AEOM found beyond the list, the features the run slipped
in (the guard, over the whole run), and the run's tokens (aeom tokens). Run it
from the app's repository. It writes grading.json in the run's folder.
--not-started says the app did not start, and grades the run on nothing.

table lays gradings side by side, app by app, and keeps them with --out.`;

const TOKENS_HELP = `Usage: aeom tokens <run folder> [--session <id>] [--since <time>] [--until <time>]

Counts the tokens of a run: every model call of the Claude Code session that
coordinated it and of every agent it launched, judges and workers, from the
session's transcripts on this machine, between the run's start (the
"started" file of its folder, or --since) and now (or --until). The session
is this one ($CLAUDE_CODE_SESSION_ID) unless --session names another. Writes
tokens.json in the run's folder; nothing leaves the machine.`;

const git = (args: string[]) => promisify(execFile)("git", args).then(({ stdout }) => stdout);

async function json<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** What the guard refuses over the whole run: from the app before the run to the end of its branch. */
async function featuresOf(runDir: string): Promise<string[]> {
  const run = basename(runDir);
  const base = (await readFile(join(runDir, "base"), "utf8").catch(() => "")).trim();
  const branch = `aeom/${run}`;
  let start: string;
  try {
    start = (await git(["merge-base", base || "HEAD", branch])).trim();
  } catch {
    // No run branch: the run changed nothing, so it slipped nothing in.
    return [];
  }
  const changed = (await git(["diff", "--name-only", "--no-renames", start, branch])).split("\n").filter(Boolean);
  const protectedFiles = await protectedAt(start);
  const now = await git(["show", `${branch}:./.aeom/config.json`]).catch(() => "");
  try {
    const globs = (JSON.parse(now || "{}") as { protected?: unknown }).protected;
    if (Array.isArray(globs)) protectedFiles.push(...globs.filter((g): g is string => typeof g === "string" && !!g.trim()));
  } catch {
    // A config the branch broke protects nothing more than the one at the start.
  }
  const before = await json<JourneyReport>(join(runDir, "journeys-before", "report.json"));
  const after = (await json<JourneyReport>(join(runDir, "journeys-end", "report.json"))) ?? (await json<JourneyReport>(join(runDir, "journeys-after", "report.json")));
  const empty: JourneyReport = { url: "", replayedAt: "", widths: [], warnings: [], journeys: [] } as unknown as JourneyReport;
  const { refused } = guardJourneys({ before: before ?? empty, after: after ?? before ?? empty, changed, protectedFiles: [...new Set(protectedFiles)] });
  return refused.map((v) => `${v.what}: ${v.why}`);
}

async function grade(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { defects: { type: "string" }, app: { type: "string" }, "not-started": { type: "string" }, out: { type: "string" } } });
  if (positionals.length !== 1 || !values.defects || !values.app) {
    console.log(BENCH_HELP);
    return 1;
  }
  const runDir = positionals[0]!;
  let defects: Defects;
  try {
    defects = JSON.parse(await readFile(values.defects, "utf8")) as Defects;
  } catch (error) {
    console.error(`Cannot read the defects ${values.defects}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const rules = {
    screen: [...CHECKS, ...(await loadPrinciples()).map((p) => p.id), "loads"],
    journey: [...(await loadPrinciples(JOURNEY_PRINCIPLES_FILE)).map((p) => p.id), "breaks"],
  };
  const problems = defectsProblems(defects, rules);
  if (problems.length) {
    console.error(`${values.defects} cannot be graded against, so nothing was written:\n${problems.map((p) => `  ${p}`).join("\n")}`);
    return 1;
  }

  let grading: Grading;
  if (values["not-started"]) {
    grading = gradeRun({ app: values.app, defects, before: null, end: null, notStarted: values["not-started"] });
  } else {
    const verdict = await json<SavedVerdict>(join(runDir, "verdict.json"));
    if (!verdict) {
      console.error(`${join(runDir, "verdict.json")} is missing: the run did not reach its verdict. If the app did not start, say so with --not-started.`);
      return 1;
    }
    const page = await readRun(runDir, basename(runDir));
    const tokens = await json<RunTokens>(join(runDir, "tokens.json"));
    grading = gradeRun({
      app: values.app,
      defects,
      before: verdict.failures,
      end: page.measuredAfter ? page.stillFailing : verdict.nothingToRedo ? verdict.failures : null,
      journeys: page.journeys.map((j) => ({ slug: j.slug, name: j.name })),
      features: await featuresOf(runDir),
      tokens: tokens?.total ?? null,
    });
  }
  const out = values.out ?? join(runDir, "grading.json");
  await writeFile(out, JSON.stringify(grading, null, 2) + "\n");

  if (grading.notStarted) {
    console.log(`${grading.app} did not start: ${grading.notStarted}. Graded on nothing: 0 of ${grading.noted} noted defects found.`);
    return 0;
  }
  console.log(`Found ${grading.found.length} of ${grading.noted} noted defects:`);
  for (const f of grading.found) console.log(`  ${f.id}  ${f.proof}`);
  if (grading.missed.length) console.log(`Missed: ${grading.missed.join(", ")}`);
  console.log(grading.end === "measured" ? `Fixed ${grading.fixed.length} of ${grading.noted}${grading.notFixed.length ? `; still failing: ${grading.notFixed.join(", ")}` : ""}` : "Fixed: not measured, the run stopped before its end.");
  for (const r of grading.regressions) console.log(`Regression: ${r.where} ${r.rule}  ${r.what}`);
  for (const e of grading.extra) console.log(`Beyond the list: ${e.where} ${e.rule}  ${e.what}`);
  for (const f of grading.features) console.log(`Feature slipped in: ${f}`);
  if (!grading.features.length) console.log("No feature slipped in.");
  console.log(grading.tokens ? `${grading.tokens.total} tokens over ${grading.tokens.calls} model calls.` : "Tokens: not counted (run aeom tokens on the run first).");
  console.log(`Wrote ${out}`);
  return 0;
}

async function table(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: "string" } } });
  if (!positionals.length) {
    console.log(BENCH_HELP);
    return 1;
  }
  const gradings: Grading[] = [];
  for (const file of positionals) {
    const g = await json<Grading>(file).catch(() => null);
    if (!g || typeof g.app !== "string" || !Array.isArray(g.found)) {
      console.error(`${file} is not a grading of aeom bench grade.`);
      return 1;
    }
    gradings.push(g);
  }
  const { rows, text } = benchTable(gradings);
  console.log(text);
  if (values.out) await writeFile(values.out, JSON.stringify({ rows, gradings }, null, 2) + "\n");
  return 0;
}

export async function runBench(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "grade") return grade(rest);
  if (sub === "table") return table(rest);
  console.log(BENCH_HELP);
  return sub === "--help" || sub === "-h" ? 0 : 1;
}

/** The transcripts of a session: its own, and those of the agents it launched, named by what each was launched for. */
async function transcriptsOf(session: string): Promise<{ agent: string | null; lines: string[] }[] | null> {
  const projects = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
  const folders = await readdir(projects).catch(() => [] as string[]);
  for (const folder of folders) {
    const main = await readFile(join(projects, folder, `${session}.jsonl`), "utf8").catch(() => null);
    if (main === null) continue;
    const result: { agent: string | null; lines: string[] }[] = [{ agent: null, lines: main.split("\n") }];
    const agents = join(projects, folder, session, "subagents");
    for (const file of (await readdir(agents).catch(() => [] as string[])).filter((f) => f.endsWith(".jsonl")).sort()) {
      const meta = await json<{ description?: string }>(join(agents, file.replace(/\.jsonl$/, ".meta.json"))).catch(() => null);
      result.push({ agent: meta?.description ?? file.replace(/\.jsonl$/, ""), lines: (await readFile(join(agents, file), "utf8")).split("\n") });
    }
    return result;
  }
  return null;
}

export async function runTokens(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: { session: { type: "string" }, since: { type: "string" }, until: { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.help || positionals.length !== 1) {
    console.log(TOKENS_HELP);
    return values.help ? 0 : 1;
  }
  const runDir = positionals[0]!;
  const session = values.session ?? process.env.CLAUDE_CODE_SESSION_ID;
  if (!session) {
    console.error("No session to count: run this inside Claude Code, or name the session with --session.");
    return 1;
  }
  const since = values.since ?? (await readFile(join(runDir, "started"), "utf8").catch(() => "")).trim();
  if (!since || Number.isNaN(Date.parse(since))) {
    console.error(`No start for the run: ${join(runDir, "started")} is missing or not a time. Give one with --since.`);
    return 1;
  }
  const transcripts = await transcriptsOf(session);
  if (!transcripts) {
    console.error(`No transcript of the session ${session} on this machine.`);
    return 1;
  }
  const tokens = tokenUsage(transcripts, { since, until: values.until ?? new Date().toISOString() });
  await writeFile(join(runDir, "tokens.json"), JSON.stringify(tokens, null, 2) + "\n");
  console.log(`${tokens.total.calls} model calls, ${tokens.total.total} tokens: ${tokens.coordinator.total} by the session, ${tokens.total.total - tokens.coordinator.total} by ${tokens.agents.length} agent${tokens.agents.length === 1 ? "" : "s"}.`);
  console.log(`Wrote ${join(runDir, "tokens.json")}`);
  return 0;
}
