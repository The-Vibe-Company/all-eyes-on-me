import { route } from "../capture/capture.js";
import type { CheckReport } from "../checks/run.js";
import type { JourneyReport } from "../journey/replay.js";
import type { JudgeReport } from "../judge/tally.js";

/** One thing that fails, where it shows. */
export interface Failure {
  kind: "page" | "check" | "principle" | "journey" | "journey-principle";
  /** The screen's route, or the journey's name. */
  where: string;
  what: string;
}

export interface RunVerdict {
  /** What was looked at, so that « nothing to redo » says on what. */
  measured: { screens: number; widths: number[]; checks: number; principles: number; journeys: number; journeyPrinciples: number };
  failures: Failure[];
  /** What a report leaves out that another one has: a verdict on part of the front decides nothing. */
  missing: string[];
  /** True only when every screen and journey was measured and nothing fails. */
  nothingToRedo: boolean;
}

/**
 * Decides whether a front needs redoing, from what AEOM measured: the
 * measurable checks and the judge on every screen, and, when the project
 * has key journeys (`recorded`, their slugs), their replay and their critique.
 */
export function verdictOf({ check, judge, journeys, journeyJudge, recorded = [] }: { check: CheckReport; judge: JudgeReport; journeys?: JourneyReport; journeyJudge?: JudgeReport; recorded?: string[] }): RunVerdict {
  const failures: Failure[] = [];
  const missing: string[] = [];
  // A page that does not load was neither checked nor judged, and is broken for whoever opens it.
  for (const e of check.errors) failures.push({ kind: "page", where: route(e.url), what: `does not load: ${e.reason}` });
  // A check failing at several widths on one screen is one thing to redo, each element named once.
  const byCheck = new Map<string, { where: string; check: string; elements: Set<string> }>();
  for (const f of check.findings) {
    const key = `${route(f.url)} ${f.check}`;
    const entry = byCheck.get(key) ?? { where: route(f.url), check: f.check, elements: new Set<string>() };
    entry.elements.add(f.element ? `${f.element}: ${f.message}` : f.message);
    byCheck.set(key, entry);
  }
  for (const { where, check: name, elements } of byCheck.values()) {
    const [first, ...others] = [...elements];
    failures.push({ kind: "check", where, what: `${name}: ${first}${others.length ? ` (and ${others.length} more)` : ""}` });
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

  const checked = new Set(check.pages.map(route));
  const judged = new Set(judge.pages.map((p) => p.page));
  if (!checked.size) missing.push("no page was checked");
  for (const page of checked) if (!judged.has(page)) missing.push(`${page} was checked but not judged`);
  for (const page of judged) if (!checked.has(page)) missing.push(`${page} was judged but not checked`);
  const replayed = new Set(journeys?.journeys.map((j) => j.slug));
  const critiqued = new Set(journeyJudge?.pages.map((p) => p.page));
  for (const slug of recorded) {
    if (!replayed.has(slug)) missing.push(`the journey ${slug} was not replayed`);
    else if (!critiqued.has(slug)) missing.push(`the journey "${name(slug)}" was not judged`);
  }

  return {
    measured: {
      screens: checked.size,
      widths: check.widths,
      checks: check.checks.length,
      principles: judge.principles.length,
      journeys: recorded.length,
      journeyPrinciples: journeyJudge?.principles.length ?? 0,
    },
    failures,
    missing,
    nothingToRedo: failures.length === 0 && missing.length === 0,
  };
}
