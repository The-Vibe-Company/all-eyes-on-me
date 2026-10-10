import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_PRINCIPLES_FILE, JOURNEY_PRINCIPLES_FILE, JudgeVoteError, loadPrinciples, readVotes, tally, toConfirm, type Vote } from "./index.js";

const refuses = (fn: () => unknown, pattern: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof JudgeVoteError && pattern.test(error.message));

const principles = [
  { id: "hierarchy", text: "One focal point." },
  { id: "states", text: "Empty states say something." },
];
const pages = ["/", "/commandes"];
const vote = (voter: string, failing: Record<string, string[]> = {}): Vote => ({
  voter,
  pages: Object.fromEntries(
    pages.map((page) => [
      page,
      Object.fromEntries(principles.map((p) => [p.id, { pass: !(failing[page] ?? []).includes(p.id), reason: `${voter} on ${p.id}` }])),
    ]),
  ),
});

test("the base principles file is plain text with an id per principle", async () => {
  const loaded = await loadPrinciples(DEFAULT_PRINCIPLES_FILE);
  assert.ok(loaded.length >= 7);
  assert.ok(loaded.some((p) => p.id === "consistent-chrome"));
  assert.ok(loaded.some((p) => p.id === "states"));
  assert.ok(!loaded.some((p) => p.id === "pointer"), "the cursor is measured by aeom check, not judged");
  assert.ok(loaded.every((p) => /^[a-z-]+$/.test(p.id) && p.text.length > 10));
});

test("a principle fails a page when most votes fail it", () => {
  const report = tally([vote("1", { "/commandes": ["states"] }), vote("2", { "/commandes": ["states"] }), vote("3")], pages, principles);
  const states = report.pages.find((p) => p.page === "/commandes")!.verdicts.find((v) => v.principle === "states")!;
  assert.equal(states.pass, false);
  assert.equal(states.votes, "2/3 fail");
  assert.deepEqual(states.reasons, ["1 on states", "2 on states"], "the reasons given by the majority");
  assert.deepEqual(states.dissent, ["3 on states"], "the minority's reason is kept too");
  assert.equal(report.failures, 1);
});

test("one dissenting vote does not fail a page", () => {
  const report = tally([vote("1", { "/": ["hierarchy"] }), vote("2"), vote("3")], pages, principles);
  assert.equal(report.failures, 0);
  const hierarchy = report.pages.find((p) => p.page === "/")!.verdicts.find((v) => v.principle === "hierarchy")!;
  assert.deepEqual(hierarchy.reasons, ["2 on hierarchy", "3 on hierarchy"]);
  assert.deepEqual(hierarchy.dissent, ["1 on hierarchy"]);
});

test("a tie fails, so a split judge never lets a page through", () => {
  const report = tally([vote("1", { "/": ["hierarchy"] }), vote("2")], pages, principles, { voters: 2 });
  assert.equal(report.failures, 1);
});

test("a vote that skips a page or a principle, or invents one, is refused with every problem listed", () => {
  const broken: Vote = { voter: "2", pages: { "/": { hierarchy: { pass: true, reason: "" }, invented: { pass: false, reason: "" } } } };
  assert.throws(
    () => tally([vote("1"), broken], pages, principles, { voters: 2 }),
    (error: unknown) =>
      error instanceof JudgeVoteError &&
      /voter 2: no verdict for \/commandes/.test(error.message) &&
      /voter 2, \/: no verdict for states/.test(error.message) &&
      /voter 2, \/: unknown principle invented/.test(error.message),
  );
});

test("votes are read from every json file of the votes folder", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-votes-"));
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "1.json"), JSON.stringify(vote("1")));
    await writeFile(join(dir, "2.json"), JSON.stringify(vote("2")));
    await writeFile(join(dir, "notes.txt"), "ignored");
    const votes = await readVotes(dir);
    assert.deepEqual(votes.map((v) => v.voter).sort(), ["1", "2"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("anything but exactly three votes is refused", () => {
  refuses(() => tally([vote("1"), vote("2")], pages, principles), /expected 3 votes, found 2/);
});

test("a verdict without a reason is refused", () => {
  const silent = vote("3");
  silent.pages["/"]!["states"]!.reason = " ";
  refuses(() => tally([vote("1"), vote("2"), silent], pages, principles), /voter 3, \/: no reason for states/);
});

test("judging zero pages is refused", () => {
  refuses(() => tally([vote("1"), vote("2"), vote("3")], [], principles), /no page to judge/);
});

test("a principles file that defines an id twice is refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-principles-"));
  try {
    await writeFile(join(dir, "p.md"), "- `grid` — Line up.\n- `grid` — Line up again.\n");
    await assert.rejects(loadPrinciples(join(dir, "p.md")), /grid more than once/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a vote file that is not valid JSON is named, not mistaken for no vote", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-votes-"));
  try {
    await writeFile(join(dir, "1.json"), JSON.stringify(vote("1")));
    await writeFile(join(dir, "2.json"), "{ not json");
    await assert.rejects(readVotes(dir), (error: unknown) => error instanceof JudgeVoteError && /2\.json: not valid JSON/.test(error.message));
    assert.deepEqual(await readVotes(join(dir, "missing")), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the same voter voting twice is refused", () => {
  refuses(() => tally([vote("1"), vote("1"), vote("3")], pages, principles), /voter 1 voted more than once/);
});

test("a list item in the principles file that is not a principle is refused, with its line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-principles-"));
  try {
    await writeFile(join(dir, "p.md"), "# P\n\n- `grid` — Line up.\n- density: not in the right shape\n");
    await assert.rejects(loadPrinciples(join(dir, "p.md")), /line 4 is a list item but not a principle/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a vote file that cannot be read is named as unreadable, not as invalid JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-votes-"));
  try {
    await mkdir(join(dir, "1.json"));
    await assert.rejects(readVotes(dir), (error: unknown) => error instanceof JudgeVoteError && /1\.json: cannot be read/.test(error.message) && !/not valid JSON/.test(error.message));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("principles files with Windows line endings load, and indented list items are refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aeom-principles-"));
  try {
    await writeFile(join(dir, "crlf.md"), "# P\r\n\r\n- `grid` — Line up.\r\n- `density` — Breathe.\r\n");
    assert.deepEqual((await loadPrinciples(join(dir, "crlf.md"))).map((p) => p.id), ["grid", "density"]);
    await writeFile(join(dir, "indented.md"), "- `grid` — Line up.\n  - `density` — Breathe.\n");
    await assert.rejects(loadPrinciples(join(dir, "indented.md")), /line 2 is a list item but not a principle/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the journey principles are plain text too, one id per principle", async () => {
  const loaded = await loadPrinciples(JOURNEY_PRINCIPLES_FILE);
  assert.ok(loaded.length >= 6);
  for (const id of ["clear-start", "next-step", "result-shown", "no-dead-end", "short", "same-words"]) assert.ok(loaded.some((p) => p.id === id), id);
});

test("a journey's verdict keeps the steps the winning side pointed at", () => {
  const journeys = ["see-my-orders"];
  const ps = [{ id: "result-shown", text: "The outcome is shown." }];
  const v = (voter: string, pass: boolean, step?: number): Vote => ({ voter, pages: { "see-my-orders": { "result-shown": { pass, reason: `${voter} says`, ...(step !== undefined ? { step } : {}) } } } });
  const verdict = tally([v("1", false, 3), v("2", false, 2), v("3", true, 1)], journeys, ps).pages[0]!.verdicts[0]!;
  assert.equal(verdict.pass, false);
  assert.deepEqual(verdict.steps, [2, 3]);
  refuses(() => tally([v("1", false, 0), v("2", false, 2), v("3", true)], journeys, ps), /the step for result-shown must be a step number/);
  // A journey's failure points at a step, or nobody can see where it shows; a page vote has no step.
  refuses(() => tally([v("1", false), v("2", false, 2), v("3", true)], journeys, ps, { steps: true }), /voter 1, see-my-orders: no step for result-shown/);
  assert.equal(tally([v("1", false, 3), v("2", false, 2), v("3", true)], journeys, ps, { steps: true }).pages[0]!.verdicts[0]!.pass, false, "a passing verdict needs no step");
});

/** A vote only on some pages and principles, as the voters who confirm the first one's failures give it. */
const partial = (voter: string, on: Record<string, Record<string, boolean>>): Vote => ({
  voter,
  pages: Object.fromEntries(Object.entries(on).map(([page, verdicts]) => [page, Object.fromEntries(Object.entries(verdicts).map(([id, pass]) => [id, { pass, reason: `${voter} on ${id}` }]))])),
});

test("one vote first: what it passes stands, and only what it fails goes to two more voters", () => {
  const first = vote("1", { "/commandes": ["states"], "/": ["hierarchy"] });
  const confirm = toConfirm(first, pages, principles);
  assert.deepEqual(confirm, { "/": ["hierarchy"], "/commandes": ["states"] });
  const report = tally([first, partial("2", { "/commandes": { states: false }, "/": { hierarchy: true } }), partial("3", { "/commandes": { states: false }, "/": { hierarchy: true } })], pages, principles, { confirm });
  const verdict = (page: string, id: string) => report.pages.find((p) => p.page === page)!.verdicts.find((v) => v.principle === id)!;
  assert.deepEqual([verdict("/commandes", "states").pass, verdict("/commandes", "states").votes], [false, "3/3 fail"]);
  assert.deepEqual([verdict("/", "hierarchy").pass, verdict("/", "hierarchy").votes], [true, "2/3 pass"], "the two others overturn a failure the first one alone saw");
  assert.deepEqual([verdict("/", "states").pass, verdict("/", "states").votes], [true, "1/1 pass"]);
  assert.equal(report.failures, 1);
});

test("a first vote that fails nothing is counted alone; a confirming vote that skips what it was asked is refused", () => {
  const clean = vote("1");
  assert.deepEqual(toConfirm(clean, pages, principles), {});
  assert.equal(tally([clean], pages, principles, { confirm: {} }).failures, 0);
  const first = vote("1", { "/commandes": ["states"] });
  const confirm = toConfirm(first, pages, principles);
  refuses(() => tally([first, partial("2", { "/commandes": { states: false } })], pages, principles, { confirm }), /expected 3 votes, found 2/);
  refuses(() => tally([first, partial("2", { "/": { hierarchy: true } }), partial("3", { "/commandes": { states: true } })], pages, principles, { confirm }), /voter 2: no verdict for \/commandes, whose states voter 1 failed/);
  refuses(() => tally([first, partial("2", { "/commandes": { hierarchy: true } }), partial("3", { "/commandes": { states: true } })], pages, principles, { confirm }), /voter 2, \/commandes: no verdict for states, which voter 1 failed/);
  const extra = tally([first, partial("2", { "/commandes": { states: true }, "/": { hierarchy: false } }), partial("3", { "/commandes": { states: true }, "/": { hierarchy: false } })], pages, principles, { confirm });
  assert.equal(extra.pages.find((p) => p.page === "/")!.verdicts.find((v) => v.principle === "hierarchy")!.votes, "1/1 pass", "what the first vote passed is not reopened");
});
