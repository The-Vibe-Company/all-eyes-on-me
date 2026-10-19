import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * Motion never bounces (impeccable's laws): no transition or animation whose easing goes
 * past its end and comes back, a cubic-bezier whose curve leaves 0 to 1 or a linear()
 * spring. Read from what each element is given, so a transition that has not run yet is
 * still seen, and from the keyframes of the animations running. Said once per kind of
 * element and easing.
 */
export async function checkBounce(page: Page): Promise<Issue[]> {
  return page.evaluate(() => {
    const list = (value: string) => value.split(/,(?![^(]*\))/).map((v) => v.trim());
    const seconds = (value: string) => (value.endsWith("ms") ? parseFloat(value) / 1000 : parseFloat(value)) || 0;
    const outside = (y: number) => y > 1.001 || y < -0.001;
    /** Whether an easing goes past its end: the curve sampled, or the points of linear(). */
    const overshoots = (easing: string) => {
      const bezier = easing.match(/^cubic-bezier\(([^)]*)\)$/);
      if (bezier) {
        const [, y1, , y2] = bezier[1]!.split(",").map((n) => parseFloat(n)) as [number, number, number, number];
        for (let i = 1; i < 64; i++) {
          const t = i / 64;
          if (outside(3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3)) return true;
        }
        return false;
      }
      const points = easing.match(/^linear\((.*)\)$/);
      return points ? points[1]!.split(",").some((point) => outside(parseFloat(point))) : false;
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
      list(s.transitionProperty).forEach((prop, i) => {
        const easing = easings[i % easings.length]!;
        if (prop !== "none" && seconds(durations[i % durations.length]!) > 0 && overshoots(easing)) say(el, easing, "its transition");
      });
      const animDurations = list(s.animationDuration);
      const animEasings = list(s.animationTimingFunction);
      list(s.animationName).forEach((anim, i) => {
        const easing = animEasings[i % animEasings.length]!;
        if (anim !== "none" && seconds(animDurations[i % animDurations.length]!) > 0 && overshoots(easing)) say(el, easing, `its animation ${anim}`);
      });
    }
    // An easing set inside the keyframes themselves.
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (!target || !(animation instanceof CSSAnimation)) continue;
      for (const frame of (animation.effect as KeyframeEffect).getKeyframes()) {
        if (frame.easing && overshoots(frame.easing)) say(target, frame.easing, `its animation ${animation.animationName}`);
      }
    }
    return out;
  });
}
