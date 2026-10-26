import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * No heading leaves one word alone on its last line: measured at each width, where its
 * lines fall, word by word. `text-wrap: balance` or `pretty` evens the lines out where
 * the browser can; a non-breaking space ties the last word to the one before it.
 */
export async function checkOrphan(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const out: { element: string; message: string }[] = [];
    for (const heading of document.querySelectorAll("h1, h2, h3")) {
      if (!(heading.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true)) continue;
      // Each word where the browser draws it; a line a clamp hides is not read.
      const shown = heading.getBoundingClientRect();
      const words: { word: string; top: number; bottom: number; node: Node }[] = [];
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of (node.textContent ?? "").matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index!);
          range.setEnd(node, match.index! + match[0].length);
          const rect = range.getClientRects()[0];
          if (rect && rect.width > 0 && rect.top < shown.bottom - 1) words.push({ word: match[0], top: rect.top, bottom: rect.bottom, node });
        }
      }
      if (words.length < 3) continue;
      // A word starts a line when it sits below the line so far: a smaller word, a sup or a badge sits within it.
      let lines = 1;
      let last = 0;
      let bottom = words[0]!.bottom;
      for (let i = 1; i < words.length; i++) {
        const middle = (words[i]!.top + words[i]!.bottom) / 2;
        if (middle > bottom) {
          lines += 1;
          last = i;
          bottom = words[i]!.bottom;
        } else bottom = Math.max(bottom, words[i]!.bottom);
      }
      if (lines < 2 || last !== words.length - 1) continue;
      // A line broken by hand, « Bienvenue chez<br>Acme », is the author's.
      const breaks = heading.querySelectorAll("br");
      const lastBreak = breaks[breaks.length - 1];
      if (lastBreak && lastBreak.compareDocumentPosition(words.at(-1)!.node) & Node.DOCUMENT_POSITION_FOLLOWING) continue;
      const text = ((heading as HTMLElement).innerText || "").trim().replace(/\s+/g, " ");
      out.push({ element: `${heading.tagName.toLowerCase()} "${text.slice(0, 40)}"`, message: `its last line holds one word, "${words.at(-1)!.word}": text-wrap: balance or pretty, or a non-breaking space before it` });
    }
    return out;
  });
}
