import { pageShape } from "../capture/shape.js";

/** What `.aeom/standard.md` holds that a review can measure: its tokens and its components, each where it lives. */
export interface ReviewStandard {
  tokens: { name: string; value: string; file: string }[];
  /** A component by its class or its name in a file, or a file that is a component of its own (`name` null). */
  components: { name: string | null; file: string }[];
}

/** One way a pull request's code leaves the standard, where it shows. */
export interface CodeDeviation {
  file: string;
  line: number;
  what: string;
}

const ITEM = /^[-*] `([^`\n]+)`(?: in `([^`\n]+)`)?/;
const TOKEN = /^(["']?)([^"':\s]+)\1\s*:\s*(.+)$/;

/** Reads the tokens and the components of a standard, as `aeom standard` writes them. */
export function readStandard(text: string): ReviewStandard {
  const standard: ReviewStandard = { tokens: [], components: [] };
  let part = "";
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const heading = line.match(/^## (.+?)\s*$/);
    if (heading) {
      part = heading[1]!;
      continue;
    }
    const item = line.match(ITEM);
    if (!item) continue;
    if (part === "Tokens" && item[2]) {
      const token = item[1]!.match(TOKEN);
      if (token) standard.tokens.push({ name: token[2]!, value: token[3]!.trim(), file: item[2] });
    } else if (part === "Components") {
      standard.components.push(item[2] ? { name: item[1]!, file: item[2] } : { name: null, file: item[1]! });
    }
  }
  return standard;
}

/** The lines a unified diff adds, each with its file and its number in the new file. */
function addedLines(diff: string): { file: string; line: number; text: string }[] {
  const added: { file: string; line: number; text: string }[] = [];
  let file = "";
  let at = 0;
  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.slice(4).replace(/^b\//, "").trim();
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      at = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) added.push({ file, line: at++, text: line.slice(1) });
    else if (line.startsWith(" ")) at++;
  }
  return added.filter((a) => a.file && a.file !== "/dev/null");
}

const COLOUR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?)\([^)]*\)/gi;
/** A colour as one writing: lowercase, `#abc` as `#aabbcc`, spaces out of a function. */
const colour = (value: string) => {
  const v = value.trim().toLowerCase().replace(/\s+/g, "");
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/);
  return short ? `#${short.slice(1).filter(Boolean).map((c) => c! + c!).join("")}` : v;
};
const isColour = (value: string) => new RegExp(`^(?:${COLOUR.source})$`, "i").test(value.trim());
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|inherit|initial|unset|emoji|math)$/i;
const families = (value: string) => value.split(",").map((f) => f.trim().replace(/^["'`]|["'`]$/g, "")).filter(Boolean);
const LENGTH = /^-?[\d.]+(px|rem|em)$/;

/** The kinds of component a page often makes by hand, the tags that make one, and the names a kit gives it. */
const KINDS = [
  { kind: "button", tag: /<button\b/, name: /button|btn|bouton/i },
  { kind: "field", tag: /<(?:input(?![^>]*type=["']?(?:hidden|submit|button|reset|checkbox|radio))|select|textarea)\b/, name: /input|field|champ/i },
  { kind: "header", tag: /<header\b/, name: /header|en-?t[eê]te|masthead|topbar/i },
  { kind: "navigation", tag: /<nav\b/, name: /\bnav|menu/i },
];

/**
 * How a pull request's added lines leave the standard, line by line: a colour,
 * a font, a size or a space written in hard outside the tokens (or a token's
 * value written in hard instead of the token), and a button, a field, a header
 * or a navigation made by hand while the kit has one. A token's own declaration
 * in a file of the tokens is the kit's, never a deviation; a change of the
 * standard itself is another review's to tell.
 */
export function reviewCode({ standard, diff }: { standard: ReviewStandard; diff: string }): CodeDeviation[] {
  const tokenFiles = new Set(standard.tokens.map((t) => t.file));
  const colours = standard.tokens.filter((t) => isColour(t.value));
  const fonts = standard.tokens.filter((t) => /font|texte|type|police/i.test(t.name) || families(t.value).some((f) => /["']/.test(t.value) || GENERIC.test(f)) && families(t.value).length > 1);
  const fontNames = new Map<string, string>();
  for (const t of fonts) for (const f of families(t.value)) if (!GENERIC.test(f)) fontNames.set(f.toLowerCase(), t.name);
  const sizes = standard.tokens.filter((t) => LENGTH.test(t.value) && /size|taille|titre|title|text|font/i.test(t.name));
  const spaces = standard.tokens.filter((t) => LENGTH.test(t.value) && /space|espace|gap|gutter|goutti|spacing|marge|margin|pad/i.test(t.name));
  const found: CodeDeviation[] = [];
  for (const { file, line, text } of addedLines(diff)) {
    const say = (what: string) => found.push({ file, line, what });
    // A token declared in a file of the tokens is the kit's own.
    if (tokenFiles.has(file) && /^\s*--[\w-]+\s*:/.test(text)) continue;
    if (colours.length) {
      for (const m of text.matchAll(COLOUR)) {
        const before = text.slice(0, m.index);
        if (/(href|to|id|for|xlink:href)\s*=\s*["'{]?\s*["']?$/i.test(before)) continue;
        const token = colours.find((t) => colour(t.value) === colour(m[0]));
        say(token ? `${m[0]} is ${token.name} written in hard: use the token` : `${m[0]} is not a colour of the standard`);
      }
    }
    if (fontNames.size) {
      for (const m of text.matchAll(/(?:font-family|fontFamily)\s*:\s*([^;}\n]+)/g)) {
        if (/var\(/.test(m[1]!)) continue;
        const first = families(m[1]!.replace(/["'`]?\s*[,}]?\s*$/, ""))[0];
        if (!first || GENERIC.test(first)) continue;
        const token = fontNames.get(first.toLowerCase());
        say(token ? `the font ${first} is ${token} written in hard: use the token` : `the font ${first} is not a font of the standard`);
      }
    }
    if (sizes.length) {
      for (const m of text.matchAll(/(?:font-size|fontSize)\s*:\s*["'`]?(-?[\d.]+(?:px|rem|em))/g)) {
        const token = sizes.find((t) => t.value === m[1]);
        say(token ? `the size ${m[1]} is ${token.name} written in hard: use the token` : `the size ${m[1]} is not a size of the standard`);
      }
    }
    if (spaces.length) {
      for (const m of text.matchAll(/\b(?:margin|padding|gap|row-gap|column-gap)(?:-[a-z]+)?\s*:\s*["'`]?([^;}"'`\n]+)/g)) {
        if (/var\(/.test(m[1]!)) continue;
        for (const value of m[1]!.trim().split(/\s+/)) {
          if (!LENGTH.test(value) || parseFloat(value) === 0) continue;
          const token = spaces.find((t) => t.value === value);
          say(token ? `the space ${value} is ${token.name} written in hard: use the token` : `the space ${value} is not a space of the standard`);
        }
      }
    }
    for (const { kind, tag, name } of KINDS) {
      if (!tag.test(text)) continue;
      const kit = standard.components.filter((c) => name.test(c.name ?? "") || name.test(c.file));
      if (!kit.length || kit.some((c) => c.file === file)) continue;
      // Built with the kit: the line wears one of its classes.
      const classes = kit.map((c) => c.name).filter((n): n is string => !!n && n.startsWith(".")).map((n) => n.slice(1));
      if (classes.some((c) => new RegExp(`class(?:Name)?=["'{][^"'}]*\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text))) continue;
      const use = kit[0]!;
      say(`a ${kind} made by hand: the standard's is ${use.name ? `${use.name} in ${use.file}` : use.file}`);
    }
  }
  return found;
}

const FRONT = /\.(css|scss|sass|less|html?|tsx|jsx|vue|svelte|astro|mdx)$/i;
const SCRIPT_IN_FRONT = /(^|\/)(components|ui|app|pages|routes|front|kit|shared|styles)\/.*\.(ts|js|mjs)$/i;
const BACK = /(^|\/)(api|server|backend)(\/|$)|(^|\/)route\.(ts|js)$|(^|\/)(_app|_document)\./i;

/** The route of a file that is a page, from the conventions of the usual stacks; null for any other file. */
function routeOf(file: string): string | null {
  const segments = (path: string) => path.split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@")).map((s) => s.replace(/^\[\.{0,3}(.+?)\]$/, ":$1"));
  const join = (parts: string[]) => `/${parts.join("/")}`.replace(/\/index$/, "/").replace(/\/+$/, "") || "/";
  let m = file.match(/(?:^|\/)app\/(?:(.*)\/)?page\.(?:tsx|jsx|ts|js|mdx)$/);
  if (m) return join(segments(m[1] ?? ""));
  m = file.match(/(?:^|\/)src\/routes\/(?:(.*)\/)?\+page\.svelte$/);
  if (m) return join(segments(m[1] ?? ""));
  m = file.match(/(?:^|\/)pages\/(.+)\.(?:tsx|jsx|ts|js|vue|astro|md|mdx)$/);
  if (m && !/^(api\/|_)/.test(m[1]!)) return join(segments(m[1]!));
  m = file.match(/([^/]+)\.html?$/);
  if (m) return m[1] === "index" ? "/" : `/${m[1]}.html`;
  return null;
}

/**
 * The screens a pull request touches, from the files it changed: a page by its
 * route (a real route of that shape among `known` when there is one), any other
 * file of the front (a component, a style, the kit) every screen, and a change
 * of the back, the docs or the data no screen.
 */
export function screensTouched(files: string[], known: string[]): { routes: string[]; all: boolean } {
  const routes: string[] = [];
  let all = false;
  for (const file of files) {
    if (BACK.test(file) || !(FRONT.test(file) || SCRIPT_IN_FRONT.test(file))) continue;
    const route = routeOf(file);
    if (route === null) {
      all = true;
      continue;
    }
    const shaped = known.filter((r) => pageShape(r) === pageShape(route));
    for (const r of shaped.length ? shaped : [route]) if (!routes.includes(r)) routes.push(r);
  }
  return all ? { routes: known, all: true } : { routes, all: false };
}
