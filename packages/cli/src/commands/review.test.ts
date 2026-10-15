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
    assert.match(out, /^feat\/export against main, held to \.aeom\/standard\.md:/);
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
  await rm(join(dir, ".aeom", "standard.md"));
  try {
    const none = await run(["review", "--base", "main"]);
    assert.equal(none.code, 1);
    assert.match(none.out, /No standard in \.aeom\/standard\.md: run \/aeom first, which writes it from the front as it is\./);
  } finally {
    git("checkout", "--", ".aeom/standard.md");
  }
});

test("with no app to start, the code is still read, and the review says the screens were not measured", async () => {
  git("checkout", "-q", "-b", "feat/couleur");
  await writeFile(join(dir, "front", "kit.css"), (await import("node:fs")).readFileSync(join(dir, "front", "kit.css"), "utf8") + "h1 { color: #1F4B57; }\n");
  git("commit", "-q", "-am", "couleur");
  try {
    const { code, out } = await run(["review", "--base", "main"]);
    assert.equal(code, 1, out);
    assert.match(out, /✗ front\/kit\.css:6\s+#1F4B57 is --petrole written in hard: use the token/);
    assert.match(out, /No app to start: \.aeom\/config\.json has no url, so the screens were not measured, only the code read\./);
  } finally {
    git("checkout", "-q", "main");
  }
});
