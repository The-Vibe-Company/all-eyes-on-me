import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd }).toString().trim();

test("aeom update says how far behind AEOM is, refuses a checkout it would lose work in, and brings it up to date with the repository's own steps", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-update-"));
  const run = (args: string[], env: Record<string, string> = {}) =>
    promisify(execFile)("node", [AEOM, ...args], { env: { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0", AEOM_REPO: join(dir, "aeom"), ...env } }).then(
      (r) => ({ code: 0, out: r.stdout + r.stderr }),
      (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }),
    );
  try {
    // A remote, the checkout AEOM runs from, and two commits it does not have yet.
    await mkdir(join(dir, "remote.git"));
    git(join(dir, "remote.git"), "init", "-q", "--bare", "-b", "main");
    await mkdir(join(dir, "author"));
    git(join(dir, "author"), "init", "-q", "-b", "main");
    await writeFile(join(dir, "author", "package.json"), JSON.stringify({ name: "all-eyes-on-me", private: true, scripts: { update: `node -e "require('fs').writeFileSync('updated', 'yes')"` } }));
    git(join(dir, "author"), "add", "-A");
    git(join(dir, "author"), "commit", "-q", "-m", "one");
    git(join(dir, "author"), "remote", "add", "origin", join(dir, "remote.git"));
    git(join(dir, "author"), "push", "-q", "origin", "main");
    git(dir, "clone", "-q", join(dir, "remote.git"), "aeom");
    const before = git(join(dir, "aeom"), "rev-parse", "--short", "HEAD");
    for (const n of ["two", "three"]) {
      await writeFile(join(dir, "author", n), n);
      git(join(dir, "author"), "add", "-A");
      git(join(dir, "author"), "commit", "-q", "-m", n);
    }
    git(join(dir, "author"), "push", "-q", "origin", "main");

    const behind = await run(["update", "--check"]);
    assert.equal(behind.code, 1, behind.out);
    assert.match(behind.out, /AEOM is 2 commits behind its latest version: aeom update\./);

    await writeFile(join(dir, "aeom", "notes.txt"), "mine");
    const dirty = await run(["update"]);
    assert.equal(dirty.code, 1);
    assert.match(dirty.out, /AEOM's checkout, .*, has changes of its own: commit or set them aside, then aeom update again/);
    await rm(join(dir, "aeom", "notes.txt"));

    const updated = await run(["update"]);
    assert.equal(updated.code, 0, updated.out);
    assert.match(updated.out, new RegExp(`Updated AEOM from ${before} to [0-9a-f]{7,}: 2 commits\\.`));
    assert.match(updated.out, /Restart Claude Code/);
    assert.equal(await readFile(join(dir, "aeom", "updated"), "utf8"), "yes", "the repository's own update steps ran");
    assert.equal((await run(["update", "--check"])).code, 0);

    git(join(dir, "aeom"), "checkout", "-q", "-b", "mine");
    await writeFile(join(dir, "author", "four"), "four");
    git(join(dir, "author"), "add", "-A");
    git(join(dir, "author"), "commit", "-q", "-m", "four");
    git(join(dir, "author"), "push", "-q", "origin", "main");
    const branch = await run(["update"]);
    assert.equal(branch.code, 1);
    assert.match(branch.out, /AEOM's checkout is on mine, not main/);

    assert.equal((await run(["update", "--check"], { AEOM_REPO: join(dir, "author", "nowhere") })).code, 2, "not a checkout: it cannot tell");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("after a command, AEOM says once in a while that it is behind, from what it last saw, and never when the check is off", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-update-notice-"));
  const home = join(dir, ".home");
  const run = (env: Record<string, string>) =>
    promisify(execFile)("node", [AEOM, "--version"], { env: { ...process.env, AEOM_HOME: home, AEOM_TELEMETRY: "0", CI: "", ...env } }).then((r) => ({ out: r.stdout, err: r.stderr }));
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fileURLToPath(new URL("../../../../", import.meta.url)) }).toString().trim();
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "update.json"), JSON.stringify({ checkedAt: new Date().toISOString(), head, behind: 21, latest: "abc1234" }));
    assert.doesNotMatch((await run({})).err, /behind/, "telemetry off: no check unless asked");
    const said = await run({ AEOM_UPDATE_CHECK: "1" });
    assert.match(said.err, /AEOM is 21 commits behind its latest version: aeom update\./);
    assert.doesNotMatch(said.out, /behind/, "said apart from what the command prints");
    assert.doesNotMatch((await run({ AEOM_UPDATE_CHECK: "1" })).err, /behind/, "once in a while, not after every command");
    assert.ok(existsSync(join(home, "update.json")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom update touches only AEOM's own checkout, and a step that failed is run again on the next aeom update", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-update-other-"));
  const run = (args: string[], env: Record<string, string>) =>
    promisify(execFile)("node", [AEOM, ...args], { env: { ...process.env, AEOM_HOME: join(dir, ".home"), AEOM_TELEMETRY: "0", ...env } }).then(
      (r) => ({ code: 0, out: r.stdout + r.stderr }),
      (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }),
    );
  try {
    await mkdir(join(dir, "remote.git"));
    git(join(dir, "remote.git"), "init", "-q", "--bare", "-b", "main");
    await mkdir(join(dir, "author"));
    git(join(dir, "author"), "init", "-q", "-b", "main");
    // A step that fails until a file says it may pass.
    const step = `node -e "if (!require('fs').existsSync('../ok')) process.exit(3); require('fs').writeFileSync('updated', 'yes')"`;
    await writeFile(join(dir, "author", "package.json"), JSON.stringify({ name: "all-eyes-on-me", private: true, scripts: { update: step } }));
    git(join(dir, "author"), "add", "-A");
    git(join(dir, "author"), "commit", "-q", "-m", "one");
    git(join(dir, "author"), "remote", "add", "origin", join(dir, "remote.git"));
    git(join(dir, "author"), "push", "-q", "origin", "main");
    git(dir, "clone", "-q", join(dir, "remote.git"), "aeom");
    await writeFile(join(dir, "author", "two"), "two");
    git(join(dir, "author"), "add", "-A");
    git(join(dir, "author"), "commit", "-q", "-m", "two");
    git(join(dir, "author"), "push", "-q", "origin", "main");

    // Another project's checkout, or a folder inside one, is never AEOM's.
    await mkdir(join(dir, "aeom", "packages"), { recursive: true });
    assert.equal((await run(["update"], { AEOM_REPO: join(dir, "aeom", "packages") })).code, 2, "a folder inside a checkout is not the checkout");
    git(dir, "clone", "-q", join(dir, "remote.git"), "other");
    await writeFile(join(dir, "other", "package.json"), JSON.stringify({ name: "someone-else" }));
    git(join(dir, "other"), "-c", "user.name=t", "add", "-A");
    assert.equal((await run(["update", "--check"], { AEOM_REPO: join(dir, "other") })).code, 2, "a checkout of another project");

    const failed = await run(["update"], { AEOM_REPO: join(dir, "aeom") });
    assert.equal(failed.code, 1);
    assert.match(failed.out, /its update steps failed: run aeom update again/);
    await writeFile(join(dir, "ok"), "");
    const again = await run(["update"], { AEOM_REPO: join(dir, "aeom") });
    assert.equal(again.code, 0, again.out);
    assert.match(again.out, /ran the update steps it had left/);
    assert.equal(await readFile(join(dir, "aeom", "updated"), "utf8"), "yes");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("nothing is fetched when telemetry is off by DO_NOT_TRACK, in a test, in CI, or with AEOM_UPDATE_CHECK=0; a broken state is looked at again", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-update-off-"));
  const home = join(dir, ".home");
  const run = (env: Record<string, string>) =>
    promisify(execFile)("node", [AEOM, "--version"], { env: { ...process.env, AEOM_HOME: home, AEOM_TELEMETRY: "", DO_NOT_TRACK: "", NODE_TEST_CONTEXT: "", CI: "", AEOM_REPO: join(dir, "nowhere"), ...env } }).then((r) => r.stderr);
  try {
    for (const off of [{ DO_NOT_TRACK: "1" }, { NODE_TEST_CONTEXT: "child-v8" }, { CI: "true" }, { AEOM_UPDATE_CHECK: "0" }] as Record<string, string>[]) {
      await run(off);
      assert.ok(!existsSync(join(home, "update.json")), `no look with ${JSON.stringify(off)}`);
    }
    // A state broken by hand: looked at again, once, and kept.
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "update.json"), "{");
    await run({ AEOM_UPDATE_CHECK: "1" });
    const kept = JSON.parse(await readFile(join(home, "update.json"), "utf8"));
    assert.ok(Date.now() - Date.parse(kept.checkedAt) < 60_000, "the look is noted before it runs, so a second command does not start another");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
