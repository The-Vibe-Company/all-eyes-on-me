import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * Items repeated in one row, such as cards or tiles, keep one shape: a title
 * that wraps onto more lines in one of them makes it taller than the others,
 * or, when the row stretches them to one height, makes what follows the title
 * no longer line up. The text is clamped with an ellipsis instead. Only items
 * of the same kind (same tag and classes) side by side, each holding elements
 * of its own, are compared: table cells share their row by design.
 */
export async function checkUneven(page: Page): Promise<Issue[]> {
  const rows = await page.evaluate(() => {
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const kind = (el: Element) => `${el.tagName}.${[...el.classList].sort().join(".")}`;
    const name = (el: HTMLElement) => {
      const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      const classes = [...el.classList].map((c) => `.${c}`).join("");
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
    };
    /** The lines an element's own text shows within its box: lines a clamp hides are not shown. */
    const lines = (el: HTMLElement) => {
      const box = el.getBoundingClientRect();
      const tops: number[] = [];
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width === 0 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1) continue;
          if (!tops.some((t) => Math.abs(t - rect.top) < 3)) tops.push(rect.top);
        }
      }
      return tops.length;
    };
    /** Each element of an item with text of its own, by its kind, with the lines it takes and the height of one. */
    const texts = (item: HTMLElement) => {
      const found = new Map<string, { el: HTMLElement; lines: number; line: number }>();
      for (const el of item.querySelectorAll<HTMLElement>("*")) {
        const key = kind(el);
        if (found.has(key) || !shown(el)) continue;
        const n = lines(el);
        const style = getComputedStyle(el);
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        if (n) found.set(key, { el, lines: n, line });
      }
      return found;
    };
    const found: { element: string; low: number; high: number; most: number; least: number; stretched: boolean }[] = [];
    for (const parent of document.querySelectorAll("body, body *")) {
      const items = [...parent.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.children.length > 0 && shown(c) && c.getBoundingClientRect().width >= 40 && !["inline", "contents"].includes(getComputedStyle(c).display));
      const byKind = new Map<string, HTMLElement[]>();
      for (const item of items) byKind.set(kind(item), [...(byKind.get(kind(item)) ?? []), item]);
      for (const same of byKind.values()) {
        // Side by side: the same top.
        const byTop: HTMLElement[][] = [];
        for (const item of same) {
          const top = item.getBoundingClientRect().top;
          const row = byTop.find((r) => Math.abs(r[0]!.getBoundingClientRect().top - top) < 3);
          if (row) row.push(item);
          else byTop.push([item]);
        }
        for (const row of byTop.filter((r) => r.length >= 2)) {
          const heights = row.map((item) => item.getBoundingClientRect().height);
          const ends = row.map((item) => {
            const last = item.lastElementChild!;
            return last.getBoundingClientRect().top - item.getBoundingClientRect().top;
          });
          const differ = Math.max(...heights) - Math.min(...heights) > 4;
          const misaligned = Math.max(...ends) - Math.min(...ends) > 4;
          if (!differ && !misaligned) continue;
          // The tallest item against the shortest: what its text takes in more lines must explain the gap, or the
          // items differ for another reason (a longer list in one column), which no clamp fixes.
          const measure = differ ? heights : ends;
          const tall = measure.indexOf(Math.max(...measure));
          const short = measure.indexOf(Math.min(...measure));
          const gap = measure[tall]! - measure[short]!;
          const mine = texts(row[tall]!);
          const theirs = texts(row[short]!);
          let extra = 0;
          let worst: { el: HTMLElement; most: number; least: number } | null = null;
          for (const [key, t] of mine) {
            const o = theirs.get(key);
            if (!o || t.lines <= o.lines) continue;
            extra += (t.lines - o.lines) * t.line;
            if (!worst || t.lines - o.lines > worst.most - worst.least) worst = { el: t.el, most: t.lines, least: o.lines };
          }
          if (!worst || Math.abs(gap - extra) > Math.max(6, extra / 2)) continue;
          found.push({ element: name(worst.el), low: Math.round(Math.min(...heights)), high: Math.round(Math.max(...heights)), most: worst.most, least: worst.least, stretched: !differ });
        }
      }
    }
    return found;
  });
  return rows.map(({ element, low, high, most, least, stretched }) => ({
    element,
    message: `${stretched ? "the items of one row no longer line up" : `the items of one row are ${low} to ${high} px tall`}: it takes ${most} lines where the others take ${least}. Clamp it with an ellipsis (line-clamp), so every item keeps one shape`,
  }));
}
