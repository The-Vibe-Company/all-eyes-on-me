import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};

const replay = (steps: Record<string, number>) => ({
  url: "http://x",
  replayedAt: "",
  widths: [1280],
  warnings: [],
  journeys: Object.entries(steps).map(([slug, n]) => ({ slug, name: slug === "orders" ? "See my orders" : "Contact the shop", runs: [{ width: 1280, steps: [], calls: [], screens: [], counts: { steps: n, screens: 1, back: 0 }, broken: null, sheet: "" }] })),
});
const verdict = (failing: Record<string, string[]>) => ({
  judgedAt: "",
  voters: ["1", "2", "3"],
  principles: [],
  failures: 0,
  pages: Object.entries(failing).map(([page, ids]) => ({ page, verdicts: ["clear-start", "short", "same-words"].map((principle) => ({ principle, pass: !ids.includes(principle), votes: "", reasons: [], dissent: [], steps: [] })) })),
});

test("aeom compare --journeys keeps the journeys the judges prefer, sends the others back, and says why", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-ratchet-"));
  try {
    for (const [name, steps, failing] of [["before", { orders: 4, contact: 5 }, { orders: ["clear-start", "short"], contact: ["same-words"] }], ["after", { orders: 3, contact: 5 }, { orders: [], contact: ["same-words"] }]] as const) {
      await mkdir(join(dir, name, "duels"), { recursive: true });
      await writeFile(join(dir, name, "report.json"), JSON.stringify(replay(steps)));
      await writeFile(join(dir, name, "judge-journeys.json"), JSON.stringify(verdict(failing as unknown as Record<string, string[]>)));
    }
    for (const voter of ["1", "2", "3"]) {
      await writeFile(join(dir, "after", "duels", `${voter}.json`), JSON.stringify({ voter, journeys: { orders: { winner: "after", reason: "Mes commandes is in the menu now." }, contact: { winner: voter === "1" ? "after" : "before", reason: "The old page said less but read better." } } }));
    }
    const { code, out } = await run(dir, ["compare", "--journeys", "before", "after"]);
    assert.equal(code, 0, out);
    assert.match(out, /✓ See my orders\s+kept\s+4 → 3 steps\s+3\/3 prefer the new one: Mes commandes is in the menu now\./);
    assert.match(out, /cleared: clear-start, short; still failing: nothing/);
    assert.match(out, /✗ Contact the shop\s+back\s+5 → 5 steps\s+the judges prefer the old one \(2\/3 prefer the old one\)/);
    assert.match(out, /1 kept, 1 back\. Revert the merges/);
    assert.match(await readFile(join(dir, "after", "ratchet.json"), "utf8"), /"kept": false/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function ratchetDir() {
  const dir = await mkdtemp(join(tmpdir(), "aeom-ratchet-"));
  for (const [name, steps, failing] of [["before", { orders: 4, contact: 5 }, { orders: ["clear-start"], contact: [] }], ["after", { orders: 3, contact: 5 }, { orders: [], contact: [] }]] as const) {
    await mkdir(join(dir, name, "duels"), { recursive: true });
    await writeFile(join(dir, name, "report.json"), JSON.stringify(replay(steps)));
    await writeFile(join(dir, name, "judge-journeys.json"), JSON.stringify(verdict(failing as unknown as Record<string, string[]>)));
  }
  for (const voter of ["1", "2", "3"]) {
    await writeFile(join(dir, "after", "duels", `${voter}.json`), JSON.stringify({ voter, journeys: { orders: { winner: "after", reason: "Shorter." }, contact: { winner: "after", reason: "Clearer." } } }));
  }
  return dir;
}

test("aeom compare --journeys refuses no judges, a base git does not know, and a critique that leaves a journey out", async () => {
  const dir = await ratchetDir();
  try {
    const none = await run(dir, ["compare", "--journeys", "before", "after", "--voters", "0"]);
    assert.equal(none.code, 1);
    assert.match(none.out, /--voters must be a whole number of judges, 1 or more/);
    const base = await run(dir, ["compare", "--journeys", "before", "after", "--base", "no-such-ref"]);
    assert.equal(base.code, 1);
    assert.match(base.out, /Cannot list the files changed since no-such-ref/);
    assert.doesNotMatch(base.out, /\n\s+at /, "an error message, not a stack trace");
    await writeFile(join(dir, "after", "judge-journeys.json"), JSON.stringify(verdict({ contact: [] })));
    const partial = await run(dir, ["compare", "--journeys", "before", "after"]);
    assert.equal(partial.code, 1);
    assert.match(partial.out, /after\/judge-journeys\.json does not judge orders/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a duel vote file that is not a vote is refused, not counted", async () => {
  const dir = await ratchetDir();
  try {
    await writeFile(join(dir, "after", "duels", "3.json"), "null");
    const { code, out } = await run(dir, ["compare", "--journeys", "before", "after"]);
    assert.equal(code, 1);
    assert.match(out, /3\.json: not a vote/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a call the new path makes is known when a replay of the new files on the old app made it too", async () => {
  const dir = await ratchetDir();
  try {
    const after = replay({ orders: 3, contact: 5 });
    after.journeys[0]!.runs[0]!.calls = [{ method: "GET", path: "/api/orders", query: [], fields: [] }] as never;
    await writeFile(join(dir, "after", "report.json"), JSON.stringify(after));
    const refused = await run(dir, ["compare", "--journeys", "before", "after"]);
    assert.match(refused.out, /✗ See my orders\s+back\s+.*the guard refuses GET \/api\/orders/);
    await mkdir(join(dir, "known"));
    await writeFile(join(dir, "known", "report.json"), JSON.stringify(after));
    const known = await run(dir, ["compare", "--journeys", "before", "after", "--known", "known"]);
    assert.equal(known.code, 0, known.out);
    assert.match(known.out, /✓ See my orders\s+kept/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
