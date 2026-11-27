/** What the screening says of each direction, for the person to choose with: never in their place. */
export interface DirectionComparison {
  /** `named`: what the screening names in it, a banned look or a timid one, shown beside it, never in its place. */
  directions: { slug: string; strong: string; weak: string; fit: string; named?: string }[];
  /** The one it would start from, and why: advice, the person chooses. */
  start: { slug: string; why: string };
}

const PARTS = [
  ["strong", "strong point"],
  ["weak", "weak point"],
  ["fit", "fit to the product"],
] as const;

/**
 * The screening judge's comparison, checked against the directions on the sheet: each
 * one with its strong point, its weak point and its fit, one sentence each, no other
 * direction, and one to start from among them. What is wrong is said, one sentence each.
 */
/**
 * The name a judge gave a direction, as the sheet shows it: a name the sheet shows is kept; a name the sheet does
 * not show is the one direction whose name it is, once a round's suffix is taken off (`vigilance` for
 * `vigilance-2`, `lutrin` for `lutrin-v1` or `lutrin-mix`), when exactly one is; otherwise it stays as given, and
 * is said.
 */
export function directionKey(name: string, directions: string[]): string {
  if (directions.includes(name)) return name;
  const base = (d: string) => d.replace(/-(\d+|v\d+|mix\d*)$/, "");
  const matches = directions.filter((d) => base(d) === name);
  return matches.length === 1 ? matches[0]! : name;
}

/**
 * The screening judge's comparison, checked against the directions on the sheet: each
 * one with its strong point, its weak point and its fit, one sentence each, no other
 * direction, and one to start from among them. What is wrong is said, one sentence each,
 * with the names it expects.
 */
export function compareDirections(answer: unknown, directions: string[]): { comparison: DirectionComparison | null; problems: string[] } {
  const problems: string[] = [];
  const keyed = <T>(record: unknown) => Object.fromEntries(Object.entries(typeof record === "object" && record !== null ? (record as Record<string, T>) : {}).map(([k, v]) => [directionKey(k, directions), v])) as Record<string, T>;
  const given = (answer && typeof answer === "object" ? (answer as { compare?: unknown }).compare : null) ?? {};
  // The front as it is is on the sheet, never a direction to compare.
  const compare = Object.fromEntries(Object.entries(keyed<Record<string, unknown>>(given)).filter(([slug]) => slug !== "now"));
  const out = keyed<unknown>((answer && typeof answer === "object" ? (answer as { out?: unknown }).out : null) ?? {});
  const names = `the names to use are ${directions.join(", ")}`;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const left = directions.filter((d) => !(d in compare));
  if (left.length) problems.push(`The comparison leaves out ${left.join(", ")}: every direction on the sheet is compared, none left aside; ${names}.`);
  const others = Object.keys(compare).filter((d) => !directions.includes(d));
  if (others.length) problems.push(`The comparison names ${others.join(", ")}, which the sheet does not show: ${names}.`);
  for (const slug of directions.filter((d) => d in compare)) {
    for (const [key, name] of PARTS) if (!text(compare[slug]?.[key])) problems.push(`${slug} has no ${name}: one sentence naming what the judge sees.`);
  }
  const start = (answer as { start?: { source?: unknown; slug?: unknown; why?: unknown } } | null)?.start;
  const slug = directionKey(text(start?.source) || text(start?.slug), directions);
  if (!slug) problems.push(`The comparison says no direction to start from: one, with why.`);
  else if (!directions.includes(slug)) problems.push(`It would start from ${slug}, which is not on the sheet: ${names}.`);
  else if (slug in out) problems.push(`It would start from ${slug}, which it names: ${text(out[slug]) || "as out"}.`);
  else if (!text(start?.why)) problems.push(`It would start from ${slug}, without saying why.`);
  if (problems.length) return { comparison: null, problems };
  return {
    comparison: {
      directions: directions.map((d) => ({ slug: d, ...(text(out[d]) ? { named: text(out[d]) } : {}), strong: text(compare[d]!.strong), weak: text(compare[d]!.weak), fit: text(compare[d]!.fit) })),
      start: { slug, why: text(start!.why) },
    },
    problems,
  };
}
