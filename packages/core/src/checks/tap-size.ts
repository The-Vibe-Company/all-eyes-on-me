import type { Page } from "playwright";
import { TOUCH } from "./screen.js";
import type { Issue } from "./types.js";

const CLICKABLE = 'a[href], button:not([disabled]), [role="button"], [role="link"], [role="tab"], [onclick], input:not([type="hidden"]):not([type="range"]), select, textarea, summary';
/** The smallest target a finger hits surely, or the room it needs around a smaller one (WCAG 2.5.8). */
const LEAST = 24;

/**
 * On a touch screen, what one taps is 24 by 24 px at least, or sits 24 px
 * apart from the next target, as WCAG 2.5.8 asks. The hit area counts, not
 * the drawing: a pseudo-element that widens a button, the label of a field or
 * a checkbox, the link around an element. A link inside a sentence is part of
 * the text, and a target out of sight (a skip link above the page) is left
 * alone.
 */
export async function checkTapSize(page: Page): Promise<Issue[]> {
  const small = await page.evaluate(
    async ({ clickable, touch, least }) => {
      if (window.innerWidth >= touch) return [];
      const from = { x: window.scrollX, y: window.scrollY };
      const name = (el: HTMLElement) => {
        const field = el as HTMLInputElement;
        const label = el.getAttribute("aria-label") || (field.labels?.[0]?.innerText ?? "") || field.placeholder || (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(button|submit|reset)$/.test(field.type) ? "" : el.innerText || field.value || "");
        const text = label.trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
      };
      /** A target inside running text: its block holds words outside it. */
      const inSentence = (el: HTMLElement) => {
        if (getComputedStyle(el).display !== "inline") return false;
        let block = el.parentElement;
        while (block && getComputedStyle(block).display === "inline") block = block.parentElement;
        if (!block) return false;
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!el.contains(node) && (node.textContent ?? "").trim()) return true;
        return false;
      };
      /** Where the target is hit, in the page's coordinates: its own box, or the label or link it is hit through. */
      const area = (el: HTMLElement) => {
        let r = el.getBoundingClientRect();
        const field = el as HTMLInputElement;
        const label = field.labels?.[0] ?? null;
        const outer = !el.hasAttribute("href") && !el.hasAttribute("onclick") ? el.parentElement?.closest("a[href], label") : null;
        for (const other of [label, outer]) {
          const o = other?.getBoundingClientRect();
          if (o && o.width * o.height > r.width * r.height) r = o;
        }
        return { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width, height: r.height, through: label ?? outer ?? null };
      };
      const targets = [...document.querySelectorAll<HTMLElement>(clickable)].filter((el) => {
        const b = el.getBoundingClientRect();
        // Out of sight: a box of a pixel or two, or wholly off the page, as a skip link waiting above it.
        if (b.width < 4 || b.height < 4 || b.right <= 0 || b.left >= window.innerWidth || b.bottom + window.scrollY <= 0) return false;
        return (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true) && !inSentence(el);
      });
      const boxes = new Map(targets.map((el) => [el, area(el)]));
      const under = (b: { width: number; height: number }) => b.width < least - 0.5 || b.height < least - 0.5;
      const centre = (b: { left: number; top: number; width: number; height: number }) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
      const found: { element: string; width: number; height: number }[] = [];
      try {
        for (const el of targets) {
          const b = boxes.get(el)!;
          if (!under(b)) continue;
          // The hit area may be wider than the drawing: probe 12 px around the centre.
          el.scrollIntoView({ block: "center", inline: "center" });
          const v = el.getBoundingClientRect();
          const cx = v.left + v.width / 2;
          const cy = v.top + v.height / 2;
          const hits = [[cx - least / 2, cy], [cx + least / 2 - 1, cy], [cx, cy - least / 2], [cx, cy + least / 2 - 1]].every(([x, y]) => {
            const hit = document.elementFromPoint(x!, y!);
            return !!hit && (el.contains(hit) || !!b.through?.contains(hit));
          });
          if (hits) continue;
          // Spaced apart: a circle of 24 px around its centre touches no other target, nor another small one's circle.
          const c = centre(b);
          const crowded = targets.some((other) => {
            if (other === el || other.contains(el) || el.contains(other)) return false;
            const o = boxes.get(other)!;
            if (under(o)) {
              const oc = centre(o);
              return Math.hypot(oc.x - c.x, oc.y - c.y) < least - 0.5;
            }
            const dx = Math.max(o.left - c.x, 0, c.x - (o.left + o.width));
            const dy = Math.max(o.top - c.y, 0, c.y - (o.top + o.height));
            return Math.hypot(dx, dy) < least / 2 - 0.5;
          });
          if (crowded) found.push({ element: name(el), width: Math.round(b.width), height: Math.round(b.height) });
        }
      } finally {
        window.scrollTo({ left: from.x, top: from.y, behavior: "instant" as ScrollBehavior });
      }
      return found;
    },
    { clickable: CLICKABLE, touch: TOUCH, least: LEAST },
  );
  return small.map(({ element, width, height }) => ({ element, message: `${width}×${height} px and closer than ${LEAST} px to another target: too small to tap, ${LEAST}×${LEAST} at least, or ${LEAST} px apart` }));
}
