import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { pageContent } from "./content.js";
import { discoverPages, normalize, visitPages, type PageError } from "./discover.js";
import { openPage, pinFixed } from "./open.js";
import type { SignedIn } from "./sign-in.js";

export const DEFAULT_WIDTHS = [390, 1280];

/** The widths a screen can have, in px: below, no phone; above, no screen anyone works on. */
export const WIDTH_RANGE = { min: 240, max: 3840 };

/** The widths to measure, each once and narrowest first; null when the list is empty or holds a width no screen has. */
export function usableWidths(widths: unknown): number[] | null {
  if (!Array.isArray(widths) || !widths.length) return null;
  if (widths.some((w) => !Number.isInteger(w) || w < WIDTH_RANGE.min || w > WIDTH_RANGE.max)) return null;
  return [...new Set(widths as number[])].sort((a, b) => a - b);
}

/**
 * How tall a capture may be, in pixels: a page of 24,000 px is more than a
 * judge can read in one image, and its top is what tells its look. A longer
 * page is captured down to here, and its manifest entry says how tall it was.
 */
export const MAX_CAPTURE_HEIGHT = 6000;

export interface CapturedPage {
  url: string;
  /** The route, such as `/produits`. */
  path: string;
  /** One screenshot per width, relative to the output folder; `cut`, the page's full height when the capture stops at MAX_CAPTURE_HEIGHT. */
  files: { width: number; file: string; cut?: number }[];
  /** What the page holds, read at the widest width as a screen reader reads it, relative to the output folder. */
  content?: string;
  /** Captured signed out, as a page the config marks public. */
  signedOut?: true;
}

export interface CaptureManifest {
  url: string;
  capturedAt: string;
  widths: number[];
  pages: CapturedPage[];
  errors: PageError[];
}

export interface CaptureOptions {
  url: string;
  outDir: string;
  widths?: number[];
  maxPages?: number;
  /** Capture only these routes, such as `["/"]`, instead of following links. */
  paths?: string[];
  /** What a signed-in browser keeps: every page is visited signed in, but those of `signedOut`. */
  signedIn?: SignedIn;
  /** Routes seen signed out, such as a public home page that sends a signed-in visitor elsewhere: captured too, signed out. */
  signedOut?: string[];
}

/**
 * The pages to visit, signed in and signed out: the routes given, or every page
 * reachable from `url`, signed in when `signedIn` is given; then the routes of
 * `signedOut`, signed out. A page found both ways is kept signed out.
 */
export async function findPages(
  browser: Browser,
  { url, paths, maxPages, signedIn, signedOut = [] }: { url: string; paths?: string[]; maxPages?: number; signedIn?: SignedIn; signedOut?: string[] },
): Promise<{ pages: { url: string; signedOut?: true }[]; errors: PageError[] }> {
  const out = signedOut.map((p) => normalize(new URL(p, url).toString()));
  const inside = paths ? await visitPages(browser, url, paths.filter((p) => !out.includes(normalize(new URL(p, url).toString()))), { signedIn }) : await discoverPages(browser, url, { maxPages, signedIn });
  const outside = signedOut.length ? await visitPages(browser, url, signedOut) : { pages: [], errors: [] };
  return {
    pages: [...inside.pages.filter((p) => !outside.pages.includes(p)).map((p) => ({ url: p })), ...outside.pages.map((p) => ({ url: p, signedOut: true as const }))],
    // A public route that fails signed in, such as one that sends a signed-in visitor away, is not in error when it loads signed out.
    errors: [...inside.errors.filter((e) => !out.includes(normalize(e.url)) && !outside.pages.includes(e.url)), ...outside.errors],
  };
}

/**
 * Finds every page reachable from `url` and screenshots each one, full page,
 * at every width. Writes the screenshots and `manifest.json` to `outDir`,
 * replacing the files of the previous capture.
 */
export async function capture({ url, outDir, widths = DEFAULT_WIDTHS, maxPages, paths, signedIn, signedOut }: CaptureOptions): Promise<CaptureManifest> {
  const browser = await chromium.launch();
  try {
    const { pages, errors } = await findPages(browser, { url, paths, maxPages, signedIn, signedOut });
    await clearPrevious(outDir);
    await mkdir(outDir, { recursive: true });

    const captured: CapturedPage[] = [];
    const widest = Math.max(...widths);
    for (const { url: pageUrl, signedOut: out } of pages) {
      const files: CapturedPage["files"] = [];
      let content: string | undefined;
      for (const width of widths) {
        const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 800 }, ...(signedIn && !out ? { storageState: signedIn } : {}) });
        try {
          const page = await context.newPage();
          await openPage(page, pageUrl);
          await scrollThrough(page);
          // Its content once, where the most of it shows: a worker can redraw the screen from it without seeing its look.
          if (width === widest) {
            const text = await pageContent(page);
            if (text !== null) {
              content = `${slug(pageUrl)}.content.yml`;
              await writeFile(join(outDir, content), `# ${route(pageUrl)} at ${width} px: what the page holds, as a screen reader reads it, without its look.\n${text}\n`);
            }
          }
          const file = `${slug(pageUrl)}@${width}.png`;
          await pinFixed(page);
          const cut = await screenshotCapped(page, join(outDir, file));
          files.push({ width, file, ...(cut ? { cut } : {}) });
        } finally {
          await context.close();
        }
      }
      captured.push({ url: pageUrl, path: route(pageUrl), files, ...(content ? { content } : {}), ...(out ? { signedOut: true as const } : {}) });
    }

    const manifest: CaptureManifest = { url, capturedAt: new Date().toISOString(), widths, pages: captured, errors };
    await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    return manifest;
  } finally {
    await browser.close();
  }
}

/**
 * Scrolls to the end of the page a screen at a time, as a visitor would, so
 * what loads on scroll, such as lazy images, is in the full-page screenshot;
 * waits up to 5 s for those images to load and decode, then goes back to the top.
 */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const pause = () => new Promise((resolve) => setTimeout(resolve, 60));
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await pause();
    }
    const loading = [...document.images].filter((img) => !img.complete);
    const loaded = Promise.all(
      loading.map((img) => new Promise((resolve) => {
        img.addEventListener("load", resolve);
        img.addEventListener("error", resolve);
      })),
    );
    // Decoded too: an image decoded asynchronously can still paint blank.
    const decoded = loaded.then(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
    await Promise.race([decoded, new Promise((resolve) => setTimeout(resolve, 5000))]);
    window.scrollTo(0, 0);
    await pause();
  });
}

/** Removes only the files the previous manifest says AEOM wrote. */
async function clearPrevious(outDir: string): Promise<void> {
  let previous: CaptureManifest;
  try {
    previous = JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8"));
  } catch {
    return;
  }
  const files = previous.pages?.flatMap((page) => [...page.files.map((f) => f.file), ...(page.content ? [page.content] : [])]) ?? [];
  await Promise.all([...files, "manifest.json"].map((file) => rm(join(outDir, file), { force: true })));
}

export function route(url: string): string {
  const { pathname, search } = new URL(url);
  return pathname + search;
}

/** `/` becomes `index`, `/a/b?x=1` becomes `a-b-x-1`. */
export function slug(url: string): string {
  const name = route(url)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || "index";
}

/**
 * A full-page screenshot, down to MAX_CAPTURE_HEIGHT at most. Returns the
 * page's full height when it was cut, undefined otherwise.
 */
export async function screenshotCapped(page: Page, path: string, options: { mask?: Locator[] } = {}): Promise<number | undefined> {
  const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0));
  if (height <= MAX_CAPTURE_HEIGHT) {
    await page.screenshot({ path, fullPage: true, ...options });
    return undefined;
  }
  // As wide as the page draws, so what overflows sideways is still seen.
  const width = Math.max(page.viewportSize()?.width ?? 0, await page.evaluate(() => document.documentElement.scrollWidth));
  await page.screenshot({ path, fullPage: true, clip: { x: 0, y: 0, width, height: MAX_CAPTURE_HEIGHT }, ...options });
  return height;
}
