import { pageShape } from "../capture/shape.js";

/**
 * What the product sheet accepts in so many words: a principle or a check that fails a
 * page or a journey by the person's choice, or because the spec asks for it. The judges
 * and the checks then count it as accepted, said apart with its reason, never as a
 * failure to redo.
 */
export interface AcceptedException {
  /** The principle or the check, such as `not-generic` or `contrast`. */
  id: string;
  /** The routes it holds on, or every page. */
  pages?: string[] | "all";
  /** The journeys it holds on, by name or slug, or every journey. */
  journeys?: string[] | "all";
  why: string;
  /** Who chose it, or the spec's article: never AEOM. */
  source: string;
}

export const EXCEPTIONS = "Accepted exceptions";

const SOURCE = String.raw`\((seen|to confirm)(?::\s*((?:[^()]|\([^()]*\))*))?\)\s*$`;
const LINE = new RegExp(String.raw`^- \`([a-z0-9-]+)\` on (every page|every journey|the journeys? (.+?)|(\/\S*(?:, ?\/\S*)*))\s?: (.+?)\s*` + SOURCE, "i");

/** The part's lines, from its heading to the next part, as one list: « - » however it was bulleted, quotes made straight. */
function lines(text: string): string[] {
  const start = text.search(new RegExp(`^## ${EXCEPTIONS}\\s*$`, "m"));
  if (start < 0) return [];
  const rest = text.slice(start).split(/\r?\n/).slice(1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end))
    .map((l) => l.trim())
    .filter((l) => /^[-*+] /.test(l))
    .map((l) => `- ${l.slice(2)}`.replace(/«\s*|\s*»|[“”]/g, '"'));
}

/** The ids an exception may name, by where they are judged: pages (checks and page principles) or journeys. */
export interface KnownIds {
  pages: string[];
  journeys: string[];
}

/** The exceptions the sheet accepts, and what is wrong with a line, one sentence each. */
export function acceptedExceptions(text: string, { known }: { known?: KnownIds } = {}): { exceptions: AcceptedException[]; problems: string[] } {
  const exceptions: AcceptedException[] = [];
  const problems: string[] = [];
  for (const line of lines(text)) {
    const id = /^- `([a-z0-9-]+)`/.exec(line)?.[1];
    if (id && known && ![...known.pages, ...known.journeys].includes(id)) {
      problems.push(`"${line}": \`${id}\` is no principle or check AEOM knows`);
      continue;
    }
    if (!new RegExp(SOURCE, "i").test(line)) {
      problems.push(`"${line}" says no source: (seen: <who chose it, or the spec's article>)`);
      continue;
    }
    const match = LINE.exec(line);
    if (!match) {
      problems.push(`"${line}" says neither where nor why: - \`<principle or check>\` on every page, on /a, /b, on every journey or on the journey "<name>": <why>. (seen: <who>)`);
      continue;
    }
    const [, name, place, journeys, routes, why, kind, source] = match;
    if (kind!.toLowerCase() === "to confirm" || !source?.trim()) {
      problems.push(`\`${name}\` on ${place} is a guess: only the person or the spec accepts an exception, never AEOM; (seen: <who chose it, or the spec's article>)`);
      continue;
    }
    const onJourneys = place === "every journey" || (!routes && place !== "every page");
    if (known && onJourneys && !known.journeys.includes(name!)) {
      problems.push(`\`${name}\` judges pages, not journeys: "${line}"`);
      continue;
    }
    if (known && !onJourneys && !known.pages.includes(name!)) {
      problems.push(`\`${name}\` judges journeys, not pages: "${line}"`);
      continue;
    }
    exceptions.push({
      id: name!,
      ...(place === "every page" ? { pages: "all" as const } : place === "every journey" ? { journeys: "all" as const } : routes ? { pages: routes.split(/, ?/) } : { journeys: [...journeys!.matchAll(/"([^"]+)"|([^,"]+)/g)].map((m) => (m[1] ?? m[2]!).trim()).filter(Boolean) }),
      why: why!.trim(),
      source: source.trim(),
    });
  }
  return { exceptions, problems };
}

const bare = (route: string) => route.replace(/[?#].*$/, "").replace(/(.)\/+$/, "$1");

/** The exception that accepts `id` on this page, by its route or a route of its shape. */
export function acceptedOnPage(exceptions: AcceptedException[], id: string, route: string): AcceptedException | undefined {
  return exceptions.find((e) => e.id === id && e.pages && (e.pages === "all" || e.pages.some((r) => bare(r) === bare(route) || pageShape(bare(r)) === pageShape(bare(route)))));
}

/** The exception that accepts `id` on this journey, named by its name or its slug. */
export function acceptedOnJourney(exceptions: AcceptedException[], id: string, journey: { slug: string; name?: string }): AcceptedException | undefined {
  const named = (n: string) => [journey.slug, journey.name].filter(Boolean).some((j) => j!.toLowerCase() === n.toLowerCase());
  return exceptions.find((e) => e.id === id && e.journeys && (e.journeys === "all" || e.journeys.some(named)));
}
