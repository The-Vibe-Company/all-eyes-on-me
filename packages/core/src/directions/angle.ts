import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * What a direction of /aeom directions is meant to be, kept in its folder as
 * `direction.json`: written by the session before its worker draws it, so
 * nothing is retyped in the shell and a run taken up finds it; once its worker
 * replied, the session adds what the worker saw. A worker only reads it.
 */
export interface Angle {
  /** What it is drawn from, in the product's world. */
  from?: string;
  /** Its sentence: what of the product it serves, and how. */
  sentence?: string;
  /** Its structure: where the main action sits, how the content is laid out. */
  structure?: string;
  /** The file name of its dense page, beside index.html. */
  dense?: string;
  /** Its worker's two plain sentences: what one sees, and what it takes from the product. */
  seen?: string;
  /** The banned look its worker found it closest to, and what keeps it apart. */
  closest?: string;
}

const FIELDS = ["from", "sentence", "structure", "dense", "seen", "closest"] as const;

/**
 * A direction's angle, read in its folder: null when none is written, a
 * problem in one sentence when the file cannot be read as one. Only the
 * fields it knows, each a string with something in it.
 */
export async function readAngle(folder: string): Promise<{ angle?: Angle | null; problem?: string }> {
  const label = `${basename(folder)}/direction.json`;
  let text: string;
  try {
    text = await readFile(join(folder, "direction.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { angle: null };
    return { problem: `${label} cannot be read: ${(error as Error).message}` };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { problem: `${label} is not a JSON object: write it again, with "from", "sentence", "structure" and "dense", and "seen" and "closest" once its worker replied.` };
  const angle: Angle = {};
  for (const field of FIELDS) {
    const value = (data as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim()) angle[field] = value.trim();
  }
  if (angle.dense !== undefined && (!/^[^/\\]+\.html$/.test(angle.dense) || angle.dense === "index.html")) return { problem: `${label}: its dense page is the file name of a page in its folder, such as affluence.html, not ${angle.dense}.` };
  return { angle };
}
