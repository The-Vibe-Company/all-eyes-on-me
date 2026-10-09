import assert from "node:assert/strict";
import { test } from "node:test";
import type { JourneyReport } from "../journey/replay.js";
import type { JudgeReport } from "../judge/tally.js";
import { blockedJourneys } from "./index.js";

const journey = (slug: string, name: string, broken: { step: number; reason: string } | null = null) => ({
  slug,
  name,
  runs: [390, 1280].map((width) => ({
    width,
    steps: [1, 2, 3].map((index) => ({ index, action: `step ${index}`, path: "/", capture: `${slug}@${width}-0${index}.png` })),
    calls: [],
    screens: ["/"],
    counts: { steps: 3, screens: 1, back: 0 },
    broken: width === 1280 ? broken : null,
    sheet: `${slug}@${width}.png`,
  })),
});
const replay = (journeys: ReturnType<typeof journey>[]) => ({ url: "x", replayedAt: "", widths: [390, 1280], warnings: [], journeys }) as unknown as JourneyReport;
const critique = (failing: Record<string, { principle: string; step: number; reason: string }[]>): JudgeReport => ({
  judgedAt: "",
  voters: ["1", "2", "3"],
  principles: ["result-shown", "no-dead-end", "short"].map((id) => ({ id, text: id })),
  failures: 0,
  pages: Object.entries(failing).map(([page, fails]) => ({
    page,
    verdicts: ["result-shown", "no-dead-end", "short"].map((principle) => {
      const f = fails.find((x) => x.principle === principle);
      return { principle, pass: !f, votes: "", reasons: f ? [f.reason] : [], dissent: [], steps: f ? [f.step] : [] };
    }),
  })),
});

test("a key journey that breaks, or whose result is not shown or ends in a dead end, is blocked at its step, with its capture", () => {
  const blocked = blockedJourneys({
    replay: replay([journey("help", "Get help", { step: 2, reason: "the page answered 500" }), journey("add", "Add a product"), journey("orders", "See my orders")]),
    critique: critique({ help: [], add: [{ principle: "result-shown", step: 2, reason: "Ajouter adds nothing." }], orders: [{ principle: "short", step: 2, reason: "A detour." }] }),
  });
  assert.deepEqual(blocked.entries.map((b) => [b.slug, b.step, b.capture, b.why]), [
    ["help", 2, "help@1280-02.png", "breaks at step 2: the page answered 500"],
    ["add", 2, "add@1280-02.png", "Ajouter adds nothing."],
  ], "a journey that is only long is not blocked");
  assert.equal(blocked.more, 0);
});

test("at most three, the journeys of the product sheet's order first, and the rest counted", () => {
  const slugs = ["a", "b", "c", "d", "e"];
  const blocked = blockedJourneys({
    replay: replay(slugs.map((s) => journey(s, `Journey ${s}`))),
    critique: critique(Object.fromEntries(slugs.map((s) => [s, [{ principle: "no-dead-end", step: 3, reason: `${s} ends nowhere.` }]]))),
    order: ["Journey d", "Journey b"],
  });
  assert.deepEqual(blocked.entries.map((b) => b.slug), ["d", "b", "a"]);
  assert.equal(blocked.more, 2);
});

test("no journey blocked, nothing to name", () => {
  assert.deepEqual(blockedJourneys({ replay: replay([journey("a", "A")]), critique: critique({ a: [] }) }), { entries: [], more: 0 });
});
