import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
    assert.match((await run(dir, ["tournament", "--help"])).out, /<start\|next\|vote\|status\|compare\|decide>/);
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
    // The sheet and the front as it is lie next to the directions' captures: neither is a direction.
    for (const name of ["topo", "bivouac", "grotte", "now", "sheet"]) await writeFile(join(D, `${name}.png`), "");
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
    assert.match(unknown.out, /plage is not one of the directions: topo, bivouac, grotte\.$/m);
    const now = await run(dir, ["tournament", "decide", "--dir", D, "--choose", "now"], env);
    assert.equal(now.code, 1, "the front as it is is kept by improving it, never chosen as a direction");
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

test("aeom tournament compare checks the screening's comparison, keeps it and says it in words; the decision notes whether the person followed its advice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-compare-dirs-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const D = join(dir, ".aeom", "runs", "run-1", "directions");
  try {
    await mkdir(D, { recursive: true });
    for (const name of ["lutrin", "verriere", "guichet"]) await writeFile(join(D, `${name}.png`), "");
    await writeFile(join(D, "sheet.json"), JSON.stringify([{ label: "now", note: "The front as it is today." }, { label: "lutrin" }, { label: "verriere" }, { label: "guichet" }]));
    const said = (slug: string) => ({ strong: `${slug}: the dense list reads at a glance.`, weak: `${slug}: the header takes a third of the screen.`, fit: `${slug}: a town hall's desk, as the spec asks.` });
    const answer = (compare: Record<string, unknown>, start: unknown) => writeFile(join(D, "screening-1.json"), JSON.stringify({ out: {}, compare, start }));

    await answer({ lutrin: said("lutrin"), verriere: said("verriere") }, { source: "lutrin", why: "x" });
    const missing = await run(dir, ["tournament", "compare", "--dir", D, "--from", join(D, "screening-1.json")]);
    assert.equal(missing.code, 1);
    assert.match(missing.out, /The comparison leaves out guichet/);
    await answer({ lutrin: said("lutrin"), verriere: said("verriere"), guichet: { ...said("guichet"), weak: "" } }, { source: "plage", why: "x" });
    const wrong = await run(dir, ["tournament", "compare", "--dir", D, "--from", join(D, "screening-1.json")]);
    assert.match(wrong.out, /guichet has no weak point/);
    assert.match(wrong.out, /It would start from plage, which is not on the sheet/);

    await answer({ lutrin: said("lutrin"), verriere: said("verriere"), guichet: said("guichet") }, { source: "verriere", why: "its glass panes keep the density and add the light the town hall lacks." });
    const ok = await run(dir, ["tournament", "compare", "--dir", D, "--from", join(D, "screening-1.json")]);
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /^lutrin\n  Strong: lutrin: the dense list reads at a glance\.\n  Weak: lutrin: the header takes a third of the screen\.\n  Fit: lutrin: a town hall's desk, as the spec asks\./m);
    assert.match(ok.out, /The screening would start from verriere: its glass panes keep the density and add the light the town hall lacks\. Advice only: the person chooses, one direction or a mix\./);
    assert.equal(JSON.parse(await readFile(join(D, "compare.json"), "utf8")).start.slug, "verriere");

    await run(dir, ["tournament", "start", "--no-knockout", "--dir", D, "lutrin", "verriere", "guichet"]);
    const chosen = await run(dir, ["tournament", "decide", "--dir", D, "--choose", "lutrin", "--why", "Lutrin avec l'air de Verrière."], { AEOM_HOME: home });
    assert.equal(chosen.code, 0, chosen.out);
    assert.match(chosen.out, /The screening advised verriere: the person chose otherwise\./);
    assert.deepEqual(JSON.parse(await readFile(join(D, "tournament.json"), "utf8")).decision.advised, { slug: "verriere", followed: false });
    assert.match(await readFile(join(home, "taste", "feedback.jsonl"), "utf8"), /"id":"direction-advice:verriere".*"agree":false/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("the comparison reads a judge's answer wrapped in words, leaves out a direction that did not open and refuses to advise one it named; the advice counts only for its own round, a mix of the advised one following it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-compare-rounds-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const D = join(dir, ".aeom", "runs", "run-1", "directions");
  try {
    await mkdir(D, { recursive: true });
    for (const name of ["lutrin", "verriere"]) await writeFile(join(D, `${name}.png`), "");
    // ghost did not open: on the sheet as a gap, with no capture.
    await writeFile(join(D, "sheet.json"), JSON.stringify([{ label: "now" }, { label: "lutrin" }, { label: "verriere" }, { label: "ghost" }]));
    const said = { strong: "a.", weak: "b.", fit: "c." };
    const compare = (body: string) => run(dir, ["tournament", "compare", "--dir", D, "--from", join(D, "screening-1.json")]).then((r) => r);
    await writeFile(join(D, "screening-1.json"), `Here is my answer:\n\`\`\`json\n${JSON.stringify({ out: { verriere: "a banned look" }, compare: { lutrin: said, verriere: said }, start: { source: "verriere", why: "x" } })}\n\`\`\``);
    const named = await compare("");
    assert.equal(named.code, 1, named.out);
    assert.match(named.out, /It would start from verriere, which it names: a banned look/);
    await writeFile(join(D, "screening-1.json"), `\`\`\`json\n${JSON.stringify({ out: {}, compare: { lutrin: said, verriere: said, now: said }, start: { source: "", slug: "verriere", why: "it works!" } })}\n\`\`\``);
    const ok = await compare("");
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /The screening would start from verriere: it works! Advice only/);

    // The person asks for a mix of the advised one: a round of three, the mix chosen, the advice followed.
    await writeFile(join(D, "verriere-mix.png"), "");
    await run(dir, ["tournament", "start", "--no-knockout", "--dir", D, "lutrin", "verriere"]);
    await run(dir, ["tournament", "start", "--no-knockout", "--reset", "--dir", D, "lutrin", "verriere", "verriere-mix"]);
    const stale = await run(dir, ["tournament", "decide", "--dir", D, "--choose", "lutrin"], { AEOM_HOME: home });
    assert.equal(stale.code, 0, stale.out);
    assert.doesNotMatch(stale.out, /The screening advised/, "an advice given on another round says nothing of this one");
    await writeFile(join(D, "sheet.json"), JSON.stringify([{ label: "lutrin" }, { label: "verriere" }, { label: "verriere-mix" }]));
    await writeFile(join(D, "screening-2.json"), JSON.stringify({ out: {}, compare: { lutrin: said, verriere: said, "verriere-mix": said }, start: { source: "verriere", why: "x" } }));
    assert.equal((await run(dir, ["tournament", "compare", "--dir", D, "--from", join(D, "screening-2.json")])).code, 0);
    const mixed = await run(dir, ["tournament", "decide", "--dir", D, "--choose", "verriere-mix", "--why", "Verrière, plus chaude."], { AEOM_HOME: home });
    assert.match(mixed.out, /The screening advised verriere: the person followed it, as verriere-mix\./);
    assert.deepEqual(JSON.parse(await readFile(join(D, "tournament.json"), "utf8")).decision.advised, { slug: "verriere", followed: true });

    // A comparison file broken by hand never keeps the person's choice from being kept.
    await writeFile(join(D, "compare.json"), `{"directions": [`);
    const broken = await run(dir, ["tournament", "decide", "--dir", D, "--choose", "lutrin"], { AEOM_HOME: home });
    assert.equal(broken.code, 0, broken.out);
    assert.equal(JSON.parse(await readFile(join(D, "tournament.json"), "utf8")).decision.applied, "lutrin");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("each start of the tournament keeps a round, its directions and their sentences; compare and decide add their comparison and the choice to it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-rounds-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const D = join(dir, ".aeom", "runs", "run-1", "directions");
  try {
    await mkdir(D, { recursive: true });
    for (const name of ["lutrin", "verriere", "lutrin-mix"]) await writeFile(join(D, `${name}.png`), "");
    await writeFile(join(D, "sheet.json"), JSON.stringify([{ label: "now", note: "The front as it is today." }, { label: "lutrin", note: "A lectern." }, { label: "verriere", note: "Glass panes." }]));
    await run(dir, ["tournament", "start", "--no-knockout", "--dir", D, "lutrin", "verriere"]);
    const said = { strong: "a.", weak: "b.", fit: "c." };
    await writeFile(join(D, "screening-1.json"), JSON.stringify({ out: {}, compare: { lutrin: said, verriere: said }, start: { source: "verriere", why: "x." } }));
    await run(dir, ["tournament", "compare", "--dir", D, "--from", join(D, "screening-1.json")]);
    await writeFile(join(D, "sheet.json"), JSON.stringify([{ label: "lutrin" }, { label: "verriere" }, { label: "lutrin-mix", note: "Lutrin with the air of Verrière." }]));
    await run(dir, ["tournament", "start", "--no-knockout", "--reset", "--dir", D, "lutrin", "verriere", "lutrin-mix"]);
    await run(dir, ["tournament", "decide", "--dir", D, "--choose", "lutrin-mix", "--why", "Lutrin avec l'air de Verrière."], { AEOM_HOME: home });
    const rounds = JSON.parse(await readFile(join(D, "rounds.json"), "utf8"));
    assert.deepEqual(rounds.map((r: { round: number; entrants: string[] }) => [r.round, r.entrants]), [[1, ["lutrin", "verriere"]], [2, ["lutrin", "verriere", "lutrin-mix"]]]);
    assert.deepEqual(rounds[0].notes, { lutrin: "A lectern.", verriere: "Glass panes." });
    assert.equal(rounds[0].compare.start.slug, "verriere");
    assert.equal(rounds[1].compare, undefined, "a comparison belongs to its round");
    assert.deepEqual(rounds[1].decision, { applied: "lutrin-mix", why: "Lutrin avec l'air de Verrière." });
    assert.deepEqual(rounds[1].notes, { "lutrin-mix": "Lutrin with the air of Verrière." });
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test("in the skill's order, compare before start, the round still holds its comparison; a broken list of rounds is set aside, never lost", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-rounds-order-"));
  const home = await mkdtemp(join(tmpdir(), "aeom-home-"));
  const D = join(dir, ".aeom", "runs", "run-1", "directions");
  try {
    await mkdir(D, { recursive: true });
    for (const name of ["lutrin", "verriere"]) await writeFile(join(D, `${name}.png`), "");
    await writeFile(join(D, "sheet.json"), JSON.stringify([{ label: "lutrin", note: "A lectern." }, { label: "verriere" }]));
    const said = { strong: "a.", weak: "b.", fit: "c." };
    await writeFile(join(D, "screening-1.json"), JSON.stringify({ out: {}, compare: { lutrin: said, verriere: said }, start: { source: "verriere", why: "x." } }));
    await run(dir, ["tournament", "compare", "--dir", D, "--from", join(D, "screening-1.json")]);
    await run(dir, ["tournament", "start", "--no-knockout", "--dir", D, "lutrin", "verriere"]);
    await run(dir, ["tournament", "decide", "--dir", D, "--choose", "lutrin"], { AEOM_HOME: home });
    const rounds = JSON.parse(await readFile(join(D, "rounds.json"), "utf8"));
    assert.equal(rounds.length, 1, "one round, opened by the comparison, kept by the start");
    assert.equal(rounds[0].compare.start.slug, "verriere");
    assert.equal(rounds[0].decision.applied, "lutrin");
    assert.deepEqual(rounds[0].notes, { lutrin: "A lectern." });

    await writeFile(join(D, "rounds.json"), "[{");
    await run(dir, ["tournament", "start", "--no-knockout", "--reset", "--dir", D, "lutrin", "verriere"]);
    assert.ok((await readdir(D)).some((f) => f.startsWith("rounds.json.broken")), "the broken list is set aside");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});
