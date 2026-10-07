import { route } from "../capture/capture.js";
import type { CheckReport } from "../checks/run.js";
import type { JudgeReport } from "../judge/tally.js";

export interface PageScore {
  page: string;
  /** Failing measurable checks on the page. */
  checks: number;
  /** Principles the judge failed on the page. */
  principles: number;
  total: number;
}

export interface PageComparison {
  page: string;
  before: PageScore;
  after: PageScore;
  verdict: "better" | "same" | "worse";
}

/** Counts, page by page, what fails. Lower is better; 0 is a page that passes everything. */
export function scorePages(check: CheckReport | undefined, judge: JudgeReport | undefined): PageScore[] {
  const pages = new Set<string>([...(check?.pages ?? []).map(route), ...(judge?.pages ?? []).map((p) => p.page)]);
  return [...pages].map((page) => {
    const checks = (check?.findings ?? []).filter((f) => route(f.url) === page).length;
    const principles = judge?.pages.find((p) => p.page === page)?.verdicts.filter((v) => !v.pass).length ?? 0;
    return { page, checks, principles, total: checks + principles };
  });
}

/** In V0, a page is better when fewer things fail on it. */
export function comparePages(before: PageScore[], after: PageScore[]): PageComparison[] {
  const empty = (page: string): PageScore => ({ page, checks: 0, principles: 0, total: 0 });
  return before.map((b) => {
    const a = after.find((s) => s.page === b.page) ?? empty(b.page);
    return { page: b.page, before: b, after: a, verdict: a.total < b.total ? "better" : a.total > b.total ? "worse" : "same" };
  });
}
