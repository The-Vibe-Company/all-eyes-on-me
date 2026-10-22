import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { costText, readRunState, runCost as costOfRun, type RunState } from "@aeom/core";

export const COST_HELP = `Usage: aeom cost [<run folder>] [--json]

Says what a run really cost, role by role: the session that coordinated it,
the directions, the kit, the pages, the journeys and the judges. It reads the
transcripts Claude Code keeps on this machine (~/.claude/projects, or
CLAUDE_CONFIG_DIR): their counts of tokens, and the opening of each agent's
brief to tell its role, nothing else of the conversations; nothing leaves the
machine. Each call is priced at the API's list prices of its model. It writes
cost.json in the run's folder, for the bench. A run never shows it to the
person it runs for.

The run is the latest in .aeom/runs by default. Its window runs from its start
to its last mark in state.json, half an hour more for the end of a finished
run; a run with no state, from the time its name gives, on this machine's
clock, to its folder's last change. Never past the start of the next run.

  --json    Write the cost as JSON`;

/** Half an hour after the last mark: the result page, the standard and the PR come after it. */
const AFTER = 30 * 60_000;

export async function runCost(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { json: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(COST_HELP);
    return 0;
  }
  const runs = join(".aeom", "runs");
  const latest = positionals[0] ? undefined : await readdir(runs).then((d) => d.filter((n) => n.startsWith("run-")).sort().at(-1), () => undefined);
  const dir = positionals[0] ?? (latest ? join(runs, latest) : undefined);
  if (!dir) {
    console.error(`No run in ${runs}: give the run's folder, aeom cost .aeom/runs/<run>.`);
    return 1;
  }
  const run = basename(resolve(dir));
  const window = await windowOf(dir, run);
  if (!window) {
    console.error(`${dir} is not a run's folder: it has no state.json, and its name gives no time (run-YYYYMMDD-HHMM).`);
    return 1;
  }
  // The project is the folder the run's .aeom/runs is in: the session that led it was opened there.
  const cost = await costOfRun({ run, cwd: resolve(dir, "..", "..", ".."), ...window });
  if (!cost.sessions) {
    console.error(`No transcript of ${run} on this machine: the run was led from another one, or not from Claude Code, or its session was deleted.`);
    return 1;
  }
  await writeFile(join(dir, "cost.json"), `${JSON.stringify(cost, null, 2)}\n`);
  console.log(values.json ? JSON.stringify(cost, null, 2) : costText(cost));
  return 0;
}

/** A time as an ISO string, or null when it is none. */
const iso = (t: string | number | Date | undefined) => {
  const ms = t instanceof Date ? t.getTime() : typeof t === "number" ? t : t ? Date.parse(t) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/** When a run started: its state's start, or the time its name gives, on this machine's clock. */
async function startOf(dir: string, run: string): Promise<{ at: string; state: RunState | null } | null> {
  const state = await readFile(join(dir, "state.json"), "utf8").then((t) => readRunState(JSON.parse(t), run), () => null);
  const started = iso(state?.started);
  if (started) return { at: started, state };
  const named = /^run-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(run);
  if (!named) return null;
  const [, y, mo, d, h, mi] = named.map(Number) as number[];
  const at = iso(new Date(y!, mo! - 1, d!, h!, mi!));
  return at ? { at, state: null } : null;
}

/**
 * From the run's start to its last mark, half an hour more once it is done, or to now while it goes on; from its name
 * and its folder's last change without a state. Never past the start of the next run in the same folder: a session
 * that judges, then redoes, runs both.
 */
async function windowOf(dir: string, run: string): Promise<{ from: string; to: string } | null> {
  const now = Date.now();
  const start = await startOf(dir, run);
  if (!start) return null;
  let to: number;
  const last = start.state ? Date.parse(start.state.history.at(-1)?.at ?? "") : NaN;
  if (start.state) to = start.state.phase === "done" && Number.isFinite(last) ? last + AFTER : now;
  else {
    let changed = Date.parse(start.at);
    for (const entry of await readdir(dir).catch(() => [] as string[])) changed = Math.max(changed, await stat(join(dir, entry)).then((s) => s.mtimeMs, () => 0));
    to = changed + AFTER;
  }
  const runs = resolve(dir, "..");
  for (const other of (await readdir(runs).catch(() => [] as string[])).filter((n) => n.startsWith("run-") && n !== run)) {
    const next = await startOf(join(runs, other), other);
    if (next && next.at > start.at) to = Math.min(to, Date.parse(next.at));
  }
  return { from: start.at, to: iso(Math.min(to, now))! };
}
