import assert from "node:assert/strict";
import { test } from "node:test";
import type { JudgeReport } from "../judge/tally.js";
import { journeyFindingsByPage, type JourneyReport, type JourneyRun } from "./index.js";

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
  widths: [390, 1280],
  warnings: [],
  journeys: Object.entries(journeys).map(([slug, runs]) => ({ slug, name: `Journey ${slug}`, runs })),
});
const critique = (failing: Record<string, { principle: string; steps: number[]; reason: string }[]>): JudgeReport => ({
  judgedAt: "",
  voters: ["1", "2", "3"],
  principles: [],
  failures: 0,
  pages: Object.entries(failing).map(([page, fails]) => ({
    page,
    verdicts: [
      { principle: "clear-start", pass: true, votes: "3/3 pass", reasons: ["fine"], dissent: [], steps: [] },
      ...fails.map(({ principle, steps, reason }) => ({ principle, pass: false, votes: "2/3 fail", reasons: [reason], dissent: [], steps })),
    ],
  })),
});

test("a principle failing at a step is put under the page the user is on at that step", () => {
  const pages = journeyFindingsByPage({
    replay: replay({ share: [run(["/", "/notes", "/notes/12/share"])] }),
    critique: critique({ share: [{ principle: "next-step", steps: [3], reason: "Nothing says where the link went." }] }),
  });
  assert.deepEqual(pages, [
    { page: "/notes/:id/share", findings: [{ journey: "share", name: "Journey share", step: 3, principle: "next-step", reason: "Nothing says where the link went." }] },
  ]);
});

test("a journey that breaks at a step is put under the page it was on before that step, the page it opened at step 1", () => {
  const pages = journeyFindingsByPage({
    replay: replay({
      share: [run(["/", "/notes"], { width: 390, broken: { step: 3, reason: 'no button "Share" on the screen' } }), run(["/", "/notes", "/notes/12/share"])],
      write: [run(["/write"], { broken: { step: 1, reason: "the page answered 500" } })],
    }),
  });
  assert.deepEqual(pages, [
    { page: "/notes", findings: [{ journey: "share", name: "Journey share", step: 3, reason: 'breaks at 390 px: no button "Share" on the screen', breaks: true }] },
    { page: "/write", findings: [{ journey: "write", name: "Journey write", step: 1, reason: "breaks at 1280 px: the page answered 500", breaks: true }] },
  ]);
});

test("routes of one shape are one page, and a finding seen at two widths is said once", () => {
  const pages = journeyFindingsByPage({
    replay: replay({
      open: [run(["/", "/notes/1"], { width: 390 }), run(["/", "/notes/1"])],
      edit: [run(["/", "/notes/2"])],
    }),
    critique: critique({
      open: [{ principle: "result-shown", steps: [2], reason: "The note opens blank." }],
      edit: [{ principle: "same-words", steps: [2], reason: "The link says Edit, the page Draft." }],
    }),
  });
  assert.equal(pages.length, 1);
  assert.equal(pages[0]!.page, "/notes/:id");
  assert.deepEqual(pages[0]!.findings.map((f) => `${f.journey} ${f.principle}`), ["open result-shown", "edit same-words"]);
});

test("a principle failing with no step named is put under the journey's first page, without a step", () => {
  const [page] = journeyFindingsByPage({
    replay: replay({ open: [run(["/", "/notes"])] }),
    critique: critique({ open: [{ principle: "short", steps: [], reason: "Five steps for one note." }] }),
  });
  assert.deepEqual(page, { page: "/", findings: [{ journey: "open", name: "Journey open", principle: "short", reason: "Five steps for one note." }] });
});

test("each step a principle fails at gets the reason of the voter who pointed at it", () => {
  const report = critique({ send: [{ principle: "next-step", steps: [2, 3], reason: "unused" }] });
  report.pages[0]!.verdicts[1]!.at = [
    { step: 3, reason: "Partir is below the fold." },
    { step: 2, reason: "The recap card covers the slider." },
    { step: 3, reason: "Partir cannot be seen." },
  ];
  const pages = journeyFindingsByPage({ replay: replay({ send: [run(["/", "/send", "/send/confirm"])] }), critique: report });
  assert.deepEqual(pages.map((p) => [p.page, p.findings.map((f) => `${f.step} ${f.reason}`)]), [
    ["/send", ["2 The recap card covers the slider."]],
    ["/send/confirm", ["3 Partir is below the fold."]],
  ]);
});

test("a step with no route, as on a browser error page, is put under the home page, never under a page with no name", () => {
  const pages = journeyFindingsByPage({
    replay: { ...replay({ open: [run(["/", ""])] }), url: "" },
    critique: critique({ open: [{ principle: "no-dead-end", steps: [2], reason: "A browser error." }] }),
  });
  assert.deepEqual(pages.map((p) => p.page), ["/"]);
});

test("a principle failing at the step where the journey breaks goes where the break goes: the page it broke on is an error, not a page of the app", () => {
  const pages = journeyFindingsByPage({
    replay: replay({ help: [run(["/", "/aide"], { broken: { step: 2, reason: "the page answered 500" } })] }),
    critique: critique({ help: [{ principle: "no-dead-end", steps: [2], reason: "Aide leads to a bare error page." }] }),
  });
  assert.deepEqual(pages.map((p) => [p.page, p.findings.map((f) => f.principle ?? "breaks")]), [["/", ["breaks", "no-dead-end"]]]);
});

test("a journey that breaks at one width only keeps its findings on the page the other width reached", () => {
  const pages = journeyFindingsByPage({
    replay: replay({ open: [run(["/", "/orders"], { width: 390, broken: { step: 2, reason: "the page answered 500" } }), run(["/", "/orders/7"])] }),
    critique: critique({ open: [{ principle: "result-shown", steps: [2], reason: "The order shows no total." }] }),
  });
  assert.deepEqual(pages.map((p) => [p.page, p.findings.map((f) => f.principle ?? "breaks")]), [["/", ["breaks"]], ["/orders/:id", ["result-shown"]]]);
});
