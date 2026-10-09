/**
 * The standard of the front, `.aeom/standard.md`: what defines the front from
 * now on, in words only. Its direction (where it comes from, what it takes
 * from the product sheet), its tokens and its kit, each with the file of the
 * code where it lives, and the product's own rules. Every token and component
 * is a line of its own, which the user can correct on its own.
 */

import { isAbsolute, posix } from "node:path";
import { threeWay } from "../product/merge.js";

export const STANDARD_PARTS = ["Direction", "Tokens", "Components", "Rules"] as const;
/** The parts made of one line per token or component. */
const LISTS = new Set<string>(["Tokens", "Components"]);
const STYLE = /\.(css|scss|sass|less|pcss|styl)$/i;
/** What the draft leaves for AEOM to write: a standard that still holds one is refused. */
const TO_WRITE = {
  direction: "<The direction kept: its name, the thing from its users' world it is drawn from, and what it takes from the product sheet (what the app is for, who uses it, its main loop). With the style kept: the app's own style, and where it was read.>",
  source: "<the thing from its users' world it is drawn from, and what it takes from the product sheet (what the app is for, who uses it, its main loop).>",
  tokens: "<No custom property in these files: name each colour, font, size and spacing the front holds to, as `name: value` in `file`, the value as the file writes it.>",
  components: "<No component in these files: name each one the pages share, as `.class` in `file`, `Name` in `file`, or `file`.>",
  rules: "<The product's own rules of the front, one per line, that the tokens and the kit do not say alone, such as the one colour kept for the main action.>",
};

/** One piece of the standard the user can correct on its own: the title, a part, or a token or component. */
interface Unit {
  key: string;
  label: string;
  text: string;
  /** The part it belongs to, none for the title. */
  part: string | null;
  item: boolean;
  title?: boolean;
}

/** A token or component line: its first code span, the file it lives in, and the rule a token is set under, when it is not the root. */
const ITEM = /^[-*] `([^`\n]+)`(?: in `([^`\n]+)`(?:, under `([^`\n]+)`)?)?/;

/** A token's name, as `--name: value` or `name: value` write it. */
const TOKEN = /^(["']?)([^"':\s]+)\1\s*:\s*(.+)$/;

/**
 * How a token or component line is found again, and named to the user. A
 * token is found by its name, its file and its rule, not its value: when the
 * code changes the value, the line is updated, not removed and added.
 */
function item(part: string, line: string): { key: string; label: string } {
  const found = line.match(ITEM);
  if (!found) return { key: `${part}: ${line.slice(2).trim()}`, label: line.slice(2).trim() };
  const where = `${found[2] ? ` in \`${found[2]}\`` : ""}${found[3] ? `, under \`${found[3]}\`` : ""}`;
  const token = part === "Tokens" ? found[1]!.match(TOKEN) : null;
  return { key: `${part}: \`${token ? token[2] : found[1]}\`${where}`, label: `\`${found[1]}\`${where}` };
}

function units(text: string): Unit[] {
  const result: Unit[] = [];
  let part: string | null = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const current = result.at(-1);
    const title = current ? null : line.match(/^# (.+?)\s*$/);
    const heading = line.match(/^## (.+?)\s*$/);
    if (title) result.push({ key: "#", label: "Title", text: line, part: null, item: false, title: true });
    else if (heading) {
      part = heading[1]!;
      result.push({ key: `## ${part}`, label: part, text: line, part, item: false });
    } else if (part && LISTS.has(part) && /^[-*] /.test(line)) {
      result.push({ ...item(part, line), text: line, part, item: true });
    } else if (current && !(current.item && !line.trim())) {
      current.text += `\n${line}`;
    }
  }
  for (const unit of result) unit.text = unit.text.replace(/\s+$/, "");
  return result;
}

/** The units as a file: the lines of a list one after the other, a blank line between parts. */
function render(list: Unit[]): string {
  return list.map((u, i) => (i === 0 ? "" : u.item && list[i - 1]!.part === u.part ? "\n" : "\n\n") + u.text).join("") + "\n";
}

const body = (unit: Unit) => unit.text.split("\n").slice(1).join("\n").trim();
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const bare = (s: string) => flat(s).replace(/^(["'`])(.*)\1$/, "$2");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** CSS comments blanked out, so every offset still points where it did. */
const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

/** Whether the code declares `name` with exactly this value: `--name: value;` in a style sheet, `name: value` or `"name": value` elsewhere. */
function declares(text: string, name: string, value: string, style: boolean): boolean {
  const code = style ? uncommented(text) : text;
  const declaration = new RegExp(`(?<![\\w-])(["']?)${escape(name)}\\1\\s*[:=]\\s*(${style ? "[^;{}]*" : "[^;{}\\n]*"})`, "g");
  const want = bare(value);
  for (const found of code.matchAll(declaration)) {
    if (bare(found[2]!.replace(/,\s*$/, "").replace(/\s*!important\s*$/i, "")) === want) return true;
  }
  return false;
}

const outside = (path: string) => isAbsolute(path) || posix.normalize(path).startsWith("../") || posix.normalize(path) === "..";

/** What is wrong with one token or component line, given the code. */
function itemProblems(item: Unit, read: (path: string) => string | null): string[] {
  const line = item.text.split("\n")[0]!.slice(2).trim();
  const found = item.text.match(ITEM);
  const file = found?.[2] ?? (item.part === "Components" ? found?.[1] : undefined);
  if (item.part === "Tokens") {
    const token = found?.[2] ? found[1]!.match(TOKEN) : null;
    if (!token) return [`"${line}" does not name a token, its value and its file, as \`--name: value\` in \`file\``];
  } else if (!found) return [`"${line}" does not name a component and its file, as \`.class\` in \`file\`, \`Name\` in \`file\`, or \`file\``];
  if (outside(file!)) return [`\`${file}\` is outside the project: name a file of the project, from its root`];
  const text = read(file!);
  if (text === null) return [`${file} does not exist`];
  const style = STYLE.test(file!);
  if (item.part === "Tokens") {
    const [, , name, value] = found![1]!.match(TOKEN)!;
    return declares(text, name!, value!, style) ? [] : [`\`${found![1]}\` is not in ${file}`];
  }
  if (!found![2]) return [];
  const name = found![1]!;
  if (name.startsWith(".")) {
    const used = style ? new RegExp(`${escape(name)}(?![\\w-])`).test(uncommented(text)) : new RegExp(`(?<![\\w-])${escape(name.slice(1))}(?![\\w-])`).test(text);
    return used ? [] : [`\`${name}\` is not a class of ${file}`];
  }
  return new RegExp(`(?<![\\w-])${escape(name)}(?![\\w-])`).test(text) ? [] : [`\`${name}\` is not in ${file}`];
}

/** An image in words: a Markdown image, an HTML one, a link to an image file, or one written inline. */
const IMAGE = /!\[[^\]]*\]\([^)]*\)|<(?:img|svg|picture|video|canvas)\b[^>]*>?|data:image\/[\w+.-]+|\]\([^)\s]+\.(?:png|jpe?g|gif|webp|avif|svg|bmp|tiff?)(?:\s[^)]*)?\)/i;

/**
 * What is wrong with a standard, one sentence each; empty when it can be
 * written. `read` gives a file of the project by its path from the root, or
 * null when there is none: every token, value and component must be in it.
 */
export function standardProblems(text: string, read: (path: string) => string | null): string[] {
  const all = units(text);
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const unit of all) {
    if (seen.has(unit.key)) problems.push(`${unit.item ? unit.label : `"${unit.label}"`} appears more than once`);
    seen.add(unit.key);
  }
  for (const name of STANDARD_PARTS) {
    const part = all.find((u) => !u.item && u.part === name);
    if (!part) {
      problems.push(`missing "${name}"`);
      continue;
    }
    if (/^\s*<[^>\n]+>\s*$/m.test(body(part)) || Object.values(TO_WRITE).some((p) => body(part).includes(p))) problems.push(`"${name}" still holds a placeholder: write it`);
    else if (!body(part) && !all.some((u) => u.item && u.part === name)) problems.push(`"${name}" is empty`);
  }
  for (const item of all.filter((u) => u.item)) problems.push(...itemProblems(item, read));
  const image = text.match(IMAGE);
  if (image) problems.push(`the standard is words only, with no image and no capture: take out ${image[0]}`);
  return problems;
}

export interface StandardFile {
  /** From the project's root. */
  path: string;
  text: string;
}

/** Every custom property a style sheet declares, with the rules around it and the comment that ends its line. */
function tokensOf(file: StandardFile): string[] {
  const code = uncommented(file.text);
  const lines: string[] = [];
  const blocks: string[] = [];
  let start = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'") {
      i = code.indexOf(c, i + 1);
      if (i === -1) break;
    } else if (c === "{") {
      blocks.push(flat(code.slice(start, i)));
      start = i + 1;
    } else if (c === ";" || c === "}") {
      const declaration = code.slice(start, i).match(/^\s*(--[\w-]+)\s*:([\s\S]*)$/);
      if (declaration) {
        const around = blocks.filter((b) => b !== ":root" && b !== "html").join(" ");
        const end = file.text.indexOf("\n", i);
        const note = file.text.slice(i + 1, end === -1 ? undefined : end).match(/^[\s;]*\/\*\s*(.*?)\s*\*\//)?.[1];
        lines.push(`- \`${declaration[1]}: ${flat(declaration[2]!)}\` in \`${file.path}\`${around ? `, under \`${around}\`` : ""}${note ? `: ${note}` : ""}`);
      }
      if (c === "}") blocks.pop();
      start = i + 1;
    }
  }
  return lines;
}

/** Every class a style sheet's selectors name. */
function classesOf(file: StandardFile): string[] {
  const code = uncommented(file.text).replace(/(["'])(?:(?!\1)[^\\]|\\.)*\1/g, '""');
  const classes = new Set<string>();
  for (const [, selector] of code.matchAll(/(?:^|(?<=[;{}]))\s*([^;{}@\s][^;{}]*)\{/g)) {
    for (const [name] of selector!.replace(/\[[^\]]*\]/g, "").matchAll(/\.-?[_a-zA-Z][\w-]*/g)) classes.add(name);
  }
  return [...classes].map((name) => `- \`${name}\` in \`${file.path}\``);
}

/**
 * A first standard from the shared files of the front: every custom property
 * and every class of the style sheets, and every other file as a component of
 * its own, each with its file. The direction is the knockout's champion with
 * the sentence that drew it from the product, when the run had one; the rest
 * of the direction and the rules are left for AEOM to write.
 */
export function draftStandard(files: StandardFile[], { name, direction }: { name?: string; direction?: { champion: string; sentence: string | null } | null } = {}): string {
  // A token set twice under the same rule keeps the value that wins, the last one, where the first one stood.
  const once = (part: string, lines: string[]) => {
    const last = new Map(lines.map((line) => [item(part, line).key, line]));
    return [...new Set(lines.map((line) => item(part, line).key))].map((key) => last.get(key)!);
  };
  const tokens = once("Tokens", files.filter((f) => STYLE.test(f.path)).flatMap(tokensOf));
  const components = once("Components", files.flatMap((f) => (STYLE.test(f.path) ? classesOf(f) : [`- \`${f.path}\``])));
  return render(
    units(`# The standard of ${name || "the front"}
What the front holds to from now on: its direction, its tokens and its kit, each where it lives in the code, and its own rules.

## Direction
${direction ? `${direction.champion}: ${direction.sentence ?? TO_WRITE.source}` : TO_WRITE.direction}

## Tokens
${tokens.join("\n") || TO_WRITE.tokens}

## Components
${components.join("\n") || TO_WRITE.components}

## Rules
${TO_WRITE.rules}
`),
  );
}

export interface StandardMerge {
  text: string;
  /** Kept as the user wrote it, though AEOM proposed something else or nothing. */
  kept: string[];
  /** Replaced by what AEOM found, since the user had not touched it. */
  updated: string[];
  /** New in this proposal. */
  added: string[];
  /** AEOM's own, untouched by the user, and no longer in its proposal. */
  removed: string[];
}

/**
 * Merges AEOM's new standard into the one the user may have corrected, part
 * by part and line by line: what the user changed, added or took out stays
 * so, and what they left alone takes AEOM's new words. A new token or
 * component joins the others of its part.
 */
export function mergeStandard({ base, current, proposed }: { base?: string; current?: string; proposed: string }): StandardMerge {
  const next = units(proposed);
  if (current === undefined) return { text: render(next), kept: [], updated: [], added: next.map((u) => u.label), removed: [] };
  const rank = (part: string | null) => (part === null ? -1 : (STANDARD_PARTS as readonly string[]).indexOf(part) + 1 || STANDARD_PARTS.length + 1);
  const { pieces, ...result } = threeWay({
    base: base === undefined ? undefined : units(base),
    current: units(current),
    proposed: next,
    place: (merged, unit) => {
      if (unit.title) return 0;
      const after = merged.findIndex((u) => !u.title && rank(u.part) > rank(unit.part));
      return after === -1 ? merged.length : after;
    },
  });
  return { text: render(pieces), ...result };
}
