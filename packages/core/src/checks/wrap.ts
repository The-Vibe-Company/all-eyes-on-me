import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** What holds a label on one line: a button, a tab, a link of the navigation, a chip or a badge. */
const LABELS = 'button, [role="button"], [role="tab"], nav a, header a';
/** A class that names a chip, a badge, a pill or a tag, as a whole word of it. */
const CHIP = /(^|[-_])(badge|chip|pill|tag)s?($|[-_])/i;

/** A label must hold on one line: one that goes onto two makes its button, tab or chip taller than the others. */
export async function checkWrap(page: Page): Promise<Issue[]> {
  const wrapped = await page.evaluate(
    ({ labels, chip }) => {
      const isChip = new RegExp(chip.source, chip.flags);
      const candidates = [...new Set([...document.querySelectorAll<HTMLElement>(labels), ...[...document.querySelectorAll<HTMLElement>("body *")].filter((el) => [...el.classList].some((c) => isChip.test(c)))])];
      // In the page's order, so a label inside another is said once, with the outer one.
      candidates.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      /** How many lines one run of text takes, from the tops of its boxes. */
      const lines = (node: Text) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops: number[] = [];
        for (const rect of range.getClientRects()) if (rect.width > 0 && !tops.some((t) => Math.abs(t - rect.top) < 3)) tops.push(rect.top);
        return tops.length;
      };
      const found: { element: string; lines: number }[] = [];
      const said: HTMLElement[] = [];
      for (const el of candidates) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || said.some((s) => s.contains(el))) continue;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let most = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node.textContent ?? "").trim()) most = Math.max(most, lines(node as Text));
        if (most < 2) continue;
        said.push(el);
        const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        found.push({ element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`, lines: most });
      }
      return found;
    },
    { labels: LABELS, chip: { source: CHIP.source, flags: CHIP.flags } },
  );
  return wrapped.map(({ element, lines }) => ({ element, message: `its label goes onto ${lines} lines: keep it on one (a shorter word, a wider box, or an ellipsis)` }));
}
