import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const sh = promisify(execFile);
const run = async (cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env) => {
  try {
    const { stdout, stderr } = await sh(process.execPath, [AEOM, ...args], { cwd, env });
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
const git = (cwd: string, ...args: string[]) => sh("git", args, { cwd });

/** A project on main, a run branch that changed a page, and the run's folder. */
async function project({ nothing = false, image = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "aeom-pr-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "t@example.test");
  await git(dir, "config", "user.name", "T");
  await put(join(dir, ".gitignore"), ".aeom/runs/\n");
  await put(join(dir, "pages", "index.html"), "<h1>before</h1>");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "app");
  await git(dir, "checkout", "-qb", "aeom/run-1");
  await put(join(dir, "pages", "index.html"), "<h1>after</h1>");
  if (image) await put(join(dir, "pages", "shot.png"), "png");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "aeom: the home page");
  await git(dir, "checkout", "-q", "main");
  const R = join(dir, ".aeom", "runs", "run-1");
  const manifest = { url: "http://x", capturedAt: "", widths: [1280], errors: [], pages: [{ url: "http://x/", path: "/", files: [{ width: 1280, file: "index@1280.png" }] }] };
  const reports = (failing: string[]) => ({
    check: { url: "http://x", checkedAt: "", widths: [1280], checks: ["contrast"], pages: ["http://x/"], errors: [], findings: [] },
    judge: { judgedAt: "", voters: ["1", "2", "3"], principles: [{ id: "grid", text: "" }], failures: 0, pages: [{ page: "/", verdicts: [{ principle: "grid", pass: !failing.includes("grid"), votes: "", reasons: ["edges disagree"], dissent: [], steps: [] }] }] },
  });
  for (const [snap, failing] of [["before", ["grid"]], ["end", []]] as const) {
    await put(join(R, snap, "captures", "manifest.json"), manifest);
    await put(join(R, snap, "reports", "check.json"), reports([...failing]).check);
    await put(join(R, snap, "reports", "judge.json"), reports([...failing]).judge);
  }
  await put(join(R, "after", "compare.json"), [{ page: "/", verdict: "better" }]);
  await put(join(R, "verdict.json"), { nothingToRedo: nothing, line: "Measured: 1 screen.", failures: [] });
  await put(join(R, "base"), "main\n");
  return { dir, R };
}

/** A bin folder with node and git, and a gh that records what it is asked. */
async function bin(dir: string, { gh }: { gh: boolean }) {
  const b = join(dir, "bin");
  await mkdir(b, { recursive: true });
  await symlink(process.execPath, join(b, "node"));
  await symlink((await sh("which", ["git"])).stdout.trim(), join(b, "git"));
  if (gh) {
    await writeFile(join(b, "gh"), `#!/bin/sh\necho "$@" >> "${join(dir, "gh.log")}"\ncase "$1 $2" in "auth status") exit 0;; "pr create") echo "https://github.com/acme/app/pull/7";; esac\n`);
    await chmod(join(b, "gh"), 0o755);
  }
  return { ...process.env, PATH: b };
}

test("aeom pr pushes the run branch and opens a PR toward the branch the run started from, in words, and merges nothing", async () => {
  const { dir } = await project();
  const remote = await mkdtemp(join(tmpdir(), "aeom-remote-"));
  try {
    await git(remote, "init", "-q", "--bare");
    await git(dir, "remote", "add", "origin", remote);
    const dry = await run(dir, ["pr", "--dry-run"]);
    assert.equal(dry.code, 0, dry.out);
    assert.match(dry.out, /AEOM: the front fixed \(run-1\)/);
    assert.match(dry.out, /`\/` kept: 1 → 0 failing/);
    const env = await bin(dir, { gh: true });
    const { code, out } = await run(dir, ["pr"], env);
    assert.equal(code, 0, out);
    assert.match(out, /https:\/\/github\.com\/acme\/app\/pull\/7/);
    assert.match((await git(remote, "branch", "--list", "aeom/run-1")).stdout, /aeom\/run-1/, "the branch is pushed");
    const asked = await readFile(join(dir, "gh.log"), "utf8");
    assert.match(asked, /pr create --base main --head aeom\/run-1 --title AEOM: the front fixed \(run-1\)/);
    assert.doesNotMatch(asked, /merge/, "AEOM never merges, nor turns on auto-merge");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(remote, { recursive: true, force: true });
  }
});

test("no remote or no gh: aeom pr says so and leaves the branch; nothing to redo: no PR", async () => {
  const { dir } = await project();
  const none = await project({ nothing: true });
  try {
    const alone = await run(dir, ["pr"]);
    assert.equal(alone.code, 0);
    assert.match(alone.out, /No remote: the branch aeom\/run-1 stays here, and so does the result page/);
    await git(dir, "remote", "add", "origin", dir);
    const noGh = await run(dir, ["pr"], await bin(dir, { gh: false }));
    assert.equal(noGh.code, 0);
    assert.match(noGh.out, /gh is not installed or not signed in: the branch aeom\/run-1 stays here/);
    const nothing = await run(none.dir, ["pr"]);
    assert.equal(nothing.code, 0);
    assert.match(nothing.out, /Nothing to redo: no PR\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(none.dir, { recursive: true, force: true });
  }
});

test("a run branch that commits an image, or a file of a run's folder, is refused before anything is pushed", async () => {
  const { dir } = await project({ image: true });
  try {
    const { code, out } = await run(dir, ["pr", "--dry-run"]);
    assert.equal(code, 1);
    assert.match(out, /aeom\/run-1 commits pages\/shot\.png: no image or capture leaves the machine/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
