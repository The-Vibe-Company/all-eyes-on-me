import { createReadStream } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

/**
 * What a run really cost, read from the transcripts Claude Code keeps on this
 * machine: the session that coordinated it and every agent it launched, each
 * call's tokens priced at the API's list prices of its model. Only the counts
 * are read, and the opening of each agent's brief to tell its role: nothing of
 * the conversations is kept or printed, and nothing leaves the machine.
 */

export type Role = "coordinator" | "directions" | "kit" | "pages" | "journeys" | "judges" | "other";
export const ROLES: Role[] = ["coordinator", "directions", "kit", "pages", "journeys", "judges", "other"];

/** One call's tokens: what it read anew, read again from the cache, wrote into it, and produced. */
export interface Usage {
  model: string;
  input: number;
  read: number;
  written5m: number;
  written1h: number;
  output: number;
}

export interface RoleCost {
  role: Role;
  agents: number;
  calls: number;
  read: number;
  written: number;
  output: number;
  models: string[];
  /** At the API's list prices; null when a model AEOM has no price for took part. */
  dollars: number | null;
}

export interface RunCost {
  run: string;
  from: string;
  to: string;
  sessions: number;
  roles: RoleCost[];
  total: { agents: number; calls: number; dollars: number | null };
}

interface Price {
  input: number;
  write5m: number;
  write1h: number;
  read: number;
  output: number;
}

/**
 * Per million tokens, platform.claude.com/docs/en/about-claude/pricing, October 2026.
 * Haiku 5.5 costs five times more on a prompt over 100,000 tokens.
 */
const PRICES: [RegExp, Price, Price?][] = [
  [/opus-5-5/, { input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 }],
  [/opus-(5|4-\d)(?!-\d)|opus-4-\d/, { input: 5, write5m: 6.25, write1h: 10, read: 0.5, output: 25 }],
  [/sonnet-5-5/, { input: 2, write5m: 2.5, write1h: 4, read: 0.1, output: 10 }],
  [/sonnet-5(?!-\d)/, { input: 2, write5m: 2.5, write1h: 4, read: 0.2, output: 10 }],
  [/sonnet-4-\d/, { input: 3, write5m: 3.75, write1h: 6, read: 0.3, output: 15 }],
  [/haiku-5-5/, { input: 0.1, write5m: 0.125, write1h: 0.2, read: 0.01, output: 0.5 }, { input: 0.5, write5m: 0.625, write1h: 1, read: 0.05, output: 2.5 }],
  [/fable-5-1/, { input: 10, write5m: 12.5, write1h: 20, read: 0.25, output: 50 }],
];

/** One call at its model's list price, in dollars; null for a model with no price here. */
export function priceOf(u: Usage): number | null {
  const found = PRICES.find(([model]) => model.test(u.model));
  if (!found) return null;
  const [, price, long] = found;
  const p = long && u.input + u.read + u.written5m + u.written1h > 100_000 ? long : price;
  return (u.input * p.input + u.written5m * p.write5m + u.written1h * p.write1h + u.read * p.read + u.output * p.output) / 1_000_000;
}

/** The role of an agent, from the opening of its brief: the first of a worker's kind or a judge it names. */
export function roleOf(brief: string): Role {
  const opening = brief.slice(0, 600).toLowerCase();
  const kinds: [Role, RegExp][] = [
    ["directions", /direction worker|worker (?:of|for) the direction/],
    ["kit", /kit worker|promotion worker/],
    ["journeys", /journey worker/],
    ["pages", /page worker|screen worker|integration worker/],
    ["judges", /\bjudge\b|\bvoter\b/],
  ];
  let best: { role: Role; at: number } = { role: "other", at: Infinity };
  for (const [role, pattern] of kinds) {
    const at = opening.search(pattern);
    if (at >= 0 && at < best.at) best = { role, at };
  }
  return best.role;
}

/** The folder name Claude Code gives a project's transcripts: its path, every other character a dash. */
export const projectKey = (path: string) => path.replace(/[^A-Za-z0-9]/g, "-");

const claudeHomeOf = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

/** A transcript's calls inside the window, each message once, and whether it names the run. */
async function readTranscript(file: string, run: string, from: string, to: string): Promise<{ calls: Usage[]; names: boolean; brief: string }> {
  const calls = new Map<string, Usage>();
  let names = false;
  let brief = "";
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!names && line.includes(run)) names = true;
    if (!line.includes('"usage"') && brief) continue;
    let entry: { type?: string; timestamp?: string; message?: { id?: string; model?: string; usage?: Record<string, unknown>; content?: unknown } };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const message = entry.message;
    if (!brief && entry.type === "user" && message) {
      const content = message.content;
      brief = typeof content === "string" ? content : Array.isArray(content) ? content.map((b: { text?: string }) => b?.text ?? "").join(" ") : "";
      brief = brief.slice(0, 600);
    }
    if (entry.type !== "assistant" || !message?.usage || !message.model || message.model.startsWith("<")) continue;
    const at = entry.timestamp ?? "";
    if (at < from || at > to) continue;
    const u = message.usage as Record<string, number | Record<string, number> | undefined>;
    const n = (k: string) => (typeof u[k] === "number" ? (u[k] as number) : 0);
    const split = (u.cache_creation ?? {}) as Record<string, number>;
    const hour = typeof split.ephemeral_1h_input_tokens === "number" ? split.ephemeral_1h_input_tokens : 0;
    const call: Usage = { model: message.model, input: n("input_tokens"), read: n("cache_read_input_tokens"), written1h: hour, written5m: Math.max(0, n("cache_creation_input_tokens") - hour), output: n("output_tokens") };
    // A message is logged once per block of its content: the same id, its count growing to the last.
    const id = message.id ?? `${at}-${calls.size}`;
    const seen = calls.get(id);
    if (!seen || call.output >= seen.output) calls.set(id, call);
  }
  return { calls: [...calls.values()], names, brief };
}

/** The transcript files of a project's sessions, its worktrees' included, changed since the run started. */
async function projectSessions(cwd: string, from: string, claudeHome: string): Promise<{ dir: string; id: string }[]> {
  const projects = join(claudeHome, "projects");
  // The folder as the session saw it, a link or its target.
  const keys = new Set([projectKey(cwd), projectKey(await realpath(cwd).catch(() => cwd))]);
  const dirs = (await readdir(projects).catch(() => [] as string[])).filter((d) => [...keys].some((key) => d === key || d.startsWith(`${key}-`)));
  const found: { dir: string; id: string }[] = [];
  for (const d of dirs) {
    for (const file of await readdir(join(projects, d)).catch(() => [] as string[])) {
      if (!file.endsWith(".jsonl")) continue;
      const changed = await stat(join(projects, d, file)).then((s) => s.mtime.toISOString(), () => "");
      if (changed >= from) found.push({ dir: join(projects, d), id: file.slice(0, -".jsonl".length) });
    }
  }
  return found;
}

/** What a run cost, role by role: the sessions of the project that name it, and their agents, inside its window. */
export async function runCost({ run, cwd, from, to, claudeHome = claudeHomeOf() }: { run: string; cwd: string; from: string; to: string; claudeHome?: string }): Promise<RunCost> {
  const roles = new Map<Role, { agents: number; calls: Usage[] }>(ROLES.map((r) => [r, { agents: 0, calls: [] }]));
  let sessions = 0;
  for (const { dir, id } of await projectSessions(cwd, from, claudeHome)) {
    const main = await readTranscript(join(dir, `${id}.jsonl`), run, from, to);
    if (!main.names) continue;
    sessions++;
    roles.get("coordinator")!.calls.push(...main.calls);
    const agentsDir = join(dir, id, "subagents");
    for (const file of (await readdir(agentsDir).catch(() => [] as string[])).filter((f) => f.endsWith(".jsonl"))) {
      const agent = await readTranscript(join(agentsDir, file), run, from, to);
      if (!agent.calls.length) continue;
      const meta = await readFile(join(agentsDir, file.replace(/\.jsonl$/, ".meta.json")), "utf8").then((t) => JSON.parse(t) as { agentType?: string }, () => ({}) as { agentType?: string });
      const role = meta.agentType === "aeom-judge" ? "judges" : roleOf(agent.brief);
      const r = roles.get(role)!;
      r.agents++;
      r.calls.push(...agent.calls);
    }
  }
  const costs: RoleCost[] = [];
  for (const [role, { agents, calls }] of roles) {
    if (!calls.length) continue;
    const priced = calls.map(priceOf);
    costs.push({
      role,
      agents,
      calls: calls.length,
      read: calls.reduce((t, c) => t + c.read, 0),
      written: calls.reduce((t, c) => t + c.written5m + c.written1h, 0),
      output: calls.reduce((t, c) => t + c.output, 0),
      models: [...new Set(calls.map((c) => c.model))].sort(),
      dollars: priced.some((d) => d === null) ? null : priced.reduce((t: number, d) => t + d!, 0),
    });
  }
  const dollars = costs.some((c) => c.dollars === null) ? null : costs.reduce((t, c) => t + c.dollars!, 0);
  return { run, from, to, sessions, roles: costs, total: { agents: costs.reduce((t, c) => t + c.agents, 0), calls: costs.reduce((t, c) => t + c.calls, 0), dollars } };
}

const LABELS: Record<Role, string> = { coordinator: "Coordinator", directions: "Directions", kit: "Kit", pages: "Pages", journeys: "Journeys", judges: "Judges", other: "Other agents" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const millions = (n: number) => `${(n / 1_000_000).toFixed(1)} M`;
export const dollarsText = (d: number | null) => (d === null ? "no price" : d < 10 ? `≈ $${d.toFixed(2)}` : `≈ $${Math.round(d)}`);

/** The cost as a table, role by role, then how to read it. */
export function costText(cost: RunCost): string {
  const rows = cost.roles.map((r) => [LABELS[r.role], r.role === "coordinator" ? "the session" : plural(r.agents, "agent"), plural(r.calls, "call"), `${millions(r.read)} read`, `${millions(r.written)} written`, `${millions(r.output)} out`, r.models.map((m) => m.replace(/^claude-/, "")).join(", "), dollarsText(r.dollars)]);
  rows.push(["Total", plural(cost.total.agents, "agent"), plural(cost.total.calls, "call"), "", "", "", "", dollarsText(cost.total.dollars)]);
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  const table = rows.map((r) => r.map((cell, i) => (i === 0 || i === 6 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join("  ").trimEnd());
  const head = `${cost.run}, from ${plural(cost.sessions, "session")} and ${plural(cost.total.agents, "agent")}, ${cost.from.slice(0, 16).replace("T", " ")} to ${cost.to.slice(0, 16).replace("T", " ")} UTC:`;
  return `${head}\n\n${table.join("\n")}\n\nAt the API's list prices of each model; a Claude plan counts the same use its own way. Read is what each call reads again from the cache, most of what a run costs: the longer an agent's context and the more calls it makes, the more it reads.`;
}
