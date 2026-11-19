import assert from "node:assert/strict";
import { test } from "node:test";
import { benchText, judgeBenchEntry, judgeBenchText, scoreJudgePasses, scoreRun, unscored, type DefectList, type JudgePass } from "./index.js";
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

// Three passes of /aeom judge on one app: the checks say the same each time, the judges not quite.
const pass = (run: string, more: { kind: "principle" | "journey-principle" | "check" | "journey"; where: string; what: string }[], dollars: number | null = 2): JudgePass => ({
  run,
  dollars,
  failures: [{ kind: "check", where: "/", what: "overflow: the page is 512 px wide in a 390 px window" }, { kind: "check", where: "/produits", what: "contrast: .hint is 2.6:1, needs 4.5:1" }, ...more],
});
const PASSES = [
  pass("run-20261119-0900", [{ kind: "principle", where: "/commandes", what: "states: the list under Commandes is blank" }, { kind: "principle", where: "/contact", what: "hierarchy: two buttons compete" }]),
  pass("run-20261119-1000", [{ kind: "principle", where: "/commandes", what: "states: nothing says there is no order" }, { kind: "principle", where: "/contact", what: "hierarchy: the two buttons weigh the same" }, { kind: "principle", where: "/", what: "density: the hero leaves half the screen empty" }]),
  pass("run-20261119-1100", [{ kind: "principle", where: "/contact", what: "hierarchy: two buttons, no focal point" }], 3),
];

test("several passes of /aeom judge: each defect with how many passes found it, what they found beyond the list, and the spread of each count", () => {
  const score = scoreJudgePasses({ defects: DEFECTS, passes: PASSES });
  assert.deepEqual(score.passes.map((p) => [p.run, p.found, p.beyond]), [["run-20261119-0900", 3, 1], ["run-20261119-1000", 3, 2], ["run-20261119-1100", 2, 1]]);
  assert.deepEqual(score.found, { mean: 2.7, min: 2, max: 3 });
  assert.deepEqual(score.beyond, { mean: 1.3, min: 1, max: 2 });
  assert.deepEqual(score.dollars, { mean: 2.3, min: 2, max: 3 });
  const by = Object.fromEntries(score.defects.map((d) => [d.id, d]));
  assert.deepEqual([by["home-scrolls"]!.in, by["no-empty-state"]!.in, by["one-header"]!.in], [3, 2, 0]);
  assert.equal(by["no-empty-state"]!.proof, "/commandes: states: the list under Commandes is blank", "the first pass that found it says how");
  assert.deepEqual(score.beyondList, [{ what: "/contact: hierarchy: two buttons compete", in: 3 }, { what: "/: density: the hero leaves half the screen empty", in: 1 }], "the same verdict in other words is one, said as its first pass said it");
});

test("a verdict that changes from one pass to another is listed: a defect found one time in three, a principle that changes camp on a screen", () => {
  const score = scoreJudgePasses({ defects: DEFECTS, passes: PASSES });
  assert.deepEqual(score.flips, [{ what: "/commandes: states", in: 2 }, { what: "/: density", in: 1 }]);
  const text = judgeBenchText([score]);
  assert.match(text, /ugly-app +3 passes +found 2\.7\/5 \(2–3\) +beyond the list 1\.3 \(1–2\) +2 verdicts that change +≈ \$2\.3 a pass/);
  assert.match(text, /✓ home-scrolls +3\/3/);
  assert.match(text, /◐ no-empty-state +2\/3 +\/commandes: states: the list under Commandes is blank/);
  assert.match(text, /✗ one-header +0\/3/);
  assert.match(text, /Verdicts that change from one pass to another:\n +\/commandes: states, 2 of 3 passes\n +\/: density, 1 of 3 passes/);
  assert.match(text, /Beyond the defects noted, to add to the list or reject:\n +\/contact: hierarchy: two buttons compete \(3 of 3\)/);
});

test("each judge bench is kept with its date and AEOM's version, and says how far each mean moved since the one before, or that it is the first", () => {
  const score = scoreJudgePasses({ defects: DEFECTS, passes: PASSES });
  const entry = judgeBenchEntry([score], { at: "2026-11-19T12:00:00.000Z", aeom: "d23ecfb" });
  assert.deepEqual(entry, { at: "2026-11-19T12:00:00.000Z", mode: "judge", aeom: "d23ecfb", apps: [{ app: "ugly-app", runs: ["run-20261119-0900", "run-20261119-1000", "run-20261119-1100"], passes: 3, total: 5, found: 2.7, beyond: 1.3, flips: 2, dollars: 2.3 }] });
  assert.match(judgeBenchText([score], null), /No earlier judge bench to compare with: this one is the first\./);
  const before = { ...entry, at: "2026-11-12T12:00:00.000Z", aeom: "9c3c951", apps: [{ ...entry.apps[0]!, found: 2, beyond: 3, flips: 4, dollars: 2.3 }] };
  assert.match(judgeBenchText([score], before), /Since the judge bench of 2026-11-12 \(AEOM 9c3c951\):\n +ugly-app +found \+0\.7 +beyond the list −1\.7 +verdicts that change −2 +cost ±0/);
  // Fewer passes give fewer verdicts that change: two benches of different sizes are not compared.
  const two = { ...before, apps: [{ ...before.apps[0]!, passes: 2 }] };
  assert.match(judgeBenchText([score], two), /ugly-app +not compared: 2 passes then, 3 now/);
});

test("a verdict is one by its screen with its query, a record made at each visit aside; what lies beyond the list counts each verdict once", () => {
  const defects: DefectList = { app: "cours", noted: "by hand", defects: [{ id: "faint-intro", where: "/cours.html?id=intro", what: "faint text on the intro", match: ["contrast"] }] };
  const score = scoreJudgePasses({
    defects,
    passes: [
      { run: "a", dollars: 0.03, failures: [{ kind: "check", where: "/cours.html?id=intro", what: "contrast: 2.1:1" }, { kind: "principle", where: "/p/1", what: "states: blank" }, { kind: "principle", where: "/p/2", what: "states: blank too" }] },
      { run: "b", dollars: 0.03, failures: [{ kind: "check", where: "/cours.html?id=outro", what: "contrast: 2.4:1" }] },
    ],
  });
  assert.equal(score.defects[0]!.in, 1);
  assert.deepEqual(score.flips.map((f) => f.what), ["/cours.html?id=intro: contrast", "/p/1: states", "/cours.html?id=outro: contrast"], "another page's query is another screen");
  assert.deepEqual(score.passes.map((p) => p.beyond), [1, 1], "two records of one screen are one verdict");
  assert.match(judgeBenchText([score]), /< \$0\.1 a pass/, "a cheap pass is not said to cost nothing");
});

test("an app the judge bench cannot measure says why; an app with fewer passes than asked counts those it has and says so", () => {
  const short = scoreJudgePasses({ defects: DEFECTS, passes: PASSES.slice(0, 2), asked: 3 });
  const none = scoreJudgePasses({ defects: { ...DEFECTS, app: "factures" }, passes: [], asked: 3 });
  const text = judgeBenchText([short, none]);
  assert.match(text, /ugly-app +2 passes of 3 asked +found 3\/5/);
  assert.match(text, /factures +not measured: no \/aeom judge run/);
  assert.equal(none.error, "no /aeom judge run");
});
