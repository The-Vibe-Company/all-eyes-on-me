import type { Page } from "playwright";
import type { Issue } from "./types.js";

/** A phone's screen: below this width, a header that stays must leave room for the page. */
const PHONE = 768;
/** The share of a phone's screen a header that stays may take. */
const MOST = 0.25;

/**
 * The header stays within reach when you scroll: it sticks, or it hides going
 * down and comes back as soon as you scroll up a little. A page too short to
 * scroll, or with no header at its top, is not judged. On a phone, a header
 * that stays must not take more than a quarter of the screen.
 */
export async function checkHeader(page: Page): Promise<Issue[]> {
  const result = await page.evaluate(
    async ({ phone, most }) => {
      const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
      const to = (top: number) => window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
      const vh = window.innerHeight;
      // The header: a banner at the top of the page, across most of its width.
      const header = [...document.querySelectorAll<HTMLElement>('header, [role="banner"]')].find((el) => {
        const box = el.getBoundingClientRect();
        return box.height > 0 && box.top + window.scrollY <= 10 && box.width >= window.innerWidth / 2;
      });
      if (!header) return null;
      const max = document.documentElement.scrollHeight - vh;
      if (max < vh / 2) return null;
      const seen = () => {
        const box = header.getBoundingClientRect();
        const style = getComputedStyle(header);
        return box.bottom > 1 && box.top < vh - 1 && style.visibility !== "hidden" && Number(style.opacity) > 0.1;
      };
      const name = (() => {
        const text = (header.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40);
        const classes = [...header.classList].map((c) => `.${c}`).join("");
        return `${header.tagName.toLowerCase()}${header.id ? `#${header.id}` : ""}${classes}${text ? ` "${text}"` : ""}`;
      })();
      try {
        to(Math.min(vh * 1.5, max));
        await wait(300);
        let stays = seen();
        if (!stays) {
          // A header that hides going down comes back going up.
          to(Math.max(Math.min(vh * 1.5, max) - 100, 0));
          await wait(400);
          stays = seen();
        }
        const share = header.getBoundingClientRect().height / vh;
        return { name, stays, share: stays && window.innerWidth < phone && share > most ? share : null };
      } finally {
        to(0);
        await wait(50);
      }
    },
    { phone: PHONE, most: MOST },
  );
  if (!result) return [];
  if (!result.stays) return [{ element: result.name, message: "the header leaves the screen when you scroll and does not come back when you scroll up: make it stick, or bring it back on the way up" }];
  if (result.share !== null) return [{ element: result.name, message: `the header takes ${Math.round(result.share * 100)}% of the screen on a phone: a quarter at most` }];
  return [];
}
