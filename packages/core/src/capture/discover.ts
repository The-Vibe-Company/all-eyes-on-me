import type { Browser } from "playwright";

export interface PageError {
  url: string;
  status?: number;
  reason: string;
}

export interface Discovery {
  pages: string[];
  errors: PageError[];
}

/**
 * Visits `startUrl` and follows every link on the same origin, like a visitor
 * clicking everywhere. Pages answering 400 or more, or failing to load, are
 * reported as errors instead of pages.
 */
export async function discoverPages(browser: Browser, startUrl: string, { maxPages = 50 } = {}): Promise<Discovery> {
  const first = normalize(startUrl);
  if (!first) throw new Error(`Not an http(s) URL: ${startUrl}`);
  const origin = new URL(first).origin;
  const queue = [first];
  const seen = new Set(queue);
  const pages: string[] = [];
  const errors: PageError[] = [];

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    while (queue.length > 0 && pages.length + errors.length < maxPages) {
      const url = queue.shift()!;
      let response;
      try {
        response = await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
      } catch (error) {
        errors.push({ url, reason: error instanceof Error ? error.message.split("\n")[0]! : String(error) });
        continue;
      }
      const status = response?.status() ?? 0;
      if (status >= 400) {
        errors.push({ url, status, reason: `${status} ${response?.statusText() ?? ""}`.trim() });
        continue;
      }

      const landed = normalize(page.url()) ?? url;
      if (new URL(landed).origin !== origin) {
        errors.push({ url, reason: `redirects off ${origin}, to ${landed}` });
        continue;
      }
      if (landed !== url && seen.has(landed)) continue;
      seen.add(landed);
      pages.push(landed);

      const hrefs = await page.$$eval("a[href]", (links) => links.map((a) => (a as HTMLAnchorElement).href));
      for (const href of hrefs) {
        const next = normalize(href);
        if (!next || new URL(next).origin !== origin || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  } finally {
    await context.close();
  }
  return { pages, errors };
}

/** Drops the fragment and trailing slashes so one page has one URL. */
export function normalize(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

/**
 * Visits each of `paths`, relative to `baseUrl`, without following links.
 * Routes on another origin, routes answering 400 or more, and routes that
 * fail to load are reported as errors, like during discovery.
 */
export async function visitPages(browser: Browser, baseUrl: string, paths: string[]): Promise<Discovery> {
  const origin = new URL(baseUrl).origin;
  const pages: string[] = [];
  const errors: PageError[] = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    const visited = new Set<string>();
    for (const path of paths) {
      const url = normalize(new URL(path, baseUrl).toString());
      if (!url || new URL(url).origin !== origin) {
        errors.push({ url: url ?? path, reason: `not on ${origin}` });
        continue;
      }
      if (visited.has(url)) continue;
      visited.add(url);
      let response;
      try {
        response = await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
      } catch (error) {
        errors.push({ url, reason: error instanceof Error ? error.message.split("\n")[0]! : String(error) });
        continue;
      }
      const status = response?.status() ?? 0;
      if (status >= 400) {
        errors.push({ url, status, reason: `${status} ${response?.statusText() ?? ""}`.trim() });
        continue;
      }
      const landed = normalize(page.url()) ?? url;
      if (new URL(landed).origin !== origin) {
        errors.push({ url, reason: `redirects off ${origin}, to ${landed}` });
        continue;
      }
      if (!pages.includes(landed)) pages.push(landed);
    }
  } finally {
    await context.close();
  }
  return { pages, errors };
}
