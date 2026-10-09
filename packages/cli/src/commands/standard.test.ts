import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
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
    return { code: 0, out: stdout + stderr, stdout };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr, stdout: e.stdout };
  }
};

const KIT = `:root {
  --encre: #1c2226; /* label ink */
  --petrole: #1f4b57;
}
.bouton { background: var(--petrole); }
.carte { color: var(--encre); }
`;

async function project() {
  const dir = await mkdtemp(join(tmpdir(), "aeom-standard-"));
  await mkdir(join(dir, "shared"));
  await mkdir(join(dir, ".aeom"));
  await writeFile(join(dir, "shared", "kit.css"), KIT);
  await writeFile(join(dir, "shared", "header.html"), "<header></header>");
  await writeFile(join(dir, ".aeom", "product.md"), "# Super Boutique\n\n## What it is for\nA shop. (seen: /)\n");
  return { dir, standard: join(dir, ".aeom", "standard.md"), draft: join(dir, "draft.md") };
}

const written = (draft: string, direction = "nuancier: Sert la boucle principale, comme un coupon de tissu qu'on suit.") =>
  draft
    .replace(/## Direction\n[^\n]+/, `## Direction\n${direction}`)
    .replace(/## Rules\n[^\n]+/, "## Rules\n- Only the main action is petrol.");

test("aeom standard --draft takes the tokens and the kit from the shared files, and the direction from the run", async () => {
  const p = await project();
  try {
    const runDir = join(p.dir, ".aeom", "runs", "run-1", "directions");
    await mkdir(runDir, { recursive: true });
    const tournament = { entrants: ["nuancier", "guichet"], votesPerDuel: 1, duels: [{ id: 1, round: 1, a: "nuancier", b: "guichet", votes: [], winner: "nuancier" }] };
    await writeFile(join(runDir, "tournament.json"), JSON.stringify(tournament));
    await writeFile(join(runDir, "sheet.json"), JSON.stringify([{ label: "nuancier", note: "Sert la boucle principale." }, { label: "guichet", note: "Sert la commande." }]));
    const { code, out, stdout } = await run(p.dir, ["standard", "--draft", "shared/kit.css", join(p.dir, "shared", "header.html"), "--run", ".aeom/runs/run-1"]);
    assert.equal(code, 0, out);
    assert.match(stdout, /^# The standard of Super Boutique\n/, "named after the product sheet");
    assert.match(stdout, /^- `--encre: #1c2226` in `shared\/kit\.css`: label ink$/m);
    assert.match(stdout, /^- `\.bouton` in `shared\/kit\.css`$/m);
    assert.match(stdout, /^- `shared\/header\.html`$/m, "a path given in full is said from the project's root");
    assert.match(stdout, /## Direction\nnuancier: Sert la boucle principale\.\n/);
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("a file outside the project, or one that does not exist, is not drafted", async () => {
  const p = await project();
  try {
    assert.match((await run(p.dir, ["standard", "--draft", "shared/nope.css"])).out, /Cannot read shared\/nope\.css/);
    const outside = await run(p.dir, ["standard", "--draft", join(tmpdir(), "elsewhere.css")]);
    assert.equal(outside.code, 1);
    assert.match(outside.out, /outside the project/);
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("aeom standard writes .aeom/standard.md only when everything in it is in the code", async () => {
  const p = await project();
  try {
    const draft = (await run(p.dir, ["standard", "--draft", "shared/kit.css", "shared/header.html"])).stdout;
    const placeholder = await run(p.dir, ["standard", await writeDraft(p.draft, draft)]);
    assert.equal(placeholder.code, 1);
    assert.match(placeholder.out, /"Direction" still holds a placeholder/);
    assert.ok(!existsSync(p.standard), "nothing is written");

    const wrong = await run(p.dir, ["standard", await writeDraft(p.draft, written(draft).replace("#1f4b57", "#000000"))]);
    assert.equal(wrong.code, 1);
    assert.match(wrong.out, /`--petrole: #000000` is not in shared\/kit\.css/);
    assert.ok(!existsSync(p.standard));

    const { code, out } = await run(p.dir, ["standard", await writeDraft(p.draft, written(draft))]);
    assert.equal(code, 0, out);
    assert.match(out, /Wrote \.aeom\/standard\.md: 2 tokens and 3 components, each where it lives in the code/);
    assert.equal(await readFile(p.standard, "utf8"), written(draft));
    assert.equal(await readFile(join(p.dir, ".aeom", "standard.base.md"), "utf8"), written(draft));
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

test("a later run keeps what the user corrected by hand, says what it changed, and refuses a correction the code does not hold", async () => {
  const p = await project();
  try {
    const draft = (await run(p.dir, ["standard", "--draft", "shared/kit.css", "shared/header.html"])).stdout;
    assert.equal((await run(p.dir, ["standard", await writeDraft(p.draft, written(draft))])).code, 0);
    const corrected = (await readFile(p.standard, "utf8")).replace("- Only the main action is petrol.", "- Only the main action is petrol.\n- A price never breaks before its €.");
    await writeFile(p.standard, corrected);
    await writeFile(join(p.dir, "shared", "kit.css"), KIT.replace(".carte {", ".etiquette {"));

    const next = (await run(p.dir, ["standard", "--draft", "shared/kit.css", "shared/header.html"])).stdout;
    const { code, out } = await run(p.dir, ["standard", await writeDraft(p.draft, written(next, "nuancier: the swatch book, for the main loop."))]);
    assert.equal(code, 0, out);
    assert.match(out, /Kept your edits: Rules/);
    assert.match(out, /Updated: Direction/);
    assert.match(out, /Added: `\.etiquette` in `shared\/kit\.css`/);
    assert.match(out, /Removed, no longer in the code: `\.carte` in `shared\/kit\.css`/);
    const merged = await readFile(p.standard, "utf8");
    assert.match(merged, /A price never breaks before its €/);
    assert.match(merged, /the swatch book/);

    await writeFile(p.standard, merged.replace("`--encre: #1c2226`", "`--encre: #000000`"));
    const refused = await run(p.dir, ["standard", p.draft]);
    assert.equal(refused.code, 1);
    assert.match(refused.out, /With your corrections in \.aeom\/standard\.md[^\n]*nothing was written[\s\S]*`--encre: #000000` is not in shared\/kit\.css/);
    assert.match(await readFile(p.standard, "utf8"), /`--encre: #000000`/, "the standard stays as the user left it");
  } finally {
    await rm(p.dir, { recursive: true, force: true });
  }
});

async function writeDraft(file: string, text: string) {
  await writeFile(file, text);
  return file;
}
