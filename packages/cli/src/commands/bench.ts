import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, copyFile, cp, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { benchText, guardJourneys, judgeBenchEntry, judgeBenchText, readRun, scoreJudgePasses, scoreRun, startApp, unscored, type AppScore, type DefectList, type JourneyReport, type JudgeBenchEntry, type JudgeBenchScore, type JudgePass } from "@aeom/core";

export const BENCH_HELP = `Usage: aeom bench prepare <folder> | aeom bench score <folder> [--judge [--passes <n>]] [--json]

The bench: apps whose defects were noted by hand, each run through /aeom, and
what the run found and fixed of them.

  prepare <folder>  Copy each bench app into <folder>/<app>, a git repository of
                    its own with its key journeys and its config in .aeom/, and
                    check that it starts. Only the app's tracked files are
                    copied, then its overlay/, which replaces what would tell
                    the run its defects; the defects themselves stay out. Then,
                    in each, run /aeom --autonome --sans-pr in a Claude Code
                    session.
  score <folder>    For each app, the latest run in <folder>/<app>/.aeom/runs
                    against its defects: found and fixed, with the failure that
                    proves each; regressions; hidden features the guard refuses;
                    what aeom cost measured. Written to <folder>/benchmark.json.
                    A pass of /aeom judge is never taken for a run.
  score <folder> --judge
                    The judge alone: in each app, the last passes of
                    /aeom judge --autonome (three by default), each defect with
                    how many passes found it, what they found beyond the list,
                    the verdicts that change from one pass to another, the cost
                    of a pass, and how far each mean moved since the judge
                    bench before. Written to <folder>/benchmark-judge.json, and
                    kept with its date and AEOM's version in
                    <folder>/history.jsonl.

  --bench <folder>  The bench's apps (default: bench/ in AEOM's repository)
  --passes <n>      With --judge, how many of the last passes to count (default 3)
  --json            With score, write the scores as JSON`;

const BENCH = fileURLToPath(new URL("../../../../bench/", import.meta.url));
const git = (cwd: string, ...args: string[]) => promisify(execFile)("git", ["-c", "user.name=aeom bench", "-c", "user.email=bench@aeom.local", "-c", "commit.gpgsign=false", ...args], { cwd, maxBuffer: 1 << 26 });
const message = (error: unknown) => (error instanceof Error ? error.message.split("\n")[0]! : String(error));

/** The bench's apps: each folder of the bench with its app, its .aeom/ and its defects. */
async function apps(bench: string): Promise<string[]> {
  const names = await readdir(bench).catch(() => [] as string[]);
  return names.filter((n) => ["app", "aeom", "defects.json"].every((part) => existsSync(join(bench, n, part)))).sort();
}

export async function runBench(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { bench: { type: "string" }, json: { type: "boolean" }, judge: { type: "boolean" }, passes: { type: "string", default: "3" }, help: { type: "boolean", short: "h" } } });
  const [verb, folder] = positionals;
  if (values.help || !verb) {
    console.log(BENCH_HELP);
    return values.help ? 0 : 1;
  }
  if ((verb !== "prepare" && verb !== "score") || !folder) {
    console.error(`aeom bench prepare <folder>, or aeom bench score <folder>.\n\n${BENCH_HELP}`);
    return 1;
  }
  const bench = resolve(values.bench ?? BENCH);
  const names = await apps(bench);
  if (!names.length) {
    console.error(`No bench app in ${bench}: each is a folder with app/, aeom/ and defects.json.`);
    return 1;
  }
  if (verb === "prepare") return prepare(bench, names, resolve(folder));
  if (!values.judge) return score(bench, names, resolve(folder), Boolean(values.json));
  const passes = Number(values.passes);
  if (!Number.isInteger(passes) || passes < 1) {
    console.error(`--passes is a whole number, 1 or more.`);
    return 1;
  }
  return scoreJudge(bench, names, resolve(folder), passes, Boolean(values.json));
}

/** The app's files as git tracks them, its links followed: no local data, no dependencies, nothing ignored. */
async function copyApp(from: string, to: string): Promise<void> {
  const real = await realpath(from);
  const tracked = await git(real, "ls-files", "-z", "--", ".").then((r) => r.stdout.split("\0").filter(Boolean), () => null);
  if (tracked?.length) {
    for (const file of tracked) {
      await mkdir(dirname(join(to, file)), { recursive: true });
      await copyFile(join(real, file), join(to, file));
    }
    return;
  }
  // Outside a repository: everything but what an app keeps for itself.
  const skipped = /(^|[/\\])(node_modules|\.git)([/\\]|$)|(^|[/\\])data[/\\]db\.json/;
  await cp(real, to, { recursive: true, dereference: true, filter: (src) => !skipped.test(relative(real, src).split(sep).join("/")) });
}

async function prepare(bench: string, names: string[], out: string): Promise<number> {
  const rows: string[] = [];
  let failed = 0;
  for (const name of names) {
    const project = join(out, name);
    if (existsSync(project) && (await readdir(project)).length) {
      rows.push(`${name}: ${project} is not empty, left as it is`);
      failed++;
      continue;
    }
    try {
      await mkdir(join(project, ".aeom"), { recursive: true });
      await copyApp(join(bench, name, "app"), project);
      // What would tell the run its defects (a README written for AEOM's tests) is replaced; the defects stay in the bench.
      if (existsSync(join(bench, name, "overlay"))) await cp(join(bench, name, "overlay"), project, { recursive: true, dereference: true });
      await cp(join(bench, name, "aeom"), join(project, ".aeom"), { recursive: true, dereference: true });
      const ignore = await readFile(join(project, ".gitignore"), "utf8").catch(() => "");
      await writeFile(join(project, ".gitignore"), `${ignore}${ignore && !ignore.endsWith("\n") ? "\n" : ""}node_modules/\n.aeom/runs/\n.aeom/captures/\n.aeom/reports/\n.aeom/review/\n`);
      await git(project, "init", "-q", "-b", "main");
      await git(project, "add", "-A");
      await git(project, "commit", "-q", "-m", `${name}, as the bench gives it`);
      const config = JSON.parse(await readFile(join(project, ".aeom", "config.json"), "utf8")) as { url?: string; start?: string };
      if (!config.url || !config.start) throw new Error("no url or start in .aeom/config.json");
      try {
        const app = await startApp(config.start, config.url, { cwd: project, timeoutMs: 30_000 });
        await app.stop();
        rows.push(`${name}: ${project}, starts at ${config.url}`);
      } catch (error) {
        // Prepared, but it does not start: said, and the others go on.
        rows.push(`${name}: ${project}, does not start: ${message(error)}`);
        failed++;
      }
    } catch (error) {
      // Half made, it would be refused as not empty next time: taken away.
      await rm(project, { recursive: true, force: true });
      rows.push(`${name}: could not be prepared: ${message(error)}`);
      failed++;
    }
  }
  console.log(`${rows.join("\n")}\n\nIn each, open a Claude Code session and run /aeom --autonome --sans-pr; then aeom bench score ${out}. For the judge alone, run /aeom judge --autonome three times in each; then aeom bench score ${out} --judge.`);
  return failed === names.length ? 1 : 0;
}

/**
 * A project's runs, by their names: run-YYYYMMDD-HHMM sorts by time. Each says whether it only judged (/aeom judge):
 * as its page reads it, or, for a pass that stopped before its capture, as its state kept the option.
 */
async function runsOf(project: string): Promise<{ name: string; judged: boolean }[]> {
  const names = (await readdir(join(project, ".aeom", "runs")).catch(() => [] as string[])).filter((n) => n.startsWith("run-")).sort();
  const optionOf = async (dir: string) => {
    const options = (await json<{ options?: unknown }>(join(dir, "state.json")))?.options;
    return Array.isArray(options) && options.some((o) => typeof o === "string" && /^(--)?(juger|diagnostic)$/.test(o));
  };
  return Promise.all(names.map(async (name) => {
    const dir = join(project, ".aeom", "runs", name);
    return { name, judged: await readRun(dir, name).then((p) => p.judged === true, () => optionOf(dir)) };
  }));
}
/** The last run of a project that is not a pass of /aeom judge: a judgement redoes nothing, so it scores no fix. */
const lastRun = async (project: string) => (await runsOf(project)).filter((r) => !r.judged).at(-1)?.name;
const json = async <T>(file: string): Promise<T | null> => readFile(file, "utf8").then((t) => JSON.parse(t) as T, () => null);

/** What a run cost, as aeom cost measured it from this machine's transcripts: measured once, then kept in the run. */
async function costOf(project: string, dir: string, run: string) {
  if (!existsSync(join(dir, "cost.json"))) await promisify(execFile)(process.execPath, [process.argv[1]!, "cost", join(".aeom", "runs", run)], { cwd: project, env: process.env }).catch(() => undefined);
  return json<{ total?: { dollars?: number | null; unpriced?: number }; roles?: { read?: number; written?: number; output?: number }[] }>(join(dir, "cost.json"));
}

/** One app's last run against its defects; what keeps it from being scored is said in its row. */
async function scoreApp(bench: string, out: string, name: string): Promise<AppScore> {
  let defects: DefectList;
  try {
    defects = JSON.parse(await readFile(join(bench, name, "defects.json"), "utf8")) as DefectList;
    if (!Array.isArray(defects.defects)) throw new Error("no list of defects");
  } catch (error) {
    return unscored(name, 0, null, `${join(bench, name, "defects.json")} cannot be read: ${message(error)}`);
  }
  const project = join(out, name);
  const run = await lastRun(project);
  if (!run) return unscored(defects.app, defects.defects.length, null, (await runsOf(project)).length ? `only passes of /aeom judge in ${join(project, ".aeom", "runs")}: score them with --judge, or run /aeom --autonome --sans-pr there` : `no run in ${join(project, ".aeom", "runs")}: the app did not start, or /aeom was not run there`);
  const dir = join(project, ".aeom", "runs", run);
  try {
    const page = await readRun(dir, run);
    const end = existsSync(join(dir, "journeys-end", "report.json")) ? "journeys-end" : "journeys-after";
    // The guard compares the journeys as they were with how the run left them. A run that rewrote its journey files
    // walks other paths at the end: its calls are not comparable, and are not counted.
    const branch = (await git(project, "rev-parse", "--verify", "-q", `aeom/${run}`).then(() => `aeom/${run}`, () => "HEAD"));
    const changed = (await git(project, "diff", "--name-only", "main", branch).then((r) => r.stdout.split("\n").filter(Boolean), () => [] as string[]));
    const rewritten = changed.filter((f) => f.startsWith(".aeom/journeys/"));
    const before = await json<JourneyReport>(join(dir, "journeys-before", "report.json"));
    const after = await json<JourneyReport>(join(dir, end, "report.json"));
    const config = await json<{ protected?: string[] }>(join(project, ".aeom", "config.json"));
    const refused = before && after && !rewritten.length ? guardJourneys({ before, after, changed, protectedFiles: config?.protected ?? [] }).refused : [];
    // A run never says what it costs: the bench measures it, from this machine's transcripts.
    const cost = await costOf(project, dir, run);
    const tokens = cost?.roles?.length ? cost.roles.reduce((t, r) => t + (r.read ?? 0) + (r.written ?? 0) + (r.output ?? 0), 0) : null;
    return scoreRun({
      defects,
      page,
      refused,
      dollars: typeof cost?.total?.dollars === "number" ? cost.total.dollars : null,
      tokens,
      unpriced: cost?.total?.unpriced ?? 0,
      journeysJudgedAtEnd: existsSync(join(dir, end, "judge-journeys.json")),
      ...(rewritten.length ? { guardNote: `the run rewrote ${rewritten.join(", ")}, so its replays walk other paths` } : {}),
    });
  } catch (error) {
    return unscored(defects.app, defects.defects.length, run, `${run} cannot be read: ${message(error)}`);
  }
}

async function score(bench: string, names: string[], out: string, asJson: boolean): Promise<number> {
  if (!existsSync(out)) {
    console.error(`${out} does not exist: aeom bench prepare ${out} first.`);
    return 1;
  }
  const scores: AppScore[] = [];
  for (const name of names) scores.push(await scoreApp(bench, out, name));
  await writeFile(join(out, "benchmark.json"), `${JSON.stringify({ scored: new Date().toISOString(), apps: scores }, null, 2)}\n`);
  console.log(asJson ? JSON.stringify(scores, null, 2) : `${benchText(scores)}\n\nWritten to ${join(out, "benchmark.json")}.`);
  return scores.every((s) => s.error) ? 1 : 0;
}

/** AEOM's version, the commit it runs from: what a judge bench is kept with. */
const AEOM_VERSION = () => git(fileURLToPath(new URL("../../../../", import.meta.url)), "rev-parse", "--short", "HEAD").then((r) => r.stdout.trim(), () => "");

/** One app's last passes of /aeom judge against its defects; what keeps it from being scored is said in its row. */
async function scoreJudgeApp(bench: string, out: string, name: string, asked: number): Promise<JudgeBenchScore> {
  let defects: DefectList;
  try {
    defects = JSON.parse(await readFile(join(bench, name, "defects.json"), "utf8")) as DefectList;
    if (!Array.isArray(defects.defects)) throw new Error("no list of defects");
  } catch (error) {
    return { ...scoreJudgePasses({ defects: { app: name, noted: "", defects: [] }, passes: [], asked }), error: `${join(bench, name, "defects.json")} cannot be read: ${message(error)}` };
  }
  const project = join(out, name);
  // A pass that stopped before its verdict judged nothing: it is not one, and an older pass counts instead.
  const judged: { run: string; failures: JudgePass["failures"] }[] = [];
  for (const { name: run } of (await runsOf(project)).filter((r) => r.judged)) {
    const page = await readRun(join(project, ".aeom", "runs", run), run).catch(() => null);
    if (page?.verdict) judged.push({ run, failures: page.verdict.failures });
  }
  const passes: JudgePass[] = [];
  for (const { run, failures } of judged.slice(-asked)) {
    const cost = await costOf(project, join(project, ".aeom", "runs", run), run);
    passes.push({ run, failures, dollars: typeof cost?.total?.dollars === "number" ? cost.total.dollars : null });
  }
  return scoreJudgePasses({ defects, passes, asked });
}

async function scoreJudge(bench: string, names: string[], out: string, asked: number, asJson: boolean): Promise<number> {
  if (!existsSync(out)) {
    console.error(`${out} does not exist: aeom bench prepare ${out} first.`);
    return 1;
  }
  const scores: JudgeBenchScore[] = [];
  for (const name of names) scores.push(await scoreJudgeApp(bench, out, name, asked));
  const at = new Date().toISOString();
  const aeom = await AEOM_VERSION();
  const measured = scores.some((s) => !s.error);
  // The judge benches before, as history.jsonl kept them: a line that is not one is skipped.
  const history = join(out, "history.jsonl");
  const isNumber = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  const isEntry = (e: unknown): e is JudgeBenchEntry => {
    const x = e as Partial<JudgeBenchEntry> | null;
    return !!x && x.mode === "judge" && typeof x.at === "string" && Array.isArray(x.apps) && x.apps.every((a) => typeof a?.app === "string" && Array.isArray(a.runs) && [a.passes, a.found, a.beyond, a.flips].every(isNumber));
  };
  const entries = (await readFile(history, "utf8").catch(() => "")).split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) as unknown; } catch { return null; } }).filter(isEntry);
  const entry = judgeBenchEntry(scores, { at, aeom });
  // The same passes scored again are the bench already kept: kept once, and compared with the one before it.
  const runsSaid = (e: JudgeBenchEntry) => JSON.stringify(e.apps.map((a) => [a.app, a.runs]).sort());
  const same = entries.length > 0 && runsSaid(entries.at(-1)!) === runsSaid(entry);
  const previous = (same ? entries.at(-2) : entries.at(-1)) ?? null;
  await writeFile(join(out, "benchmark-judge.json"), `${JSON.stringify({ scored: at, aeom, passes: asked, apps: scores }, null, 2)}\n`);
  if (measured && !same) await appendFile(history, `${JSON.stringify(entry)}\n`);
  console.log(asJson ? JSON.stringify(scores, null, 2) : `${judgeBenchText(scores, measured ? previous : undefined)}\n\nWritten to ${join(out, "benchmark-judge.json")}${measured ? `, kept in ${history}` : ""}.`);
  return measured ? 0 : 1;
}
