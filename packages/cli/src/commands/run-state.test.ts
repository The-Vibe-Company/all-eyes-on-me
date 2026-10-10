import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const run = async (cwd: string, args: string[]) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};
const git = async (cwd: string, ...args: string[]) => (await promisify(execFile)("git", args, { cwd })).stdout.trim();

test("aeom run keeps where a run is, and says to a new session how to take it up", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-run-state-"));
  const wt = await mkdtemp(join(tmpdir(), "aeom-run-wt-"));
  try {
    await git(dir, "init", "-q", "-b", "main");
    await git(dir, "config", "user.email", "t@example.test");
    await git(dir, "config", "user.name", "T");
    await writeFile(join(dir, "a.txt"), "a");
    await git(dir, "add", "-A");
    await git(dir, "commit", "-qm", "app");
    const start = await git(dir, "rev-parse", "HEAD");
    await mkdir(join(dir, ".aeom", "runs", "run-1"), { recursive: true });
    const R = ".aeom/runs/run-1";

    assert.match((await run(dir, ["run", "status"])).out, /No run keeps its state in \.aeom\/runs yet/);
    assert.equal((await run(dir, ["run", "mark", R, "--phase", "directions", "--step", "2b.4", "--set", `MAIN=${dir}`, "--set", `WT=${wt}`])).code, 0);
    await git(dir, "worktree", "add", "-q", join(wt, "topo"), "-b", "aeom/run-1-topo", start);
    await writeFile(join(wt, "topo", "kit.css"), "body {}");
    await git(join(wt, "topo"), "add", "-A");
    await git(join(wt, "topo"), "commit", "-qm", "topo");
    await git(dir, "worktree", "add", "-q", join(wt, "brume"), "-b", "aeom/run-1-brume", start);
    for (const name of ["topo", "brume"]) {
      const launched = await run(dir, ["run", "agent", R, "--name", name, "--kind", "direction worker", "--status", "launched", "--worktree", join(wt, name), "--branch", `aeom/run-1-${name}`, "--from", start]);
      assert.equal(launched.code, 0, launched.out);
    }
    const state = JSON.parse(await readFile(join(dir, R, "state.json"), "utf8"));
    assert.equal(state.phase, "directions");
    assert.equal(state.agents.length, 2);

    const status = await run(dir, ["run", "status"]);
    assert.equal(status.code, 0, status.out);
    assert.match(status.out, /^run-1: "directions", at step 2b\.4 of the skill/);
    assert.match(status.out, /topo +direction worker +stopped with 1 commit/);
    assert.match(status.out, /brume +direction worker +stopped with nothing committed/);

    const resume = await run(dir, ["run", "resume", R]);
    assert.equal(resume.code, 0, resume.out);
    assert.match(resume.out, new RegExp(`export MAIN=${dir.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`));
    assert.match(resume.out, /Go on at step 2b\.4\.$/m);

    const never = await run(dir, ["run", "agent", R, "--name", "grotte", "--status", "done"]);
    assert.equal(never.code, 1);
    assert.match(never.out, /grotte was never launched in this run/);
    const noFrom = await run(dir, ["run", "agent", R, "--name", "x", "--status", "launched", "--branch", "aeom/x"]);
    assert.equal(noFrom.code, 1);
    assert.match(noFrom.out, /--branch goes with --from, the commit its worktree started from/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(wt, { recursive: true, force: true });
  }
});
