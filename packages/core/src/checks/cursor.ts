import type { Page } from "playwright";
import type { Issue } from "./types.js";

const CLICKABLE = 'a[href], button:not([disabled]), [role="button"], [role="link"], [onclick], input[type="button"], input[type="submit"], input[type="reset"], summary';

/** Every visible clickable element must show a pointer cursor. */
export async function checkCursor(page: Page): Promise<Issue[]> {
  const elements = await page.$$eval(CLICKABLE, (nodes) =>
    nodes
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(el).cursor !== "pointer";
      })
      .map((el) => {
        const text = ((el as HTMLElement).innerText || (el as HTMLInputElement).value || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
      }),
  );
  return elements.map((element) => ({ element, message: "clickable, but the cursor does not turn into a pointer" }));
}
