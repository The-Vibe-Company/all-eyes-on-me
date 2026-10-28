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

test("aeom taste keeps the rules said and the lessons runs showed, and gives briefs a short index of them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-taste-"));
  const home = join(dir, ".home");
  const run = (args: string[]) =>
    promisify(execFile)("node", [AEOM, "taste", ...args], { cwd: dir, env: { ...process.env, AEOM_HOME: home, AEOM_TELEMETRY: "0" } }).then(
      (r) => ({ code: 0, out: r.stdout + r.stderr }),
      (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, out: e.stdout + e.stderr }),
    );
  try {
    assert.match((await run([])).out, /Nothing taught yet/);
    assert.equal((await run(["--brief"])).out, "", "a brief with nothing taught carries nothing, not even an empty line");
    assert.equal((await run(["rule", "Never a cream background."])).code, 0);
    const project = await run(["rule", "Buttons in capitals.", "--project", "--why", "the brand writes them so"]);
    assert.match(project.out, /Kept for this project, in \.aeom\/taste\.md/);
    assert.match((await run(["rule", "never a cream background"])).out, /Already kept/);

    // A run the person disagreed with: what it can teach, then the lessons drawn from it.
    const R = join(dir, ".aeom", "runs", "run-1");
    await mkdir(R, { recursive: true });
    const { realpathSync } = await import("node:fs");
    await mkdir(join(home, "taste"), { recursive: true });
    await writeFile(join(home, "taste", "feedback.jsonl"), `${JSON.stringify({ project: realpathSync(dir), run: "run-1", id: "screen:/produits", category: "screens", verdict: "/produits kept", agree: false, why: "the table is still cramped", at: "" })}\n`);
    const pending = await run(["learn"]);
    assert.match(pending.out, /run-1: 1 thing to learn from/);
    const learned = await run(["learn", ".aeom/runs/run-1"]);
    assert.match(learned.out, /disagreed with "\/produits kept": the table is still cramped/);
    assert.match(learned.out, /aeom taste lesson "<the lesson>" --run \.aeom\/runs\/run-1 --evidence "<the line it rests on>"/);
    assert.ok(!existsSync(join(R, "learned")), "reading a run teaches nothing yet: a worker that stops there leaves it to learn");
    assert.match((await run(["learn"])).out, /run-1/);
    assert.equal((await run(["lesson", "Something else.", "--run", ".aeom/runs/run-1"])).code, 1, "a lesson rests on what the run showed");
    const made = await run(["lesson", "Something else.", "--run", ".aeom/runs/run-1", "--evidence", "disagreed with the gradient on every title"]);
    assert.equal(made.code, 1, "never on a line the run did not show");
    assert.match(made.out, /did not show that/);
    assert.equal((await run(["lesson", "A dense table needs more air between rows than the kit gives.", "--run", ".aeom/runs/run-1", "--evidence", 'disagreed with "/produits kept"'])).code, 0);
    assert.ok(existsSync(join(R, "learned")));
    assert.doesNotMatch((await run(["learn"])).out, /run-1/, "a run is learned from once");

    // Nothing but a run's folder is written in.
    await writeFile(join(dir, "notes.txt"), "mine\n");
    assert.equal((await run(["learn", "notes.txt"])).code, 1);
    assert.equal((await run(["learn", ".aeom"])).code, 1);
    assert.ok(!existsSync(join(dir, ".aeom", "learned")));
    // A run with nothing that holds as a lesson is learned without one.
    await mkdir(join(dir, ".aeom", "runs", "run-2"));
    await writeFile(join(home, "taste", "feedback.jsonl"), `${JSON.stringify({ project: realpathSync(dir), run: "run-2", id: "screen:/", category: "screens", verdict: "/ kept", agree: false, why: "not sure", at: "" })}\n`, { flag: "a" });
    assert.match((await run(["learn"])).out, /run-2: 1 thing/);
    assert.match((await run(["learn", ".aeom/runs/run-2", "--none"])).out, /learned, with no lesson/);
    assert.doesNotMatch((await run(["learn"])).out, /run-2/);

    const brief = await run(["--brief"]);
    assert.equal(brief.code, 0);
    assert.match(brief.out, /^This project's rules, first:\n- Buttons in capitals\.\n\nThe person's own rules:\n- Never a cream background\.\n\nLessons from earlier runs, the most confirmed first:\n- A dense table needs more air between rows than the kit gives\./);
    assert.match(await readFile(join(dir, ".aeom", "taste.md"), "utf8"), /Buttons in capitals\. \(said \d{4}-\d{2}-\d{2}: the brand writes them so\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
