import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
let dir = "";
const run = async (args: string[], cwd = dir) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd });
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
  // The replays the tests write are not changes to the app.
  await writeFile(join(dir, ".gitignore"), "report.json\n");
  git("add", ".");
  git("commit", "-q", "-m", "start");
  const panier = { method: "POST", path: "/api/panier", fields: ["item"] };
  const replays: [string, { method: string; path: string; fields?: string[] }[]][] = [
    ["before", []],
    ["same", []],
    ["feature", [panier]],
    ["feature-and-more", [panier, { method: "DELETE", path: "/api/compte" }]],
    ["basket", [panier]],
    ["basket-more", [{ ...panier, fields: ["item", "quantity"] }]],
  ];
  for (const [name, calls] of replays) {
    await mkdir(join(dir, name));
    await writeFile(join(dir, name, "report.json"), JSON.stringify(report(calls)));
  }
});

after(async () => {
  // A setup that failed before making the folder must show its own error, not this one's.
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("moving a link changes no call and no protected file: it passes", async () => {
  await writeFile(join(dir, "page.html"), "<nav><a href='/orders'>Mes commandes</a></nav>\n");
  try {
    const { code, out } = await run(["guard", "before", "same", "--base", "HEAD"]);
    assert.equal(code, 0, out);
    assert.match(out, /No feature added: every call was made before, and no protected file changed/);
    assert.doesNotMatch(out, /No "protected" list/);
  } finally {
    execFileSync("git", ["checkout", "--", "page.html"], { cwd: dir });
  }
});

test("an empty --base is refused rather than read as no base", async () => {
  await writeFile(join(dir, "server.mjs"), "// routes\napp.post('/api/panier')\n");
  try {
    for (const args of [["--base="], ["--base", ""], ["--base", " "]]) {
      const { code, out } = await run(["guard", "before", "same", ...args]);
      assert.equal(code, 1, args.join(" "));
      assert.match(out, /--base cannot be empty/);
    }
  } finally {
    execFileSync("git", ["checkout", "--", "server.mjs"], { cwd: dir });
  }
});

test("moving a protected file is refused like changing it", async () => {
  execFileSync("git", ["mv", "server.mjs", "app.mjs"], { cwd: dir });
  try {
    const { code, out } = await run(["guard", "before", "same", "--base", "HEAD"]);
    assert.equal(code, 1);
    assert.match(out, /✗ server\.mjs\s+a file that holds the app's data or logic/);
  } finally {
    execFileSync("git", ["reset", "-q", "--hard", "HEAD"], { cwd: dir });
  }
});

test("a change that takes a file off the protected list and changes it is still refused", async () => {
  await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ protected: ["db/**"] }));
  await writeFile(join(dir, "server.mjs"), "// routes\napp.post('/api/panier')\n");
  try {
    const { code, out } = await run(["guard", "before", "same", "--base", "HEAD"]);
    assert.equal(code, 1);
    assert.match(out, /✗ server\.mjs\s+a file that holds the app's data or logic/);
  } finally {
    execFileSync("git", ["checkout", "--", "server.mjs", ".aeom/config.json"], { cwd: dir });
  }
});

test("a report that is not a replay with its calls is refused before any comparison", async () => {
  await mkdir(join(dir, "empty"), { recursive: true });
  await writeFile(join(dir, "empty", "report.json"), JSON.stringify({ journeys: [] }));
  await mkdir(join(dir, "old"), { recursive: true });
  const old = report([]);
  delete (old.journeys[0]!.runs[0] as { calls?: unknown }).calls;
  await writeFile(join(dir, "old", "report.json"), JSON.stringify(old));
  const empty = await run(["guard", "before", "empty"]);
  assert.equal(empty.code, 1);
  assert.match(empty.out, /empty\/report\.json cannot be compared: it has no journey/);
  const stale = await run(["guard", "old", "same"]);
  assert.equal(stale.code, 1);
  assert.match(stale.out, /old\/report\.json cannot be compared: "Add a product" has no list of calls/);
});

test("new fields sent to a call the app already made are refused, by their names", async () => {
  const { code, out } = await run(["guard", "basket", "basket-more", "--base", "HEAD"]);
  assert.equal(code, 1);
  assert.match(out, /✗ POST \/api\/panier\s+sends new fields: quantity, in "Add a product"/);
  assert.doesNotMatch(out, /report\.json\s+a file/, "the replays are not changes to the app");
});

test("an after replay that broke where the before went to its end is refused", async () => {
  const broke = report([]);
  broke.journeys[0]!.runs[0]!.broken = { step: 1, reason: "the page answered 500" } as never;
  await mkdir(join(dir, "broke"), { recursive: true });
  await writeFile(join(dir, "broke", "report.json"), JSON.stringify(broke));
  const { code, out } = await run(["guard", "before", "broke"]);
  assert.equal(code, 1);
  assert.match(out, /leaves out "Add a product" at 1280 px, which broke at step 1/);
});

test("an after replay that leaves out a journey or a width is refused", async () => {
  const two = report([]);
  two.journeys.push({ ...two.journeys[0]!, slug: "orders", name: "See my orders" });
  two.journeys[0]!.runs.push({ ...two.journeys[0]!.runs[0]!, width: 390 });
  await mkdir(join(dir, "two"), { recursive: true });
  await writeFile(join(dir, "two", "report.json"), JSON.stringify(two));
  const { code, out } = await run(["guard", "two", "same"]);
  assert.equal(code, 1);
  assert.match(out, /The after replay leaves out "Add a product" at 390 px, "See my orders": replay every journey/);
});

test("without a protected list, the guard says it compared the calls only", async () => {
  const bare = await mkdtemp(join(tmpdir(), "aeom-guard-bare-"));
  try {
    await mkdir(join(bare, ".aeom"));
    await writeFile(join(bare, ".aeom", "config.json"), "{}");
    for (const name of ["before", "after"]) {
      await mkdir(join(bare, name));
      await writeFile(join(bare, name, "report.json"), JSON.stringify(report([])));
    }
    const { code, out } = await run(["guard", "before", "after"], bare);
    assert.equal(code, 0, out);
    assert.match(out, /No "protected" list in \.aeom\/config\.json: AEOM compared the calls only/);
  } finally {
    await rm(bare, { recursive: true, force: true });
  }
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
