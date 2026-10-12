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

test("a journey that breaks at a step is put under the page it was on before that step, the start page at step 1", () => {
  const pages = journeyFindingsByPage({
    replay: replay({
      share: [run(["/", "/notes"], { width: 390, broken: { step: 3, reason: 'no button "Share" on the screen' } }), run(["/", "/notes", "/notes/12/share"])],
      write: [run([], { broken: { step: 1, reason: 'no link "New" on the screen' } })],
    }),
  });
  assert.deepEqual(pages, [
    { page: "/", findings: [{ journey: "write", name: "Journey write", step: 1, reason: 'breaks at 1280 px: no link "New" on the screen', breaks: true }] },
    { page: "/notes", findings: [{ journey: "share", name: "Journey share", step: 3, reason: 'breaks at 390 px: no button "Share" on the screen', breaks: true }] },
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
