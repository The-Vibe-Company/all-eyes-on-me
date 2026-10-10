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
 * A full-page screenshot draws an element fixed to the window where the window
 * was: a tab bar fixed to its bottom lands in the middle of a long page. Moves
 * each bar fixed to the bottom of the window down to the end of the page,
 * where a visitor sees it once they scrolled there, with its `translate` alone:
 * its size and its place in the layout stay as they were. What is fixed to the
 * top, or covers the window, is drawn at the top already and is left alone, as
 * is an element only called fixed that scrolls with the page (under a
 * transformed ancestor). Returns how to put the bars back, for a page that goes
 * on being used: their `translate` as it was, nothing else.
 */
export async function pinFixed(page: Page): Promise<() => Promise<void>> {
  const pinned = await page.evaluate(() => {
    const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    const view = window.innerHeight;
    const kept: { el: HTMLElement; value: string; priority: string }[] = [];
    (window as unknown as { __aeomPinned: typeof kept }).__aeomPinned = kept;
    if (height <= view + 1) return 0;
    const fixed = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => getComputedStyle(el).position === "fixed");
    if (!fixed.length) return 0;
    const from = window.scrollY;
    window.scrollTo(0, 0);
    const top = fixed.map((el) => el.getBoundingClientRect());
    window.scrollTo(0, height);
    const end = fixed.map((el) => el.getBoundingClientRect());
    window.scrollTo(0, 0);
    const bars = fixed.filter((el, i) => {
      const r = top[i]!;
      // Fixed to the window: it does not move when the page scrolls.
      const still = Math.abs(end[i]!.top - r.top) < 1;
      // A bar at the bottom: in the lower half, touching the window's bottom edge.
      return still && r.height > 0 && r.top >= view / 2 && r.bottom >= view - 2;
    });
    const shift = height - view;
    for (const el of bars) {
      // A bar inside another moves with it.
      if (bars.some((other) => other !== el && other.contains(el))) continue;
      kept.push({ el, value: el.style.getPropertyValue("translate"), priority: el.style.getPropertyPriority("translate") });
      const [x = "0px", y = "0px", z] = getComputedStyle(el).translate === "none" ? [] : getComputedStyle(el).translate.split(" ");
      el.style.setProperty("translate", `${x} calc(${y} + ${shift}px)${z ? ` ${z}` : ""}`, "important");
    }
    if (!kept.length) window.scrollTo(0, from);
    return kept.length;
  });
  return async () => {
    if (!pinned) return;
    await page.evaluate(() => {
      const kept = (window as unknown as { __aeomPinned?: { el: HTMLElement; value: string; priority: string }[] }).__aeomPinned ?? [];
      for (const { el, value, priority } of kept) value ? el.style.setProperty("translate", value, priority) : el.style.removeProperty("translate");
    });
  };
}
