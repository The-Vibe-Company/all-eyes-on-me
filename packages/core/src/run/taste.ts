import { appendFile, mkdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/** Where AEOM keeps what is the person's, on their machine: `~/.aeom`, or `AEOM_HOME`. */
export const aeomHome = () => process.env.AEOM_HOME || join(homedir(), ".aeom");

export const FEEDBACK_CATEGORIES = ["direction", "screens", "journeys", "principles"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** One gesture on one verdict of a result page: in words, never a capture. */
export interface Feedback {
  /** The project the run was on: its folder, as `runKey` gives it. */
  project: string;
  run: string;
  /** The verdict, such as `screen:/produits` or `journey:see-my-orders`. */
  id: string;
  category: FeedbackCategory;
  /** What AEOM said, in a few words, such as `/produits kept`. */
  verdict: string;
  agree: boolean;
  why?: string;
  at: string;
}

/**
 * Which run a gesture is on: the project is the folder holding `.aeom/runs/<run>`,
 * both read through any link, so the same run served from anywhere is counted once.
 * A run folder elsewhere is known by the folder holding it.
 */
export async function runKey(runDir: string): Promise<{ project: string; run: string }> {
  const real = await realpath(runDir);
  const runs = dirname(real);
  const inAeom = basename(runs) === "runs" && basename(dirname(runs)) === ".aeom";
  return { project: inAeom ? dirname(dirname(runs)) : runs, run: basename(real) };
}

const file = (home: string) => join(home, "taste", "feedback.jsonl");

/** Keeps a gesture, after the others: a later one on the same verdict replaces it when read. */
export async function addFeedback(home: string, feedback: Feedback): Promise<void> {
  await mkdir(join(home, "taste"), { recursive: true });
  await appendFile(file(home), JSON.stringify(feedback) + "\n");
}

/** Every verdict's latest gesture. A line that is not one is skipped. */
export async function readFeedback(home: string): Promise<Feedback[]> {
  const text = await readFile(file(home), "utf8").catch(() => "");
  const latest = new Map<string, Feedback>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const f = JSON.parse(line) as Feedback;
      if (typeof f.id === "string" && typeof f.agree === "boolean" && FEEDBACK_CATEGORIES.includes(f.category)) latest.set(JSON.stringify([f.project, f.run, f.id]), f);
    } catch {
      continue;
    }
  }
  return [...latest.values()];
}

/** How often the person agreed with AEOM, by category, over every run. */
export function agreementRates(feedback: Feedback[]): Record<FeedbackCategory, { agreed: number; total: number }> {
  const rates = Object.fromEntries(FEEDBACK_CATEGORIES.map((c) => [c, { agreed: 0, total: 0 }])) as Record<FeedbackCategory, { agreed: number; total: number }>;
  for (const f of feedback) {
    rates[f.category].total++;
    if (f.agree) rates[f.category].agreed++;
  }
  return rates;
}
