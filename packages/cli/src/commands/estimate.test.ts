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

test("aeom estimate says what a run costs, phase by phase, from the screens and journeys the project has", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-estimate-"));
  try {
    const none = await run(dir, ["estimate"]);
    assert.equal(none.code, 1);
    assert.match(none.out, /How many screens\? Give --screens, list them in "pages" in \.aeom\/config\.json, or run aeom capture first\./);
    await mkdir(join(dir, ".aeom", "captures"), { recursive: true });
    await writeFile(join(dir, ".aeom", "captures", "manifest.json"), JSON.stringify({ pages: [{}, {}, {}, {}, {}, {}, {}, {}] }));
    await mkdir(join(dir, ".aeom", "journeys"));
    for (const j of ["a", "b", "c", "d"]) await writeFile(join(dir, ".aeom", "journeys", `${j}.json`), "{}");
    const judge = await run(dir, ["estimate", "--juger"]);
    assert.equal(judge.code, 0, judge.out);
    assert.match(judge.out, /^For 8 screens and 4 key journeys:/);
    assert.match(judge.out, /Total, at most +6 agents/);
    assert.match((await run(dir, ["estimate", "--diagnostic"])).out, /Total, at most +6 agents/);
    assert.match((await run(dir, ["estimate", "--ux"])).out, /Judge the journeys/);
    const full = await run(dir, ["estimate"]);
    assert.match(full.out, /Six directions and the knockout/);
    assert.match((await run(dir, ["estimate", "--directions", "3"])).out, /Three directions and the knockout/);
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ url: "http://localhost:1", pages: ["/", "/jeu"], public: ["/connexion"], style: "keep" }));
    const kept = await run(dir, ["estimate"]);
    assert.match(kept.out, /^For 3 screens and 4 key journeys:/, "the config's pages, public ones included");
    assert.match(kept.out, /The kit, in the app's own style/);
    assert.match((await run(dir, ["estimate", "--directions", "4"])).out, /Four directions and the knockout/, "--directions overrides a style kept, as /aeom --directions does");
    assert.match((await run(dir, ["estimate", "--screens", "12", "--journeys", "0"])).out, /^For 12 screens and 0 key journeys:/);
    const bad = await run(dir, ["estimate", "--screens", "0"]);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /--screens is a whole number of screens, at least 1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
