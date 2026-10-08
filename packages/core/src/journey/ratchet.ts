import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JudgeReport } from "../judge/tally.js";
import type { GuardResult } from "./guard.js";
import type { JourneyReport, JourneyRun } from "./replay.js";

/** One judge's choice, for each journey, between its old version and its new one. */
export interface JourneyDuelVote {
  voter: string;
  journeys: Record<string, { winner: "before" | "after"; reason: string }>;
}

export interface JourneyDuel {
  winner: "before" | "after";
  /** Such as `2/3 prefer the new one`. */
  votes: string;
  /** The reasons of the winning side. */
  reasons: string[];
}

/** Some duel votes cannot be counted. The message lists every problem. */
export class DuelVoteError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
    this.name = "DuelVoteError";
  }
}

/** Reads every `.json` file of `dir` as one judge's duel votes. */
export async function readDuelVotes(dir: string): Promise<JourneyDuelVote[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const votes: JourneyDuelVote[] = [];
  const problems: string[] = [];
  for (const file of files) {
    try {
      votes.push(JSON.parse(await readFile(join(dir, file), "utf8")) as JourneyDuelVote);
    } catch (error) {
      problems.push(`${file}: ${error instanceof SyntaxError ? "not valid JSON" : String(error)}`);
    }
  }
  if (problems.length) throw new DuelVoteError(problems);
  return votes;
}

/**
 * Counts, journey by journey, which version the judges prefer. The new one
 * wins only with strictly more votes than the old one: a tie keeps the old.
 * Refuses anything but exactly `voters` votes, each with a winner and a
 * reason for every journey.
 */
export function tallyDuels(votes: JourneyDuelVote[], journeys: string[], { voters = 3 } = {}): Map<string, JourneyDuel> {
  const problems: string[] = [];
  if (votes.length !== voters) problems.push(`expected ${voters} votes, found ${votes.length}`);
  for (const vote of votes) {
    for (const slug of journeys) {
      const choice = vote.journeys?.[slug];
      if (!choice || (choice.winner !== "before" && choice.winner !== "after")) problems.push(`voter ${vote.voter}: no winner for ${slug}, "before" or "after"`);
      else if (typeof choice.reason !== "string" || !choice.reason.trim()) problems.push(`voter ${vote.voter}: no reason for ${slug}`);
    }
  }
  if (problems.length) throw new DuelVoteError(problems);
  return new Map(
    journeys.map((slug) => {
      const cast = votes.map((v) => v.journeys[slug]!);
      const forNew = cast.filter((c) => c.winner === "after").length;
      const winner = forNew > cast.length - forNew ? "after" : "before";
      const side = winner === "after" ? forNew : cast.length - forNew;
      return [slug, { winner, votes: `${side}/${cast.length} prefer the ${winner === "after" ? "new" : "old"} one`, reasons: cast.filter((c) => c.winner === winner).map((c) => c.reason) }];
    }),
  );
}

export interface RatchetVerdict {
  slug: string;
  name: string;
  /** True when the new version stays; false when the old one comes back. */
  kept: boolean;
  /** Why it comes back, or why it stays. */
  why: string;
  /** Steps at the widest width, before and after. */
  steps: { before: number; after: number };
  /** Principles that failed before and pass now, by the critique redone on the new version. */
  cleared: string[];
  /** Principles that still fail on the new version. */
  remaining: string[];
}

const widest = (runs: JourneyRun[]) => runs.reduce((a, b) => (b.width > a.width ? b : a));
const failing = (verdict: JudgeReport | undefined, slug: string) => verdict?.pages.find((p) => p.page === slug)?.verdicts.filter((v) => !v.pass).map((v) => v.principle) ?? [];

/**
 * Decides, journey by journey, whether the new version stays. It stays only
 * if it goes to its end wherever the old one did, the guard refuses nothing
 * it did, and the judges prefer it. A finding is cleared only when the
 * critique, redone on the new version, no longer finds it.
 */
export function ratchetJourneys({ before, after, beforeVerdict, afterVerdict, duels, guard }: { before: JourneyReport; after: JourneyReport; beforeVerdict?: JudgeReport; afterVerdict?: JudgeReport; duels: Map<string, JourneyDuel>; guard?: GuardResult }): RatchetVerdict[] {
  const runRefused = guard?.refused.filter((v) => !v.journey) ?? [];
  return after.journeys
    .filter((j) => before.journeys.some((b) => b.slug === j.slug))
    .map((journey) => {
      const old = before.journeys.find((b) => b.slug === journey.slug)!;
      const steps = { before: widest(old.runs).counts.steps, after: widest(journey.runs).counts.steps };
      const cleared = failing(beforeVerdict, journey.slug).filter((p) => !failing(afterVerdict, journey.slug).includes(p));
      const remaining = failing(afterVerdict, journey.slug);
      const verdict = (kept: boolean, why: string): RatchetVerdict => ({ slug: journey.slug, name: journey.name, kept, why, steps, ...(kept ? { cleared, remaining } : { cleared: [], remaining: failing(beforeVerdict, journey.slug) }) });

      const breaks = journey.runs.find((r) => r.broken && !old.runs.find((o) => o.width === r.width)?.broken);
      if (breaks) return verdict(false, `breaks at step ${breaks.broken!.step} at ${breaks.width} px: ${breaks.broken!.reason}`);
      const refused = [...(guard?.refused.filter((v) => v.journey === journey.name) ?? []), ...runRefused];
      if (refused.length) return verdict(false, `the guard refuses ${refused.map((v) => `${v.what} (${v.why})`).join(", ")}`);
      const duel = duels.get(journey.slug);
      if (!duel) return verdict(false, "no judge compared the two versions");
      if (duel.winner === "before") return verdict(false, `the judges prefer the old one (${duel.votes}): ${duel.reasons[0]}`);
      return verdict(true, `${duel.votes}: ${duel.reasons[0]}`);
    });
}
