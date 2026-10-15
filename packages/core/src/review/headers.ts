import { chromium } from "playwright";
import { openPage } from "../capture/open.js";
import type { SignedIn } from "../capture/sign-in.js";

/**
 * What the header of each page offers, as the user reads it: the words of its
 * links and buttons, in their order; null for a page with no header. The
 * header of an article or a section is its title, not the site's.
 */
export async function headerLinks({ url, paths, signedIn }: { url: string; paths: string[]; signedIn?: SignedIn }): Promise<{ path: string; links: string[] | null; failed?: string }[]> {
  const root = url.endsWith("/") ? url : `${url}/`;
  const browser = await chromium.launch();
  try {
    const found: { path: string; links: string[] | null; failed?: string }[] = [];
    for (const path of paths) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...(signedIn ? { storageState: signedIn } : {}) });
      try {
        const page = await context.newPage();
        // A screen that does not answer is said so, and the others are still read.
        try {
          await openPage(page, new URL(path.replace(/^\//, ""), root).toString(), { timeout: 15_000 });
        } catch (error) {
          found.push({ path, links: null, failed: error instanceof Error ? error.message.split("\n")[0]! : String(error) });
          continue;
        }
        const links = await page.evaluate(() => {
          const header = [...document.querySelectorAll<HTMLElement>('header, [role="banner"]')].find((el) => !el.parentElement?.closest("article, section, main, aside"));
          const scope = header ?? document.querySelector<HTMLElement>("body > nav, nav");
          if (!scope) return null;
          return [...scope.querySelectorAll<HTMLElement>("a, button")].map((a) => (a.innerText || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")).filter(Boolean);
        });
        found.push({ path, links });
      } finally {
        await context.close();
      }
    }
    return found;
  } finally {
    await browser.close();
  }
}

/** How a page's header differs from the reference's, in words; null when it offers the same. */
export function headerDifference(page: string[] | null, reference: string[] | null): string | null {
  if (!reference) return null;
  if (!page) return "no header, where the rest of the app has one";
  const missing = reference.filter((l) => !page.includes(l));
  const extra = page.filter((l) => !reference.includes(l));
  if (!missing.length && !extra.length) return reference.join("|") === page.join("|") ? null : "the same links in another order";
  return [...missing.map((l) => `no « ${l} »`), ...extra.map((l) => `« ${l} » the rest of the app does not have`)].join(", ");
}
