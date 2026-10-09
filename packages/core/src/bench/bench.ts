/**
 * The bench: apps whose defects were noted by hand, and what a run of AEOM
 * found and fixed of them. A noted defect is found when AEOM failed the same
 * screen or journey on the same check or principle before the run, and fixed
 * when it no longer fails there at the end; each match cites what AEOM said.
 */

import type { Failure } from "../run/verdict.js";
import type { TokenCount } from "./tokens.js";

export interface Defect {
  id: string;
  /** The screen's route, or the journey's slug: one of the two. */
  screen?: string;
  journey?: string;
  /** The check or principle at fault: `loads` for a screen that does not load, `breaks` for a journey that breaks. */
  rule: string;
  /** What is wrong, in words. */
  what: string;
}

export interface Defects {
  app: string;
  defects: Defect[];
}

/** What is wrong with a list of defects, one sentence each; `rules` says what AEOM measures on a screen and on a journey. */
export function defectsProblems(file: unknown, rules: { screen: string[]; journey: string[] }): string[] {
  const list = (file as Partial<Defects> | null)?.defects;
  if (!Array.isArray(list)) return ["no list of defects: write { \"app\": \"…\", \"defects\": [ … ] }"];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const d of list as Partial<Defect>[]) {
    const id = typeof d?.id === "string" && d.id.trim() ? d.id : "(no id)";
    if (seen.has(id)) problems.push(`${id} appears more than once`);
    seen.add(id);
    const on = typeof d.screen === "string" ? "screen" : typeof d.journey === "string" ? "journey" : null;
    if (typeof d.screen === "string" && typeof d.journey === "string") problems.push(`${id}: a screen or a journey, not both`);
    else if (!on) problems.push(`${id}: name the screen (its route) or the journey (its slug)`);
    else if (!rules[on].includes(d.rule ?? "")) problems.push(`${id}: "${d.rule}" is not measured on a ${on}: one of ${rules[on].join(", ")}`);
    if (typeof d.what !== "string" || !d.what.trim()) problems.push(`${id}: say what is wrong`);
  }
  return problems;
}

/** The rule a failure is about: named by the verdict, or read from its words in a verdict saved before it named it. */
function ruleOf(f: Failure): string {
  if (f.rule) return f.rule;
  if (f.kind === "page") return "loads";
  if (f.kind === "journey") return "breaks";
  return f.what.split(":")[0]!.trim();
}

export interface Grading {
  app: string;
  noted: number;
  /** Set when the app did not start: nothing else was measured. */
  notStarted?: string;
  found: { id: string; proof: string }[];
  missed: string[];
  /** `measured` when the run measured its end; otherwise nothing counts as fixed. */
  end: "measured" | "not measured";
  fixed: { id: string; proof: string }[];
  /** Found, and still failing at the end. */
  notFixed: string[];
  /** A check or principle that passed before the run and fails at its end. */
  regressions: { where: string; rule: string; what: string }[];
  /** What AEOM found beyond the noted defects: to add to the list, or to reject. */
  extra: { where: string; rule: string; what: string }[];
  /** What the guard refuses in the whole run: a feature that came in unasked. */
  features: string[];
  tokens: TokenCount | null;
}

/**
 * Grades one run against the defects noted on its app. `before` is the
 * verdict before the run, `end` what still fails at its end (null when the
 * run did not measure it). `journeys` maps journey names to their slugs for
 * a verdict saved before failures named them.
 */
export function gradeRun({ app, defects, before, end, journeys = [], features = [], tokens = null, notStarted }: { app: string; defects: Defects; before: Failure[] | null; end: Failure[] | null; journeys?: { slug: string; name: string }[]; features?: string[]; tokens?: TokenCount | null; notStarted?: string }): Grading {
  const slugOf = (f: Failure) => f.slug ?? journeys.find((j) => j.name === f.where)?.slug ?? f.where;
  const key = (f: Failure) => `${f.kind === "journey" || f.kind === "journey-principle" ? `journey ${slugOf(f)}` : `screen ${f.where}`} ${ruleOf(f)}`;
  const keyOf = (d: Defect) => `${d.journey !== undefined ? `journey ${d.journey}` : `screen ${d.screen}`} ${d.rule}`;
  const shown = (f: Failure) => ({ where: f.kind === "journey" || f.kind === "journey-principle" ? slugOf(f) : f.where, rule: ruleOf(f), what: f.what });
  const was = new Map<string, Failure>();
  for (const f of before ?? []) if (!was.has(key(f))) was.set(key(f), f);
  const now = new Map<string, Failure>();
  for (const f of end ?? []) if (!now.has(key(f))) now.set(key(f), f);

  const found = defects.defects.filter((d) => was.has(keyOf(d))).map((d) => ({ id: d.id, proof: was.get(keyOf(d))!.what }));
  const measured = end !== null;
  const fixed = measured ? found.filter((f) => !now.has(keyOf(defects.defects.find((d) => d.id === f.id)!))) : [];
  const noted = new Set(defects.defects.map(keyOf));
  return {
    app,
    noted: defects.defects.length,
    ...(notStarted ? { notStarted } : {}),
    found,
    missed: defects.defects.filter((d) => !was.has(keyOf(d))).map((d) => d.id),
    end: measured ? "measured" : "not measured",
    fixed,
    notFixed: found.filter((f) => !fixed.includes(f)).map((f) => f.id),
    regressions: measured && before ? [...now.entries()].filter(([k]) => !was.has(k)).map(([, f]) => shown(f)) : [],
    extra: [...was.entries()].filter(([k]) => !noted.has(k)).map(([, f]) => shown(f)),
    features,
    tokens,
  };
}

export interface BenchRow {
  app: string;
  noted: number;
  found: number;
  fixed: number;
  regressions: number;
  features: number;
  extra: number;
  tokens: number | null;
}

/** The bench table: app by app, found and fixed out of what was noted, regressions, features that came in unasked, what was found beyond the list, and tokens. */
export function benchTable(gradings: Grading[]): { rows: BenchRow[]; text: string } {
  const rows = gradings.map((g) => ({ app: g.app, noted: g.noted, found: g.found.length, fixed: g.fixed.length, regressions: g.regressions.length, features: g.features.length, extra: g.extra.length, tokens: g.tokens?.total ?? null }));
  const head = ["App", "Found", "Fixed", "Regressions", "Features", "Beyond the list", "Tokens"];
  const lines = gradings.map((g, i) => {
    const r = rows[i]!;
    if (g.notStarted) return [r.app, `did not start: ${g.notStarted}`];
    return [r.app, `${r.found}/${r.noted}`, g.end === "measured" ? `${r.fixed}/${r.noted}` : "not measured", String(r.regressions), String(r.features), String(r.extra), r.tokens === null ? "not counted" : String(r.tokens)];
  });
  const widths = head.map((h, c) => Math.max(h.length, ...lines.filter((l) => l.length > 2).map((l) => l[c]!.length)));
  const pad = (cells: string[]) => (cells.length === 2 ? `${cells[0]!.padEnd(widths[0]!)}  ${cells[1]}` : cells.map((cell, c) => cell.padEnd(widths[c]!)).join("  ").trimEnd());
  return { rows, text: [pad(head), ...lines.map(pad)].join("\n") };
}
