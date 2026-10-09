import { route } from "../capture/capture.js";
import type { CheckReport } from "../checks/run.js";
import type { JourneyReport } from "../journey/replay.js";
import type { JudgeReport } from "../judge/tally.js";

/** One thing that fails, where it shows. */
export interface Failure {
  kind: "check" | "principle" | "journey" | "journey-principle";
  /** The screen's route, or the journey's name. */
  where: string;
  what: string;
}

export interface RunVerdict {
  /** What was looked at, so that « nothing to redo » says on what. */
  measured: { screens: number; widths: number[]; checks: number; principles: number; journeys: number; journeyPrinciples: number };
  failures: Failure[];
  /** True only when nothing fails: no check, no principle, no journey that breaks or fails a principle. */
  nothingToRedo: boolean;
}

/**
 * Decides whether a front needs redoing, from what AEOM measured: the
 * measurable checks and the judge on every screen, and, when the project
 * has key journeys, their replay and their critique.
 */
export function verdictOf({ check, judge, journeys, journeyJudge }: { check: CheckReport; judge: JudgeReport; journeys?: JourneyReport; journeyJudge?: JudgeReport }): RunVerdict {
  const failures: Failure[] = [];
  // A check failing at several widths on one screen is one thing to redo.
  const seen = new Set<string>();
  for (const f of check.findings) {
    const key = `${route(f.url)} ${f.check}`;
    if (seen.has(key)) continue;
    seen.add(key);
    failures.push({ kind: "check", where: route(f.url), what: `${f.check}: ${f.message}` });
  }
  for (const page of judge.pages) {
    for (const v of page.verdicts.filter((v) => !v.pass)) failures.push({ kind: "principle", where: page.page, what: `${v.principle}: ${v.reasons[0] ?? ""}` });
  }
  const name = (slug: string) => journeys?.journeys.find((j) => j.slug === slug)?.name ?? slug;
  for (const journey of journeys?.journeys ?? []) {
    const ways = new Set<string>();
    for (const run of journey.runs.filter((r) => r.broken)) {
      const what = `breaks at step ${run.broken!.step} at ${run.width} px: ${run.broken!.reason}`;
      const way = `${run.broken!.step} ${run.broken!.reason}`;
      if (!ways.has(way)) failures.push({ kind: "journey", where: journey.name, what });
      ways.add(way);
    }
  }
  for (const page of journeyJudge?.pages ?? []) {
    for (const v of page.verdicts.filter((v) => !v.pass)) failures.push({ kind: "journey-principle", where: name(page.page), what: `${v.principle}: ${v.reasons[0] ?? ""}` });
  }
  return {
    measured: {
      screens: new Set([...check.pages.map(route), ...judge.pages.map((p) => p.page)]).size,
      widths: check.widths,
      checks: check.checks.length,
      principles: judge.principles.length,
      journeys: journeys?.journeys.length ?? 0,
      journeyPrinciples: journeyJudge?.principles.length ?? 0,
    },
    failures,
    nothingToRedo: failures.length === 0,
  };
}
