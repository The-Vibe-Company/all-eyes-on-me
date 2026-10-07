import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_PRINCIPLES_FILE, JudgeVoteError, loadPrinciples, readVotes, tally, type Vote } from "./index.js";

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
  assert.ok(loaded.length >= 8);
  assert.ok(loaded.some((p) => p.id === "consistent-chrome"));
  assert.ok(loaded.some((p) => p.id === "states"));
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
  const report = tally([vote("1", { "/": ["hierarchy"] }), vote("2")], pages, principles);
  assert.equal(report.failures, 1);
});

test("a vote that skips a page or a principle, or invents one, is refused with every problem listed", () => {
  const broken: Vote = { voter: "2", pages: { "/": { hierarchy: { pass: true, reason: "" }, invented: { pass: false, reason: "" } } } };
  assert.throws(
    () => tally([vote("1"), broken], pages, principles),
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
