import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * No box marked by a coloured border on its left or right side only, such as a callout,
 * a card or a list item with a stripe: one of the looks an AI proposes by default
 * (impeccable's bans). A hairline elsewhere does not change it. A rule beside plain text,
 * such as a quote's or a lead paragraph's, is typography, a table's cells are borders by
 * design, and a 1 px border on one side is a divider.
 */
export async function checkSideStripe(page: Page): Promise<Issue[]> {
  const found = await page.$$eval("body *", (nodes) => {
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect();
      return box.width >= 40 && box.height >= 16 && (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
    };
    /** A colour that shows: not transparent, and not of alpha 0. */
    const coloured = (color: string) => {
      const m = color.match(/^rgba?\(([^)]*)\)$/);
      if (!m) return color !== "transparent";
      const parts = m[1]!.split(/[\s,/]+/).filter(Boolean);
      return parts.length < 4 || parseFloat(parts[3]!) > 0;
    };
    const out: { element: string; width: number; side: string }[] = [];
    for (const el of nodes) {
      if (/^(BLOCKQUOTE|TD|TH|HR|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) continue;
      const s = getComputedStyle(el);
      const width = (side: string) => (s.getPropertyValue(`border-${side}-style`) === "none" ? 0 : parseFloat(s.getPropertyValue(`border-${side}-width`)) || 0);
      const [left, right, top, bottom] = ["left", "right", "top", "bottom"].map(width) as [number, number, number, number];
      const side = left >= 2 && right <= 1 ? "left" : right >= 2 && left <= 1 ? "right" : null;
      if (!side || top > 1 || bottom > 1 || !coloured(s.getPropertyValue(`border-${side}-color`)) || !shown(el)) continue;
      // A box: a background, a hairline elsewhere, rounded corners or a shadow. A rule beside plain text is typography.
      const boxed = coloured(s.backgroundColor) || top > 0 || bottom > 0 || (side === "left" ? right : left) > 0 || parseFloat(s.borderTopRightRadius) > 0 || parseFloat(s.borderBottomRightRadius) > 0 || parseFloat(s.borderTopLeftRadius) > 0 || s.boxShadow !== "none";
      if (!boxed) continue;
      const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!text && el.children.length === 0) continue;
      const classes = [...el.classList].map((c) => `.${c}`).join("");
      out.push({ element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`, width: Math.round(side === "left" ? left : right), side });
    }
    return out;
  });
  return found.map(({ element, width, side }) => ({
    element,
    message: `a ${width} px coloured border on its ${side} side only, a stripe: mark it otherwise (a full border, a tinted background, a leading icon or number) or not at all`,
  }));
}
