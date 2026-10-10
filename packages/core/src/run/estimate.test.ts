import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateRun, estimateText } from "./index.js";

test("judging alone, as on Road to Mastock, costs six judges, about 840k tokens and a few minutes", () => {
  const { phases, total } = estimateRun({ screens: 8, journeys: 4, mode: "judge" });
  assert.deepEqual(phases.map((p) => p.phase), ["Understand the product", "Judge the screens and the journeys"]);
  assert.equal(total.agents, 6);
  assert.ok(total.tokens > 750_000 && total.tokens < 950_000, String(total.tokens));
  const judge = phases[1]!;
  assert.ok(judge.minutes >= 6 && judge.minutes <= 8, "the six judges run at once: the slowest decides");
});

test("a full run with six directions is about sixty agents and several million tokens, phase by phase", () => {
  const { phases, total } = estimateRun({ screens: 8, journeys: 4, mode: "full", directions: 6 });
  assert.deepEqual(phases.map((p) => p.phase), ["Understand the product", "Judge the screens and the journeys", "Six directions and the knockout", "The pages", "The journeys", "The result page, the standard and the PR"]);
  assert.ok(total.agents >= 55 && total.agents <= 65, String(total.agents));
  assert.ok(total.tokens > 6_000_000 && total.tokens < 9_500_000, String(total.tokens));
  assert.ok(total.minutes > 120, "several hours");
  assert.equal(phases[2]!.agents, 6 + 3 + 5 * 3, "six workers, three screening judges, five duels of three votes");
});

test("fewer directions, no journeys, or the style kept cost less, and each says so", () => {
  const three = estimateRun({ screens: 8, journeys: 4, mode: "full", directions: 3 });
  assert.equal(three.phases[2]!.phase, "Three directions and the knockout");
  assert.equal(three.phases[2]!.agents, 3 + 3 + 2 * 3);
  const noJourneys = estimateRun({ screens: 5, journeys: 0, mode: "full", directions: 6 });
  assert.ok(!noJourneys.phases.some((p) => p.phase === "The journeys"));
  assert.equal(noJourneys.phases[1]!.agents, 3, "no journey judges without journeys");
  const kept = estimateRun({ screens: 8, journeys: 4, mode: "keep-style" });
  assert.equal(kept.phases[2]!.phase, "The kit, in the app's own style");
  assert.equal(kept.phases[2]!.agents, 1);
  assert.ok(kept.total.agents < estimateRun({ screens: 8, journeys: 4, mode: "full", directions: 6 }).total.agents);
});

test("the estimate reads as a table, phase by phase, with what is at most and the session apart", () => {
  const text = estimateText(estimateRun({ screens: 8, journeys: 4, mode: "full", directions: 6 }), { screens: 8, journeys: 4 });
  assert.match(text, /^For 8 screens and 4 key journeys:\n/);
  assert.match(text, /Judge the screens and the journeys +6 agents +≈ 0\.\d M tokens +≈ \d+ min/);
  assert.match(text, /Total, at most +\d+ agents +≈ \d\.\d M tokens +≈ \d h \d\d/);
  assert.match(text, /only when the verdict finds something to redo/);
  assert.match(text, /the session that coordinates the run/);
});
