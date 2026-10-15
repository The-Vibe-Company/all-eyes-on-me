import type { Page } from "playwright";
import { TOUCH } from "./screen.js";
import type { Issue } from "./types.js";

/** A size as CSS gives it, to a tenth: 11.5 is not 12. */
const px = (n: number) => String(Math.round(n * 10) / 10);

/** The smallest text one reads without effort. */
const SMALLEST = 12;
/** Below this, a phone zooms the page in when a field gets the focus. */
const FIELD = 16;

/**
 * Text is 12 px at least. On a touch screen, a field one types in is 16 px at
 * least: below, the phone zooms the page in as soon as the field gets the
 * focus. Text hidden from sight, such as words kept for screen readers or
 * moved off the page, a footnote mark and text drawn in an SVG, whose size is
 * in the drawing's own units, are not read.
 */
export async function checkFontSize(page: Page): Promise<Issue[]> {
  const found = await page.evaluate(
    ({ smallest, field, touch }) => {
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
      /** Some of the text's own boxes are on the page: text moved off it, to the left or above, is not read. */
      const onPage = (node: Node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return [...range.getClientRects()].some((r) => r.width > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom + window.scrollY > 0);
      };
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        let el = node.parentElement;
        if (!el || !(node.textContent ?? "").trim() || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName) || el.closest("svg, sup, sub")) continue;
        const size = sizeOf(el);
        if (size >= smallest - 0.01 || !shown(el) || !onPage(node)) continue;
        // Said once, on the block that sets the size: the lines of a small terminal are one thing to fix.
        while (el.parentElement && el.parentElement !== document.body && Math.abs(sizeOf(el.parentElement) - size) < 0.01) el = el.parentElement;
        if (said.has(el)) continue;
        said.add(el);
        out.push({ element: name(el), size, field: false });
      }
      if (window.innerWidth < touch) {
        const typed = 'input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="tel"], input[type="url"], input[type="password"], input[type="number"], textarea, select';
        for (const el of document.querySelectorAll<HTMLElement>(typed)) {
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < field - 0.01 && shown(el)) out.push({ element: name(el), size, field: true });
        }
      }
      return out;
    },
    { smallest: SMALLEST, field: FIELD, touch: TOUCH },
  );
  return found.map(({ element, size, field }) => ({
    element,
    message: field ? `the field's text is ${px(size)} px: a phone zooms in when you type in it, ${FIELD} at least` : `its text is ${px(size)} px: ${SMALLEST} at least`,
  }));
}
