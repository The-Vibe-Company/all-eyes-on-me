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
/** A value as the code writes it, without the quotes a config file puts around it. */
const unquoted = (value: string) => value.trim().replace(/^(["'`])(.*)\1$/, "$2");

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
      if (token) standard.tokens.push({ name: token[2]!, value: unquoted(token[3]!), file: item[2] });
    } else if (part === "Components") {
      standard.components.push(item[2] ? { name: item[1]!, file: item[2] } : { name: null, file: item[1]! });
    }
  }
  return standard;
}

/** The front's own source: what a page is made of, never the standard, the docs, the tests, the stories or a config. */
const SOURCE = /\.(css|scss|sass|less|html?|tsx|jsx|ts|js|mjs|vue|svelte|astro)$/i;
const NOT_SOURCE = /(^|\/)(\.aeom|node_modules|dist|build|\.next|out|coverage|__tests__|__snapshots__|e2e)\/|\.(test|spec|stories|story|snap|d)\.[a-z]+$|\.config\.[a-z]+$/i;
export const reviewable = (file: string) => SOURCE.test(file) && !NOT_SOURCE.test(file);

/** The lines a unified diff adds, each with its file and its number in the new file. */
function addedLines(diff: string): { file: string; line: number; text: string }[] {
  const added: { file: string; line: number; text: string }[] = [];
  let file = "";
  let at = 0;
  let header = false;
  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("diff --git ")) {
      header = true;
      continue;
    }
    if (header && line.startsWith("+++ ")) {
      file = line.slice(4).replace(/^b\//, "").trim();
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      header = false;
      at = Number(hunk[1]);
      continue;
    }
    if (header) continue;
    if (line.startsWith("+")) added.push({ file, line: at++, text: line.slice(1) });
    else if (line.startsWith(" ")) at++;
  }
  return added.filter((a) => a.file && a.file !== "/dev/null");
}

/** A line with its comments blanked, so a colour in a comment is never read. */
const uncommented = (text: string) =>
  text
    .replace(/\/\*.*?\*\//g, (c) => " ".repeat(c.length))
    .replace(/<!--.*?-->/g, (c) => " ".repeat(c.length))
    .replace(/(^|[^:"'`\w])\/\/.*$/, (c, lead: string) => lead + " ".repeat(c.length - lead.length));

const COLOUR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\([^()]{0,80}\)/gi;
const CHANNELS = /^[\d.]+(?:deg)?\s+[\d.]+%\s+[\d.]+%(?:\s*\/\s*[\d.]+%?)?$/;
/** A colour as one key: lowercase, `#abc` as `#aabbcc`, a function's channels without separators, HSL channels as HSL. */
const colourKey = (value: string) => {
  let v = value.trim().toLowerCase();
  if (CHANNELS.test(v)) v = `hsl(${v})`;
  v = v.replace(/[\s,/]+/g, "");
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/);
  return short ? `#${short.slice(1).filter(Boolean).map((c) => c! + c!).join("")}` : v.replace(/^(rgb|hsl)a\(/, "$1(");
};
const isColour = (value: string) => CHANNELS.test(value.trim()) || new RegExp(`^(?:${COLOUR.source})$`, "i").test(value.trim());
/** The properties whose value is a colour of the page; an icon's fill and stroke are its drawing's. */
const COLOUR_PROPERTY = /color|background|border|shadow|outline|caret|accent|decoration|column-?rule/i;
const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|inherit|initial|unset|emoji|math)$/i;
const families = (value: string) => value.split(",").map((f) => f.trim().replace(/^["'`]|["'`]$/g, "")).filter(Boolean);
const LENGTH = /^-?[\d.]+(px|rem|em)$/;
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The ranges of a line inside `var(...)`: a colour there is a token's fallback. */
function varRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of text.matchAll(/var\(/g)) {
    let depth = 0;
    for (let i = m.index! + 3; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) {
        ranges.push([m.index!, i]);
        break;
      }
    }
  }
  return ranges;
}

/** The part of the kit each tag stands for, by its exact names: a CardHeader is no header, a DropdownMenu no navigation. */
const KINDS = [
  { kind: "button", tag: /<button\b/, part: /^(button|btn|bouton)([-_].*)?$|^(?:[A-Z]\w*)?Button$/ },
  { kind: "field", tag: /<input\b(?![^>]*type=["']?(?:hidden|submit|button|reset|checkbox|radio|image|file|range|color)\b)/, part: /^(input|text-?input|text-?field|form-?field|field|champ)([-_].*)?$|^(Input|TextField|TextInput|FormField)$/ },
  { kind: "select", tag: /<select\b/, part: /^(select|combobox)([-_].*)?$|^(Select|Combobox)$/ },
  { kind: "text area", tag: /<textarea\b/, part: /^(textarea|text-?area)([-_].*)?$|^(Textarea|TextArea)$/ },
  { kind: "header", tag: /<header\b/, part: /^(header|site-?header|app-?header|page-?header|masthead|top-?bar|en-?tete|navbar)$|^(Header|SiteHeader|AppHeader|Masthead|TopBar|Navbar)$/ },
  { kind: "navigation", tag: /<nav\b/, part: /^(nav|navbar|navigation|site-?nav|main-?nav)$|^(Nav|Navbar|Navigation|SiteNav|MainNav)$/ },
];
/** What a component is called: its class or its name, or, for a file of its own, the file's name (its folder's for an index). */
const partName = (c: { name: string | null; file: string }) => {
  if (c.name) return c.name.replace(/^\./, "");
  const parts = c.file.split("/");
  const base = parts.at(-1)!.replace(/\.[^.]+$/, "");
  return base === "index" && parts.length > 1 ? parts.at(-2)! : base;
};
/** Inside an article, a section, a card: a header or a nav there is its block's, not the site's. */
const CONTAINERS = ["article", "section", "aside", "li", "dialog", "details", "figure", "blockquote", "form", "table"];
function nested(content: string, line: number): boolean {
  const before = content.split("\n").slice(0, line - 1).join("\n");
  return CONTAINERS.some((tag) => (before.match(new RegExp(`<${tag}\\b`, "g"))?.length ?? 0) > (before.match(new RegExp(`</${tag}>`, "g"))?.length ?? 0));
}

/**
 * How a pull request's added lines leave the standard, line by line, in the
 * front's own source only: a colour, a font, a size, a space or a radius
 * written in hard outside the tokens (or a token's value written in hard
 * instead of the token), and a button, a field, a header or a navigation made
 * by hand while the kit has that very part. The kit's own files, a comment, a
 * token's fallback, an icon's fill, an anchor or a link are never read as a
 * deviation; a change of the standard itself is another review's to tell.
 * `read` gives a file as the branch holds it, to tell a header inside an
 * article from the site's.
 */
export function reviewCode({ standard, diff, read }: { standard: ReviewStandard; diff: string; read?: (file: string) => string | null }): CodeDeviation[] {
  const tokenFiles = new Set(standard.tokens.map((t) => t.file));
  const colours = standard.tokens.filter((t) => isColour(t.value));
  const fontTokens = standard.tokens.filter((t) => !LENGTH.test(t.value) && !/^[\d.]+$/.test(t.value) && (/["']/.test(t.value) || families(t.value).some((f) => GENERIC.test(f)) || /font-family|famil|police|typeface/i.test(t.name)));
  const fontNames = new Map<string, string>();
  for (const t of fontTokens) for (const f of families(t.value)) if (!GENERIC.test(f)) fontNames.set(f.toLowerCase(), t.name);
  const lengths = standard.tokens.filter((t) => LENGTH.test(t.value));
  const sizes = lengths.filter((t) => /size|taille|titre|title|fs-|^--text-/i.test(t.name) && !/weight|line|leading|radius|space|gap/i.test(t.name));
  const spaces = lengths.filter((t) => /space|espace|gap|gutter|gout+i|spacing|marge|margin|pad|inset|^--s-?\d|^--sp-/i.test(t.name));
  const radii = lengths.filter((t) => /radius|rayon|arrondi|round/i.test(t.name));
  const added = addedLines(diff).filter((a) => reviewable(a.file));
  const found: CodeDeviation[] = [];
  const contents = new Map<string, string | null>();
  const contentOf = (file: string) => {
    if (!contents.has(file)) contents.set(file, read?.(file) ?? null);
    return contents.get(file)!;
  };
  for (let i = 0; i < added.length; i++) {
    const { file, line } = added[i]!;
    const text = uncommented(added[i]!.text);
    const say = (what: string) => found.push({ file, line, what });
    // The files of the tokens are the kit's own: what they declare is the standard, not a deviation from it.
    if (!tokenFiles.has(file)) {
      const fallbacks = varRanges(text);
      const inVar = (at: number) => fallbacks.some(([a, b]) => at > a && at < b);
      const valueAt = (tokens: typeof lengths, value: string, what: string) => {
        const token = tokens.find((t) => t.value === value);
        say(token ? `the ${what} ${value} is ${token.name} written in hard: use the token` : `the ${what} ${value} is not a ${what} of the standard`);
      };
      if (colours.length) {
        for (const m of text.matchAll(COLOUR)) {
          if (inVar(m.index!)) continue;
          const before = text.slice(0, m.index);
          // A Tailwind value in brackets, or the value of a property that colours the page.
          const property = before.match(/-\[$/) ? "color" : before.match(/([a-zA-Z][\w-]*)\s*:\s*[^:;{}]*$/)?.[1];
          if (!property || !COLOUR_PROPERTY.test(property)) continue;
          const token = colours.find((t) => colourKey(t.value) === colourKey(m[0]));
          say(token ? `${m[0]} is ${token.name} written in hard: use the token` : `${m[0]} is not a colour of the standard`);
        }
      }
      if (fontNames.size) {
        const declared = [...text.matchAll(/font-family\s*:\s*([^;}\n]+)/g)].map((m) => m[1]!).concat([...text.matchAll(/fontFamily\s*:\s*(["'`])([^"'`]+)\1/g)].map((m) => m[2]!));
        for (const value of declared) {
          if (/var\(/.test(value)) continue;
          const first = families(value.replace(/["'`]?\s*[,}]?\s*$/, ""))[0];
          if (!first || GENERIC.test(first)) continue;
          const token = fontNames.get(first.toLowerCase());
          say(token ? `the font ${first} is ${token} written in hard: use the token` : `the font ${first} is not a font of the standard`);
        }
      }
      // A length written in hard: CSS (`font-size: 18px`), or JSX (`fontSize: 18` is in pixels).
      const lengthsOf = (property: RegExp) => {
        const values: string[] = [];
        for (const m of text.matchAll(new RegExp(`(?<![\\w-])(${property.source})\\s*:\\s*["'\`]?([^;}"'\`\\n,]+)`, "g"))) {
          if (/var\(|calc\(/.test(m[2]!)) continue;
          const camel = !m[1]!.includes("-");
          for (const raw of m[2]!.trim().split(/\s+/)) {
            const value = camel && /^\d+(\.\d+)?$/.test(raw) ? `${raw}px` : raw;
            // Not a length, nothing, a hairline or a negative offset: none is a step of the scale.
            if (!LENGTH.test(value) || value.startsWith("-") || parseFloat(value) <= 2) continue;
            values.push(value);
          }
        }
        return values;
      };
      if (sizes.length) for (const value of lengthsOf(/font-size|fontSize/)) valueAt(sizes, value, "size");
      if (spaces.length) for (const value of lengthsOf(/(?:margin|padding|gap|row-gap|column-gap|rowGap|columnGap|inset)(?:-?[a-zA-Z]+)*/)) valueAt(spaces, value, "space");
      if (radii.length) for (const value of lengthsOf(/border-radius|borderRadius|border-(?:top|bottom)-(?:left|right)-radius/)) valueAt(radii, value, "radius");
    }
    for (const { kind, tag, part } of KINDS) {
      const at = text.search(tag);
      if (at === -1) continue;
      const kit = standard.components.filter((c) => part.test(partName(c)));
      if (!kit.length) continue;
      // The kit's own folder makes these parts by hand: that is where they live.
      const own = kit.some((c) => {
        const dir = c.file.includes("/") ? c.file.slice(0, c.file.lastIndexOf("/")) : "";
        // A folder of the kit's own, such as src/ui: a folder of pages that also holds the kit's style sheet is not one.
        return c.file === file || (/(^|\/)(ui|kit|components\/ui|design-system|primitives)$/.test(dir) && file.startsWith(`${dir}/`));
      });
      if (own) continue;
      if ((kind === "header" || kind === "navigation") && contentOf(file) !== null && nested(contentOf(file)!, line)) continue;
      // Built with the kit: one of its classes in the opening tag, which may run over the next lines.
      let tagText = text.slice(at);
      for (let j = i + 1; !/^[^"'`]*(?:(["'`])[^"'`]*\1[^"'`]*)*>/.test(tagText) && j < added.length && added[j]!.file === file && added[j]!.line === added[j - 1]!.line + 1 && j < i + 12; j++) tagText += `\n${added[j]!.text}`;
      const classes = kit.map((c) => c.name).filter((n): n is string => !!n && n.startsWith(".")).map((n) => n.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (classes.some((c) => new RegExp(`(^|[\\s"'\`{(,])${c}($|[\\s"'\`}),])`).test(tagText))) continue;
      const use = kit[0]!;
      say(`a ${kind} made by hand: the standard's is ${use.name ? `${use.name} in ${use.file}` : use.file}`);
    }
  }
  return found;
}

/** A change of the back, the data, the docs or the tooling: no screen. */
const NO_SCREEN = /(^|\/)(api|server|backend|\.aeom)(\/|$)|(^|\/)(route|middleware|actions?|sitemap|robots|manifest|instrumentation|db)\.(ts|js|mjs)$|\.server\.[a-z]+$|(^|\/)lib\/(db|prisma|server)|\.(test|spec|stories|story|snap|d)\.[a-z]+$|(^|\/)(404|500|_error)\.(tsx|jsx|ts|js)$|(^|\/)not-found\./i;
/** A file every screen reads: the app's shell, its theme, its styles. */
const EVERY_SCREEN = /(^|\/)(_app|_document)\.(tsx|jsx|ts|js)$|(^|\/)(tailwind|postcss)\.config\.|(^|\/)theme\.(ts|js|mjs)$/i;
const FRONT_FILE = /\.(css|scss|sass|less|tsx|jsx|vue|svelte|astro|mdx)$/i;
const FRONT_SCRIPT = /(^|\/)(components|ui|styles|front|kit|shared|theme)\/.*\.(ts|js|mjs)$/i;

/** The route of a file that is a page, by the conventions of the usual stacks, or the prefix of the screens a layout wraps. */
function routeOf(file: string): { route: string; layout?: boolean } | null {
  const segments = (path: string) => path.split("/").filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith("@")).map((s) => s.replace(/^\[\[?\.{0,3}(.+?)\]?\]$/, ":$1"));
  const join = (parts: string[]) => `/${parts.join("/")}`.replace(/\/index$/, "/").replace(/(.)\/+$/, "$1");
  let m = file.match(/(?:^|\/)app\/(?:(.*)\/)?(page|layout|template|loading|error|default)\.(?:tsx|jsx|ts|js|mdx)$/);
  if (m) return { route: join(segments(m[1] ?? "")), ...(m[2] !== "page" ? { layout: true } : {}) };
  m = file.match(/(?:^|\/)src\/routes\/(?:(.*)\/)?\+(page|layout)\.svelte$/);
  if (m) return { route: join(segments(m[1] ?? "")), ...(m[2] === "layout" ? { layout: true } : {}) };
  m = file.match(/(?:^|\/)pages\/(.+)\.(?:tsx|jsx|ts|js|vue|astro|md|mdx)$/);
  if (m && !/^(api\/|_)/.test(m[1]!)) return { route: join(segments(m[1]!)) };
  return null;
}

/**
 * The screens a pull request touches, from the files it changed (deleted ones
 * left out by the caller): a page by its route, a layout the screens under it,
 * anything else of the front (a component, the styles, the theme, the shell)
 * every screen, and the back, the data, the docs or a test none. A route with a
 * parameter is measured on a route of its shape the project knows, and said
 * unmeasured when it knows none. An HTML file is a page only inside the folder
 * of pages given; elsewhere it is a template or a partial, read by every screen.
 */
export function screensTouched(files: string[], known: string[], { samples = {}, folder }: { samples?: Record<string, string>; folder?: string } = {}): { routes: string[]; all: boolean; unmeasured: string[]; patterns: string[] } {
  const routes: string[] = [];
  const unmeasured: string[] = [];
  // Every route touched as a pattern (`/blog/:slug`, a layout's `/compte/*`): what a journey crossing it may visit.
  const patterns: string[] = [];
  let all = false;
  const add = (route: string) => {
    if (!patterns.includes(route)) patterns.push(route);
    if (!route.includes(":")) return void (routes.includes(route) || routes.push(route));
    const shape = new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[^/]+/g, "[^/]+")}$`);
    const sample = samples[route] ?? known.find((r) => shape.test(r) || pageShape(r) === pageShape(route));
    if (sample) {
      if (!routes.includes(sample)) routes.push(sample);
    } else if (!unmeasured.includes(route)) unmeasured.push(route);
  };
  const root = folder?.replace(/\/+$/, "");
  for (const file of files) {
    if (root && file.startsWith(`${root}/`) && /\.html?$/i.test(file)) {
      const inside = file.slice(root.length + 1);
      add(/(^|\/)index\.html?$/i.test(inside) ? `/${inside.replace(/index\.html?$/i, "")}` : `/${inside}`);
      continue;
    }
    if (NO_SCREEN.test(file)) continue;
    if (EVERY_SCREEN.test(file)) {
      all = true;
      continue;
    }
    const page = routeOf(file);
    if (page?.layout) {
      if (page.route === "/") all = true;
      else {
        patterns.push(`${page.route}/*`, page.route);
        for (const r of known.filter((k) => k === page.route || k.startsWith(`${page.route}/`))) add(r);
      }
      continue;
    }
    if (page) {
      add(page.route);
      continue;
    }
    if (FRONT_FILE.test(file) || FRONT_SCRIPT.test(file) || /\.html?$/i.test(file)) all = true;
  }
  return all ? { routes: known, all: true, unmeasured: [], patterns: [] } : { routes, all: false, unmeasured, patterns };
}

/** True when a path a journey visits (its query dropped) is one of the routes touched, by their patterns. */
export function routeTouched(path: string, touched: { all: boolean; patterns: string[] }): boolean {
  if (touched.all) return true;
  const bare = path.replace(/[?#].*$/, "").replace(/(.)\/+$/, "$1") || "/";
  return touched.patterns.some((p) => {
    if (p.endsWith("/*")) return bare.startsWith(p.slice(0, -1));
    const shape = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:[^/]+/g, "[^/]+")}$`);
    return shape.test(bare) || pageShape(bare) === pageShape(p);
  });
}
