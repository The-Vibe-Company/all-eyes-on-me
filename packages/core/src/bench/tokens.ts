/** What model calls used, in tokens: what was sent, written to and read from the cache, and generated. */
export interface TokenCount {
  calls: number;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  total: number;
}

export interface RunTokens {
  since: string;
  until: string;
  /** The session that coordinated the run. */
  coordinator: TokenCount;
  /** Every agent it launched, judges and workers, each by what it was launched for. */
  agents: ({ agent: string } & TokenCount)[];
  total: TokenCount;
}

const zero = (): TokenCount => ({ calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, total: 0 });

function add(to: TokenCount, from: TokenCount): TokenCount {
  for (const key of Object.keys(to) as (keyof TokenCount)[]) to[key] += from[key];
  return to;
}

/**
 * The tokens of a run, from the transcripts of the session that coordinated
 * it (`agent: null`) and of the agents it launched: every model call between
 * `since` and `until`, each counted once, though a transcript writes a call
 * once per part of its answer.
 */
export function tokenUsage(transcripts: { agent: string | null; lines: string[] }[], { since, until }: { since: string; until: string }): RunTokens {
  const from = Date.parse(since), to = Date.parse(until);
  const coordinator = zero();
  const agents: ({ agent: string } & TokenCount)[] = [];
  for (const { agent, lines } of transcripts) {
    const count = zero();
    const seen = new Set<string>();
    for (const line of lines) {
      let entry: { type?: string; timestamp?: string; message?: { id?: string; usage?: Record<string, number> } };
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const usage = entry.message?.usage;
      const at = Date.parse(entry.timestamp ?? "");
      if (entry.type !== "assistant" || !usage || !(at >= from && at <= to)) continue;
      const id = entry.message!.id ?? `${entry.timestamp}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const call = { calls: 1, input: usage.input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0, output: usage.output_tokens ?? 0, total: 0 };
      call.total = call.input + call.cacheWrite + call.cacheRead + call.output;
      add(count, call);
    }
    if (agent === null) add(coordinator, count);
    else if (count.calls) agents.push({ agent, ...count });
  }
  const total = agents.reduce((sum, a) => add(sum, { calls: a.calls, input: a.input, cacheWrite: a.cacheWrite, cacheRead: a.cacheRead, output: a.output, total: a.total }), add(zero(), coordinator));
  return { since, until, coordinator, agents, total };
}
