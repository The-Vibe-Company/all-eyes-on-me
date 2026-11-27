import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * No box marked by a coloured bar on one side only: a callout, a card or a list item with a
 * stripe on its left or right, or an accent bar along its top, which rounded corners bend at
 * both ends. One of the looks an AI proposes by default (impeccable's bans), whether the bar is
 * a border, an inset shadow or a pseudo-element laid along the edge. A hairline elsewhere does
 * not change it. The bar is an accent: a colour, or a grey that stands out from what is behind
 * it; a pale grey one divides, it does not mark. A rule beside plain text, such as a quote's or
 * a lead paragraph's, and a rule above a section with no ground of its own, are typography; a
 * table's cells are borders by design; a 1 px border on one side is a divider; a pane as tall as
 * the screen, such as a sidebar, or a band as wide as it, such as a page head, is divided from
 * the page. The bottom side is never measured: it underlines a tab, a link or a field.
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
    const behind = (el: Element | null) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3]! > 0) return c;
      }
      return [255, 255, 255, 1];
    };
    const same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < (i === 3 ? 0.05 : 4));
    /** An accent: a colour, or a grey that stands out from what is behind it. */
    const accent = (bar: number[], el: Element) => {
      if (bar[3]! < 0.3) return false;
      if (Math.max(bar[0]!, bar[1]!, bar[2]!) - Math.min(bar[0]!, bar[1]!, bar[2]!) >= 40) return true;
      const [light, dark] = [luminance(bar), luminance(behind(el))].sort((a, b) => b - a) as [number, number];
      return (light + 0.05) / (dark + 0.05) >= 3;
    };
    const shown = (el: Element) => {
      const box = el.getBoundingClientRect();
      return box.width >= 40 && box.height >= 16 && box.height < window.innerHeight * 0.9 && (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
    };
    const out: { element: string; width: number; side: string; how: string }[] = [];
    for (const el of nodes) {
      if (/^(BLOCKQUOTE|TD|TH|TR|THEAD|TBODY|TFOOT|TABLE|HR|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) continue;
      const s = getComputedStyle(el);
      const width = (side: string) => (s.getPropertyValue(`border-${side}-style`) === "none" ? 0 : parseFloat(s.getPropertyValue(`border-${side}-width`)) || 0);
      const [left, right, top, bottom] = ["left", "right", "top", "bottom"].map(width) as [number, number, number, number];
      const round = ["top-left", "top-right", "bottom-right", "bottom-left"].some((c) => parseFloat(s.getPropertyValue(`border-${c}-radius`)) > 0);
      const shadow = s.boxShadow !== "none" && s.boxShadow.split(/,(?![^(]*\))/).some((x) => !/inset/.test(x));
      const ground = rgba(s.backgroundColor)[3]! > 0;
      const box = el.getBoundingClientRect();
      // A box: a ground, a hairline elsewhere, rounded corners or a shadow. A rule beside plain text is typography;
      // along the top, a ground the same as the page's is no box either, and a band as wide as the screen is a band.
      const boxed = (side: string) => {
        const others = side === "left" ? right + top + bottom : side === "right" ? left + top + bottom : left + right + bottom;
        if (side !== "top") return ground || others > 0 || round || shadow;
        if (box.width >= window.innerWidth * 0.9) return false;
        return (ground && !same(rgba(s.backgroundColor), behind(el.parentElement))) || left + right > 0 || round || shadow;
      };
      const bars: { side: string; px: number; colour: number[]; how: string }[] = [];
      // A border on one side only.
      const side = left >= 2 && right <= 1 && top <= 1 && bottom <= 1 ? "left" : right >= 2 && left <= 1 && top <= 1 && bottom <= 1 ? "right" : top >= 2 && left <= 1 && right <= 1 && bottom <= 1 ? "top" : null;
      if (side) bars.push({ side, px: side === "left" ? left : side === "right" ? right : top, colour: rgba(s.getPropertyValue(`border-${side}-color`)), how: "border" });
      // An inset shadow with no blur, laid along one side.
      if (s.boxShadow !== "none") {
        for (const one of s.boxShadow.split(/,(?![^(]*\))/)) {
          if (!/inset/.test(one)) continue;
          const colour = one.match(/(rgba?|oklch|oklab|lab|lch|color|hsla?)\([^)]*\)|#[0-9a-f]{3,8}\b/i)?.[0] ?? s.color;
          const [x = 0, y = 0, blur = 0, spread = 0] = (one.replace(colour, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
          if (blur > 0 || spread !== 0) continue;
          if (Math.abs(x) >= 2 && y === 0) bars.push({ side: x > 0 ? "left" : "right", px: Math.abs(x), colour: rgba(colour), how: "inset shadow" });
          else if (y >= 2 && x === 0) bars.push({ side: "top", px: y, colour: rgba(colour), how: "inset shadow" });
        }
      }
      // A pseudo-element laid flush along one edge, thin and nearly as long as it.
      for (const pseudo of ["::before", "::after"]) {
        const p = getComputedStyle(el, pseudo);
        if (p.content === "none" || p.content === "normal" || p.display === "none" || !/^(absolute|fixed)$/.test(p.position)) continue;
        const w = parseFloat(p.width) || 0;
        const h = parseFloat(p.height) || 0;
        const colour = rgba(p.backgroundColor)[3]! > 0 ? rgba(p.backgroundColor) : p.backgroundImage !== "none" ? [255, 0, 0, 1] : [0, 0, 0, 0];
        const at = (edge: string) => Math.abs(parseFloat(p.getPropertyValue(edge)) || 0) <= 1;
        if (h >= 2 && h <= 8 && w >= box.width * 0.6 && at("top") && p.top !== "auto") bars.push({ side: "top", px: h, colour, how: `${pseudo} bar` });
        else if (w >= 2 && w <= 8 && h >= box.height * 0.6 && ((at("left") && p.left !== "auto") || (at("right") && p.right !== "auto"))) bars.push({ side: p.left !== "auto" && at("left") ? "left" : "right", px: w, colour, how: `${pseudo} bar` });
      }
      const bar = bars.find((b) => accent(b.colour, el) && boxed(b.side));
      if (!bar || !shown(el)) continue;
      const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!text && el.children.length === 0) continue;
      const classes = [...el.classList].map((c) => `.${c}`).join("");
      out.push({ element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`, width: Math.round(bar.px), side: bar.side, how: bar.how });
    }
    return out;
  });
  return found.map(({ element, width, side, how }) => ({
    element,
    message:
      side === "top"
        ? `a ${width} px coloured bar along its top only (${how}), an accent bar: mark it otherwise (a tinted background, a leading icon, a word) or not at all`
        : `a ${width} px coloured ${how === "border" ? "border" : `bar (${how})`} on its ${side} side only, a stripe: mark it otherwise (a full border, a tinted background, a leading icon or number) or not at all`,
  }));
}
