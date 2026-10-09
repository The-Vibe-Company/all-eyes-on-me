import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
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

const check = (findings: unknown[] = []) => ({ url: "http://x", checkedAt: "", widths: [390, 1280], checks: ["cursor", "overflow", "contrast", "console"], pages: ["http://x/", "http://x/commandes"], errors: [], findings });
const judge = (failing: Record<string, string[]>, ids = ["hierarchy", "states"]) => ({
  judgedAt: "",
  voters: ["1", "2", "3"],
  principles: ids.map((id) => ({ id, text: id })),
  failures: 0,
  pages: Object.entries(failing).map(([page, failed]) => ({ page, verdicts: ids.map((principle) => ({ principle, pass: !failed.includes(principle), votes: "", reasons: [`${principle} fails on ${page}`], dissent: [], steps: [] })) })),
});
const replay = (broken: { step: number; reason: string } | null) => ({
  url: "http://x",
  replayedAt: "",
  widths: [1280],
  warnings: [],
  journeys: [{ slug: "orders", name: "See my orders", runs: [{ width: 1280, steps: [], calls: [], screens: ["/"], counts: { steps: 3, screens: 1, back: 0 }, broken, sheet: "" }] }],
});

async function project({ findings = [] as unknown[], failing = {} as Record<string, string[]>, journeys = null as null | { broken: { step: number; reason: string } | null; failing: string[] } } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "aeom-verdict-"));
  await mkdir(join(dir, ".aeom", "reports"), { recursive: true });
  await writeFile(join(dir, ".aeom", "reports", "check.json"), JSON.stringify(check(findings)));
  await writeFile(join(dir, ".aeom", "reports", "judge.json"), JSON.stringify(judge({ "/": [], "/commandes": [], ...failing })));
  if (journeys) {
    await mkdir(join(dir, ".aeom", "journeys"), { recursive: true });
    await writeFile(join(dir, ".aeom", "journeys", "orders.json"), "{}");
    await mkdir(join(dir, ".aeom", "captures", "journeys"), { recursive: true });
    await writeFile(join(dir, ".aeom", "captures", "journeys", "report.json"), JSON.stringify(replay(journeys.broken)));
    await writeFile(join(dir, ".aeom", "reports", "judge-journeys.json"), JSON.stringify(judge({ orders: journeys.failing }, ["short"])));
  }
  return dir;
}

test("aeom verdict says « nothing to redo » with what it measured, and exits 0", async () => {
  const dir = await project({ journeys: { broken: null, failing: [] } });
  try {
    const { code, out } = await run(dir, ["verdict"]);
    assert.equal(code, 0, out);
    assert.match(out, /Measured: 2 screens at 390, 1280 px, 4 checks and 2 principles each; 1 journey on 1 principle\./);
    assert.match(out, /Nothing to redo: nothing fails\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom verdict lists what fails, screen by screen and journey by journey, and exits 1", async () => {
  const dir = await project({ findings: [{ check: "contrast", url: "http://x/commandes", width: 390, message: "text below AA" }], failing: { "/": ["states"] }, journeys: { broken: { step: 2, reason: "the page answered 500" }, failing: ["short"] } });
  try {
    const { code, out } = await run(dir, ["verdict"]);
    assert.equal(code, 1);
    assert.match(out, /✗ \/commandes\s+contrast: text below AA/);
    assert.match(out, /✗ \/\s+states: states fails on \//);
    assert.match(out, /✗ See my orders\s+breaks at step 2 at 1280 px: the page answered 500/);
    assert.match(out, /✗ See my orders\s+short: short fails on orders/);
    assert.match(out, /4 things to redo\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("without the reports, or with journeys not yet replayed or not yet critiqued, aeom verdict cannot decide and exits 2", async () => {
  const empty = await mkdtemp(join(tmpdir(), "aeom-verdict-"));
  const unreplayed = await project({ journeys: { broken: null, failing: [] } });
  const uncritiqued = await project({ journeys: { broken: null, failing: [] } });
  try {
    const none = await run(empty, ["verdict"]);
    assert.equal(none.code, 2);
    assert.match(none.out, /Cannot decide: .*check\.json is missing.*Run aeom check and the judge first/s);
    await rm(join(unreplayed, ".aeom", "captures", "journeys", "report.json"));
    const notReplayed = await run(unreplayed, ["verdict"]);
    assert.equal(notReplayed.code, 2);
    assert.match(notReplayed.out, /report\.json is missing.*then aeom journey and the journey judge/s);
    await rm(join(uncritiqued, ".aeom", "reports", "judge-journeys.json"));
    const notCritiqued = await run(uncritiqued, ["verdict"]);
    assert.equal(notCritiqued.code, 2);
    assert.match(notCritiqued.out, /judge-journeys\.json is missing/);
  } finally {
    await rm(empty, { recursive: true, force: true });
    await rm(unreplayed, { recursive: true, force: true });
    await rm(uncritiqued, { recursive: true, force: true });
  }
});

test("a screen judged but not checked, or a journey recorded but not replayed, stops the verdict with exit 2", async () => {
  const dir = await project({ failing: { "/contact": [] }, journeys: { broken: null, failing: [] } });
  try {
    await writeFile(join(dir, ".aeom", "journeys", "help.json"), "{}");
    const { code, out } = await run(dir, ["verdict"]);
    assert.equal(code, 2);
    assert.match(out, /Cannot decide: \/contact was judged but not checked, the journey help was not replayed\./);
    assert.doesNotMatch(out, /Nothing to redo/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a page that does not load is something to redo, and exits 1", async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, ".aeom", "reports", "check.json"), JSON.stringify({ ...check(), errors: [{ url: "http://x/aide", status: 500, reason: "500 Internal Server Error" }] }));
    const { code, out } = await run(dir, ["verdict"]);
    assert.equal(code, 1);
    assert.match(out, /✗ \/aide\s+does not load: 500 Internal Server Error/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a report that is not the right one, or an unknown option, never reads as something to redo: exit 2", async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, ".aeom", "reports", "check.json"), "{}");
    const wrong = await run(dir, ["verdict"]);
    assert.equal(wrong.code, 2);
    assert.match(wrong.out, /check\.json is not a report of aeom check/);
    await writeFile(join(dir, ".aeom", "reports", "check.json"), "null");
    assert.equal((await run(dir, ["verdict"])).code, 2);
    const unknown = await run(dir, ["verdict", "--foo"]);
    assert.equal(unknown.code, 2);
    assert.match(unknown.out, /Cannot decide: .*--foo/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("when something fails, aeom verdict says what comes next: a new direction, or the existing style kept", async () => {
  const dir = await project({ failing: { "/": ["states"] } });
  try {
    const fresh = await run(dir, ["verdict"]);
    assert.equal(fresh.code, 1);
    assert.match(fresh.out, /Next: six new art directions, drawn from the product sheet\.$/m);
    assert.match((await run(dir, ["verdict", "--keep-style"])).out, /Next: the kit wave fixes the existing style, without a new direction \(--keep-style\)\.$/m);
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ style: "keep" }));
    assert.match((await run(dir, ["verdict"])).out, /Next: the kit wave fixes the existing style, without a new direction \("style": "keep" in \.aeom\/config\.json\)\.$/m);
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ style: "garder" }));
    const broken = await run(dir, ["verdict"]);
    assert.equal(broken.code, 2);
    assert.match(broken.out, /"style" is "keep"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
