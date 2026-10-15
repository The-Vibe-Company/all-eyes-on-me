import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** The longest line the eye follows back to the start of the next one. */
const LONGEST = 90;
/** A paragraph of fewer lines is read in one go. */
const LINES = 3;

/**
 * Running text holds 90 characters a line at most, on a paragraph of three
 * lines or more. Lines are measured where they are: each is a run of text
 * boxes side by side, so columns stay apart, and only the innermost block of
 * text is measured, a paragraph rather than the list item around it. The
 * width of a line in characters is its width over the text's average width
 * of a character.
 */
export async function checkLineLength(page: Page): Promise<Issue[]> {
  const found = await page.evaluate(
    ({ longest, least }) => {
      const out: { element: string; perLine: number }[] = [];
      const blockOf = (el: Element) => !/^(inline|contents|none)$/.test(getComputedStyle(el).display);
      for (const el of document.querySelectorAll<HTMLElement>("p, li, dd, blockquote")) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || !(el.checkVisibility?.() ?? true)) continue;
        // A block around other blocks of text: those are measured, not it.
        if ([...el.querySelectorAll("*")].some((c) => blockOf(c) && (c.textContent ?? "").trim())) continue;
        const rects: DOMRect[] = [];
        let chars = 0;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = (node.textContent ?? "").replace(/\s+/g, " ");
          if (!text.trim()) continue;
          chars += text.length;
          const range = document.createRange();
          range.selectNodeContents(node);
          rects.push(...[...range.getClientRects()].filter((r) => r.width > 0));
        }
        if (!chars || !rects.length) continue;
        // Boxes on one line and touching are one line; a column apart is another.
        const font = parseFloat(getComputedStyle(el).fontSize) || 16;
        const lines: { top: number; left: number; right: number }[] = [];
        for (const r of [...rects].sort((a, b) => a.top - b.top || a.left - b.left)) {
          const line = lines.find((l) => Math.abs(l.top - r.top) < 3 && r.left - l.right < font / 2 && l.left - r.right < font / 2);
          if (line) {
            line.left = Math.min(line.left, r.left);
            line.right = Math.max(line.right, r.right);
          } else lines.push({ top: r.top, left: r.left, right: r.right });
        }
        if (lines.length < least) continue;
        const perChar = rects.reduce((sum, r) => sum + r.width, 0) / chars;
        const perLine = Math.round(Math.max(...lines.map((l) => l.right - l.left)) / perChar);
        if (perLine <= longest) continue;
        const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        out.push({ element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`, perLine });
      }
      return out;
    },
    { longest: LONGEST, least: LINES },
  );
  return found.map(({ element, perLine }) => ({ element, message: `about ${perLine} characters a line: ${LONGEST} at most, so the eye finds the next line (narrow the column, about 60ch)` }));
}
