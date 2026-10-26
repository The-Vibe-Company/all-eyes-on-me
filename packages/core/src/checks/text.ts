import type { Page } from "playwright";

/** A piece of text the page shows or says, with the element that holds it, named as the other checks name it. */
export interface Said {
  element: string;
  text: string;
  /** Shown on the page, or said by its title, a hint, a choice or an alt: a hole in both is named in both. */
  kind: "text" | "attribute";
}

/**
 * What the page says, block by block: the text of each element that holds some, with
 * its inline children, as one reads it; then, with `attributes`, the page's title, the
 * hints of its fields, the choices of its menus, the alt of its images and the names
 * given to its controls. Code, a text a user types and what is hidden are left out.
 */
export async function pageText(page: Page, { attributes = false } = {}): Promise<Said[]> {
  return page.evaluate((withAttributes) => {
    const SKIP = "script, style, noscript, template, code, pre, kbd, samp, textarea, svg, option";
    const kind = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${[...el.classList].map((c) => `.${c}`).join("")}`;
    const name = (el: Element, text: string) => `${kind(el)}${text ? ` "${text.slice(0, 40)}"` : ""}`;
    // An element that draws no box of its own (display: contents) shows what it holds when its parent does.
    const visible = (el: Element | null) => {
      while (el && getComputedStyle(el).display === "contents") el = el.parentElement;
      return !el || (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? true);
    };
    // Each block's sentences, from the text it holds itself and in its inline children: a block inside it says its own.
    const blocks = new Map<Element, string[]>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // A line break keeps the words on each side apart.
      const isBreak = node.nodeName === "BR";
      if (node.nodeType !== Node.TEXT_NODE && !isBreak) continue;
      const parent = isBreak ? (node as Element) : node.parentElement;
      if (!parent || parent.closest(SKIP) || !visible(parent)) continue;
      let el = isBreak ? parent.parentElement ?? parent : parent;
      while (el.parentElement && el !== document.body && /^(inline|contents)$/.test(getComputedStyle(el).display)) el = el.parentElement;
      const said = isBreak ? "\n" : node.textContent ?? "";
      // A space between two inline elements keeps their words apart; alone, it makes no block.
      if (said.trim() || blocks.has(el)) blocks.set(el, [...(blocks.get(el) ?? []), said]);
    }
    const out: { element: string; text: string; kind: "text" | "attribute" }[] = [];
    for (const [el, parts] of blocks) {
      const text = parts.join("").trim().replace(/\s+/g, " ");
      if (text) out.push({ element: name(el, text), text, kind: "text" });
    }
    if (withAttributes) {
      if (document.title.trim()) out.push({ element: "title", text: document.title.trim(), kind: "attribute" });
      for (const el of document.body.querySelectorAll("[placeholder], [alt], [aria-label], [title]")) {
        if (el.closest(SKIP) || !visible(el)) continue;
        for (const attribute of ["placeholder", "alt", "aria-label", "title"]) {
          const text = el.getAttribute(attribute)?.trim();
          if (text) out.push({ element: `${kind(el)} [${attribute}]`, text, kind: "attribute" });
        }
      }
      for (const option of document.body.querySelectorAll("select option")) {
        const select = option.closest("select")!;
        const text = (option.textContent ?? "").trim();
        if (text && visible(select)) out.push({ element: `${kind(select)} option`, text, kind: "attribute" });
      }
    }
    return out;
  }, attributes);
}

/**
 * Every match of `patterns` in what the page says, once per text matched, on the page and
 * in its attributes: the first block that says it is named. With `oncePerSentence`, a sentence is named once, for its first match.
 */
export function matches(said: Said[], patterns: RegExp[], { oncePerSentence = false } = {}): { element: string; found: string }[] {
  const seen = new Set<string>();
  const out: { element: string; found: string }[] = [];
  const pieces = said.flatMap(({ element, text, kind }) => (oncePerSentence ? text.split(/(?<=[.!?…])\s+/) : [text]).map((piece) => ({ element, text: piece, kind })));
  for (const { element, text, kind } of pieces) {
    const before = out.length;
    for (const pattern of patterns) {
      if (oncePerSentence && out.length > before) break;
      for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))) {
        const found = match[0].trim();
        const key = `${kind} ${found.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ element, found });
        if (oncePerSentence) break;
      }
    }
  }
  return out;
}
