import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** A class that names a chip, a badge, a pill or a tag, as a whole word of it. */
const CHIP = /(^|[-_])(badge|chip|pill|tag)s?($|[-_])/i;
/** A class that makes a link look like a button. */
const BUTTON_LINK = /(^|[-_])(btn|button|cta)($|[-_])/i;
/** A label is short: longer, it is a question, a card or a sentence, which may wrap. */
const LONGEST = 32;

/**
 * A label holds on one line: a button, a tab, a link of the site's header or
 * navigation, a link styled as a button, a chip or a badge whose label goes
 * onto two lines is taller than the others. Only short labels count, one run
 * of text with no block of its own inside: a long FAQ question, a clickable
 * card, the links of a footer may wrap. Text hidden from sight, such as words
 * kept for screen readers, is not measured.
 */
export async function checkWrap(page: Page): Promise<Issue[]> {
  const wrapped = await page.evaluate(
    ({ chip, buttonLink, longest }) => {
      const isChip = new RegExp(chip.source, chip.flags);
      const isButtonLink = new RegExp(buttonLink.source, buttonLink.flags);
      const words = (el: Element, re: RegExp) => [...el.classList].some((c) => re.test(c));
      const candidates = [
        ...document.querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"], header a, nav a, a'),
        ...[...document.querySelectorAll<HTMLElement>("body *")].filter((el) => words(el, isChip)),
      ].filter((el, i, all) => all.indexOf(el) === i);
      const isLabel = (el: HTMLElement) => {
        if (el.tagName === "A" && !el.closest("header, nav") && !words(el, isButtonLink) && el.getAttribute("role") !== "button" && el.getAttribute("role") !== "tab") return false;
        // The links of a footer or a sidebar may wrap.
        if (el.tagName === "A" && !words(el, isButtonLink) && el.closest("footer, aside")) return false;
        const text = (el.innerText || "").trim().replace(/\s+/g, " ");
        if (!text || text.length > longest) return false;
        // A card or a disclosure with blocks of its own is not a label.
        return ![...el.querySelectorAll("*")].some((c) => /^(block|flex|grid|list-item|table)$/.test(getComputedStyle(c).display) && (c.textContent ?? "").trim());
      };
      /** Hidden from sight: a box of a pixel or two, clipped away, or not rendered. */
      const hidden = (node: Node, upTo: Element) => {
        for (let e = node.parentElement; e && e !== upTo.parentElement; e = e.parentElement) {
          const s = getComputedStyle(e);
          const b = e.getBoundingClientRect();
          if (b.width < 4 || b.height < 4 || (s.clip && s.clip !== "auto") || s.clipPath !== "none" || e.getAttribute("aria-hidden") === "true") return true;
        }
        return false;
      };
      /** How many lines one run of text takes inside the label's box, from the tops of its boxes. */
      const lines = (node: Text, b: DOMRect) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops: number[] = [];
        for (const r of range.getClientRects()) {
          if (r.width === 0 || r.bottom < b.top || r.top > b.bottom) continue;
          if (!tops.some((t) => Math.abs(t - r.top) < 3)) tops.push(r.top);
        }
        return tops.length;
      };
      // In the page's order, so a label inside another is said once, with the outer one.
      candidates.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const found: { element: string; lines: number }[] = [];
      const said: HTMLElement[] = [];
      for (const el of candidates) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0 || b.right <= 0 || b.left >= window.innerWidth || said.some((s) => s.contains(el))) continue;
        if (!(el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true) || !isLabel(el)) continue;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let most = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node.textContent ?? "").trim() && !hidden(node, el)) most = Math.max(most, lines(node as Text, b));
        if (most < 2) continue;
        said.push(el);
        const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        found.push({ element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`, lines: most });
      }
      return found;
    },
    { chip: { source: CHIP.source, flags: CHIP.flags }, buttonLink: { source: BUTTON_LINK.source, flags: BUTTON_LINK.flags }, longest: LONGEST },
  );
  return wrapped.map(({ element, lines }) => ({ element, message: `its label goes onto ${lines} lines: keep it on one (a shorter word, a wider box, or an ellipsis)` }));
}
