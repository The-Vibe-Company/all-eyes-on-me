import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
const put = async (file: string, content: unknown) => {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
};
const git = async (cwd: string, ...args: string[]) => (await promisify(execFile)("git", args, { cwd })).stdout.trim();
const notes = async (runDir: string) => (JSON.parse(await readFile(join(runDir, "state.json"), "utf8")) as { phase: string; step: string; history: { phase: string; done?: string }[] });

/** What aeom capture, check and judge leave in .aeom: one page, `grid` failing or not. */
async function measure(dir: string, failing: boolean) {
  await put(join(dir, ".aeom", "captures", "manifest.json"), { url: "http://x", capturedAt: "", widths: [1280], errors: [], pages: [{ url: "http://x/", path: "/", files: [{ width: 1280, file: "index@1280.png" }] }] });
  await put(join(dir, ".aeom", "reports", "check.json"), { url: "http://x", checkedAt: "", widths: [1280], checks: ["contrast"], pages: ["http://x/"], errors: [], findings: [] });
  await put(join(dir, ".aeom", "reports", "judge.json"), { judgedAt: "", voters: ["1", "2", "3"], principles: [{ id: "grid", text: "" }], failures: 0, pages: [{ page: "/", verdicts: [{ principle: "grid", pass: !failing, votes: "", reasons: ["edges"], dissent: [], steps: [] }] }] });
}

test("the run's commands note what they did in its state, beside the coordinator's mark, and the resume says it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-run-notes-"));
  try {
    await git(dir, "init", "-q", "-b", "main");
    const R = ".aeom/runs/run-1";
    await mkdir(join(dir, R), { recursive: true });
    assert.equal((await run(dir, ["run", "mark", R, "--phase", "pages", "--step", "4"])).code, 0);

    await measure(dir, true);
    assert.equal((await run(dir, ["snapshot", `${R}/before`])).code, 0);
    await measure(dir, false);
    assert.equal((await run(dir, ["snapshot", `${R}/after`])).code, 0);
    const compared = await run(dir, ["compare", `${R}/before`, `${R}/after`]);
    assert.equal(compared.code, 0, compared.out);
    const state = await notes(join(dir, R));
    assert.equal(state.phase, "pages", "the coordinator's phase stays");
    assert.equal(state.step, "4");
    assert.deepEqual(state.history.map((h) => [h.phase, h.done ?? null]), [["pages", null], ["judge", "aeom snapshot before"], ["measure", "aeom snapshot after"], ["measure", "aeom compare before → after"]]);

    const resume = await run(dir, ["run", "resume", R]);
    assert.match(resume.out, /Since that mark, AEOM's commands did: aeom snapshot before, aeom snapshot after, aeom compare before → after\./);
    assert.match(resume.out, /Go on at step 4, after what they did\.$/m);
    assert.match((await run(dir, ["run", "status", R])).out, /Since that mark, AEOM's commands did: .*aeom compare before → after\./);

    // Each folder the skill names belongs to its phase, given in any form; a folder of another name is not noted.
    for (const name of ["kit-look", "after-revert", "end", "elsewhere"]) assert.equal((await run(dir, ["snapshot", join(await realpath(dir), R, name) + "/"])).code, 0);
    assert.deepEqual((await notes(join(dir, R))).history.slice(4).map((h) => [h.phase, h.done]), [["kit", "aeom snapshot kit-look"], ["measure", "aeom snapshot after-revert"], ["remeasure", "aeom snapshot end"]]);

    // A run folder that keeps no state gets none from a command; a broken one does not stop the command.
    assert.equal((await run(dir, ["snapshot", ".aeom/runs/run-2/before"])).code, 0);
    assert.equal(existsSync(join(dir, ".aeom/runs/run-2/state.json")), false);
    await writeFile(join(dir, R, "state.json"), "{ broken");
    const broken = await run(dir, ["snapshot", `${R}/after`]);
    assert.equal(broken.code, 0, broken.out);
    assert.match(broken.out, /Captures and reports copied/);
    assert.match(broken.out, /could not note it in .*state\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom pr holds a wave the coordinator never marked, by the workers it launched, and the standard written notes itself", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-run-notes-pr-"));
  try {
    await git(dir, "init", "-q", "-b", "main");
    await git(dir, "config", "user.email", "t@example.test");
    await git(dir, "config", "user.name", "T");
    await put(join(dir, ".gitignore"), ".aeom/runs/\n");
    await put(join(dir, "shared", "kit.css"), ":root {\n  --encre: #1c2226; /* label ink */\n  --petrole: #1f4b57;\n}\n.bouton { background: var(--petrole); }\n.carte { color: var(--encre); }\n");
    await put(join(dir, "pages", "index.html"), "<h1>before</h1>");
    await git(dir, "add", "-A");
    await git(dir, "commit", "-qm", "app");
    await git(dir, "checkout", "-qb", "aeom/run-1");
    await put(join(dir, "pages", "index.html"), "<h1>after</h1>");
    await git(dir, "commit", "-qam", "aeom: the home page");
    await put(join(dir, ".aeom", "product.md"), "# Super Boutique\n\n## What it is for\nA shop. (seen: /)\n");
    const R = ".aeom/runs/run-1";
    await measure(dir, true);
    assert.equal((await run(dir, ["snapshot", `${R}/before`])).code, 0);
    await measure(dir, false);
    await put(join(dir, R, "verdict.json"), { nothingToRedo: false, line: "Measured: 1 screen.", failures: [] });
    await put(join(dir, R, "base"), "main\n");
    // The coordinator marked the start and launched a page worker, then forgot every mark of the wave.
    assert.equal((await run(dir, ["run", "mark", R, "--phase", "verdict", "--step", "run.3"])).code, 0);
    assert.equal((await run(dir, ["run", "agent", R, "--name", "home", "--kind", "page worker", "--status", "launched", "--page", "/"])).code, 0);

    const unmeasured = await run(dir, ["pr", R, "--dry-run"]);
    assert.equal(unmeasured.code, 1);
    assert.match(unmeasured.out, /the pages were not measured after their wave/);
    assert.equal((await run(dir, ["snapshot", `${R}/after`])).code, 0);
    assert.equal((await run(dir, ["compare", `${R}/before`, `${R}/after`])).code, 0);
    const noStandard = await run(dir, ["pr", R, "--dry-run"]);
    assert.equal(noStandard.code, 1);
    assert.match(noStandard.out, /the standard of the front was not reached/);

    const draft = (await run(dir, ["standard", "--draft", "shared/kit.css"])).stdout
      .replace(/## Direction\n[^\n]+/, "## Direction\nnuancier: Sert la boucle principale, comme un coupon de tissu qu'on suit.")
      .replace(/## Rules\n[^\n]+/, "## Rules\n- Only the main action is ink.");
    await put(join(dir, R, "standard.md"), draft);
    const written = await run(dir, ["standard", `${R}/standard.md`]);
    assert.equal(written.code, 0, written.out);
    assert.equal((await notes(join(dir, R))).history.at(-1)!.done, "aeom standard: .aeom/standard.md written");
    // A draft that is not a standard yet reaches nothing: it is fixed and run again.
    await put(join(dir, R, "bad.md"), draft.replace(/## Rules\n[^\n]+/, "## Rules\n<the product's own rules>"));
    assert.equal((await run(dir, ["standard", `${R}/bad.md`])).code, 1);
    assert.equal((await notes(join(dir, R))).history.at(-1)!.done, "aeom standard: .aeom/standard.md written", "no note for a draft refused");
    const ready = await run(dir, ["pr", R, "--dry-run"]);
    assert.equal(ready.code, 0, ready.out);
    assert.match(ready.out, /AEOM: the front fixed \(run-1\)/);

    // The person's own correction no longer holds: nothing is written, and the step is still reached, as the skill says.
    await writeFile(join(dir, ".aeom", "standard.md"), (await readFile(join(dir, ".aeom", "standard.md"), "utf8")).replace("`--encre: #1c2226`", "`--encre: #000000`"));
    const refused = await run(dir, ["standard", `${R}/standard.md`]);
    assert.equal(refused.code, 1);
    assert.match(refused.out, /With your corrections in \.aeom\/standard\.md, the standard would not hold/);
    assert.equal((await notes(join(dir, R))).history.at(-1)!.done, "aeom standard: nothing written, the person's corrections no longer hold");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
