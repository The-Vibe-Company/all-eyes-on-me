import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { benchText, guardJourneys, readRun, scoreRun, startApp, type AppScore, type DefectList, type JourneyReport } from "@aeom/core";

export const BENCH_HELP = `Usage: aeom bench prepare <folder> | aeom bench score <folder> [--json]

The bench: apps whose defects were noted by hand, each run through /aeom, and
what the run found and fixed of them.

  prepare <folder>  Copy each bench app into <folder>/<app>, a git repository of
                    its own with its key journeys and its config in .aeom/, and
                    check that it starts. Its defects stay out of it: the run
                    never sees them. Then, in each, run /aeom --autonome --sans-pr
                    in a Claude Code session.
  score <folder>    For each app, the latest run in <folder>/<app>/.aeom/runs
                    against its defects: found and fixed, with the failure that
                    proves each; regressions; hidden features the guard refuses;
                    what aeom cost measured. Written to <folder>/benchmark.json.

  --bench <folder>  The bench's apps (default: bench/ in AEOM's repository)
  --json            With score, write the scores as JSON`;

const BENCH = fileURLToPath(new URL("../../../../bench/", import.meta.url));
const git = (cwd: string, ...args: string[]) => promisify(execFile)("git", ["-c", "user.name=aeom bench", "-c", "user.email=bench@aeom.local", ...args], { cwd });

/** The bench's apps: each folder of the bench with its defects noted. */
async function apps(bench: string): Promise<string[]> {
  const names = await readdir(bench).catch(() => [] as string[]);
  return names.filter((n) => existsSync(join(bench, n, "defects.json"))).sort();
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
    await mkdir(join(project, ".aeom"), { recursive: true });
    // The app, its links followed; its journeys and config in .aeom/. Its defects stay in the bench.
    await cp(join(bench, name, "app"), project, { recursive: true, dereference: true, filter: (src) => !/[/\\](node_modules|\.git)([/\\]|$)/.test(src) });
    await cp(join(bench, name, "aeom"), join(project, ".aeom"), { recursive: true, dereference: true });
    const ignore = await readFile(join(project, ".gitignore"), "utf8").catch(() => "");
    await writeFile(join(project, ".gitignore"), `${ignore}${ignore && !ignore.endsWith("\n") ? "\n" : ""}node_modules/\n.aeom/runs/\n.aeom/captures/\n.aeom/reports/\n.aeom/review/\n`);
    await git(project, "init", "-q", "-b", "main");
    await git(project, "add", "-A");
    await git(project, "commit", "-q", "-m", `${name}, as the bench gives it`);
    // An app that does not start is said, and the others go on.
    const config = JSON.parse(await readFile(join(project, ".aeom", "config.json"), "utf8")) as { url?: string; start?: string };
    try {
      if (!config.url || !config.start) throw new Error("no url or start in .aeom/config.json");
      const app = await startApp(config.start, config.url, { cwd: project, timeoutMs: 30_000 });
      await app.stop();
      rows.push(`${name}: ${project}, starts at ${config.url}`);
    } catch (error) {
      rows.push(`${name}: ${project}, does not start: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      failed++;
    }
  }
  console.log(`${rows.join("\n")}\n\nIn each, open a Claude Code session and run /aeom --autonome --sans-pr; then aeom bench score ${out}.`);
  return failed === names.length ? 1 : 0;
}

/** The last run of a project, by its name: run-YYYYMMDD-HHMM sorts by time. */
const lastRun = async (project: string) => (await readdir(join(project, ".aeom", "runs")).catch(() => [] as string[])).filter((n) => n.startsWith("run-")).sort().at(-1);
const json = async <T>(file: string): Promise<T | null> => readFile(file, "utf8").then((t) => JSON.parse(t) as T, () => null);

async function score(bench: string, names: string[], out: string, asJson: boolean): Promise<number> {
  const scores: AppScore[] = [];
  for (const name of names) {
    const defects = (await json<DefectList>(join(bench, name, "defects.json")))!;
    const empty = { app: name, run: null, defects: [], found: 0, fixed: 0, total: defects.defects.length, regressions: [], hiddenFeatures: [], extra: [], dollars: null };
    const project = join(out, name);
    const run = await lastRun(project);
    if (!run) {
      scores.push({ ...empty, error: `no run in ${join(project, ".aeom", "runs")}: the app did not start, or /aeom was not run there` });
      continue;
    }
    const dir = join(project, ".aeom", "runs", run);
    try {
      const page = await readRun(dir, run);
      // The guard, on the journeys as they were and as the run left them: a call the app never made is a feature.
      const before = await json<JourneyReport>(join(dir, "journeys-before", "report.json"));
      const after = (await json<JourneyReport>(join(dir, "journeys-end", "report.json"))) ?? (await json<JourneyReport>(join(dir, "journeys-after", "report.json")));
      const refused = before && after ? guardJourneys({ before, after }).refused : [];
      const cost = await json<{ total?: { dollars?: number | null } }>(join(dir, "cost.json"));
      scores.push(scoreRun({ defects, page, refused, dollars: typeof cost?.total?.dollars === "number" ? cost.total.dollars : null }));
    } catch (error) {
      scores.push({ ...empty, run, error: `${run} cannot be read: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}` });
    }
  }
  await writeFile(join(out, "benchmark.json"), `${JSON.stringify({ scored: new Date().toISOString(), apps: scores }, null, 2)}\n`);
  console.log(asJson ? JSON.stringify(scores, null, 2) : `${benchText(scores)}\n\nWritten to ${join(out, "benchmark.json")}.`);
  return scores.every((s) => s.error) ? 1 : 0;
}
