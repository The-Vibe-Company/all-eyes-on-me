import { pageShape } from "../capture/shape.js";

/** What a page lets its user do, as `aeom capture` kept it: every link of its DOM, menus hidden or not, and what a screen reader reads. */
export interface PageActions {
  /** The route, as the comparison names it. */
  page: string;
  url: string;
  /** Every link, with its target as the browser resolves it; absent when the capture kept none. */
  links?: { href: string; name: string }[];
  /** `<page>.content.yml`. */
  content?: string;
}

const NOT_AN_ID = /^[a-z]+(-[a-z]+)*$/;

/** A link's target, as one key: the app's routes by their shape and query (a record's id aside), elsewhere its host and path. */
function target(href: string, app: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol === "mailto:" || url.protocol === "tel:") return `${url.protocol}${url.pathname.toLowerCase()}`;
  if (!/^https?:$/.test(url.protocol)) return null;
  const path = pageShape(url.pathname.replace(/\/index\.html?$/i, "/").replace(/(.)\/+$/, "$1"));
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => `${k}=${NOT_AN_ID.test(v) ? v : ":id"}`)
    .sort()
    .join("&");
  const where = url.origin === app ? "" : url.host.replace(/^www\./, "").toLowerCase();
  return `${where}${path}${query ? `?${query}` : ""}`;
}

/** What a page links to that leads somewhere else than itself: a hash on the page, or the page itself, is not an action it could lose. */
function linksOf(p: PageActions): Map<string, string> {
  const app = new URL(p.url).origin;
  const own = target(p.url, app);
  const out = new Map<string, string>();
  for (const { href, name } of p.links ?? []) {
    const key = target(href, app);
    if (!key || key === own) continue;
    if (!out.has(key)) out.set(key, `link${name.trim() ? ` "${name.trim().replace(/\s+/g, " ")}"` : ""} to ${href}`);
  }
  return out;
}

const FIELDS = new Set(["textbox", "searchbox", "combobox", "checkbox", "radio", "switch", "spinbutton", "slider"]);
const BUTTONS = new Set(["button", "tab", "menuitem"]);
const words = (name: string) => name.toLowerCase().normalize("NFKC").replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();

/** The buttons and fields a screen reader reads on a page, by their names. */
function namesOf(content: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of (content ?? "").split(/\r?\n/)) {
    const item = /^\s*- '?([a-z]+) "((?:[^"\\]|\\.)*)"/.exec(line);
    if (!item || !(BUTTONS.has(item[1]!) || FIELDS.has(item[1]!))) continue;
    const name = item[2]!.replace(/\\"/g, '"').trim();
    const key = words(name);
    if (key && !out.has(`${item[1]} ${key}`)) out.set(`${item[1]} ${key}`, `${item[1]} "${name}"`);
  }
  return out;
}

/**
 * What the front let its users do before and no page lets them do after. A link to a
 * target no page links to any more is lost, named on every page that had it: the app's
 * routes by their shape (a record's id aside), a slash, `index.html` or a `www` aside,
 * hidden in a menu or not. A button or a field whose name no page has any more is only
 * said to look at, `toCheck`: it may have been renamed. A page captured without its links,
 * on either side, makes nothing lost: what is not known is not counted.
 */
export function lostActions(before: PageActions[], after: PageActions[]): { lost: { page: string; what: string }[]; toCheck: { page: string; what: string }[]; unknown?: string } {
  const blind = [...before, ...after].filter((p) => !p.links).map((p) => p.page);
  const lost: { page: string; what: string }[] = [];
  if (!blind.length) {
    const now = new Set(after.flatMap((p) => [...linksOf(p).keys()]));
    for (const p of before) for (const [key, what] of linksOf(p)) if (!now.has(key)) lost.push({ page: p.page, what });
  }
  const named = after.flatMap((p) => [...namesOf(p.content).keys()].map((k) => k.slice(k.indexOf(" ") + 1)));
  const within = (short: string, long: string) => ` ${long} `.includes(` ${short} `);
  const toCheck: { page: string; what: string }[] = [];
  const said = new Set<string>();
  for (const p of before) {
    for (const [key, what] of namesOf(p.content)) {
      const name = key.slice(key.indexOf(" ") + 1);
      if (said.has(key) || named.some((n) => within(name, n) || within(n, name))) continue;
      said.add(key);
      toCheck.push({ page: p.page, what });
    }
  }
  return { lost, toCheck, ...(blind.length ? { unknown: `${[...new Set(blind)].join(", ")} ${blind.length === 1 ? "was" : "were"} captured without its links: no link is counted lost` } : {}) };
}
