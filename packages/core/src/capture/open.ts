import type { Page, Response } from "playwright";

/** How long AEOM waits, once a page has loaded, for its network to go quiet. */
export const QUIET_MS = 3_000;

/**
 * Opens a page as a visitor sees it: once it has loaded, waits for its network
 * to go quiet, at most `QUIET_MS`. A dev server that keeps a request open, as
 * Next.js does in development, never goes quiet: the page is taken as it is.
 */
export async function openPage(page: Page, url: string, { timeout = 30_000 }: { timeout?: number } = {}): Promise<Response | null> {
  const response = await page.goto(url, { waitUntil: "load", timeout });
  await settle(page);
  return response;
}

/** Waits for the page's network to go quiet, at most `QUIET_MS`. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: QUIET_MS }).catch(() => {});
}

/**
 * A full-page screenshot draws an element fixed to the window where the
 * window was: a tab bar fixed to its bottom lands in the middle of a long page.
 * Pins each fixed element to the end of the page it sticks to, the top or the
 * bottom, where a visitor sees it at the top and at the end of the page.
 * Returns how to put them back, for a page that goes on being used.
 */
export async function pinFixed(page: Page): Promise<() => Promise<void>> {
  const pinned = await page.evaluate(() => {
    const doc = document.documentElement;
    const height = Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0);
    const view = window.innerHeight;
    const fixed = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => getComputedStyle(el).position === "fixed");
    const placed = fixed.map((el) => ({ el, rect: el.getBoundingClientRect(), width: el.offsetWidth, style: el.getAttribute("style") }));
    const kept: { el: HTMLElement; style: string | null }[] = [];
    (window as unknown as { __aeomPinned: typeof kept }).__aeomPinned = kept;
    for (const { el, rect, width, style } of placed) {
      if (!rect.width && !rect.height) continue;
      kept.push({ el, style });
      // Where it sits on the page: at the top as at scroll 0, or as far from the end as it was from the window's bottom.
      const top = rect.top >= view / 2 ? height - (view - rect.top) : rect.top;
      const set = (name: string, value: string) => el.style.setProperty(name, value, "important");
      set("position", "absolute");
      set("margin", "0");
      set("transform", "none");
      set("bottom", "auto");
      set("right", "auto");
      set("width", `${width}px`);
      // Placed from its containing block: the page itself, unless an ancestor is positioned.
      const parent = el.offsetParent as HTMLElement | null;
      const fromPage = !parent || (parent === document.body && getComputedStyle(parent).position === "static");
      const origin = fromPage ? { top: 0, left: 0 } : (() => {
        const box = parent.getBoundingClientRect();
        return { top: box.top + window.scrollY + parent.clientTop, left: box.left + window.scrollX + parent.clientLeft };
      })();
      set("top", `${top - origin.top}px`);
      set("left", `${rect.left + window.scrollX - origin.left}px`);
    }
    return kept.length;
  });
  return async () => {
    if (!pinned) return;
    await page.evaluate(() => {
      const kept = (window as unknown as { __aeomPinned?: { el: HTMLElement; style: string | null }[] }).__aeomPinned ?? [];
      for (const { el, style } of kept) style === null ? el.removeAttribute("style") : el.setAttribute("style", style);
    });
  };
}
