import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const run = async (cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd, env: { ...process.env, ...env } });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};
const put = async (file: string, content: unknown) => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
};
const git = (cwd: string, ...args: string[]) => promisify(execFile)("git", args, { cwd });

const snapshot = async (dir: string, failing: Record<string, string[]>, findings: { page: string; check: string }[] = []) => {
  const pages = Object.keys(failing);
  await put(join(dir, "captures", "manifest.json"), { url: "http://x", capturedAt: "", widths: [390], errors: [], pages: pages.map((p) => ({ url: `http://x${p}`, path: p, files: [{ width: 390, file: "x.png" }] })) });
  await put(join(dir, "reports", "check.json"), { url: "http://x", checkedAt: "", widths: [390], checks: ["cursor", "overflow", "contrast", "console"], pages: pages.map((p) => `http://x${p}`), errors: [], findings: findings.map((f) => ({ check: f.check, url: `http://x${f.page}`, width: 390, message: `${f.check} fails` })) });
  await put(join(dir, "reports", "judge.json"), { judgedAt: "", voters: ["1", "2", "3"], principles: [{ id: "states", text: "" }, { id: "hierarchy", text: "" }], failures: 0, pages: pages.map((page) => ({ page, verdicts: ["states", "hierarchy"].map((principle) => ({ principle, pass: !failing[page]!.includes(principle), votes: "", reasons: [`${principle}: the list is blank`], dissent: [], steps: [] })) })) });
};
const replay = async (dir: string, calls: string[]) => {
  await put(join(dir, "report.json"), { url: "http://x", replayedAt: "", widths: [390], warnings: [], journeys: [{ slug: "emprunter", name: "Emprunter un objet", runs: [{ width: 390, steps: [], calls: calls.map((c) => ({ method: c.split(" ")[0], path: c.split(" ")[1], query: [], fields: [] })), screens: ["/"], counts: { steps: 3, screens: 2, back: 0 }, broken: null, sheet: "s.png" }] }] });
  await put(join(dir, "judge-journeys.json"), { judgedAt: "", voters: ["1", "2", "3"], principles: [{ id: "next-step", text: "" }], failures: 0, pages: [{ page: "emprunter", verdicts: [{ principle: "next-step", pass: true, votes: "", reasons: [], dissent: [], steps: [] }] }] });
};

/** An app's repository after a run: the run's branch changed a protected file, its journeys make a call the app never made. */
async function benchRun() {
  const dir = await mkdtemp(join(tmpdir(), "aeom-bench-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "t@example.test");
  await git(dir, "config", "user.name", "T");
  await put(join(dir, ".gitignore"), ".aeom/runs/\n");
  await put(join(dir, ".aeom", "config.json"), { url: "http://localhost:4401", start: "node server.mjs", protected: ["data/**"] });
  await put(join(dir, "data", "objets.json"), "[]");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "app");
  await git(dir, "checkout", "-qb", "aeom/run-1");
  await put(join(dir, "data", "objets.json"), "[{}]");
  await git(dir, "commit", "-qam", "aeom: a page");
  await git(dir, "checkout", "-q", "main");
  const R = join(dir, ".aeom", "runs", "run-1");
  await put(join(R, "base"), "main\n");
  await snapshot(join(R, "before"), { "/objets": ["hierarchy"], "/mes-emprunts": ["states"], "/": [] }, [{ page: "/objets", check: "contrast" }]);
  await snapshot(join(R, "end"), { "/objets": ["hierarchy"], "/mes-emprunts": [], "/": [] }, [{ page: "/", check: "cursor" }]);
  await replay(join(R, "journeys-before"), ["GET /api/objets"]);
  await replay(join(R, "journeys-end"), ["GET /api/objets", "POST /api/relance"]);
  await put(join(R, "verdict.json"), {
    nothingToRedo: false,
    line: "Measured: 3 screens.",
    failures: [
      { kind: "check", where: "/objets", rule: "contrast", what: "contrast: .categorie: 2.9:1" },
      { kind: "principle", where: "/objets", rule: "hierarchy", what: "hierarchy: no title stands out" },
      { kind: "principle", where: "/mes-emprunts", rule: "states", what: "states: the list is blank" },
    ],
  });
  await put(join(dir, "defects.json"), {
    app: "Le Prêt",
    defects: [
      { id: "pret-01", screen: "/objets", rule: "contrast", what: "Les catégories en gris clair." },
      { id: "pret-02", screen: "/mes-emprunts", rule: "states", what: "Sans emprunt, la page est blanche." },
      { id: "pret-03", journey: "emprunter", rule: "next-step", what: "Le bouton de confirmation est caché." },
    ],
  });
  return { dir, R };
}

test("aeom bench grade says what a run found and fixed of the noted defects, with proof, what it broke, and the features it slipped in", async () => {
  const { dir, R } = await benchRun();
  try {
    await put(join(R, "tokens.json"), { since: "", until: "", coordinator: {}, agents: [], total: { calls: 12, input: 1, cacheWrite: 2, cacheRead: 3, output: 4, total: 1234 } });
    const { code, out } = await run(dir, ["bench", "grade", ".aeom/runs/run-1", "--defects", "defects.json", "--app", "pret"]);
    assert.equal(code, 0, out);
    assert.match(out, /Found 2 of 3 noted defects/);
    assert.match(out, /pret-01 .*contrast: \.categorie: 2\.9:1/);
    assert.match(out, /Fixed 2 of 3/);
    assert.match(out, /Missed: pret-03/);
    assert.match(out, /Regression: \/ cursor/);
    assert.match(out, /Beyond the list: \/objets hierarchy/);
    assert.match(out, /POST \/api\/relance/);
    assert.match(out, /data\/objets\.json/);
    assert.match(out, /1234 tokens/);
    const grading = JSON.parse(await readFile(join(R, "grading.json"), "utf8"));
    assert.deepEqual(grading.found.map((f: { id: string }) => f.id), ["pret-01", "pret-02"]);
    assert.equal(grading.features.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a defect list AEOM cannot grade against is refused, and an app that did not start is graded on nothing", async () => {
  const { dir, R } = await benchRun();
  try {
    await put(join(dir, "bad.json"), { app: "x", defects: [{ id: "a", screen: "/", rule: "pretty", what: "ugly" }] });
    const bad = await run(dir, ["bench", "grade", ".aeom/runs/run-1", "--defects", "bad.json", "--app", "pret"]);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /a: "pretty" is not measured on a screen/);
    assert.ok(!existsSync(join(R, "grading.json")));
    const down = await run(dir, ["bench", "grade", ".aeom/runs/run-1", "--defects", "defects.json", "--app", "pret", "--not-started", "node server.mjs exited with 1"]);
    assert.equal(down.code, 0, down.out);
    assert.match(down.out, /pret did not start: node server\.mjs exited with 1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom bench table lays the apps side by side and keeps the table", async () => {
  const { dir, R } = await benchRun();
  try {
    assert.equal((await run(dir, ["bench", "grade", ".aeom/runs/run-1", "--defects", "defects.json", "--app", "pret"])).code, 0);
    const { code, out } = await run(dir, ["bench", "table", join(R, "grading.json"), "--out", "benchmark.json"]);
    assert.equal(code, 0, out);
    assert.match(out, /App\s+Found\s+Fixed\s+Regressions\s+Features\s+Beyond the list\s+Tokens/);
    assert.match(out, /pret\s+2\/3\s+2\/3\s+1\s+2\s+1\s+not counted/);
    assert.equal(JSON.parse(await readFile(join(dir, "benchmark.json"), "utf8")).rows[0].app, "pret");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom tokens counts every model call of the run, the session's and its agents', from the session's transcripts", async () => {
  const { dir, R } = await benchRun();
  const config = await mkdtemp(join(tmpdir(), "aeom-claude-"));
  try {
    const usage = { input_tokens: 1, cache_creation_input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 1000 };
    const call = (id: string, at: string) => JSON.stringify({ type: "assistant", timestamp: at, message: { id, usage } });
    const project = join(config, "projects", "-some-project");
    await put(join(project, "s-1.jsonl"), [call("c0", "2020-01-01T00:00:00Z"), call("c1", new Date().toISOString())].join("\n"));
    await put(join(project, "s-1", "subagents", "agent-a1.jsonl"), call("a1", new Date().toISOString()));
    await put(join(project, "s-1", "subagents", "agent-a1.meta.json"), { description: "Kit worker" });
    await put(join(R, "started"), new Date(Date.now() - 60_000).toISOString());
    const { code, out } = await run(dir, ["tokens", ".aeom/runs/run-1"], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: "s-1" });
    assert.equal(code, 0, out);
    assert.match(out, /2 model calls, 2222 tokens: 1111 by the session, 1111 by 1 agent/);
    const tokens = JSON.parse(await readFile(join(R, "tokens.json"), "utf8"));
    assert.deepEqual(tokens.agents.map((a: { agent: string }) => a.agent), ["Kit worker"]);
    const none = await run(dir, ["tokens", ".aeom/runs/run-1"], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: "nope" });
    assert.equal(none.code, 1);
    assert.match(none.out, /No transcript of the session nope/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(config, { recursive: true, force: true });
  }
});
