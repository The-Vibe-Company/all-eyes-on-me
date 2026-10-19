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
  /** Check or principle ids, `breaks` for a journey that stops, `does not load` for a page. */
  match: string[];
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
}

/** The id a failure names: a check's or a principle's, `breaks`, or `does not load`. */
const idOf = (f: Failure) => (f.kind === "journey" ? "breaks" : f.kind === "page" ? "does not load" : f.what.split(":")[0]!.trim());
const said = (f: Failure) => `${f.where}: ${f.what}`;
/** A route by its shape, so `/commandes/12` is `/commandes/:id`; `*`, any screen; a journey's name as it is written, case aside. */
const sameWhere = (failure: string, defect: string) =>
  failure.startsWith("/") ? defect === "*" || (defect.startsWith("/") && pageShape(failure) === pageShape(defect)) : failure.trim().toLowerCase() === defect.trim().toLowerCase();
const names = (d: Defect) => (f: Failure) => sameWhere(f.where, d.where) && d.match.includes(idOf(f));

/** What one run found and fixed of an app's defects, from its result page, the guard's refusals and its cost. */
export function scoreRun({ defects, page, refused, dollars }: { defects: DefectList; page: ResultPage; refused: Violation[]; dollars: number | null }): AppScore {
  const before = page.verdict?.failures ?? [];
  const scored: DefectScore[] = defects.defects.map((d) => {
    const found = before.find(names(d));
    const still = page.stillFailing.find(names(d));
    return { id: d.id, where: d.where, what: d.what, found: found ? said(found) : null, fixed: found && page.measuredAfter ? !still : null, still: still ? said(still) : null };
  });
  const regressions = [
    ...page.screens.flatMap((s) => s.newly.map((item) => `${s.page}: ${item}`)),
    ...page.screens.filter((s) => s.status === "missing").map((s) => `${s.page}: gone at the end`),
    ...page.journeys.filter((j) => !j.broke.before && j.broke.after).map((j) => `${j.name}: breaks at the end, ${j.broke.after}`),
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
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const usd = (d: number | null) => (d === null ? "cost not measured" : `≈ $${d < 9.95 ? d.toFixed(1) : Math.round(d)}`);

/** The bench as text: a line per app, then each defect with its proof, then what each run found beyond them. */
export function benchText(scores: AppScore[]): string {
  const width = Math.max(...scores.map((s) => s.app.length)) + 2;
  const head = scores.map((s) =>
    s.error
      ? `${s.app.padEnd(width)}not measured: ${s.error}`
      : `${s.app.padEnd(width)}found ${s.found}/${s.total}  fixed ${s.fixed}/${s.total}  ${plural(s.regressions.length, "regression")}  ${plural(s.hiddenFeatures.length, "hidden feature")}  ${usd(s.dollars)}`,
  );
  const details = scores
    .filter((s) => !s.error)
    .map((s) => {
      const column = Math.max(...s.defects.map((d) => d.id.length)) + 2;
      const lines = s.defects.map((d) => {
        const mark = !d.found ? "✗" : d.fixed === true ? "✓" : "◐";
        const status = !d.found ? "not found" : d.fixed === true ? "found, fixed" : d.fixed === false ? "found, not fixed" : "found, the end not measured";
        return `${mark} ${d.id.padEnd(column)}${status.padEnd(28)}${d.still ?? d.found ?? d.what}`;
      });
      const more = [
        ...(s.regressions.length ? ["", "Regressions:", ...s.regressions.map((r) => `  ${r}`)] : []),
        ...(s.hiddenFeatures.length ? ["", "Hidden features:", ...s.hiddenFeatures.map((h) => `  ${h}`)] : []),
        ...(s.extra.length ? ["", "Beyond the defects noted, to add to the list or reject:", ...s.extra.map((e) => `  ${e}`)] : []),
      ];
      return [`${s.app}, ${s.run}:`, ...lines, ...more].join("\n");
    });
  return [head.join("\n"), ...details].join("\n\n");
}
