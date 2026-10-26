import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * A rounded shape a few pixels inside a rounded shape follows its corner: when the gap
 * between them is under 32 px, the inner radius is the outer one less the gap, within
 * 4 px. Below 2 px, the inner corner may be square: it is left alone. A pill or a circle
 * keeps its own round, and a shape that draws nothing (the colour behind it, no border,
 * no shadow) has no corner to follow. Said once per kind of shape and kind of shape
 * holding it.
 */
export async function checkNestedRadius(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgba = (color: string) => {
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = "#000";
      paint.fillStyle = color;
      paint.fillRect(0, 0, 1, 1);
      return [...paint.getImageData(0, 0, 1, 1).data];
    };
    /** The colour a box is drawn on: the first opaque background behind it, white at the end. */
    const behind = (el: Element | null): string => {
      for (; el; el = el.parentElement) {
        const c = rgba(getComputedStyle(el).backgroundColor);
        if (c[3]! > 0) return c.join(",");
      }
      return "255,255,255,255";
    };
    const shapes = new Map<Element, boolean>();
    /** Whether a box draws a shape one sees: a picture, a border all around, a shadow, or a fill unlike what is behind it. */
    const draws = (el: Element) => {
      let is = shapes.get(el);
      if (is !== undefined) return is;
      const s = getComputedStyle(el);
      is =
        /^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(el.tagName) ||
        s.backgroundImage !== "none" ||
        (s.boxShadow !== "none" && !/^(rgba\(0, 0, 0, 0\)|transparent)/.test(s.boxShadow)) ||
        ["top", "right", "bottom", "left"].every((side) => s.getPropertyValue(`border-${side}-style`) !== "none" && parseFloat(s.getPropertyValue(`border-${side}-width`)) >= 1 && rgba(s.getPropertyValue(`border-${side}-color`))[3]! > 0) ||
        (rgba(s.backgroundColor)[3]! > 0 && rgba(s.backgroundColor).join(",") !== behind(el.parentElement));
      shapes.set(el, is);
      return is;
    };
    const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;
    /** A corner's radius in px, the smaller of its two: « 50% » is half the box's side. */
    const radius = (el: Element, corner: string, box = el.getBoundingClientRect()) => {
      const [h = "0", v = h] = getComputedStyle(el).getPropertyValue(`border-${corner}-radius`).trim().split(/\s+/);
      const px = (value: string, side: number) => (value.endsWith("%") ? (parseFloat(value) / 100) * side : parseFloat(value)) || 0;
      return Math.min(px(h, box.width), px(v, box.height));
    };
    const rounded = (el: Element) => CORNERS.some((c) => radius(el, c) > 0);
    const kind = (el: Element) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}`;
    const name = (el: Element) => {
      const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${kind(el).replace(/^([a-z0-9-]+)/, `$1${el.id ? `#${el.id}` : ""}`)}${text ? ` "${text}"` : ""}`;
    };
    const said = new Set<string>();
    const out: { element: string; message: string }[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (!rounded(el) || !(el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true)) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 16 || box.height < 16 || !draws(el)) continue;
      let holder = el.parentElement;
      while (holder && holder !== document.body && !(rounded(holder) && draws(holder))) holder = holder.parentElement;
      if (!holder || holder === document.body) continue;
      const outer = holder.getBoundingClientRect();
      const gaps: Record<(typeof CORNERS)[number], [number, number]> = {
        "top-left": [box.left - outer.left, box.top - outer.top],
        "top-right": [outer.right - box.right, box.top - outer.top],
        "bottom-right": [outer.right - box.right, outer.bottom - box.bottom],
        "bottom-left": [box.left - outer.left, outer.bottom - box.bottom],
      };
      // A holder that clips what it holds draws the corners of what touches its edge.
      const clips = getComputedStyle(holder).overflow !== "visible";
      for (const corner of CORNERS) {
        const r = radius(el, corner, box);
        // A pill, a badge or a circle is round by its height: it has no corner to follow.
        if (r <= 0 || r >= Math.min(box.width, box.height) * 0.4) continue;
        const R = Math.min(radius(holder, corner, outer), outer.width / 2, outer.height / 2);
        const [dx, dy] = gaps[corner];
        if (R <= 0 || dx < 0 || dy < 0 || dx >= 32 || dy >= 32 || (clips && dx <= 1 && dy <= 1)) continue;
        const gap = Math.round(Math.max(dx, dy));
        const wanted = Math.round(R - gap);
        if (wanted <= 2 || Math.abs(r - wanted) <= 4) continue;
        const key = `${kind(el)} in ${kind(holder)}`;
        if (!said.has(key)) {
          said.add(key);
          out.push({ element: name(el), message: `its corner of ${Math.round(r)} px sits ${gap} px inside a corner of ${Math.round(R)} px: make it ${wanted} px, the outer radius less the gap` });
        }
        break;
      }
    }
    return out;
  });
}
