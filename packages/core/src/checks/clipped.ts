import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * Text is never cut by its box without saying so: a box that hides what
 * overflows it cuts its text with an ellipsis (`text-overflow`) or a clamp
 * (`line-clamp`), here or on a box between it and the text, and a box that
 * shows what overflows it does not let its text spill out of it.
 *
 * Only text the box's edge cuts counts: part of it past the edge, part of it
 * still inside. Text wholly past the edge is hidden by design, and so is a
 * block cropped as a whole at the side, such as the slide of a carousel that
 * peeks in. Text hidden from sight (words kept for screen readers, an
 * `aria-hidden` watermark, a closed panel) and text in a box that scrolls
 * sideways on purpose, such as a line of code, are left alone.
 */
export async function checkClipped(page: Page): Promise<Issue[]> {
  const found = await page.evaluate(async () => {
    // An animation that reveals a text crosses its box until it ends.
    const running = document.getAnimations?.().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity) ?? [];
    await Promise.race([Promise.all(running.map((a) => a.finished.catch(() => undefined))), new Promise((done) => setTimeout(done, 1000))]);
    const name = (el: HTMLElement) => {
      const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      const classes = [...el.classList].map((c) => `.${c}`).join("");
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
    };
    const hides = (v: string) => v === "hidden" || v === "clip";
    const scrolls = (v: string) => v === "auto" || v === "scroll";
    const clamped = (s: CSSStyleDeclaration) => {
      const v = s.getPropertyValue("-webkit-line-clamp");
      return !!v && v !== "none";
    };
    const rectsOf = (node: Node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    };
    /** Hidden from sight: in a box of a pixel or two, clipped away, aria-hidden, or not rendered. */
    const hidden = (el: Element | null) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const s = getComputedStyle(e);
        const b = e.getBoundingClientRect();
        if (b.width < 4 || b.height < 4 || (s.clip && s.clip !== "auto") || s.clipPath !== "none" || e.getAttribute("aria-hidden") === "true") return true;
      }
      return !(el?.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
    };
    const found: { element: string; how: "cut-side" | "cut-bottom" | "spill-side" | "spill-bottom" }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (["INPUT", "TEXTAREA", "SELECT", "SCRIPT", "STYLE", "SVG"].includes(el.tagName.toUpperCase())) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 4 || box.height < 4 || box.right <= 0 || box.left >= window.innerWidth) continue;
      const style = getComputedStyle(el);
      if (style.clipPath !== "none" || (style.clip && style.clip !== "auto")) continue;
      // Glyphs reach past a tight line height, a display title's at line-height 0.9: a third of the font size is not a cut.
      const tol = parseFloat(style.fontSize) * 0.35 || 4;
      // A run of text the edge cuts: part of it past the edge, part of it still inside.
      const cutSide = (rects: DOMRect[]) => rects.some((r) => r.right > box.right + tol) && rects.some((r) => r.left < box.right - tol);
      const cutBottom = (rects: DOMRect[]) => rects.some((r) => r.bottom > box.bottom + tol) && rects.some((r) => r.top < box.bottom - tol);
      if (hides(style.overflowX) || hides(style.overflowY)) {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let seen = 0;
        for (let node = walker.nextNode(); node && seen < 200; node = walker.nextNode()) {
          if (!(node.textContent ?? "").trim()) continue;
          seen++;
          // Between the text and this box: a box that crops, ellipsizes, clamps or scrolls deals with the text itself;
          // a block wholly past the side is cropped as a whole.
          let ellipsis = style.textOverflow === "ellipsis";
          let clamp = clamped(style);
          let own = true;
          let block: Element | null = null;
          for (let e = node.parentElement; e && e !== el; e = e.parentElement) {
            const s = getComputedStyle(e);
            if (hides(s.overflowX) || hides(s.overflowY) || scrolls(s.overflowX) || scrolls(s.overflowY)) own = false;
            ellipsis ||= s.textOverflow === "ellipsis";
            clamp ||= clamped(s);
            if (!block && s.display !== "inline") block = e;
          }
          if (!own) continue;
          const rects = rectsOf(node);
          const cropped = block ? block.getBoundingClientRect().right > box.right + tol : false;
          const how = hides(style.overflowX) && !ellipsis && !cropped && cutSide(rects) ? "cut-side" : hides(style.overflowY) && !clamp && cutBottom(rects) ? "cut-bottom" : null;
          // Measured last, on what is cut only: walking the ancestors of every text would be slow on a long page.
          if (how && !hidden(node.parentElement)) {
            found.push({ element: name(el), how });
            break;
          }
        }
        continue;
      }
      if (scrolls(style.overflowX) || scrolls(style.overflowY)) continue;
      // A box that shows what overflows it: its own words must stay inside it.
      let how: "spill-side" | "spill-bottom" | null = null;
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? "").trim()) continue;
        const rects = rectsOf(node);
        how = cutSide(rects) ? "spill-side" : cutBottom(rects) ? "spill-bottom" : null;
        if (how) break;
      }
      if (!how) continue;
      // Inside a box that crops, what spills is that box's to cut. Inside one that scrolls, a line kept whole on
      // purpose (code, white-space: pre or nowrap) scrolls with it; any other text that spills still spills.
      let held = false;
      for (let outer = el.parentElement; outer && outer !== document.body && !held; outer = outer.parentElement) {
        const o = getComputedStyle(outer);
        if (hides(o.overflowX) || hides(o.overflowY)) held = true;
        else if (scrolls(o.overflowX) && /^(pre|nowrap)$/.test(style.whiteSpace)) held = true;
      }
      if (!held && !hidden(el)) found.push({ element: name(el), how });
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
