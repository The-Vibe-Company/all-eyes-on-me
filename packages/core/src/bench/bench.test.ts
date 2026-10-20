import assert from "node:assert/strict";
import { test } from "node:test";
import { benchText, scoreRun, unscored, type DefectList } from "./index.js";
import type { ResultPage } from "../run/index.js";

const DEFECTS: DefectList = {
  app: "ugly-app",
  noted: "by hand, from the captures and the code",
  defects: [
    { id: "home-scrolls", where: "/", what: "the home page scrolls sideways on a phone", match: ["overflow"] },
    { id: "faint-text", where: "/produits", what: "faint text below AA", match: ["contrast"] },
    { id: "no-empty-state", where: "/commandes", what: "an empty order list says nothing", match: ["states"] },
    { id: "one-header", where: "*", what: "every page has its own header", match: ["consistent-chrome"] },
    { id: "orders-hidden", where: "Voir mes commandes", what: "orders are only reachable from the bottom of the products", match: ["next-step", "clear-start", "breaks"] },
  ],
};

const page = (over: Partial<ResultPage> = {}): ResultPage => ({
  run: "run-20261019-1400",
  verdict: {
    nothingToRedo: false,
    line: "Measured: 4 screens.",
    failures: [
      { kind: "check", where: "/", what: "overflow: the page is 512 px wide in a 390 px window" },
      { kind: "check", where: "/produits", what: "contrast: .hint is 2.6:1, needs 4.5:1" },
      { kind: "journey-principle", where: "Voir mes commandes", what: "next-step: the link is at the bottom of the products" },
      { kind: "principle", where: "/contact", what: "hierarchy: two buttons compete" },
      { kind: "principle", where: "/commandes", what: "consistent-chrome: a yellow banner instead of the header" },
    ],
  },
  direction: null,
  screens: [
    { page: "/", status: "kept", count: { before: 2, after: 0 }, widths: [], cleared: ["overflow at 390 px"], still: [], newly: [] },
    { page: "/produits", status: "kept", count: { before: 1, after: 1 }, widths: [], cleared: [], still: ["contrast at 390 px"], newly: ["tap-size at 390 px"] },
  ],
  journeys: [{ slug: "voir-mes-commandes", name: "Voir mes commandes", status: "kept", why: null, broke: { before: null, after: null }, steps: { before: 6, after: 3 }, widths: [], cleared: ["next-step"], remaining: [] }],
  stillFailing: [{ kind: "check", where: "/produits", what: "contrast: .hint is 3.1:1, needs 4.5:1" }],
  measuredAfter: true,
  features: null,
  ...over,
});

test("a defect is found when the run failed its screen or journey on a check or principle that names it, fixed when the end no longer does, each with its proof", () => {
  const score = scoreRun({ defects: DEFECTS, page: page(), refused: [], dollars: 31.2, journeysJudgedAtEnd: true });
  const by = Object.fromEntries(score.defects.map((d) => [d.id, d]));
  assert.equal(by["home-scrolls"]!.found, "/: overflow: the page is 512 px wide in a 390 px window");
  assert.equal(by["home-scrolls"]!.fixed, true);
  assert.equal(by["faint-text"]!.fixed, false, "still failing at the end");
  assert.equal(by["faint-text"]!.still, "/produits: contrast: .hint is 3.1:1, needs 4.5:1");
  assert.equal(by["no-empty-state"]!.found, null, "never found");
  assert.equal(by["no-empty-state"]!.fixed, null, "neither fixed nor not: it was not found");
  assert.equal(by["orders-hidden"]!.found, "Voir mes commandes: next-step: the link is at the bottom of the products");
  assert.equal(by["orders-hidden"]!.fixed, true);
  assert.equal(by["one-header"]!.found, "/commandes: consistent-chrome: a yellow banner instead of the header", "a defect across the site is found on any screen");
  assert.equal(by["one-header"]!.fixed, true);
  assert.deepEqual([score.found, score.fixed, score.total], [4, 3, 5]);
  assert.deepEqual(score.regressions, ["/produits: tap-size at 390 px"]);
  assert.deepEqual(score.extra, ["/contact: hierarchy: two buttons compete"], "what the run found beyond the defects noted, to add or reject");
  assert.equal(score.dollars, 31.2);
});

test("a journey that breaks at the end where it did not before is a regression; a call the app never made is a hidden feature; a run never measured after fixes nothing it can prove", () => {
  const broke = page({ journeys: [{ slug: "voir-mes-commandes", name: "Voir mes commandes", status: "kept", why: null, broke: { before: null, after: "step 3: no link « Commandes »" }, steps: { before: 6, after: 3 }, widths: [], cleared: [], remaining: [] }] });
  const score = scoreRun({ defects: DEFECTS, page: broke, refused: [{ kind: "call", what: "POST /api/panier", why: "a call the app never made", journey: "voir-mes-commandes" }], dollars: null });
  assert.ok(score.regressions.includes("Voir mes commandes: breaks at the end, step 3: no link « Commandes »"));
  assert.deepEqual(score.hiddenFeatures, ["POST /api/panier: a call the app never made"]);
  const unmeasured = scoreRun({ defects: DEFECTS, page: page({ measuredAfter: false, stillFailing: [] }), refused: [], dollars: null });
  assert.equal(unmeasured.defects.find((d) => d.id === "home-scrolls")!.fixed, null);
  assert.equal(unmeasured.fixed, 0);
});

test("the bench reads as one line per app, then each defect with its proof, then what the run found beyond them", () => {
  const text = benchText([scoreRun({ defects: DEFECTS, page: page(), refused: [], dollars: 31.2, tokens: 180_000_000, journeysJudgedAtEnd: true }), unscored("factures", 5, null, "did not start: port 4420 in use")]);
  assert.match(text, /ugly-app +found 4\/5 +fixed 3\/5 +1 regression +0 hidden features +≈ \$31, 180 M tokens/);
  assert.match(text, /factures +not measured: did not start: port 4420 in use/);
  assert.match(text, /✓ home-scrolls +found, fixed +\/: overflow/);
  assert.match(text, /◐ faint-text +found, not fixed/);
  assert.match(text, /✗ no-empty-state +not found/);
  assert.match(text, /Beyond the defects noted[\s\S]*\/contact: hierarchy: two buttons compete/);
});

test("a journey's defect is fixed only when the end replayed the journey, and judged it again when a principle names it; screens and journeys that newly fail are regressions", () => {
  // The journey was not replayed at the end: its defect is found, not proven fixed.
  const notReplayed = page({ journeys: [{ slug: "voir-mes-commandes", name: "Voir mes commandes", status: "unchanged", why: null, broke: { before: null, after: null }, steps: { before: 6, after: null }, widths: [], cleared: [], remaining: [] }] });
  assert.equal(scoreRun({ defects: DEFECTS, page: notReplayed, refused: [], dollars: null, journeysJudgedAtEnd: true }).defects.find((d) => d.id === "orders-hidden")!.fixed, null);
  // Replayed but not judged again: a principle's defect is not proven fixed either.
  assert.equal(scoreRun({ defects: DEFECTS, page: page(), refused: [], dollars: null, journeysJudgedAtEnd: false }).defects.find((d) => d.id === "orders-hidden")!.fixed, null);
  // A journey that breaks needs only the replay; its name is matched whatever its case.
  const help: DefectList = { app: "ugly-app", noted: "by hand", defects: [{ id: "help", where: "obtenir de l'aide", what: "a 500", match: ["breaks"] }, { id: "aide", where: "/aide", what: "a 500", match: ["does not load"] }] };
  const helped = page({
    verdict: { nothingToRedo: false, line: "", failures: [{ kind: "journey", where: "Obtenir de l'aide", what: "it broke at step 2: the page answered 500" }, { kind: "page", where: "/aide", what: "does not load: 500" }] },
    journeys: [{ slug: "obtenir-de-l-aide", name: "Obtenir de l'aide", status: "kept", why: null, broke: { before: "it broke at step 2", after: null }, steps: { before: 2, after: 3 }, widths: [], cleared: [], remaining: ["short"] }],
    screens: [{ page: "/panier", status: "does not load", count: null, widths: [{ width: 390, before: "before/captures/panier@390.png", after: null }], cleared: [], still: [], newly: [] }],
    stillFailing: [],
  });
  const score = scoreRun({ defects: help, page: helped, refused: [], dollars: null, journeysJudgedAtEnd: true });
  assert.deepEqual(score.defects.map((d) => [d.id, d.fixed]), [["help", true], ["aide", true]]);
  assert.ok(score.regressions.includes("/panier: does not load at the end"), "a screen that loaded before");
  assert.ok(score.regressions.includes("Obtenir de l'aide: short fails at the end"), "a journey principle that passed before");
});

test("a route's query is left out when the defect names none; a run with no verdict is said, not scored as nothing found; a defect nothing in AEOM names is said so", () => {
  const studio: DefectList = { app: "studio", noted: "by hand", defects: [{ id: "slots", where: "/cours.html", what: "uneven", match: ["uneven"] }, { id: "links", where: "/clients", what: "six links say the same", match: [], note: "no check names it" }] };
  const run = page({ verdict: { nothingToRedo: false, line: "", failures: [{ kind: "check", where: "/cours.html?id=vinyasa", what: "uneven: two cards differ" }] }, stillFailing: [] });
  const score = scoreRun({ defects: studio, page: run, refused: [], dollars: null });
  assert.equal(score.defects[0]!.found, "/cours.html?id=vinyasa: uneven: two cards differ");
  assert.deepEqual(score.extra, []);
  assert.match(benchText([score]), /✗ links +not found, nothing names it/);
  const none = scoreRun({ defects: studio, page: page({ verdict: null }), refused: [], dollars: null });
  assert.match(none.error!, /has no verdict/);
});
