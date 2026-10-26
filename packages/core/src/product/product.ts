/**
 * The product sheet, `.aeom/product.md`: what AEOM understood of the app on
 * its own, for the user to correct. It says what kind of product the app is (a
 * tool, a game or a creative product), then has four parts (what the app is
 * for, who uses it, its main loop, its key journeys), and each journey is a
 * list of numbered steps. A game or a creative product adds its world: its
 * genre and fiction, the feeling it aims for, its references and its visual
 * assets. Every part and journey says where it comes from, `(seen: …)`, or
 * that it is a guess, `(to confirm)`. Every `###` heading under the key
 * journeys is a journey.
 */

import { acceptedExceptions, type KnownIds } from "./exceptions.js";
import { threeWay, type SheetMerge } from "../sheet/merge.js";

export const PARTS = ["What it is for", "Who uses it", "The main loop", "Key journeys"] as const;
const JOURNEYS = "Key journeys";
const KIND = "What kind of product";
export const KINDS = ["tool", "game", "creative"] as const;
export type ProductKind = (typeof KINDS)[number];
/** What a game's or a creative product's sheet adds: the world its users enter, which its directions start from. */
export const WORLD_PARTS = ["Genre and fiction", "The feeling it aims for", "References", "Visual assets"] as const;
const KIND_NAMES: Record<ProductKind, string> = { tool: "a tool's", game: "a game's", creative: "a creative product's" };
/** The kind a part says, its first word in backticks; null when it says none. */
const kindOf = (text: string): ProductKind | null => (text.match(/^`(tool|game|creative)`/i)?.[1]?.toLowerCase() as ProductKind | undefined) ?? null;
/** A source: `(seen: …)`, which may hold a path with one level of parentheses such as `src/app/(shop)/page.tsx`, or `(to confirm)`. */
const SOURCE = String.raw`\(seen: *[^()\s<](?:[^()]|\([^()]*\))*\)|\(to confirm\)`;
const SOURCED = new RegExp(SOURCE, "i");

/** Where the front is used: on a phone, on a computer, or both. */
const USED = "Where it is used";
export const PLATFORMS = ["mobile", "desktop", "both"] as const;
export type Platform = (typeof PLATFORMS)[number];
/** The widths a platform is judged at: a phone, a computer, or both. */
export const PLATFORM_WIDTHS: Record<Platform, number[]> = { mobile: [390], desktop: [1280], both: [390, 1280] };
const platformWord = (text: string): Platform | null => (text.match(/^`(mobile|desktop|both)`/i)?.[1]?.toLowerCase() as Platform | undefined) ?? null;

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
export function validateProduct(text: string, { known }: { known?: KnownIds } = {}): string[] {
  const all = units(text);
  // The exceptions the sheet accepts, line by line: a principle or check AEOM knows, a place, a reason, a source.
  const problems: string[] = [...acceptedExceptions(text, known ? { known } : {}).problems];
  const seen = new Set<string>();
  for (const unit of all) {
    if (seen.has(unit.key)) problems.push(`${unit.journey ? unit.key : `"${unit.key}"`} appears more than once`);
    seen.add(unit.key);
  }
  const kindPart = all.find((u) => !u.journey && u.key === KIND);
  const kind = kindPart ? kindOf(body(kindPart)) : null;
  if (!kindPart) problems.push(`missing "${KIND}": say whether the app is a \`tool\`, a \`game\` or a \`creative\` product, and where you saw it`);
  else if (!kind) problems.push(`"${KIND}" starts with \`tool\`, \`game\` or \`creative\`, in backticks, then says it in a few words`);
  else if (!SOURCED.test(body(kindPart))) problems.push(`"${KIND}" does not say where it comes from: add (seen: <screen or file>)`);
  else if (!/\(seen:/i.test(body(kindPart))) problems.push(`"${KIND}" is never a guess: say it from what you read or saw, (seen: <screen or file>)`);
  const usedPart = all.find((u) => !u.journey && u.key === USED);
  if (!usedPart) problems.push(`missing "${USED}": say whether the front is used on \`mobile\`, \`desktop\` or \`both\`, from what the project says, or guess it with (to confirm)`);
  else if (!platformWord(body(usedPart))) problems.push(`"${USED}" starts with \`mobile\`, \`desktop\` or \`both\`, in backticks, then says it in a few words`);
  else if (!SOURCED.test(body(usedPart))) problems.push(`"${USED}" does not say where it comes from: add (seen: <file>) or (to confirm)`);
  const world = kind === "game" || kind === "creative" ? WORLD_PARTS : [];
  for (const name of [...PARTS, ...world]) {
    const part = all.find((u) => !u.journey && u.key === name);
    if (!part) {
      problems.push(`missing "${name}"${(world as readonly string[]).includes(name) ? `: ${KIND_NAMES[kind!]} sheet says it` : ""}`);
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

export type ProductMerge = SheetMerge;

/**
 * Merges AEOM's new proposal into the sheet the user may have corrected, part
 * by part and journey by journey, as `threeWay` says. A new title goes first,
 * a new part before the journeys, a new journey after the last one.
 */
export function mergeProduct({ base, current, proposed }: { base?: string; current?: string; proposed: string }): ProductMerge {
  const next = units(proposed);
  const join = (list: Unit[]) => list.map((u) => u.text).join("\n\n") + "\n";
  if (current === undefined) return { text: join(next), kept: [], updated: [], added: next.map((u) => u.key), removed: [] };
  const { pieces, ...result } = threeWay({
    base: base === undefined ? undefined : units(base),
    current: units(current),
    proposed: next,
    place: (merged, unit) => {
      // The kind comes first, under the app's name.
      let at = unit.title ? 0 : unit.key === KIND ? (merged[0]?.title ? 1 : 0) : merged.findIndex((u) => u.key === JOURNEYS);
      if (unit.journey) merged.forEach((u, i) => (u.journey || u.key === JOURNEYS) && (at = i + 1));
      return at === -1 ? merged.length : at;
    },
  });
  return { text: join(pieces), ...result };
}

/**
 * Where the sheet says the front is used, and the widths that gives: `seen`
 * only when its first claim has a `(seen: …)` source, the user's answer
 * included; a guess `(to confirm)` decides nothing. Null for a sheet written
 * before AEOM said it.
 */
export function platformOf(text: string): { platform: Platform; widths: number[]; seen: boolean; source: string | null } | null {
  const unit = units(text).find((u) => !u.journey && u.key === USED);
  const platform = unit ? platformWord(body(unit)) : null;
  if (!unit || !platform) return null;
  const source = body(unit).match(new RegExp(SOURCE, "i"))?.[0] ?? "";
  const seen = /^\(seen:/i.test(source);
  return { platform, widths: PLATFORM_WIDTHS[platform], seen, source: seen ? source.replace(/^\(seen: */i, "").replace(/\)$/, "").trim() : null };
}

/** The sheet with the user's answer on where the front is used, as their own correction: the next merge keeps it. */
export function withPlatform(text: string, platform: Platform, by: string): string {
  const all = units(text);
  const said = `## ${USED}\n\`${platform}\`: ${by} said so. (seen: ${by})`;
  const at = all.findIndex((u) => !u.journey && u.key === USED);
  if (at >= 0) all[at] = { ...all[at]!, text: said };
  else {
    // A sheet written before AEOM said it: the part goes before the journeys.
    const journeys = all.findIndex((u) => u.key === JOURNEYS);
    all.splice(journeys === -1 ? all.length : journeys, 0, { key: USED, text: said, journey: false });
  }
  return all.map((u) => u.text).join("\n\n") + "\n";
}

/** What a direction may start from: the app's purpose, its users and its main loop, as far as they are known, and a game's world. */
export interface ProductBrief {
  /** The app's name, the sheet's `#` heading. */
  name: string;
  /** What kind of product the sheet says the app is; null for a sheet written before AEOM said it, read as a tool's. */
  kind: ProductKind | null;
  /** Each part, without its sources and without what is not confirmed; a part left empty is not there. */
  parts: { part: string; text: string }[];
  /** What the sheet marks `(to confirm)` or gives no source for, by part: no direction rests on a guess. */
  unconfirmed: string[];
  /** Parts the sheet does not hold under their heading, such as one the user renamed. */
  missing: string[];
}

const BRIEF_PARTS: string[] = PARTS.filter((p) => p !== JOURNEYS);
/** One claim of a part: its words, then the source that covers them, since the previous source. */
const CLAIM = new RegExp(String.raw`([^]*?)(${SOURCE})`, "gi");
const flat = (text: string) => text.replace(/^\s*[-*] +/gm, "").replace(/\s+/g, " ").trim();

/**
 * The brief of the directions, from the product sheet: what kind of product
 * the app is, what it is for, who uses it and its main loop, and for a game or
 * a creative product its world. Only claims with a `(seen: …)` source stay,
 * the user's own included (`(seen: <their name>)`): a claim marked `(to
 * confirm)`, or words with no source after them, are left out and named. A
 * tool's sheet that describes its visual assets passes them on too.
 */
export function productBrief(text: string): ProductBrief {
  const all = units(text);
  const title = all.find((u) => u.title);
  const kindPart = all.find((u) => !u.journey && u.key === KIND);
  const kind = kindPart ? kindOf(body(kindPart)) : null;
  const brief: ProductBrief = { name: title ? title.text.split("\n")[0]!.replace(/^# /, "").trim() : "", kind, parts: [], unconfirmed: [], missing: [] };
  const world: readonly string[] = kind === "game" || kind === "creative" ? WORLD_PARTS : [];
  for (const part of [...BRIEF_PARTS, ...WORLD_PARTS]) {
    const unit = all.find((u) => !u.journey && u.key === part);
    if (!unit) {
      if (BRIEF_PARTS.includes(part) || world.includes(part)) brief.missing.push(part);
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
