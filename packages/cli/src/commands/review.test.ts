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
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd: dir, env: { ...process.env, AEOM_HOME: join(dir, ".home") } });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};
const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString();

const page = (links: string[], body: string) => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Boutique</title><link rel="stylesheet" href="kit.css"><header><nav>${links.map((l) => `<a href="${l === "Accueil" ? "index.html" : "produits.html"}">${l}</a>`).join(" ")}</nav></header><main>${body}</main>`;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "aeom-review-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await mkdir(join(dir, ".aeom"));
  await mkdir(join(dir, "front"));
  await writeFile(join(dir, ".aeom", "standard.md"), `# The standard of Boutique\nWhat the front holds to.\n\n## Direction\nnuancier.\n\n## Tokens\n- \`--petrole: #1f4b57\` in \`front/kit.css\`\n\n## Components\n- \`.bouton\` in \`front/kit.css\`\n\n## Rules\n- One petrol action a screen.\n`);
  await writeFile(join(dir, "front", "kit.css"), `:root { --petrole: #1f4b57; }\nbody { margin: 0; font: 16px/1.5 Georgia, serif; }\nheader a { display: inline-block; padding: 12px; color: #111; }\n.bouton { min-height: 44px; padding: 10px 16px; background: var(--petrole); color: #fff; border: 0; cursor: pointer; }\n.bouton:focus-visible { outline: 3px solid #111; }\n`);
  await writeFile(join(dir, "front", "index.html"), page(["Accueil", "Produits"], `<h1>Accueil</h1>`));
  await writeFile(join(dir, "front", "produits.html"), page(["Accueil", "Produits"], `<h1>Produits</h1>`));
  await writeFile(join(dir, "server.mjs"), "// the back\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
});

after(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("aeom review holds the branch's changes to the standard: the code, with its file and line, and the screens it touches, measured", async () => {
  git("checkout", "-q", "-b", "feat/export");
  await writeFile(join(dir, "front", "export.html"), page(["Accueil", "Exporter"], `<h1>Exporter</h1>\n<button style="color:#7c3aed" onclick="void 0">Exporter</button>`));
  git("add", ".");
  git("commit", "-q", "-m", "export");
  try {
    const { code, out } = await run(["review", "--base", "main", "--dir", "front", "--widths", "1280"]);
    assert.equal(code, 1, out);
    assert.match(out, /^feat\/export against main, held to \.aeom\/standard\.md: 1 commit ahead\./);
    assert.match(out, /✗ front\/export\.html:2\s+#7c3aed is not a colour of the standard/);
    assert.match(out, /✗ front\/export\.html:2\s+a button made by hand: the standard's is \.bouton in front\/kit\.css/);
    assert.match(out, /✗ \/export\.html\s+its header differs from the rest of the app: no « Produits », « Exporter » the rest of the app does not have/);
    assert.match(out, /\n\d+ things? outside the standard\.\n?$/);
    assert.doesNotMatch(out, /front\/index\.html/, "only what the branch changed");
  } finally {
    git("checkout", "-q", "main");
  }
});

test("a branch that touches no screen passes without starting anything; with no standard, aeom review says to run /aeom first", async () => {
  git("checkout", "-q", "-b", "fix/server");
  await writeFile(join(dir, "server.mjs"), "// the back, fixed\n");
  git("commit", "-q", "-am", "server");
  try {
    const { code, out } = await run(["review", "--base", "main", "--dir", "front"]);
    assert.equal(code, 0, out);
    assert.match(out, /No screen touched, and nothing outside the standard\./);
  } finally {
    git("checkout", "-q", "main");
  }
  // A project with no standard, at its base or in its tree.
  const bare = await mkdtemp(join(tmpdir(), "aeom-review-bare-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: bare });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "start"], { cwd: bare });
    const none = await promisify(execFile)("node", [AEOM, "review"], { cwd: bare, env: { ...process.env, AEOM_HOME: join(bare, ".home") } }).then(() => ({ code: 0, out: "" }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
    assert.equal(none.code, 1);
    assert.match(none.out, /No standard in \.aeom\/standard\.md: run \/aeom first, which writes it from the front as it is\./);
  } finally {
    await rm(bare, { recursive: true, force: true });
  }
});

test("with no app to start, the code is still read; a branch whose code holds but whose screens were not measured is no green", async () => {
  git("checkout", "-q", "-b", "feat/couleur");
  await writeFile(join(dir, "front", "page.css"), "h1 { color: #1F4B57; }\n");
  git("add", ".");
  git("commit", "-q", "-m", "couleur");
  try {
    const { code, out } = await run(["review", "--base", "main"]);
    assert.equal(code, 1, out);
    assert.match(out, /✗ front\/page\.css:1\s+#1F4B57 is --petrole written in hard: use the token/);
    assert.match(out, /No app to start: \.aeom\/config\.json has no url, so the screens were not measured, only the code read\./);
  } finally {
    git("checkout", "-q", "main");
  }
  git("checkout", "-q", "-b", "feat/titre");
  await writeFile(join(dir, "front", "produits.html"), page(["Accueil", "Produits"], `<h1>Nos produits</h1>`));
  git("commit", "-q", "-am", "titre");
  try {
    const { code, out } = await run(["review", "--base", "main"]);
    assert.equal(code, 2, out);
    assert.match(out, /Nothing outside the standard in the code; the screens it touches were not measured\./);
  } finally {
    git("checkout", "-q", "main");
  }
});

test("a deleted page is not measured; the base is found without being given; the standard is the base's", async () => {
  git("checkout", "-q", "-b", "chore/menage");
  await rm(join(dir, "front", "produits.html"));
  // The branch also loosens the standard: the review still holds it to the base's.
  await writeFile(join(dir, ".aeom", "standard.md"), "# The standard of Boutique\nWhat the front holds to.\n\n## Direction\nnuancier.\n\n## Tokens\n\n## Components\n\n## Rules\n- None.\n");
  await writeFile(join(dir, "front", "promo.css"), ".promo { color: #7c3aed; }\n");
  git("add", "-A");
  git("commit", "-q", "-m", "menage");
  try {
    const { code, out } = await run(["review", "--dir", "front", "--widths", "1280"]);
    assert.equal(code, 1, out);
    assert.match(out, /^chore\/menage against main/, "main found by itself");
    assert.match(out, /#7c3aed is not a colour of the standard/, "held to the base's standard, not the branch's edit of it");
    assert.doesNotMatch(out, /produits\.html\s+does not load/);
  } finally {
    git("checkout", "-q", "main");
  }
});

test("aeom review --install-check writes the GitHub workflow that holds every PR to the standard, with the project's own install, and never overwrites another one", async () => {
  const repo = await mkdtemp(join(tmpdir(), "aeom-review-ci-"));
  const inRepo = (args: string[]) => promisify(execFile)("node", [AEOM, ...args], { cwd: repo, env: { ...process.env, AEOM_HOME: join(repo, ".home") } }).then((r) => ({ code: 0, out: r.stdout + r.stderr }), (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }));
  try {
    await writeFile(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const first = await inRepo(["review", "--install-check"]);
    assert.equal(first.code, 0, first.out);
    assert.match(first.out, /Wrote \.github\/workflows\/aeom\.yml: every pull request is held to \.aeom\/standard\.md, as a check named aeom\./);
    const workflow = (await import("node:fs")).readFileSync(join(repo, ".github", "workflows", "aeom.yml"), "utf8");
    assert.match(workflow, /on:\n  pull_request:/);
    assert.match(workflow, /fetch-depth: 0/);
    assert.match(workflow, /pnpm\/action-setup@v4\n        with:\n          version: 10/, "a version when the project pins none");
    assert.match(workflow, /pnpm install --frozen-lockfile/);
    assert.match(workflow, /fetch -q --depth 1 https:\/\/github\.com\/The-Vibe-Company\/all-eyes-on-me [0-9a-f]{40}\n/, "AEOM pinned to the very commit that wrote the check, never a moving branch");
    assert.match(workflow, /playwright install --with-deps chromium/);
    assert.match(workflow, /review --base "origin\/\$\{\{ github\.base_ref \}\}" --summary "\$GITHUB_STEP_SUMMARY"/);
    assert.doesNotMatch(workflow, /ANTHROPIC|OPENAI|api[_-]?key/i, "no model, no key");
    assert.match((await inRepo(["review", "--install-check"])).out, /already holds this check/);
    await writeFile(join(repo, ".github", "workflows", "aeom.yml"), "name: mine\n");
    const other = await inRepo(["review", "--install-check"]);
    assert.equal(other.code, 1);
    assert.match(other.out, /\.github\/workflows\/aeom\.yml is someone else's: run again with --force to replace it/);
    assert.equal((await inRepo(["review", "--install-check", "--force", "--aeom-ref", "v1.2.0"])).code, 0);
    assert.match((await import("node:fs")).readFileSync(join(repo, ".github", "workflows", "aeom.yml"), "utf8"), /all-eyes-on-me v1\.2\.0\n/);
    await rm(join(repo, "pnpm-lock.yaml"));
    await writeFile(join(repo, "package-lock.json"), "{}");
    await inRepo(["review", "--install-check", "--force"]);
    assert.match((await import("node:fs")).readFileSync(join(repo, ".github", "workflows", "aeom.yml"), "utf8"), /npm ci/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("the check's summary lists what is outside the standard in words; an app that does not start fails it, with what its start command printed", async () => {
  git("checkout", "-q", "-b", "feat/resume");
  await writeFile(join(dir, "front", "promo.css"), ".promo { color: #7c3aed; }\n");
  await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ url: "http://127.0.0.1:59999", start: "node -e \"console.log('base de données absente'); process.exit(1)\"" }));
  git("add", "-A");
  git("commit", "-q", "-m", "resume");
  const summary = join(dir, "summary.md");
  try {
    const { code, out } = await run(["review", "--base", "main", "--summary", summary, "--timeout", "5"]);
    assert.equal(code, 1, out);
    const said = (await import("node:fs")).readFileSync(summary, "utf8");
    assert.match(said, /^## aeom review\n/);
    assert.match(said, /- `front\/promo\.css:1` #7c3aed is not a colour of the standard/);
    assert.match(said, /The app did not start: [^\n]*\n[\s\S]*base de données absente/);
    assert.match(said, /\*\*1 thing outside the standard\.\*\*/);
    assert.doesNotMatch(said, /!\[|<img|\.png/, "words only");
  } finally {
    git("checkout", "-q", "main");
    await rm(summary, { force: true });
  }
});

test("in a monorepo, the check is written at the repository's root, installs where the lockfile is, and reviews the app's folder", async () => {
  const repo = await mkdtemp(join(tmpdir(), "aeom-review-mono-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repo });
    await writeFile(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await mkdir(join(repo, "apps", "web"), { recursive: true });
    const { stdout } = await promisify(execFile)("node", [AEOM, "review", "--install-check"], { cwd: join(repo, "apps", "web"), env: { ...process.env, AEOM_HOME: join(repo, ".home") } });
    assert.match(stdout, /Wrote \.github\/workflows\/aeom\.yml/);
    const workflow = (await import("node:fs")).readFileSync(join(repo, ".github", "workflows", "aeom.yml"), "utf8");
    assert.match(workflow, /- name: Install the project\n        run: pnpm install --frozen-lockfile\n/, "at the root, where the lockfile is");
    assert.match(workflow, /- name: Hold the pull request to the standard\n        working-directory: apps\/web\n/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("a review that stops before it starts still says why in the check's summary", async () => {
  const bare = await mkdtemp(join(tmpdir(), "aeom-review-early-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: bare });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "start"], { cwd: bare });
    const summary = join(bare, "summary.md");
    await promisify(execFile)("node", [AEOM, "review", "--summary", summary], { cwd: bare, env: { ...process.env, AEOM_HOME: join(bare, ".home") } }).catch(() => undefined);
    assert.match((await import("node:fs")).readFileSync(summary, "utf8"), /^## aeom review\n\nNo standard in `\.aeom\/standard\.md`: run \/aeom first/);
  } finally {
    await rm(bare, { recursive: true, force: true });
  }
});
