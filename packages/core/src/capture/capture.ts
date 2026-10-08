import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { discoverPages, visitPages, type PageError } from "./discover.js";

export const DEFAULT_WIDTHS = [390, 1280];

export interface CapturedPage {
  url: string;
  /** The route, such as `/produits`. */
  path: string;
  /** One screenshot per width, relative to the output folder. */
  files: { width: number; file: string }[];
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
}

/**
 * Finds every page reachable from `url` and screenshots each one, full page,
 * at every width. Writes the screenshots and `manifest.json` to `outDir`,
 * replacing the files of the previous capture.
 */
export async function capture({ url, outDir, widths = DEFAULT_WIDTHS, maxPages, paths }: CaptureOptions): Promise<CaptureManifest> {
  const browser = await chromium.launch();
  try {
    const { pages, errors } = paths ? await visitPages(browser, url, paths) : await discoverPages(browser, url, { maxPages });
    await clearPrevious(outDir);
    await mkdir(outDir, { recursive: true });

    const captured: CapturedPage[] = [];
    for (const pageUrl of pages) {
      const files: CapturedPage["files"] = [];
      for (const width of widths) {
        const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 800 } });
        try {
          const page = await context.newPage();
          await page.goto(pageUrl, { waitUntil: "networkidle" });
          await scrollThrough(page);
          const file = `${slug(pageUrl)}@${width}.png`;
          await page.screenshot({ path: join(outDir, file), fullPage: true });
          files.push({ width, file });
        } finally {
          await context.close();
        }
      }
      captured.push({ url: pageUrl, path: route(pageUrl), files });
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
  const files = previous.pages?.flatMap((page) => page.files.map((f) => f.file)) ?? [];
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
