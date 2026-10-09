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

test("without the reports, or with journeys not yet replayed and critiqued, aeom verdict cannot decide and exits 2", async () => {
  const empty = await mkdtemp(join(tmpdir(), "aeom-verdict-"));
  const unjudged = await project({ journeys: { broken: null, failing: [] } });
  try {
    const none = await run(empty, ["verdict"]);
    assert.equal(none.code, 2);
    assert.match(none.out, /Cannot decide: .*check\.json is missing.*Run aeom check and the judge first/s);
    await rm(join(unjudged, ".aeom", "reports", "judge-journeys.json"));
    const partial = await run(unjudged, ["verdict"]);
    assert.equal(partial.code, 2);
    assert.match(partial.out, /judge-journeys\.json is missing/);
  } finally {
    await rm(empty, { recursive: true, force: true });
    await rm(unjudged, { recursive: true, force: true });
  }
});
