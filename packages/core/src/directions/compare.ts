/** What the screening says of each direction, for the person to choose with: never in their place. */
export interface DirectionComparison {
  directions: { slug: string; strong: string; weak: string; fit: string }[];
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
export function compareDirections(answer: unknown, directions: string[]): { comparison: DirectionComparison | null; problems: string[] } {
  const problems: string[] = [];
  const given = (answer && typeof answer === "object" ? (answer as { compare?: unknown }).compare : null) ?? {};
  // The front as it is is on the sheet, never a direction to compare.
  const compare = Object.fromEntries(Object.entries(typeof given === "object" && given !== null ? (given as Record<string, Record<string, unknown>>) : {}).filter(([slug]) => slug !== "now"));
  const out = (answer && typeof answer === "object" ? (answer as { out?: Record<string, unknown> }).out : null) ?? {};
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const left = directions.filter((d) => !(d in compare));
  if (left.length) problems.push(`The comparison leaves out ${left.join(", ")}: every direction on the sheet is compared, none left aside.`);
  const others = Object.keys(compare).filter((d) => !directions.includes(d));
  if (others.length) problems.push(`The comparison names ${others.join(", ")}, which the sheet does not show.`);
  for (const slug of directions.filter((d) => d in compare)) {
    for (const [key, name] of PARTS) if (!text(compare[slug]?.[key])) problems.push(`${slug} has no ${name}: one sentence naming what the judge sees.`);
  }
  const start = (answer as { start?: { source?: unknown; slug?: unknown; why?: unknown } } | null)?.start;
  const slug = text(start?.source) || text(start?.slug);
  if (!slug) problems.push(`The comparison says no direction to start from: one, with why.`);
  else if (!directions.includes(slug)) problems.push(`It would start from ${slug}, which is not on the sheet.`);
  else if (slug in out) problems.push(`It would start from ${slug}, which it names: ${text(out[slug]) || "as out"}.`);
  else if (!text(start?.why)) problems.push(`It would start from ${slug}, without saying why.`);
  if (problems.length) return { comparison: null, problems };
  return {
    comparison: {
      directions: directions.map((d) => ({ slug: d, strong: text(compare[d]!.strong), weak: text(compare[d]!.weak), fit: text(compare[d]!.fit) })),
      start: { slug, why: text(start!.why) },
    },
    problems,
  };
}
