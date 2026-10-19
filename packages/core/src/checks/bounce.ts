import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * Motion never bounces (impeccable's laws): no transition or animation whose easing
 * overshoots its end and comes back. Read from what each element is given, so a
 * transition that has not run yet is still seen. Said once per kind of element and easing.
 */
export async function checkBounce(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const list = (value: string) => value.split(/,(?![^(]*\))/).map((v) => v.trim());
    const seconds = (value: string) => (value.endsWith("ms") ? parseFloat(value) / 1000 : parseFloat(value)) || 0;
    /** An easing that goes past its end and comes back: a y of its curve outside 0 to 1. */
    const overshoots = (easing: string) => {
      const m = easing.match(/^cubic-bezier\(([^)]*)\)$/);
      if (!m) return false;
      const [, y1, , y2] = m[1]!.split(",").map((n) => parseFloat(n));
      return [y1!, y2!].some((y) => y < 0 || y > 1);
    };
    const kind = (el: Element) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}`;
    const name = (el: Element) => {
      const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${kind(el).replace(/^([a-z0-9-]+)/, `$1${el.id ? `#${el.id}` : ""}`)}${text ? ` "${text}"` : ""}`;
    };
    const said = new Set<string>();
    const out: { element: string; message: string }[] = [];
    const say = (el: Element, easing: string, what: string) => {
      const key = `${kind(el)} ${easing}`;
      if (said.has(key)) return;
      said.add(key);
      out.push({ element: name(el), message: `${what} overshoots (${easing}), a bounce: ease out with an exponential curve instead, such as cubic-bezier(0.16, 1, 0.3, 1)` });
    };
    for (const el of document.querySelectorAll("body *")) {
      const s = getComputedStyle(el);
      const durations = list(s.transitionDuration);
      const easings = list(s.transitionTimingFunction);
      list(s.transitionProperty).forEach((_, i) => {
        const easing = easings[i % easings.length]!;
        if (seconds(durations[i % durations.length]!) > 0 && overshoots(easing)) say(el, easing, "its transition");
      });
      const animDurations = list(s.animationDuration);
      const animEasings = list(s.animationTimingFunction);
      list(s.animationName).forEach((anim, i) => {
        const easing = animEasings[i % animEasings.length]!;
        if (anim !== "none" && seconds(animDurations[i % animDurations.length]!) > 0 && overshoots(easing)) say(el, easing, `its animation ${anim}`);
      });
    }
    return out;
  });
}
