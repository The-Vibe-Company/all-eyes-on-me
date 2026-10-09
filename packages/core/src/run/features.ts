import type { JourneyReport } from "../journey/replay.js";
import type { JudgeReport } from "../judge/tally.js";

/** The journey principles that say a journey does not reach its goal: the user never sees the result, or is left nowhere. */
export const BLOCKING_PRINCIPLES = ["result-shown", "no-dead-end"];

export interface BlockedJourney {
  slug: string;
  name: string;
  /** The step where it blocks. */
  step: number;
  /** That step's capture, relative to the replay's folder. */
  capture: string | null;
  /** What the user lives there: where it breaks, or what the judges saw. */
  why: string;
}

/**
 * The key journeys that do not reach their goal at the end of a run: those that
 * break, and those whose result is not shown or that end in a dead end. At most
 * `limit`, the journeys the product sheet lists first first (its main loop),
 * and how many more there are.
 */
export function blockedJourneys({ replay, critique, order = [], limit = 3 }: { replay: JourneyReport; critique?: JudgeReport; order?: string[]; limit?: number }): { entries: BlockedJourney[]; more: number } {
  const blocked: BlockedJourney[] = [];
  for (const journey of replay.journeys) {
    const widest = [...journey.runs].sort((a, b) => b.width - a.width)[0];
    const brokenRun = [...journey.runs].sort((a, b) => b.width - a.width).find((r) => r.broken);
    const captureAt = (run: typeof widest, step: number) => run?.steps.find((s) => s.index === step)?.capture ?? null;
    if (brokenRun) {
      const { step, reason } = brokenRun.broken!;
      blocked.push({ slug: journey.slug, name: journey.name, step, capture: captureAt(brokenRun, step), why: `breaks at step ${step}: ${reason}` });
      continue;
    }
    const verdict = critique?.pages.find((p) => p.page === journey.slug)?.verdicts.find((v) => !v.pass && BLOCKING_PRINCIPLES.includes(v.principle));
    if (!verdict) continue;
    const step = verdict.steps[0] ?? widest?.counts.steps ?? 1;
    blocked.push({ slug: journey.slug, name: journey.name, step, capture: captureAt(widest, step), why: verdict.reasons[0] ?? verdict.principle });
  }
  const rank = (b: BlockedJourney) => (order.includes(b.name) ? order.indexOf(b.name) : order.length);
  const sorted = blocked.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i).map(({ b }) => b);
  return { entries: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) };
}
