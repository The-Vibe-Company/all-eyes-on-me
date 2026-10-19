import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * No card inside a card: a box of some height with rounded corners, drawn by a solid
 * border all around or a shadow that lifts it, holding elements of its own, a few
 * wrappers inside another such box (impeccable's bans). Controls are not cards: a field,
 * a button, a tab, an alert, a menu, a link or a label without a heading, nor the frame
 * of a field, a table or code. A drawing of a screen (aria-hidden, role="img"), a card
 * deep inside a board or a feed, and a card in a dialog or a menu over a card are left
 * out. Said once per kind of card and kind of card holding it.
 */
export async function checkNestedCard(page: Page): Promise<Issue[]> {
  const found = await page.evaluate(() => {
    const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const alphas = new Map<string, number>();
    /** How opaque a colour is, from 0 to 1, whatever space it is written in. */
    const alpha = (color: string) => {
      let a = alphas.get(color);
      if (a === undefined) {
        paint.clearRect(0, 0, 1, 1);
        paint.fillStyle = "#000";
        paint.fillStyle = color;
        paint.fillRect(0, 0, 1, 1);
        alphas.set(color, (a = paint.getImageData(0, 0, 1, 1).data[3]! / 255));
      }
      return a;
    };
    /** A shadow outside the box, of some size and of a colour that shows: one drawn inside it does not lift it. */
    const lifts = (shadows: string) =>
      shadows !== "none" &&
      shadows.split(/,(?![^(]*\))/).some((shadow) => {
        if (/\binset\b/.test(shadow)) return false;
        const colour = shadow.match(/[a-z-]+\([^)]*\)|#[0-9a-f]{3,8}\b/i)?.[0] ?? "black";
        const lengths = (shadow.replace(colour, "").match(/-?[\d.]+px/g) ?? []).map((n) => parseFloat(n));
        return lengths.some((n) => n !== 0) && alpha(colour) > 0;
      });
    const NEVER = /^(INPUT|TEXTAREA|SELECT|BUTTON|IMG|PICTURE|VIDEO|IFRAME|CANVAS|svg|PRE|CODE|HR|OPTION|TABLE|FIELDSET|DIALOG|DETAILS)$/;
    const CONTROL = /^(button|tab|tablist|radio|radiogroup|checkbox|switch|alert|alertdialog|status|tooltip|menu|menubar|menuitem|listbox|option|dialog)$/;
    const FIELD = "input, select, textarea, [contenteditable]";
    const drawn = (el: Element) => {
      if (NEVER.test(el.tagName) || el.hasAttribute("popover") || CONTROL.test(el.getAttribute("role") ?? "")) return false;
      // A link, a label or a summary is a control, unless it holds a heading: then it is a card one clicks.
      if (/^(A|LABEL|SUMMARY)$/.test(el.tagName) && !el.querySelector("h1, h2, h3, h4, h5, h6")) return false;
      const box = el.getBoundingClientRect();
      if (box.width < 120 || box.height < 64) return false;
      // The frame of a table or of code, however many wrappers it holds it in, and a box a field fills, draw that table, code or field.
      let inner: Element = el;
      while (inner.children.length === 1 && !/^(TABLE|PRE)$/.test(inner.tagName)) inner = inner.children[0]!;
      if (inner !== el && /^(TABLE|PRE)$/.test(inner.tagName)) return false;
      const field = el.querySelector(FIELD);
      if (field && field.getBoundingClientRect().height >= box.height / 2) return false;
      const s = getComputedStyle(el);
      const round = ["top-left", "top-right", "bottom-right", "bottom-left"].some((c) => parseFloat(s.getPropertyValue(`border-${c}-radius`)) > 2);
      if (!round) return false;
      const bordered = ["top", "right", "bottom", "left"].every(
        (side) => /^(solid|double)$/.test(s.getPropertyValue(`border-${side}-style`)) && parseFloat(s.getPropertyValue(`border-${side}-width`)) >= 1 && alpha(s.getPropertyValue(`border-${side}-color`)) > 0,
      );
      return (bordered || lifts(s.boxShadow)) && (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
    };
    const cards = new Map<Element, boolean>();
    const card = (el: Element) => {
      let is = cards.get(el);
      if (is === undefined) cards.set(el, (is = drawn(el)));
      return is;
    };
    const kind = (el: Element) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}`;
    const name = (el: Element) => {
      const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${kind(el).replace(/^([a-z0-9-]+)/, `$1${el.id ? `#${el.id}` : ""}`)}${text ? ` "${text}"` : ""}`;
    };
    // A drawing of a screen, such as a product shot made of HTML, holds boxes by nature.
    const drawing = (el: Element) => el.closest('[aria-hidden="true"], [role="img"], [role="presentation"], [inert]') !== null;
    // A dialog, a popover or a menu opens over the page: what it holds is not inside what it opens over.
    const LAYER = 'dialog, [popover], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';
    const groups = new Map<string, { element: string; holder: string; count: number }>();
    for (const el of document.querySelectorAll("body *")) {
      // A card holds elements of its own: a rounded box of text alone is a bubble or a tag.
      if (el.children.length === 0 || !card(el) || drawing(el)) continue;
      // The card around it, a few wrappers up at most (card, grid, card): one deeper in a
      // board or a feed belongs to that interface.
      let holder = el.parentElement;
      let depth = 1;
      while (holder && holder !== document.body && depth <= 3 && !card(holder)) {
        holder = holder.parentElement;
        depth += 1;
      }
      if (!holder || holder === document.body || depth > 3 || el.closest(LAYER) !== holder.closest(LAYER)) continue;
      const key = `${kind(el)} in ${kind(holder)}`;
      const group = groups.get(key);
      if (group) group.count += 1;
      else groups.set(key, { element: name(el), holder: kind(holder), count: 1 });
    }
    return [...groups.values()];
  });
  return found.map(({ element, holder, count }) => ({
    element,
    message: `${count === 1 ? "this card sits" : `${count} cards like this one sit`} inside a card (${holder}): keep one box, and set the inner ones apart by space, a divider or a tint`,
  }));
}
