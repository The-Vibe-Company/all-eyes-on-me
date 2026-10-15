import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** The longest line the eye follows back to the start of the next one. */
const LONGEST = 90;
/** A paragraph of fewer lines is read in one go. */
const LINES = 3;

/** Running text holds 90 characters a line at most, on a paragraph of three lines or more. */
export async function checkLineLength(page: Page): Promise<Issue[]> {
  const found = await page.evaluate(
    ({ longest, least }) => {
      const out: { element: string; perLine: number }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("p, li, dd, blockquote")) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || !(el.checkVisibility?.() ?? true)) continue;
        const tops: number[] = [];
        let chars = 0;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? "";
          if (!text.trim()) continue;
          chars += text.replace(/\s+/g, " ").length;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) if (r.width > 0 && !tops.some((t) => Math.abs(t - r.top) < 3)) tops.push(r.top);
        }
        if (tops.length < least) continue;
        // The last line is often short: count it as half.
        const perLine = Math.round(chars / (tops.length - 0.5));
        if (perLine <= longest) continue;
        const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        out.push({ element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`, perLine });
      }
      return out;
    },
    { longest: LONGEST, least: LINES },
  );
  return found.map(({ element, perLine }) => ({ element, message: `about ${perLine} characters a line: ${LONGEST} at most, so the eye finds the next line (max-width: 70ch)` }));
}
