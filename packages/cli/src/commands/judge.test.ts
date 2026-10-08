import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const AEOM = fileURLToPath(new URL("../index.js", import.meta.url));
const run = async (args: string[]) => {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", [AEOM, ...args]);
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
};

const PRINCIPLES = ["one-direction", "consistent-chrome", "not-generic", "hierarchy", "grid", "density", "states"];

async function setup(voters: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "aeom-judge-cli-"));
  await mkdir(join(dir, "captures"));
  await mkdir(join(dir, "votes"));
  await writeFile(join(dir, "principles.md"), PRINCIPLES.map((id) => `- \`${id}\` — ${id} holds.`).join("\n") + "\n");
  await writeFile(join(dir, "captures", "manifest.json"), JSON.stringify({ url: "x", capturedAt: "", widths: [390], pages: [{ url: "http://x/", path: "/", files: [] }], errors: [] }));
  for (const voter of voters) {
    const verdicts = Object.fromEntries(PRINCIPLES.map((id) => [id, { pass: true, reason: "fine" }]));
    await writeFile(join(dir, "votes", `${voter}.json`), JSON.stringify({ voter, pages: { "/": verdicts } }));
  }
  return dir;
}

test("aeom judge names the voters whose vote is missing", async () => {
  const dir = await setup(["1"]);
  try {
    const { code, out } = await run(["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out"), "--principles", join(dir, "principles.md")]);
    assert.equal(code, 1);
    assert.match(out, /Missing votes from voter 2, 3/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge refuses a voter numbered out of range, even when the count is right", async () => {
  const dir = await setup(["1", "2", "4"]);
  try {
    const { code, out } = await run(["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out"), "--principles", join(dir, "principles.md")]);
    assert.equal(code, 1);
    assert.match(out, /Missing votes from voter 3/);
    assert.match(out, /Unexpected voter 4/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge refuses to write its verdict into the votes folder", async () => {
  const dir = await setup(["1", "2", "3"]);
  try {
    const { code, out } = await run(["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "votes"), "--principles", join(dir, "principles.md")]);
    assert.equal(code, 1);
    assert.match(out, /cannot be the same folder/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge passes a page all three voters pass", async () => {
  const dir = await setup(["1", "2", "3"]);
  try {
    const { code, out } = await run(["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out"), "--principles", join(dir, "principles.md")]);
    assert.equal(code, 0, out);
    assert.match(out, /All 7 principles pass on 1 page/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const JOURNEY_PRINCIPLES = ["clear-start", "next-step", "result-shown", "no-dead-end", "short", "same-words"];

async function journeys() {
  const dir = await mkdtemp(join(tmpdir(), "aeom-judge-journeys-"));
  await mkdir(join(dir, "captures"));
  await mkdir(join(dir, "votes"));
  const step = (slug: string, width: number, index: number, path: string) => ({ index, action: index === 1 ? "open /" : "click", path, capture: `${slug}@${width}-0${index}.png` });
  const run = (slug: string, width: number, steps: number, broken: { step: number; reason: string } | null) => ({
    width,
    steps: Array.from({ length: steps }, (_, i) => step(slug, width, i + 1, i ? "/x" : "/")),
    screens: ["/"],
    counts: { steps, screens: 1, back: 0 },
    broken,
    sheet: `${slug}@${width}.png`,
  });
  const report = {
    url: "http://x",
    replayedAt: "",
    widths: [390, 1280],
    warnings: [],
    journeys: [
      { slug: "see-my-orders", name: "See my orders", runs: [run("see-my-orders", 390, 3, null), run("see-my-orders", 1280, 3, null)] },
      { slug: "get-help", name: "Get help", runs: [run("get-help", 390, 2, { step: 2, reason: "the page answered 500" }), run("get-help", 1280, 2, { step: 2, reason: "the page answered 500" })] },
    ],
  };
  await writeFile(join(dir, "captures", "report.json"), JSON.stringify(report));
  for (const voter of ["1", "2", "3"]) {
    const verdicts = (failing: Record<string, number>) => Object.fromEntries(JOURNEY_PRINCIPLES.map((id) => [id, failing[id] ? { pass: false, reason: `The list under "Mes commandes" is blank (voter ${voter}).`, step: failing[id] } : { pass: true, reason: "fine", step: 1 }]));
    await writeFile(join(dir, "votes", `${voter}.json`), JSON.stringify({ voter, pages: { "see-my-orders": verdicts(voter === "3" ? {} : { "result-shown": voter === "1" ? 3 : 2 }), "get-help": verdicts({}) } }));
  }
  return dir;
}

test("aeom judge --journeys counts the votes per journey, and names the step and its capture for each failure", async () => {
  const dir = await journeys();
  try {
    const { code, out } = await run(["judge", "--journeys", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out")]);
    assert.equal(code, 1);
    assert.match(out, /Judged 2 journeys on 6 principles, 3 votes each/);
    assert.match(out, /See my orders\n\s+✗ result-shown\s+step 2, 3: The list under "Mes commandes" is blank \(voter 1\)\. \(2\/3 fail\)/);
    assert.match(out, /see-my-orders@1280-02\.png\n\s+\S*see-my-orders@1280-03\.png/, "a capture for each step the failure names");
    assert.match(await readFile(join(dir, "out", "judge-journeys.json"), "utf8"), /"steps": \[\s*2,\s*3\s*\]/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a journey that broke on replay is a failure of its own, whatever the votes say", async () => {
  const dir = await journeys();
  try {
    const { out } = await run(["judge", "--journeys", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out")]);
    assert.match(out, /✗ Get help\s+breaks at step 2 at 390, 1280 px: the page answered 500/);
    assert.match(out, /get-help@1280-02\.png/);
    const report = JSON.parse(await readFile(join(dir, "out", "judge-journeys.json"), "utf8"));
    assert.equal(report.failures, 2, "one principle failed, one journey broke");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom principles --journeys prints the journey principles", async () => {
  const { code, out } = await run(["principles", "--journeys"]);
  assert.equal(code, 0);
  for (const id of JOURNEY_PRINCIPLES) assert.match(out, new RegExp(`^${id}  `, "m"));
});

test("a journey vote that fails without naming its step is refused", async () => {
  const dir = await journeys();
  try {
    const vote = JSON.parse(await readFile(join(dir, "votes", "1.json"), "utf8"));
    delete vote.pages["see-my-orders"]["result-shown"].step;
    await writeFile(join(dir, "votes", "1.json"), JSON.stringify(vote));
    const { code, out } = await run(["judge", "--journeys", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out")]);
    assert.equal(code, 1);
    assert.match(out, /voter 1, see-my-orders: no step for result-shown, where the failure shows/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
