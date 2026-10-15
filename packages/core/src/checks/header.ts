import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** A phone's screen: below this width, a header that stays must leave room for the page. */
const PHONE = 768;
/** The share of a phone's screen a header that stays may take. */
const MOST = 0.25;
/** How far down the page's header may start: a promotion bar can sit above it. */
const NEAR_TOP = 80;
/** How far back up a header that hides going down may wait before it comes back. */
const WAY_UP = 250;

/**
 * The site's header stays within reach when you scroll: it sticks, it hides
 * going down and comes back on the way up, or a fixed bar of links takes its
 * place, as a navigation above a hero header does. The header of an article
 * or a section is its title, not the site's. A page too short to scroll, or
 * with no header near its top, is not judged. On a phone, what stays must not
 * take more than a quarter of the screen.
 */
export async function checkHeader(page: Page): Promise<Issue[]> {
  const result = await page.evaluate(
    async ({ phone, most, nearTop, wayUp }) => {
      const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
      const to = (top: number) => window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
      const from = window.scrollY;
      to(0);
      await wait(50);
      const vh = window.innerHeight;
      // The site's header: a banner near the top, across most of the page, not the title of an article or a section.
      const header = [...document.querySelectorAll<HTMLElement>('header, [role="banner"]')].find((el) => {
        const box = el.getBoundingClientRect();
        return box.height > 0 && box.top <= nearTop && box.width >= window.innerWidth / 2 && !el.parentElement?.closest("article, section, main, aside, nav");
      });
      const max = document.documentElement.scrollHeight - vh;
      if (!header || max < vh / 2) {
        to(from);
        return null;
      }
      const shown = (el: HTMLElement) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return box.bottom > 1 && box.top < vh - 1 && style.visibility !== "hidden" && Number(style.opacity) > 0.1;
      };
      /** What stays at the top once scrolled: the header, or a fixed or sticky bar of links across the page. */
      const staying = () => {
        if (shown(header)) return header;
        return [...document.querySelectorAll<HTMLElement>("body *")].find((el) => {
          const position = getComputedStyle(el).position;
          if (position !== "fixed" && position !== "sticky") return false;
          const box = el.getBoundingClientRect();
          return box.top < vh * 0.3 && box.width >= window.innerWidth / 2 && !!el.querySelector("a, button") && shown(el);
        }) ?? null;
      };
      const name = (() => {
        const text = (header.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...header.classList].map((c) => `.${c}`).join("");
        return `${header.tagName.toLowerCase()}${header.id ? `#${header.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
      })();
      try {
        const down = Math.min(vh * 1.5, max);
        to(down);
        await wait(300);
        let stays = staying();
        if (!stays) {
          // A header that hides going down comes back going up.
          to(Math.max(down - wayUp, 0));
          await wait(400);
          stays = staying();
        }
        const share = stays ? stays.getBoundingClientRect().height / vh : 0;
        return { name, stays: !!stays, share: stays && window.innerWidth < phone && share > most ? share : null };
      } finally {
        to(from);
        await wait(50);
      }
    },
    { phone: PHONE, most: MOST, nearTop: NEAR_TOP, wayUp: WAY_UP },
  );
  if (!result) return [];
  if (!result.stays) return [{ element: result.name, message: "the header leaves the screen when you scroll and does not come back when you scroll up: make it stick, or bring it back on the way up" }];
  if (result.share !== null) return [{ element: result.name, message: `the header takes ${Math.round(result.share * 100)}% of the screen on a phone: a quarter at most` }];
  return [];
}
