import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CaptureManifest } from "../capture/capture.js";
import type { CheckReport } from "../checks/run.js";
import { applied, champion, type Tournament } from "../directions/tournament.js";
import { pairRoutes } from "../capture/shape.js";
import type { JourneyReport } from "../journey/replay.js";
import type { RatchetVerdict } from "../journey/ratchet.js";
import type { JudgeReport } from "../judge/tally.js";
import { DEFAULT_WIDTHS, route, usableWidths } from "../capture/capture.js";
import { comparePages, scorePages } from "./compare.js";
import { blockedJourneys } from "./features.js";
import type { FeedbackCategory } from "./taste.js";
import { STYLE_CHECKS, STYLE_PRINCIPLES, verdictOf, type Failure } from "./verdict.js";

/** What `aeom verdict --out` keeps of a verdict. */
export interface SavedVerdict {
  nothingToRedo: boolean;
  /** The line saying what was measured. */
  line: string;
  failures: Failure[];
  keepStyle?: boolean;
  /** What the product sheet accepted, and who judged: absent in a verdict saved before they were kept. */
  accepted?: Failure[];
  judges?: { models: string[]; principles: string };
}

export interface ResultPage {
  run: string;
  verdict: SavedVerdict | null;
  /** The direction the run applied, when it built directions: `decision` when the person decided at the checkpoint. */
  direction: {
    champion: string;
    sentence: string | null;
    entrants: string[];
    reasons: string[];
    sheet: string | null;
    decision?: { judges: string | null; dropped: string[]; why?: string };
  } | null;
  screens: {
    page: string;
    status: "kept" | "sent back" | "new" | "missing" | "unchanged" | "does not load";
    /** What fails on it, before the run and at the end, when both were measured. */
    count: { before: number; after: number } | null;
    /** Why the page wave sent it back: as many failing as before, or more, counted on the version it put back. */
    back?: { verdict: "same" | "worse"; before: number | null; after: number | null; lost?: string[] };
    /** True when the kit fixed it alone: nothing failed on it after the kit, so no worker touched it. */
    byKit?: true;
    widths: { width: number; before: string | null; after: string | null }[];
    cleared: string[];
    still: string[];
    newly: string[];
  }[];
  journeys: {
    slug: string;
    name: string;
    status: "kept" | "sent back" | "unchanged" | "new";
    why: string | null;
    /** Where it broke, before the run and at the end. */
    broke: { before: string | null; after: string | null };
    steps: { before: number | null; after: number | null };
    widths: { width: number; before: string | null; after: string | null }[];
    cleared: string[];
    remaining: string[];
  }[];
  stillFailing: Failure[];
  /** Every round of directions the run drew, the last first: the front as it is, each direction with its capture, its sentence, its comparison and its checks, and the choice. */
  rounds?: {
    round: number;
    now: string | null;
    entrants: { slug: string; note?: string; image: string | null; compare?: { strong: string; weak: string; fit: string }; checks?: string[] | null }[];
    start?: { slug: string; why: string };
    decision?: { applied: string; why?: string };
  }[];
  /** What the product sheet accepts, by the person's choice or the spec's: said apart, never redone. */
  accepted?: Failure[];
  /** Who judged the last measure, and on which principles. */
  judges?: { models: string[]; principles: string };
  /** False when the run stopped before measuring its end: what still fails is then what failed before. */
  measuredAfter: boolean;
  /** The widths the run measured, and those of the default it left out, as the config or the run declared. */
  widths?: { measured: number[]; leftOut: number[] };
  /** True for a run that built a front from nothing (`/aeom build --from-scratch`): no before, every screen and journey new. */
  built?: boolean;
  /** The API the front reads, when one was given: its base, from the run's `api` file. */
  api?: string;
  /** True for a run that plugged an existing front into its API (`/aeom build --api`): its screens did not change. */
  replug?: boolean;
  /** What blocked journeys would need, named by `aeom features`, never built. */
  features: { entries: { slug: string; name: string; step: number; capture: string | null; why: string; missing: string }[]; more: number } | null;
}

/** A run folder without what the page needs. */
export class RunReportError extends Error {}

const exists = (file: string) => access(file).then(() => true, () => false);
async function json<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new RunReportError(`${file} cannot be read: ${(error as Error).message}`);
  }
}
/** The first of these folders of the run that holds a file, by name. */
async function first(runDir: string, names: string[], file: string): Promise<string | null> {
  for (const name of names) if (await exists(join(runDir, name, file))) return name;
  return null;
}

/**
 * The rounds of directions a run drew, as `aeom tournament` kept them in `directions/rounds.json`,
 * the last first; for a run that kept none, its one round from what its folder holds.
 */
async function readRounds(runDir: string): Promise<NonNullable<ResultPage["rounds"]>> {
  const D = join(runDir, "directions");
  type Round = { round: number; entrants: string[]; notes?: Record<string, string>; compare?: { directions?: { slug: string; strong: string; weak: string; fit: string }[]; start?: { slug: string; why: string } }; decision?: { applied: string; why?: string } };
  let kept = await json<Round[]>(join(D, "rounds.json")).catch(() => null);
  kept = Array.isArray(kept) ? kept.filter((r) => r && typeof r.round === "number" && Array.isArray(r.entrants)) : null;
  if (!kept?.length) {
    const sheet = await json<{ label: string; note?: string }[]>(join(D, "sheet.json"));
    const tournament = await json<Tournament>(join(D, "tournament.json"));
    const entrants = tournament?.entrants ?? (Array.isArray(sheet) ? sheet.map((i) => i.label).filter((l) => l !== "now") : []);
    if (!entrants.length) return [];
    kept = [{ round: 1, entrants, notes: Object.fromEntries((Array.isArray(sheet) ? sheet : []).filter((i) => i.note).map((i) => [i.label, i.note!])), ...((await json<Round["compare"]>(join(D, "compare.json"))) ? { compare: (await json<Round["compare"]>(join(D, "compare.json")))! } : {}), ...(tournament?.decision ? { decision: { applied: tournament.decision.applied, ...(tournament.decision.why ? { why: tournament.decision.why } : {}) } } : {}) }];
  }
  const now = (await exists(join(D, "now.png"))) ? "directions/now.png" : null;
  const checksOf = async (slug: string) => {
    const report = await json<{ pages?: unknown[]; errors?: unknown[]; findings?: { check: string }[] }>(join(D, `${slug}-checks`, "check.json")).catch(() => null);
    // A check that measured no page, or not all of them, passed nothing: said as not checked.
    if (!report || !report.pages?.length || report.errors?.length) return report ? null : undefined;
    const counts = new Map<string, number>();
    for (const f of report.findings ?? []) counts.set(f.check, (counts.get(f.check) ?? 0) + 1);
    return [...counts].map(([c, n]) => (n > 1 ? `${c} ×${n}` : c));
  };
  // A direction's sentence is the one its round gave, else the last an earlier round gave.
  const noteOf = (slug: string, upTo: number) => [...kept!].filter((r) => r.round <= upTo).reverse().find((r) => r.notes?.[slug])?.notes?.[slug];
  const rounds: NonNullable<ResultPage["rounds"]> = [];
  for (const [i, r] of [...kept].sort((a, b) => b.round - a.round).entries()) {
    const entrants = [];
    for (const slug of r.entrants) {
      const said = r.compare?.directions?.find((d) => d.slug === slug);
      const note = noteOf(slug, r.round);
      const checks = await checksOf(slug);
      entrants.push({ slug, ...(note ? { note } : {}), image: (await exists(join(D, `${slug}.png`))) ? `directions/${slug}.png` : null, ...(said ? { compare: { strong: said.strong, weak: said.weak, fit: said.fit } } : {}), ...(checks !== undefined ? { checks } : {}) });
    }
    rounds.push({ round: r.round, now: i === 0 ? now : null, entrants, ...(r.compare?.start ? { start: r.compare.start } : {}), ...(r.decision ? { decision: r.decision } : {}) });
  }
  return rounds;
}

/**
 * Reads what a run left in its folder (`.aeom/runs/<run>/`): the snapshots
 * before and at the end, the knockout, the journeys' replays and ratchet, the
 * verdict. Every path in the result is relative to the run's folder.
 */
export async function readRun(runDir: string, run: string): Promise<ResultPage> {
  const before = await json<CaptureManifest>(join(runDir, "before", "captures", "manifest.json"));
  const rounds = await readRounds(runDir);
  // A run of the journeys only (--ux) takes no snapshot of the screens: its replays are what it shows.
  const replayBefore = await json<JourneyReport>(join(runDir, "journeys-before", "report.json"));
  // A run that built a front from nothing has no before: only what it built.
  const built = !before && !replayBefore && (await first(runDir, ["end", "after"], join("captures", "manifest.json"))) !== null;
  // The API given, and whether the run only plugged an existing front into it, as the skill notes them in the run's folder.
  const api = (await readFile(join(runDir, "api"), "utf8").catch(() => "")).trim() || undefined;
  const replug = await exists(join(runDir, "replug"));
  // A run of directions alone, /aeom directions: its rounds are what it shows.
  if (!before && !replayBefore && !built && rounds.length) return { run, verdict: null, direction: null, screens: [], journeys: [], stillFailing: [], measuredAfter: false, features: null, rounds };
  if (!before && !replayBefore && !built) throw new RunReportError(`${join(runDir, "before")} holds no snapshot: the run took none, so there is nothing to show.`);
  const verdict = await json<SavedVerdict>(join(runDir, "verdict.json"));
  const keepStyle = verdict?.keepStyle === true;

  // The last state the run branch matches: after the journeys, after pages were put back, or after the pages.
  const last = await first(runDir, ["end", "after-revert", "after"], join("captures", "manifest.json"));
  const after = last ? await json<CaptureManifest>(join(runDir, last, "captures", "manifest.json")) : null;
  const reports = async (dir: string) => ({ check: (await json<CheckReport>(join(runDir, dir, "reports", "check.json"))) ?? undefined, judge: (await json<JudgeReport>(join(runDir, dir, "reports", "judge.json"))) ?? undefined });
  const was = await reports("before");
  const now = last ? await reports(last) : null;
  const ignore = keepStyle ? [...STYLE_PRINCIPLES, ...STYLE_CHECKS] : [];
  const comparison = now ? comparePages(scorePages(was.check, was.judge, ignore), scorePages(now.check, now.judge, ignore)) : [];

  // What section 5 decided, page by page: a page that got better is kept, any other is put back.
  const decided = (await json<{ page: string; verdict: string; before?: { total: number } | null; after?: { total: number } | null; lost?: string[] }[]>(join(runDir, "after", "compare.json"))) ?? null;
  const erroredBefore = before?.errors.map((e) => route(e.url)) ?? [];
  const erroredAfter = after?.errors.map((e) => route(e.url)) ?? [];
  // A page after pairs with the page before of the same route, or of the same shape, such as a record made at each visit.
  const paired = pairRoutes(before?.pages.map((p) => p.path) ?? [], after?.pages.map((p) => p.path) ?? []);
  const nameAfter = (path: string) => paired.get(path) ?? path;
  const pages = [...new Set([...(before?.pages.map((p) => p.path) ?? []), ...erroredBefore, ...(after?.pages.map((p) => nameAfter(p.path)) ?? []), ...erroredAfter])];
  // The pages the run gave no worker, because nothing failed on them once the kit was in. A list that does not read
  // only loses that note: the result page is still written.
  const noWorker = await json<unknown>(join(runDir, "no-worker.json")).then((l) => (Array.isArray(l) ? l.filter((p): p is string => typeof p === "string") : []), () => [] as string[]);
  const screens: ResultPage["screens"] = pages.map((page) => {
    const b = before?.pages.find((p) => p.path === page);
    const a = after?.pages.find((p) => nameAfter(p.path) === page);
    const widths = [...new Set([...(b?.files ?? []), ...(a?.files ?? [])].map((f) => f.width))].sort((x, y) => x - y);
    const c = comparison.find((x) => x.page === page);
    const failingBefore = c?.before?.failing ?? [];
    const failingAfter = c?.after?.failing ?? [];
    const d = decided?.find((x) => x.page === page);
    const decision = d?.verdict;
    const status: ResultPage["screens"][number]["status"] = built ? (erroredAfter.includes(page) ? "does not load" : replug ? "unchanged" : "new") :
      erroredAfter.includes(page) || (erroredBefore.includes(page) && !a) ? "does not load"
      : !decision ? (c?.verdict === "new" ? "new" : "unchanged")
      : decision === "better" ? "kept" : decision === "new" || decision === "missing" ? decision : "sent back";
    return {
      page,
      status,
      // Fixed by the kit: something failed before, it is kept, and no worker touched it.
      ...(noWorker.includes(page) && status === "kept" && (c?.before?.total ?? 0) > 0 ? { byKit: true as const } : {}),
      count: c?.before && c.after ? { before: c.before.total, after: c.after.total } : null,
      ...(status === "sent back" ? { back: { verdict: decision === "worse" ? ("worse" as const) : ("same" as const), before: d?.before?.total ?? null, after: d?.after?.total ?? null, ...(d?.lost?.length ? { lost: d.lost } : {}) } } : {}),
      widths: widths.map((width) => ({
        width,
        before: b?.files.find((f) => f.width === width) ? `before/captures/${b.files.find((f) => f.width === width)!.file}` : null,
        after: a?.files.find((f) => f.width === width) ? `${last}/captures/${a.files.find((f) => f.width === width)!.file}` : null,
      })),
      cleared: failingBefore.filter((f) => !failingAfter.includes(f)),
      still: failingAfter.filter((f) => failingBefore.includes(f)),
      newly: c?.newly ?? [],
    };
  });

  const tournament = await json<Tournament>(join(runDir, "directions", "tournament.json"));
  const decision = tournament?.decision;
  const winner = tournament ? (applied(tournament) ?? champion(tournament)) : null;
  // The judges' reasons, only for the direction they crowned.
  const final = decision && decision.applied !== decision.judges ? undefined : tournament?.duels.filter((d) => d.winner === winner).sort((x, y) => y.round - x.round)[0];
  const notes = (await json<{ label: string; note?: string }[]>(join(runDir, "directions", "sheet.json"))) ?? [];
  const direction = tournament && winner
    ? {
        champion: winner,
        sentence: notes.find((n) => n.label === winner)?.note ?? null,
        entrants: tournament.entrants,
        reasons: final?.reasons ?? [],
        sheet: (await exists(join(runDir, "directions", "sheet.png"))) ? "directions/sheet.png" : null,
        ...(decision ? { decision: { judges: decision.judges, dropped: decision.dropped, ...(decision.why ? { why: decision.why } : {}) } } : {}),
      }
    : null;

  const lastReplay = await first(runDir, ["journeys-end", "journeys-after"], "report.json");
  const replayAfter = lastReplay ? await json<JourneyReport>(join(runDir, lastReplay, "report.json")) : null;
  // The ratchet sits beside the replay it judged: journeys-end after a journey wave, journeys-after after the page wave
  // (or in a run of the journeys only). A journey the journey wave left unchanged keeps the page wave's verdict.
  const ratchetLast = (await json<RatchetVerdict[]>(join(runDir, lastReplay ?? "journeys-end", "ratchet.json"))) ?? [];
  const ratchetAfter = lastReplay === "journeys-end" ? ((await json<RatchetVerdict[]>(join(runDir, "journeys-after", "ratchet.json"))) ?? []) : [];
  const ratchet = [...ratchetLast.filter((v) => !v.unchanged || !ratchetAfter.some((a) => a.slug === v.slug)), ...ratchetAfter.filter((a) => ratchetLast.some((v) => v.slug === a.slug && v.unchanged) || !ratchetLast.some((v) => v.slug === a.slug))];
  // Cleared and still failing are counted from the critique of the app before the run, as the sheets are.
  const critiqueBefore = (await json<JudgeReport>(join(runDir, "before", "reports", "judge-journeys.json"))) ?? (await json<JudgeReport>(join(runDir, "journeys-before", "judge-journeys.json")));
  const critiqueAfter = lastReplay ? await json<JudgeReport>(join(runDir, lastReplay, "judge-journeys.json")) : null;
  const failingOf = (report: JudgeReport | null, slug: string) => report?.pages.find((p) => p.page === slug)?.verdicts.filter((v) => !v.pass).map((v) => v.principle) ?? null;
  const broke = (r: JourneyReport["journeys"][number] | undefined) => {
    const b = r?.runs.find((x) => x.broken)?.broken;
    return b ? `it broke at step ${b.step}: ${b.reason}` : null;
  };
  const widest = (r: JourneyReport["journeys"][number] | undefined) => r?.runs.reduce<(typeof r.runs)[number] | undefined>((w, x) => (!w || x.width > w.width ? x : w), undefined);
  // Built from nothing, each journey is the one the run made: it stands on its own replay, with no before.
  const empty = (j: JourneyReport["journeys"][number]) => ({ ...j, runs: [] as JourneyReport["journeys"][number]["runs"] });
  const journeys: ResultPage["journeys"] = (built ? (replayAfter?.journeys ?? []).map(empty) : replayBefore?.journeys ?? []).map((j) => {
    const a = replayAfter?.journeys.find((x) => x.slug === j.slug);
    const verdictOfJourney = ratchet.find((r) => r.slug === j.slug);
    const widths = [...new Set([...j.runs, ...(a?.runs ?? [])].map((r) => r.width))].sort((x, y) => x - y);
    return {
      slug: j.slug,
      name: j.name,
      // Without duels, nothing better sends nobody back: the journey is as it was.
      status: built ? (replug ? "unchanged" : "new") : verdictOfJourney && !verdictOfJourney.unchanged ? (verdictOfJourney.kept ? "kept" : "sent back") : "unchanged",
      why: verdictOfJourney?.why ?? null,
      broke: { before: broke(j), after: broke(a) },
      steps: { before: widest(j)?.counts.steps ?? null, after: a ? (widest(a)?.counts.steps ?? null) : null },
      widths: widths.map((width) => ({
        width,
        before: j.runs.find((r) => r.width === width)?.sheet ? `journeys-before/${j.runs.find((r) => r.width === width)!.sheet}` : null,
        after: a?.runs.find((r) => r.width === width)?.sheet ? `${lastReplay}/${a.runs.find((r) => r.width === width)!.sheet}` : null,
      })),
      ...(() => {
        const was = failingOf(critiqueBefore, j.slug), now = failingOf(critiqueAfter, j.slug);
        if (built) return { cleared: [], remaining: now ?? [] };
        if (was && now) return { cleared: was.filter((p) => !now.includes(p)), remaining: now };
        return { cleared: verdictOfJourney?.cleared ?? [], remaining: verdictOfJourney?.remaining ?? [] };
      })(),
    };
  });

  // What still fails: the verdict of the last state, screens and journeys.
  let stillFailing: Failure[] = [];
  let accepted: Failure[] = verdict?.accepted ?? [];
  let judges = verdict?.judges;
  const measuredAfter = Boolean(now?.check && now.judge);
  if (now?.check && now.judge) {
    // Named as the screens are, by their route before the run when it names the same record-made-at-each-visit screen.
    const end = verdictOf({ check: now.check, judge: now.judge, journeys: replayAfter ?? undefined, journeyJudge: critiqueAfter ?? undefined, recorded: replayAfter?.journeys.map((j) => j.slug) ?? [], keepStyle });
    const named = (f: Failure) => (f.kind === "journey" || f.kind === "journey-principle" ? f : { ...f, where: nameAfter(f.where) });
    stillFailing = end.failures.map(named);
    accepted = end.accepted.map(named);
    judges = end.judges ?? judges;
    // A page that did not load before the run and that the end did not measure: still broken, as far as anyone knows.
    for (const page of erroredBefore) if (!after?.pages.some((p) => p.path === page) && !erroredAfter.includes(page)) stillFailing.push({ kind: "page", where: page, what: "did not load before the run, and was not measured after the run" });
  } else if (verdict) stillFailing = verdict.failures;
  // An optional file: unreadable or of the wrong shape, it is left out. Only journeys still blocked at the end are named.
  const saved = await json<ResultPage["features"]>(join(runDir, "features.json")).catch(() => null);
  let features: ResultPage["features"] = null;
  if (saved && Array.isArray(saved.entries)) {
    const still = replayAfter ? blockedJourneys({ replay: replayAfter, critique: critiqueAfter ?? undefined, limit: Infinity }).entries.map((b) => b.slug) : [];
    const entries = [];
    for (const f of saved.entries.filter((f) => typeof f?.slug === "string" && still.includes(f.slug))) entries.push({ ...f, capture: f.capture && (await exists(join(runDir, f.capture))) ? f.capture : null });
    features = { entries, more: Number.isInteger(saved.more) ? saved.more : 0 };
  }
  // Each width once, narrowest first, whatever wrote the manifest: anything else is not a list of widths.
  const measured = usableWidths(before?.widths ?? replayBefore?.widths ?? (built ? after?.widths : undefined));
  const widths = measured ? { measured, leftOut: DEFAULT_WIDTHS.filter((w) => !measured.includes(w)) } : undefined;
  return { run, verdict, direction, screens, journeys, stillFailing, ...(rounds.length ? { rounds } : {}), ...(accepted.length ? { accepted } : {}), ...(judges ? { judges } : {}), measuredAfter, features, ...(widths ? { widths } : {}), ...(built ? { built: true } : {}), ...(api ? { api } : {}), ...(replug ? { replug: true } : {}) };
}


/** The languages the page speaks: its own words, never the data, which stays as it was written. */
export type PageLang = "en" | "fr";

const WORDS = {
  en: {
    replug: "The front, on its API", built: "What the run built", nothing: "Nothing to redo", gave: "What the run gave", directions: "Directions",
    beforeRun: "Before the run. ", judgedBy: (m: string, p: string) => `Judged by ${m}, on ${p}.`, unnamed: "a model the voters did not name",
    feedbackNote: "To say whether you agree with each verdict, open this page with <code>aeom report --serve</code>.",
    direction: "Direction", screens: "Screens", journeys: "Journeys", features: "Missing features", still: "Still failing",
    directionOf: (c: string) => `Direction: ${c}`, styleKept: "Style kept", styleKeptNote: "No new direction: the run fixed what failed on the app's own style.",
    sheetAlt: "The directions, side by side", onApi: "On its API", builtSide: "Built", before: "Before", after: "After", beforeWord: "before", afterWord: "after", noCapture: "No capture",
    status: { kept: "kept", "sent back": "sent back", new: "new", missing: "missing", unchanged: "unchanged", "does not load": "does not load" } as Record<string, string>,
    byKit: "Fixed by the kit: no worker touched it.", failing: (b: number, a: number) => `${b} → ${a} failing`,
    lost: "Lost, so sent back:", cleared: "Cleared:", stillList: "Still failing:", newly: "Newly failing:",
    beforeTheRun: "Before the run, ", atTheEnd: "At the end, ", steps: "steps",
    notMeasured: "Not measured after the run: what failed before it.", nothingLeft: "Nothing.",
    accepted: "Accepted", acceptedNote: "What the product sheet accepts, by your choice or your spec's: said, never redone.",
    featuresNote: "What a key journey would need to reach its end. AEOM built none of it.", blocksAt: "blocks at step", blocksAtStep: (n: string) => `blocks at step ${n}:`, chosenTag: "chosen",
    more: (n: number) => `${n} more blocked journey${n === 1 ? "" : "s"}, not named: three at most per run.`,
    agree: "Agree", disagree: "Disagree", whyPlaceholder: "Why, if you disagree (optional)", why: "Why",
    ratesLead: "How often you agreed with AEOM, over every run: ", of: "of", noFeedback: "No feedback yet", sayEach: ": say whether you agree with each verdict",
    categories: { direction: "Direction", screens: "Screens", journeys: "Journeys", principles: "Principles" } as Record<string, string>,
    youAgree: "You agree.", youDisagree: "You disagree.", notSaved: "Not saved: is aeom report --serve still running?",
    byKnockout: (among: string) => `Chosen by knockout among ${among}.`, byYou: (among: string) => `Chosen by you among ${among}, with no knockout.`,
    validated: (among: string) => `Chosen by knockout among ${among}, and validated by you.`, overJudges: (among: string, j: string) => `Chosen by you; the judges' knockout among ${among} had picked ${j}.`,
    measuredAt: (m: string, left: string) => `Measured at ${m} px, the widths this run declared${left ? `; ${left} px left out` : ""}.`,
    round: (n: number) => `Round ${n}`, now: "The front as it is", strong: "Strong point: ", weak: "Weak point: ", fit: "Fit: ",
    checksFound: "Its checks found: ", passesChecks: "It passes every check.", notChecked: "Its checks could not measure it.",
    brokeAt: (n: string, why: string) => `it broke at step ${n}: ${why}`, notLoaded: "did not load before the run, and was not measured after the run", startFrom: (s: string, why: string) => `The screening would start from ${s}: ${why}`,
    advice: "Advice only: you choose, one direction or a mix.", chosen: (s: string, why?: string) => `Chosen: ${s}${why ? ` — ${why}` : "."}`, earlier: "Earlier rounds",
  },
  fr: {
    replug: "Le front, sur son API", built: "Ce que le run a construit", nothing: "Rien à refaire", gave: "Ce que le run a donné", directions: "Les directions",
    beforeRun: "Avant le run. ", judgedBy: (m: string, p: string) => `Jugé par ${m}, sur ${p}.`, unnamed: "un modèle que les votants n'ont pas nommé",
    feedbackNote: "Pour dire si vous êtes d'accord avec chaque verdict, ouvrez cette page avec <code>aeom report --serve</code>.",
    direction: "Direction", screens: "Écrans", journeys: "Parcours", features: "Fonctions manquantes", still: "Encore en échec",
    directionOf: (c: string) => `Direction\u00a0: ${c}`, styleKept: "Style gardé", styleKeptNote: "Pas de nouvelle direction\u00a0: le run a corrigé ce qui échouait, dans le style de l'app.",
    sheetAlt: "Les directions, côte à côte", onApi: "Sur son API", builtSide: "Construit", before: "Avant", after: "Après", beforeWord: "avant", afterWord: "après", noCapture: "Pas de capture",
    status: { kept: "gardé", "sent back": "renvoyé", new: "nouveau", missing: "disparu", unchanged: "inchangé", "does not load": "ne charge pas" } as Record<string, string>,
    byKit: "Corrigé par le kit\u00a0: aucun worker n'y a touché.", failing: (b: number, a: number) => `${b} → ${a} en échec`,
    lost: "Perdu, donc renvoyé\u00a0:", cleared: "Réglé\u00a0:", stillList: "Encore en échec\u00a0:", newly: "Nouvel échec\u00a0:",
    beforeTheRun: "Avant le run, ", atTheEnd: "À la fin, ", steps: "étapes",
    notMeasured: "Pas mesuré après le run\u00a0: ce qui échouait avant.", nothingLeft: "Rien.",
    accepted: "Accepté", acceptedNote: "Ce que la fiche produit accepte, par votre choix ou celui de votre cahier des charges\u00a0: dit, jamais refait.",
    featuresNote: "Ce qu'il faudrait à un parcours clé pour aller au bout. AEOM n'en a rien construit.", blocksAt: "bloque à l'étape", blocksAtStep: (n: string) => `bloque à l'étape ${n}\u00a0:`, chosenTag: "choisie",
    more: (n: number) => `${n} autre${n === 1 ? "" : "s"} parcours bloqué${n === 1 ? "" : "s"}, non nommé${n === 1 ? "" : "s"}\u00a0: trois au plus par run.`,
    agree: "D'accord", disagree: "Pas d'accord", whyPlaceholder: "Pourquoi, si vous n'êtes pas d'accord (facultatif)", why: "Pourquoi",
    ratesLead: "Combien de fois vous avez été d'accord avec AEOM, sur tous les runs\u00a0: ", of: "sur", noFeedback: "Pas encore d'avis", sayEach: "\u00a0: dites si vous êtes d'accord avec chaque verdict",
    categories: { direction: "Direction", screens: "Écrans", journeys: "Parcours", principles: "Principes" } as Record<string, string>,
    youAgree: "Vous êtes d'accord.", youDisagree: "Vous n'êtes pas d'accord.", notSaved: "Pas gardé\u00a0: aeom report --serve tourne-t-il encore ?",
    byKnockout: (among: string) => `Choisie par élimination parmi ${among}.`, byYou: (among: string) => `Choisie par vous parmi ${among}, sans élimination.`,
    validated: (among: string) => `Choisie par élimination parmi ${among}, et validée par vous.`, overJudges: (among: string, j: string) => `Choisie par vous ; l'élimination des juges parmi ${among} avait retenu ${j}.`,
    measuredAt: (m: string, left: string) => `Mesuré à ${m} px, les largeurs que ce run a déclarées${left ? ` ; ${left} px laissés de côté` : ""}.`,
    round: (n: number) => `Tour ${n}`, now: "Le front tel qu'il est", strong: "Point fort\u00a0: ", weak: "Point faible\u00a0: ", fit: "Adéquation\u00a0: ",
    checksFound: "Ses contrôles ont trouvé\u00a0: ", passesChecks: "Elle passe tous les contrôles.", notChecked: "Ses contrôles n'ont pas pu la mesurer.",
    brokeAt: (n: string, why: string) => `il s'est arrêté à l'étape ${n}\u00a0: ${why}`, notLoaded: "ne chargeait pas avant le run, et n'a pas été mesurée après", startFrom: (s: string, why: string) => `Le tri commencerait par ${s}\u00a0: ${why}`,
    advice: "Un conseil seulement\u00a0: c'est vous qui choisissez, une direction ou un mélange.", chosen: (s: string, why?: string) => `Choisie\u00a0: ${s}${why ? ` — ${why}` : "."}`, earlier: "Les tours d'avant",
  },
};
type Words = (typeof WORDS)["en"];

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** A path inside the run's folder, each segment URL-encoded: a `#` or `?` in a file name stays part of the name. */
const href = (path: string) => path.split("/").map((segment) => encodeURI(segment).replace(/#/g, "%23").replace(/\?/g, "%3F")).join("/");
const img = (src: string | null, alt: string, w: Words = WORDS.en) => (src ? `<img src="${escape(href(src))}" alt="${escape(alt)}" loading="lazy">` : `<p class="none">${w.noCapture}</p>`);
const list = (label: string, items: string[]) => (items.length ? `<p><span class="label">${label}</span> ${items.map(escape).join(", ")}</p>` : "");

/** A verdict of the page the person can agree or disagree with: its id, its category, and what AEOM said, in a few words. */
export interface PageVerdict {
  id: string;
  category: FeedbackCategory;
  verdict: string;
}

const NOTHING_TO_REDO: PageVerdict = { id: "nothing-to-redo", category: "screens", verdict: "Nothing to redo" };
const ofDirection = (d: NonNullable<ResultPage["direction"]>): PageVerdict => ({ id: "direction", category: "direction", verdict: `Direction: ${d.champion}` });
const ofScreen = (s: ResultPage["screens"][number]): PageVerdict => ({ id: `screen:${s.page}`, category: "screens", verdict: `${s.page} ${s.status}` });
const ofJourney = (j: ResultPage["journeys"][number]): PageVerdict => ({ id: `journey:${j.slug}`, category: "journeys", verdict: `${j.name} ${j.status}` });
/** Only a principle in failure is a verdict: a check is measured, not judged. */
const ofFailure = (f: Failure): PageVerdict | null => {
  if (f.kind !== "principle" && f.kind !== "journey-principle") return null;
  const principle = f.what.split(":")[0];
  return { id: `fail:${f.where}:${principle}`, category: "principles", verdict: `${f.where} fails ${principle}` };
};

/** Every verdict the page asks about, in its order: what `aeom report --serve` accepts a gesture on. */
export function pageVerdicts(r: ResultPage): PageVerdict[] {
  if (r.verdict?.nothingToRedo === true) return [NOTHING_TO_REDO];
  return [...(r.direction ? [ofDirection(r.direction)] : []), ...r.screens.map(ofScreen), ...r.journeys.map(ofJourney), ...r.stillFailing.flatMap((f) => ofFailure(f) ?? [])];
}

/** One verdict the person can agree or disagree with, and say why. */
const sayIn = (w: Words) => (v: PageVerdict | null) =>
  v ? `<div class="say" data-verdict-id="${escape(v.id)}"><button type="button" data-agree="true">${w.agree}</button><button type="button" data-agree="false">${w.disagree}</button><input type="text" maxlength="500" placeholder="${escape(w.whyPlaceholder)}" aria-label="${w.why}"><span class="said" role="status"></span></div>` : "";


/** How often the person agreed with AEOM, by category, or that they have not said yet: asked only once the page is served. */
const ratesHtml = (rates: Record<string, { agreed: number; total: number }> | undefined, w: Words) => {
  const given = rates ? Object.entries(rates).filter(([, r]) => r.total > 0) : [];
  return `<p class="rates" id="rates">${given.length ? `${w.ratesLead}${given.map(([c, r]) => `${w.categories[c] ?? c} <strong>${r.agreed} ${w.of} ${r.total}</strong>`).join(" · ")}` : `${w.noFeedback}<span class="served" hidden>${w.sayEach}</span>.`}</p>`;
};

/** Sends each gesture to the server of `aeom report --serve` as it is made, and shows what was already said. */
const feedbackScript = (w: Words) => `
(() => {
  const served = location.protocol === "http:" || location.protocol === "https:";
  const boxes = [...document.querySelectorAll(".say")];
  if (!served) {
    boxes.forEach((b) => (b.hidden = true));
    const note = document.getElementById("feedback-note");
    if (note) note.hidden = false;
    return;
  }
  document.querySelectorAll(".served").forEach((e) => (e.hidden = false));
  const names = ${JSON.stringify(w.categories)};
  const say = ${JSON.stringify({ lead: w.ratesLead, of: w.of, agree: w.youAgree, disagree: w.youDisagree, notSaved: w.notSaved }).replace(/</g, "\\u003c")};
  const showRates = (rates) => {
    const given = Object.entries(rates).filter(([, r]) => r.total > 0);
    const el = document.getElementById("rates");
    if (!given.length) return;
    el.textContent = say.lead;
    given.forEach(([c, r], i) => {
      if (i) el.append(" · ");
      el.append((names[c] || c) + " ");
      const s = document.createElement("strong");
      s.textContent = r.agreed + " " + say.of + " " + r.total;
      el.append(s);
    });
  };
  const mark = (box, agree, why) => {
    box.dataset.agree = String(agree);
    box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.agree === String(agree))));
    if (why !== undefined) box.querySelector("input").value = why;
    box.querySelector(".said").textContent = agree ? say.agree : say.disagree;
  };
  // The server stopped, or answered no: say so, never fail in silence.
  const send = async (box, agree) => {
    clearTimeout(box.typing);
    box.typing = null;
    // The choice counts from the click: a reason typed before the server answers is kept with it.
    box.dataset.agree = String(agree);
    const why = box.querySelector("input").value.trim();
    const res = await fetch("api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: box.dataset.verdictId, agree, why: why || undefined }) }).catch(() => null);
    if (!res || !res.ok) { box.querySelector(".said").textContent = say.notSaved; return; }
    mark(box, agree);
    const answer = await res.json().catch(() => null);
    if (answer && answer.rates) showRates(answer.rates);
  };
  boxes.forEach((box) => {
    const input = box.querySelector("input");
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => send(box, b.dataset.agree === "true")));
    // A reason is kept once typing stops, without leaving the field; leaving it keeps it at once.
    input.addEventListener("input", () => {
      if (!box.dataset.agree) return;
      clearTimeout(box.typing);
      box.typing = setTimeout(() => send(box, box.dataset.agree === "true"), 600);
    });
    input.addEventListener("change", () => { if (box.typing) send(box, box.dataset.agree === "true"); });
  });
  fetch("api/feedback").then((r) => r.json()).then(({ mine, rates }) => {
    for (const f of mine) { const box = boxes.find((b) => b.dataset.verdictId === f.id); if (box) mark(box, f.agree, f.why || ""); }
    showRates(rates);
  }).catch(() => {});
})();`;

/** Who chose the direction, in one sentence: the judges' knockout, then the person at the checkpoint when they decided. */
function chosenBy(d: NonNullable<ResultPage["direction"]>, w: Words): string {
  const among = d.entrants.map(escape).join(", ");
  if (!d.decision) return w.byKnockout(among);
  if (d.decision.judges === null) return w.byYou(among);
  if (d.decision.judges === d.champion) return w.validated(among);
  return w.overJudges(among, escape(d.decision.judges));
}

/** The widths, said only when they are not the default: in six months, why a verdict speaks of the desktop alone. */
function widthsHtml(widths: ResultPage["widths"], w: Words): string {
  if (!widths || widths.measured.join(",") === DEFAULT_WIDTHS.join(",")) return "";
  return `<p class="line">${w.measuredAt(widths.measured.join(", "), widths.leftOut.join(", "))}</p>`;
}

/** The page, standalone: its styles inline, its images beside it in the run's folder, nothing from the network. */
export function resultHtml(r: ResultPage, { rates, lang = "en" }: { rates?: Record<string, { agreed: number; total: number }>; lang?: PageLang } = {}): string {
  const w = WORDS[lang] ?? WORDS.en;
  const say = sayIn(w);
  const shown = (status: string) => w.status[status] ?? status;
  // What reading the run wrote in its own words: said in the page's language.
  const told = (text: string) => text.replace(/^it broke at step (\d+): ([\s\S]*)$/, (_, n: string, why: string) => w.brokeAt(n, why)).replace(/^did not load before the run, and was not measured after the run$/, w.notLoaded);
  const nothing = r.verdict?.nothingToRedo === true;
  // A run of directions alone, /aeom directions: no screen redone, its directions are what it gave.
  const onlyDirections = !r.screens.length && !r.journeys.length && !!r.rounds?.length;
  const head = `<header><p class="run">${escape(r.run)}</p><h1>${onlyDirections ? w.directions : r.replug ? w.replug : r.built ? w.built : nothing ? w.nothing : w.gave}</h1>${r.verdict ? `<p class="line">${nothing ? "" : w.beforeRun}${escape(r.verdict.line)}</p>` : ""}${r.judges ? `<p class="muted">${w.judgedBy(escape(r.judges.models.join(", ") || w.unnamed), escape(r.judges.principles))}</p>` : ""}${widthsHtml(r.widths, w)}${nothing ? say(NOTHING_TO_REDO) : ""}${onlyDirections ? "" : `${ratesHtml(rates, w)}<p class="muted" id="feedback-note" hidden>${w.feedbackNote}</p>`}</header>`;
  const named = r.features?.entries.length ? r.features : null;
  const nav = nothing || onlyDirections ? "" : `<nav>${r.rounds?.length ? `<a href="#directions">${w.directions}</a>` : ""}<a href="#direction">${w.direction}</a><a href="#screens">${w.screens}</a><a href="#journeys">${w.journeys}</a>${named ? `<a href="#features">${w.features}</a>` : ""}<a href="#still">${w.still}</a></nav>`;

  const direction = r.direction
    ? `<section id="direction"><h2>${w.directionOf(escape(r.direction.champion))}</h2>${r.direction.sentence ? `<p>${escape(r.direction.sentence)}</p>` : ""}<p class="muted">${chosenBy(r.direction, w)}</p>${[...r.direction.reasons, ...(r.direction.decision?.why ? [r.direction.decision.why] : [])].map((x) => `<blockquote>${escape(x)}</blockquote>`).join("")}${say(ofDirection(r.direction))}${r.direction.sheet ? `<figure>${img(r.direction.sheet, w.sheetAlt, w)}</figure>` : ""}</section>`
    : r.verdict?.keepStyle
      ? `<section id="direction"><h2>${w.styleKept}</h2><p class="muted">${w.styleKeptNote}</p></section>`
      : "";

  // A run that built from nothing has no before: the screen alone.
  const pair = (at: { width: number; before: string | null; after: string | null }, what: string) => r.built
    ? `<div class="pair"><p class="label">${at.width} px</p><div class="sides"><figure><figcaption>${r.replug ? w.onApi : w.builtSide}</figcaption>${img(at.after, `${what}, ${at.width} px`, w)}</figure></div></div>` :
    `<div class="pair"><p class="label">${at.width} px</p><div class="sides"><figure><figcaption>${w.before}</figcaption>${img(at.before, `${what} ${w.beforeWord}, ${at.width} px`, w)}</figure>${nothing ? "" : `<figure><figcaption>${w.after}</figcaption>${img(at.after, `${what} ${w.afterWord}, ${at.width} px`, w)}</figure>`}</div></div>`;
  const screens = r.screens
    .map((s) => `<section class="screen" data-page="${escape(s.page)}" data-status="${s.status}"><h3>${escape(s.page)} <span class="status ${s.status.replace(/ /g, "-")}">${shown(s.status)}</span></h3>${s.byKit ? `<p class="muted">${w.byKit}</p>` : ""}${s.count && !nothing ? `<p class="muted">${w.failing(s.count.before, s.count.after)}</p>` : ""}${nothing ? "" : say(ofScreen(s))}${list(w.lost, s.back?.lost ?? [])}${list(w.cleared, s.cleared)}${list(w.stillList, s.still)}${list(w.newly, s.newly)}${s.widths.map((at) => pair(at, s.page)).join("")}</section>`)
    .join("");
  const journeys = r.journeys
    .map((j) => `<section class="journey" data-journey="${escape(j.slug)}" data-status="${j.status}"><h3>${escape(j.name)} <span class="status ${j.status.replace(" ", "-")}">${shown(j.status)}</span></h3>${j.broke.before ? `<p>${w.beforeTheRun}${escape(told(j.broke.before))}</p>` : ""}${j.broke.after && !nothing ? `<p>${w.atTheEnd}${escape(told(j.broke.after))}</p>` : ""}${nothing ? "" : r.built ? `<p>${j.steps.after ?? "?"} ${w.steps}</p>` : `<p>${j.steps.before ?? "?"} → ${j.steps.after ?? "?"} ${w.steps}</p>`}${j.why ? `<p class="muted">${escape(j.why)}</p>` : ""}${nothing ? "" : say(ofJourney(j))}${list(w.cleared, j.cleared)}${list(w.stillList, j.remaining)}${j.widths.map((at) => pair(at, j.name)).join("")}</section>`)
    .join("");
  const still = `${r.measuredAfter ? "" : `<p class="muted">${w.notMeasured}</p>`}${
    r.stillFailing.length ? `<ul>${r.stillFailing.map((f) => `<li><strong>${escape(f.where)}</strong> ${escape(told(f.what))}${say(ofFailure(f))}</li>`).join("")}</ul>` : r.measuredAfter ? `<p>${w.nothingLeft}</p>` : ""
  }`;

  const accepted = r.accepted?.length
    ? `<section id="accepted"><h2>${w.accepted}</h2><p class="muted">${w.acceptedNote}</p><ul>${r.accepted.map((f) => `<li><strong>${escape(f.where)}</strong> ${escape(f.what)}</li>`).join("")}</ul></section>`
    : "";
  const features = named
    ? `<section id="features"><h2>${w.features}</h2><p class="muted">${w.featuresNote}</p>${named.entries
        .map((f) => `<section class="feature" data-journey="${escape(f.slug)}"><h3>${escape(f.name)}</h3><p>${w.blocksAtStep(escape(String(f.step)))} <span class="muted">${escape(f.why)}</span></p><p><strong>${escape(f.missing)}</strong></p><figure class="step">${img(f.capture, `${f.name}, ${w.blocksAt} ${f.step}`, w)}</figure></section>`)
        .join("")}${named.more ? `<p class="muted">${w.more(named.more)}</p>` : ""}</section>`
    : "";
  // Every round of directions, the last first: the front as it is, then each direction in large, what the comparison
  // says of it, what its checks found, and the choice.
  const roundHtml = (round: NonNullable<ResultPage["rounds"]>[number]) =>
    `<section class="round" data-round="${round.round}"><h3>${w.round(round.round)}</h3>${round.now ? `<figure class="direction-now"><figcaption>${w.now}</figcaption>${img(round.now, w.now, w)}</figure>` : ""}${round.entrants
      .map(
        (e) =>
          `<article class="direction" data-slug="${escape(e.slug)}"><h4>${escape(e.slug)}${round.decision?.applied === e.slug ? ` <span class="status kept">${w.chosenTag}</span>` : ""}</h4>${e.note ? `<p>${escape(e.note)}</p>` : ""}<figure>${img(e.image, e.slug, w)}</figure>${e.compare ? `<p><span class="label">${w.strong}</span>${escape(e.compare.strong)}</p><p><span class="label">${w.weak}</span>${escape(e.compare.weak)}</p><p><span class="label">${w.fit}</span>${escape(e.compare.fit)}</p>` : ""}${e.checks === null ? `<p class="muted">${w.notChecked}</p>` : e.checks ? `<p class="muted">${e.checks.length ? `${w.checksFound}${escape(e.checks.join(", "))}` : w.passesChecks}</p>` : ""}</article>`,
      )
      .join("")}${round.start ? `<p>${escape(w.startFrom(round.start.slug, round.start.why))} <span class="muted">${w.advice}</span></p>` : ""}${round.decision ? `<p><strong>${escape(w.chosen(round.decision.applied, round.decision.why))}</strong></p>` : ""}</section>`;
  const [latest, ...earlier] = r.rounds ?? [];
  // On a page of directions alone, the page's own title says it already.
  const directions = latest ? `<section id="directions">${onlyDirections ? "" : `<h2>${w.directions}</h2>`}${roundHtml(latest)}${earlier.length ? `<details><summary>${w.earlier}</summary>${earlier.map(roundHtml).join("")}</details>` : ""}</section>` : "";
  const body = onlyDirections
    ? directions
    : nothing
    ? `<section id="screens"><h2>${w.screens}</h2>${screens}</section>${r.journeys.length ? `<section id="journeys"><h2>${w.journeys}</h2>${journeys}</section>` : ""}${accepted}`
    : `${directions}${direction}<section id="screens"><h2>${w.screens}</h2>${screens}</section>${r.journeys.length ? `<section id="journeys"><h2>${w.journeys}</h2>${journeys}</section>` : ""}${features}<section id="still"><h2>${w.still}</h2>${still}</section>${accepted}`;

  return `<!doctype html>
<html lang="${lang === "fr" ? "fr" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AEOM · ${escape(r.run)}</title>
<style>
  :root { --ink: #161616; --muted: #5c5c5c; --rule: #d9d9d9; --paper: #ffffff; --kept: #1d6b33; --back: #a3261b; }
  @media (prefers-color-scheme: dark) { :root { --ink: #ececec; --muted: #a8a8a8; --rule: #3a3a3a; --paper: #141414; --kept: #6fcf8a; --back: #f08a7e; } }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; } /* over any display rule, such as .say's flex: opened as a file, the page asks for nothing */
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header, nav, section { max-width: 1200px; margin: 0 auto; padding: 0 16px; }
  header { padding-top: 32px; border-bottom: 1px solid var(--rule); padding-bottom: 16px; }
  h1 { margin: 4px 0 8px; font-size: 28px; } h2 { margin: 40px 0 8px; font-size: 22px; border-bottom: 1px solid var(--rule); padding-bottom: 6px; } h3 { margin: 28px 0 6px; font-size: 18px; }
  .run, .muted, .label, figcaption { color: var(--muted); } .run { margin: 0; font-size: 14px; } .line { margin: 0; }
  nav { display: flex; gap: 16px; padding-top: 12px; padding-bottom: 12px; position: sticky; top: 0; background: var(--paper); border-bottom: 1px solid var(--rule); }
  nav a { color: var(--ink); }
  .status { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin-left: 8px; }
  .status.kept { color: var(--kept); } .status.sent-back, .status.missing, .status.does-not-load { color: var(--back); } .status.unchanged, .status.new { color: var(--muted); }
  blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid var(--rule); }
  .sides { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  figure { margin: 0; } figcaption { font-size: 13px; margin-bottom: 4px; }
  img { display: block; max-width: 100%; height: auto; border: 1px solid var(--rule); }
  .pair { margin: 12px 0 20px; } .pair > .label { margin: 0 0 4px; font-size: 13px; }
  .none { color: var(--muted); font-style: italic; }
  figure.step { max-width: 520px; }
  ul { padding-left: 20px; } li { margin: 4px 0; }
  .rates { margin: 8px 0 0; }
  .say { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
  .say button { font: inherit; font-size: 14px; padding: 4px 12px; border: 1px solid var(--rule); background: var(--paper); color: var(--ink); cursor: pointer; }
  .say button[aria-pressed="true"] { border-color: var(--ink); font-weight: 600; }
  .say input { font: inherit; font-size: 14px; padding: 4px 8px; border: 1px solid var(--rule); background: var(--paper); color: var(--ink); flex: 1 1 220px; min-width: 0; }
  .said { font-size: 13px; color: var(--muted); }
  .round { padding: 0; } .direction { margin: 20px 0 28px; } .direction h4 { margin: 0 0 6px; font-size: 17px; } .direction p { margin: 4px 0; }
  .direction-now { margin: 12px 0 20px; } details > summary { cursor: pointer; margin: 24px 0 8px; color: var(--muted); }
  @media (max-width: 640px) { .sides { grid-template-columns: 1fr; } }
</style>
</head>
<body>
${head}
${nav}
${body}
<script>${feedbackScript(w)}</script>
</body>
</html>
`;
}
