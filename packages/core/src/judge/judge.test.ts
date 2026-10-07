import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_PRINCIPLES_FILE, JudgeVoteError, loadPrinciples, readVotes, tally, type Vote } from "./index.js";

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
  assert.equal(report.failures, 1);
});

test("one dissenting vote does not fail a page", () => {
  const report = tally([vote("1", { "/": ["hierarchy"] }), vote("2"), vote("3")], pages, principles);
  assert.equal(report.failures, 0);
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
