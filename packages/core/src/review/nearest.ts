/**
 * The token nearest a value the standard does not hold: a colour by how far it
 * looks from it (in OKLab, its transparency kept apart), a length by its size
 * in pixels.
 */

/** A colour in OKLab, with its opacity from 0 to 1. */
type Lab = [number, number, number, number];

/** sRGB channels, 0 to 1, as OKLab. */
function fromRgb(r: number, g: number, b: number, alpha: number): Lab {
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s, alpha];
}

/** A hue in degrees from 0 to 360, whatever its unit (`deg`, `turn`, `rad`, `grad`) and its sign. */
function hue(part: string): number {
  const n = parseFloat(part);
  const deg = part.endsWith("turn") ? n * 360 : part.endsWith("grad") ? n * 0.9 : part.endsWith("rad") ? (n * 180) / Math.PI : n;
  return ((deg % 360) + 360) % 360;
}

/** Hue, saturation and lightness, the last two from 0 to 1, as sRGB channels. */
function hslRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

/** A channel as a number: `50%` of `whole`, or the number itself. */
const channel = (part: string, whole: number) => (part.endsWith("%") ? (parseFloat(part) / 100) * whole : parseFloat(part));

/** A colour as code writes it, in OKLab with its opacity; null for one it cannot read, such as `color(display-p3 …)`. */
export function oklab(value: string): Lab | null {
  const v = value.trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    const byte = (at: number) => parseInt(full.slice(at, at + 2), 16) / 255;
    return fromRgb(byte(0), byte(2), byte(4), full.length === 8 ? byte(6) : 1);
  }
  // HSL channels on their own, as shadcn writes its tokens: `222 47% 11%`.
  const call = v.match(/^([a-z]+)\((.*)\)$/) ?? (/^-?[\d.]+(?:deg|turn|rad|grad)?\s+[\d.]+%\s+[\d.]+%/.test(v) ? ["", "hsl", v] : null);
  if (!call) return null;
  const parts = call[2]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.slice(0, 3).some((p) => Number.isNaN(parseFloat(p)))) return null;
  const [x, y, z] = parts as [string, string, string];
  const alpha = parts[3] === undefined ? 1 : Number.isNaN(parseFloat(parts[3])) ? null : Math.min(1, channel(parts[3], 1));
  if (alpha === null) return null;
  switch (call[1]) {
    case "rgb":
    case "rgba":
      return fromRgb(channel(x, 255) / 255, channel(y, 255) / 255, channel(z, 255) / 255, alpha);
    case "hsl":
    case "hsla":
      // Saturation and lightness are percentages, written with their sign or not.
      return fromRgb(...hslRgb(hue(x), parseFloat(y) / 100, parseFloat(z) / 100), alpha);
    case "oklab":
      return [channel(x, 1), channel(y, 0.4), channel(z, 0.4), alpha];
    case "oklch": {
      const [c, h] = [channel(y, 0.4), (hue(z) * Math.PI) / 180];
      return [channel(x, 1), c * Math.cos(h), c * Math.sin(h), alpha];
    }
    default:
      return null;
  }
}

/** Below this, two colours are one, written two ways. */
export const SAME_COLOUR = 0.002;

/**
 * The colour token that looks nearest `value`, and how far it is; null when
 * none can be read. Only a token as transparent as the value counts: an
 * opaque one is no answer for a shadow's `rgba(0,0,0,0.1)`.
 */
export function nearestColour<T extends { value: string }>(value: string, tokens: T[]): { token: T; distance: number } | null {
  const at = oklab(value);
  if (!at) return null;
  let best: { token: T; distance: number } | null = null;
  for (const token of tokens) {
    const there = oklab(token.value);
    if (!there || Math.abs(there[3] - at[3]) > 0.05) continue;
    const distance = Math.hypot(at[0] - there[0], at[1] - there[1], at[2] - there[2]);
    if (!best || distance < best.distance) best = { token, distance };
  }
  return best;
}

/** The length token nearest `px` pixels, and how far it is, the first one on a tie. */
export function nearestLength<T extends { px: number }>(px: number, tokens: T[]): { token: T; distance: number } | null {
  let best: { token: T; distance: number } | null = null;
  for (const token of tokens) {
    const distance = Math.abs(token.px - px);
    if (!best || distance < best.distance) best = { token, distance };
  }
  return best;
}

/** A length in pixels: `rem` and `em` at 16 pixels; null for anything else. */
export function pixels(value: string): number | null {
  const m = value.trim().match(/^(-?[\d.]+)(px|rem|em)$/);
  return m ? parseFloat(m[1]!) * (m[2] === "px" ? 1 : 16) : null;
}

/**
 * A token's length in pixels, through the other tokens: `var(--radius)`, or
 * `calc(var(--radius) - 4px)` as shadcn writes its radii; null when it is not
 * a length.
 */
export function tokenPixels(value: string, tokens: { name: string; value: string }[], depth = 0): number | null {
  const direct = pixels(value);
  if (direct !== null || depth > 4) return direct;
  const v = value.trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (ref) {
    const token = tokens.find((t) => t.name === ref);
    return token ? tokenPixels(token.value, tokens, depth + 1) : null;
  }
  const sum = v.match(/^calc\(\s*var\((--[\w-]+)\)\s*([+-])\s*(-?[\d.]+(?:px|rem|em))\s*\)$/);
  if (sum) {
    const token = tokens.find((t) => t.name === sum[1]);
    const base = token ? tokenPixels(token.value, tokens, depth + 1) : null;
    const step = pixels(sum[3]!);
    return base === null || step === null ? null : sum[2] === "+" ? base + step : base - step;
  }
  return null;
}
