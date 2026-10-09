import type { PageIdentity } from "../capture/identity.js";

const hsl = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s };
};

/**
 * Whether `colour` is a shade of `of`: the same hue, lighter or darker, as a
 * contrast fix makes it, or one grey for another.
 */
export function isShadeOf(colour: string, of: string): boolean {
  const a = hsl(colour), b = hsl(of);
  const grey = (c: { s: number }) => c.s < 0.06;
  if (grey(a) || grey(b)) return grey(a) && grey(b);
  const gap = Math.abs(a.h - b.h);
  return Math.min(gap, 360 - gap) <= 15;
}

export interface IdentityComparison {
  /** What changed the style, page by page: a font, a colour the app did not have, a gradient gone, a logo changed. */
  changed: string[];
  /** Colours the app did not have that are shades of one it had, such as a contrast fix: kept, and said. */
  shades: string[];
}

type Page = { path: string; identity: PageIdentity };

/**
 * Compares the identity of the same app before and after: its style is kept
 * when no font is added, no gradient goes, no logo changes, and every colour
 * is one the app had somewhere, or a shade of one.
 */
export function compareIdentity(before: Page[], after: Page[]): IdentityComparison {
  const had = (key: "fonts" | "palette" | "gradients") => new Set(before.flatMap((p) => p.identity[key]));
  const fonts = had("fonts"), palette = had("palette"), gradients = had("gradients");
  const changed: string[] = [];
  const shades = new Map<string, string>();
  for (const page of after) {
    const old = before.find((p) => p.path === page.path)?.identity;
    for (const font of page.identity.fonts) if (!fonts.has(font)) changed.push(`${page.path}: a font the app did not use, ${font}`);
    for (const gradient of old?.gradients ?? []) if (!page.identity.gradients.includes(gradient)) changed.push(`${page.path}: the gradient ${gradient} is gone`);
    for (const gradient of page.identity.gradients) if (!gradients.has(gradient)) changed.push(`${page.path}: a gradient the app did not have, ${gradient}`);
    if (old?.logo && page.identity.logo !== old.logo) changed.push(`${page.path}: the logo reads ${page.identity.logo ?? "nothing"}, not ${old.logo}`);
    for (const colour of page.identity.palette) {
      if (palette.has(colour) || shades.has(colour)) continue;
      // The shade is taken from the same page first, where a contrast fix changes the colour it replaces.
      const source = [...(old?.palette ?? []), ...palette].find((c) => isShadeOf(colour, c));
      if (source) shades.set(colour, source);
      else changed.push(`${page.path}: a colour the app did not have, ${colour}`);
    }
  }
  return { changed, shades: [...shades].map(([colour, from]) => `${colour} (from ${from})`) };
}
