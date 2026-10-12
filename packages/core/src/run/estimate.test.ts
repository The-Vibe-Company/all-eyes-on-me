import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateRun, estimateText } from "./index.js";

test("judging alone, as on Road to Mastock, costs six judges at most, two thirds of the 840k tokens three full votes took", () => {
  const { phases, total } = estimateRun({ screens: 8, journeys: 4, mode: "judge" });
  assert.deepEqual(phases.map((p) => p.phase), ["Understand the product", "Judge the screens and the journeys"]);
  assert.equal(total.agents, 6);
  assert.ok(total.tokens > 500_000 && total.tokens < 620_000, String(total.tokens));
  const judge = phases[1]!;
  assert.ok(judge.minutes >= 13 && judge.minutes <= 17, "one vote then two on what it failed, on the journeys then the screens");
});

test("a full run with six directions is about thirty-five agents and three million tokens, phase by phase, a journey that still breaks apart", () => {
  const { phases, total, ifBroken } = estimateRun({ screens: 8, journeys: 4, mode: "full", directions: 6 });
  assert.deepEqual(phases.map((p) => p.phase), ["Understand the product", "Judge the screens and the journeys", "Six directions and the knockout", "The pages and their journeys", "The result page, the standard and the PR"]);
  assert.ok(total.agents >= 30 && total.agents <= 40, String(total.agents));
  assert.ok(total.tokens > 3_000_000 && total.tokens < 4_500_000, String(total.tokens));
  assert.ok(total.minutes > 90, "a couple of hours");
  assert.equal(phases[2]!.agents, 6 + 3 + 4 + 3, "six workers, three screening judges, four duels of one vote and a final of three");
  assert.equal(phases[3]!.agents, 6 + 1 + 3 + 3, "the page workers, the promotion, the screens measured, the journeys judged once");
  assert.equal(ifBroken!.agents, 4 + 1 + 3 + 3, "at most a worker per journey and a shared one, the journeys judged again, the screens measured again: no duel");
});

test("one wave for the pages and their journeys costs at least a million tokens less than a journey wave apart", () => {
  // Before ticket 15, 8 screens and 4 journeys with three directions came to about 4.3 M tokens.
  const { total, ifBroken } = estimateRun({ screens: 8, journeys: 4, mode: "full" });
  assert.ok(total.tokens < 3_300_000, String(total.tokens));
  assert.ok(ifBroken!.tokens < 1_500_000, String(ifBroken!.tokens));
});

test("fewer directions, no journeys, or the style kept cost less, and each says so", () => {
  const three = estimateRun({ screens: 8, journeys: 4, mode: "full", directions: 3 });
  assert.equal(three.phases[2]!.phase, "Three directions and the knockout");
  assert.equal(three.phases[2]!.agents, 3 + 3 + 1 + 3, "three workers, three screening judges, one duel of one vote, a final of three");
  const noJourneys = estimateRun({ screens: 5, journeys: 0, mode: "full", directions: 6 });
  assert.ok(!noJourneys.phases.some((p) => /journeys/.test(p.phase) && p.phase !== "Judge the screens"));
  assert.equal(noJourneys.phases[3]!.phase, "The pages");
  assert.equal(noJourneys.ifBroken, undefined, "no journey, nothing to break");
  assert.deepEqual([noJourneys.phases[1]!.phase, noJourneys.phases[1]!.agents], ["Judge the screens", 3], "no journey judges without journeys");
  const kept = estimateRun({ screens: 8, journeys: 4, mode: "keep-style" });
  assert.equal(kept.phases[2]!.phase, "The kit, in the app's own style");
  assert.equal(kept.phases[2]!.agents, 1);
  assert.equal(kept.phases[3]!.agents, 8 + 1 + 3 + 3 + 3, "every page, the promotion, the screens measured, the journeys judged and the charter judged");
  const small = estimateRun({ screens: 2, journeys: 0, mode: "full", directions: 3 });
  assert.deepEqual([small.phases[3]!.agents, Math.round(small.phases[3]!.minutes)], [3, 4], "the direction rebuilt both screens: no page wave, only the measure");
  assert.ok(kept.total.agents < estimateRun({ screens: 8, journeys: 4, mode: "full", directions: 6 }).total.agents);
});

test("the estimate reads as a table, phase by phase, with what is at most and the session apart", () => {
  const text = estimateText(estimateRun({ screens: 8, journeys: 4, mode: "full", directions: 6 }), { screens: 8, journeys: 4 });
  assert.match(text, /^For 8 screens and 4 key journeys:\n/);
  assert.match(text, /Judge the screens and the journeys +6 agents +≈ 0\.\d M tokens +≈ \d+ min/);
  assert.match(text, /Total, at most +\d+ agents +≈ \d\.\d M tokens +≈ \d h \d\d/);
  assert.match(text, /only when the verdict finds something to redo/);
  assert.match(text, /\nIf a journey still breaks after the pages, at most +\d+ agents +≈ \d\.\d M tokens +≈ \d+ min more\n/);
  assert.match(text, /the session that coordinates the run/);
});

test("/aeom --ux costs the journeys alone: no direction and no page wave", () => {
  const { phases, total } = estimateRun({ screens: 8, journeys: 4, mode: "ux" });
  assert.deepEqual(phases.map((p) => p.phase), ["Understand the product", "Judge the journeys", "The journeys", "The result page, the standard and the PR"]);
  assert.equal(total.agents, 3 + 3 + 1 + 4 + 6 + 3);
});
