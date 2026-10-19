import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * No text filled with a gradient (`background-clip: text` over a gradient, the text's own
 * fill left transparent): decoration that means nothing, one of the looks an AI proposes
 * by default (impeccable's bans). One solid colour, and emphasis by weight or size.
 */
export async function checkGradientText(page: Page): Promise<Issue[]> {
  const elements = await page.$$eval("body *", (nodes) => {
    const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    /** How opaque a colour is, from 0 to 1, whatever space it is written in. */
    const alpha = (color: string) => {
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = "#000";
      paint.fillStyle = color;
      paint.fillRect(0, 0, 1, 1);
      return paint.getImageData(0, 0, 1, 1).data[3]! / 255;
    };
    return nodes
      .filter((el) => {
        const s = getComputedStyle(el);
        const clip = s.backgroundClip === "text" || s.getPropertyValue("-webkit-background-clip") === "text";
        if (!clip || !/gradient\(/.test(s.backgroundImage)) return false;
        // The fill is what shows: a solid one hides the gradient behind it.
        if (alpha(s.getPropertyValue("-webkit-text-fill-color") || s.color) > 0) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && ((el as HTMLElement).innerText || "").trim() !== "";
      })
      .map((el) => {
        const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
      });
  });
  return elements.map((element) => ({ element, message: "its text is filled with a gradient (background-clip: text): give it one solid colour, and set it apart by weight or size" }));
}
