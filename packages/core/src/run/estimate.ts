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

export type RunMode = "judge" | "full" | "keep-style" | "ux" | "prompt" | "scratch" | "replug";

export interface Phase {
  phase: string;
  agents: number;
  tokens: number;
  /** The share of those tokens on the session's own model: the direction workers'. */
  sessionTokens?: number;
  minutes: number;
  /** At the API's list prices, the session's share at Opus's. */
  dollars?: number;
}

export interface Estimate {
  mode: RunMode;
  phases: Phase[];
  /** Its dollars include the session that coordinates the run, `coordinator`. */
  total: { agents: number; tokens: number; minutes: number; dollars: number; coordinator: number };
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
const PROMPT_WORKER = { tokens: 80_000, minutes: 6 };
const DUEL_JUDGE = { tokens: 60_000, minutes: 2 };
const JOURNEY_DUEL_JUDGE = { tokens: 80_000, minutes: 3 };
/**
 * Dollars per million tokens counted here, measured with `aeom cost` on the
 * same run of Road to Mastock (8 screens, 4 key journeys, 10 October 2026),
 * at the API's list prices: its agents, general ones all on Opus 5.5, cost
 * $91 for 5.0 M tokens counted, and its session $30. A Sonnet agent costs
 * half an Opus one. AEOM's own agents carry less: at most, then.
 */
const DOLLARS_PER_MILLION = { opus: 18, sonnet: 9, coordinator: 6 };
const dollarsOf = (p: Phase) => ((p.tokens - (p.sessionTokens ?? 0)) * DOLLARS_PER_MILLION.sonnet + (p.sessionTokens ?? 0) * DOLLARS_PER_MILLION.opus) / 1_000_000;
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
    // /aeom directions: the source is the brief, the front as it is, a prompt or a spec. No journey, no judge of a front, no app changed.
    const named = `${NUMBERS[directions] ?? directions} direction${directions === 1 ? "" : "s"}`;
    return withTotal(mode, [
      // The session reads the source and the charter, captures the front when there is one, then writes the workers' briefs.
      { phase: "Read the source", agents: 0, tokens: 0, minutes: 2 },
      { phase: `${named} in mockups, for you to choose`, agents: directions + 1, tokens: directions * PROMPT_WORKER.tokens + SCREENING_JUDGE.tokens, sessionTokens: directions * PROMPT_WORKER.tokens, minutes: PROMPT_WORKER.minutes + SCREENING_JUDGE.minutes },
    ]);
  }
  if (mode === "replug") {
    // A front built from scratch, plugged into its API: one worker on the data module, then the measure.
    const critique = journeys ? VOTES : 0;
    return withTotal(mode, [
      { phase: "Plug the data module into the API", agents: 1, tokens: WORKER.tokens, minutes: MINUTES.page },
      { phase: "Measure the screens and the journeys", agents: VOTES + critique, tokens: VOTES * pj.tokens + critique * jj.tokens, minutes: pj.minutes + (critique ? jj.minutes : 0) },
      { phase: "The result page and the PR", agents: 0, tokens: 0, minutes: MINUTES.end },
    ]);
  }
  if (mode === "scratch") {
    // No front to judge first: the sheet from the source, the directions, the kit, a worker per screen, then the measure.
    const named = `${NUMBERS[directions] ?? directions} direction${directions === 1 ? "" : "s"}`;
    const critique = journeys ? VOTES : 0;
    const built = withTotal(mode, [
      { phase: "Write the product sheet and its journeys", agents: 0, tokens: 0, minutes: 10 },
      autonome
        ? (() => {
            // With nobody to choose: three screening judges, then one judge a duel, three the final.
            const duels = Math.max(directions - 1, 0);
            const duelVotes = duels ? duels - 1 + VOTES : 0;
            const rounds = directions > 1 ? Math.ceil(Math.log2(directions)) : 0;
            return { phase: `${named} and the knockout`, agents: directions + VOTES + duelVotes, tokens: directions * PROMPT_WORKER.tokens + VOTES * SCREENING_JUDGE.tokens + duelVotes * DUEL_JUDGE.tokens, sessionTokens: directions * PROMPT_WORKER.tokens, minutes: PROMPT_WORKER.minutes + SCREENING_JUDGE.minutes + rounds * DUEL_JUDGE.minutes };
          })()
        : { phase: `${named}, for you to choose`, agents: directions + 1, tokens: directions * PROMPT_WORKER.tokens + SCREENING_JUDGE.tokens, sessionTokens: directions * PROMPT_WORKER.tokens, minutes: PROMPT_WORKER.minutes + SCREENING_JUDGE.minutes },
      { phase: "The kit, on the direction chosen", agents: 1, tokens: SHARED_WORKER.tokens, minutes: MINUTES.kit },
      { phase: "The screens of the key journeys", agents: screens, tokens: screens * WORKER.tokens, minutes: MINUTES.page },
      { phase: "Measure the screens and the journeys", agents: VOTES + critique, tokens: VOTES * pj.tokens + critique * jj.tokens, minutes: pj.minutes + (critique ? jj.minutes : 0) },
      { phase: "The standard, the result page and the PR", agents: 0, tokens: 0, minutes: MINUTES.end },
    ]);
    // The screens that fail go back once to their workers, then the measure again.
    const ifBroken = { phase: "If screens go back once", agents: screens + VOTES, tokens: screens * WORKER.tokens + VOTES * pj.tokens, minutes: MINUTES.page + pj.minutes };
    return { ...built, ifBroken: priced(ifBroken) };
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
          sessionTokens: directions * WORKER.tokens,
          minutes: MINUTES.direction + SCREENING_JUDGE.minutes + rounds * DUEL_JUDGE.minutes,
        });
      } else {
        // The person chooses among them: their workers, and one judge who screens out the ugly, the dated and the worse than now.
        phases.push({ phase: `${named}, for you to choose`, agents: directions + 1, tokens: directions * WORKER.tokens + SCREENING_JUDGE.tokens, sessionTokens: directions * WORKER.tokens, minutes: MINUTES.direction + SCREENING_JUDGE.minutes });
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
    return { ...withTotal(mode, phases), ...(ifBroken ? { ifBroken: priced(ifBroken) } : {}) };
  }
  return withTotal(mode, phases);
}

/** A phase with its dollars, the session's share of its work included: it reads what each agent returns. */
const priced = (p: Phase): Phase => ({ ...p, dollars: dollarsOf(p) + (p.tokens * DOLLARS_PER_MILLION.coordinator) / 1_000_000 });

function withTotal(mode: RunMode, phases: Phase[]): Estimate {
  const total = phases.reduce((t, p) => ({ agents: t.agents + p.agents, tokens: t.tokens + p.tokens, minutes: t.minutes + p.minutes }), { agents: 0, tokens: 0, minutes: 0 });
  const coordinator = (total.tokens * DOLLARS_PER_MILLION.coordinator) / 1_000_000;
  const dollars = phases.reduce((t, p) => t + dollarsOf(p), 0) + coordinator;
  return { mode, phases: phases.map((p) => ({ ...p, dollars: dollarsOf(p) })), total: { ...total, dollars, coordinator } };
}

const dollars = (d: number) => `≈ $${d < 9.95 ? d.toFixed(1) : Math.round(d)}`;
const duration = (minutes: number) => {
  const m = Math.round(minutes);
  return m < 60 ? `≈ ${m} min` : `≈ ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

/** The estimate as a table, phase by phase, then what it leaves out. */
export function estimateText(estimate: Estimate, { screens, journeys, widths = DEFAULT_WIDTHS }: { screens: number; journeys: number; widths?: number[] }): string {
  const agents = (n: number) => (n ? `${n} agent${n === 1 ? "" : "s"}` : "no agent");
  // The phases, then the session that coordinates them, which reads what every agent returns, then the total.
  const rows: [string, string, string, string][] = [
    ...estimate.phases.map((p): [string, string, string, string] => [p.phase, agents(p.agents), p.tokens ? dollars(p.dollars ?? 0) : "the session", duration(p.minutes)]),
    ["The session that coordinates", "", dollars(estimate.total.coordinator), "all along"],
    ["Total, at most", agents(estimate.total.agents), dollars(estimate.total.dollars), duration(estimate.total.minutes)],
  ];
  const broken = estimate.ifBroken ? [`${estimate.ifBroken.phase}, at most`, agents(estimate.ifBroken.agents), dollars(estimate.ifBroken.dollars ?? 0), duration(estimate.ifBroken.minutes)] : null;
  const width = Math.max(...rows.map((r) => r[0].length), broken?.[0]!.length ?? 0);
  const row = ([label, who, cost, time]: string[]) => `${label!.padEnd(width)}  ${who!.padStart(9)}  ${cost!.padEnd(11)}  ${time}`.trimEnd();
  const lines = rows.map(row);
  const broken_ = broken ? `\n\n${row(broken)} more` : "";
  const notes = [
    ...(estimate.mode === "judge" || estimate.mode === "prompt" || estimate.mode === "scratch" || estimate.mode === "replug" ? [] : ["The phases after the judges run only when the verdict finds something to redo."]),
    `Dollars at the API's list prices, as aeom cost measured a run of 8 screens and 4 key journeys; the session that coordinates the run is counted at Opus's prices, half on Sonnet. A Claude plan counts the same use its own way. Once the run ends, aeom cost says what it really cost.`,
    estimate.mode === "prompt"
      ? "The direction workers run on the session's own model; the judge, on Sonnet, says what it sees beside each direction and leaves none out."
      : estimate.mode === "judge"
      ? "The judges run on Sonnet."
      : estimate.mode === "full" || estimate.mode === "scratch"
        ? "The judges and the workers run on Sonnet, but for the direction workers, on the session's own model, as the session that coordinates the run."
        : "The judges and the workers run on Sonnet.",
  ];
  // The default widths go unsaid, as everywhere else.
  const at = widths.join(",") === DEFAULT_WIDTHS.join(",") ? "" : `, at ${widths.join(", ")} px`;
  const head = estimate.mode === "prompt" ? `Directions in mockups, two screens each${at}` : estimate.mode === "replug" ? `Plugging the front into its API, ${screens} screen${screens === 1 ? "" : "s"} and ${journeys} key journey${journeys === 1 ? "" : "s"}${at}` : estimate.mode === "scratch" ? `From scratch, ${screens} screen${screens === 1 ? "" : "s"} and ${journeys} key journey${journeys === 1 ? "" : "s"}${at}` : `For ${screens} screen${screens === 1 ? "" : "s"} and ${journeys} key journey${journeys === 1 ? "" : "s"}${at}`;
  return `${head}:\n\n${lines.join("\n")}${broken_}\n\n${notes.join("\n")}`;
}
