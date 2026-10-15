import { chromium, type Browser } from "playwright";
import { DEFAULT_WIDTHS } from "../capture/capture.js";
import { findPages } from "../capture/capture.js";
import type { PageError } from "../capture/discover.js";
import { openPage } from "../capture/open.js";
import type { SignedIn } from "../capture/sign-in.js";
import { route } from "../capture/capture.js";
import { pageShape } from "../capture/shape.js";
import { checkClipped } from "./clipped.js";
import { checkContrast } from "./contrast.js";
import { watchConsole } from "./console.js";
import { checkCursor } from "./cursor.js";
import { checkHeader } from "./header.js";
import { checkOverflow } from "./overflow.js";
import { checkUneven } from "./uneven.js";
import { checkWrap } from "./wrap.js";
import type { CheckName, Finding, Issue } from "./types.js";

export const CHECKS: CheckName[] = ["cursor", "overflow", "contrast", "console", "header", "wrap", "uneven", "clipped"];

/** The routes where a check does not apply, by check, as the config says: a landing page whose header scrolls away on purpose. */
export type CheckExceptions = Partial<Record<CheckName, string[]>>;

export interface CheckReport {
  url: string;
  checkedAt: string;
  widths: number[];
  checks: CheckName[];
  pages: string[];
  errors: PageError[];
  findings: Finding[];
}

/**
 * Runs every check on every page. Overflow, the header, labels that wrap,
 * uneven rows and cut text are checked at each width, since each width lays
 * the page out anew; cursor, contrast and console once per page, at the
 * widest width.
 */
export async function checkPages(browser: Browser, urls: string[], widths: number[] = DEFAULT_WIDTHS, signedIn?: SignedIn): Promise<Finding[]> {
  const widest = Math.max(...widths);
  const findings: Finding[] = [];
  for (const url of urls) {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 800 }, ...(signedIn ? { storageState: signedIn } : {}) });
      try {
        const page = await context.newPage();
        const consoleIssues = watchConsole(page);
        await openPage(page, url);
        const add = (check: CheckName, issues: Issue[]) => findings.push(...issues.map((issue) => ({ check, url, width, ...issue })));
        add("overflow", await checkOverflow(page));
        add("wrap", await checkWrap(page));
        add("uneven", await checkUneven(page));
        add("clipped", await checkClipped(page));
        // Last of the layout checks: it scrolls the page, then brings it back to the top.
        add("header", await checkHeader(page));
        if (width === widest) {
          add("cursor", await checkCursor(page));
          add("contrast", await checkContrast(page));
          add("console", consoleIssues());
        }
      } finally {
        await context.close();
      }
    }
  }
  return findings;
}

/**
 * Finds every page reachable from `url`, or visits the routes given, then
 * checks each one, signed in when given what a signed-in browser keeps; the
 * routes of `signedOut` are checked too, signed out.
 */
export async function checkSite({ url, widths = DEFAULT_WIDTHS, signedIn, paths, signedOut, except = {} }: { url: string; widths?: number[]; signedIn?: SignedIn; paths?: string[]; signedOut?: string[]; except?: CheckExceptions }): Promise<CheckReport> {
  const browser = await chromium.launch();
  try {
    const found = await findPages(browser, { url, paths, signedIn, signedOut });
    const pages = found.pages.map((p) => p.url);
    const findings = [
      ...(await checkPages(browser, found.pages.filter((p) => !p.signedOut).map((p) => p.url), widths, signedIn)),
      ...(await checkPages(browser, found.pages.filter((p) => p.signedOut).map((p) => p.url), widths)),
    ];
    // A check the config leaves out of a page finds nothing there: a route, or any route of its shape.
    const left = (f: Finding) => (except[f.check] ?? []).some((r) => r === route(f.url) || pageShape(r) === pageShape(route(f.url)));
    return { url, checkedAt: new Date().toISOString(), widths, checks: CHECKS, pages, errors: found.errors, findings: findings.filter((f) => !left(f)) };
  } finally {
    await browser.close();
  }
}
