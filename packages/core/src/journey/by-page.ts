import { pageShape } from "../capture/shape.js";
import type { JudgeReport } from "../judge/tally.js";
import type { JourneyReport, JourneyRun } from "./replay.js";

/** One thing a journey's critique or replay found, on the page where the user lives it. */
export interface PageJourneyFinding {
  journey: string;
  name: string;
  /** The step where it shows, 1 for the first; absent when the critique named none. */
  step?: number;
  /** The principle that fails; absent when the journey breaks there. */
  principle?: string;
  reason: string;
  /** True when the journey cannot go on from this page. */
  breaks?: true;
  /** The capture of the step, relative to the replay's folder: the widest width that reached it, or where a break stopped. */
  capture?: string;
}

export interface JourneyPage {
  /** The page by its shape, /notes/:id for /notes/12. */
  page: string;
  findings: PageJourneyFinding[];
}

const widest = (runs: JourneyRun[]) => [...runs].sort((a, b) => b.width - a.width);
/** The step at the widest width that got there; a step with no route, as on a browser error page, is not one. */
const stepAt = (runs: JourneyRun[], step: number) => widest(runs).flatMap((r) => r.steps.filter((s) => s.index === step && s.path))[0];
const withCapture = (capture: string | null | undefined) => (capture ? { capture } : {});
/** Where a journey starts when nothing says where: the home page. Step paths carry no base path, so the replay's url gives none. */
const HOME = "/";

/**
 * The findings of the journeys, page by page: a principle that fails at a
 * step goes under the page the user is on at that step, with the reason of
 * the voter who pointed at it; a journey that breaks at a step, under the
 * page it was on before it, or at step 1 the page it opened, and so does a
 * principle failing at that step. So the worker of a page gets the journey
 * findings it can fix.
 */
export function journeyFindingsByPage({ replay, critique }: { replay: JourneyReport; critique?: JudgeReport }): JourneyPage[] {
  const pages = new Map<string, PageJourneyFinding[]>();
  const add = (route: string, finding: PageJourneyFinding) => {
    const page = pageShape(route);
    const findings = pages.get(page) ?? [];
    if (!findings.some((f) => f.journey === finding.journey && f.step === finding.step && f.principle === finding.principle && f.reason === finding.reason)) findings.push(finding);
    pages.set(page, findings);
  };
  for (const journey of replay.journeys) {
    const base = { journey: journey.slug, name: journey.name };
    // A journey breaks at one step for one reason, often at every width: said once, with its widths.
    const breaks = new Map<string, { step: number; reason: string; route: string; capture?: string | null; widths: number[] }>();
    for (const run of [...journey.runs].sort((a, b) => a.width - b.width)) {
      if (!run.broken) continue;
      const { step, reason } = run.broken;
      const key = `${step} ${reason}`;
      // A broken run keeps its failing step: at step 1, the page it opened.
      const route = run.steps.find((s) => s.index === Math.max(step - 1, 1))?.path || HOME;
      const capture = (run.steps.find((s) => s.index === step) ?? run.steps.find((s) => s.index === step - 1))?.capture;
      const known = breaks.get(key);
      if (known) known.widths.push(run.width);
      else breaks.set(key, { step, reason, route, capture, widths: [run.width] });
    }
    for (const b of breaks.values()) add(b.route, { ...base, step: b.step, reason: `breaks at ${b.widths.join(", ")} px: ${b.reason}`, breaks: true, ...withCapture(b.capture) });

    const verdicts = critique?.pages.find((p) => p.page === journey.slug)?.verdicts.filter((v) => !v.pass) ?? [];
    for (const v of verdicts) {
      // Each step with the reason of the first voter who pointed at it; a report from before `at` has the steps alone.
      const at = v.at?.length ? v.at : (v.steps ?? []).map((step) => ({ step, reason: v.reasons[0] ?? "" }));
      if (!at.length) {
        const first = widest(journey.runs)[0]?.screens.find(Boolean) || HOME;
        add(first, { ...base, principle: v.principle, reason: v.reasons[0] ?? "" });
        continue;
      }
      const seen = new Set<number>();
      for (const { step, reason } of [...at].sort((a, b) => a.step - b.step)) {
        if (seen.has(step)) continue;
        seen.add(step);
        // At the step where the journey breaks, the page it lands on is an error, not one of the app's: the finding goes where the break goes.
        // A width that got past this step says the page; one that broke there only has an error page, the break's.
        const reached = stepAt(journey.runs.filter((r) => !(r.broken && r.broken.step === step)), step);
        const broke = [...breaks.values()].find((b) => b.step === step);
        const any = stepAt(journey.runs, step);
        add(reached?.path || broke?.route || any?.path || HOME, { ...base, step, principle: v.principle, reason, ...withCapture(reached?.capture ?? broke?.capture ?? any?.capture) });
      }
    }
  }
  return [...pages].sort(([a], [b]) => a.localeCompare(b)).map(([page, findings]) => ({ page, findings }));
}
