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

test("prices follow the model's family and version, dated names included; a model with no price leaves the rest priced", () => {
  const one = (model: string) => priceOf({ model, input: 1_000_000, written5m: 0, written1h: 0, read: 0, output: 0 });
  assert.equal(one("claude-opus-4-1-20250805"), 15);
  assert.equal(one("claude-opus-4-20250514"), 15);
  assert.equal(one("claude-opus-4-5-20251101"), 5);
  assert.equal(one("claude-sonnet-5-20261001"), 2);
  assert.equal(one("claude-haiku-4-5-20251001"), 1);
  // Haiku 5.5 costs five times more on a prompt over 100,000 tokens.
  assert.equal(priceOf({ model: "claude-haiku-5-5", input: 50_000, written5m: 0, written1h: 0, read: 0, output: 0 }), 0.005);
  assert.equal(priceOf({ model: "claude-haiku-5-5", input: 200_000, written5m: 0, written1h: 0, read: 0, output: 0 }), 0.1);
});

test("a message is counted once in the whole run, at its last count; writes split by the cache's hour or five minutes; roles from the agent's type, its launch and its brief", async () => {
  const home = await mkdtemp(join(tmpdir(), "aeom-cost-"));
  try {
    const project = "/Users/x/Dev/Boutique";
    const dir = join(home, "projects", projectKey(project));
    await mkdir(join(dir, "s1", "subagents"), { recursive: true });
    const nested = { input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 } };
    await writeFile(
      join(dir, "s1.jsonl"),
      [
        prompt("RUN=run-20261010-1700"),
        line("2026-10-10T17:01:00.000Z", "m1", "claude-opus-5-5", usage({ output_tokens: 10 })),
        line("2026-10-10T17:01:00.000Z", "m1", "claude-opus-5-5", usage({ output_tokens: 500 })), // the last block of the same message
        line("2026-10-10T17:02:00.000Z", "m2", "claude-opus-5-5", nested as never),
        line("2026-10-10T17:03:00.000Z", "m3", "some-model-with-no-price"),
      ].join("\n"),
    );
    // The same session taken up again: it copies the messages it takes up into a file of its own.
    await writeFile(join(dir, "s2.jsonl"), [prompt("--reprendre run-20261010-1700"), line("2026-10-10T17:01:00.000Z", "m1", "claude-opus-5-5", usage({ output_tokens: 500 }))].join("\n"));
    const sub = join(dir, "s1", "subagents");
    await writeFile(join(sub, "agent-1.jsonl"), [JSON.stringify({ type: "user", isMeta: true, message: { content: "Warmup" } }), JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "<system-reminder>a page worker</system-reminder>" }, { type: "text", text: "Rebuild the page /pricing in your worktree" }] } }), line("2026-10-10T17:10:00.000Z", "a1", "claude-sonnet-5-5")].join("\n"));
    await writeFile(join(sub, "agent-1.meta.json"), JSON.stringify({ agentType: "aeom-worker", description: "Page worker /pricing" }));
    await writeFile(join(sub, "agent-2.jsonl"), [prompt("Read the brief in brief.md"), line("2026-10-10T17:11:00.000Z", "a2", "claude-sonnet-5-5")].join("\n"));
    await writeFile(join(sub, "agent-2.meta.json"), JSON.stringify({ agentType: "aeom-judge", description: "Vote 1" }));
    await writeFile(join(sub, "agent-3.jsonl"), [prompt("Rebuild the page /pricing in your worktree"), line("2026-10-10T17:12:00.000Z", "a3", "claude-sonnet-5-5")].join("\n"));

    const cost = await runCost({ run: "run-20261010-1700", cwd: project, from: "2026-10-10T17:00:00.000Z", to: "2026-10-10T18:00:00.000Z", claudeHome: home });
    assert.equal(cost.sessions, 2);
    const by = Object.fromEntries(cost.roles.map((r) => [r.role, r]));
    assert.equal(by.coordinator!.calls, 3, "m1 once across both files, m2, m3");
    assert.equal(by.coordinator!.output, 500 + 500, "m1 at its last count, 500 and not 510, and m3's");
    assert.equal(by.coordinator!.written, 1_000 + 2_000_000 + 1_000, "the five minutes' writes kept when the usage only splits them");
    assert.equal(by.coordinator!.unpriced, 1);
    // m1: $0.035; m2: 1 M written for five minutes ($5) and 1 M for the hour ($8): $13.035, the unpriced call left out.
    assert.ok(Math.abs(by.coordinator!.dollars! - 13.035) < 0.0001, String(by.coordinator!.dollars));
    assert.equal(by.pages!.agents, 1, "the launch's description says a page worker, though its brief does not");
    assert.equal(by.judges!.agents, 1, "an aeom-judge agent is a judge");
    assert.equal(by.other!.agents, 1, "a brief that says nothing of its role, launched with no name: other");
    assert.match(costText(cost), /1 call of a model with no price here, left out of the dollars\./);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
