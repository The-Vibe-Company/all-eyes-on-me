/**
 * The product sheet, `.aeom/product.md`: what AEOM understood of the app on
 * its own, for the user to correct. It has four parts (what the app is for,
 * who uses it, its main loop, its key journeys), and each journey is a list of
 * numbered steps. Every part and journey says where it comes from, `(seen: …)`,
 * or that it is a guess, `(to confirm)`. Every `###` heading under the key
 * journeys is a journey.
 */

export const PARTS = ["What it is for", "Who uses it", "The main loop", "Key journeys"] as const;
const JOURNEYS = "Key journeys";
/** A source: `(seen: …)`, which may hold a path with one level of parentheses such as `src/app/(shop)/page.tsx`, or `(to confirm)`. */
const SOURCE = String.raw`\(seen: *[^()\s<](?:[^()]|\([^()]*\))*\)|\(to confirm\)`;
const SOURCED = new RegExp(SOURCE, "i");

/** One piece of the sheet the user can correct on its own: the title, a part, or a journey. */
interface Unit {
  key: string;
  /** Its text, heading included, without the blank lines around it. */
  text: string;
  journey: boolean;
  /** The app's name, the sheet's `#` heading: it always comes first. */
  title?: boolean;
}

function units(text: string): Unit[] {
  const result: Unit[] = [];
  let current: Unit | null = null;
  let inJourneys = false;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const part = line.match(/^## (.+?)\s*$/);
    const journey = inJourneys ? line.match(/^### (.+?)\s*$/) : null;
    const title: RegExpMatchArray | null = current ? null : line.match(/^# (.+?)\s*$/);
    const heading = part ?? journey ?? title;
    if (heading) {
      if (part) inJourneys = part[1] === JOURNEYS;
      const name: string = heading[1]!;
      current = { key: journey ? `journey "${name}"` : name, text: line, journey: Boolean(journey), ...(title ? { title: true } : {}) };
      result.push(current);
    } else if (current) {
      current.text += `\n${line}`;
    }
  }
  for (const unit of result) unit.text = unit.text.replace(/\s+$/, "");
  return result;
}

const body = (unit: Unit) => unit.text.split("\n").slice(1).join("\n").trim();

/** What is wrong with a sheet, one sentence each; empty when it can be written. */
export function validateProduct(text: string): string[] {
  const all = units(text);
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const unit of all) {
    if (seen.has(unit.key)) problems.push(`${unit.journey ? unit.key : `"${unit.key}"`} appears more than once`);
    seen.add(unit.key);
  }
  for (const name of PARTS) {
    const part = all.find((u) => !u.journey && u.key === name);
    if (!part) {
      problems.push(`missing "${name}"`);
      continue;
    }
    if (name === JOURNEYS) continue;
    if (!body(part)) problems.push(`"${name}" is empty`);
    else if (!SOURCED.test(body(part))) problems.push(`"${name}" does not say where it comes from: add (seen: <screen or file>) or (to confirm)`);
  }
  const journeys = all.filter((u) => u.journey);
  if (journeys.length < 3 || journeys.length > 5) problems.push(`3 to 5 key journeys, found ${journeys.length}`);
  for (const journey of journeys) {
    if (!/^\d+\. \S/m.test(body(journey))) problems.push(`${journey.key} has no numbered steps`);
    if (!SOURCED.test(body(journey))) problems.push(`${journey.key} does not say where it comes from: add (seen: <screen or file>) or (to confirm)`);
  }
  return problems;
}

export interface ProductMerge {
  text: string;
  /** Kept as the user wrote it, though AEOM proposed something else or nothing. */
  kept: string[];
  /** Replaced by what AEOM learned, since the user had not touched it. */
  updated: string[];
  /** New in this proposal. */
  added: string[];
  /** AEOM's own, untouched by the user, and no longer in its proposal. */
  removed: string[];
}

/**
 * Merges AEOM's new proposal into the sheet the user may have corrected.
 * `base` is AEOM's previous proposal: a part or journey that differs from it,
 * or that it did not hold, is the user's and stays as they wrote it; one the
 * user removed stays removed. What the user left alone takes the new proposal,
 * or goes when the proposal no longer holds it, and what is new in the
 * proposal is added. Without `base`, everything already in the sheet counts as
 * the user's.
 */
export function mergeProduct({ base, current, proposed }: { base?: string; current?: string; proposed: string }): ProductMerge {
  const next = units(proposed);
  const join = (list: Unit[]) => list.map((u) => u.text).join("\n\n") + "\n";
  if (current === undefined) return { text: join(next), kept: [], updated: [], added: next.map((u) => u.key), removed: [] };

  const before = base === undefined ? null : new Map(units(base).map((u) => [u.key, u.text]));
  const now = units(current);
  const proposedText = new Map(next.map((u) => [u.key, u.text]));
  const result = { kept: [] as string[], updated: [] as string[], added: [] as string[], removed: [] as string[] };

  const merged: Unit[] = [];
  for (const unit of now) {
    const offered = proposedText.get(unit.key);
    const untouched = before !== null && before.get(unit.key) === unit.text;
    if (offered === unit.text) merged.push(unit);
    else if (untouched && offered === undefined) result.removed.push(unit.key);
    else if (untouched) {
      result.updated.push(unit.key);
      merged.push({ ...unit, text: offered! });
    } else {
      merged.push(unit);
      if (before !== null || offered !== undefined) result.kept.push(unit.key);
    }
  }

  const present = new Set(now.map((u) => u.key));
  for (const unit of next) {
    if (present.has(unit.key)) continue;
    // In AEOM's last proposal but gone from the sheet: the user removed it.
    if (before?.has(unit.key)) continue;
    // A new title goes first, a new part before the journeys, a new journey after the last one.
    let at = unit.title ? 0 : merged.findIndex((u) => u.key === JOURNEYS);
    if (unit.journey) merged.forEach((u, i) => (u.journey || u.key === JOURNEYS) && (at = i + 1));
    merged.splice(at === -1 ? merged.length : at, 0, unit);
    result.added.push(unit.key);
  }

  return { text: join(merged), ...result };
}

/** What a direction may start from: the app's purpose, its users and its main loop, as far as they are known. */
export interface ProductBrief {
  /** The app's name, the sheet's `#` heading. */
  name: string;
  /** Each part, without its sources and without what is not confirmed; a part left empty is not there. */
  parts: { part: string; text: string }[];
  /** What the sheet marks `(to confirm)` or gives no source for, by part: no direction rests on a guess. */
  unconfirmed: string[];
  /** Parts the sheet does not hold under their heading, such as one the user renamed. */
  missing: string[];
}

const BRIEF_PARTS = PARTS.filter((p) => p !== JOURNEYS);
/** One claim of a part: its words, then the source that covers them, since the previous source. */
const CLAIM = new RegExp(String.raw`([^]*?)(${SOURCE})`, "gi");
const flat = (text: string) => text.replace(/^\s*[-*] +/gm, "").replace(/\s+/g, " ").trim();

/**
 * The brief of the directions, from the product sheet: what the app is for,
 * who uses it and its main loop. Only claims with a `(seen: …)` source stay,
 * the user's own included (`(seen: <their name>)`): a claim marked `(to
 * confirm)`, or words with no source after them, are left out and named.
 */
export function productBrief(text: string): ProductBrief {
  const all = units(text);
  const title = all.find((u) => u.title);
  const brief: ProductBrief = { name: title ? title.text.split("\n")[0]!.replace(/^# /, "").trim() : "", parts: [], unconfirmed: [], missing: [] };
  for (const part of BRIEF_PARTS) {
    const unit = all.find((u) => !u.journey && u.key === part);
    if (!unit) {
      brief.missing.push(part);
      continue;
    }
    const kept: string[] = [];
    const words = body(unit);
    let end = 0;
    for (const [, claim, source] of words.matchAll(CLAIM)) {
      const said = flat(claim!);
      end += claim!.length + source!.length;
      if (!said) continue;
      if (/^\(to confirm\)$/i.test(source!)) brief.unconfirmed.push(`${part}: ${said}`);
      else kept.push(said);
    }
    // Words after the last source: nothing says where they come from.
    const rest = flat(words.slice(end));
    if (rest) brief.unconfirmed.push(`${part}: ${rest} (no source)`);
    if (kept.length) brief.parts.push({ part, text: kept.join(" ") });
  }
  return brief;
}
