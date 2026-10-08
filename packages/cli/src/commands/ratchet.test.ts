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
