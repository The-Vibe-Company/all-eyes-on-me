import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** How far a picture's shown shape may stray from its own before it reads as distorted. */
const TOLERANCE = 0.05;

/**
 * Every image loads, and none is stretched or squashed: shown at a shape other
 * than its own, it must be cropped to fit (`object-fit: cover` or `contain`).
 * An image still loading, such as a lazy one far down the page, a drawing in
 * SVG, which keeps its own shape, and a pixel of tracking are left alone.
 */
export async function checkImages(page: Page): Promise<Issue[]> {
  const found = await page.evaluate((tolerance) => {
    const RATIOS: [number, number][] = [[1, 1], [4, 3], [3, 2], [16, 9], [21, 9], [3, 4], [2, 3], [9, 16]];
    const said = (w: number, h: number) => {
      const near = RATIOS.find(([a, b]) => Math.abs(w / h / (a / b) - 1) < 0.03);
      return near ? `${near[0]}:${near[1]}` : `${Math.round(w)}×${Math.round(h)}`;
    };
    const out: { element: string; how: "broken" | "stretched" | "squashed"; natural?: string; shown?: string }[] = [];
    for (const img of document.images) {
      const b = img.getBoundingClientRect();
      if (b.width < 16 || b.height < 16 || !(img.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true)) continue;
      const src = img.currentSrc || img.src;
      if (!src || !img.complete) continue;
      const file = src.startsWith("data:") ? "" : (src.split(/[?#]/)[0]!.split("/").pop() ?? "");
      const classes = [...img.classList].map((c) => `.${c}`).join("");
      const element = `img${img.id ? `#${img.id}` : ""}${classes}${img.alt || file ? ` "${(img.alt || file).slice(0, 40)}"` : ""}`;
      if (img.naturalWidth === 0) {
        out.push({ element, how: "broken" });
        continue;
      }
      if (/\.svg$/i.test(file) || src.startsWith("data:image/svg")) continue;
      const style = getComputedStyle(img);
      if (style.objectFit !== "fill") continue;
      const px = (v: string) => parseFloat(v) || 0;
      const w = b.width - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth);
      const h = b.height - px(style.paddingTop) - px(style.paddingBottom) - px(style.borderTopWidth) - px(style.borderBottomWidth);
      const shown = w / h;
      const natural = img.naturalWidth / img.naturalHeight;
      if (Math.abs(shown / natural - 1) > tolerance) out.push({ element, how: shown > natural ? "stretched" : "squashed", natural: said(img.naturalWidth, img.naturalHeight), shown: said(w, h) });
    }
    return out;
  }, TOLERANCE);
  return found.map(({ element, how, natural, shown }) => ({
    element,
    message: how === "broken" ? "the image does not load" : `the image is ${how}: ${natural} shown as ${shown}. Crop it to fit (object-fit: cover), or give it its own shape`,
  }));
}
