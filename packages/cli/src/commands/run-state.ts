import { execFile } from "node:child_process";
import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { agentLines, markAgent, markRun, newRunState, readRunState, resumePlan, type AgentStatus, type OnDisk, type RunState } from "@aeom/core";

const USAGE = `Usage: aeom run mark <run folder> --phase <name> [--step <step>] [--set NAME=value]... [--option <option>]...
       aeom run agent <run folder> --name <name> --status <launched|done|merged|refused> [--kind <kind>] [--worktree <path>] [--branch <branch>] [--from <commit>]
       aeom run status [<run folder>]
       aeom run resume [<run folder>]

Keeps where a run is in its folder's state.json, as it goes, so a run whose
session closed can be taken up by a new one.

  mark    The run moves to a phase and a step of the skill, such as
          --phase directions --step 2b.4, and keeps the values given with
          --set, such as --set KIT_BASE=<commit>, and the options the run
          was asked with, such as --option sans-pr. It notes the run branch's
          commit too.
  agent   An agent is launched (with its worktree, its branch and the commit
          it started from), done, merged or refused.
  status  Where the run is, and what each agent left, as the disk shows it.
  resume  What a new session sets again, what to do with each agent, and the
          step to go on at.

Without a run folder, status and resume take the latest run that keeps its
state.`;

const exec = promisify(execFile);
const FILE = "state.json";

async function load(runDir: string): Promise<RunState> {
  let text: string;
  try {
    text = await readFile(join(runDir, FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return newRunState(basename(runDir), new Date().toISOString());
    throw error;
  }
  let state: RunState | null = null;
  try {
    state = readRunState(JSON.parse(text), basename(runDir));
  } catch {
    state = null;
  }
  if (!state) throw new Error(`${join(runDir, FILE)} is not a run's state: move it away to start the state again.`);
  return state;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Reads, changes and writes the state under a lock, so marks made at once
 * never lose one another; written whole, then moved into place, so a run
 * stopped mid-write never leaves half a state. A lock left by a process that
 * no longer runs is taken over.
 */
async function update(runDir: string, change: (s: RunState) => RunState): Promise<void> {
  const lock = join(runDir, `${FILE}.lock`);
  for (let tries = 0; ; tries++) {
    try {
      await writeFile(lock, String(process.pid), { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const holder = Number(await readFile(lock, "utf8").catch(() => ""));
      let alive = false;
      try {
        alive = Number.isInteger(holder) && holder > 0 && process.kill(holder, 0);
      } catch {
        alive = false;
      }
      if (!alive && holder) await rm(lock, { force: true });
      else if (tries > 300) throw new Error(`Another aeom run (process ${holder}) has been writing ${join(runDir, FILE)} for too long. Run again once it is done.`);
      else await sleep(20 + Math.random() * 30);
    }
  }
  try {
    const next = change(await load(runDir));
    const temporary = join(runDir, `${FILE}.${process.pid}.tmp`);
    await writeFile(temporary, JSON.stringify(next, null, 2) + "\n");
    await rename(temporary, join(runDir, FILE));
  } finally {
    await rm(lock, { force: true });
  }
}

/** The project a run folder belongs to: <project>/.aeom/runs/<run>. */
const projectOf = (runDir: string) => resolve(runDir, "..", "..", "..");
const git = (root: string, args: string[]) => exec("git", ["-C", root, ...args]).then(({ stdout }) => stdout.trim());

/** The latest run folder that keeps its state, by name, run-<date-time>: here, or in the main checkout when this is a worktree of it. */
async function latest(): Promise<string | null> {
  const main = await git(".", ["rev-parse", "--path-format=absolute", "--git-common-dir"]).then((common) => dirname(common), () => null);
  for (const root of [".", ...(main ? [main] : [])]) {
    const runs = (await readdir(join(root, ".aeom", "runs")).catch(() => [] as string[])).sort().reverse();
    for (const run of runs) if (await stat(join(root, ".aeom", "runs", run, FILE)).then(() => true, () => false)) return join(root, ".aeom", "runs", run);
  }
  return null;
}

/** The run branch's commit, null when it does not exist. */
const runBranch = (root: string, run: string) => git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/aeom/${run}`]).catch(() => null);

async function onDisk(s: RunState, root: string): Promise<OnDisk> {
  const tip = await runBranch(root, s.run);
  const disk: OnDisk = { worktrees: {}, commits: {}, merged: {}, runBranch: tip };
  for (const a of s.agents) {
    if (a.worktree) disk.worktrees[a.worktree] = await stat(resolve(root, a.worktree)).then(() => true, () => false);
    if (!a.branch) continue;
    const there = await git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${a.branch}`]).then(() => true, () => false);
    if (!there) {
      disk.commits[a.branch] = null;
      continue;
    }
    disk.commits[a.branch] = a.from ? await git(root, ["rev-list", "--count", `${a.from}..refs/heads/${a.branch}`]).then(Number, () => "unknown" as const) : "unknown";
    if (tip && disk.commits[a.branch] !== 0) disk.merged![a.branch] = await git(root, ["merge-base", "--is-ancestor", `refs/heads/${a.branch}`, tip]).then(() => true, () => false);
  }
  return disk;
}

export async function runRunState(argv: string[]): Promise<number> {
  const [action, ...rest] = argv;
  const { positionals, values } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      phase: { type: "string" },
      option: { type: "string", multiple: true },
      step: { type: "string" },
      set: { type: "string", multiple: true },
      name: { type: "string" },
      kind: { type: "string" },
      status: { type: "string" },
      worktree: { type: "string" },
      branch: { type: "string" },
      from: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || !action || !["mark", "agent", "status", "resume"].includes(action)) {
    console.log(USAGE);
    return values.help || action === "--help" ? 0 : 1;
  }
  const at = new Date().toISOString();
  try {
    if (positionals.length > 1) {
      console.error(`aeom run ${action} takes one run folder, not ${positionals.length}: quote a value with spaces, such as --set "MAIN=$MAIN".`);
      return 1;
    }
    if (action === "mark" || action === "agent") {
      const runDir = positionals[0];
      if (!runDir) {
        console.error(`aeom run ${action} needs the run's folder, such as .aeom/runs/$RUN.`);
        return 1;
      }
      const root = projectOf(runDir);
      if (action === "mark") {
        if (!values.phase) {
          console.error(`aeom run mark needs --phase, such as --phase directions.`);
          return 1;
        }
        const set: Record<string, string> = {};
        for (const pair of values.set ?? []) {
          const eq = pair.indexOf("=");
          if (eq < 1) {
            console.error(`--set takes NAME=value, such as --set KIT_BASE=abc123.`);
            return 1;
          }
          set[pair.slice(0, eq)] = pair.slice(eq + 1);
        }
        const branchAt = await runBranch(root, basename(runDir));
        const phase = values.phase;
        await update(runDir, (s) => markRun(s, { phase, ...(values.step ? { step: values.step } : {}), set, ...(values.option ? { options: values.option.map((o) => (o.startsWith("--") ? o : `--${o}`)) } : {}), branchAt, at }));
      } else {
        const { name, status } = values;
        if (!name || !status) {
          console.error(`aeom run agent needs --name and --status.`);
          return 1;
        }
        const worktree = values.worktree ? resolve(values.worktree) : undefined;
        await update(runDir, (s) => {
          if (values.branch && !values.from && !s.agents.some((a) => a.name === name && a.from)) throw new Error(`--branch goes with --from, the commit its worktree started from, so a new session can tell what it committed.`);
          return markAgent(s, { name, status: status as AgentStatus, at, kind: values.kind, worktree, branch: values.branch, from: values.from });
        });
      }
      return 0;
    }
    const runDir = positionals[0] ?? (await latest());
    if (!runDir) {
      console.error(`No run keeps its state in .aeom/runs yet.`);
      return 1;
    }
    const s = await load(runDir);
    const disk = await onDisk(s, projectOf(runDir));
    if (action === "resume") console.log(resumePlan(s, disk));
    else {
      const since = s.history.at(-1)?.at;
      console.log([`${s.run}: "${s.phase ?? "nothing yet"}"${s.step ? `, at step ${s.step} of the skill` : ""}${since ? `, since ${since}` : ""}.`, ...agentLines(s, disk)].join("\n"));
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
