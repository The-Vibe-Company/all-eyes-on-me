import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** A size as CSS gives it, to a tenth: 11.5 is not 12. */
const px = (n: number) => String(Math.round(n * 10) / 10);

/** The smallest text one reads without effort. */
const SMALLEST = 12;
/** Below this, a phone zooms the page in when a field gets the focus. */
const FIELD = 16;
const PHONE = 768;

/**
 * Text is 12 px at least. On a phone, a field one types in is 16 px at least:
 * below, the phone zooms the page in as soon as the field gets the focus.
 * Text hidden from sight, such as words kept for screen readers, is not read.
 */
export async function checkFontSize(page: Page): Promise<Issue[]> {
  const found = await page.evaluate(
    ({ smallest, field, phone }) => {
      const name = (el: HTMLElement) => {
        const text = (el.innerText || (el as HTMLInputElement).placeholder || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
      };
      const shown = (el: Element) => {
        const b = el.getBoundingClientRect();
        return b.width >= 4 && b.height >= 4 && (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
      };
      const out: { element: string; size: number; field: boolean }[] = [];
      const said = new Set<Element>();
      const sizeOf = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        let el = node.parentElement;
        if (!el || !(node.textContent ?? "").trim() || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
        const size = sizeOf(el);
        if (size >= smallest - 0.01 || !shown(el)) continue;
        // Said once, on the block that sets the size: the lines of a small terminal are one thing to fix.
        while (el.parentElement && el.parentElement !== document.body && Math.abs(sizeOf(el.parentElement) - size) < 0.01) el = el.parentElement;
        if (said.has(el)) continue;
        said.add(el);
        out.push({ element: name(el), size, field: false });
      }
      if (window.innerWidth < phone) {
        const typed = 'input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="tel"], input[type="url"], input[type="password"], input[type="number"], textarea, select';
        for (const el of document.querySelectorAll<HTMLElement>(typed)) {
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < field - 0.01 && shown(el)) out.push({ element: name(el), size, field: true });
        }
      }
      return out;
    },
    { smallest: SMALLEST, field: FIELD, phone: PHONE },
  );
  return found.map(({ element, size, field }) => ({
    element,
    message: field ? `the field's text is ${px(size)} px: a phone zooms in when you type in it, ${FIELD} at least` : `its text is ${px(size)} px: ${SMALLEST} at least`,
  }));
}
