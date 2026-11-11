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
import { fontFaces } from "./fonts.js";
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
    /** Its steps at the widest width, as the last replay captured them: absent when it captured none. */
    strip?: { index: number; action: string; capture: string }[];
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
  /** True for a run that only judged (`/aeom judge`, kept as `--juger` or `--diagnostic` in its `state.json`): it redid nothing. */
  judged?: true;
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
    // The steps as the last replay saw them, else as the first one did.
    const shot = a ? { run: widest(a), dir: lastReplay } : { run: widest(j), dir: "journeys-before" };
    const strip = (Array.isArray(shot.run?.steps) ? shot.run.steps : []).filter((s) => typeof s?.capture === "string" && s.capture).map((s) => ({ index: Number(s.index), action: String(s.action ?? ""), capture: `${shot.dir}/${s.capture}` }));
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
      ...(strip.length ? { strip } : {}),
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
  // The options the run kept, with or without their dashes: a state of the wrong shape says none.
  const options = await json<{ options?: unknown }>(join(runDir, "state.json")).then((s) => (Array.isArray(s?.options) ? s.options.filter((o): o is string => typeof o === "string") : []), () => [] as string[]);
  const judged = options.some((o) => /^(--)?(juger|diagnostic)$/.test(o));
  return { run, verdict, direction, screens, journeys, stillFailing, ...(rounds.length ? { rounds } : {}), ...(accepted.length ? { accepted } : {}), ...(judges ? { judges } : {}), measuredAfter, features, ...(widths ? { widths } : {}), ...(built ? { built: true } : {}), ...(api ? { api } : {}), ...(replug ? { replug: true } : {}), ...(judged ? { judged: true as const } : {}) };
}


/** The languages the page speaks: its own words, never the data, which stays as it was written. */
export type PageLang = "en" | "fr";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const WORDS = {
  en: {
    replug: "The front, on its API", built: "What the run built", nothing: "Nothing to redo", gave: "What the run gave", directions: "Directions", judged: "What fails",
    beforeRun: "Before the run. ", judgedBy: (m: string, p: string) => `Judged by ${m}, on ${p}.`, unnamed: "a model the voters did not name",
    feedbackNote: "To say whether you agree with each verdict, open this page with <code>aeom report --serve</code>.",
    direction: "Direction", screens: "Screens", journeys: "Journeys", features: "Missing features", still: "Still failing",
    directionOf: (c: string) => `Direction: ${c}`, styleKept: "Style kept", styleKeptNote: "No new direction: the run fixed what failed on the app's own style.",
    sheetAlt: "The directions, side by side", onApi: "On its API", builtSide: "Built", before: "Before", after: "After", beforeWord: "before", afterWord: "after", noCapture: "No capture",
    status: { kept: "kept", "sent back": "sent back", new: "new", missing: "missing", unchanged: "unchanged", "does not load": "does not load" } as Record<string, string>,
    journeyStatus: { kept: "improved", "sent back": "put back", new: "new", unchanged: "unchanged" } as Record<string, string>,
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
    // The head and the groups of the page.
    redoneOf: (k: number, n: number) => `${k} of ${plural(n, "screen", "screens")} redone`, improvedOf: (k: number, n: number) => `${k} of ${plural(n, "journey", "journeys")} improved`,
    failsOn: (p: number, s: number, n: number) => `${plural(p, "problem", "problems")} on ${s === n && n > 1 ? `all ${n} screens` : `${s} of ${plural(n, "screen", "screens")}`}`, failsOnJourneys: (p: number, j: number, n: number) => `${plural(p, "problem", "problems")} on ${j === n && n > 1 ? `all ${n} journeys` : `${j} of ${plural(n, "journey", "journeys")}`}`,
    putBackLede: (n: number) => `${plural(n, "screen was", "screens were")} put back as ${n === 1 ? "it was" : "they were"}: AEOM's version was no better.`,
    leftLede: (n: number) => (n ? `${plural(n, "problem is", "problems are")} still to fix.` : "Nothing is left to fix."), missingLede: (n: number) => `${plural(n, "journey needs", "journeys need")} a feature AEOM did not build.`,
    judgedLede: "Nothing was redone: here is what fails, screen by screen and journey by journey.", builtLede: (s: number, j: number) => `${plural(s, "screen", "screens")} and ${plural(j, "journey", "journeys")}, built on the direction chosen.`,
    tScreens: "problems on the screens", tJourneys: "problems on the journeys", tStill: "still to fix", tMissing: (n: number): string => (n === 1 ? "missing feature" : "missing features"), tClean: "screens with nothing failing",
    gRedone: "Redone", gBuilt: "Built", gBack: "Put back as they were", gBackNote: "AEOM tried: its version was no better, so the page stays as it was.", gSame: "Unchanged", gBroken: "Do not load", gFailing: "With problems", gClean: "Nothing failing",
    drag: "Drag across an image to go from before to after.", whole: "See the whole page", wholeJourney: "See every step", close: "Close", computer: "Computer", phone: "Phone",
    problems: (n: number): string => (n === 1 ? "problem" : "problems"), worse: (b: string, a: string) => `its version did worse: ${b} → ${a}`, same: (b: string, a: string) => `its version was no better: ${b} → ${a}`,
    atEndCount: (n: number) => `${n} at the end`, roundsOf: (n: number) => (n === 1 ? "The round of directions" : `The ${n} rounds of directions`), stepsOf: (n: number) => `The ${n} steps`, jump: "Go to", step: "step",
    names: {
      "one-direction": "one direction", "consistent-chrome": "the same header and buttons everywhere", "not-generic": "nothing generic", "not-ai-default": "not an AI's default look",
      hierarchy: "a clear hierarchy", grid: "a grid that lines up", density: "a controlled density", states: "designed empty and error states", "charter-kept": "the charter kept",
      "clear-start": "a clear start", "next-step": "the next step in sight", "no-dead-end": "no dead end", "result-shown": "the result shown", "same-words": "the same words throughout", short: "a short journey",
      cursor: "a pointer on what clicks", overflow: "no sideways scrolling", contrast: "enough contrast", console: "a clean console", header: "a header that stays", wrap: "labels on one line",
      uneven: "cards of one shape", clipped: "no text cut off", "tap-size": "targets big enough to tap", "font-size": "text big enough to read", "line-length": "lines short enough", zoom: "zoom left to people",
      images: "images that load", labels: "a name for every control", focus: "a visible focus", "layout-shift": "a page that does not jump", "gradient-text": "no gradient text", "side-stripe": "no stripe on one side",
      "nested-card": "no card in a card", bounce: "no bouncing motion", placeholder: "no hole left unfilled", "ai-text": "no text about the interface", "hollow-words": "no hollow words",
      "nested-radius": "corners that follow", orphan: "no word alone on a heading's last line", motion: "motion that keeps the layout", finish: "a finished page",
    } as Record<string, string>,
  },
  fr: {
    replug: "Le front, sur son API", built: "Ce que le run a construit", nothing: "Rien à refaire", gave: "Ce que le run a donné", directions: "Les directions", judged: "Ce qui ne va pas",
    beforeRun: "Avant le run. ", judgedBy: (m: string, p: string) => `Jugé par ${m}, sur ${p}.`, unnamed: "un modèle que les votants n'ont pas nommé",
    feedbackNote: "Pour dire si vous êtes d'accord avec chaque verdict, ouvrez cette page avec <code>aeom report --serve</code>.",
    direction: "Direction", screens: "Écrans", journeys: "Parcours", features: "Fonctions manquantes", still: "Encore en échec",
    directionOf: (c: string) => `Direction : ${c}`, styleKept: "Style gardé", styleKeptNote: "Pas de nouvelle direction : le run a corrigé ce qui échouait, dans le style de l'app.",
    sheetAlt: "Les directions, côte à côte", onApi: "Sur son API", builtSide: "Construit", before: "Avant", after: "Après", beforeWord: "avant", afterWord: "après", noCapture: "Pas de capture",
    status: { kept: "gardé", "sent back": "renvoyé", new: "nouveau", missing: "disparu", unchanged: "inchangé", "does not load": "ne charge pas" } as Record<string, string>,
    journeyStatus: { kept: "amélioré", "sent back": "remis", new: "nouveau", unchanged: "inchangé" } as Record<string, string>,
    byKit: "Corrigé par le kit : aucun worker n'y a touché.", failing: (b: number, a: number) => `${b} → ${a} en échec`,
    lost: "Perdu, donc renvoyé :", cleared: "Réglé :", stillList: "Encore en échec :", newly: "Nouvel échec :",
    beforeTheRun: "Avant le run, ", atTheEnd: "À la fin, ", steps: "étapes",
    notMeasured: "Pas mesuré après le run : ce qui échouait avant.", nothingLeft: "Rien.",
    accepted: "Accepté", acceptedNote: "Ce que la fiche produit accepte, par votre choix ou celui de votre cahier des charges : dit, jamais refait.",
    featuresNote: "Ce qu'il faudrait à un parcours clé pour aller au bout. AEOM n'en a rien construit.", blocksAt: "bloque à l'étape", blocksAtStep: (n: string) => `bloque à l'étape ${n} :`, chosenTag: "choisie",
    more: (n: number) => `${n} autre${n === 1 ? "" : "s"} parcours bloqué${n === 1 ? "" : "s"}, non nommé${n === 1 ? "" : "s"} : trois au plus par run.`,
    agree: "D'accord", disagree: "Pas d'accord", whyPlaceholder: "Pourquoi, si vous n'êtes pas d'accord (facultatif)", why: "Pourquoi",
    ratesLead: "Combien de fois vous avez été d'accord avec AEOM, sur tous les runs : ", of: "sur", noFeedback: "Pas encore d'avis", sayEach: " : dites si vous êtes d'accord avec chaque verdict",
    categories: { direction: "Direction", screens: "Écrans", journeys: "Parcours", principles: "Principes" } as Record<string, string>,
    youAgree: "Vous êtes d'accord.", youDisagree: "Vous n'êtes pas d'accord.", notSaved: "Pas gardé : aeom report --serve tourne-t-il encore ?",
    byKnockout: (among: string) => `Choisie par élimination parmi ${among}.`, byYou: (among: string) => `Choisie par vous parmi ${among}, sans élimination.`,
    validated: (among: string) => `Choisie par élimination parmi ${among}, et validée par vous.`, overJudges: (among: string, j: string) => `Choisie par vous ; l'élimination des juges parmi ${among} avait retenu ${j}.`,
    measuredAt: (m: string, left: string) => `Mesuré à ${m} px, les largeurs que ce run a déclarées${left ? ` ; ${left} px laissés de côté` : ""}.`,
    round: (n: number) => `Tour ${n}`, now: "Le front tel qu'il est", strong: "Point fort : ", weak: "Point faible : ", fit: "Adéquation : ",
    checksFound: "Ses contrôles ont trouvé : ", passesChecks: "Elle passe tous les contrôles.", notChecked: "Ses contrôles n'ont pas pu la mesurer.",
    brokeAt: (n: string, why: string) => `il s'est arrêté à l'étape ${n} : ${why}`, notLoaded: "ne chargeait pas avant le run, et n'a pas été mesurée après", startFrom: (s: string, why: string) => `Le tri commencerait par ${s} : ${why}`,
    advice: "Un conseil seulement : c'est vous qui choisissez, une direction ou un mélange.", chosen: (s: string, why?: string) => `Choisie : ${s}${why ? ` — ${why}` : "."}`, earlier: "Les tours d'avant",
    redoneOf: (k: number, n: number) => `${plural(k, "écran refait", "écrans refaits")} sur ${n}`, improvedOf: (k: number, n: number) => `${k} parcours amélioré${k > 1 ? "s" : ""} sur ${n}`,
    failsOn: (p: number, s: number, n: number) => `${plural(p, "problème", "problèmes")} ${s === n && n > 1 ? `sur les ${n} écrans` : `sur ${s} écran${s > 1 ? "s" : ""} sur ${n}`}`, failsOnJourneys: (p: number, j: number, n: number) => `${plural(p, "problème", "problèmes")} ${j === n && n > 1 ? `sur les ${n} parcours` : `sur ${j} parcours sur ${n}`}`,
    putBackLede: (n: number) => `${plural(n, "écran a été remis", "écrans ont été remis")} comme avant : la version d'AEOM n'était pas meilleure.`,
    leftLede: (n: number) => (n ? `Il reste ${plural(n, "problème", "problèmes")} à régler.` : "Il ne reste rien à régler."), missingLede: (n: number) => `${plural(n, "parcours a", "parcours ont")} besoin d'une fonctionnalité qu'AEOM n'a pas construite.`,
    judgedLede: "Rien n'a été refait : voici ce qui ne va pas, écran par écran et parcours par parcours.", builtLede: (s: number, j: number) => `${plural(s, "écran", "écrans")} et ${j} parcours, construits sur la direction choisie.`,
    tScreens: "problèmes sur les écrans", tJourneys: "problèmes sur les parcours", tStill: "encore à régler", tMissing: (n: number): string => (n === 1 ? "fonctionnalité qui manque" : "fonctionnalités qui manquent"), tClean: "écrans sans problème",
    gRedone: "Refaits", gBuilt: "Construits", gBack: "Remis comme avant", gBackNote: "AEOM a essayé : sa version n'était pas meilleure, la page reste celle d'avant.", gSame: "Inchangés", gBroken: "Ne chargent pas", gFailing: "Avec des problèmes", gClean: "Sans problème",
    drag: "Glisse sur une image pour passer d'avant à après.", whole: "Voir la page entière", wholeJourney: "Voir chaque étape", close: "Fermer", computer: "Ordinateur", phone: "Téléphone",
    problems: (n: number): string => (n === 1 ? "problème" : "problèmes"), worse: (b: string, a: string) => `sa version faisait pire : ${b} → ${a}`, same: (b: string, a: string) => `sa version ne faisait pas mieux : ${b} → ${a}`,
    atEndCount: (n: number) => `${n} à la fin`, roundsOf: (n: number) => (n === 1 ? "Le tour de directions" : `Les ${n} tours de directions`), stepsOf: (n: number) => `Les ${n} étapes`, jump: "Aller à", step: "étape",
    names: {
      "one-direction": "une seule direction", "consistent-chrome": "en-tête et boutons pareils partout", "not-generic": "rien de générique", "not-ai-default": "pas un look d'IA par défaut",
      hierarchy: "une hiérarchie claire", grid: "une grille alignée", density: "une densité maîtrisée", states: "des états vides et d'erreur dessinés", "charter-kept": "la charte respectée",
      "clear-start": "un départ clair", "next-step": "l'étape suivante visible", "no-dead-end": "pas d'impasse", "result-shown": "le résultat montré", "same-words": "les mêmes mots partout", short: "un parcours court",
      cursor: "un curseur main sur ce qui se clique", overflow: "pas de défilement de côté", contrast: "assez de contraste", console: "une console sans erreur", header: "un en-tête qui reste", wrap: "des libellés sur une ligne",
      uneven: "des cartes de même forme", clipped: "pas de texte coupé", "tap-size": "des cibles assez grandes", "font-size": "un texte assez grand", "line-length": "des lignes pas trop longues", zoom: "le zoom laissé",
      images: "des images qui chargent", labels: "un nom pour chaque contrôle", focus: "un focus visible", "layout-shift": "une page qui ne saute pas", "gradient-text": "pas de texte en dégradé", "side-stripe": "pas de liseré d'un côté",
      "nested-card": "pas de carte dans une carte", bounce: "pas de mouvement qui rebondit", placeholder: "pas de trou à remplir", "ai-text": "pas de texte sur l'interface", "hollow-words": "pas de mots creux",
      "nested-radius": "des coins qui se suivent", orphan: "pas de mot seul en fin de titre", motion: "un mouvement qui garde la mise en page", finish: "une page finie",
    } as Record<string, string>,
  },
};
type Words = (typeof WORDS)["en"];

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** A path inside the run's folder, each segment URL-encoded: a `#` or `?` in a file name stays part of the name. */
const href = (path: string) => path.split("/").map((segment) => encodeURI(segment).replace(/#/g, "%23").replace(/\?/g, "%3F")).join("/");
const img = (src: string | null, alt: string, w: Words = WORDS.en) => (src ? `<img src="${escape(href(src))}" alt="${escape(alt)}" loading="lazy">` : `<p class="none">${w.noCapture}</p>`);

/** A principle or a check by its words, its width said apart: `font-size@390` is « text big enough to read (390 px) ». */
const nameOf = (slug: string, w: Words) => {
  const [id, width] = slug.split("@");
  return `${w.names[id!] ?? id}${width ? ` (${width} px)` : ""}`;
};
const chips = (items: string[], kind: "ok" | "bad", w: Words) => (items.length ? `<ul class="chips">${items.map((i) => `<li class="chip chip--${kind}">${escape(nameOf(i, w))}</li>`).join("")}</ul>` : "");

/**
 * What a failure says, split in its principle or check and the rest. A check's message drops the selector of the
 * element at fault and keeps the text it shows: « line-length: p.m-0 "Pour les équipes": about 91… » is the check
 * `line-length`, then « "Pour les équipes": about 91… ».
 */
const splitFailure = (f: Failure): { id: string | null; rest: string } => {
  if (f.kind !== "check" && f.kind !== "principle" && f.kind !== "journey-principle") return { id: null, rest: f.what };
  const m = f.what.match(/^([a-z][a-z-]*)(?:@\d+| at \d+ px)?(?::\s*([\s\S]*))?$/);
  if (!m) return { id: null, rest: f.what };
  const rest = m[2] ?? "";
  const quoted = f.kind === "check" ? rest.match(/^[^\s"]+\s+("[^"]*"[\s\S]*)$/) : null;
  return { id: m[1]!, rest: quoted ? quoted[1]! : rest };
};
const isJourney = (f: Failure) => f.kind === "journey" || f.kind === "journey-principle";

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

/** The screens in the order the page shows them: what the run redid or built first, then what it put back, then the rest. */
const SCREEN_ORDER: ResultPage["screens"][number]["status"][] = ["kept", "new", "sent back", "unchanged", "does not load", "missing"];
const orderedScreens = (r: ResultPage) => {
  const ordered = SCREEN_ORDER.flatMap((status) => r.screens.filter((s) => s.status === status));
  if (!isJudgement(r)) return ordered;
  // A judgement shows first the screens with something failing, or that do not load, then the others.
  const failing = (s: ResultPage["screens"][number]) => s.status === "does not load" || r.stillFailing.some((f) => f.where === s.page);
  return [...ordered.filter(failing), ...ordered.filter((s) => !failing(s))];
};
/** A run that only judged: it redid nothing, and its page says what fails. */
const isJudgement = (r: ResultPage) => r.judged === true && r.verdict?.nothingToRedo !== true && !r.built && (r.screens.length > 0 || r.journeys.length > 0 || !r.rounds?.length);
/** What still fails, grouped by where it fails, in the order each place first comes. */
const groupedFailures = (failures: Failure[]) => {
  const places = [...new Set(failures.map((f) => f.where))];
  return places.map((where) => ({ where, failures: failures.filter((f) => f.where === where) }));
};

/** Every verdict the page asks about, in its order: what `aeom report --serve` accepts a gesture on. */
export function pageVerdicts(r: ResultPage): PageVerdict[] {
  if (r.verdict?.nothingToRedo === true) return [NOTHING_TO_REDO];
  return [...(r.direction ? [ofDirection(r.direction)] : []), ...orderedScreens(r).map(ofScreen), ...r.journeys.map(ofJourney), ...groupedFailures(r.stillFailing).flatMap((g) => g.failures.flatMap((f) => ofFailure(f) ?? []))];
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

/**
 * The page's own gestures: a before / after dragged across, and a whole page opened from its template, so its full
 * captures load only when asked for.
 */
const pageScript = `
(() => {
  document.querySelectorAll(".cmp input").forEach((input) => input.addEventListener("input", () => input.parentElement.style.setProperty("--x", input.value + "%")));
  const dialog = document.getElementById("whole");
  if (!dialog) return;
  const body = dialog.querySelector(".whole__body");
  const widths = dialog.querySelector(".whole__widths");
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-whole]");
    if (!opener) return;
    const template = document.getElementById(opener.dataset.whole);
    if (!template) return;
    dialog.querySelector(".whole__title").textContent = opener.dataset.title || "";
    body.replaceChildren(template.content.cloneNode(true));
    const pairs = [...body.querySelectorAll(".pair")];
    widths.replaceChildren();
    const show = (i) => {
      pairs.forEach((p, j) => (p.hidden = j !== i));
      [...widths.children].forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
      body.scrollTop = 0;
    };
    if (pairs.length > 1) pairs.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p.dataset.label;
      b.addEventListener("click", () => show(i));
      widths.append(b);
    });
    show(pairs.length - 1);
    dialog.showModal();
  });
  dialog.querySelector(".whole__close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
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

/** A phone is narrower than a tablet: its captures are shown tall, the others wide. */
const isPhone = (width: number) => width < 600;

/** The page, standalone: its styles and fonts inline, its images beside it in the run's folder, nothing from the network. */
export function resultHtml(r: ResultPage, { rates, lang = "en" }: { rates?: Record<string, { agreed: number; total: number }>; lang?: PageLang } = {}): string {
  const w = WORDS[lang] ?? WORDS.en;
  const say = sayIn(w);
  const shown = (status: string) => w.status[status] ?? status;
  // What reading the run wrote in its own words: said in the page's language.
  const told = (text: string) => text.replace(/^it broke at step (\d+): ([\s\S]*)$/, (_, n: string, why: string) => w.brokeAt(n, why)).replace(/^did not load before the run, and was not measured after the run$/, w.notLoaded);
  const nothing = r.verdict?.nothingToRedo === true;
  // A run of directions alone, /aeom directions: no screen redone, its directions are what it gave.
  const onlyDirections = !r.screens.length && !r.journeys.length && !!r.rounds?.length;
  // A run that judged and redid nothing, /aeom judge: what fails is what it gave.
  const judged = isJudgement(r) && !onlyDirections;
  const widthLabel = (width: number) => `${isPhone(width) ? w.phone : w.computer} · ${width} px`;

  // Every whole page the page can open, kept in a template: its full captures load only when it is opened.
  const wholes: string[] = [];
  const pair = (at: { width: number; before: string | null; after: string | null }, what: string) => {
    const one = (caption: string, src: string | null, alt: string) => `<figure><figcaption>${caption}</figcaption>${img(src, alt, w)}</figure>`;
    const sides = r.built
      ? one(r.replug ? w.onApi : w.builtSide, at.after, `${what}, ${at.width} px`)
      : `${one(w.before, at.before, `${what} ${w.beforeWord}, ${at.width} px`)}${nothing || judged ? "" : one(w.after, at.after, `${what} ${w.afterWord}, ${at.width} px`)}`;
    return `<div class="pair${isPhone(at.width) ? " pair--phone" : ""}" data-label="${escape(widthLabel(at.width))}"><p class="label">${escape(widthLabel(at.width))}</p><div class="sides">${sides}</div></div>`;
  };
  const whole = (what: string, label: string, content: string) => {
    const id = `whole-${wholes.length + 1}`;
    wholes.push(`<template id="${id}">${content}</template>`);
    return `<button type="button" class="open" data-whole="${id}" data-title="${escape(what)}">${label}</button>`;
  };

  // A before / after on one frame, the top of the page: drag across it to see one or the other.
  const compare = (at: { width: number; before: string | null; after: string | null }, what: string) =>
    at.before && at.after
      ? `<div class="cmp${isPhone(at.width) ? " cmp--phone" : ""}">${img(at.before, `${what} ${w.beforeWord}, ${at.width} px`, w)}<div class="cmp__after">${img(at.after, `${what} ${w.afterWord}, ${at.width} px`, w)}</div><span class="cmp__tag cmp__tag--before">${w.before}</span><span class="cmp__tag cmp__tag--after">${w.after}</span><span class="cmp__line" aria-hidden="true"></span><input type="range" min="0" max="100" value="50" aria-label="${escape(`${what}, ${widthLabel(at.width)}: ${w.before} / ${w.after}`)}"></div>`
      : thumb(at.after ?? at.before, what, at.width);
  const thumb = (src: string | null, what: string, width: number) => `<div class="thumb${isPhone(width) ? " thumb--phone" : ""}">${img(src, `${what}, ${width} px`, w)}</div>`;
  // The widest width first, then the narrowest when it differs: a computer and a phone.
  const two = <T extends { width: number }>(widths: T[]) => {
    const sorted = [...widths].sort((a, b) => b.width - a.width);
    return sorted.length > 1 ? [sorted[0]!, sorted.at(-1)!] : sorted;
  };

  // The head: the verdict in one sentence, then four numbers.
  const before = r.verdict?.failures ?? [];
  const screensBefore = before.filter((f) => !isJourney(f)).length;
  const journeysBefore = before.filter(isJourney).length;
  const still = r.stillFailing;
  const screensAfter = still.filter((f) => !isJourney(f)).length;
  const journeysAfter = still.filter(isJourney).length;
  const redone = r.screens.filter((s) => s.status === "kept").length;
  const putBack = r.screens.filter((s) => s.status === "sent back").length;
  const improved = r.journeys.filter((j) => j.status === "kept").length;
  const named = r.features?.entries.length ? r.features : null;
  const tile = (n: string, label: string) => `<div class="num"><strong>${n}</strong><span>${label}</span></div>`;
  const after = (n: number) => (r.measuredAfter ? String(n) : "?");
  const failingScreens = new Set(still.filter((f) => !isJourney(f)).map((f) => f.where)).size;
  const failingJourneys = new Set(still.filter(isJourney).map((f) => f.where)).size;

  const title = onlyDirections ? w.directions : r.replug ? w.replug : r.built ? w.built : nothing ? w.nothing : judged ? w.judged : w.gave;
  const headline = r.built || r.replug || nothing || onlyDirections ? null
    : judged ? [w.failsOn(screensAfter, failingScreens, r.screens.length), ...(r.journeys.length ? [w.failsOnJourneys(journeysAfter, failingJourneys, r.journeys.length)] : [])].join(", ")
    : [w.redoneOf(redone, r.screens.length), ...(r.journeys.length ? [w.improvedOf(improved, r.journeys.length)] : [])].join(", ");
  const lede = onlyDirections ? "" : nothing ? (r.verdict ? escape(r.verdict.line) : "")
    : r.built ? w.builtLede(r.screens.length, r.journeys.length)
    : judged ? w.judgedLede
    : [putBack ? w.putBackLede(putBack) : "", r.measuredAfter ? w.leftLede(still.length) : w.notMeasured, named ? w.missingLede(named.entries.length) : ""].filter(Boolean).join(" ");
  const nums = onlyDirections || nothing ? ""
    : r.built ? `<div class="nums">${tile(String(still.length), w.tStill)}${named ? tile(String(named.entries.length), w.tMissing(named.entries.length)) : ""}</div>`
    : judged ? `<div class="nums">${tile(String(screensAfter), w.tScreens)}${r.journeys.length ? tile(String(journeysAfter), w.tJourneys) : ""}${tile(`${r.screens.length - failingScreens}/${r.screens.length}`, w.tClean)}</div>`
    : `<div class="nums">${tile(`${screensBefore} → ${after(screensAfter)}`, w.tScreens)}${r.journeys.length ? tile(`${journeysBefore} → ${after(journeysAfter)}`, w.tJourneys) : ""}${tile(after(still.length), w.tStill)}${named ? tile(String(named.entries.length), w.tMissing(named.entries.length)) : ""}</div>`;
  const head = `<header class="top"><div class="wrap"><div class="bar"><span class="brand"><span class="eye" aria-hidden="true"><i></i></span>AEOM</span><p class="run">${escape(r.run)}</p></div>${headline ? `<p class="kicker">${title}</p><h1>${escape(headline)}</h1>` : `<h1>${title}</h1>`}${lede ? `<p class="lede">${lede}</p>` : ""}${nums}${widthsHtml(r.widths, w)}${nothing ? say(NOTHING_TO_REDO) : ""}${onlyDirections ? "" : `${ratesHtml(rates, w)}<p class="muted" id="feedback-note" hidden>${w.feedbackNote}</p>`}</div></header>`;


  // The screens: what was redone or built in large, the rest one line each.
  const failingOn = (page: string) => still.filter((f) => f.where === page);
  const large = (s: ResultPage["screens"][number]) => {
    const shots = two(s.widths).map((at) => compare(at, s.page)).join("");
    const count = s.count ? `<p class="score"><strong>${s.count.before} → ${s.count.after}</strong> ${w.problems(s.count.before)}</p>` : "";
    return `<article class="screen redo" data-page="${escape(s.page)}" data-status="${s.status}"><div class="redo__shots">${shots}</div><div class="redo__text"><h4 class="route">${escape(s.page)} <span class="status ${s.status.replace(/ /g, "-")}">${shown(s.status)}</span></h4>${count}${s.byKit ? `<p class="muted">${w.byKit}</p>` : ""}${s.cleared.length ? `<p class="small">${w.cleared}</p>${chips(s.cleared, "ok", w)}` : ""}${s.still.length ? `<p class="small">${w.stillList}</p>${chips(s.still, "bad", w)}` : ""}${s.newly.length ? `<p class="small">${w.newly}</p>${chips(s.newly, "bad", w)}` : ""}<div class="redo__foot">${whole(s.page, w.whole, s.widths.map((at) => pair(at, s.page)).join(""))}${say(ofScreen(s))}</div></div></article>`;
  };
  const row = (s: ResultPage["screens"][number]) => {
    const widest = two(s.widths)[0];
    const why = s.back
      ? `${(s.back.verdict === "worse" ? w.worse : w.same)(escape(String(s.back.before ?? "?")), escape(String(s.back.after ?? "?")))}${s.back.lost?.length ? ` · ${w.lost} ${s.back.lost.map(escape).join(", ")}` : ""}`
      : "";
    const fails = failingOn(s.page);
    const end = s.status === "does not load" ? "" : judged ? `<b class="${fails.length ? "bad" : "ok"}">${fails.length}</b> ${w.problems(fails.length)}` : s.count ? `<b class="${s.count.after ? "bad" : "ok"}">${s.count.after}</b> ${escape(w.atEndCount(s.count.after).replace(/^\d+ /, ""))}` : "";
    const ids = [...new Set(fails.map((f) => splitFailure(f).id).filter((id): id is string => !!id))];
    return `<li class="screen row" data-page="${escape(s.page)}" data-status="${s.status}">${widest ? whole(s.page, `${img(widest.after ?? widest.before, `${s.page}, ${widest.width} px`, w)}`, s.widths.map((at) => pair(at, s.page)).join("")) : `<span class="open open--none"></span>`}<span class="row__what"><span class="route">${escape(s.page)}</span>${s.status === "does not load" || s.status === "missing" ? ` <span class="status ${s.status.replace(/ /g, "-")}">${shown(s.status)}</span>` : ""}${why ? `<span class="why">${why}</span>` : ""}${judged && ids.length ? chips(ids, "bad", w) : ""}</span><span class="end">${end}</span>${nothing ? "" : say(ofScreen(s))}</li>`;
  };
  const group = (label: string, note: string, items: string) => (items ? `<div class="group"><h3>${label}</h3>${note ? `<p class="small">${note}</p>` : ""}${items}</div>` : "");
  const ordered = orderedScreens(r);
  const rows = (list: ResultPage["screens"]) => (list.length ? `<ul class="rows">${list.map(row).join("")}</ul>` : "");
  const tiles = (list: ResultPage["screens"]) => (list.length ? `<ul class="tiles">${list.map((s) => { const at = two(s.widths)[0]; return `<li class="screen" data-page="${escape(s.page)}" data-status="${s.status}">${at ? whole(s.page, img(at.before ?? at.after, `${s.page}, ${at.width} px`, w), s.widths.map((x) => pair(x, s.page)).join("")) : ""}<span class="route">${escape(s.page)}</span>${nothing ? "" : say(ofScreen(s))}</li>`; }).join("")}</ul>` : "");
  const screens = nothing
    ? tiles(ordered)
    : judged
      ? `${group(w.gFailing, "", rows(ordered.filter((s) => failingOn(s.page).length || s.status === "does not load")))}${group(w.gClean, "", tiles(ordered.filter((s) => !failingOn(s.page).length && s.status !== "does not load")))}`
      : `${group(r.built ? w.gBuilt : w.gRedone, r.built ? "" : w.drag, ordered.filter((s) => s.status === "kept" || s.status === "new").map(large).join(""))}${group(w.gBack, w.gBackNote, rows(ordered.filter((s) => s.status === "sent back")))}${group(w.gSame, "", rows(ordered.filter((s) => s.status === "unchanged")))}${group(w.gBroken, "", rows(ordered.filter((s) => s.status === "does not load" || s.status === "missing")))}`;

  const journeyStatus = (status: string) => w.journeyStatus[status] ?? status;
  const journeys = r.journeys
    .map((j) => {
      const n = (x: number | null) => escape(String(x ?? "?"));
      const steps = nothing ? "" : r.built ? `<span class="small">${n(j.steps.after)} ${w.steps}</span>` : judged ? `<span class="small">${n(j.steps.before)} ${w.steps}</span>` : `<span class="small">${n(j.steps.before)} → ${n(j.steps.after)} ${w.steps}</span>`;
      const strong = j.status === "kept" || j.status === "new";
      const strip = strong && j.strip?.length ? `<details open><summary>${w.stepsOf(j.strip.length)}</summary><ol class="strip">${j.strip.map((s) => `<li>${img(s.capture, `${j.name}, ${w.step} ${s.index}: ${s.action}`, w)}<span class="strip__n">${escape(String(s.index))}</span></li>`).join("")}</ol></details>` : "";
      // Unchanged, its status says it: the ratchet's reason is said only for a journey kept or put back.
      const why = j.why && j.status !== "unchanged" ? `<p class="muted">${escape(j.why)}</p>` : "";
      return `<li class="journey${strong ? " journey--strong" : ""}" data-journey="${escape(j.slug)}" data-status="${j.status}"><div class="journey__head"><h3>${escape(j.name)}</h3><span class="status ${j.status.replace(" ", "-")}">${journeyStatus(j.status)}</span>${steps}${chips(j.cleared, "ok", w)}${chips(j.remaining, "bad", w)}<span class="journey__acts">${j.widths.length ? whole(j.name, w.wholeJourney, j.widths.map((at) => pair(at, j.name)).join("")) : ""}${nothing ? "" : say(ofJourney(j))}</span></div>${j.broke.before ? `<p>${w.beforeTheRun}${escape(told(j.broke.before))}</p>` : ""}${j.broke.after && !nothing ? `<p>${w.atTheEnd}${escape(told(j.broke.after))}</p>` : ""}${why}${strip}</li>`;
    })
    .join("");

  const failureHtml = (f: Failure) => {
    const { id, rest } = splitFailure(f);
    return `<li>${id ? `<b>${escape(nameOf(id, w))}</b> ` : ""}${escape(told(rest))}${say(ofFailure(f))}</li>`;
  };
  const stillHtml = `${r.measuredAfter || judged ? "" : `<p class="muted">${w.notMeasured}</p>`}${
    still.length ? `<div class="left">${groupedFailures(still).map((g) => `<article><p class="route">${escape(g.where)}</p><ul>${g.failures.map(failureHtml).join("")}</ul></article>`).join("")}</div>` : r.measuredAfter ? `<p>${w.nothingLeft}</p>` : ""
  }`;

  const accepted = r.accepted?.length
    ? `<section id="accepted"><div class="wrap"><h2>${w.accepted}</h2><p class="muted">${w.acceptedNote}</p><ul class="plain">${r.accepted.map((f) => `<li><strong>${escape(f.where)}</strong> ${escape(f.what)}</li>`).join("")}</ul></div></section>`
    : "";
  const features = named
    ? `<section id="features"><div class="wrap"><h2>${w.features}</h2><p class="muted">${w.featuresNote}</p>${named.entries
        .map((f) => `<article class="feature" data-journey="${escape(f.slug)}"><div><h3>${escape(f.name)}</h3><p class="small">${w.blocksAtStep(escape(String(f.step)))} ${escape(f.why)}</p><p class="missing">${escape(f.missing)}</p></div><figure class="step">${img(f.capture, `${f.name}, ${w.blocksAt} ${f.step}`, w)}</figure></article>`)
        .join("")}${named.more ? `<p class="muted">${w.more(named.more)}</p>` : ""}</div></section>`
    : "";
  // Every round of directions, the last first: the front as it is, then each direction with what the comparison
  // says of it, what its checks found, and the choice. The top of each in large, the whole on demand.
  const shotOf = (src: string | null, alt: string) => (src ? `<div class="thumb thumb--direction">${whole(alt, img(src, alt, w), `<div class="pair" data-label="${escape(alt)}"><div class="sides"><figure>${img(src, alt, w)}</figure></div></div>`)}</div>` : img(src, alt, w));
  const roundHtml = (round: NonNullable<ResultPage["rounds"]>[number]) =>
    `<section class="round" data-round="${round.round}"><h3>${w.round(round.round)}</h3><div class="entrants">${round.now ? `<article class="direction direction-now"><h4>${w.now}</h4>${shotOf(round.now, w.now)}</article>` : ""}${round.entrants
      .map(
        (e) =>
          `<article class="direction" data-slug="${escape(e.slug)}"><h4>${escape(e.slug)}${round.decision?.applied === e.slug ? ` <span class="status kept">${w.chosenTag}</span>` : ""}</h4>${shotOf(e.image, e.slug)}${e.note ? `<p>${escape(e.note)}</p>` : ""}${e.compare ? `<p><span class="label">${w.strong}</span>${escape(e.compare.strong)}</p><p><span class="label">${w.weak}</span>${escape(e.compare.weak)}</p><p><span class="label">${w.fit}</span>${escape(e.compare.fit)}</p>` : ""}${e.checks === null ? `<p class="muted">${w.notChecked}</p>` : e.checks ? `<p class="muted">${e.checks.length ? `${w.checksFound}${escape(e.checks.join(", "))}` : w.passesChecks}</p>` : ""}</article>`,
      )
      .join("")}</div>${round.start ? `<p>${escape(w.startFrom(round.start.slug, round.start.why))} <span class="muted">${w.advice}</span></p>` : ""}${round.decision ? `<p class="chosen"><strong>${escape(w.chosen(round.decision.applied, round.decision.why))}</strong></p>` : ""}</section>`;
  const [latest, ...earlier] = r.rounds ?? [];
  // On a page of directions alone, the page's own title says it already.
  const directions = latest && (!r.direction || onlyDirections) ? `<section id="directions"><div class="wrap">${onlyDirections ? "" : `<h2>${w.directions}</h2>`}${roundHtml(latest)}${earlier.length ? `<details><summary>${w.earlier}</summary>${earlier.map(roundHtml).join("")}</details>` : ""}</div></section>` : "";

  const direction = r.direction
    ? `<section id="direction"><div class="wrap"><div class="card direction"><h2>${w.directionOf(escape(r.direction.champion))}</h2>${r.direction.sentence ? `<p>${escape(r.direction.sentence)}</p>` : ""}<p class="muted">${chosenBy(r.direction, w)}</p>${[...r.direction.reasons, ...(r.direction.decision?.why ? [r.direction.decision.why] : [])].map((x) => `<blockquote>${escape(x)}</blockquote>`).join("")}${r.rounds?.length ? `<details class="rounds"><summary>${w.roundsOf(r.rounds.length)}</summary>${r.rounds.map(roundHtml).join("")}</details>` : ""}${r.direction.sheet ? `<div class="sheet">${whole(w.sheetAlt, img(r.direction.sheet, w.sheetAlt, w), `<div class="pair" data-label="${escape(w.sheetAlt)}"><div class="sides"><figure>${img(r.direction.sheet, w.sheetAlt, w)}</figure></div></div>`)}</div>` : ""}${say(ofDirection(r.direction))}</div></div></section>`
    : r.verdict?.keepStyle
      ? `<section id="direction"><div class="wrap"><div class="card direction"><h2>${w.styleKept}</h2><p class="muted">${w.styleKeptNote}</p></div></div></section>`
      : "";

  const count = (n: number) => `<b>${n}</b>`;
  const nav = nothing || onlyDirections ? "" : `<nav class="jump" aria-label="${w.jump}"><div class="wrap">${r.rounds?.length && !r.direction ? `<a href="#directions">${w.directions}</a>` : ""}${r.direction || r.verdict?.keepStyle ? `<a href="#direction">${w.direction}</a>` : ""}<a href="#screens">${w.screens}${count(r.screens.length)}</a>${r.journeys.length ? `<a href="#journeys">${w.journeys}${count(r.journeys.length)}</a>` : ""}${named ? `<a href="#features">${w.features}${count(named.entries.length)}</a>` : ""}<a href="#still">${judged ? w.judged : w.still}${count(still.length)}</a></div></nav>`;
  const screensSection = `<section id="screens"><div class="wrap"><h2>${w.screens}</h2>${screens}</div></section>`;
  const journeysSection = r.journeys.length ? `<section id="journeys"><div class="wrap"><h2>${w.journeys}</h2><ol class="journeys">${journeys}</ol></div></section>` : "";
  const body = onlyDirections
    ? `${direction}${directions}`
    : nothing
    ? `${screensSection}${journeysSection}${accepted}`
    : `${directions}${direction}${screensSection}${journeysSection}${features}<section id="still"><div class="wrap"><h2>${judged ? w.judged : w.still}</h2>${stillHtml}</div></section>${accepted}`;
  const foot = `<footer><div class="wrap">${r.verdict && !nothing ? `<p>${judged ? "" : w.beforeRun}${escape(r.verdict.line)}</p>` : ""}${r.judges ? `<p>${w.judgedBy(escape(r.judges.models.join(", ") || w.unnamed), escape(r.judges.principles))}</p>` : ""}</div></footer>`;
  const dialog = wholes.length ? `<dialog id="whole" aria-labelledby="whole-title"><div class="whole"><div class="whole__bar"><span class="whole__title route" id="whole-title"></span><span class="whole__widths" role="group"></span><button type="button" class="whole__close">${w.close}</button></div><div class="whole__body"></div></div></dialog>${wholes.join("")}` : "";

  return `<!doctype html>
<html lang="${lang === "fr" ? "fr" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AEOM · ${escape(r.run)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23fff' stroke='%2316130f' stroke-width='3'/%3E%3Ccircle cx='18' cy='16' r='6' fill='%2316130f'/%3E%3C/svg%3E">
<style>
${fontFaces()}
  /* AEOM's own kit, as its site wears it: sun, ink and the eye. The verdict first; what was redone in large, the rest one line each. */
  :root {
    --sun: #ffd84d; --ink: #16130f; --paper: #fffaf0; --white: #ffffff; --muted: #5a5246; --rule: rgba(22, 19, 15, 0.14);
    --ok: #1f7a45; --ok-soft: #dff3e5; --bad: #b8321a; --bad-soft: #ffe3dc; --flat: #efe8d8;
    --display: "Bricolage Grotesque", system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
    --gutter: max(16px, min(4vw, 40px));
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; } /* over any display rule, such as .say's flex: opened as a file, the page asks for nothing */
  html { scroll-padding-top: 64px; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 500 15px/1.45 var(--display); -webkit-font-smoothing: antialiased; }
  h1, h2, h3, h4, p, ul, ol, figure, blockquote { margin: 0; }
  h1, h2, h3, h4 { font-weight: 800; letter-spacing: -0.02em; text-wrap: balance; }
  p, li { text-wrap: pretty; }
  img { display: block; max-width: 100%; height: auto; }
  button { font: inherit; color: inherit; cursor: pointer; }
  a { color: inherit; }
  :focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; border-radius: 6px; }
  code, .route, .run { font-family: var(--mono); font-weight: 500; }
  .wrap { max-width: 1120px; margin: 0 auto; padding-left: var(--gutter); padding-right: var(--gutter); }
  .muted, .small, .label, figcaption { color: var(--muted); }
  .small { font-size: 13px; }
  .route { font-size: 13px; overflow-wrap: anywhere; }

  .eye { display: inline-block; flex: none; position: relative; width: 20px; height: 20px; border-radius: 50%; background: var(--white); border: 2px solid var(--ink); }
  .eye i { position: absolute; width: 44%; height: 44%; left: 28%; top: 28%; border-radius: 50%; background: var(--ink); transform: translate(18%, 4%); }

  .top { background: var(--sun); border-bottom: 2px solid var(--ink); }
  .top .wrap { padding-block: 20px 24px; display: grid; gap: 14px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; }
  .brand { display: inline-flex; gap: 8px; align-items: center; font-weight: 800; letter-spacing: 0.04em; }
  .run { font-size: 12px; }
  .kicker { font-weight: 800; font-size: 14px; }
  .top h1 { font-size: clamp(28px, 4.4vw, 46px); line-height: 1.02; letter-spacing: -0.04em; max-width: 32ch; }
  .lede { font-size: 17px; max-width: 64ch; }
  .line { font-size: 14px; }
  .nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
  .num { background: var(--paper); border: 2px solid var(--ink); border-radius: 14px; padding: 12px 14px; }
  .num strong { display: block; font-size: 30px; line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; margin-bottom: 4px; }
  .num span { font-size: 13px; color: var(--muted); }
  .rates { font-size: 13px; }
  .top .muted { font-size: 13px; }

  .jump { position: sticky; top: 0; z-index: 5; background: var(--paper); border-bottom: 1px solid var(--rule); }
  .jump .wrap { display: flex; gap: 6px; overflow-x: auto; padding-block: 10px; scrollbar-width: none; }
  .jump a { flex: none; text-decoration: none; font-weight: 700; font-size: 14px; padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--ink); background: var(--white); }
  .jump a:hover { background: var(--sun); }
  .jump b { margin-left: 5px; color: var(--muted); font-variant-numeric: tabular-nums; }

  section { padding-block: 32px 4px; }
  section > .wrap > h2 { font-size: 24px; margin-bottom: 14px; }
  .group { display: grid; gap: 12px; margin-bottom: 26px; }
  .group > h3 { font-size: 17px; }
  .group > .small { margin-top: -8px; }

  .card { background: var(--white); border: 2px solid var(--ink); border-radius: 18px; padding: 16px 18px; box-shadow: 4px 4px 0 var(--ink); display: grid; gap: 8px; }
  .direction h2 { font-size: 20px; }
  main p, main li, footer p { max-width: 64ch; }
  blockquote { padding-left: 12px; border-left: 3px solid var(--sun); color: var(--muted); }
  .sheet { max-width: 520px; }
  .sheet .open, .rounds .open { width: 100%; aspect-ratio: 16 / 10; }

  .status { display: inline-block; font: 800 12px/1 var(--display); letter-spacing: 0.02em; padding: 4px 9px; border-radius: 999px; background: var(--flat); color: var(--muted); vertical-align: 2px; }
  .status.kept, .status.new { background: var(--ok); color: var(--white); }
  .status.sent-back, .status.missing, .status.does-not-load { background: var(--bad-soft); color: var(--bad); }

  .open { display: inline-flex; align-items: center; gap: 6px; border: 2px solid var(--ink); background: var(--sun); border-radius: 10px; padding: 7px 12px; font-weight: 800; font-size: 14px; box-shadow: 2px 2px 0 var(--ink); }
  .open:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--ink); }
  .open:has(img) { padding: 0; background: var(--white); overflow: hidden; border-width: 1.5px; box-shadow: none; border-radius: 8px; }
  .open img { width: 100%; height: 100%; object-fit: cover; object-position: top; }

  .cmp, .thumb { position: relative; overflow: hidden; border: 2px solid var(--ink); border-radius: 12px; background: var(--white); aspect-ratio: 16 / 10; --x: 50%; }
  .cmp--phone, .thumb--phone { aspect-ratio: 9 / 19; }
  .cmp img, .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .thumb .open { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; }
  .cmp__after { position: absolute; inset: 0; clip-path: inset(0 0 0 var(--x)); }
  .cmp__line { position: absolute; top: 0; bottom: 0; left: var(--x); width: 3px; margin-left: -1.5px; background: var(--ink); pointer-events: none; }
  .cmp__line::after { content: "‹ ›"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--sun); border: 2px solid var(--ink); border-radius: 999px; padding: 2px 7px; font: 800 13px/1 var(--display); white-space: nowrap; }
  .cmp__tag { position: absolute; top: 8px; z-index: 1; font: 800 12px/1 var(--display); padding: 4px 8px; border-radius: 999px; pointer-events: none; }
  .cmp__tag--before { left: 8px; background: var(--ink); color: var(--paper); }
  .cmp--phone .cmp__tag { display: none; }
  .cmp__tag--after { right: 8px; background: var(--sun); color: var(--ink); border: 1.5px solid var(--ink); }
  .cmp input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
  .cmp:has(input:focus-visible) { outline: 3px solid var(--ink); outline-offset: 3px; }

  .redo { display: grid; grid-template-columns: minmax(0, 1fr) 270px; gap: 20px; background: var(--white); border: 2px solid var(--ink); border-radius: 18px; padding: 16px; box-shadow: 4px 4px 0 var(--ink); }
  .redo__shots { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 12px; align-items: start; }
  .redo__shots:has(> :only-child) { grid-template-columns: minmax(0, 1fr); }
  .redo__text { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .redo .route { font-size: 15px; font-weight: 500; }
  .score { font-size: 15px; }
  .score strong { font-size: 32px; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; margin-right: 4px; }
  .redo__foot { margin-top: auto; display: grid; gap: 8px; justify-items: start; }
  .chips { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { font-size: 12.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
  .chip--ok { background: var(--ok-soft); color: var(--ok); }
  .chip--ok::before { content: "✓ "; }
  .chip--bad { background: var(--bad-soft); color: var(--bad); }

  .rows { list-style: none; padding: 0; border-top: 1.5px solid var(--ink); }
  .row { display: grid; grid-template-columns: 76px minmax(0, 1fr) auto auto; gap: 8px 16px; align-items: center; padding-block: 9px; border-bottom: 1px solid var(--rule); }
  .row > .open { width: 76px; aspect-ratio: 16 / 10; }
  .row__what { display: grid; gap: 4px; min-width: 0; }
  .why { font-size: 13.5px; color: var(--muted); }
  .end { font-size: 13px; color: var(--muted); white-space: nowrap; }
  .end b { font-size: 17px; margin-right: 2px; }
  .ok { color: var(--ok); } .bad { color: var(--bad); }
  .tiles { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
  .tiles li { display: grid; gap: 6px; }
  .tiles .open { aspect-ratio: 16 / 10; width: 100%; }

  .journeys { list-style: none; padding: 0; display: grid; gap: 12px; }
  .journey { border: 1.5px solid var(--ink); border-radius: 14px; padding: 12px 14px; background: var(--white); display: grid; gap: 8px; }
  .journey--strong { border-width: 2px; box-shadow: 4px 4px 0 var(--ink); }
  .journey__head { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
  .journey__head h3 { font-size: 17px; }
  .journey__head .chips { display: contents; }
  .journey__acts { margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .journey__acts .open { padding: 5px 10px; font-size: 13px; }
  details > summary { cursor: pointer; font-size: 13.5px; font-weight: 700; width: fit-content; }
  .strip { list-style: none; padding: 0; margin-top: 8px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .strip li { position: relative; }
  .strip img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; border: 1.5px solid var(--ink); border-radius: 8px; background: var(--white); }
  .strip__n { position: absolute; left: 6px; top: 6px; width: 22px; height: 22px; border-radius: 50%; background: var(--ink); color: var(--sun); font: 800 12px/22px var(--display); text-align: center; }

  .feature { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 18px; align-items: start; border: 2px dashed var(--ink); border-radius: 16px; padding: 16px; margin-top: 12px; }
  .feature h3 { font-size: 17px; }
  .missing { font-size: 18px; font-weight: 800; line-height: 1.25; margin-top: 6px; }
  figure.step img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; border: 1.5px solid var(--ink); border-radius: 8px; }

  .left { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; }
  .left article { border-top: 2px solid var(--ink); padding-top: 10px; display: grid; gap: 6px; align-content: start; }
  .left ul, .plain { list-style: none; padding: 0; display: grid; gap: 10px; }
  .left li, .plain li { font-size: 14px; }
  .left li b { color: var(--bad); }

  .entrants { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 12px; }
  .round + .round, details .round { margin-top: 24px; }
  .round > h3 { font-size: 17px; }
  .direction { display: grid; gap: 8px; align-content: start; }
  .direction h4 { font-size: 16px; }
  .thumb--direction { aspect-ratio: 4 / 3; }
  .chosen { margin-top: 14px; }
  details > summary { margin-top: 18px; }

  .say { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .say button { border: 1.5px solid var(--ink); background: var(--white); border-radius: 999px; padding: 4px 11px; font-size: 12.5px; font-weight: 700; }
  .say button[aria-pressed="true"][data-agree="true"] { background: var(--ok); border-color: var(--ok); color: var(--white); }
  .say button[aria-pressed="true"][data-agree="false"] { background: var(--bad); border-color: var(--bad); color: var(--white); }
  .say input { display: none; font: inherit; font-size: 13px; padding: 4px 8px; border: 1.5px solid var(--ink); border-radius: 8px; background: var(--white); color: var(--ink); flex: 1 1 200px; min-width: 0; }
  .say[data-agree="false"] input { display: block; }
  .said { font-size: 12.5px; color: var(--muted); }
  .left .say { margin-top: 4px; }

  footer { padding-block: 32px 44px; }
  footer p { font-size: 13px; color: var(--muted); }

  dialog { width: min(1200px, 96vw); height: 92vh; max-height: 92vh; padding: 0; border: 2px solid var(--ink); border-radius: 16px; background: var(--paper); color: var(--ink); }
  dialog::backdrop { background: rgba(22, 19, 15, 0.6); }
  .whole { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100%; }
  .whole__bar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; padding: 10px 14px; border-bottom: 1.5px solid var(--ink); background: var(--sun); }
  .whole__title { margin-right: auto; font-size: 14px; }
  .whole__widths { display: inline-flex; border: 1.5px solid var(--ink); border-radius: 999px; overflow: hidden; }
  .whole__widths:empty { display: none; }
  .whole__widths button { border: 0; background: var(--white); padding: 5px 12px; font-weight: 700; font-size: 13px; }
  .whole__widths button + button { border-left: 1.5px solid var(--ink); }
  .whole__widths button[aria-pressed="true"] { background: var(--ink); color: var(--sun); }
  .whole__close { border: 1.5px solid var(--ink); background: var(--white); border-radius: 999px; padding: 5px 12px; font-weight: 800; }
  .whole__body { overflow: auto; padding: 14px; }
  .pair > .label { display: none; }
  .sides { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); grid-auto-flow: column; gap: 14px; align-items: start; }
  .sides figure { display: grid; gap: 6px; justify-items: center; }
  .sides figcaption { font-weight: 800; font-size: 13px; }
  .sides img { border: 1.5px solid var(--ink); border-radius: 6px; background: var(--white); }
  .pair--phone .sides img { max-width: 390px; }
  .none { color: var(--muted); font-style: italic; }

  @media (max-width: 860px) {
    .redo, .feature, .left, .entrants { grid-template-columns: 1fr; }
    .row { grid-template-columns: 64px minmax(0, 1fr) auto; }
    .row > .open { width: 64px; grid-row: span 2; }
    .row .say { grid-column: 2 / -1; }
  }
  @media (max-width: 520px) {
    .redo__shots { grid-template-columns: minmax(0, 1fr) 84px; }
    .whole__body { padding: 8px; }
    .sides { gap: 8px; }
  }
</style>
</head>
<body>
${head}
${nav}
<main>
${body}
</main>
${foot}
${dialog}
<script>${feedbackScript(w)}</script>
<script>${pageScript}</script>
</body>
</html>
`;
}
