import assert from "node:assert/strict";
import { test } from "node:test";
import type { JourneyReport, JourneyRun, RatchetVerdict } from "../journey/index.js";
import type { JudgeReport } from "../judge/tally.js";
import type { PageComparison } from "./compare.js";
import { decidePages, journeyFilesBack } from "./ratchet.js";

const score = (total: number) => ({ page: "", checks: total, principles: 0, total, failing: [] });
const page = (name: string, verdict: PageComparison["verdict"], before: number, after: number, lost?: string[]): PageComparison => ({
  page: name,
  before: verdict === "new" ? null : score(before),
  after: verdict === "missing" ? null : score(after),
  verdict,
  newly: [],
  ...(lost ? { lost } : {}),
});
const run = (paths: string[], { width = 1280, broken = null }: { width?: number; broken?: JourneyRun["broken"] } = {}): JourneyRun => ({
  width,
  steps: paths.map((path, i) => ({ index: i + 1, action: `step ${i + 1}`, path, capture: null })),
  calls: [],
  screens: [...new Set(paths)],
  counts: { steps: paths.length, screens: new Set(paths).size, back: 0 },
  broken,
  sheet: "",
});
const replay = (journeys: Record<string, JourneyRun[]>): JourneyReport => ({
  url: "http://localhost:3000/",
  replayedAt: "",
  widths: [1280],
  warnings: [],
  journeys: Object.entries(journeys).map(([slug, runs]) => ({ slug, name: `Journey ${slug}`, runs })),
});
const critique = (journeys: Record<string, { pass: string[]; fail: { principle: string; steps: number[] }[] }>): JudgeReport => ({
  judgedAt: "",
  voters: ["1", "2", "3"],
  principles: [],
  failures: 0,
  pages: Object.entries(journeys).map(([slug, { pass, fail }]) => ({
    page: slug,
    verdicts: [
      ...pass.map((principle) => ({ principle, pass: true, votes: "3/3 pass", reasons: ["fine"], dissent: [], steps: [] })),
      ...fail.map(({ principle, steps }) => ({ principle, pass: false, votes: "2/3 fail", reasons: [`${principle} fails`], dissent: [], steps })),
    ],
  })),
});
const verdict = (slug: string, kept: boolean, unchanged = false): RatchetVerdict => ({ slug, name: `Journey ${slug}`, kept, why: kept ? "it got better" : "it got worse", steps: { before: 3, after: 3 }, cleared: [], remaining: [], ...(unchanged ? { unchanged: true as const } : {}) });
const decided = (r: ReturnType<typeof decidePages>, name: string) => r.pages.find((p) => p.page === name);

test("a page that got better stays; any other a worker rebuilt goes back, each with its reason", () => {
  const r = decidePages({
    comparison: [page("/", "better", 5, 2), page("/cart", "same", 3, 3), page("/orders", "worse", 2, 4), page("/help", "missing", 1, 0), page("/team", "worse", 1, 2, ["link \"Contact\""]), page("/new", "new", 0, 1)],
    workers: ["/", "/cart", "/orders", "/help", "/team", "/new"].map((p) => ({ name: p.slice(1) || "home", page: p })),
  });
  assert.deepEqual(r.pages.map((p) => [p.page, p.back]), [["/", false], ["/cart", true], ["/orders", true], ["/help", true], ["/team", true], ["/new", false]]);
  assert.match(decided(r, "/")!.why, /^better: 5 → 2 failing/);
  assert.match(decided(r, "/cart")!.why, /^the same as before: 3 → 3 failing/);
  assert.match(decided(r, "/orders")!.why, /^worse: 2 → 4 failing/);
  assert.match(decided(r, "/help")!.why, /missing after the wave/);
  assert.match(decided(r, "/team")!.why, /it lost link "Contact"/);
  assert.match(decided(r, "/new")!.why, /a new page/);
  assert.deepEqual(decided(r, "/cart")!.workers, ["cart"]);
});

test("no worker touched it, or none of the wave rebuilt it: it stays, and the kit is named when it made the page worse", () => {
  const r = decidePages({
    comparison: [page("/about", "same", 0, 0), page("/legal", "worse", 1, 2), page("/faq", "same", 2, 2)],
    noWorker: ["/about"],
    workers: [],
  });
  assert.deepEqual(r.pages.map((p) => p.back), [false, false, false]);
  assert.match(decided(r, "/about")!.why, /no worker touched it/);
  assert.match(decided(r, "/legal")!.why, /no page worker rebuilt it: nothing to put back; the kit made it worse, and putting the page back cannot undo the kit/);
  assert.match(decided(r, "/faq")!.why, /no page worker rebuilt it: nothing to put back$/);
});

test("a page a kept journey crosses stays, for the journey it made better", () => {
  const after = replay({ buy: [run(["/", "/products/12", "/cart"])] });
  const r = decidePages({
    comparison: [page("/products/7", "same", 2, 2), page("/orders", "same", 2, 2)],
    workers: [{ name: "product", page: "/products/:id" }, { name: "orders", page: "/orders" }],
    journeys: { ratchet: [verdict("buy", true)], replay: after, replayBefore: after },
  });
  assert.equal(decided(r, "/products/7")!.back, false, "a page of one shape is the same screen");
  assert.match(decided(r, "/products/7")!.why, /but the journey "Journey buy" crosses it, and its ratchet kept it/);
  assert.equal(decided(r, "/orders")!.back, true);
});

test("a journey sent back puts back the page where it now breaks, or fails what passed before, even a page that got better", () => {
  const before = replay({ buy: [run(["/", "/cart", "/pay"])], find: [run(["/", "/search"], { broken: { step: 2, reason: "no field" } })] });
  const after = replay({ buy: [run(["/", "/cart"], { broken: { step: 3, reason: "no button \"Pay\"" } })], find: [run(["/", "/search"], { broken: { step: 2, reason: "no field" } })], tell: [run(["/", "/news", "/news/3"])] });
  const r = decidePages({
    comparison: [page("/", "better", 4, 1), page("/cart", "better", 4, 1), page("/search", "better", 3, 1), page("/news/:id", "better", 3, 2)],
    workers: [{ name: "home", page: "/" }, { name: "cart", page: "/cart" }, { name: "search", page: "/search" }, { name: "news", page: "/news/:id" }],
    journeys: {
      ratchet: [verdict("buy", false), verdict("find", false), verdict("tell", false)],
      replay: after,
      replayBefore: { ...before, journeys: [...before.journeys, { slug: "tell", name: "Journey tell", runs: [run(["/", "/news", "/news/3"])] }] },
      critique: critique({ buy: { pass: [], fail: [] }, find: { pass: [], fail: [{ principle: "clear-start", steps: [2] }] }, tell: { pass: ["clear-start"], fail: [{ principle: "next-step", steps: [3] }] } }),
      critiqueBefore: critique({ buy: { pass: [], fail: [] }, find: { pass: [], fail: [{ principle: "clear-start", steps: [2] }] }, tell: { pass: ["clear-start", "next-step"], fail: [] } }),
    },
  });
  assert.equal(decided(r, "/cart")!.back, true, "buy now breaks at step 3, from /cart");
  assert.match(decided(r, "/cart")!.why, /^the journey "Journey buy", sent back, breaks here at step 3/);
  assert.equal(decided(r, "/news/:id")!.back, true, "tell now fails next-step at step 3, on /news/3");
  assert.match(decided(r, "/news/:id")!.why, /^the journey "Journey tell", sent back, fails here what passed before: next-step/);
  assert.equal(decided(r, "/search")!.back, false, "find broke there before the run too: that break is not the wave's");
  assert.equal(decided(r, "/")!.back, false);
  assert.match(r.toLook.join("\n"), /the journey "Journey find" comes back for a reason no page holds: it got worse/);
});

test("the run sends a page back itself when an action is gone; a page no worker rebuilt cannot go back, and is said", () => {
  const after = replay({ buy: [run(["/", "/kit-broke"], { broken: { step: 3, reason: "no link" } })], wander: [run(["/", "/lost"], { broken: { step: 3, reason: "no link" } })] });
  const r = decidePages({
    comparison: [page("/cart", "better", 4, 1), page("/kit-broke", "better", 2, 1)],
    workers: [{ name: "cart", page: "/cart" }],
    back: { "/cart": "the button \"Pay\" is gone" },
    journeys: { ratchet: [verdict("buy", false), verdict("wander", false)], replay: after, replayBefore: replay({ buy: [run(["/", "/kit-broke", "/done"])], wander: [run(["/", "/lost", "/found"])] }) },
  });
  assert.equal(decided(r, "/cart")!.back, true);
  assert.match(decided(r, "/cart")!.why, /^sent back by the run: the button "Pay" is gone/);
  assert.equal(decided(r, "/kit-broke")!.back, false, "the journey breaks at step 3, from /kit-broke, which no worker rebuilt");
  assert.match(decided(r, "/kit-broke")!.why, /^the journey "Journey buy", sent back, breaks here at step 3, but no page worker rebuilt it: nothing to put back/);
  assert.match(r.toLook.join("\n"), /the journey "Journey buy", sent back, breaks on \/kit-broke at step 3, which no page worker rebuilt: the kit's or the direction's/);
  assert.equal(decided(r, "/lost"), undefined, "a page the measure never captured gets no row");
  assert.match(r.toLook.join("\n"), /the journey "Journey wander", sent back, breaks on \/lost at step 3, which no page worker rebuilt/);
});

test("a journey file rewritten in the wave goes back when every step it changed acts on a page put back, and is said when it mixes pages", () => {
  const click = (name: string) => ({ do: "click" as const, target: { role: "button", name } });
  const open = (path: string) => ({ do: "open" as const, path });
  const after = replay({
    buy: [run(["/", "/cart", "/pay"])],
    short: [run(["/", "/cart", "/pay"])],
    home: [run(["/", "/cart"])],
    tell: [run(["/news", "/cart", "/cart"])],
    find: [run(["/search", "/search"])],
    far: [run(["/", "/cart"], { broken: { step: 3, reason: "no button" } })],
  });
  const pages = [
    { page: "/", verdict: "better" as const, back: false, why: "better", workers: ["home"] },
    { page: "/cart", verdict: "same" as const, back: true, why: "the same", workers: ["cart"] },
    { page: "/pay", verdict: "same" as const, back: true, why: "the same", workers: ["pay"] },
    { page: "/news", verdict: "better" as const, back: false, why: "better", workers: ["news"] },
    { page: "/search", verdict: "better" as const, back: false, why: "better", workers: ["search"] },
  ];
  const r = journeyFilesBack({
    pages,
    replay: after,
    changed: [
      { slug: "buy", before: [open("/"), click("Panier"), click("Payer")], after: [open("/"), click("Panier"), click("Régler")] },
      { slug: "short", before: [open("/"), click("Panier"), click("Continuer"), click("Payer")], after: [open("/"), click("Panier"), click("Payer")] },
      { slug: "home", before: [open("/"), click("Panier")], after: [open("/"), click("Mon panier")] },
      { slug: "tell", before: [open("/news"), click("Lire"), click("Ajouter")], after: [open("/news"), click("Lire la suite"), click("Mettre au panier")] },
      { slug: "find", before: [open("/search"), click("Chercher")], after: [open("/search"), click("Trouver")] },
      { slug: "far", before: [open("/"), click("Panier"), click("Payer"), click("Fin")], after: [open("/"), click("Panier"), click("Payer"), click("Terminer")] },
      { slug: "gone", before: [open("/")], after: [open("/"), click("Plus")] },
      { slug: "new", before: null, after: [open("/")] },
    ],
  });
  assert.deepEqual(r.back, ["buy", "short"], "the step it renamed acts on /cart, put back; a step taken out, the step after it");
  const look = r.toLook.join("\n");
  assert.doesNotMatch(look, /home\.json|find\.json/, "a step renamed on a page kept stays, even on the home page every journey crosses");
  assert.match(look, /tell\.json was rewritten in the wave for \/cart, put back, and \/news, kept: put back only the steps of \/cart by hand/);
  assert.match(look, /far\.json was rewritten in the wave at a step its replay never reached/);
  assert.match(look, /gone\.json was rewritten in the wave and no replay of it says on which pages/);
  assert.match(look, /new\.json was added in the wave/);
});
