import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * No box marked by a coloured border on its left or right side only, such as a callout,
 * a card or a list item with a stripe: one of the looks an AI proposes by default
 * (impeccable's bans). A hairline elsewhere does not change it. The stripe is an accent:
 * a colour, or a grey that stands out from what is behind it; a pale grey one divides,
 * it does not mark. A rule beside plain text, such as a quote's or a lead paragraph's, is
 * typography, a table's cells are borders by design, a 1 px border on one side is a
 * divider, and a pane as tall as the screen, such as a sidebar, is divided from the page.
 */
export async function checkSideStripe(page: Page): Promise<Issue[]> {
  const found = await page.$$eval("body *", (nodes) => {
    const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const colours = new Map<string, number[]>();
    /** A colour as red, green, blue (0 to 255) and alpha (0 to 1), whatever space it is written in. */
    const rgba = (color: string) => {
      let c = colours.get(color);
      if (!c) {
        paint.clearRect(0, 0, 1, 1);
        paint.fillStyle = "#000";
        paint.fillStyle = color;
        paint.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
        colours.set(color, (c = [r!, g!, b!, a! / 255]));
      }
      return c;
    };
    const luminance = ([r, g, b]: number[]) => {
      const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
    };
    /** The colour behind an element: its own background, or the first one that shows above it, or white. */
    const behind = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3]! > 0) return c;
      }
      return [255, 255, 255, 1];
    };
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect();
      return box.width >= 40 && box.height >= 16 && box.height < window.innerHeight * 0.9 && (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
    };
    const out: { element: string; width: number; side: string }[] = [];
    for (const el of nodes) {
      if (/^(BLOCKQUOTE|TD|TH|HR|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) continue;
      const s = getComputedStyle(el);
      const width = (side: string) => (s.getPropertyValue(`border-${side}-style`) === "none" ? 0 : parseFloat(s.getPropertyValue(`border-${side}-width`)) || 0);
      const [left, right, top, bottom] = ["left", "right", "top", "bottom"].map(width) as [number, number, number, number];
      const side = left >= 2 && right <= 1 ? "left" : right >= 2 && left <= 1 ? "right" : null;
      if (!side || top > 1 || bottom > 1) continue;
      const stripe = rgba(s.getPropertyValue(`border-${side}-color`));
      if (stripe[3] === 0 || !shown(el)) continue;
      // A box: a background, a hairline elsewhere, rounded corners or a shadow. A rule beside plain text is typography.
      const round = ["top-left", "top-right", "bottom-right", "bottom-left"].some((c) => parseFloat(s.getPropertyValue(`border-${c}-radius`)) > 0);
      const boxed = rgba(s.backgroundColor)[3]! > 0 || top > 0 || bottom > 0 || (side === "left" ? right : left) > 0 || round || s.boxShadow !== "none";
      if (!boxed) continue;
      // An accent: a colour, or a grey that stands out from what is behind it.
      const chromatic = Math.max(stripe[0]!, stripe[1]!, stripe[2]!) - Math.min(stripe[0]!, stripe[1]!, stripe[2]!) >= 40;
      const [light, dark] = [luminance(stripe), luminance(behind(el))].sort((a, b) => b - a) as [number, number];
      if (!chromatic && (light + 0.05) / (dark + 0.05) < 3) continue;
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
