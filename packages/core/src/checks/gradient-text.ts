import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * No text filled with a gradient (`background-clip: text` over a gradient): decoration
 * that means nothing, one of the looks an AI proposes by default (impeccable's bans).
 * One solid colour, and emphasis by weight or size.
 */
export async function checkGradientText(page: Page): Promise<Issue[]> {
  const elements = await page.$$eval("body *", (nodes) =>
    nodes
      .filter((el) => {
        const s = getComputedStyle(el);
        const clip = s.backgroundClip === "text" || s.getPropertyValue("-webkit-background-clip") === "text";
        if (!clip || !/gradient\(/.test(s.backgroundImage)) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && ((el as HTMLElement).innerText || "").trim() !== "";
      })
      .map((el) => {
        const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
      }),
  );
  return elements.map((element) => ({ element, message: "its text is filled with a gradient (background-clip: text): give it one solid colour, and set it apart by weight or size" }));
}
