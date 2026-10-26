import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
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
/** A reason that names what the voter sees, its own for each page and principle, as a careful vote gives. */
const seen = (voter: string, page: string, id: string) => `On ${page}, voter ${voter} sees the « Commandes » table for ${id}.`;

async function setup(voters: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "aeom-judge-cli-"));
  await mkdir(join(dir, "captures"));
  await mkdir(join(dir, "votes"));
  await writeFile(join(dir, "principles.md"), PRINCIPLES.map((id) => `- \`${id}\` — ${id} holds.`).join("\n") + "\n");
  await writeFile(join(dir, "captures", "manifest.json"), JSON.stringify({ url: "x", capturedAt: "", widths: [390], pages: [{ url: "http://x/", path: "/", files: [] }], errors: [] }));
  for (const voter of voters) {
    const verdicts = Object.fromEntries(PRINCIPLES.map((id) => [id, { pass: true, reason: seen(voter, "/", id) }]));
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
    const verdicts = (failing: Record<string, number>) => Object.fromEntries(JOURNEY_PRINCIPLES.map((id) => [id, failing[id] ? { pass: false, reason: `The list under "Mes commandes" is blank for ${id} (voter ${voter}).`, step: failing[id] } : { pass: true, reason: seen(voter, "the first step", id), step: 1 }]));
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
    assert.match(out, /See my orders\n\s+✗ result-shown\s+step 2, 3: The list under "Mes commandes" is blank for result-shown \(voter 1\)\. \(2\/3 fail\)/);
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

test("a journey that breaks differently at two widths is reported once per way it broke", async () => {
  const dir = await journeys();
  try {
    const report = JSON.parse(await readFile(join(dir, "captures", "report.json"), "utf8"));
    const narrow = report.journeys[1].runs[0];
    narrow.broken = { step: 1, reason: "the menu covers the link" };
    narrow.steps = narrow.steps.slice(0, 1);
    await writeFile(join(dir, "captures", "report.json"), JSON.stringify(report));
    const { out } = await run(["judge", "--journeys", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out")]);
    assert.match(out, /✗ Get help\s+breaks at step 1 at 390 px: the menu covers the link\n\s+\S*get-help@390-01\.png/);
    assert.match(out, /✗ Get help\s+breaks at step 2 at 1280 px: the page answered 500\n\s+\S*get-help@1280-02\.png/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge --style-kept counts the votes on whether each page kept the charter", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-judge-style-"));
  try {
    await mkdir(join(dir, "captures"));
    await mkdir(join(dir, "votes"));
    await writeFile(join(dir, "captures", "manifest.json"), JSON.stringify({ url: "x", capturedAt: "", widths: [1280], pages: [{ url: "http://x/", path: "/", files: [] }, { url: "http://x/contact", path: "/contact", files: [] }], errors: [] }));
    for (const voter of ["1", "2", "3"]) {
      const pages = { "/": { "charter-kept": { pass: true, reason: "Same gradient, font and logo; only the pink is darker." } }, "/contact": { "charter-kept": { pass: voter === "3", reason: "The buttons turned green." } } };
      await writeFile(join(dir, "votes", `${voter}.json`), JSON.stringify({ voter, pages }));
    }
    const principles = await run(["principles", "--style-kept"]);
    assert.match(principles.out, /^charter-kept\s+/m);
    const { code, out } = await run(["judge", "--style-kept", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out")]);
    assert.equal(code, 1);
    assert.match(out, /\/contact\n\s+✗ charter-kept\s+The buttons turned green\. \(2\/3 fail\)/);
    assert.doesNotMatch(out, /^\/\n/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** Captures of two pages, and the votes of one voter: `failing` names what it fails. */
async function stagedSetup(failing: Record<string, string[]> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "aeom-judge-staged-"));
  await mkdir(join(dir, "captures"));
  await mkdir(join(dir, "votes"));
  await writeFile(join(dir, "principles.md"), PRINCIPLES.map((id) => `- \`${id}\` — ${id} holds.`).join("\n") + "\n");
  await writeFile(join(dir, "captures", "a@390.png"), "page a");
  await writeFile(join(dir, "captures", "b@390.png"), "page b");
  const page = (path: string, file: string) => ({ url: `http://x${path}`, path, files: [{ width: 390, file }] });
  await writeFile(join(dir, "captures", "manifest.json"), JSON.stringify({ url: "x", capturedAt: "", widths: [390], pages: [page("/", "a@390.png"), page("/b", "b@390.png")], errors: [] }));
  const verdicts = (path: string, voter: string, only?: string[]) =>
    Object.fromEntries(PRINCIPLES.filter((id) => !only || only.includes(id)).map((id) => [id, { pass: !(failing[path] ?? []).includes(id) || voter === "3", reason: seen(voter, path, id) }]));
  const write = (voter: string, pages: Record<string, unknown>) => writeFile(join(dir, "votes", `${voter}.json`), JSON.stringify({ voter, pages }));
  await write("1", { "/": verdicts("/", "1"), "/b": verdicts("/b", "1") });
  const args = (...more: string[]) => ["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out"), "--principles", join(dir, "principles.md"), ...more];
  return { dir, args, write, verdicts };
}

test("aeom judge --to-confirm sends only what the first voter failed to two more voters, then counts", async () => {
  const { dir, args, write, verdicts } = await stagedSetup({ "/b": ["states", "grid"] });
  try {
    const listed = await run(args("--to-confirm"));
    assert.equal(listed.code, 0, listed.out);
    assert.match(listed.out, /2 verdicts to confirm, on 1 page: \/b \(grid, states\)\. Launch voters 2 and 3 on them/);
    assert.deepEqual(JSON.parse(await readFile(join(dir, "votes", "to-confirm.json"), "utf8")), { "/b": ["grid", "states"] });
    const early = await run(args());
    assert.match(early.out, /Missing votes from voter 2, 3/);
    for (const voter of ["2", "3"]) await write(voter, { "/b": verdicts("/b", voter, ["states", "grid"]) });
    const { code, out } = await run(args());
    assert.equal(code, 1, out);
    assert.match(out, /states .* \(2\/3 fail\)/);
    assert.match(out, /1 vote each, 3 on the 2 verdicts the first one failed/);
    const report = JSON.parse(await readFile(join(dir, "out", "judge.json"), "utf8"));
    assert.equal(report.pages.find((p: { page: string }) => p.page === "/").verdicts[0].votes, "1/1 pass");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a first vote that fails nothing is the verdict on its own", async () => {
  const { dir, args } = await stagedSetup();
  try {
    assert.match((await run(args("--to-confirm"))).out, /Nothing to confirm: the first vote is the verdict\. Count it with aeom judge\./);
    const { code, out } = await run(args());
    assert.equal(code, 0, out);
    assert.match(out, /1 vote each/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge --changed-since judges again only the pages whose captures changed, and keeps the others' verdicts", async () => {
  const { dir, args, write, verdicts } = await stagedSetup();
  const before = join(dir, "before");
  try {
    // The last measure: both pages, as they were, with a verdict that fails /b on grid.
    await mkdir(join(before, "captures"), { recursive: true });
    await mkdir(join(before, "reports"), { recursive: true });
    await writeFile(join(before, "captures", "a@390.png"), "page a");
    await writeFile(join(before, "captures", "b@390.png"), "page b, before");
    await writeFile(join(before, "captures", "manifest.json"), await readFile(join(dir, "captures", "manifest.json"), "utf8"));
    const old = (page: string, failing: string[]) => ({ page, verdicts: PRINCIPLES.map((principle) => ({ principle, pass: !failing.includes(principle), votes: "3/3", reasons: ["before"], dissent: [], steps: [] })) });
    await writeFile(join(before, "reports", "judge.json"), JSON.stringify({ judgedAt: "", voters: ["1", "2", "3"], principles: [], pages: [old("/", ["density"]), old("/b", ["grid"])], failures: 2 }));
    await rm(join(dir, "votes", "1.json"));
    // Two steps, never one call: the pages that changed first, what voter 1 failed after it voted.
    const both = await run(args("--changed-since", before, "--to-confirm"));
    assert.equal(both.code, 1, both.out);
    assert.match(both.out, /--changed-since and --to-confirm are two steps of one judging: run --changed-since before the first voter, then --to-confirm alone once it voted/);
    const changed = await run(args("--changed-since", before));
    assert.equal(changed.code, 0, changed.out);
    assert.match(changed.out, /1 page changed since .*before: \/b\. 1 page keeps its verdict: \//);
    await write("1", { "/b": verdicts("/b", "1") });
    assert.match((await run(args("--to-confirm"))).out, /Nothing to confirm/);
    const { out } = await run(args());
    assert.match(out, /density .*before/, "the unchanged page keeps its verdict");
    const report = JSON.parse(await readFile(join(dir, "out", "judge.json"), "utf8"));
    assert.deepEqual(report.reused, ["/"]);
    assert.equal(report.failures, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a first vote that changed since --to-confirm is refused, never counted on one vote", async () => {
  const { dir, args, write, verdicts } = await stagedSetup({ "/b": ["states"] });
  try {
    await run(args("--to-confirm"));
    for (const voter of ["2", "3"]) await write(voter, { "/b": verdicts("/b", voter, ["states"]) });
    // Voter 1 relaunched, and now fails more than it did.
    const failing = { "/b": ["states", "grid"] };
    const again = Object.fromEntries(PRINCIPLES.map((id) => [id, { pass: !failing["/b"].includes(id), reason: seen("1", "/b", id) }]));
    await write("1", { "/": verdicts("/", "1"), "/b": again });
    const { code, out } = await run(args());
    assert.equal(code, 1);
    assert.match(out, /Voter 1's vote no longer fails what .*to-confirm\.json lists: run aeom judge --to-confirm again/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pages that should keep a verdict the snapshot no longer holds are refused, not dropped", async () => {
  const { dir, args } = await stagedSetup();
  const before = join(dir, "before");
  try {
    await mkdir(join(before, "captures"), { recursive: true });
    await mkdir(join(before, "reports"), { recursive: true });
    for (const f of ["a@390.png", "b@390.png", "manifest.json"]) await writeFile(join(before, "captures", f), await readFile(join(dir, "captures", f)));
    const old = (page: string) => ({ page, verdicts: PRINCIPLES.map((principle) => ({ principle, pass: true, votes: "3/3", reasons: ["before"], dissent: [], steps: [] })) });
    await writeFile(join(before, "reports", "judge.json"), JSON.stringify({ judgedAt: "", voters: ["1", "2", "3"], principles: [], pages: [old("/"), old("/b")], failures: 0 }));
    assert.match((await run(args("--changed-since", before))).out, /No page changed/);
    assert.equal(JSON.parse(await readFile(join(dir, "votes", "to-judge.json"), "utf8")).since, before, "kept by its full path");
    await rm(join(before, "reports", "judge.json"));
    const { code, out } = await run(args());
    assert.equal(code, 1);
    assert.match(out, /\/, \/b should keep the verdict of .*before, which does not hold it any more/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge counts what the product sheet accepts as accepted, said apart, and keeps which model judged on which principles", async () => {
  const dir = await setup([]);
  try {
    const fails = (voter: string) => Object.fromEntries(PRINCIPLES.map((id) => [id, { pass: id !== "not-generic", reason: id === "not-generic" ? `Voter ${voter}: a deep violet background on every block.` : seen(voter, "/", id) }]));
    for (const voter of ["1", "2", "3"]) await writeFile(join(dir, "votes", `${voter}.json`), JSON.stringify({ voter, model: "claude-sonnet-5-5", pages: { "/": fails(voter) } }));
    await writeFile(join(dir, "product.md"), "# Radar\n\n## Accepted exceptions\n- `not-generic` on every page: the deep violet is the brand's, chosen. (seen: Victor)\n");
    const args = ["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out"), "--principles", join(dir, "principles.md")];
    const { code, out } = await run([...args, "--product", join(dir, "product.md")]);
    assert.equal(code, 0, out);
    assert.match(out, /Accepted, as the product sheet says:\n  \/  not-generic: the deep violet is the brand's, chosen\. \(seen: Victor\)/);
    const report = JSON.parse(await readFile(join(dir, "out", "judge.json"), "utf8"));
    assert.deepEqual(report.pages[0].verdicts.find((v: { principle: string }) => v.principle === "not-generic").accepted, { why: "the deep violet is the brand's, chosen.", source: "Victor" });
    assert.deepEqual(report.judges.models, ["claude-sonnet-5-5"]);
    assert.match(report.judges.principles, /^principles\.md [0-9a-f]{8}/);
    assert.match(out, /Judged by claude-sonnet-5-5, on principles\.md [0-9a-f]{8}/);
    // A sheet given that is not there is said: a worker pointed at the wrong one would fix what the run accepts.
    const lost = await run([...args, "--product", join(dir, "nowhere.md")]);
    assert.equal(lost.code, 2);
    assert.match(lost.out, /--product .*nowhere\.md is not there/);
    // Without the sheet, the same votes fail.
    assert.equal((await run(args)).code, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("aeom judge refuses a vote too thin to count, names its voter and why, and counts nothing", async () => {
  const dir = await setup(["1", "2", "3"]);
  try {
    const thin = Object.fromEntries(PRINCIPLES.map((id) => [id, { pass: true, reason: "Fine." }]));
    await writeFile(join(dir, "votes", "2.json"), JSON.stringify({ voter: "2", pages: { "/": thin } }));
    const { code, out } = await run(["judge", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--out", join(dir, "out"), "--principles", join(dir, "principles.md")]);
    assert.equal(code, 1);
    assert.match(out, /Votes too thin to count, refused:\n  voter 2: gives the same reason to 7 of 7 verdicts: "Fine\."/);
    assert.match(out, /Relaunch only those voters, with the same brief/);
    assert.ok(!existsSync(join(dir, "out", "judge.json")), "nothing is counted");
    // Voter 1's vote is refused before two more voters are launched on it.
    await writeFile(join(dir, "votes", "1.json"), JSON.stringify({ voter: "1", pages: { "/": thin } }));
    const early = await run(["judge", "--to-confirm", "--captures", join(dir, "captures"), "--votes", join(dir, "votes"), "--principles", join(dir, "principles.md")]);
    assert.equal(early.code, 1);
    assert.match(early.out, /Voter 1's vote is too thin to count, refused: gives the same reason to 7 of 7 verdicts/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
