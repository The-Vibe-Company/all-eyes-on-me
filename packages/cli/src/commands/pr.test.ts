import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { repoOf } from "./pr.js";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const sh = promisify(execFile);
// Only local paths: a test that got a remote wrong fails here instead of reaching the network.
const LOCAL = { ...process.env, GIT_ALLOW_PROTOCOL: "file" };
const run = async (cwd: string, args: string[], env: NodeJS.ProcessEnv = LOCAL) => {
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
const git = (cwd: string, ...args: string[]) => sh("git", args, { cwd, env: LOCAL });
const temps: string[] = [];
const temp = async (prefix: string) => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
after(() => Promise.all(temps.map((dir) => rm(dir, { recursive: true, force: true }))));

/** A project on main, a run branch that changed a page and commits `files` (null deletes one), and the run's folder. */
async function project({ nothing = false, files = {} as Record<string, string | null>, compare = "better", base = "main\n" } = {}) {
  const dir = await temp("aeom-pr-");
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "t@example.test");
  await git(dir, "config", "user.name", "T");
  await put(join(dir, ".gitignore"), ".aeom/runs/\n");
  await put(join(dir, "pages", "index.html"), "<h1>before</h1>");
  await put(join(dir, "public", "old-hero.jpg"), "jpg");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "app");
  await git(dir, "checkout", "-qb", "aeom/run-1");
  await put(join(dir, "pages", "index.html"), "<h1>after</h1>");
  for (const [file, content] of Object.entries(files)) {
    if (content === null) await git(dir, "rm", "-q", file);
    else await put(join(dir, file), content);
  }
  await git(dir, "add", "-A", "--force");
  await git(dir, "commit", "-qm", "aeom: the home page");
  await git(dir, "checkout", "-q", "main");
  const R = join(dir, ".aeom", "runs", "run-1");
  const manifest = { url: "http://x", capturedAt: "", widths: [1280], errors: [], pages: [{ url: "http://x/", path: "/", files: [{ width: 1280, file: "index@1280.png" }] }] };
  const reports = (failing: string[]) => ({
    check: { url: "http://x", checkedAt: "", widths: [1280], checks: ["contrast"], pages: ["http://x/"], errors: [], findings: [] },
    judge: { judgedAt: "", voters: ["1", "2", "3"], principles: [{ id: "grid", text: "" }], failures: 0, pages: [{ page: "/", verdicts: [{ principle: "grid", pass: !failing.includes("grid"), votes: "", reasons: ["edges disagree"], dissent: [], steps: [] }] }] },
  });
  for (const [snap, failing] of [["before", ["grid"]], ["end", compare === "better" ? [] : ["grid"]]] as const) {
    await put(join(R, snap, "captures", "manifest.json"), manifest);
    await put(join(R, snap, "reports", "check.json"), reports([...failing]).check);
    await put(join(R, snap, "reports", "judge.json"), reports([...failing]).judge);
  }
  await put(join(R, "after", "compare.json"), [{ page: "/", verdict: compare, before: { total: 1 }, after: { total: compare === "worse" ? 2 : 1 } }]);
  await put(join(R, "verdict.json"), { nothingToRedo: nothing, line: "Measured: 1 screen.", failures: [] });
  await put(join(R, "base"), base);
  return { dir, R };
}

/** A bare repository standing in for `url`: git reaches it there through insteadOf, never through the network. */
async function remote(dir: string, name: string, url: string, { base = true } = {}) {
  const bare = await temp("aeom-remote-");
  await git(bare, "init", "-q", "--bare");
  await git(dir, "remote", "add", name, url);
  await git(dir, "config", `url.${bare}.insteadOf`, url);
  if (base) await git(dir, "push", "-q", name, "main");
  return bare;
}
const pushed = async (bare: string) => (await git(bare, "branch", "--list", "aeom/run-1")).stdout.includes("aeom/run-1");

/** A bin folder with node, git and cp, and a gh signed in to git.example.test only, that records what it is asked. */
async function bin(dir: string, { gh = true, open = false } = {}) {
  const b = join(dir, "bin");
  await mkdir(b, { recursive: true });
  await symlink(process.execPath, join(b, "node"));
  for (const tool of ["git", "cp"]) await symlink((await sh("which", [tool])).stdout.trim(), join(b, tool));
  if (gh) {
    const view = open ? `echo '{"url":"https://git.example.test/acme/app/pull/7","state":"OPEN"}'` : `echo 'no pull requests found for branch "aeom/run-1"' >&2; exit 1`;
    await writeFile(
      join(b, "gh"),
      `#!/bin/sh
echo "$@" >> "${join(dir, "gh.log")}"
prev=; for a in "$@"; do [ "$prev" = --body-file ] && cp "$a" "${join(dir, "body.md")}"; prev=$a; done
case "$1 $2" in
  "auth status") [ "$4" = git.example.test ] || exit 1;;
  "pr view") ${view};;
  "pr create") echo "https://git.example.test/acme/app/pull/8";;
esac
`,
    );
    await chmod(join(b, "gh"), 0o755);
  }
  return { ...LOCAL, PATH: b };
}

test("aeom pr pushes the run branch to its base's remote and opens a PR toward the base, in words, and merges nothing", async () => {
  const { dir } = await project();
  const backup = await remote(dir, "backup", "https://git.example.test/acme/backup.git");
  const origin = await remote(dir, "origin", "https://git.example.test/acme/app.git");
  const dry = await run(dir, ["pr", "--dry-run"]);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /Would push aeom\/run-1 to origin and open a PR toward main/);
  assert.match(dry.out, /AEOM: the front fixed \(run-1\)/);
  assert.match(dry.out, /`\/` kept: 1 → 0 failing/);
  await git(dir, "config", "branch.main.remote", "backup");
  assert.match((await run(dir, ["pr", "--dry-run"])).out, /Would push aeom\/run-1 to backup/, "the base's own remote first");
  await git(dir, "config", "--unset", "branch.main.remote");

  const { code, out } = await run(dir, ["pr"], await bin(dir));
  assert.equal(code, 0, out);
  assert.match(out, /https:\/\/git\.example\.test\/acme\/app\/pull\/8/);
  assert.ok(await pushed(origin), "the branch is pushed to origin");
  assert.ok(!(await pushed(backup)), "and only there");
  const asked = (await readFile(join(dir, "gh.log"), "utf8")).trim().split("\n");
  assert.deepEqual(asked[0], "auth status --hostname git.example.test");
  for (const call of asked.slice(1)) assert.match(call, /--repo git\.example\.test\/acme\/app\b/, call);
  assert.ok(asked.some((call) => /^pr create .*--base main --head aeom\/run-1 --title AEOM: the front fixed \(run-1\)/.test(call)));
  assert.doesNotMatch(asked.join("\n"), /merge/, "AEOM never merges, nor turns on auto-merge");
  const body = await readFile(join(dir, "body.md"), "utf8");
  assert.match(body, /`\.aeom\/runs\/run-1\/report\.html`/, "the result page, from the repository's root");
  assert.ok(!body.includes(dir), "never the path of the user's machine");
});

test("an open PR of the run branch gets its description updated, not a second PR", async () => {
  const { dir } = await project();
  await remote(dir, "origin", "https://git.example.test/acme/app.git");
  const { code, out } = await run(dir, ["pr"], await bin(dir, { open: true }));
  assert.equal(code, 0, out);
  assert.match(out, /https:\/\/git\.example\.test\/acme\/app\/pull\/7/);
  const asked = await readFile(join(dir, "gh.log"), "utf8");
  assert.match(asked, /^pr edit aeom\/run-1 --repo git\.example\.test\/acme\/app --body-file /m);
  assert.doesNotMatch(asked, /pr create/);
  assert.match(await readFile(join(dir, "body.md"), "utf8"), /`\/` kept/);
});

test("no remote, no gh, a host gh does not know, or a base the remote lacks: aeom pr says so and leaves the branch", async () => {
  const alone = await project();
  const dry = await run(alone.dir, ["pr", "--dry-run"]);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /No remote: aeom\/run-1 would stay here\. The PR it would open toward main:/);
  const none = await run(alone.dir, ["pr"]);
  assert.equal(none.code, 0);
  assert.match(none.out, /No remote: the branch aeom\/run-1 stays here, and so does the result page/);

  const noGh = await project();
  const bare = await remote(noGh.dir, "origin", "https://git.example.test/acme/app.git");
  const out = await run(noGh.dir, ["pr"], await bin(noGh.dir, { gh: false }));
  assert.equal(out.code, 0);
  assert.match(out.out, /gh is not installed or not signed in to git\.example\.test: the branch aeom\/run-1 stays here/);
  assert.ok(!(await pushed(bare)));

  const elsewhere = await project();
  const other = await remote(elsewhere.dir, "origin", "https://elsewhere.example.test/acme/app.git");
  const unknown = await run(elsewhere.dir, ["pr"], await bin(elsewhere.dir));
  assert.equal(unknown.code, 0);
  assert.match(unknown.out, /gh is not installed or not signed in to elsewhere\.example\.test/);
  assert.ok(!(await pushed(other)));

  const path = await project();
  await git(path.dir, "remote", "add", "origin", await temp("aeom-remote-"));
  const local = await run(path.dir, ["pr"], await bin(path.dir));
  assert.equal(local.code, 0);
  assert.match(local.out, /origin is .*, not a GitHub repository gh can open a PR on: the branch aeom\/run-1 stays here/);

  const empty = await project();
  const lacking = await remote(empty.dir, "origin", "https://git.example.test/acme/app.git", { base: false });
  const noBase = await run(empty.dir, ["pr"], await bin(empty.dir));
  assert.equal(noBase.code, 0, noBase.out);
  assert.match(noBase.out, /main is not on origin: the PR would have no branch to go to\. The branch aeom\/run-1 stays here/);
  assert.ok(!(await pushed(lacking)), "nothing pushed");
});

test("nothing to redo, or nothing kept: no PR", async () => {
  const nothing = await run((await project({ nothing: true })).dir, ["pr"]);
  assert.equal(nothing.code, 0);
  assert.match(nothing.out, /Nothing to redo: no PR\./);
  const sentBack = await run((await project({ compare: "worse" })).dir, ["pr"]);
  assert.equal(sentBack.code, 0, sentBack.out);
  assert.match(sentBack.out, /Nothing kept: no PR\./);
});

test("an image or a capture anywhere in the run's commits is refused before anything is pushed, whatever its name", async () => {
  const cases: [Record<string, string | null>, RegExp][] = [
    [{ "pages/shot.png": "png" }, /aeom\/run-1 commits pages\/shot\.png: no image or capture leaves the machine/],
    [{ "captures/écran@1280.png": "png", "public/capture-réglages.PNG": "png" }, /captures\/écran@1280\.png, public\/capture-réglages\.PNG/],
    [{ ".aeom/runs/run-1/journeys-before/créer/sheet@1280.json": "{}" }, /\.aeom\/runs\/run-1\/journeys-before\/créer\/sheet@1280\.json/],
    [{ "public/favicon.ico": "i", "public/a.heic": "h", "public/b.heif": "h", "public/c.jxl": "j", "public/d.apng": "a", "public/e.svgz": "s" }, /public\/a\.heic, public\/b\.heif, public\/c\.jxl, public\/d\.apng, public\/e\.svgz, public\/favicon\.ico/],
    [{ "public/logo.svg": `<svg><image href="data:image/png;base64,iVBOR"/></svg>` }, /public\/logo\.svg \(it holds an image\)/],
  ];
  for (const [files, refused] of cases) {
    const { code, out } = await run((await project({ files })).dir, ["pr", "--dry-run"]);
    assert.equal(code, 1, out);
    assert.match(out, refused);
  }
  const fine = await run((await project({ files: { "public/icon.svg": `<svg viewBox="0 0 8 8"><path d="M0 0h8v8z"/></svg>`, "public/old-hero.jpg": null } })).dir, ["pr", "--dry-run"]);
  assert.equal(fine.code, 0, `an SVG of shapes, and an image taken out, are fine: ${fine.out}`);
});

test("an image a merge commit brings in itself is refused too", async () => {
  const { dir } = await project();
  await git(dir, "checkout", "-q", "-b", "worker", "main");
  await put(join(dir, "pages", "home.html"), "<h1>home</h1>");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "worker");
  await git(dir, "checkout", "-q", "aeom/run-1");
  await git(dir, "merge", "-q", "--no-ff", "--no-commit", "worker");
  await put(join(dir, "pages", "shot.png"), "png");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "Merge worker");
  await git(dir, "checkout", "-q", "main");
  const { code, out } = await run(dir, ["pr", "--dry-run"]);
  assert.equal(code, 1, out);
  assert.match(out, /commits pages\/shot\.png/);
});

test("the user's own commits the remote does not have yet are read too, from the base on the remote", async () => {
  const { dir } = await project();
  await remote(dir, "origin", "https://git.example.test/acme/app.git");
  await put(join(dir, "docs", "mine.png"), "png");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-qm", "mine, not pushed");
  await git(dir, "rebase", "-q", "main", "aeom/run-1");
  await git(dir, "checkout", "-q", "main");
  const { code, out } = await run(dir, ["pr", "--dry-run"]);
  assert.equal(code, 1, out);
  assert.match(out, /commits docs\/mine\.png/);
});

test("the base must name a commit here or on the remote, and git must answer: otherwise aeom pr refuses", async () => {
  const unknown = await run((await project({ base: "develop\n", files: { "pages/shot.png": "png" } })).dir, ["pr", "--dry-run"]);
  assert.equal(unknown.code, 1);
  assert.match(unknown.out, /develop, the branch the run started from, names nothing here: give it with --base <branch>\./);

  const onRemote = await project({ base: "release\n" });
  await remote(onRemote.dir, "origin", "https://git.example.test/acme/app.git");
  await git(onRemote.dir, "push", "-q", "origin", "main:release");
  const release = await run(onRemote.dir, ["pr", "--dry-run"]);
  assert.equal(release.code, 0, release.out);
  assert.match(release.out, /Would push aeom\/run-1 to origin and open a PR toward release/);

  const detached = await run((await project({ base: "\n" })).dir, ["pr", "--dry-run"]);
  assert.equal(detached.code, 1);
  assert.match(detached.out, /The run started from a detached HEAD: no branch to open a PR toward\. Give one with --base <branch>\./);

  const { R } = await project();
  const notGit = await temp("aeom-not-git-");
  await cp(R, join(notGit, ".aeom", "runs", "run-1"), { recursive: true });
  const failed = await run(notGit, ["pr", "--dry-run"]);
  assert.equal(failed.code, 1);
  assert.match(failed.out, /git failed: .*not a git repository/i);
});

test("a run of the journeys only (--ux) opens its PR with the journeys it kept", async () => {
  const { dir, R } = await project();
  await rm(join(R, "before"), { recursive: true });
  await rm(join(R, "end"), { recursive: true });
  await rm(join(R, "after"), { recursive: true });
  await rm(join(R, "verdict.json"));
  const replay = (steps: number) => ({ url: "http://x", replayedAt: "", widths: [1280], warnings: [], journeys: [{ slug: "orders", name: "See my orders", runs: [{ width: 1280, steps: [], calls: [], screens: ["/"], counts: { steps, screens: 2, back: 0 }, broken: null, sheet: "orders@1280.png" }] }] });
  await put(join(R, "journeys-before", "report.json"), replay(4));
  await put(join(R, "journeys-after", "report.json"), replay(3));
  await put(join(R, "journeys-after", "ratchet.json"), [{ slug: "orders", name: "See my orders", kept: true, why: "3/3 prefer the new one.", steps: { before: 4, after: 3 }, cleared: ["short"], remaining: [] }]);
  const { code, out } = await run(dir, ["pr", R, "--dry-run"]);
  assert.equal(code, 0, out);
  assert.match(out, /\*\*See my orders\*\* kept, 4 → 3 steps\. 3\/3 prefer the new one\./);
});

test("the repository of a remote's URL, https or ssh, for gh", () => {
  assert.deepEqual(repoOf("https://github.com/acme/app.git"), { host: "github.com", repo: "acme/app" });
  assert.deepEqual(repoOf("https://me@github.com/acme/app"), { host: "github.com", repo: "acme/app" });
  assert.deepEqual(repoOf("git@github.com:acme/app.git"), { host: "github.com", repo: "acme/app" });
  assert.deepEqual(repoOf("ssh://git@github.com:22/acme/app.git/"), { host: "github.com", repo: "acme/app" });
  assert.deepEqual(repoOf("https://git.acme.example/acme/app.git"), { host: "git.acme.example", repo: "git.acme.example/acme/app" });
  assert.equal(repoOf("/srv/git/app.git"), null);
  assert.equal(repoOf("file:///srv/git/app.git"), null);
  assert.equal(repoOf("https://gitlab.example/group/sub/app.git"), null);
});
