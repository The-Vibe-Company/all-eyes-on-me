import type { Browser, Page } from "playwright";
import { settle } from "../capture/open.js";
import type { SignedIn } from "../capture/sign-in.js";
import type { Finding, Issue } from "./types.js";

/** The titles a framework writes before anyone names the page. */
const GENERIC_TITLE = /^(react app|vite app|vite \+ [\w +]+|create next app|next\.js app|nuxt app|svelte ?kit app|angular app|document|untitled|untitled document|index|home|my app|app|new tab|localhost(:\d+)?)$/i;

/**
 * What a finished page has: a title of its own, an icon, a skip link past its navigation,
 * and when anyone can open it, a description and an image for when it is shared. Said
 * once per page, in that order.
 */
export async function checkFinish(page: Page, { public: open }: { public: boolean }): Promise<Issue[]> {
  const found = await page.evaluate(async ({ open, generic }) => {
    const out: string[] = [];
    const title = document.title.trim();
    if (!title) out.push("no title: name the page and the product in <title>");
    else if (new RegExp(generic, "i").test(title))
      out.push(`a title left as the framework wrote it, "${title}": name the page and the product`);
    let icon = document.querySelector('link[rel~="icon" i], link[rel="apple-touch-icon" i]') !== null;
    // A browser asks for /favicon.ico when no link names an icon.
    if (!icon && location.protocol.startsWith("http")) {
      icon = await fetch(new URL("/favicon.ico", location.href), { redirect: "follow" })
        .then((r) => r.ok && /^image\//.test(r.headers.get("content-type") ?? "image/"))
        .catch(() => false);
    }
    if (!icon) out.push('no icon: give the page a favicon, in <link rel="icon">');
    if (open) {
      if (!document.querySelector('meta[name="description" i]')?.getAttribute("content")?.trim()) out.push('no description: <meta name="description"> says in a sentence what the page holds');
      if (!document.querySelector('meta[property="og:image" i], meta[name="og:image" i]')?.getAttribute("content")?.trim()) out.push('no share image: <meta property="og:image">, the image shown where the page is shared');
    }
    // A navigation of three links or more before the content asks for a way past it; a footer's or an article's does not.
    const content = document.querySelector("main, [role=main]") ?? document.querySelector("h1");
    const before = (el: Element) => !content || (el.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const navigation = [...document.querySelectorAll('nav a[href], [role="navigation"] a[href]')].filter((a) => !a.closest("footer, article, main, [role=main]") && before(a)).length >= 3;
    if (navigation) {
      const first = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].find((el) => (el as HTMLElement).tabIndex >= 0 && (el.checkVisibility?.() ?? true));
      const target = (() => {
        if (first?.tagName !== "A") return null;
        const link = first as HTMLAnchorElement;
        if (!link.hash || link.hash.length < 2 || (link.href.split("#")[0] !== location.href.split("#")[0] && !link.getAttribute("href")!.startsWith("#"))) return null;
        try {
          return document.getElementById(decodeURIComponent(link.hash.slice(1)));
        } catch {
          return document.getElementById(link.hash.slice(1));
        }
      })();
      if (!target) out.push('no skip link: a link to the content (href="#<its id>"), first on the page, shown when it has the focus');
    }
    return out;
  }, { open, generic: GENERIC_TITLE.source });
  return found.map((message) => ({ message }));
}

/** The route asked for to see how the app answers an address that does not exist. */
export const NOT_FOUND_PROBE = "/aeom-check-404";

/**
 * An address that does not exist is answered by a page that says so (a 404, or words
 * that say the page is not there) and leads back somewhere. A redirect, such as to the
 * sign-in, is the app's choice and is left alone. Asked once per site, never of a folder
 * of mockups.
 */
export async function checkNotFound(browser: Browser, url: string, width: number, signedIn?: SignedIn): Promise<Finding[]> {
  const context = await browser.newContext({ viewport: { width, height: 800 }, ...(signedIn ? { storageState: signedIn } : {}) });
  try {
    const page = await context.newPage();
    // Under the app's own path: an app at /app/ answers for /app/aeom-check-404.
    const base = url.endsWith("/") ? url : `${url}/`;
    const probe = new URL(NOT_FOUND_PROBE.slice(1), base).toString();
    let status: number | undefined;
    try {
      status = (await page.goto(probe, { waitUntil: "load", timeout: 20_000 }))?.status();
    } catch {
      return [];
    }
    // A 404 the browser draws, or a redirect it makes, a moment after the page loads.
    await settle(page);
    await page.waitForTimeout(1000);
    if (new URL(page.url()).pathname !== new URL(probe).pathname) return [];
    const { says, links } = await page.evaluate(() => {
      const text = `${document.title} ${document.body?.innerText ?? ""}`;
      return {
        says: /\b404\b|introuvable|n['’]existe (pas|plus)|not found|does ?n['’o]t exist|does not exist|page inconnue/i.test(text),
        links: [...document.querySelectorAll("a[href]")].filter((a) => a.checkVisibility?.() ?? true).length,
      };
    });
    // Said on the home page, as the page list names it.
    const at = { check: "finish" as const, url: base, width };
    if (status !== 404 && !says) return [{ ...at, message: `an address that does not exist, ${NOT_FOUND_PROBE}, shows a page that does not say so (status ${status ?? "none"}): answer 404, with a page that says the address leads nowhere and links back` }];
    if (!links) return [{ ...at, message: `an address that does not exist, ${NOT_FOUND_PROBE}, leads nowhere: its page links nowhere; give it a way back, such as to the home page` }];
    return [];
  } finally {
    await context.close();
  }
}
