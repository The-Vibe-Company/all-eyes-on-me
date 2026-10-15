import type { Page } from "playwright";
import type { Issue } from "./types.js";

const CLICKABLE = 'a[href], button:not([disabled]), [role="button"], [role="link"], [role="tab"], [onclick], input:not([type="hidden"]), select, textarea, summary';
/** A phone's screen: below this width, the page is touched, not clicked. */
const PHONE = 768;
/** The smallest a finger can hit surely. */
const LEAST = 44;

/**
 * On a phone, what one taps is 44 by 44 px at least. A link inside a sentence
 * is part of the text, and a checkbox or a radio counts with its label.
 */
export async function checkTapSize(page: Page): Promise<Issue[]> {
  const small = await page.evaluate(
    ({ clickable, phone, least }) => {
      if (window.innerWidth >= phone) return [];
      const name = (el: HTMLElement) => {
        const text = (el.innerText || (el as HTMLInputElement).value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
      };
      /** A link inside running text: its block holds words of its own around it. */
      const inSentence = (el: HTMLElement) => {
        if (getComputedStyle(el).display !== "inline") return false;
        const block = el.parentElement?.closest("p, li, td, dd, blockquote, figcaption, label, span") ?? el.parentElement;
        const around = [...(block?.childNodes ?? [])].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
        return around;
      };
      const found: { element: string; width: number; height: number }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(clickable)) {
        let box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || box.right <= 0 || box.left >= window.innerWidth) continue;
        if (!(el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true) || inSentence(el)) continue;
        // A checkbox or a radio is hit through its label.
        const input = el as HTMLInputElement;
        if (el.tagName === "INPUT" && (input.type === "checkbox" || input.type === "radio")) {
          const label = el.closest("label") ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
          if (label) box = label.getBoundingClientRect();
        }
        // Something clickable inside something clickable that is big enough is hit through it.
        const outer = el.parentElement?.closest(clickable);
        if (outer && outer.getBoundingClientRect().width >= least && outer.getBoundingClientRect().height >= least) continue;
        if (box.width < least - 0.5 || box.height < least - 0.5) found.push({ element: name(el), width: Math.round(box.width), height: Math.round(box.height) });
      }
      return found;
    },
    { clickable: CLICKABLE, phone: PHONE, least: LEAST },
  );
  return small.map(({ element, width, height }) => ({ element, message: `${width}×${height} px: too small to tap, ${LEAST}×${LEAST} at least` }));
}
