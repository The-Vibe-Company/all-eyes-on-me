import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
let dir: string;
const run = async (args: string[]) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd: dir });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};

const report = (calls: { method: string; path: string; fields?: string[] }[]) => ({
  url: "http://x",
  replayedAt: "",
  widths: [1280],
  warnings: [],
  journeys: [{ slug: "add", name: "Add a product", runs: [{ width: 1280, steps: [], calls: calls.map((c) => ({ query: [], fields: [], ...c })), screens: [], counts: { steps: 0, screens: 0, back: 0 }, broken: null, sheet: "" }] }],
});

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "aeom-guard-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@example.test");
  git("config", "user.name", "Test");
  await mkdir(join(dir, ".aeom"));
  await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ protected: ["server.mjs", "db/**"] }));
  await writeFile(join(dir, "server.mjs"), "// routes\n");
  await writeFile(join(dir, "page.html"), "<a href='/orders'>Voir mes commandes</a>\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  const panier = { method: "POST", path: "/api/panier", fields: ["item"] };
  const replays: [string, { method: string; path: string; fields?: string[] }[]][] = [["before", []], ["same", []], ["feature", [panier]], ["feature-and-more", [panier, { method: "DELETE", path: "/api/compte" }]]];
  for (const [name, calls] of replays) {
    await mkdir(join(dir, name));
    await writeFile(join(dir, name, "report.json"), JSON.stringify(report(calls)));
  }
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("moving a link changes no call and no protected file: it passes", async () => {
  await writeFile(join(dir, "page.html"), "<nav><a href='/orders'>Mes commandes</a></nav>\n");
  const { code, out } = await run(["guard", "before", "same", "--base", "HEAD"]);
  assert.equal(code, 0, out);
  assert.match(out, /No feature added: every call was made before, and no protected file changed/);
});

test("a new call and a changed server file are refused, each named", async () => {
  await writeFile(join(dir, "server.mjs"), "// routes\napp.post('/api/panier')\n");
  try {
    const { code, out } = await run(["guard", "before", "feature", "--base", "HEAD"]);
    assert.equal(code, 1);
    assert.match(out, /✗ POST \/api\/panier\s+a call the app did not make before, in "Add a product"/);
    assert.match(out, /✗ server\.mjs\s+a file that holds the app's data or logic/);
  } finally {
    execFileSync("git", ["checkout", "--", "server.mjs"], { cwd: dir });
  }
});

test("an explicit request lets through what it needs, and only with the user's words", async () => {
  await writeFile(join(dir, "server.mjs"), "// routes\napp.post('/api/panier')\n");
  try {
    const bare = await run(["guard", "before", "feature", "--allow", "POST /api/panier"]);
    assert.equal(bare.code, 1);
    assert.match(bare.out, /--allow needs --feature/);
    const asked = await run(["guard", "before", "feature", "--base", "HEAD", "--feature", "Un vrai panier, quand on clique Ajouter", "--allow", "POST /api/panier", "--allow", "server.mjs"]);
    assert.equal(asked.code, 0, asked.out);
    assert.match(asked.out, /✓ POST \/api\/panier\s+let through for the feature asked: "Un vrai panier, quand on clique Ajouter"/);
    assert.match(asked.out, /Nothing else: every other call was made before, and no other protected file changed/);
    assert.doesNotMatch(asked.out, /No feature added/, "a feature was added: the one asked");
    // The request lets through what it names, and only that.
    const more = await run(["guard", "before", "feature-and-more", "--base", "HEAD", "--feature", "Un vrai panier, quand on clique Ajouter", "--allow", "POST /api/panier", "--allow", "server.mjs"]);
    assert.equal(more.code, 1);
    assert.match(more.out, /✓ POST \/api\/panier/);
    assert.match(more.out, /✗ DELETE \/api\/compte\s+a call the app did not make before/);
  } finally {
    execFileSync("git", ["checkout", "--", "server.mjs"], { cwd: dir });
  }
});
