import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * What a screen reader says has words: a button or a link has a name (its
 * text, an `aria-label`, the alt of its image, the title of its drawing), a
 * field has a label (a placeholder is not one: it goes when you type), and an
 * image has an alt, empty when it only decorates.
 */
export async function checkLabels(page: Page): Promise<Issue[]> {
  const found = await page.evaluate(() => {
    const shown = (el: Element) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && (el.checkVisibility?.({ checkVisibilityCSS: true }) ?? true);
    };
    const describe = (el: HTMLElement) => {
      const text = ((el as HTMLInputElement).placeholder || el.getAttribute("href") || (el as HTMLImageElement).src?.split(/[?#]/)[0]?.split("/").pop() || "").slice(0, 40);
      const classes = [...el.classList].map((c) => `.${c}`).join("");
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text && !text.startsWith("data:") ? ` "${text}"` : ""}`;
    };
    const byIds = (ids: string | null) => (ids ?? "").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
    const nameOf = (el: HTMLElement) => {
      const said = el.getAttribute("aria-label")?.trim() || byIds(el.getAttribute("aria-labelledby")) || (el.innerText ?? "").trim() || el.getAttribute("title")?.trim() || "";
      if (said) return said;
      for (const img of el.querySelectorAll("img[alt]")) if (img.getAttribute("alt")!.trim()) return img.getAttribute("alt")!;
      for (const svg of el.querySelectorAll("svg")) {
        const named = svg.getAttribute("aria-label")?.trim() || svg.querySelector("title")?.textContent?.trim();
        if (named) return named;
      }
      const value = (el as HTMLInputElement).value;
      return el.tagName === "INPUT" && value ? value : "";
    };
    const out: { element: string; how: "button" | "link" | "field" | "image" }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"], a[href], input[type="submit"], input[type="button"]')) {
      if (!shown(el) || nameOf(el)) continue;
      out.push({ element: describe(el), how: el.tagName === "A" ? "link" : "button" });
    }
    for (const el of document.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea')) {
      if (!shown(el) || el.labels?.length || el.getAttribute("aria-label")?.trim() || byIds(el.getAttribute("aria-labelledby")) || el.getAttribute("title")?.trim()) continue;
      out.push({ element: describe(el), how: "field" });
    }
    for (const img of document.images) {
      const b = img.getBoundingClientRect();
      if (b.width < 4 || b.height < 4 || !shown(img) || img.hasAttribute("alt") || img.getAttribute("role") === "presentation" || img.getAttribute("aria-hidden") === "true") continue;
      out.push({ element: describe(img), how: "image" });
    }
    return out;
  });
  const say = {
    button: "no name: a screen reader says only « button ». Give it words, or an aria-label",
    link: "no name: a screen reader says only « link ». Give it words, or an alt on its image",
    field: "no label: a placeholder is not one, it goes when you type. Give it a <label>",
    image: 'no alt text: say what it shows, or alt="" when it only decorates',
  };
  return found.map(({ element, how }) => ({ element, message: say[how] }));
}
