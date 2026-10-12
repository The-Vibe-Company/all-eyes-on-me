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
}

export interface JourneyPage {
  /** The page by its shape, /notes/:id for /notes/12. */
  page: string;
  findings: PageJourneyFinding[];
}

const widest = (runs: JourneyRun[]) => [...runs].sort((a, b) => b.width - a.width);
/** The route the user is on after `step`, at the widest width that got there. */
const routeAfter = (runs: JourneyRun[], step: number) => widest(runs).flatMap((r) => r.steps.filter((s) => s.index === step))[0]?.path;

/**
 * The findings of the journeys, page by page: a principle that fails at a
 * step goes under the page the user is on at that step; a journey that
 * breaks at a step, under the page it was on before it, the start page at
 * step 1. So the worker of a page gets the journey findings it can fix.
 */
export function journeyFindingsByPage({ replay, critique }: { replay: JourneyReport; critique?: JudgeReport }): JourneyPage[] {
  const start = new URL(replay.url).pathname;
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
    const breaks = new Map<string, { step: number; reason: string; route: string; widths: number[] }>();
    for (const run of [...journey.runs].sort((a, b) => a.width - b.width)) {
      if (!run.broken) continue;
      const { step, reason } = run.broken;
      const key = `${step} ${reason}`;
      const route = (step > 1 ? run.steps.find((s) => s.index === step - 1)?.path : undefined) ?? start;
      const known = breaks.get(key);
      if (known) known.widths.push(run.width);
      else breaks.set(key, { step, reason, route, widths: [run.width] });
    }
    for (const b of breaks.values()) add(b.route, { ...base, step: b.step, reason: `breaks at ${b.widths.join(", ")} px: ${b.reason}`, breaks: true });

    const verdicts = critique?.pages.find((p) => p.page === journey.slug)?.verdicts.filter((v) => !v.pass) ?? [];
    for (const v of verdicts) {
      const reason = v.reasons[0] ?? "";
      if (!v.steps.length) {
        const first = widest(journey.runs)[0]?.screens[0] ?? start;
        add(first, { ...base, principle: v.principle, reason });
        continue;
      }
      for (const step of v.steps) add(routeAfter(journey.runs, step) ?? start, { ...base, step, principle: v.principle, reason });
    }
  }
  return [...pages].sort(([a], [b]) => a.localeCompare(b)).map(([page, findings]) => ({ page, findings }));
}
