import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** The most words a page shows before anything is opened: its detail folds, so it reads as a summary first. */
export const LAYERS_WORDS = 400;
/** The largest share of the first screen's words set under 14 px. */
export const LAYERS_SMALL = 0.25;
/** The most blocks framed all around on the first screen: a hairline or a light ground sets a block apart, a frame on each one weighs. */
export const LAYERS_FRAMES = 2;

/**
 * A page that reads in layers, not as a mass: no more than {@link LAYERS_WORDS} words shown before anything is
 * opened, what is closed in a `<details>`, a popover or a tooltip not counted; no more than a quarter of the first
 * screen's words under 14 px; and no more than {@link LAYERS_FRAMES} blocks framed all around on the first screen.
 * Measured on the mockups of `/aeom directions`, where a round that showed everything at once, small and boxed, was
 * refused whole, and the next, with the same words folded, kept: the first showed 412 to 1,743 words a page, the
 * second 248 to 378.
 */
export async function checkLayers(page: Page): Promise<Issue[]> {
  const m = await page.evaluate(() => {
    const H = window.innerHeight;
    const W = window.innerWidth;
    const shown = (el: Element) => el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true;
    let words = 0;
    let first = 0;
    let small = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node: Node | null; (node = walker.nextNode()); ) {
      const text = node.textContent?.trim();
      const el = node.parentElement;
      if (!text || !el || !shown(el)) continue;
      const count = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      if (!count) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      // Text cut down to a pixel, such as a screen reader's, is not shown.
      const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
      if (!rects.length) continue;
      words += count;
      if (!rects.some((r) => r.top < H && r.bottom > 0 && r.left < W && r.right > 0)) continue;
      first += count;
      if (parseFloat(getComputedStyle(el).fontSize) < 14) small += count;
    }
    // A block framed all around, on the first screen: a border on its four sides, a ring or a drop shadow. A control,
    // a field's own box, a table's cells and a pane as tall as the screen are not blocks.
    const frames: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY|IMG|svg|TD|TH|TR|TABLE|LABEL|DIALOG)$/.test(el.tagName) || el.getAttribute("role") === "button" || el.hasAttribute("popover")) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 120 || box.height < 40 || box.top >= H || box.bottom <= 0 || box.height > H * 0.9 || !shown(el)) continue;
      const text = ((el as HTMLElement).innerText || "").trim();
      if (el.querySelector("input, select, textarea") && text.split(/\s+/).length < 8) continue;
      const s = getComputedStyle(el);
      const side = (k: string) => s.getPropertyValue(`border-${k}-style`) !== "none" && parseFloat(s.getPropertyValue(`border-${k}-width`)) >= 1 && !/,\s*0\)$/.test(s.getPropertyValue(`border-${k}-color`)) && s.getPropertyValue(`border-${k}-color`) !== "transparent";
      const ring = s.boxShadow !== "none" && s.boxShadow.split(/,(?![^(]*\))/).some((x) => !/,\s*0\)/.test(x) && (/inset/.test(x) ? /\b0px 0px 0px [1-9]/.test(x) : true));
      if (["top", "right", "bottom", "left"].every(side) || ring) frames.push(`${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}`);
    }
    const folds = document.querySelectorAll("details, [popover], [role=tooltip]").length;
    return { words, first, small, frames, folds };
  });
  const issues: Issue[] = [];
  if (m.words > LAYERS_WORDS)
    issues.push({
      message: `${m.words} words shown before anything is opened, more than ${LAYERS_WORDS}: ${m.folds ? `${m.folds} thing${m.folds === 1 ? "" : "s"} fold, not enough` : "nothing folds"}. Keep one summary line per block (a word of state and a figure) and fold its detail behind a <details>, a popover or a tooltip on hover and focus`,
    });
  if (m.first >= 40 && m.small / m.first > LAYERS_SMALL)
    issues.push({ message: `${Math.round((100 * m.small) / m.first)}% of the first screen's words are under 14 px, more than ${Math.round(LAYERS_SMALL * 100)}%: set running text at 15 or 16 px and fold what does not fit` });
  if (m.frames.length > LAYERS_FRAMES)
    issues.push({ element: m.frames.slice(0, 3).join(", "), message: `${m.frames.length} blocks framed all around on the first screen, more than ${LAYERS_FRAMES}: set them apart with space, a hairline or a light ground, never a frame on each` });
  return issues;
}
