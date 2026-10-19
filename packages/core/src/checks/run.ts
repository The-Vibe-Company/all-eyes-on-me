import { chromium, type Browser } from "playwright";
import { DEFAULT_WIDTHS } from "../capture/capture.js";
import { findPages } from "../capture/capture.js";
import type { PageError } from "../capture/discover.js";
import { openPage } from "../capture/open.js";
import type { SignedIn } from "../capture/sign-in.js";
import { route } from "../capture/capture.js";
import { pageShape } from "../capture/shape.js";
import { checkBounce } from "./bounce.js";
import { checkClipped } from "./clipped.js";
import { checkContrast } from "./contrast.js";
import { watchConsole } from "./console.js";
import { checkCursor } from "./cursor.js";
import { checkFocus } from "./focus.js";
import { checkFontSize } from "./font-size.js";
import { checkGradientText } from "./gradient-text.js";
import { checkNestedCard } from "./nested-card.js";
import { checkSideStripe } from "./side-stripe.js";
import { checkImages } from "./images.js";
import { checkLabels } from "./labels.js";
import { checkLayoutShift } from "./layout-shift.js";
import { checkLineLength } from "./line-length.js";
import { checkTapSize } from "./tap-size.js";
import { checkZoom } from "./zoom.js";
import { PHONE } from "./screen.js";
import { checkHeader } from "./header.js";
import { checkOverflow } from "./overflow.js";
import { checkUneven } from "./uneven.js";
import { checkWrap } from "./wrap.js";
import type { CheckName, Finding, Issue } from "./types.js";

export const CHECKS: CheckName[] = ["cursor", "overflow", "contrast", "console", "header", "wrap", "uneven", "clipped", "tap-size", "font-size", "line-length", "zoom", "images", "labels", "focus", "layout-shift", "gradient-text", "side-stripe", "nested-card", "bounce"];

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
 * the page out anew; cursor, contrast, console and what impeccable bans once
 * per page, at the widest width.
 */
export async function checkPages(browser: Browser, urls: string[], widths: number[] = DEFAULT_WIDTHS, signedIn?: SignedIn): Promise<Finding[]> {
  const widest = Math.max(...widths);
  const findings: Finding[] = [];
  for (const url of urls) {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width < PHONE ? 844 : 800 }, ...(signedIn ? { storageState: signedIn } : {}) });
      try {
        const page = await context.newPage();
        const consoleIssues = watchConsole(page);
        await openPage(page, url);
        // A page that goes elsewhere while a check measures it cannot be measured by that check: the others, and the
        // other pages, still are.
        const add = async (check: CheckName, measure: () => Promise<Issue[]> | Issue[]) => {
          let issues: Issue[];
          try {
            issues = await measure();
          } catch {
            return;
          }
          findings.push(...issues.map((issue) => ({ check, url, width, ...issue })));
        };
        // First: what moved while the page loaded, before any check moves it.
        await add("layout-shift", () => checkLayoutShift(page));
        await add("overflow", () => checkOverflow(page));
        await add("wrap", () => checkWrap(page));
        await add("uneven", () => checkUneven(page));
        await add("clipped", () => checkClipped(page));
        await add("tap-size", () => checkTapSize(page));
        await add("font-size", () => checkFontSize(page));
        await add("line-length", () => checkLineLength(page));
        // The viewport tag is the page's, not the width's: said once, at the narrowest width.
        if (width === Math.min(...widths)) await add("zoom", () => checkZoom(page));
        // Last of the layout checks: it scrolls the page, then brings it back where it was.
        await add("header", () => checkHeader(page));
        if (width === widest) {
          await add("cursor", () => checkCursor(page));
          await add("contrast", () => checkContrast(page));
          await add("console", () => consoleIssues());
          await add("images", () => checkImages(page));
          await add("labels", () => checkLabels(page));
          // What impeccable bans, read from the styles: the same at every width.
          await add("gradient-text", () => checkGradientText(page));
          await add("side-stripe", () => checkSideStripe(page));
          await add("nested-card", () => checkNestedCard(page));
          await add("bounce", () => checkBounce(page));
          // Last: it walks the page with the keyboard.
          await add("focus", () => checkFocus(page));
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
    // A check the config leaves out of a page finds nothing there: a route, or any route of its shape, whatever its
    // query or its last slash.
    const bare = (r: string) => r.replace(/[?#].*$/, "").replace(/(.)\/+$/, "$1");
    const left = (f: Finding) => (except[f.check] ?? []).some((r) => bare(r) === bare(route(f.url)) || pageShape(bare(r)) === pageShape(bare(route(f.url))));
    return { url, checkedAt: new Date().toISOString(), widths, checks: CHECKS, pages, errors: found.errors, findings: findings.filter((f) => !left(f)) };
  } finally {
    await browser.close();
  }
}
