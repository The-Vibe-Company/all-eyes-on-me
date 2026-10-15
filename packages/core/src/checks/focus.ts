import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** How many stops of the keyboard are walked: enough for a header, a menu and the first actions of a page. */
const STOPS = 25;
/** How far around the element a focus style may show: a ring, a box around it. */
const AROUND = 16;

/**
 * Whoever moves with the keyboard sees where they are: walked with Tab, each
 * element that takes the focus looks different from itself without it, on
 * screen. The area around it is captured with the focus and without, its
 * transitions run to their end, so any visible sign counts: a ring, a filter,
 * a box around it that lights up, a skip link that comes into view. An embed
 * such as an iframe is stepped over, never judged.
 */
export async function checkFocus(page: Page): Promise<Issue[]> {
  const found: Issue[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  try {
    for (let i = 0; i < STOPS; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate((around) => {
        // The element that holds the focus, inside a shadow root if it is in one.
        let el = document.activeElement as HTMLElement | null;
        while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
        if (!el || el === document.body) return { end: true } as const;
        // An embed keeps the focus for as many stops as it holds: stepped over, never taken for the walk's end.
        if (el.tagName === "IFRAME" || el.tagName === "FRAME") return { skip: true } as const;
        if (el.dataset.aeomStop) return { end: true } as const;
        el.dataset.aeomStop = "1";
        if (el.isContentEditable) return { skip: true } as const;
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return { skip: true } as const;
        const x = Math.max(box.left - around, 0);
        const y = Math.max(box.top - around, 0);
        const text = (el.innerText || (el as HTMLInputElement).placeholder || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        return {
          clip: { x, y, width: Math.min(box.right + around, window.innerWidth) - x, height: Math.min(box.bottom + around, window.innerHeight) - y },
          element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`,
        };
      }, AROUND);
      if ("end" in stop) break;
      if ("skip" in stop || stop.clip.width <= 0 || stop.clip.height <= 0) continue;
      const shot = () => page.screenshot({ clip: stop.clip, animations: "disabled", caret: "hide" });
      const focused = await shot();
      // The same area without the focus, then the focus back where it was, so the next Tab goes on from there.
      await page.evaluate(() => {
        let el = document.activeElement as HTMLElement | null;
        while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
        (window as unknown as { __aeomFocused?: HTMLElement | null }).__aeomFocused = el;
        el?.blur();
      });
      const unfocused = await shot();
      await page.evaluate(() => {
        const holder = window as unknown as { __aeomFocused?: HTMLElement | null };
        holder.__aeomFocused?.focus({ preventScroll: true });
        delete holder.__aeomFocused;
      });
      if (focused.equals(unfocused)) found.push({ element: stop.element, message: "nothing shows it has the keyboard focus: give it a visible outline or ring (:focus-visible)" });
    }
  } catch {
    // A page that goes elsewhere mid-walk: what was found stands.
  } finally {
    await page
      .evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur?.();
        for (const el of document.querySelectorAll<HTMLElement>("[data-aeom-stop]")) delete el.dataset.aeomStop;
        delete (window as unknown as { __aeomFocused?: unknown }).__aeomFocused;
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      })
      .catch(() => undefined);
  }
  return found;
}
