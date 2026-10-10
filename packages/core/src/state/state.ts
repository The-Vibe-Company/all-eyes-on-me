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
  phase: string | null;
  /** The step of the skill, such as `2b.4`. */
  step: string | null;
  vars: Record<string, string>;
  agents: AgentState[];
  history: { phase: string; step: string | null; at: string }[];
}

export const newRunState = (run: string, at: string): RunState => ({ run, started: at, phase: null, step: null, vars: {}, agents: [], history: [] });

/** The run moves to a phase and a step, and keeps the values given. */
export function markRun(s: RunState, { phase, step, set = {}, at }: { phase: string; step?: string; set?: Record<string, string>; at: string }): RunState {
  if (!phase.trim()) throw new Error("A phase is named, such as directions or pages.");
  for (const key of Object.keys(set)) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`${key} is not a name a shell can set, such as KIT_BASE.`);
  return { ...s, phase, step: step ?? null, vars: { ...s.vars, ...set }, history: [...s.history, { phase, step: step ?? null, at }] };
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

/** What is on disk for each agent: whether its worktree is there, and how many commits its branch has since it started (null when the branch is gone). */
export interface OnDisk {
  worktrees: Record<string, boolean>;
  commits: Record<string, number | null>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Says, for a session that takes the run up, what to set again, what each agent left, and where to go on. */
export function resumePlan(s: RunState, disk: OnDisk): string {
  const lines = [`${s.run} stopped in "${s.phase ?? "nothing yet"}"${s.step ? `, at step ${s.step} of the skill` : ""}.`, "", "Set again:", `export RUN=${s.run}`, ...Object.entries(s.vars).map(([k, v]) => `export ${k}=${/^[\w./:@-]+$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`}`)];
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
      else if (commits === null && there === false) what = `its worktree and its branch are gone: create them again${a.from ? ` from ${a.from}` : ""} and launch it again`;
      else if (a.status === "done") what = `done${commits ? `, ${plural(commits, "commit")}` : ""}: check it and go on with it`;
      else if (!a.branch) what = "launched, not done: launch it again";
      else if (commits) what = `stopped with ${plural(commits, "commit")}: its work is there; check that it stays in its files, commit what is left, and go on with it`;
      else what = `stopped with nothing committed: launch it again${a.worktree ? ` in ${a.worktree}` : ""}`;
      lines.push(`  ${a.name.padEnd(width)}  ${(a.kind ?? "").padEnd(kinds)}  ${what}`);
    }
  }
  return lines;
}
