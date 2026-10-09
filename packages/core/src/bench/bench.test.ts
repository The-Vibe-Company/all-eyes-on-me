import assert from "node:assert/strict";
import { test } from "node:test";
import type { Failure } from "../run/verdict.js";
import { benchTable, defectsProblems, gradeRun, tokenUsage, type Defects } from "./index.js";

const RULES = { screen: ["cursor", "overflow", "contrast", "console", "states", "hierarchy", "loads"], journey: ["clear-start", "next-step", "result-shown", "breaks"] };

const defects: Defects = {
  app: "Le Prêt",
  defects: [
    { id: "pret-01", screen: "/objets", rule: "contrast", what: "Les catégories en gris clair ne se lisent pas." },
    { id: "pret-02", screen: "/mes-emprunts", rule: "states", what: "Sans emprunt, la page est blanche." },
    { id: "pret-03", journey: "emprunter", rule: "next-step", what: "Après les dates, le bouton pour confirmer est sous la ligne de flottaison, en gris." },
    { id: "pret-04", screen: "/a-propos", rule: "hierarchy", what: "Aucun titre ne domine." },
  ],
};

const before: Failure[] = [
  { kind: "check", where: "/objets", rule: "contrast", what: "contrast: .categorie: 2.9:1 (and 3 more)" },
  { kind: "principle", where: "/mes-emprunts", rule: "states", what: "states: the list area is blank with no message" },
  { kind: "journey-principle", where: "Emprunter un objet", slug: "emprunter", rule: "next-step", what: "next-step: the confirm button is grey and below the fold" },
  { kind: "principle", where: "/", rule: "density", what: "density: the hero is cramped" },
];

test("a noted defect is found when AEOM fails the same screen or journey on the same check or principle, with its proof", () => {
  const g = gradeRun({ app: "pret", defects, before, end: [{ kind: "principle", where: "/mes-emprunts", rule: "states", what: "states: still blank" }, { kind: "check", where: "/a-propos", rule: "cursor", what: "cursor: a.lien has no pointer" }] });
  assert.deepEqual(g.found.map((f) => f.id), ["pret-01", "pret-02", "pret-03"]);
  assert.equal(g.found[0]!.proof, "contrast: .categorie: 2.9:1 (and 3 more)");
  assert.deepEqual(g.missed, ["pret-04"]);
  assert.deepEqual(g.fixed.map((f) => f.id), ["pret-01", "pret-03"], "fixed: found, and no longer failing at the end");
  assert.deepEqual(g.notFixed, ["pret-02"]);
  assert.deepEqual(g.regressions, [{ where: "/a-propos", rule: "cursor", what: "cursor: a.lien has no pointer" }], "passed before, fails after");
  assert.deepEqual(g.extra, [{ where: "/", rule: "density", what: "density: the hero is cramped" }], "what AEOM found beyond the list, to add or reject");
});

test("a verdict saved before failures named their rule is still read, from the words it wrote", () => {
  const old = before.map(({ rule: _r, slug: _s, ...f }) => f);
  const g = gradeRun({ app: "pret", defects, before: old, end: null, journeys: [{ slug: "emprunter", name: "Emprunter un objet" }] });
  assert.deepEqual(g.found.map((f) => f.id), ["pret-01", "pret-02", "pret-03"]);
  assert.equal(g.end, "not measured", "a run that stopped before its end fixed nothing anyone measured");
  assert.deepEqual(g.fixed, []);
});

test("an app that did not start is said, and graded on nothing", () => {
  const g = gradeRun({ app: "pret", defects, before: null, end: null, notStarted: "node server.mjs exited with 1" });
  assert.equal(g.notStarted, "node server.mjs exited with 1");
  assert.deepEqual([g.found, g.missed.length], [[], 4]);
});

test("a defect list names a screen or a journey, a rule AEOM measures there, and what is wrong", () => {
  assert.deepEqual(defectsProblems(defects, RULES), []);
  const bad = { app: "x", defects: [{ id: "a", screen: "/", journey: "j", rule: "states", what: "?" }, { id: "b", screen: "/", rule: "next-step", what: "x" }, { id: "c", journey: "j", rule: "states", what: "" }, { id: "a", screen: "/", rule: "contrast", what: "x" }] };
  const problems = defectsProblems(bad, RULES).join("\n");
  assert.match(problems, /a: a screen or a journey, not both/);
  assert.match(problems, /b: "next-step" is not measured on a screen/);
  assert.match(problems, /c: "states" is not measured on a journey/);
  assert.match(problems, /c: say what is wrong/);
  assert.match(problems, /a appears more than once/);
  assert.match(defectsProblems({ defects: "no" }, RULES).join("\n"), /no list of defects/);
});

const line = (o: object) => JSON.stringify(o);
const call = (id: string, at: string, usage: object) => line({ type: "assistant", timestamp: at, message: { id, model: "m", usage } });

test("the tokens of a run are every model call in its window, each counted once, the coordinator's and every agent's", () => {
  const usage = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 };
  const t = tokenUsage(
    [
      { agent: null, lines: [call("m1", "2026-10-09T10:00:00Z", usage), call("m1", "2026-10-09T10:00:01Z", usage), call("m0", "2026-10-09T08:00:00Z", usage), line({ type: "user", timestamp: "2026-10-09T10:00:02Z" }), "not json"] },
      { agent: "Kit worker", lines: [call("a1", "2026-10-09T10:05:00Z", usage), call("a2", "2026-10-09T10:06:00Z", { ...usage, output_tokens: 15 })] },
      { agent: "Judge, before the run", lines: [call("b1", "2026-10-09T07:00:00Z", usage)] },
    ],
    { since: "2026-10-09T09:00:00Z", until: "2026-10-09T11:00:00Z" },
  );
  assert.deepEqual(t.coordinator, { calls: 1, input: 10, cacheWrite: 100, cacheRead: 1000, output: 5, total: 1115 });
  assert.deepEqual(t.agents, [{ agent: "Kit worker", calls: 2, input: 20, cacheWrite: 200, cacheRead: 2000, output: 20, total: 2240 }]);
  assert.equal(t.total.total, 3355);
});

test("the bench table counts, app by app, what was found and fixed out of what was noted, regressions, features and tokens", () => {
  const g = gradeRun({ app: "pret", defects, before, end: [], features: ["POST /api/relance, a call the app never made"], tokens: { calls: 3, input: 1, cacheWrite: 2, cacheRead: 3, output: 4, total: 10 } });
  const { rows, text } = benchTable([g, gradeRun({ app: "atelier", defects: { app: "Terre & Tour", defects: [] }, before: null, end: null, notStarted: "it did not start" })]);
  assert.deepEqual(rows[0], { app: "pret", noted: 4, found: 3, fixed: 3, regressions: 0, features: 1, extra: 1, tokens: 10 });
  assert.match(text, /pret\s+3\/4\s+3\/4\s+0\s+1\s+1\s+10/);
  assert.match(text, /atelier\s+did not start: it did not start/);
});
