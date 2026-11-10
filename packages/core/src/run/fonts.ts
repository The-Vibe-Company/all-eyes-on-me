import { readFileSync } from "node:fs";

/** The faces of the result page, in `assets/fonts` under the SIL Open Font License: the latin subset of each. */
const FACES = [
  { family: "Bricolage Grotesque", file: "bricolage-grotesque-latin.woff2", weight: "400 800" },
  { family: "JetBrains Mono", file: "jetbrains-mono-500-latin.woff2", weight: "500" },
];

let faces: string | null = null;

/**
 * The `@font-face` rules of the result page, each font inline: the page needs no network. A font that cannot be
 * read is left out, and the page falls back on the system's.
 */
export function fontFaces(): string {
  if (faces !== null) return faces;
  faces = FACES.map(({ family, file, weight }) => {
    try {
      const data = readFileSync(new URL(`../../assets/fonts/${file}`, import.meta.url)).toString("base64");
      return `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; font-display: swap; src: url(data:font/woff2;base64,${data}) format("woff2"); }`;
    } catch {
      return "";
    }
  }).join("\n");
  return faces;
}
