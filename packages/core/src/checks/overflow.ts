import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** The page must not scroll sideways at the current width. */
export async function checkOverflow(page: Page): Promise<Issue[]> {
  const result = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const width = document.documentElement.scrollWidth;
    if (width <= viewport) return null;
    const sticksOut = (el: Element) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.right > viewport + 1;
    };
    // The outermost elements that stick out: their parent still fits.
    const culprits = [...document.body.querySelectorAll("*")]
      .filter((el) => sticksOut(el) && (el.parentElement === document.body || !sticksOut(el.parentElement!)))
      .slice(0, 3)
      .map((el) => {
        const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
      });
    return { viewport, width, culprits };
  });
  if (!result) return [];
  const message = `the page is ${result.width} px wide in a ${result.viewport} px window, so it scrolls sideways`;
  if (result.culprits.length === 0) return [{ message }];
  return result.culprits.map((element) => ({ element, message }));
}
