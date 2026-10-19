import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckReport } from "../checks/run.js";
import type { JourneyReport } from "../journey/replay.js";
import type { JudgeReport } from "../judge/tally.js";
import { scorePages, verdictOf } from "./index.js";

const check = (findings: CheckReport["findings"] = []): CheckReport => ({ url: "http://x", checkedAt: "", widths: [390, 1280], checks: ["cursor", "overflow", "contrast", "console"], pages: ["http://x/", "http://x/commandes"], errors: [], findings });
const judge = (failing: Record<string, string[]>, ids = ["hierarchy", "states"]): JudgeReport => ({
  judgedAt: "",
  voters: ["1", "2", "3"],
  principles: ids.map((id) => ({ id, text: id })),
  failures: 0,
  pages: Object.entries(failing).map(([page, failed]) => ({ page, verdicts: ids.map((principle) => ({ principle, pass: !failed.includes(principle), votes: "", reasons: [`${principle} on ${page}`], dissent: [], steps: [] })) })),
});
const journeys = (broken: { step: number; reason: string } | null): JourneyReport => ({
  url: "http://x",
  replayedAt: "",
  widths: [390, 1280],
  warnings: [],
  journeys: [{ slug: "orders", name: "See my orders", runs: [{ width: 1280, steps: [], calls: [], screens: ["/"], counts: { steps: 3, screens: 1, back: 0 }, broken, sheet: "" }] }],
});

test("nothing to redo when no check, no principle and no journey fails, and it says what was measured", () => {
  const v = verdictOf({ check: check(), judge: judge({ "/": [], "/commandes": [] }), journeys: journeys(null), journeyJudge: judge({ orders: [] }, ["short"]), recorded: ["orders"] });
  assert.equal(v.nothingToRedo, true);
  assert.deepEqual(v.failures, []);
  assert.deepEqual(v.missing, []);
  assert.deepEqual(v.measured, { screens: 2, widths: [390, 1280], checks: 4, principles: 2, journeys: 1, journeyPrinciples: 1 });
});

test("a failing check, principle, broken journey or journey principle is something to redo, each named where it shows", () => {
  const v = verdictOf({
    check: check([
      { check: "contrast", url: "http://x/commandes", width: 390, element: 'link "Aide"', message: "text below AA" },
      { check: "contrast", url: "http://x/commandes", width: 1280, element: 'link "Aide"', message: "text below AA" },
      { check: "contrast", url: "http://x/commandes", width: 1280, element: 'button "Payer"', message: "text below AA" },
    ]),
    judge: judge({ "/": ["states"], "/commandes": [] }),
    journeys: journeys({ step: 2, reason: "the page answered 500" }),
    journeyJudge: judge({ orders: ["short"] }, ["short"]),
    recorded: ["orders"],
  });
  assert.equal(v.nothingToRedo, false);
  assert.deepEqual(v.failures.map((f) => [f.kind, f.where, f.what]), [
    ["check", "/commandes", 'contrast: link "Aide": text below AA (and 1 more)'],
    ["principle", "/", "states: states on /"],
    ["journey", "See my orders", "breaks at step 2 at 1280 px: the page answered 500"],
    ["journey-principle", "See my orders", "short: short on orders"],
  ]);
});

test("an app without journeys is judged on its pages alone", () => {
  const v = verdictOf({ check: check(), judge: judge({ "/": [], "/commandes": [] }) });
  assert.equal(v.nothingToRedo, true);
  assert.equal(v.measured.journeys, 0);
});

test("a page that does not load is something to redo, though nothing was checked or judged on it", () => {
  const v = verdictOf({ check: { ...check(), errors: [{ url: "http://x/aide", status: 500, reason: "500 Internal Server Error" }] }, judge: judge({ "/": [], "/commandes": [] }) });
  assert.equal(v.nothingToRedo, false);
  assert.deepEqual(v.failures, [{ kind: "page", where: "/aide", what: "does not load: 500 Internal Server Error" }]);
  assert.deepEqual(v.missing, []);
});

test("a screen or journey one report has and another leaves out is missing, and nothing is decided", () => {
  const v = verdictOf({ check: check(), judge: judge({ "/": [], "/contact": [] }), journeys: journeys(null), journeyJudge: judge({}, ["short"]), recorded: ["help", "orders"] });
  assert.equal(v.nothingToRedo, false);
  assert.deepEqual(v.failures, []);
  assert.deepEqual(v.missing, ["/commandes was checked but not judged", "/contact was judged but not checked", "the journey help was not replayed", 'the journey "See my orders" was not judged']);
  assert.deepEqual(verdictOf({ check: { ...check(), pages: [] }, judge: judge({}) }).missing, ["no page was checked"]);
});

test("a screen whose record changes at every visit, checked as /sessions/124 and judged as /sessions/123, is one screen: the verdict decides", () => {
  const checked: CheckReport = { ...check([{ check: "contrast", url: "http://x/sessions/124", width: 1280, message: "pale" }]), pages: ["http://x/", "http://x/sessions/124"] };
  const v = verdictOf({ check: checked, judge: judge({ "/": [], "/sessions/123": ["states"] }) });
  assert.deepEqual(v.missing, []);
  assert.deepEqual(v.failures.map((f) => f.where).sort(), ["/sessions/123", "/sessions/123"], "named once, as the judges saw it");
  const other: CheckReport = { ...check(), pages: ["http://x/", "http://x/autre"] };
  assert.match(verdictOf({ check: other, judge: judge({ "/": [], "/sessions/123": [] }) }).missing.join("\n"), /\/autre was checked but not judged/);
});

test("screens checked at one list of widths and judged or replayed at another decide nothing: the verdict says which", () => {
  const desktop = { ...check(), widths: [1280] };
  const same = verdictOf({ check: desktop, judge: { ...judge({ "/": [], "/commandes": [] }), widths: [1280] }, journeys: { ...journeys(null), widths: [1280] }, journeyJudge: judge({ orders: [] }, ["short"]), recorded: ["orders"] });
  assert.deepEqual(same.missing, []);
  assert.deepEqual(same.measured.widths, [1280]);
  const stale = verdictOf({ check: desktop, judge: { ...judge({ "/": [], "/commandes": [] }), widths: [390, 1280] }, journeys: journeys(null), journeyJudge: judge({ orders: [] }, ["short"]), recorded: ["orders"] });
  assert.equal(stale.nothingToRedo, false);
  assert.deepEqual(stale.missing, [
    "the screens were checked at 1280 px and judged at 390, 1280 px: capture, check and judge them at the same widths",
    "the screens were checked at 1280 px and the journeys replayed at 390, 1280 px: replay them at the same widths",
  ]);
  assert.deepEqual(verdictOf({ check: desktop, judge: judge({ "/": [], "/commandes": [] }) }).missing, [], "a verdict counted before judges said their widths decides as before");
});

test("with the style kept, what impeccable bans is the charter's, like the principles that judge the style: said, never redone", () => {
  const finding = (name: CheckReport["findings"][number]["check"], element: string) => ({ check: name, url: "http://x/", width: 1280, element, message: "" });
  const findings = [finding("gradient-text", 'h1 "Brand"'), finding("cursor", 'div "Go"')];
  const failing = judge({ "/": ["not-generic"], "/commandes": [] }, ["hierarchy", "not-generic"]);
  const kept = verdictOf({ check: check(findings), judge: failing, keepStyle: true });
  assert.deepEqual(kept.failures.map((f) => f.what.split(":")[0]), ["cursor"]);
  assert.deepEqual(kept.keptWithStyle.map((f) => f.what.split(":")[0]), ["gradient-text", "not-generic"]);
  const redone = verdictOf({ check: check(findings), judge: failing });
  assert.deepEqual(redone.failures.map((f) => f.what.split(":")[0]), ["gradient-text", "cursor", "not-generic"]);
  const [page] = scorePages(check(findings), failing, ["not-generic", "gradient-text"]);
  assert.deepEqual(page!.failing, ["cursor@1280"], "the run's ratchet counts neither");
});
