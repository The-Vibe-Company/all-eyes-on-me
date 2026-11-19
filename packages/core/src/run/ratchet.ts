import { pageShape } from "../capture/shape.js";
import { journeyFindingsByPage } from "../journey/by-page.js";
import type { RatchetVerdict } from "../journey/ratchet.js";
import type { Step } from "../journey/journey.js";
import type { JourneyReport } from "../journey/replay.js";
import type { JudgeReport } from "../judge/tally.js";
import type { PageComparison } from "./compare.js";

/** A page worker of the screen wave, and the page it rebuilt, as `aeom run agent --page` marked it. */
export interface PageWorker {
  name: string;
  page: string;
}

/** What the journeys say after the wave: their ratchet, both replays and both critiques. */
export interface JourneyEvidence {
  ratchet: RatchetVerdict[];
  /** The replay after the wave, `journeys-after`. */
  replay: JourneyReport;
  /** The replay before the run, `journeys-before`. */
  replayBefore: JourneyReport;
  critique?: JudgeReport;
  critiqueBefore?: JudgeReport;
}

export interface PageDecision {
  page: string;
  /** What the comparison said of it; `not measured` for a page only a journey names. */
  verdict: PageComparison["verdict"] | "not measured";
  /** True when the page goes back as it was before the screen wave. */
  back: boolean;
  why: string;
  /** The page workers that rebuilt it, by name. */
  workers: string[];
}

const same = (a: string, b: string) => pageShape(a) === pageShape(b);
const failing = (critique: JudgeReport | undefined, slug: string) => new Set(critique?.pages.find((p) => p.page === slug)?.verdicts.filter((v) => !v.pass).map((v) => v.principle) ?? []);
const passing = (critique: JudgeReport | undefined, slug: string) => new Set(critique?.pages.find((p) => p.page === slug)?.verdicts.filter((v) => v.pass).map((v) => v.principle) ?? []);
const crosses = (replay: JourneyReport, slug: string, page: string) =>
  replay.journeys.find((j) => j.slug === slug)?.runs.some((run) => run.screens.some((s) => same(s, page)) || run.steps.some((s) => s.path && same(s.path, page))) ?? false;
const counts = (c: PageComparison) => `${c.before?.total ?? "-"} → ${c.after?.total ?? "-"} failing`;

/** Why a page that is not better comes back, by what the comparison said of it. */
function notBetter(c: PageComparison): string {
  const lost = c.lost?.length ? `; it lost ${c.lost.join(", ")}` : "";
  if (c.verdict === "missing") return `missing after the wave${lost}`;
  return `${c.verdict === "worse" ? "worse" : "the same as before"}: ${counts(c)}${lost}`;
}

/**
 * Where each journey the ratchet sent back now goes wrong, page by page: the
 * page it breaks from where it did not break before, or broke later, and the
 * pages where its critique fails a principle that passed before. A journey
 * that comes back for another reason, such as the guard, holds no page.
 */
function blame(journeys: JourneyEvidence): { pages: Map<string, string[]>; unexplained: RatchetVerdict[] } {
  const pages = new Map<string, string[]>();
  const unexplained: RatchetVerdict[] = [];
  const findings = journeyFindingsByPage({ replay: journeys.replay, ...(journeys.critique ? { critique: journeys.critique } : {}) });
  for (const v of journeys.ratchet.filter((j) => !j.kept && !j.unchanged)) {
    const now = journeys.replay.journeys.find((j) => j.slug === v.slug);
    const was = journeys.replayBefore.journeys.find((j) => j.slug === v.slug);
    const newBreaks = new Set(
      (now?.runs ?? []).flatMap((r) => {
        const old = was?.runs.find((o) => o.width === r.width)?.broken;
        return r.broken && (!old || r.broken.step < old.step) ? [r.broken.step] : [];
      }),
    );
    const before = passing(journeys.critiqueBefore, v.slug);
    const fresh = [...failing(journeys.critique, v.slug)].filter((p) => before.has(p));
    let held = false;
    for (const { page, findings: found } of findings) {
      for (const f of found.filter((f) => f.journey === v.slug)) {
        const reason = f.breaks && f.step !== undefined && newBreaks.has(f.step) ? `breaks here at step ${f.step}` : f.principle && fresh.includes(f.principle) ? `fails here what passed before: ${f.principle}` : null;
        if (!reason) continue;
        held = true;
        const said = `the journey "${v.name}", sent back, ${reason}`;
        if (!(pages.get(page) ?? []).includes(said)) pages.set(page, [...(pages.get(page) ?? []), said]);
      }
    }
    if (!held) unexplained.push(v);
  }
  return { pages, unexplained };
}

/**
 * Section 5's ratchet of the pages, page by page. A page that got better
 * stays. Any other goes back as it was before the screen wave, unless no
 * worker touched it (`no-worker.json`), no page worker rebuilt it (nothing to
 * put back), or a journey the ratchet kept crosses it. A page where a journey
 * the ratchet sent back now breaks, or fails what passed before, goes back
 * even when it got better, and so does a page the run sends back itself
 * (`back`, its reason by its route). What no page can answer is said in
 * `toLook`.
 */
export function decidePages({ comparison, noWorker = [], workers, journeys, back = {} }: { comparison: PageComparison[]; noWorker?: string[]; workers: PageWorker[]; journeys?: JourneyEvidence | null; back?: Record<string, string> }): { pages: PageDecision[]; toLook: string[] } {
  const toLook: string[] = [];
  const blamed = journeys ? blame(journeys) : { pages: new Map<string, string[]>(), unexplained: [] };
  for (const v of blamed.unexplained) toLook.push(`the journey "${v.name}" comes back for a reason no page holds: ${v.why}`);
  const workersOf = (page: string) => workers.filter((w) => same(w.page, page)).map((w) => w.name);
  const blamedOn = (page: string) => [...blamed.pages].filter(([p]) => same(p, page)).flatMap(([, said]) => said);
  const forced = (page: string) => Object.entries(back).find(([p]) => same(p, page))?.[1];
  const kept = journeys ? journeys.ratchet.filter((v) => v.kept) : [];

  const pages = comparison.map((c): PageDecision => {
    const names = workersOf(c.page);
    const decision = (isBack: boolean, why: string): PageDecision => ({ page: c.page, verdict: c.verdict, back: isBack, why, workers: names });
    const sendBack = (why: string) => {
      if (names.length) return decision(true, why);
      toLook.push(`${why.replace(/ here /, ` on ${c.page} `)}, which no page worker rebuilt: the kit's or the direction's, which putting a page back cannot undo`);
      return decision(false, `${why}, but no page worker rebuilt it: nothing to put back`);
    };
    const why = forced(c.page);
    if (why !== undefined) return sendBack(`sent back by the run: ${why || "an action it let its users do is gone"}`);
    const said = blamedOn(c.page);
    if (said.length) return sendBack(said.join("; "));
    if (c.verdict === "better") return decision(false, `better: ${counts(c)}`);
    if (c.verdict === "new") return decision(false, "a new page: nothing to compare it with");
    if (noWorker.some((p) => same(p, c.page))) return decision(false, `${notBetter(c)}, but no worker touched it (no-worker.json)`);
    if (!names.length) return decision(false, `no page worker rebuilt it: nothing to put back${c.verdict === "worse" || c.verdict === "missing" ? "; the kit made it worse, and putting the page back cannot undo the kit" : ""}`);
    const crossing = kept.find((v) => journeys && crosses(journeys.replay, v.slug, c.page));
    if (crossing) return decision(false, `${notBetter(c)}, but the journey "${crossing.name}" crosses it, and its ratchet kept it`);
    return decision(true, notBetter(c));
  });

  // A page only a journey names, never captured: it goes back when a worker rebuilt it, otherwise it is said.
  for (const [page, said] of blamed.pages) {
    if (comparison.some((c) => same(c.page, page))) continue;
    const names = workersOf(page);
    if (names.length) pages.push({ page, verdict: "not measured", back: true, why: said.join("; "), workers: names });
    else for (const s of said) toLook.push(`${s.replace(/ here /, ` on ${page} `)}, which no page worker rebuilt: the kit's or the direction's, which putting a page back cannot undo`);
  }
  return { pages, toLook };
}

/** A journey file the run rewrote during the wave: its steps when the wave started and on the run branch now, null when it had none. */
export interface RewrittenJourney {
  slug: string;
  before: Step[] | null;
  after: Step[] | null;
}

/**
 * The journey files rewritten during the wave that go back with the pages put
 * back. The steps that changed are found by what the two versions share at
 * their start and at their end; each acts on the page the user is on before
 * it, as the replay after the wave walked the new file, or the page an
 * `open` step opens. A file whose changed steps all act on pages put back
 * goes back; one whose changed steps act on no page put back stays; one that
 * mixes both, or that no replay places, is said, to put back by hand.
 */
export function journeyFilesBack({ pages, changed, replay }: { pages: PageDecision[]; changed: RewrittenJourney[]; replay: JourneyReport | null }): { back: string[]; toLook: string[] } {
  const back: string[] = [];
  const toLook: string[] = [];
  const goesBack = (page: string) => pages.some((p) => p.back && same(p.page, page));
  for (const { slug, before, after } of changed) {
    const file = `.aeom/journeys/${slug}.json`;
    const runs = replay?.journeys.find((j) => j.slug === slug)?.runs;
    if (!before || !after) {
      toLook.push(`${file} was ${before ? "removed" : "added"} in the wave, or holds no steps: put it back by hand if it was for a page put back`);
      continue;
    }
    if (!runs) {
      toLook.push(`${file} was rewritten in the wave and no replay of it says on which pages: put it back by hand if it was rewritten for a page put back`);
      continue;
    }
    const key = (step: Step | undefined) => JSON.stringify(step);
    let start = 0;
    while (start < before.length && start < after.length && key(before[start]) === key(after[start])) start++;
    let end = 0;
    while (end < before.length - start && end < after.length - start && key(before[before.length - 1 - end]) === key(after[after.length - 1 - end])) end++;
    // The steps of the new file that changed; none when steps were only taken out, then the step that follows them.
    const indexes = after.length - end > start ? Array.from({ length: after.length - end - start }, (_, i) => start + i) : [start];
    // The page a step acts on: the one an open step opens, or the one the previous step landed on, at the widest width that got there.
    const actsOn = (i: number) => {
      const step = after[i];
      if (step?.do === "open") return step.path;
      return [...runs].sort((a, b) => b.width - a.width).flatMap((r) => r.steps.filter((s) => s.index === i && s.path))[0]?.path ?? null;
    };
    const on = indexes.map(actsOn);
    if (on.some((p) => p === null)) {
      toLook.push(`${file} was rewritten in the wave at a step its replay never reached: put it back by hand if it was rewritten for a page put back`);
      continue;
    }
    const shapes = [...new Set((on as string[]).map(pageShape))];
    const going = shapes.filter(goesBack);
    const staying = shapes.filter((p) => !goesBack(p));
    if (!going.length) continue;
    if (staying.length) toLook.push(`${file} was rewritten in the wave for ${going.join(", ")}, put back, and ${staying.join(", ")}, kept: put back only the steps of ${going.join(", ")} by hand`);
    else back.push(slug);
  }
  return { back, toLook };
}
