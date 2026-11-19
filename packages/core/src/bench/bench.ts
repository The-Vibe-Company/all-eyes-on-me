import { pageShape } from "../capture/index.js";
import type { Violation } from "../journey/index.js";
import type { Failure, ResultPage } from "../run/index.js";

/**
 * The bench: apps whose defects were noted by hand, run through /aeom, and
 * what the run found and fixed of them, counted from its result page. Modelled
 * on skill-creator's evaluation: the cases and what is expected of them, a
 * grading that cites its proof, a table across them.
 */

/** A defect noted by hand: where it is, what is wrong, and the checks or principles that would name it. */
export interface Defect {
  id: string;
  /** A screen's route, `*` for any screen when the defect spans the site, or a key journey's name. */
  where: string;
  what: string;
  /** Check or principle ids, `breaks` for a journey that stops, `does not load` for a page; none when nothing in AEOM names it yet. */
  match: string[];
  /** Why the match is what it is, when it is not obvious: a defect no check sees, one only a judge can. */
  note?: string;
}

export interface DefectList {
  app: string;
  /** Who noted them and how, so a reader knows what the bench measures against. */
  noted: string;
  defects: Defect[];
}

export interface DefectScore {
  id: string;
  where: string;
  what: string;
  /** The failure the run reported before it changed anything, as proof; null when it never named the defect. */
  found: string | null;
  /** True when the end no longer fails it, false when it still does, null when it was not found or the end was not measured. */
  fixed: boolean | null;
  /** The failure that still names it at the end. */
  still: string | null;
  /** True when nothing in AEOM names such a defect yet: never found, by construction. */
  unnamed?: true;
}

export interface AppScore {
  app: string;
  run: string | null;
  /** Why the app was not measured: it did not start, no run, a run folder the page cannot read. */
  error?: string;
  defects: DefectScore[];
  found: number;
  fixed: number;
  total: number;
  /** A check or principle that passed before and fails at the end, a journey that breaks only at the end. */
  regressions: string[];
  /** A call or a file the guard refuses: a feature the run added on its own. */
  hiddenFeatures: string[];
  /** What the run found beyond the defects noted: to add to the list, or to reject. */
  extra: string[];
  /** What `aeom cost` measured, at the API's list prices. */
  dollars: number | null;
  /** The tokens it counted, read, written and produced; and the calls of a model it has no price for. */
  tokens: number | null;
  unpriced: number;
  /** Why the hidden features were not counted: the run rewrote its journeys, so the replays walk different paths. */
  guardNote?: string;
}

/** The id a failure names: a check's or a principle's, `breaks`, or `does not load`. */
const idOf = (f: Failure) => (f.kind === "journey" ? "breaks" : f.kind === "page" ? "does not load" : f.what.split(":")[0]!.trim());
const said = (f: Failure) => `${f.where}: ${f.what}`;
/**
 * A route by its shape, so `/commandes/12` is `/commandes/:id`, its query left out when the defect names none
 * (`/cours.html?id=x` is `/cours.html`); `*`, any screen; a journey's name as it is written, case aside.
 */
const sameWhere = (failure: string, defect: string) => {
  if (!failure.startsWith("/")) return failure.trim().toLowerCase() === defect.trim().toLowerCase();
  if (defect === "*") return true;
  if (!defect.startsWith("/")) return false;
  const route = defect.includes("?") ? failure : failure.replace(/[?#].*$/, "");
  return pageShape(route) === pageShape(defect);
};
const isJourney = (d: Defect) => !d.where.startsWith("/") && d.where !== "*";
const names = (d: Defect) => (f: Failure) => sameWhere(f.where, d.where) && d.match.includes(idOf(f));

/** What a run could not be scored on: the app or its run, said instead of counted. */
export const unscored = (app: string, total: number, run: string | null, error: string): AppScore => ({ app, run, error, defects: [], found: 0, fixed: 0, total, regressions: [], hiddenFeatures: [], extra: [], dollars: null, tokens: null, unpriced: 0 });

/**
 * What one run found and fixed of an app's defects, from its result page, the guard's refusals and its cost. A defect
 * is fixed only where the end was measured: its screens for a screen's, its journey replayed at the end for a
 * journey's, and the journeys judged again at the end when a principle names it.
 */
export function scoreRun({ defects, page, refused, dollars, tokens = null, unpriced = 0, journeysJudgedAtEnd = false, guardNote }: { defects: DefectList; page: ResultPage; refused: Violation[]; dollars: number | null; tokens?: number | null; unpriced?: number; journeysJudgedAtEnd?: boolean; guardNote?: string }): AppScore {
  if (!page.verdict) return unscored(defects.app, defects.defects.length, page.run, `${page.run} has no verdict: it stopped before judging`);
  const before = page.verdict.failures;
  const endMeasured = (d: Defect) => {
    if (!isJourney(d)) return page.measuredAfter;
    const journey = page.journeys.find((j) => sameWhere(j.name, d.where));
    const replayed = journey !== undefined && journey.steps.after !== null;
    const judged = d.match.every((m) => m === "breaks" || m === "does not load") || journeysJudgedAtEnd;
    return replayed && judged;
  };
  const scored: DefectScore[] = defects.defects.map((d) => {
    const found = before.find(names(d));
    const still = page.stillFailing.find(names(d));
    return { id: d.id, where: d.where, what: d.what, found: found ? said(found) : null, fixed: found && endMeasured(d) ? !still : null, still: still ? said(still) : null, ...(d.match.length ? {} : { unnamed: true as const }) };
  });
  // A principle a journey fails at the end and did not fail before: only when the end was judged.
  const failedBefore = (name: string) => before.filter((f) => f.kind === "journey-principle" && sameWhere(f.where, name)).map(idOf);
  const regressions = [
    ...page.screens.flatMap((s) => s.newly.map((item) => `${s.page}: ${item}`)),
    ...page.screens.filter((s) => s.status === "missing").map((s) => `${s.page}: gone at the end`),
    ...page.screens.filter((s) => s.status === "does not load" && s.widths.some((w) => w.before)).map((s) => `${s.page}: does not load at the end`),
    ...page.journeys.filter((j) => !j.broke.before && j.broke.after).map((j) => `${j.name}: breaks at the end, ${j.broke.after}`),
    ...(journeysJudgedAtEnd ? page.journeys.flatMap((j) => j.remaining.filter((p) => !failedBefore(j.name).includes(p)).map((p) => `${j.name}: ${p} fails at the end`)) : []),
  ];
  return {
    app: defects.app,
    run: page.run,
    defects: scored,
    found: scored.filter((d) => d.found).length,
    fixed: scored.filter((d) => d.fixed === true).length,
    total: scored.length,
    regressions,
    hiddenFeatures: refused.map((v) => `${v.what}: ${v.why}`),
    extra: before.filter((f) => !defects.defects.some((d) => names(d)(f))).map(said),
    dollars,
    tokens,
    unpriced,
    ...(guardNote ? { guardNote } : {}),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const usd = (d: number | null) => (d === null ? "cost not measured" : `≈ $${d < 9.95 ? d.toFixed(1) : Math.round(d)}`);
const spent = (s: AppScore) => `${usd(s.dollars)}${s.tokens !== null ? `, ${(s.tokens / 1_000_000).toFixed(0)} M tokens` : ""}${s.unpriced ? `, ${plural(s.unpriced, "call")} with no price` : ""}`;

/** The bench as text: a line per app, then each defect with its proof, then what each run found beyond them. */
export function benchText(scores: AppScore[]): string {
  const width = Math.max(...scores.map((s) => s.app.length)) + 2;
  const head = scores.map((s) =>
    s.error
      ? `${s.app.padEnd(width)}not measured: ${s.error}`
      : `${s.app.padEnd(width)}found ${s.found}/${s.total}  fixed ${s.fixed}/${s.total}  ${plural(s.regressions.length, "regression")}  ${s.guardNote ? "hidden features not counted" : plural(s.hiddenFeatures.length, "hidden feature")}  ${spent(s)}`,
  );
  const details = scores
    .filter((s) => !s.error)
    .map((s) => {
      const column = Math.max(...s.defects.map((d) => d.id.length)) + 2;
      const lines = s.defects.map((d) => {
        const mark = !d.found ? "✗" : d.fixed === true ? "✓" : "◐";
        const status = !d.found ? (d.unnamed ? "not found, nothing names it" : "not found") : d.fixed === true ? "found, fixed" : d.fixed === false ? "found, not fixed" : "found, the end not measured";
        return `${mark} ${d.id.padEnd(column)}${status.padEnd(28)}${d.still ?? d.found ?? d.what}`;
      });
      const more = [
        ...(s.regressions.length ? ["", "Regressions:", ...s.regressions.map((r) => `  ${r}`)] : []),
        ...(s.guardNote ? ["", `Hidden features not counted: ${s.guardNote}`] : s.hiddenFeatures.length ? ["", "Hidden features:", ...s.hiddenFeatures.map((h) => `  ${h}`)] : []),
        ...(s.extra.length ? ["", "Beyond the defects noted, to add to the list or reject:", ...s.extra.map((e) => `  ${e}`)] : []),
      ];
      return [`${s.app}, ${s.run}:`, ...lines, ...more].join("\n");
    });
  return [head.join("\n"), ...details].join("\n\n");
}

// ——— The judge bench: several passes of /aeom judge on each app, and what they agree on ———

/** One pass of /aeom judge on an app: its run, what its verdict failed, and what it cost. */
export interface JudgePass {
  run: string;
  failures: Failure[];
  dollars: number | null;
}

/** A count over the passes: its mean, to one decimal, and its lowest and highest. */
export interface Spread {
  mean: number;
  min: number;
  max: number;
}

export interface JudgeBenchScore {
  app: string;
  /** Why the app was not measured: no pass of /aeom judge. */
  error?: string;
  /** How many passes were asked for: fewer passes than that are said. */
  asked: number;
  passes: { run: string; found: number; beyond: number; dollars: number | null }[];
  total: number;
  found: Spread | null;
  beyond: Spread | null;
  dollars: Spread | null;
  /** Each defect noted by hand, with how many passes found it and the first one's proof. */
  defects: { id: string; where: string; what: string; in: number; proof: string | null; unnamed?: true }[];
  /** What some passes fail and others do not, on the same screen or journey: a verdict that changes from one pass to another. */
  flips: { what: string; in: number }[];
  /** What the passes found beyond the defects noted, each once, with how many passes said it: to add to the list or reject. */
  beyondList: { what: string; in: number }[];
}

/** One judge bench as `history.jsonl` keeps it: its date, AEOM's version, and each app's means. */
export interface JudgeBenchEntry {
  at: string;
  mode: "judge";
  aeom: string;
  /** Each app's means, with the runs counted: the same runs scored again are the same bench. */
  apps: { app: string; runs: string[]; passes: number; total: number; found: number; beyond: number; flips: number; dollars: number | null }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const spread = (values: number[]): Spread | null => (values.length ? { mean: round1(values.reduce((a, b) => a + b, 0) / values.length), min: Math.min(...values), max: Math.max(...values) } : null);
/**
 * A failure by where it shows and what names it: the same verdict in other words, or on a record made at each visit,
 * is one; a page of another query is another screen, as a defect noted with its query says.
 */
const keyOf = (f: Failure) => `${f.where.startsWith("/") ? pageShape(f.where.replace(/#.*$/, "")) : f.where.trim().toLowerCase()}\n${idOf(f)}`;

/**
 * What several passes of /aeom judge found of an app's defects: each defect with how many passes found it, the
 * spread of what was found and of what lies beyond the list, and every verdict some passes give and others do not.
 */
export function scoreJudgePasses({ defects, passes, asked = passes.length }: { defects: DefectList; passes: JudgePass[]; asked?: number }): JudgeBenchScore {
  const total = defects.defects.length;
  if (!passes.length) return { app: defects.app, error: "no /aeom judge run", asked, passes: [], total, found: null, beyond: null, dollars: null, defects: [], flips: [], beyondList: [] };
  const known = (f: Failure) => defects.defects.some((d) => names(d)(f));
  // What lies beyond the list counts each verdict once, as the list below says it.
  const each = passes.map((p) => ({ run: p.run, found: defects.defects.filter((d) => p.failures.some(names(d))).length, beyond: new Set(p.failures.filter((f) => !known(f)).map(keyOf)).size, dollars: p.dollars }));
  // Every verdict once, in the order the passes first gave it, with how many passes gave it and the words of the first.
  const seen = new Map<string, { what: string; label: string; in: number; known: boolean }>();
  for (const p of passes) {
    for (const key of new Set(p.failures.map(keyOf))) {
      const f = p.failures.find((x) => keyOf(x) === key)!;
      const entry = seen.get(key) ?? { what: said(f), label: `${f.where}: ${idOf(f)}`, in: 0, known: known(f) };
      entry.in++;
      seen.set(key, entry);
    }
  }
  const byCount = <T extends { in: number }>(list: T[]) => list.map((x, i) => ({ x, i })).sort((a, b) => b.x.in - a.x.in || a.i - b.i).map(({ x }) => x);
  const dollars = each.map((p) => p.dollars).filter((d): d is number => d !== null);
  return {
    app: defects.app,
    asked,
    passes: each,
    total,
    found: spread(each.map((p) => p.found)),
    beyond: spread(each.map((p) => p.beyond)),
    dollars: spread(dollars),
    defects: defects.defects.map((d) => {
      const proof = passes.map((p) => p.failures.find(names(d))).find(Boolean);
      return { id: d.id, where: d.where, what: d.what, in: passes.filter((p) => p.failures.some(names(d))).length, proof: proof ? said(proof) : null, ...(d.match.length ? {} : { unnamed: true as const }) };
    }),
    flips: byCount([...seen.values()].filter((e) => e.in < passes.length).map((e) => ({ what: e.label, in: e.in }))),
    beyondList: byCount([...seen.values()].filter((e) => !e.known).map((e) => ({ what: e.what, in: e.in }))),
  };
}

/** The bench as `history.jsonl` keeps it, each app by its means: what the next bench is compared with. */
export function judgeBenchEntry(scores: JudgeBenchScore[], { at, aeom }: { at: string; aeom: string }): JudgeBenchEntry {
  return { at, mode: "judge", aeom, apps: scores.filter((s) => !s.error).map((s) => ({ app: s.app, runs: s.passes.map((p) => p.run), passes: s.passes.length, total: s.total, found: s.found!.mean, beyond: s.beyond!.mean, flips: s.flips.length, dollars: s.dollars?.mean ?? null })) };
}

const num = (n: number) => String(round1(n));
/** A mean, then what it is out of, then its lowest and highest when they differ: `2.7/5 (2–3)`. */
const range = (s: Spread, of = "") => `${num(s.mean)}${of}${s.min !== s.max ? ` (${s.min}–${s.max})` : ""}`;
/** How far a mean moved: `+0.7`, `−1.7`, `±0`. */
const moved = (d: number) => (round1(d) === 0 ? "±0" : `${d > 0 ? "+" : "−"}${num(Math.abs(d))}`);

/**
 * The judge bench as text: a line per app, then each defect with how many passes found it, the verdicts that change,
 * what lies beyond the list; then how far each mean moved since the bench before (`previous`), or that it is the
 * first (`null`).
 */
export function judgeBenchText(scores: JudgeBenchScore[], previous?: JudgeBenchEntry | null): string {
  const width = Math.max(...scores.map((s) => s.app.length)) + 2;
  const head = scores.map((s) => {
    if (s.error) return `${s.app.padEnd(width)}not measured: ${s.error}`;
    const n = s.passes.length;
    const passes = `${n} ${n === 1 ? "pass" : "passes"}${n < s.asked ? ` of ${s.asked} asked` : ""}`;
    const cost = !s.dollars ? "cost not measured" : s.dollars.max > 0 && s.dollars.mean < 0.1 ? "< $0.1 a pass" : `≈ $${num(s.dollars.mean)} a pass`;
    return `${s.app.padEnd(width)}${passes}  found ${range(s.found!, `/${s.total}`)}  beyond the list ${range(s.beyond!)}  ${s.flips.length} ${s.flips.length === 1 ? "verdict that changes" : "verdicts that change"}  ${cost}`;
  });
  const details = scores
    .filter((s) => !s.error)
    .map((s) => {
      const n = s.passes.length;
      const column = Math.max(...s.defects.map((d) => d.id.length)) + 2;
      const lines = s.defects.map((d) => `${d.in === n ? "✓" : d.in ? "◐" : "✗"} ${d.id.padEnd(column)}${`${d.in}/${n}`.padEnd(6)}${d.proof ?? (d.unnamed ? `${d.what} (nothing names it)` : d.what)}`);
      const more = [
        ...(s.flips.length ? ["", "Verdicts that change from one pass to another:", ...s.flips.map((f) => `  ${f.what}, ${f.in} of ${n} passes`)] : []),
        ...(s.beyondList.length ? ["", "Beyond the defects noted, to add to the list or reject:", ...s.beyondList.map((b) => `  ${b.what} (${b.in} of ${n})`)] : []),
      ];
      return [`${s.app}, ${s.passes.map((p) => p.run).join(", ")}:`, ...lines, ...more].join("\n");
    });
  const since =
    previous === null
      ? ["No earlier judge bench to compare with: this one is the first."]
      : previous
        ? [
            `Since the judge bench of ${previous.at.slice(0, 10)} (AEOM ${previous.aeom || "version unknown"}):`,
            ...judgeBenchEntry(scores, { at: "", aeom: "" }).apps.map((a) => {
              const was = previous.apps.find((p) => p.app === a.app);
              if (!was) return `  ${a.app.padEnd(width)}not in the bench before`;
              // Fewer passes give fewer verdicts that change: benches of different sizes say nothing of each other.
              if (was.passes !== a.passes) return `  ${a.app.padEnd(width)}not compared: ${was.passes} passes then, ${a.passes} now`;
              const cost = a.dollars !== null && was.dollars !== null ? `  cost ${moved(a.dollars - was.dollars)}` : "";
              return `  ${a.app.padEnd(width)}found ${moved(a.found - was.found)}  beyond the list ${moved(a.beyond - was.beyond)}  verdicts that change ${moved(a.flips - was.flips)}${cost}`;
            }),
          ]
        : [];
  return [head.join("\n"), ...details, ...(since.length ? [since.join("\n")] : [])].join("\n\n");
}
