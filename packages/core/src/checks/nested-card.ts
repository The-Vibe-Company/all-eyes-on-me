import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * No card inside a card: a box with rounded corners, drawn by a border all around or a
 * shadow, held by another such box (impeccable's bans). Fields, buttons, images, code,
 * a dashed drop zone, a box of text alone and anything smaller than a card are not cards;
 * a drawing of a screen (aria-hidden, role="img") and a card deep inside a board or a
 * feed are left out. Said once per kind of card and kind
 * of card holding it.
 */
export async function checkNestedCard(page: Page): Promise<Issue[]> {
  const found = await page.evaluate(() => {
    /** A colour that shows: not transparent, and not of alpha 0. */
    const coloured = (color: string) => {
      const m = color.match(/^rgba?\(([^)]*)\)$/);
      if (!m) return color !== "transparent";
      const parts = m[1]!.split(/[\s,/]+/).filter(Boolean);
      return parts.length < 4 || parseFloat(parts[3]!) > 0;
    };
    const cards = new Map<Element, boolean>();
    const card = (el: Element) => {
      let is = cards.get(el);
      if (is === undefined) cards.set(el, (is = drawn(el)));
      return is;
    };
    const drawn = (el: Element) => {
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON|IMG|PICTURE|VIDEO|IFRAME|CANVAS|svg|PRE|CODE|HR|OPTION|TABLE)$/.test(el.tagName)) return false;
      const box = el.getBoundingClientRect();
      if (box.width < 120 || box.height < 40) return false;
      const s = getComputedStyle(el);
      const round = ["top-left", "top-right", "bottom-right", "bottom-left"].some((c) => parseFloat(s.getPropertyValue(`border-${c}-radius`)) > 2);
      if (!round) return false;
      const bordered = ["top", "right", "bottom", "left"].every(
        (side) => /^(solid|double)$/.test(s.getPropertyValue(`border-${side}-style`)) && parseFloat(s.getPropertyValue(`border-${side}-width`)) >= 1 && coloured(s.getPropertyValue(`border-${side}-color`)),
      );
      // A shadow outside the box, of a colour that shows; one drawn inside it does not lift it.
      const shadowed = s.boxShadow !== "none" && s.boxShadow.split(/,(?![^(]*\))/).some((shadow) => !/\binset\b/.test(shadow) && coloured(shadow.match(/rgba?\([^)]*\)/)?.[0] ?? "transparent"));
      return (bordered || shadowed) && (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
    };
    const kind = (el: Element) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}`;
    const name = (el: Element) => {
      const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${kind(el).replace(/^([a-z0-9-]+)/, `$1${el.id ? `#${el.id}` : ""}`)}${text ? ` "${text}"` : ""}`;
    };
    const groups = new Map<string, { element: string; holder: string; count: number }>();
    // A drawing of a screen, such as a product shot made of HTML, holds boxes by nature.
    const drawing = (el: Element) => el.closest('[aria-hidden="true"], [role="img"], [role="presentation"], [inert]') !== null;
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
      if (!holder || holder === document.body || depth > 3) continue;
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
