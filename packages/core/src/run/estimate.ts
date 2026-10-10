/**
 * What a run costs before it starts: agents, tokens and time, phase by phase.
 * Calibrated on Road to Mastock (8 screens, 4 key journeys, 10 October 2026):
 * six judges took about 840,000 tokens, the judges of the screens 6 to 6.5
 * minutes each, those of the journeys 3 to 4.5; a worker takes about 130,000
 * tokens. Agents of one phase run at once, so a phase lasts as long as its
 * slowest agent, step after step. The tokens are the agents' own: the session
 * that coordinates the run is apart.
 */

export type RunMode = "judge" | "full" | "keep-style";

export interface Phase {
  phase: string;
  agents: number;
  tokens: number;
  minutes: number;
}

export interface Estimate {
  mode: RunMode;
  phases: Phase[];
  total: { agents: number; tokens: number; minutes: number };
}

/** One agent: what it costs in tokens, and how long it takes, in minutes. */
const pageJudge = (screens: number) => ({ tokens: 40_000 + 15_000 * screens, minutes: 1.5 + 0.6 * screens });
const journeyJudge = (journeys: number) => ({ tokens: 40_000 + 20_000 * journeys, minutes: 1 + 0.75 * journeys });
const WORKER = { tokens: 130_000 };
const SHARED_WORKER = { tokens: 150_000 };
const SCREENING_JUDGE = { tokens: 60_000, minutes: 2 };
const DUEL_JUDGE = { tokens: 60_000, minutes: 2 };
const JOURNEY_DUEL_JUDGE = { tokens: 80_000, minutes: 3 };
const MINUTES = { understand: 25, direction: 25, kit: 15, page: 15, promotion: 10, journey: 15, end: 10 };
/** The screens a direction is built on, which the page wave leaves. */
const DIRECTION_SCREENS = 3;
const VOTES = 3;

const NUMBERS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/**
 * The phases of a run and what each costs, at most: the phases after the
 * judges run only when the verdict finds something to redo, the journeys only
 * when a journey fails.
 */
export function estimateRun({ screens, journeys, mode, directions = 6 }: { screens: number; journeys: number; mode: RunMode; directions?: number }): Estimate {
  const pj = pageJudge(screens);
  const jj = journeyJudge(journeys);
  const phases: Phase[] = [
    { phase: "Understand the product", agents: 0, tokens: 0, minutes: MINUTES.understand },
    {
      phase: "Judge the screens and the journeys",
      agents: VOTES + (journeys ? VOTES : 0),
      tokens: VOTES * pj.tokens + (journeys ? VOTES * jj.tokens : 0),
      minutes: Math.max(pj.minutes, journeys ? jj.minutes : 0),
    },
  ];
  if (mode !== "judge") {
    let rebuilt = 0;
    if (mode === "full") {
      const duels = Math.max(directions - 1, 0);
      const rounds = directions > 1 ? Math.ceil(Math.log2(directions)) : 0;
      phases.push({
        phase: `${NUMBERS[directions] ?? directions} direction${directions === 1 ? "" : "s"} and the knockout`,
        agents: directions + VOTES + duels * VOTES,
        tokens: directions * WORKER.tokens + VOTES * SCREENING_JUDGE.tokens + duels * VOTES * DUEL_JUDGE.tokens,
        minutes: MINUTES.direction + SCREENING_JUDGE.minutes + rounds * DUEL_JUDGE.minutes,
      });
      rebuilt = Math.min(DIRECTION_SCREENS, screens);
    } else {
      phases.push({ phase: "The kit, in the app's own style", agents: 1, tokens: SHARED_WORKER.tokens, minutes: MINUTES.kit });
    }
    const pages = Math.max(screens - rebuilt, 0);
    phases.push({
      phase: "The pages",
      agents: pages + 1 + VOTES,
      tokens: (pages + 1) * WORKER.tokens + VOTES * pj.tokens,
      minutes: (pages ? MINUTES.page : 0) + MINUTES.promotion + pj.minutes,
    });
    if (journeys) {
      phases.push({
        phase: "The journeys",
        // Their critique on the new front, one shared worker and one per journey, both versions judged, the duels, the screens measured again.
        agents: VOTES + 1 + journeys + 2 * VOTES + VOTES + VOTES,
        tokens: VOTES * jj.tokens + SHARED_WORKER.tokens + journeys * WORKER.tokens + 2 * VOTES * jj.tokens + VOTES * JOURNEY_DUEL_JUDGE.tokens + VOTES * pj.tokens,
        minutes: jj.minutes + MINUTES.journey + jj.minutes + JOURNEY_DUEL_JUDGE.minutes + pj.minutes,
      });
    }
    phases.push({ phase: "The result page, the standard and the PR", agents: 0, tokens: 0, minutes: MINUTES.end });
  }
  const total = phases.reduce((t, p) => ({ agents: t.agents + p.agents, tokens: t.tokens + p.tokens, minutes: t.minutes + p.minutes }), { agents: 0, tokens: 0, minutes: 0 });
  return { mode, phases, total };
}

const millions = (tokens: number) => `≈ ${(tokens / 1_000_000).toFixed(1)} M tokens`;
const duration = (minutes: number) => {
  const m = Math.round(minutes);
  return m < 60 ? `≈ ${m} min` : `≈ ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

/** The estimate as a table, phase by phase, then what it leaves out. */
export function estimateText(estimate: Estimate, { screens, journeys }: { screens: number; journeys: number }): string {
  const rows = [...estimate.phases.map((p) => ({ ...p, label: p.phase })), { ...estimate.total, label: "Total, at most" }];
  const width = Math.max(...rows.map((r) => r.label.length));
  const agents = (n: number) => (n ? `${n} agent${n === 1 ? "" : "s"}` : "no agent");
  const lines = rows.map((r) => `${r.label.padEnd(width)}  ${agents(r.agents).padStart(9)}  ${(r.tokens ? millions(r.tokens) : "the session").padEnd(16)}  ${duration(r.minutes)}`);
  const notes = [
    ...(estimate.mode === "judge" ? [] : ["The phases after the judges run only when the verdict finds something to redo; the journeys, only when a journey fails."]),
    "Tokens are the agents' own: the session that coordinates the run reads what each one returns, and adds about as much again on a long run.",
  ];
  return `For ${screens} screen${screens === 1 ? "" : "s"} and ${journeys} key journey${journeys === 1 ? "" : "s"}:\n\n${lines.join("\n")}\n\n${notes.join("\n")}`;
}
