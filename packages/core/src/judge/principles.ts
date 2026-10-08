import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface Principle {
  id: string;
  text: string;
}

/** `principles/base.md` at the root of the AEOM repository. */
export const DEFAULT_PRINCIPLES_FILE = fileURLToPath(new URL("../../../../principles/base.md", import.meta.url));

/** `principles/journeys.md`: what the judge asks of each key journey. */
export const JOURNEY_PRINCIPLES_FILE = fileURLToPath(new URL("../../../../principles/journeys.md", import.meta.url));

/** Reads the principles of a file: every line shaped `- \`id\` — what it asks for`. */
export async function loadPrinciples(file: string = DEFAULT_PRINCIPLES_FILE): Promise<Principle[]> {
  const text = await readFile(file, "utf8");
  const ROW = /^- `([a-z0-9-]+)` [—-] (.+)$/;
  const principles: Principle[] = [];
  const malformed: number[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!/^\s*[-*+]\s/.test(line)) return;
    const match = ROW.exec(line);
    if (match) principles.push({ id: match[1]!, text: match[2]!.trim() });
    else malformed.push(i + 1);
  });
  if (malformed.length) throw new Error(`${file}: line ${malformed.join(", ")} is a list item but not a principle. Each one is a line like: - \`id\` — what it asks for`);
  if (principles.length === 0) throw new Error(`No principle found in ${file}. Each one is a line like: - \`id\` — what it asks for`);
  const seen = new Set<string>();
  const twice = principles.filter(({ id }) => seen.has(id) || !seen.add(id)).map(({ id }) => id);
  if (twice.length) throw new Error(`${file} defines ${[...new Set(twice)].join(", ")} more than once. Each principle id must be unique.`);
  return principles;
}
