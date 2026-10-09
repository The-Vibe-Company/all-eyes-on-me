import { route } from "../capture/capture.js";
import type { CheckReport } from "../checks/run.js";
import type { JudgeReport } from "../judge/tally.js";

export interface PageScore {
  page: string;
  /** Measurable checks failing on the page, each counted once. */
  checks: number;
  /** Principles the judge failed on the page. */
  principles: number;
  total: number;
  /** What fails on the page: each failing check at its width (`contrast@390`), then each failing principle. */
  failing: string[];
}

export interface PageComparison {
  page: string;
  /** null when the page did not exist before. */
  before: PageScore | null;
  /** null when the page is missing after: it broke or disappeared. */
  after: PageScore | null;
  verdict: "better" | "same" | "worse" | "missing" | "new";
  /** What fails after and passed before: a page can be better and still break something. */
  newly: string[];
}

/** Counts, page by page, what fails. Lower is better; 0 is a page that passes everything. */
export function scorePages(check: CheckReport | undefined, judge: JudgeReport | undefined): PageScore[] {
  const pages = new Set<string>([...(check?.pages ?? []).map(route), ...(judge?.pages ?? []).map((p) => p.page)]);
  return [...pages].map((page) => {
    const findings = (check?.findings ?? []).filter((f) => route(f.url) === page);
    const checks = new Set(findings.map((f) => f.check)).size;
    // Width by width: a check failing at 390 says nothing of the same check at 1280.
    const atWidth = [...new Set(findings.map((f) => `${f.check}@${f.width}`))].sort();
    const principles = judge?.pages.find((p) => p.page === page)?.verdicts.filter((v) => !v.pass).map((v) => v.principle) ?? [];
    return { page, checks, principles: principles.length, total: checks + principles.length, failing: [...atWidth, ...principles] };
  });
}

/**
 * In V0, a page is better when fewer things fail on it. A page missing after
 * never counts as better; a page that only exists after is reported as new.
 */
export function comparePages(before: PageScore[], after: PageScore[]): PageComparison[] {
  const pages = [...new Set([...before.map((s) => s.page), ...after.map((s) => s.page)])];
  return pages.map((page) => {
    const b = before.find((s) => s.page === page) ?? null;
    const a = after.find((s) => s.page === page) ?? null;
    if (!a) return { page, before: b, after: null, verdict: "missing", newly: [] };
    if (!b) return { page, before: null, after: a, verdict: "new", newly: [] };
    const newly = a.failing.filter((f) => !b.failing.includes(f));
    return { page, before: b, after: a, verdict: a.total < b.total ? "better" : a.total > b.total ? "worse" : "same", newly };
  });
}
