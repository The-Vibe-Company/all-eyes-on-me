import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const freePort = () =>
  new Promise<number>((done) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => done(port));
    });
  });

test("aeom bench prepares each app as a repository of its own, its defects kept out, says which does not start, then scores the last run of each against its defects", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "aeom-bench-")));
  const env = { ...process.env, AEOM_HOME: join(root, ".home"), AEOM_TELEMETRY: "0" };
  const run = (args: string[]) => promisify(execFile)("node", [AEOM, ...args], { cwd: root, env }).then((r) => ({ code: 0, out: r.stdout + r.stderr }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
  try {
    const bench = join(root, "bench");
    const port = await freePort();
    // Boutique starts and answers; Atelier's start command fails.
    await mkdir(join(bench, "boutique", "app"), { recursive: true });
    await mkdir(join(bench, "boutique", "aeom", "journeys"), { recursive: true });
    await writeFile(join(bench, "boutique", "app", "server.mjs"), `import { createServer } from "node:http";\ncreateServer((q, r) => r.end("<h1>Boutique</h1>")).listen(${port}, "127.0.0.1");\n`);
    await writeFile(join(bench, "boutique", "aeom", "config.json"), JSON.stringify({ url: `http://127.0.0.1:${port}`, start: "node server.mjs" }));
    await writeFile(join(bench, "boutique", "defects.json"), JSON.stringify({ app: "boutique", noted: "by hand", defects: [{ id: "faint", where: "/", what: "faint text", match: ["contrast"] }, { id: "empty", where: "/panier", what: "an empty cart says nothing", match: ["states"] }] }));
    await mkdir(join(bench, "atelier", "app"), { recursive: true });
    await mkdir(join(bench, "atelier", "aeom"), { recursive: true });
    await writeFile(join(bench, "atelier", "aeom", "config.json"), JSON.stringify({ url: "http://127.0.0.1:1", start: "node -e \"process.exit(1)\"" }));
    await writeFile(join(bench, "atelier", "defects.json"), JSON.stringify({ app: "atelier", noted: "by hand", defects: [{ id: "x", where: "/", what: "x", match: ["cursor"] }] }));

    const out = join(root, "runs");
    const prepared = await run(["bench", "prepare", out, "--bench", bench]);
    assert.equal(prepared.code, 0, prepared.out);
    assert.match(prepared.out, /boutique: [^\n]*, starts at http:\/\/127\.0\.0\.1:\d+/);
    assert.match(prepared.out, /atelier: [^\n]*, does not start/);
    assert.ok(existsSync(join(out, "boutique", ".git")) && existsSync(join(out, "boutique", ".aeom", "config.json")) && existsSync(join(out, "boutique", "server.mjs")));
    assert.ok(!existsSync(join(out, "boutique", "defects.json")), "the run never sees the defects");

    // Boutique's run found the faint text and nothing of the cart; Atelier has no run.
    const runDir = join(out, "boutique", ".aeom", "runs", "run-20261019-1500");
    await mkdir(join(runDir, "before", "captures"), { recursive: true });
    await writeFile(join(runDir, "before", "captures", "manifest.json"), JSON.stringify({ url: `http://127.0.0.1:${port}`, capturedAt: "", widths: [390, 1280], pages: [], errors: [] }));
    await writeFile(join(runDir, "verdict.json"), JSON.stringify({ nothingToRedo: false, line: "Measured: 1 screen.", failures: [{ kind: "check", where: "/", what: "contrast: h1 is 2.1:1, needs 4.5:1" }, { kind: "principle", where: "/", what: "hierarchy: nothing leads" }] }));
    await writeFile(join(runDir, "cost.json"), JSON.stringify({ total: { dollars: 12.4 } }));
    const scored = await run(["bench", "score", out, "--bench", bench]);
    assert.equal(scored.code, 0, scored.out);
    assert.match(scored.out, /atelier +not measured: no run in /);
    assert.match(scored.out, /boutique +found 1\/2 +fixed 0\/2 +0 regressions +0 hidden features +≈ \$12/);
    assert.match(scored.out, /◐ faint +found, the end not measured +\/: contrast: h1 is 2\.1:1/);
    assert.match(scored.out, /Beyond the defects noted[\s\S]*\/: hierarchy: nothing leads/);
    assert.equal(JSON.parse(readFileSync(join(out, "benchmark.json"), "utf8")).apps.length, 2);
    // A second prepare leaves a project already there as it is.
    assert.match((await run(["bench", "prepare", out, "--bench", bench])).out, /boutique: [^\n]* is not empty, left as it is/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
