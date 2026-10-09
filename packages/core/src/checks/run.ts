import { chromium, type Browser } from "playwright";
import { DEFAULT_WIDTHS } from "../capture/capture.js";
import { discoverPages, visitPages, type PageError } from "../capture/discover.js";
import type { SignedIn } from "../capture/sign-in.js";
import { checkContrast } from "./contrast.js";
import { watchConsole } from "./console.js";
import { checkCursor } from "./cursor.js";
import { checkOverflow } from "./overflow.js";
import type { CheckName, Finding, Issue } from "./types.js";

export const CHECKS: CheckName[] = ["cursor", "overflow", "contrast", "console"];

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
 * Runs every check on every page. Overflow is checked at each width; cursor,
 * contrast and console once per page, at the widest width.
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
        await page.goto(url, { waitUntil: "networkidle" });
        const add = (check: CheckName, issues: Issue[]) => findings.push(...issues.map((issue) => ({ check, url, width, ...issue })));
        add("overflow", await checkOverflow(page));
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

/** Finds every page reachable from `url`, then checks each one, signed in when given what a signed-in browser keeps. */
export async function checkSite({ url, widths = DEFAULT_WIDTHS, signedIn, paths }: { url: string; widths?: number[]; signedIn?: SignedIn; paths?: string[] }): Promise<CheckReport> {
  const browser = await chromium.launch();
  try {
    const { pages, errors } = paths ? await visitPages(browser, url, paths, { signedIn }) : await discoverPages(browser, url, { signedIn });
    const findings = await checkPages(browser, pages, widths, signedIn);
    return { url, checkedAt: new Date().toISOString(), widths, checks: CHECKS, pages, errors, findings };
  } finally {
    await browser.close();
  }
}
