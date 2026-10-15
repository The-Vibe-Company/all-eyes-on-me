import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * Items repeated in one row, such as cards or tiles, keep one shape: a title
 * that wraps onto more lines in one of them makes it taller than the others,
 * or, when the row stretches them to one height, makes what follows the title
 * no longer line up. The title is clamped with an ellipsis, and its lines
 * reserved, instead. Only items of the same kind (same tag and classes) side
 * by side, each holding elements of its own, are compared, and only on their
 * titles, names and labels: running text such as a quote or a description
 * differs by nature, and table cells share their row by design.
 */
export async function checkUneven(page: Page): Promise<Issue[]> {
  const rows = await page.evaluate(() => {
    const rect = new Map<Element, DOMRect>();
    const box = (el: Element) => {
      let r = rect.get(el);
      if (!r) rect.set(el, (r = el.getBoundingClientRect()));
      return r;
    };
    const shown = (el: Element) => box(el).width > 0 && box(el).height > 0 && (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
    const kind = (el: Element) => `${el.tagName}.${[...el.classList].sort().join(".")}`;
    const name = (el: HTMLElement) => {
      const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      const classes = [...el.classList].map((c) => `.${c}`).join("");
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
    };
    /** A title, a name or a label: what a row's items line up on. */
    const labelLike = (el: Element) => /^(H[1-6]|A|BUTTON|LABEL|STRONG|B|DT)$/.test(el.tagName) || [...el.classList].some((c) => /title|name|heading|label/i.test(c));
    /** The clamp an element or one of its ancestors in the item sets, as a number of lines; null when none. */
    const clampOf = (el: Element, item: Element) => {
      for (let e: Element | null = el; e && e !== item.parentElement; e = e.parentElement) {
        const s = getComputedStyle(e);
        const n = parseInt(s.getPropertyValue("-webkit-line-clamp"), 10);
        if (n > 0) return n;
        if (s.textOverflow === "ellipsis" && s.whiteSpace === "nowrap") return 1;
      }
      return null;
    };
    /** The lines an element's own text shows within its box: lines a clamp hides are not shown. */
    const lines = (el: HTMLElement) => {
      const b = box(el);
      const tops: number[] = [];
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width === 0 || r.top < b.top - 1 || r.bottom > b.bottom + 1) continue;
          if (!tops.some((t) => Math.abs(t - r.top) < 3)) tops.push(r.top);
        }
      }
      return tops.length;
    };
    /** Each title, name or label of an item with text of its own, by its kind, with the lines it takes and the height of one. */
    const texts = (item: HTMLElement) => {
      const found = new Map<string, { el: HTMLElement; lines: number; line: number }>();
      for (const el of item.querySelectorAll<HTMLElement>("*")) {
        const key = kind(el);
        if (found.has(key) || !labelLike(el) || !shown(el)) continue;
        const n = lines(el);
        const style = getComputedStyle(el);
        const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        if (n) found.set(key, { el, lines: n, line });
      }
      return found;
    };
    const found: { element: string; low: number; high: number; most: number; least: number; stretched: boolean; clamp: number | null }[] = [];
    for (const parent of document.querySelectorAll("body, body *")) {
      if (parent.children.length < 2) continue;
      // Text set in columns flows from one to the next: its pieces are not items.
      const columns = getComputedStyle(parent).columnCount;
      if (columns && columns !== "auto") continue;
      const items = [...parent.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.children.length > 0 && shown(c) && box(c).width >= 40 && !["inline", "contents"].includes(getComputedStyle(c).display));
      const byKind = new Map<string, HTMLElement[]>();
      for (const item of items) byKind.set(kind(item), [...(byKind.get(kind(item)) ?? []), item]);
      for (const same of byKind.values()) {
        if (same.length < 2) continue;
        // Side by side: the same top, to a few pixels.
        const byTop = new Map<number, HTMLElement[]>();
        for (const item of same) {
          const top = Math.round(box(item).top / 3);
          const at = byTop.has(top) ? top : byTop.has(top - 1) ? top - 1 : byTop.has(top + 1) ? top + 1 : top;
          byTop.set(at, [...(byTop.get(at) ?? []), item]);
        }
        for (const row of [...byTop.values()].filter((r) => r.length >= 2)) {
          const heights = row.map((item) => box(item).height);
          const ends = row.map((item) => box(item.lastElementChild!).top - box(item).top);
          const differ = Math.max(...heights) - Math.min(...heights) > 4;
          const misaligned = Math.max(...ends) - Math.min(...ends) > 4;
          if (!differ && !misaligned) continue;
          // The tallest item against the shortest: what its titles take in more lines must explain the gap, or the
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
          found.push({ element: name(worst.el), low: Math.round(Math.min(...heights)), high: Math.round(Math.max(...heights)), most: worst.most, least: worst.least, stretched: !differ, clamp: clampOf(worst.el, row[tall]!) });
        }
      }
    }
    return found;
  });
  return rows.map(({ element, low, high, most, least, stretched, clamp }) => {
    const shape = stretched ? "the items of one row no longer line up" : `the items of one row are ${low} to ${high} px tall`;
    // Already clamped: the clamp is right, the lines it allows are not reserved.
    const fix = clamp ? `it is clamped to ${clamp} lines and takes ${most} where the others take ${least}: reserve its ${clamp} lines (min-height), so every item keeps one shape` : `it takes ${most} lines where the others take ${least}. Clamp it with an ellipsis (line-clamp) and reserve its lines, so every item keeps one shape`;
    return { element, message: `${shape}: ${fix}` };
  });
}
