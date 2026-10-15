import { DEFAULT_WIDTHS } from "../capture/capture.js";

/**
 * What a run costs before it starts: agents, tokens and time, phase by phase.
 * Calibrated on Road to Mastock (8 screens, 4 key journeys, 10 October 2026):
 * six judges voting on everything took about 840,000 tokens, the judges of the
 * screens 6 to 6.5 minutes each, those of the journeys 3 to 4.5; a worker
 * takes about 130,000 tokens. Agents of one step run at once, so a step lasts as long as its
 * slowest agent, and a phase as long as its steps one after the other. The
 * tokens are the agents' own: the session that coordinates the run is apart.
 */

export type RunMode = "judge" | "full" | "keep-style" | "ux" | "prompt";

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
  /** The journey wave a run adds only when a journey still breaks after the pages, at most: apart from the total. */
  ifBroken?: Phase;
}

/** One agent: what it costs in tokens, and how long it takes, in minutes. */
/**
 * A judging is one vote on everything first, then two on what it failed, the
 * one after the other: counted here as three voters of the same average cost,
 * the two later ones judging about half as much.
 */
const CONFIRM_SHARE = 0.5;
const staged = ({ tokens, minutes }: { tokens: number; minutes: number }) => ({ tokens: (tokens * (1 + 2 * CONFIRM_SHARE)) / 3, minutes: minutes * (1 + CONFIRM_SHARE) });
/** A judge's share for each screen or journey was measured at two widths, 390 and 1280: it looks at one capture per width. */
const CALIBRATED_WIDTHS = 2;
const fullPageJudge = (screens: number, widths = CALIBRATED_WIDTHS) => ({ tokens: 40_000 + ((15_000 * widths) / CALIBRATED_WIDTHS) * screens, minutes: 1.5 + ((0.6 * widths) / CALIBRATED_WIDTHS) * screens });
const pageJudge = (screens: number, widths?: number) => staged(fullPageJudge(screens, widths));
const journeyJudge = (journeys: number, widths = CALIBRATED_WIDTHS) => staged({ tokens: 40_000 + ((20_000 * widths) / CALIBRATED_WIDTHS) * journeys, minutes: 1 + ((0.75 * widths) / CALIBRATED_WIDTHS) * journeys });
const WORKER = { tokens: 130_000 };
const SHARED_WORKER = { tokens: 150_000 };
const SCREENING_JUDGE = { tokens: 60_000, minutes: 2 };
/** A direction drawn from a prompt: two screens of static HTML and CSS, no worktree, no install, no build. */
const PROMPT_WORKER = { tokens: 80_000, minutes: 5 };
const DUEL_JUDGE = { tokens: 60_000, minutes: 2 };
const JOURNEY_DUEL_JUDGE = { tokens: 80_000, minutes: 3 };
const MINUTES = { understand: 25, direction: 25, kit: 15, page: 15, promotion: 10, journey: 15, end: 10 };
/** The screens a direction is built on, two or three, which the page wave leaves: two, to count at most. */
const DIRECTION_SCREENS = 2;
const VOTES = 3;

const NUMBERS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/**
 * The phases of a run and what each costs, at most: the phases after the
 * judges run only when the verdict finds something to redo. The page workers
 * fix their pages' journey findings too, judged once after them; a journey
 * wave of its own runs only when a journey still breaks, apart from the total.
 * `ux` is `/aeom --ux`: the journeys alone, no direction and no page wave;
 * `/aeom --directions` is a full run with no journey judged.
 */
export function estimateRun({ screens, journeys, mode, directions = 3, autonome = false, widths = CALIBRATED_WIDTHS }: { screens: number; journeys: number; mode: RunMode; directions?: number; autonome?: boolean; widths?: number }): Estimate {
  const pj = pageJudge(screens, widths);
  // The judges of a kept charter compare each page before and after: three full votes.
  const sj = fullPageJudge(screens, widths);
  const jj = journeyJudge(journeys, widths);
  const phases: Phase[] = [
    { phase: "Understand the product", agents: 0, tokens: 0, minutes: MINUTES.understand },
  ];
  if (mode === "prompt") {
    // The prompt is the brief: no understanding phase, no app, no judge of an existing front.
    const named = `${NUMBERS[directions] ?? directions} direction${directions === 1 ? "" : "s"}`;
    return withTotal(mode, [
      { phase: "Read the prompt", agents: 0, tokens: 0, minutes: 1 },
      { phase: `${named} from the prompt, for you to choose`, agents: directions + 1, tokens: directions * PROMPT_WORKER.tokens + SCREENING_JUDGE.tokens, minutes: PROMPT_WORKER.minutes + SCREENING_JUDGE.minutes },
    ]);
  }
  if (mode === "ux") {
    // The journeys judged, then the pages measured before they change, the workers, both versions judged, the duels.
    phases.push({ phase: "Judge the journeys", agents: journeys ? VOTES : 0, tokens: journeys ? VOTES * jj.tokens : 0, minutes: journeys ? jj.minutes : 0 });
    if (journeys)
      phases.push({
        phase: "The journeys",
        agents: VOTES + 1 + journeys + 2 * VOTES + VOTES,
        tokens: VOTES * pj.tokens + SHARED_WORKER.tokens + journeys * WORKER.tokens + 2 * VOTES * jj.tokens + VOTES * JOURNEY_DUEL_JUDGE.tokens,
        minutes: pj.minutes + MINUTES.journey + jj.minutes + JOURNEY_DUEL_JUDGE.minutes,
      });
    phases.push({ phase: "The result page, the standard and the PR", agents: 0, tokens: 0, minutes: MINUTES.end });
    return withTotal(mode, phases);
  }
  // The journeys are judged first, then the screens, after a reset: one after the other.
  phases.push({
    phase: journeys ? "Judge the screens and the journeys" : "Judge the screens",
    agents: VOTES + (journeys ? VOTES : 0),
    tokens: VOTES * pj.tokens + (journeys ? VOTES * jj.tokens : 0),
    minutes: pj.minutes + (journeys ? jj.minutes : 0),
  });
  if (mode !== "judge") {
    let rebuilt = 0;
    if (mode === "full") {
      const named = `${NUMBERS[directions] ?? directions} direction${directions === 1 ? "" : "s"}`;
      if (autonome) {
        const duels = Math.max(directions - 1, 0);
        const rounds = directions > 1 ? Math.ceil(Math.log2(directions)) : 0;
        const duelVotes = duels ? duels - 1 + VOTES : 0;
        phases.push({
          phase: `${named} and the knockout`,
          // With nobody to choose, the judges do: the screening, then one judge decides a duel, three the final.
          agents: directions + VOTES + duelVotes,
          tokens: directions * WORKER.tokens + VOTES * SCREENING_JUDGE.tokens + duelVotes * DUEL_JUDGE.tokens,
          minutes: MINUTES.direction + SCREENING_JUDGE.minutes + rounds * DUEL_JUDGE.minutes,
        });
      } else {
        // The person chooses among them: their workers, and one judge who screens out the ugly, the dated and the worse than now.
        phases.push({ phase: `${named}, for you to choose`, agents: directions + 1, tokens: directions * WORKER.tokens + SCREENING_JUDGE.tokens, minutes: MINUTES.direction + SCREENING_JUDGE.minutes });
      }
      rebuilt = Math.min(DIRECTION_SCREENS, screens);
    } else {
      phases.push({ phase: "The kit, in the app's own style", agents: 1, tokens: SHARED_WORKER.tokens, minutes: MINUTES.kit });
    }
    const pages = Math.max(screens - rebuilt, 0);
    // The page workers, who fix their pages' journey findings too (the screens a direction rebuilt join when journey
    // findings fall on them: at most, all of them), the one who promotes their kit candidates, the screens measured,
    // the journeys judged once; with the style kept, the charter judged.
    const joining = journeys ? rebuilt : 0;
    const workers = pages + joining ? pages + joining + 1 : 0;
    const style = mode === "keep-style" ? VOTES : 0;
    const critique = journeys ? VOTES : 0;
    // Before the wave, one vote on every page as the kit left it: a page where nothing fails any more gets no worker.
    const look = workers ? 1 : 0;
    const vote = fullPageJudge(screens, widths);
    phases.push({
      phase: journeys ? "The pages and their journeys" : "The pages",
      agents: look + workers + VOTES + critique + style,
      tokens: look * vote.tokens + workers * WORKER.tokens + VOTES * pj.tokens + critique * jj.tokens + style * sj.tokens,
      minutes: (look ? vote.minutes : 0) + (pages ? MINUTES.page + MINUTES.promotion : 0) + pj.minutes + (critique ? jj.minutes : 0) + (style ? sj.minutes : 0),
    });
    phases.push({ phase: "The result page, the standard and the PR", agents: 0, tokens: 0, minutes: MINUTES.end });
    // A journey that still breaks: one worker per journey and a shared one, the journeys judged again, the screens measured again. No duel: the critiques decide.
    const ifBroken = journeys
      ? {
          phase: "If a journey still breaks after the pages",
          agents: journeys + 1 + VOTES + VOTES + style,
          tokens: journeys * WORKER.tokens + SHARED_WORKER.tokens + VOTES * jj.tokens + VOTES * pj.tokens + style * sj.tokens,
          minutes: MINUTES.journey + jj.minutes + pj.minutes + (style ? sj.minutes : 0),
        }
      : undefined;
    return { ...withTotal(mode, phases), ...(ifBroken ? { ifBroken } : {}) };
  }
  return withTotal(mode, phases);
}

function withTotal(mode: RunMode, phases: Phase[]): Estimate {
  const total = phases.reduce((t, p) => ({ agents: t.agents + p.agents, tokens: t.tokens + p.tokens, minutes: t.minutes + p.minutes }), { agents: 0, tokens: 0, minutes: 0 });
  return { mode, phases, total };
}

const millions = (tokens: number) => `≈ ${(tokens / 1_000_000).toFixed(1)} M tokens`;
const duration = (minutes: number) => {
  const m = Math.round(minutes);
  return m < 60 ? `≈ ${m} min` : `≈ ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

/** The estimate as a table, phase by phase, then what it leaves out. */
export function estimateText(estimate: Estimate, { screens, journeys, widths = DEFAULT_WIDTHS }: { screens: number; journeys: number; widths?: number[] }): string {
  const rows = [...estimate.phases.map((p) => ({ ...p, label: p.phase })), { ...estimate.total, label: "Total, at most" }];
  const brokenLabel = estimate.ifBroken ? `${estimate.ifBroken.phase}, at most` : "";
  const width = Math.max(...rows.map((r) => r.label.length), brokenLabel.length);
  const agents = (n: number) => (n ? `${n} agent${n === 1 ? "" : "s"}` : "no agent");
  const row = (r: { label: string; agents: number; tokens: number; minutes: number }, label = r.label.padEnd(width)) => `${label}  ${agents(r.agents).padStart(9)}  ${(r.tokens ? millions(r.tokens) : "the session").padEnd(16)}  ${duration(r.minutes)}`;
  const lines = rows.map((r) => row(r));
  const broken = estimate.ifBroken ? `\n\n${row({ ...estimate.ifBroken, label: brokenLabel })} more` : "";
  const notes = [
    ...(estimate.mode === "judge" || estimate.mode === "prompt" ? [] : ["The phases after the judges run only when the verdict finds something to redo."]),
    "Tokens are the agents' own: the session that coordinates the run reads what each one returns, and adds about as much again on a long run.",
    estimate.mode === "prompt"
      ? "The direction workers run on the session's own model, the judge on Sonnet."
      : estimate.mode === "judge"
      ? "The judges run on Sonnet."
      : estimate.mode === "full"
        ? "The judges and the workers run on Sonnet, but for the direction workers, on the session's own model, as the session that coordinates the run."
        : "The judges and the workers run on Sonnet.",
  ];
  // The default widths go unsaid, as everywhere else.
  const at = widths.join(",") === DEFAULT_WIDTHS.join(",") ? "" : `, at ${widths.join(", ")} px`;
  const head = estimate.mode === "prompt" ? `From a prompt, two screens for each direction${at}` : `For ${screens} screen${screens === 1 ? "" : "s"} and ${journeys} key journey${journeys === 1 ? "" : "s"}${at}`;
  return `${head}:\n\n${lines.join("\n")}${broken}\n\n${notes.join("\n")}`;
}
