import assert from "node:assert/strict";
import { test } from "node:test";
import type { JudgeReport } from "../judge/tally.js";
import { DuelVoteError, ratchetJourneys, tallyDuels, type JourneyDuelVote, type JourneyReport } from "./index.js";

const run = (steps: number, broken: { step: number; reason: string } | null = null) => ({ width: 1280, steps: [], calls: [], screens: [], counts: { steps, screens: 1, back: 0 }, broken, sheet: "" });
const replay = (journeys: Record<string, ReturnType<typeof run>>): JourneyReport => ({
  url: "http://x",
  replayedAt: "",
  widths: [1280],
  warnings: [],
  journeys: Object.entries(journeys).map(([slug, r]) => ({ slug, name: slug, runs: [r] })),
});
const verdict = (failing: Record<string, string[]>): JudgeReport => ({
  judgedAt: "",
  voters: ["1", "2", "3"],
  principles: [],
  failures: 0,
  pages: Object.entries(failing).map(([page, ids]) => ({ page, verdicts: ["clear-start", "short", "result-shown"].map((principle) => ({ principle, pass: !ids.includes(principle), votes: "", reasons: [], dissent: [], steps: [] })) })),
});
const duel = (voter: string, choices: Record<string, "before" | "after">): JourneyDuelVote => ({ voter, journeys: Object.fromEntries(Object.entries(choices).map(([slug, winner]) => [slug, { winner, reason: `${voter} prefers ${winner}` }])) });

test("the new version wins only with more votes for it; a tie keeps the old one", () => {
  const duels = tallyDuels([duel("1", { orders: "after", help: "before" }), duel("2", { orders: "after", help: "after" }), duel("3", { orders: "before", help: "before" })], ["orders", "help"]);
  assert.equal(duels.get("orders")!.winner, "after");
  assert.equal(duels.get("orders")!.votes, "2/3 prefer the new one");
  assert.equal(duels.get("help")!.winner, "before");
  const tie = tallyDuels([duel("1", { orders: "after" }), duel("2", { orders: "before" })], ["orders"], { voters: 2 });
  assert.equal(tie.get("orders")!.winner, "before");
  assert.throws(() => tallyDuels([duel("1", {})], ["orders"], { voters: 1 }), DuelVoteError);
});

test("a journey the judges prefer, that goes to its end and that the guard lets through, stays; its findings are cleared only by the critique redone", () => {
  const [orders] = ratchetJourneys({
    before: replay({ orders: run(4) }),
    after: replay({ orders: run(3) }),
    beforeVerdict: verdict({ orders: ["clear-start", "short", "result-shown"] }),
    afterVerdict: verdict({ orders: ["result-shown"] }),
    duels: tallyDuels([duel("1", { orders: "after" }), duel("2", { orders: "after" }), duel("3", { orders: "before" })], ["orders"]),
    guard: { refused: [], allowed: [] },
  });
  assert.equal(orders!.kept, true);
  assert.deepEqual(orders!.steps, { before: 4, after: 3 });
  assert.deepEqual(orders!.cleared, ["clear-start", "short"]);
  assert.deepEqual(orders!.remaining, ["result-shown"]);
});

test("the old version comes back when the new one breaks, the guard refuses it, or the judges prefer the old one, and the run says why", () => {
  const duels = tallyDuels([duel("1", { a: "after", b: "after", c: "before" }), duel("2", { a: "after", b: "after", c: "before" }), duel("3", { a: "after", b: "after", c: "after" })], ["a", "b", "c"]);
  const verdicts = ratchetJourneys({
    before: replay({ a: run(3), b: run(3), c: run(3) }),
    after: replay({ a: run(2, { step: 2, reason: "the page answered 500" }), b: run(2), c: run(2) }),
    duels,
    guard: { refused: [{ kind: "call", what: "POST /api/panier", why: "a call the app did not make before", journey: "b" }], allowed: [] },
  });
  assert.deepEqual(verdicts.map((v) => [v.slug, v.kept]), [["a", false], ["b", false], ["c", false]]);
  assert.match(verdicts[0]!.why, /breaks at step 2 at 1280 px: the page answered 500/);
  assert.match(verdicts[1]!.why, /the guard refuses POST \/api\/panier/);
  assert.match(verdicts[2]!.why, /the judges prefer the old one \(2\/3 prefer the old one\)/);
});

test("a changed protected file sends every journey back", () => {
  const verdicts = ratchetJourneys({
    before: replay({ a: run(3) }),
    after: replay({ a: run(2) }),
    duels: tallyDuels([duel("1", { a: "after" }), duel("2", { a: "after" }), duel("3", { a: "after" })], ["a"]),
    guard: { refused: [{ kind: "file", what: "server.mjs", why: "a file that holds the app's data or logic" }], allowed: [] },
  });
  assert.equal(verdicts[0]!.kept, false);
  assert.match(verdicts[0]!.why, /server\.mjs/);
});
