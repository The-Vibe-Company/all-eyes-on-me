import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { benchText, guardJourneys, readRun, scoreRun, startApp, unscored, type AppScore, type DefectList, type JourneyReport } from "@aeom/core";

export const BENCH_HELP = `Usage: aeom bench prepare <folder> | aeom bench score <folder> [--json]

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

  --bench <folder>  The bench's apps (default: bench/ in AEOM's repository)
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
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { bench: { type: "string" }, json: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
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
  return verb === "prepare" ? prepare(bench, names, resolve(folder)) : score(bench, names, resolve(folder), Boolean(values.json));
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
  console.log(`${rows.join("\n")}\n\nIn each, open a Claude Code session and run /aeom --autonome --sans-pr; then aeom bench score ${out}.`);
  return failed === names.length ? 1 : 0;
}

/** The last run of a project, by its name: run-YYYYMMDD-HHMM sorts by time. */
const lastRun = async (project: string) => (await readdir(join(project, ".aeom", "runs")).catch(() => [] as string[])).filter((n) => n.startsWith("run-")).sort().at(-1);
const json = async <T>(file: string): Promise<T | null> => readFile(file, "utf8").then((t) => JSON.parse(t) as T, () => null);

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
  if (!run) return unscored(defects.app, defects.defects.length, null, `no run in ${join(project, ".aeom", "runs")}: the app did not start, or /aeom was not run there`);
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
    if (!existsSync(join(dir, "cost.json"))) await promisify(execFile)(process.execPath, [process.argv[1]!, "cost", join(".aeom", "runs", run)], { cwd: project, env: process.env }).catch(() => undefined);
    const cost = await json<{ total?: { dollars?: number | null; unpriced?: number }; roles?: { read?: number; written?: number; output?: number }[] }>(join(dir, "cost.json"));
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
