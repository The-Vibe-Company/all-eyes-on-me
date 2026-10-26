import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * Motion chosen, and never on the layout: no transition of what one touches left to the
 * browser's default curve (`ease`) or to `linear`; no transition or animation of what
 * lays the page out (top, left, width, margins, and height in an animation), which moves
 * every box around it: transform and opacity do it without. An accordion opening on its
 * height and a skip link sliding in are what they are. Said once per kind of element and
 * curve or property.
 */
export async function checkMotion(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const list = (value: string) => value.split(/,(?![^(]*\))/).map((v) => v.trim());
    const seconds = (value: string) => (value.endsWith("ms") ? parseFloat(value) / 1000 : parseFloat(value)) || 0;
    const TOUCHED = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
    const LAYOUT = /^(top|left|right|bottom|width|min-width|max-width|margin(-[a-z]+)?|padding(-[a-z]+)?)$/;
    const ANIMATED_LAYOUT = /^(top|left|right|bottom|width|height|min-width|max-width|min-height|max-height|margin(-[a-z]+)?|padding(-[a-z]+)?)$/;
    /** A link to the content, among the first things one tabs to. */
    const skipLink = (el: Element) => {
      const href = el.getAttribute("href") ?? "";
      if (el.tagName !== "A" || !href.startsWith("#") || href.length < 2 || !document.getElementById(href.slice(1))) return false;
      return [...document.querySelectorAll("a[href], button, input, select, textarea")].slice(0, 3).includes(el);
    };
    const kind = (el: Element) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}`;
    const name = (el: Element) => {
      const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${kind(el).replace(/^([a-z0-9-]+)/, `$1${el.id ? `#${el.id}` : ""}`)}${text ? ` "${text}"` : ""}`;
    };
    const said = new Set<string>();
    const out: { element: string; message: string }[] = [];
    const say = (el: Element, key: string, message: string) => {
      if (said.has(`${kind(el)} ${key}`)) return;
      said.add(`${kind(el)} ${key}`);
      out.push({ element: name(el), message });
    };
    for (const el of document.querySelectorAll("body *")) {
      const s = getComputedStyle(el);
      const durations = list(s.transitionDuration);
      const easings = list(s.transitionTimingFunction);
      list(s.transitionProperty).forEach((prop, i) => {
        if (prop === "none" || seconds(durations[i % durations.length]!) <= 0) return;
        const easing = easings[i % easings.length]!;
        if ((easing === "ease" || easing === "linear") && el.matches(TOUCHED)) say(el, easing, `its transition keeps the browser's default curve (${easing}): ease out with a curve of its own, such as cubic-bezier(0.16, 1, 0.3, 1)`);
        if (LAYOUT.test(prop) && !skipLink(el)) say(el, prop, `its transition moves the layout (${prop}): animate transform or opacity instead`);
      });
    }
    // The animations of the style sheets: a transition running is read from its element's style, above.
    for (const animation of document.getAnimations().filter((a) => a instanceof CSSAnimation)) {
      const effect = animation.effect as KeyframeEffect | null;
      const el = effect?.target;
      if (!el || !(el instanceof Element)) continue;
      const props = new Set(effect.getKeyframes().flatMap((frame) => Object.keys(frame)).map((p) => p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)));
      const moved = [...props].find((p) => ANIMATED_LAYOUT.test(p));
      if (moved) say(el, moved, `its animation moves the layout (${moved}): animate transform or opacity instead`);
    }
    return out;
  });
}
