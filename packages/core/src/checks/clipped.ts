import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * Text is never cut by its box without saying so: a box that hides what
 * overflows it cuts its text with an ellipsis (`text-overflow`) or a clamp
 * (`line-clamp`), and a box that shows it does not let a word spill out of it.
 * Only text the box's edge cuts counts, a line it crosses or a paragraph whose
 * first lines are in and the next ones out: text wholly outside the box, such
 * as another slide of a carousel, is hidden by design. A box of a few pixels,
 * text kept for screen readers, is left alone, and so is a box that scrolls.
 */
export async function checkClipped(page: Page): Promise<Issue[]> {
  const found = await page.evaluate(() => {
    const name = (el: HTMLElement) => {
      const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      const classes = [...el.classList].map((c) => `.${c}`).join("");
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
    };
    const hides = (v: string) => v === "hidden" || v === "clip";
    const scrolls = (v: string) => v === "auto" || v === "scroll";
    const clamped = (el: Element) => {
      const v = getComputedStyle(el).getPropertyValue("-webkit-line-clamp");
      return !!v && v !== "none";
    };
    const rectsOf = (node: Node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    };
    /** The text nodes inside a box, without those of a box that scrolls on its own inside it. */
    const textsIn = (box: HTMLElement) => {
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node && nodes.length < 200; node = walker.nextNode()) {
        if (!(node.textContent ?? "").trim()) continue;
        let inner = node.parentElement;
        let own = true;
        while (inner && inner !== box) {
          const s = getComputedStyle(inner);
          if (scrolls(s.overflowX) || scrolls(s.overflowY)) own = false;
          inner = inner.parentElement;
        }
        if (own) nodes.push(node as Text);
      }
      return nodes;
    };
    const found: { element: string; how: "cut-side" | "cut-bottom" | "spill-side" | "spill-bottom" }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (["INPUT", "TEXTAREA", "SELECT", "SCRIPT", "STYLE", "SVG"].includes(el.tagName.toUpperCase())) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) continue;
      const style = getComputedStyle(el);
      if (style.clipPath !== "none" || (style.clip && style.clip !== "auto")) continue;
      // Glyphs reach past a tight line height, a display title's at line-height 0.9: a third of the font size is not a cut.
      const tol = parseFloat(style.fontSize) * 0.35 || 4;
      // A run of text the edge cuts: part of it past the edge, part of it still inside. Text wholly past it is hidden by design.
      const cutSide = (rects: DOMRect[]) => rects.some((r) => r.right > box.right + tol) && rects.some((r) => r.left < box.right - tol);
      const cutBottom = (rects: DOMRect[]) => rects.some((r) => r.bottom > box.bottom + tol) && rects.some((r) => r.top < box.bottom - tol);
      if (hides(style.overflowX) || hides(style.overflowY)) {
        for (const node of textsIn(el)) {
          const holder = node.parentElement!;
          const rects = rectsOf(node);
          const ellipsis = style.textOverflow === "ellipsis" || getComputedStyle(holder).textOverflow === "ellipsis";
          if (hides(style.overflowX) && !ellipsis && cutSide(rects)) {
            found.push({ element: name(el), how: "cut-side" });
            break;
          }
          if (hides(style.overflowY) && !clamped(el) && !clamped(holder) && cutBottom(rects)) {
            found.push({ element: name(el), how: "cut-bottom" });
            break;
          }
        }
        continue;
      }
      if (scrolls(style.overflowX) || scrolls(style.overflowY)) continue;
      // Inside a box that scrolls or cuts, what spills is that box's: a line of code in a block that scrolls sideways.
      let outer = el.parentElement;
      let held = false;
      while (outer && outer !== document.body && !held) {
        const o = getComputedStyle(outer);
        held = o.overflowX !== "visible" || o.overflowY !== "visible";
        outer = outer.parentElement;
      }
      if (held) continue;
      // A box that shows what overflows it: its own words must stay inside it.
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? "").trim()) continue;
        const rects = rectsOf(node);
        if (cutSide(rects)) {
          found.push({ element: name(el), how: "spill-side" });
          break;
        }
        if (cutBottom(rects)) {
          found.push({ element: name(el), how: "spill-bottom" });
          break;
        }
      }
    }
    return found;
  });
  const say = {
    "cut-side": "its text is cut by its box with no ellipsis: end it with an ellipsis (text-overflow), or give it room",
    "cut-bottom": "its text is cut at the bottom of its box with no ellipsis: clamp it (line-clamp), or let the box grow",
    "spill-side": "its text spills out of its box: let it wrap and break (white-space, overflow-wrap), or give it room",
    "spill-bottom": "its text spills out of the bottom of its box: let the box grow, or clamp the text",
  };
  return found.map(({ element, how }) => ({ element, message: say[how] }));
}
