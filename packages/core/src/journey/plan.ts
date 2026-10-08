import type { JourneyReport } from "./replay.js";

/** Who rebuilds what: the screens several journeys cross go to one worker, the others to their journey's worker. */
export interface JourneyWave {
  /** Routes that more than one journey crosses: one worker, first, with the navigation. */
  shared: string[];
  /** For each journey, by slug, the routes only it crosses: its own worker, in parallel. */
  own: Record<string, string[]>;
}

/**
 * Splits the screens the journeys cross so no two workers ever edit the same
 * one: a route crossed by several journeys is shared, the rest belongs to
 * the one journey that crosses it. Every width counts.
 */
export function planJourneyWave(report: JourneyReport): JourneyWave {
  const crossedBy = new Map<string, Set<string>>();
  for (const journey of report.journeys) {
    for (const route of journey.runs.flatMap((r) => r.screens)) {
      const journeys = crossedBy.get(route) ?? new Set<string>();
      journeys.add(journey.slug);
      crossedBy.set(route, journeys);
    }
  }
  const shared = [...crossedBy].filter(([, by]) => by.size > 1).map(([route]) => route).sort();
  const own = Object.fromEntries(report.journeys.map((j) => [j.slug, [...crossedBy].filter(([, by]) => by.size === 1 && by.has(j.slug)).map(([route]) => route).sort()]));
  return { shared, own };
}
