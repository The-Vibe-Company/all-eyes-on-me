import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface Principle {
  id: string;
  text: string;
}

/** `principles/base.md` at the root of the AEOM repository. */
export const DEFAULT_PRINCIPLES_FILE = fileURLToPath(new URL("../../../../principles/base.md", import.meta.url));

/** Reads the principles of a file: every line shaped `- \`id\` — what it asks for`. */
export async function loadPrinciples(file: string = DEFAULT_PRINCIPLES_FILE): Promise<Principle[]> {
  const text = await readFile(file, "utf8");
  const principles = [...text.matchAll(/^- `([a-z0-9-]+)` [—-] (.+)$/gm)].map(([, id, body]) => ({ id: id!, text: body!.trim() }));
  if (principles.length === 0) throw new Error(`No principle found in ${file}. Each one is a line like: - \`id\` — what it asks for`);
  const seen = new Set<string>();
  const twice = principles.filter(({ id }) => seen.has(id) || !seen.add(id)).map(({ id }) => id);
  if (twice.length) throw new Error(`${file} defines ${[...new Set(twice)].join(", ")} more than once. Each principle id must be unique.`);
  return principles;
}
