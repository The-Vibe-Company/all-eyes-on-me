import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
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

let server: Server;
let url: string;
let dir: string;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/help") {
      res.writeHead(500);
      return res.end("Internal Server Error");
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(req.url === "/orders" ? "<h1>Mes commandes</h1>" : `<a href="/orders">Commandes</a> <a href="/help">Aide</a>`);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as { port: number }).port}`;
  dir = await mkdtemp(join(tmpdir(), "aeom-journey-cli-"));
  await mkdir(join(dir, ".aeom", "journeys"), { recursive: true });
  await writeFile(join(dir, ".aeom", "journeys", "see-my-orders.json"), JSON.stringify({ name: "See my orders", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Commandes" }, lands: "/orders" }] }));
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

test("aeom journey replays the journeys in .aeom/journeys and names each one's sheet", async () => {
  const { code, out } = await run(dir, ["journey", "--url", url, "--widths", "390"]);
  assert.equal(code, 0, out);
  assert.match(out, /✓ See my orders\s+390 px\s+2 steps, 2 screens, 0 back/);
  assert.match(out, /\.aeom\/captures\/journeys\/see-my-orders@390\.png/);
  assert.match(out, /No reset command/);
  const plan = await run(dir, ["journey", "--plan"]);
  assert.equal(plan.code, 0, plan.out);
  assert.match(plan.out, /Shared, one worker first, with the navigation: no screen\nSee my orders \(see-my-orders\): \/, \/orders/);
  const empty = await run(dir, ["journey", "--plan", "--out", ""]);
  assert.equal(empty.code, 1);
  assert.match(empty.out, /--out cannot be empty/);
  await writeFile(join(dir, ".aeom", "captures", "journeys", "report.json"), JSON.stringify({ journeys: [{ slug: "x", name: "X" }] }));
  const wrong = await run(dir, ["journey", "--plan"]);
  assert.equal(wrong.code, 1);
  assert.match(wrong.out, /is not a replay of aeom journey to plan from/);
});

test("a journey that breaks makes aeom journey fail, and says at which step and why", async () => {
  await writeFile(join(dir, ".aeom", "journeys", "get-help.json"), JSON.stringify({ name: "Get help", steps: [{ do: "open", path: "/" }, { do: "click", target: { role: "link", name: "Aide" } }] }));
  try {
    const { code, out } = await run(dir, ["journey", "--url", url, "--widths", "390", "--out", join(dir, "out")]);
    assert.equal(code, 1);
    assert.match(out, /✗ Get help\s+390 px\s+breaks at step 2, click link "Aide": the page answered 500/);
  } finally {
    await rm(join(dir, ".aeom", "journeys", "get-help.json"));
  }
});

test("journey files that cannot be replayed are refused before any browser starts", async () => {
  await writeFile(join(dir, ".aeom", "journeys", "bad.json"), JSON.stringify({ name: "Bad", steps: [{ do: "fly" }] }));
  try {
    const { code, out } = await run(dir, ["journey", "--url", url]);
    assert.equal(code, 1);
    assert.match(out, /bad\.json, step 1: unknown action "fly"/);
  } finally {
    await rm(join(dir, ".aeom", "journeys", "bad.json"));
  }
});

test("aeom journey --by-page says, page by page, what the journeys break or fail there", async () => {
  const here = await mkdtemp(join(tmpdir(), "aeom-by-page-"));
  try {
    const out = join(here, "replay");
    await mkdir(out, { recursive: true });
    const step = (index: number, path: string) => ({ index, action: `step ${index}`, path, capture: null });
    const runOf = (width: number, paths: string[], broken: { step: number; reason: string } | null = null) => ({ width, steps: paths.map((p, i) => step(i + 1, p)), calls: [], screens: [...new Set(paths)], counts: { steps: paths.length, screens: 1, back: 0 }, broken, sheet: "" });
    await writeFile(join(out, "report.json"), JSON.stringify({
      url: "http://localhost:3000/",
      replayedAt: "",
      widths: [390, 1280],
      warnings: [],
      journeys: [
        { slug: "share", name: "Share a note", runs: [runOf(390, ["/", "/notes"], { step: 3, reason: 'no button "Share" on the screen' }), runOf(1280, ["/", "/notes", "/notes/12"])] },
        { slug: "write", name: "Write a note", runs: [runOf(1280, ["/", "/notes/7"])] },
      ],
    }));
    const critique = join(here, "judge-journeys.json");
    await writeFile(critique, JSON.stringify({
      judgedAt: "",
      voters: ["1"],
      principles: [],
      failures: 1,
      pages: [{ page: "write", verdicts: [{ principle: "same-words", pass: false, votes: "1/1 fail", reasons: ['The link says "New", the page "Draft".'], dissent: [], steps: [2] }] }],
    }));

    const text = await run(here, ["journey", "--by-page", "--out", out, "--critique", critique]);
    assert.equal(text.code, 0, text.out);
    assert.equal(text.out, '/notes\n  Share a note, step 3: breaks at 390 px: no button "Share" on the screen\n/notes/:id\n  Write a note, step 2, same-words: The link says "New", the page "Draft".\n');

    const json = await run(here, ["journey", "--by-page", "--out", out, "--critique", critique, "--json"]);
    assert.equal(json.code, 0, json.out);
    assert.deepEqual(JSON.parse(json.out).map((p: { page: string }) => p.page), ["/notes", "/notes/:id"]);

    // With captures, each finding says where to look, as a path the worker can open.
    const shot = JSON.parse(await readFile(join(out, "report.json"), "utf8"));
    for (const j of shot.journeys) for (const r of j.runs) for (const st of r.steps) st.capture = `${j.slug}@${r.width}-0${st.index}.png`;
    await writeFile(join(out, "report.json"), JSON.stringify(shot));
    const looked = await run(here, ["journey", "--by-page", "--out", out, "--critique", critique]);
    assert.match(looked.out, new RegExp(`  Write a note, step 2, same-words: .*\\n    ${join(out, "write@1280-02.png").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`));
    const lookedJson = JSON.parse((await run(here, ["journey", "--by-page", "--out", out, "--critique", critique, "--json"])).out);
    assert.equal(lookedJson[1].findings[0].capture, join(out, "write@1280-02.png"));

    const alone = await run(here, ["journey", "--by-page", "--out", out, "--critique", join(here, "none.json")]);
    assert.equal(alone.code, 0, alone.out);
    assert.match(alone.out, /^No critique of the journeys in .*none\.json: only where they break\.\n\/notes\n/);
    assert.doesNotMatch(alone.out, /same-words/);

    const nothing = await run(here, ["journey", "--by-page", "--out", join(here, "empty")]);
    assert.equal(nothing.code, 1);
    assert.match(nothing.out, /No replayed journeys in .*empty\. Run aeom journey first\./);

    // The page judge's report is not a critique of these journeys: said, in JSON too, and only the breaks are given.
    const pagesJudged = join(here, "judge.json");
    await writeFile(pagesJudged, JSON.stringify({ judgedAt: "", voters: ["1"], principles: [], failures: 0, pages: [{ page: "/", verdicts: [] }] }));
    const wrongCritique = await run(here, ["journey", "--by-page", "--out", out, "--critique", pagesJudged, "--json"]);
    assert.equal(wrongCritique.code, 0, wrongCritique.out);
    assert.match(wrongCritique.out, /judge\.json judges none of these journeys: only where they break\./);
    // A verdict with no steps, a replay with no url: no crash.
    await writeFile(critique, JSON.stringify({ judgedAt: "", voters: ["1"], principles: [], failures: 1, pages: [{ page: "write", verdicts: [{ principle: "short", pass: false, votes: "1/1 fail", reasons: ["Long."], dissent: [] }] }] }));
    const report = JSON.parse(await readFile(join(out, "report.json"), "utf8"));
    await writeFile(join(out, "report.json"), JSON.stringify({ ...report, url: "" }));
    const loose = await run(here, ["journey", "--by-page", "--out", out, "--critique", critique]);
    assert.equal(loose.code, 0, loose.out);
    assert.match(loose.out, /Write a note, short: Long\./);
    // No journey in the replay, or two modes at once: refused.
    await writeFile(join(out, "report.json"), JSON.stringify({ ...report, journeys: [] }));
    assert.match((await run(here, ["journey", "--by-page", "--out", out])).out, /is not a replay of aeom journey/);
    const both = await run(here, ["journey", "--by-page", "--plan", "--out", out]);
    assert.equal(both.code, 1);
    assert.match(both.out, /--plan and --by-page are two answers: ask for one/);
  } finally {
    await rm(here, { recursive: true, force: true });
  }
});
