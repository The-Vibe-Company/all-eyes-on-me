/**
 * Where a run is, kept in `.aeom/runs/<run>/state.json` as it goes, so a run
 * whose session closed can be taken up by another: its phase and the step of
 * the skill it is at, the values the skill set (the run checkout, the
 * worktrees' folder, the commits each wave starts from), and every agent it
 * launched with its worktree, its branch and where it is.
 */

export const AGENT_STATUSES = ["launched", "done", "merged", "refused"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export interface AgentState {
  name: string;
  kind?: string;
  status: AgentStatus;
  worktree?: string;
  branch?: string;
  /** The commit its worktree started from. */
  from?: string;
  at: string;
}

export interface RunState {
  run: string;
  started: string;
  /** The options the run was asked with, such as --sans-pr: a run taken up keeps them. */
  options: string[];
  phase: string | null;
  /** The step of the skill, such as `2b.4`. */
  step: string | null;
  vars: Record<string, string>;
  /** The run branch's commit when the run last noted where it is, to tell later commits apart. */
  branchAt: string | null;
  agents: AgentState[];
  history: { phase: string; step: string | null; at: string }[];
}

export const newRunState = (run: string, at: string): RunState => ({ run, started: at, options: [], phase: null, step: null, vars: {}, branchAt: null, agents: [], history: [] });

/** A state read from its file, with what an older or partial file leaves out filled in; null when it is not a run's state. */
export function readRunState(raw: unknown, run: string): RunState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Partial<RunState>;
  const fresh = newRunState(typeof r.run === "string" ? r.run : run, typeof r.started === "string" ? r.started : "");
  return {
    ...fresh,
    options: Array.isArray(r.options) ? r.options.filter((o): o is string => typeof o === "string") : [],
    phase: typeof r.phase === "string" ? r.phase : null,
    step: typeof r.step === "string" ? r.step : null,
    vars: r.vars && typeof r.vars === "object" && !Array.isArray(r.vars) ? r.vars : {},
    branchAt: typeof r.branchAt === "string" ? r.branchAt : null,
    agents: Array.isArray(r.agents) ? r.agents.filter((a) => a && typeof a.name === "string") : [],
    history: Array.isArray(r.history) ? r.history : [],
  };
}

/** The run moves to a phase and a step, and keeps the values given. */
export function markRun(
  s: RunState,
  { phase, step, set = {}, options, branchAt, at }: { phase: string; step?: string; set?: Record<string, string>; options?: string[]; branchAt?: string | null; at: string },
): RunState {
  if (!phase.trim()) throw new Error("A phase is named, such as directions or pages.");
  for (const key of Object.keys(set)) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`${key} is not a name a shell can set, such as KIT_BASE.`);
  return {
    ...s,
    ...(options ? { options } : {}),
    ...(branchAt !== undefined ? { branchAt } : {}),
    phase,
    step: step ?? null,
    vars: { ...s.vars, ...set },
    history: [...s.history, { phase, step: step ?? null, at }],
  };
}

/** An agent is launched, done, merged or refused; what it was launched with stays. */
export function markAgent(s: RunState, agent: Partial<Omit<AgentState, "name" | "status" | "at">> & { name: string; status: AgentStatus; at: string }): RunState {
  if (!AGENT_STATUSES.includes(agent.status)) throw new Error(`An agent is launched, done, merged or refused, not ${agent.status}.`);
  const known = s.agents.find((a) => a.name === agent.name);
  if (!known && agent.status !== "launched") throw new Error(`${agent.name} was never launched in this run: mark it launched first.`);
  const defined = Object.fromEntries(Object.entries(agent).filter(([, v]) => v !== undefined)) as typeof agent;
  const next: AgentState = { ...(known ?? {}), ...defined };
  return { ...s, agents: known ? s.agents.map((a) => (a.name === agent.name ? next : a)) : [...s.agents, next] };
}

/**
 * What is on disk: whether each agent's worktree is there; how many commits its
 * branch has since it started (null when the branch is gone, "unknown" when
 * they cannot be counted); whether the run branch already holds it; and the
 * run branch's commit, null when it does not exist.
 */
export interface OnDisk {
  worktrees: Record<string, boolean>;
  commits: Record<string, number | null | "unknown">;
  merged?: Record<string, boolean>;
  runBranch?: string | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Says, for a session that takes the run up, what to set again, what each agent left, and where to go on. */
export function resumePlan(s: RunState, disk: OnDisk): string {
  const lines = [`${s.run} stopped in "${s.phase ?? "nothing yet"}"${s.step ? `, at step ${s.step} of the skill` : ""}.`];
  if (s.options.length) lines.push(`It was asked with ${s.options.join(" ")}: take it up with the same options.`);
  if (disk.runBranch === null) lines.push(`The run branch aeom/${s.run} does not exist: the run stopped before it changed the project. Take it up on the branch it started from.`);
  else if (disk.runBranch && s.branchAt && disk.runBranch !== s.branchAt)
    lines.push(`The run branch moved since the run last noted where it was (${s.branchAt.slice(0, 7)} → ${disk.runBranch.slice(0, 7)}): read git log ${s.branchAt.slice(0, 7)}..aeom/${s.run}. Merges of the run's own agents are the run's; ask the user before going on over any other commit.`);
  else if (disk.runBranch) lines.push(`Check out aeom/${s.run}.`);
  lines.push("", "Set again:", `export RUN=${s.run}`, ...Object.entries(s.vars).map(([k, v]) => `export ${k}=${/^[\w./:@-]+$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`}`));
  lines.push(...agentLines(s, disk));
  lines.push("", s.step ? `Go on at step ${s.step}.` : `Go on with "${s.phase ?? "the run"}".`);
  return lines.join("\n");
}

/** Each agent and what it left, as the disk shows it; nothing when the run launched none. */
export function agentLines(s: RunState, disk: OnDisk): string[] {
  const lines: string[] = [];
  if (s.agents.length) {
    const width = Math.max(...s.agents.map((a) => a.name.length));
    const kinds = Math.max(...s.agents.map((a) => (a.kind ?? "").length));
    lines.push("", "Agents:");
    for (const a of s.agents) {
      const commits = a.branch ? disk.commits[a.branch] : undefined;
      const there = a.worktree ? disk.worktrees[a.worktree] : undefined;
      let what: string;
      if (a.status === "merged" || a.status === "refused") what = a.status;
      else if (a.branch && disk.merged?.[a.branch]) what = "its branch is already in the run branch: mark it merged";
      else if (commits === null && there === false) what = `its worktree and its branch are gone: create them again${a.from ? ` from ${a.from}` : ""} and launch it again`;
      else if (commits === "unknown") what = `its commits cannot be counted from ${a.from ?? "where it started"}: look at its branch, ${a.branch}`;
      else if (a.status === "done") what = `done${commits ? `, ${plural(commits, "commit")}` : ""}: check it as its step says, then go on with it`;
      else if (!a.branch) what = "launched, not done: launch it again";
      else if (commits) what = `stopped with ${plural(commits, "commit")}: its work may be unfinished; check that it stays in its files, commit what is left, run its checks as its step says, then go on with it`;
      else what = `stopped with nothing committed: if its worktree holds work in its files, commit it and check it; otherwise launch it again${a.worktree ? ` in ${a.worktree}` : ""}`;
      lines.push(`  ${a.name.padEnd(width)}  ${(a.kind ?? "").padEnd(kinds)}  ${what}`);
    }
  }
  return lines;
}
