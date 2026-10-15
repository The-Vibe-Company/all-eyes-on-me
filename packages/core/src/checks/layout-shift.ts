import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** The shift a page may make while it loads, as Core Web Vitals counts it. */
const MOST = 0.1;

/**
 * The page does not move while it loads: an image without its size, a font
 * that swaps, a banner inserted above the content push what one was reading.
 * Shifts are counted as Core Web Vitals counts them: the largest burst, shifts
 * less than a second apart within five seconds, none caused by the user.
 */
export async function checkLayoutShift(page: Page): Promise<Issue[]> {
  const result = await page.evaluate(
    () =>
      new Promise<{ score: number; sources: string[] } | null>((resolve) => {
        const entries: { value: number; start: number; nodes: Element[] }[] = [];
        let observer: PerformanceObserver;
        try {
          observer = new PerformanceObserver((list) => {
            for (const e of list.getEntries() as unknown as { value: number; startTime: number; hadRecentInput: boolean; sources?: { node?: Node }[] }[]) {
              if (!e.hadRecentInput) entries.push({ value: e.value, start: e.startTime, nodes: (e.sources ?? []).map((s) => s.node).filter((n): n is Element => n instanceof Element) });
            }
          });
          observer.observe({ type: "layout-shift", buffered: true });
        } catch {
          return resolve(null);
        }
        setTimeout(() => {
          observer.disconnect();
          let best = { score: 0, nodes: [] as Element[] };
          let current = { score: 0, nodes: [] as Element[], first: -Infinity, last: -Infinity };
          for (const e of entries.sort((a, b) => a.start - b.start)) {
            if (e.start - current.last > 1000 || e.start - current.first > 5000) current = { score: 0, nodes: [], first: e.start, last: e.start };
            current.score += e.value;
            current.last = e.start;
            current.nodes.push(...e.nodes);
            if (current.score > best.score) best = { score: current.score, nodes: [...current.nodes] };
          }
          const name = (el: Element) => {
            const text = ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
            const classes = [...el.classList].map((c) => `.${c}`).join("");
            return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
          };
          resolve({ score: best.score, sources: [...new Set(best.nodes)].slice(0, 2).map(name) });
        }, 300);
      }),
  );
  if (!result || result.score <= MOST) return [];
  return [{ ...(result.sources[0] ? { element: result.sources[0] } : {}), message: `the page moves while it loads (shift ${result.score.toFixed(2)}, ${MOST} at most): give images and embeds their size, and reserve the room of what comes late` }];
}
