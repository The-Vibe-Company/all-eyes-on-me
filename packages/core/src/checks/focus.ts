import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** How many stops of the keyboard are walked: enough for a header, a menu and the first actions of a page. */
const STOPS = 25;
const PROPS = ["outline-style", "outline-width", "outline-color", "box-shadow", "border-top-color", "border-bottom-color", "border-left-color", "border-right-color", "border-bottom-width", "background-color", "color", "text-decoration-line", "text-decoration-thickness", "opacity", "transform"];

/**
 * Whoever moves with the keyboard sees where they are: walked with Tab, each
 * element that takes the focus shows something its unfocused self does not, on
 * itself, on its pseudo-elements or on its parent (a ring by `:focus-within`).
 */
export async function checkFocus(page: Page): Promise<Issue[]> {
  const count = await page.evaluate((props) => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const look = (el: Element) => [el, ...["::before", "::after"].map((p) => [el, p] as const), el.parentElement].map((x) => {
      if (!x) return "";
      const style = Array.isArray(x) ? getComputedStyle(x[0], x[1]) : getComputedStyle(x as Element);
      return props.map((p) => style.getPropertyValue(p)).join("|");
    }).join("#");
    const stops = [...document.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')];
    const seen: string[] = [];
    stops.forEach((el, i) => {
      el.dataset.aeomFocus = String(i);
      seen.push(look(el));
    });
    (window as unknown as { __aeomFocus: string[] }).__aeomFocus = seen;
    return stops.length;
  }, PROPS);
  if (!count) return [];
  const found: Issue[] = [];
  const visited = new Set<string>();
  try {
    for (let i = 0; i < STOPS; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(async (props) => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el.dataset.aeomFocus === undefined) return null;
        // A ring that fades in is read once it is in.
        await Promise.race([Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))), new Promise((done) => setTimeout(done, 500))]);
        const look = [el, ...["::before", "::after"].map((p) => [el, p] as const), el.parentElement].map((x) => {
          if (!x) return "";
          const style = Array.isArray(x) ? getComputedStyle(x[0], x[1]) : getComputedStyle(x as Element);
          return props.map((p) => style.getPropertyValue(p)).join("|");
        }).join("#");
        const before = (window as unknown as { __aeomFocus: string[] }).__aeomFocus[Number(el.dataset.aeomFocus)];
        const box = el.getBoundingClientRect();
        const text = (el.innerText || (el as HTMLInputElement).placeholder || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        return { id: el.dataset.aeomFocus, changed: look !== before, shown: box.width > 0 && box.height > 0, element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}` };
      }, PROPS);
      if (!stop || visited.has(stop.id)) break;
      visited.add(stop.id);
      if (stop.shown && !stop.changed) found.push({ element: stop.element, message: "nothing shows it has the keyboard focus: give it a visible outline or ring (:focus-visible)" });
    }
  } finally {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      for (const el of document.querySelectorAll<HTMLElement>("[data-aeom-focus]")) delete el.dataset.aeomFocus;
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    });
  }
  return found;
}
