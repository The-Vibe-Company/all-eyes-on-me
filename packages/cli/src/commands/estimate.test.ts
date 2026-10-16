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
    assert.match(full.out, /Three directions, for you to choose/, "three by default, the person choosing");
    assert.match((await run(dir, ["estimate", "--autonome"])).out, /Three directions and the knockout/, "with --autonome, the judges choose");
    assert.match((await run(dir, ["estimate", "--directions", "6"])).out, /Six directions, for you to choose/);
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ url: "http://localhost:1", pages: ["/", "/jeu"], public: ["/connexion"], style: "keep" }));
    const kept = await run(dir, ["estimate"]);
    assert.match(kept.out, /^For 3 screens and 4 key journeys:/, "the config's pages, public ones included");
    assert.match(kept.out, /The kit, in the app's own style/);
    assert.match((await run(dir, ["estimate", "--directions", "4"])).out, /Four directions, for you to choose/, "--directions overrides a style kept, as /aeom --directions does");
    assert.match((await run(dir, ["estimate", "--screens", "12", "--journeys", "0"])).out, /^For 12 screens and 0 key journeys:/);
    await writeFile(join(dir, ".aeom", "config.json"), JSON.stringify({ url: "http://localhost:1", pages: ["/", "/jeu"], public: ["/connexion"], widths: [1280] }));
    const desktop = await run(dir, ["estimate", "--juger"]);
    assert.match(desktop.out, /^For 3 screens and 4 key journeys, at 1280 px:/, "the config's widths");
    const dollars = (out: string) => Number(/Total, at most +\d+ agents +≈ \$(\d+(?:\.\d)?)/.exec(out)?.[1]);
    assert.ok(dollars(desktop.out) < dollars((await run(dir, ["estimate", "--juger", "--widths", "390,1280"])).out), "one width costs less than two");
    // Kept for the result page, which shows it next to what aeom cost measured.
    await run(dir, ["estimate", "--juger", "--out", join(dir, "estimate.json")]);
    const saved = JSON.parse((await import("node:fs")).readFileSync(join(dir, "estimate.json"), "utf8"));
    assert.ok(Math.abs(saved.total.dollars - dollars(desktop.out)) < 0.1, "the file holds the estimate printed");
    assert.ok(saved.total.coordinator > 0, "the session that coordinates included");
    assert.match((await run(dir, ["estimate", "--widths", "390"])).out, /^For 3 screens and 4 key journeys, at 390 px:/, "--widths wins over the config");
    const wrong = await run(dir, ["estimate", "--widths", "10"]);
    assert.equal(wrong.code, 1);
    assert.match(wrong.out, /--widths lists the widths to measure/);
    const scratch = await run(dir, ["estimate", "--from-scratch", "--screens", "5", "--journeys", "3"]);
    assert.equal(scratch.code, 0, scratch.out);
    assert.match(scratch.out, /^From scratch, 5 screens and 3 key journeys, at 1280 px:/);
    const replug = await run(dir, ["estimate", "--api", "http://localhost:8000/v1", "--screens", "5"]);
    assert.equal(replug.code, 0, replug.out);
    assert.match(replug.out, /^Plugging the front into its API, 5 screens/);
    const remote = await run(dir, ["estimate", "--from-scratch", "--screens", "5", "--api", "https://api.example.com"]);
    assert.equal(remote.code, 1, "a remote API is refused before anything starts");
    assert.match(remote.out, /--api is an API running on this machine, on its own fake data/);
    const prompt = await run(dir, ["estimate", "--depuis"]);
    assert.equal(prompt.code, 0, prompt.out);
    assert.match(prompt.out, /^From a prompt, two screens for each direction, at 1280 px:/, "at the widths the config declares");
    assert.match(prompt.out, /Total, at most +4 agents/);
    const bad = await run(dir, ["estimate", "--screens", "0"]);
    assert.equal(bad.code, 1);
    assert.match(bad.out, /--screens is a whole number of screens, at least 1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
