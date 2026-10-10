import { execFile } from "node:child_process";
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { agentLines, markAgent, markRun, newRunState, resumePlan, type AgentStatus, type OnDisk, type RunState } from "@aeom/core";

const USAGE = `Usage: aeom run mark <run folder> --phase <name> [--step <step>] [--set NAME=value]...
       aeom run agent <run folder> --name <name> --status <launched|done|merged|refused> [--kind <kind>] [--worktree <path>] [--branch <branch>] [--from <commit>]
       aeom run status [<run folder>]
       aeom run resume [<run folder>]

Keeps where a run is in its folder's state.json, as it goes, so a run whose
session closed can be taken up by a new one.

  mark    The run moves to a phase and a step of the skill, such as
          --phase directions --step 2b.4, and keeps the values given with
          --set, such as --set KIT_BASE=<commit>.
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
  try {
    return JSON.parse(await readFile(join(runDir, FILE), "utf8")) as RunState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return newRunState(basename(runDir), new Date().toISOString());
    throw error;
  }
}

/** Written whole, then moved into place: a run stopped mid-write never leaves half a state. */
async function save(runDir: string, s: RunState): Promise<void> {
  await writeFile(join(runDir, `${FILE}.tmp`), JSON.stringify(s, null, 2) + "\n");
  await rename(join(runDir, `${FILE}.tmp`), join(runDir, FILE));
}

/** The latest run folder that keeps its state, by name: run-<date-time>. */
async function latest(): Promise<string | null> {
  const runs = (await readdir(join(".aeom", "runs")).catch(() => [] as string[])).sort().reverse();
  for (const run of runs) if (await stat(join(".aeom", "runs", run, FILE)).then(() => true, () => false)) return join(".aeom", "runs", run);
  return null;
}

async function onDisk(s: RunState): Promise<OnDisk> {
  const disk: OnDisk = { worktrees: {}, commits: {} };
  for (const a of s.agents) {
    if (a.worktree) disk.worktrees[a.worktree] = await stat(a.worktree).then(() => true, () => false);
    if (a.branch) {
      const there = await exec("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${a.branch}`]).then(() => true, () => false);
      disk.commits[a.branch] = !there ? null : a.from ? Number((await exec("git", ["rev-list", "--count", `${a.from}..refs/heads/${a.branch}`])).stdout.trim()) : 0;
    }
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
    if (action === "mark" || action === "agent") {
      const runDir = positionals[0];
      if (!runDir) {
        console.error(`aeom run ${action} needs the run's folder, such as .aeom/runs/$RUN.`);
        return 1;
      }
      let s = await load(runDir);
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
        s = markRun(s, { phase: values.phase, ...(values.step ? { step: values.step } : {}), set, at });
      } else {
        if (!values.name || !values.status) {
          console.error(`aeom run agent needs --name and --status.`);
          return 1;
        }
        if (values.branch && !values.from && !s.agents.some((a) => a.name === values.name && a.from)) {
          console.error(`--branch goes with --from, the commit its worktree started from, so a new session can tell what it committed.`);
          return 1;
        }
        s = markAgent(s, { name: values.name, status: values.status as AgentStatus, at, kind: values.kind, worktree: values.worktree, branch: values.branch, from: values.from });
      }
      await save(runDir, s);
      return 0;
    }
    const runDir = positionals[0] ?? (await latest());
    if (!runDir) {
      console.error(`No run keeps its state in .aeom/runs yet.`);
      return 1;
    }
    const s = await load(runDir);
    const disk = await onDisk(s);
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
