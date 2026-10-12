import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const run = async (cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args], { cwd, env: { ...process.env, ...env } });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};

test("aeom sheet puts each direction's note under its capture, and refuses a note for a direction it does not show", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-sheet-"));
  try {
    const wrong = await run(dir, ["sheet", "--out", "sheet.png", "tissus=tissus.png", "--note", "plaid=Serves the main loop."]);
    assert.equal(wrong.code, 1);
    assert.match(wrong.out, /A note for plaid, which the sheet does not show/);
    const unsplit = await run(dir, ["sheet", "--out", "sheet.png", "tissus=tissus.png", "--note", "Serves the main loop."]);
    assert.equal(unsplit.code, 1);
    assert.match(unsplit.out, /--note takes <label>=<sentence>/);
    const twice = await run(dir, ["sheet", "--out", "sheet.png", "tissus=tissus.png", "--note", "tissus=One.", "--note", "tissus=Two."]);
    assert.equal(twice.code, 1);
    assert.match(twice.out, /Two notes for tissus/);
    const { code, out } = await run(dir, ["sheet", "--out", "noted.png", "tissus=tissus.png", "--note", "tissus=Serves the main loop: choose a piece, add it, follow the order."]);
    assert.equal(code, 0, out);
    assert.equal((await run(dir, ["sheet", "--out", "bare.png", "tissus=tissus.png"])).code, 0);
    // A PNG's height sits at bytes 20 to 24: the note adds a line under the capture.
    const height = async (file: string) => (await readFile(join(dir, file))).readUInt32BE(20);
    assert.ok((await height("noted.png")) > (await height("bare.png")), "the note takes room under the capture");
    assert.ok((await stat(join(dir, "noted.png"))).size > 1000);
    assert.deepEqual(JSON.parse(await readFile(join(dir, "noted.json"), "utf8")), [{ label: "tissus", note: "Serves the main loop: choose a piece, add it, follow the order." }], "the sentences stay beside the sheet, for the result page");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom sheet --width sets the width of each capture, so a direction's strip of screens stays readable on the sheet of all six", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-sheet-"));
  try {
    const width = async (file: string) => (await readFile(join(dir, file))).readUInt32BE(16);
    assert.equal((await run(dir, ["sheet", "--out", "narrow.png", "--columns", "1", "a=a.png"])).code, 0);
    assert.equal((await run(dir, ["sheet", "--out", "wide.png", "--columns", "1", "--width", "1600", "a=a.png"])).code, 0);
    assert.equal(await width("narrow.png"), 640 + 48);
    assert.equal(await width("wide.png"), 1600 + 48);
    assert.equal((await run(dir, ["sheet", "--out", "query.png", "--columns", "1", "/?vue=carte=" + join(dir, "wide.png")])).code, 0);
    assert.equal((await run(dir, ["sheet", "--out", "lost.png", "--columns", "1", "/?vue=carte=" + join(dir, "nowhere.png")])).code, 0);
    const height = async (file: string) => (await readFile(join(dir, file))).readUInt32BE(20);
    assert.notEqual(await height("query.png"), await height("lost.png"), "a route with a query keeps its capture: the label ends at the last =");
    assert.match((await run(dir, ["tournament", "--help"])).out, /<start\|next\|vote\|status\|decide>/);
    const bad = await run(dir, ["sheet", "--out", "x.png", "--width", "0", "a=a.png"]);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /--width must be a positive whole number of pixels/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom tournament decide keeps what the person decided on the knockout, in the run and in their taste", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-decide-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const D = join(dir, ".aeom", "runs", "run-1", "directions");
  const env = { AEOM_HOME: home };
  try {
    await mkdir(D, { recursive: true });
    for (const name of ["topo", "bivouac", "grotte"]) await writeFile(join(D, `${name}.png`), "");
    assert.equal((await run(dir, ["tournament", "start", "--dir", D, "topo", "bivouac"])).code, 0);
    const early = await run(dir, ["tournament", "decide", "--dir", D], env);
    assert.equal(early.code, 1);
    assert.match(early.out, /No knockout was played: choose one of topo, bivouac/);
    let last = { code: 0, out: "" };
    for (const voter of ["1", "2", "3"]) last = await run(dir, ["tournament", "vote", "--dir", D, "--duel", "1", "--voter", voter, "--winner", "topo", "--reason", "map legend"]);
    assert.match(last.out, /Champion: topo\. Show the person the directions and ask them: aeom tournament decide/);
    assert.match((await run(dir, ["tournament", "status", "--dir", D])).out, /Champion: topo, waiting for the person's decision/);

    const dropped = await run(dir, ["tournament", "decide", "--dir", D, "--drop", "topo", "--why", "Une carte de randonnée, pas un jeu."], env);
    assert.equal(dropped.code, 0, dropped.out);
    assert.match(dropped.out, /bivouac is the one direction left of the knockout: the run applies it/);
    const chosen = await run(dir, ["tournament", "decide", "--dir", D, "--choose", "grotte", "--why", "Elle prolonge les illustrations peintes."], env);
    assert.equal(chosen.code, 0, chosen.out);
    assert.match(chosen.out, /The run applies grotte, chosen by the person over the judges' topo\./);
    const t = JSON.parse(await readFile(join(D, "tournament.json"), "utf8"));
    assert.equal(t.decision.applied, "grotte");
    assert.equal(t.decision.judges, "topo");
    assert.match((await run(dir, ["tournament", "status", "--dir", D])).out, /Champion of the judges: topo\nApplied: grotte, the person's decision: Elle prolonge les illustrations peintes\./);
    const taste = (await readFile(join(home, "taste", "feedback.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(taste.length, 2);
    assert.deepEqual(
      taste.map((f: { id: string; category: string; agree: boolean; why: string }) => [f.id, f.category, f.agree, f.why]),
      [
        ["direction-choice:topo", "direction", false, "Dropped topo. Une carte de randonnée, pas un jeu."],
        ["direction-choice:topo", "direction", false, "Chose grotte. Elle prolonge les illustrations peintes."],
      ],
    );
    const unknown = await run(dir, ["tournament", "decide", "--dir", D, "--choose", "plage"], env);
    assert.equal(unknown.code, 1);
    assert.match(unknown.out, /plage is not one of the directions: topo, bivouac, grotte/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("dropping the judges' champion with several directions left asks for a new knockout, and decides nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-decide-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const D = join(dir, ".aeom", "runs", "run-1", "directions");
  try {
    await mkdir(D, { recursive: true });
    assert.equal((await run(dir, ["tournament", "start", "--dir", D, "topo", "bivouac", "grotte"])).code, 0);
    for (const duel of ["1", "3"]) for (const voter of ["1", "2", "3"]) await run(dir, ["tournament", "vote", "--dir", D, "--duel", duel, "--voter", voter, "--winner", "topo", "--reason", "map"]);
    const { code, out } = await run(dir, ["tournament", "decide", "--dir", D, "--drop", "topo"], { AEOM_HOME: home });
    assert.equal(code, 0, out);
    assert.match(out, /The person dropped the judges' champion, topo\. Run a new knockout among bivouac, grotte: aeom tournament start --reset --dir .* bivouac grotte/);
    assert.equal(JSON.parse(await readFile(join(D, "tournament.json"), "utf8")).decision, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("with no knockout, the person chooses alone: aeom tournament decide --choose keeps it, says so, and names no champion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-decide-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const D = join(dir, ".aeom", "runs", "run-1", "directions");
  try {
    await mkdir(D, { recursive: true });
    for (const name of ["topo", "bivouac", "grotte"]) await writeFile(join(D, `${name}.png`), "");
    const started = await run(dir, ["tournament", "start", "--no-knockout", "--dir", D, "topo", "bivouac", "grotte"]);
    assert.equal(started.code, 0, started.out);
    assert.match(started.out, /3 directions recorded, with no knockout: ask the person, then aeom tournament decide --dir .* --choose <name>/);
    assert.match((await run(dir, ["tournament", "next", "--dir", D])).out, /No knockout in this run: the person chooses/);
    const { code, out } = await run(dir, ["tournament", "decide", "--dir", D, "--choose", "grotte", "--why", "Elle prolonge les illustrations."], { AEOM_HOME: home });
    assert.equal(code, 0, out);
    assert.match(out, /The run applies grotte, chosen by the person, with no knockout\./);
    const decision = JSON.parse(await readFile(join(D, "tournament.json"), "utf8")).decision;
    assert.equal(decision.applied, "grotte");
    assert.equal(decision.judges, null);
    assert.match((await run(dir, ["tournament", "status", "--dir", D])).out, /Champion of the judges: none, no knockout\nApplied: grotte, the person's decision: Elle prolonge les illustrations\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});
