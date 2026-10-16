import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const call = (at: string, id: string, model: string) => JSON.stringify({ type: "assistant", timestamp: at, message: { id, model, usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 1_000_000, output_tokens: 0 } } });

test("aeom cost says what the latest run cost, role by role, from this machine's transcripts, and keeps it in the run's folder", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "aeom-cost-cli-")));
  const project = join(root, "boutique");
  const home = join(root, "claude");
  const run = join(project, ".aeom", "runs", "run-20261010-1700");
  const env = { ...process.env, AEOM_TELEMETRY: "0", AEOM_HOME: join(root, ".home"), CLAUDE_CONFIG_DIR: home };
  try {
    await mkdir(run, { recursive: true });
    await writeFile(join(run, "state.json"), JSON.stringify({ run: "run-20261010-1700", started: "2026-10-10T15:00:00.000Z", phase: "done", step: null, options: [], vars: {}, branchAt: null, agents: [], history: [{ phase: "done", step: null, at: "2026-10-10T16:00:00.000Z" }] }));
    const none = await promisify(execFile)("node", [AEOM, "cost"], { cwd: project, env }).catch((e: { code: number; stderr: string }) => e);
    assert.equal((none as { code: number }).code, 1);
    assert.match((none as { stderr: string }).stderr, /No transcript of run-20261010-1700 on this machine/);

    const sessions = join(home, "projects", project.replace(/[^A-Za-z0-9]/g, "-"));
    await mkdir(join(sessions, "s1", "subagents"), { recursive: true });
    await writeFile(join(sessions, "s1.jsonl"), [JSON.stringify({ type: "user", timestamp: "2026-10-10T15:00:00.000Z", message: { content: "RUN=run-20261010-1700" } }), call("2026-10-10T15:10:00.000Z", "m1", "claude-opus-5-5"), call("2026-10-10T16:20:00.000Z", "m2", "claude-opus-5-5"), call("2026-10-10T17:00:00.000Z", "m3", "claude-opus-5-5")].join("\n"));
    await writeFile(join(sessions, "s1", "subagents", "agent-1.jsonl"), [JSON.stringify({ type: "user", message: { content: "You are judge number 1 for AEOM." } }), call("2026-10-10T15:20:00.000Z", "j1", "claude-sonnet-5-5")].join("\n"));
    const { stdout } = await promisify(execFile)("node", [AEOM, "cost"], { cwd: project, env });
    // Up to half an hour after the last mark: m3, an hour after, is another work.
    assert.match(stdout, /Coordinator +the session +2 calls +2\.0 M read/);
    assert.match(stdout, /Judges +1 agent +1 call/);
    assert.match(stdout, /Total +1 agent +3 calls[^\n]*≈ \$0\.50/);
    assert.ok(existsSync(join(run, "cost.json")));
    assert.equal(JSON.parse(readFileSync(join(run, "cost.json"), "utf8")).total.calls, 3);

    // The same session redoes the front at 16:10: the first run's window stops there, its half hour cut short.
    const next = join(project, ".aeom", "runs", "run-20261010-1810");
    await mkdir(next, { recursive: true });
    await writeFile(join(next, "state.json"), JSON.stringify({ run: "run-20261010-1810", started: "2026-10-10T16:10:00Z", phase: "understand", step: null, options: [], vars: {}, branchAt: null, agents: [], history: [] }));
    const first = await promisify(execFile)("node", [AEOM, "cost", run], { cwd: project, env });
    assert.match(first.stdout, /Coordinator +the session +1 call /, "m2, at 16:20, is the next run's");
    // A run with no state starts at the time its name gives, on this machine's clock.
    const old = join(project, ".aeom", "runs", "run-20261010-1505");
    await mkdir(old, { recursive: true });
    await writeFile(join(sessions, "s3.jsonl"), [JSON.stringify({ type: "user", timestamp: "2026-10-10T15:05:00.000Z", message: { content: "RUN=run-20261010-1505" } }), call("2026-10-10T15:06:00.000Z", "o1", "claude-opus-5-5")].join("\n"));
    const named = await promisify(execFile)("node", [AEOM, "cost", old, "--json"], { cwd: project, env: { ...env, TZ: "UTC" } });
    assert.equal(JSON.parse(named.stdout).from, "2026-10-10T15:05:00.000Z");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
