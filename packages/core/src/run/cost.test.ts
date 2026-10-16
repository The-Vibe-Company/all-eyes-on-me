import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { costText, priceOf, projectKey, roleOf, runCost } from "./index.js";

const usage = (over: Record<string, unknown> = {}) => ({ input_tokens: 2, cache_creation_input_tokens: 1_000, cache_read_input_tokens: 100_000, output_tokens: 500, ...over });
const line = (at: string, id: string, model: string, u = usage()) => JSON.stringify({ type: "assistant", timestamp: at, message: { id, model, usage: u, content: [{ type: "text", text: "secret words of the conversation" }] } });
const prompt = (text: string) => JSON.stringify({ type: "user", timestamp: "2026-10-10T17:00:00.000Z", message: { role: "user", content: text } });

test("a call is priced at the API's list prices of its model, cache reads and writes apart", () => {
  // Opus 5.5: $4 in, $5 a 5-minute write, $8 an hour's, $0.20 a read, $20 out, per million.
  const opus = priceOf({ model: "claude-opus-5-5", input: 1_000_000, written5m: 1_000_000, written1h: 1_000_000, read: 1_000_000, output: 1_000_000 });
  assert.equal(opus, 4 + 5 + 8 + 0.2 + 20);
  const sonnet = priceOf({ model: "claude-sonnet-5-5", input: 0, written5m: 0, written1h: 0, read: 10_000_000, output: 100_000 });
  assert.equal(Math.round(sonnet! * 100) / 100, 1 + 1);
  assert.equal(priceOf({ model: "some-other-model", input: 1, written5m: 0, written1h: 0, read: 0, output: 0 }), null, "a model AEOM has no price for is not guessed");
});

test("an agent's role is read from the opening of its brief", () => {
  assert.equal(roleOf("You are an AEOM direction worker. Read the full brief first"), "directions");
  assert.equal(roleOf("You are the kit worker of an AEOM run on Bestia"), "kit");
  assert.equal(roleOf("You are an AEOM page worker. The judges failed this page on contrast"), "pages", "a worker's brief may name the judges");
  assert.equal(roleOf("You are the AEOM journey worker for « Voir les produits »"), "journeys");
  assert.equal(roleOf("You are judge number 2 for AEOM. The direction workers built"), "judges", "a judge's brief may name the workers");
  assert.equal(roleOf("You are duel judge 1 of duel 3 for AEOM"), "judges");
  assert.equal(roleOf("Investigate the build"), "other");
});

test("aeom cost sums a run's coordinator and agents, role by role, inside the run's window only, each message once", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-cost-"));
  try {
    const project = "/Users/x/Dev/Boutique";
    const dir = join(home, "projects", projectKey(project));
    const session = "11111111-2222-3333-4444-555555555555";
    await mkdir(join(dir, session, "subagents"), { recursive: true });
    await writeFile(
      join(dir, `${session}.jsonl`),
      [
        line("2026-10-09T10:00:00.000Z", "m0", "claude-opus-5-5"), // the day before: another work
        prompt("/aeom on Boutique: mkdir -p .aeom/runs/run-20261010-1700"),
        line("2026-10-10T17:01:00.000Z", "m1", "claude-opus-5-5"),
        line("2026-10-10T17:01:00.000Z", "m1", "claude-opus-5-5"), // the same message, logged once per content block
        line("2026-10-10T17:30:00.000Z", "m2", "claude-opus-5-5"),
      ].join("\n"),
    );
    await writeFile(join(dir, session, "subagents", "agent-a1.jsonl"), [prompt("You are an AEOM page worker. Read the brief"), line("2026-10-10T17:10:00.000Z", "w1", "claude-sonnet-5-5"), line("2026-10-10T17:11:00.000Z", "w2", "claude-sonnet-5-5")].join("\n"));
    await writeFile(join(dir, session, "subagents", "agent-a1.meta.json"), JSON.stringify({ agentType: "aeom-worker" }));
    await writeFile(join(dir, session, "subagents", "agent-a2.jsonl"), [prompt("You are judge number 1 for AEOM."), line("2026-10-10T17:20:00.000Z", "j1", "claude-sonnet-5-5")].join("\n"));
    // Another session of the same project that never ran this run.
    await writeFile(join(dir, "99999999-2222-3333-4444-555555555555.jsonl"), line("2026-10-10T17:05:00.000Z", "x1", "claude-opus-5-5"));

    const cost = await runCost({ run: "run-20261010-1700", cwd: project, from: "2026-10-10T17:00:00.000Z", to: "2026-10-10T18:00:00.000Z", claudeHome: home });
    assert.equal(cost.sessions, 1);
    const by = Object.fromEntries(cost.roles.map((r) => [r.role, r]));
    assert.equal(by.coordinator!.calls, 2, "each message once, and none from the day before");
    assert.equal(by.pages!.agents, 1);
    assert.equal(by.pages!.calls, 2);
    assert.equal(by.judges!.agents, 1);
    assert.deepEqual(by.pages!.models, ["claude-sonnet-5-5"]);
    // Opus: 2 calls of 100k read ($0.02 each), 1k written in 5 min ($0.005), 500 out ($0.01): $0.07.
    assert.equal(Math.round(by.coordinator!.dollars! * 1000) / 1000, 0.07);
    // Sonnet costs half: 3 calls at $0.0175.
    assert.ok(Math.abs(cost.total.dollars! - (0.07 + 0.0175 * 3)) < 0.0001, String(cost.total.dollars));
    const text = costText(cost);
    assert.match(text, /^run-20261010-1700, from 1 session and 2 agents/);
    assert.match(text, /Coordinator +the session +2 calls/);
    assert.match(text, /Pages +1 agent +2 calls/);
    assert.match(text, /Total +2 agents +5 calls[^\n]*≈ \$0\.12/);
    assert.doesNotMatch(text, /secret words/, "nothing of the conversation, only its counts");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
