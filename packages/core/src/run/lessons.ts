import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Feedback } from "./taste.js";

/**
 * What the person taught AEOM, in two layers, as a design team keeps its taste: the rules
 * they said, kept at once, for this project (`.aeom/taste.md`, which comes first) or for
 * them (`~/.aeom/taste/rules.md`); and the lessons runs showed, each resting on what a run
 * showed, counted again when a later run shows it again.
 */
export interface Rule {
  scope: "project" | "person";
  text: string;
  /** When it was said, and why, as the person put it. */
  said: string;
}

export interface Lesson {
  text: string;
  /** What each run showed that it rests on: a disagreement, a choice over the advice. */
  evidence: string[];
  /** The runs it was learned from, each once. */
  runs: string[];
  /** The projects that showed it: one alone keeps it to that project, a second makes it the person's. */
  projects: string[];
  count: number;
  first: string;
  last: string;
}

/** A lesson a run may give at most: a few that hold, never a list of everything. */
export const LESSONS_PER_RUN = 5;
/** An index the briefs read at every turn: never a book. */
export const BRIEF_LINES = 200;

const normal = (text: string) => text.toLowerCase().normalize("NFKC").replace(/[\s.!…]+$/u, "").replace(/\s+/g, " ").trim();
const ruleFile = ({ home, project }: { home: string; project: string }, scope: Rule["scope"]) => (scope === "project" ? join(project, ".aeom", "taste.md") : join(home, "taste", "rules.md"));
/** A rule as the file has it, hand-edited or not: a bullet, then its words, then when it was said, when AEOM wrote it. */
function ruleOf(line: string, scope: Rule["scope"]): Rule | null {
  const bullet = /^[-*+]\s+(.+)$/.exec(line.trim());
  if (!bullet) return null;
  const at = bullet[1]!.lastIndexOf(" (said ");
  return at > 0 && bullet[1]!.endsWith(")") ? { scope, text: bullet[1]!.slice(0, at).trim(), said: bullet[1]!.slice(at + 7, -1) } : { scope, text: bullet[1]!.trim(), said: "" };
}

async function rulesIn(file: string, scope: Rule["scope"]): Promise<Rule[]> {
  const text = await readFile(file, "utf8").catch(() => "");
  return text
    .split(/\r?\n/)
    .map((l) => ruleOf(l, scope))
    .filter((r): r is Rule => r !== null && r.text !== "");
}

/** One writer at a time on a file: commands at once never lose a rule or a lesson. */
async function locked<T>(file: string, work: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`;
  await mkdir(dirname(file), { recursive: true });
  for (let tries = 0; ; tries++) {
    try {
      await mkdir(lock);
      break;
    } catch {
      // A lock older than this is a writer that died: taken over.
      if (tries > 100) await rm(lock, { recursive: true, force: true });
      await new Promise((done) => setTimeout(done, 20));
    }
  }
  try {
    return await work();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

/** The rules the person said, this project's first. */
export async function readRules(at: { home: string; project: string }): Promise<Rule[]> {
  return [...(await rulesIn(ruleFile(at, "project"), "project")), ...(await rulesIn(ruleFile(at, "person"), "person"))];
}

/** Keeps a rule the person said, once: `already` when the layer holds it in other words of case or ending. */
export async function addRule({ home, project, text, scope = "person", why, at }: { home: string; project: string; text: string; scope?: Rule["scope"]; why?: string; at: string }): Promise<"kept" | "already"> {
  const file = ruleFile({ home, project }, scope);
  return locked(file, async () => {
    const rules = await rulesIn(file, scope);
    if (rules.some((r) => normal(r.text) === normal(text))) return "already";
    const before = await readFile(file, "utf8").catch(() => "");
    const head = before ? "" : scope === "project" ? "# What this project taught AEOM\n\nRules said for this product, read before the person's own. Correct or remove any line.\n\n" : "# What I taught AEOM\n\nRules said for every project. Correct or remove any line.\n\n";
    await writeFile(file, `${before}${head}${before && !before.endsWith("\n") ? "\n" : ""}- ${text.trim().replace(/\s+/g, " ")} (said ${at}${why?.trim() ? `: ${why.trim()}` : ""})\n`);
    return "kept" as const;
  });
}

/**
 * What one run can teach, from what the person said of it: the verdicts they disagreed
 * with, and the directions they chose over the screening's advice, with their words.
 */
export function runEvidence(feedback: Feedback[], { project, run }: { project: string; run: string }): string[] {
  return feedback
    .filter((f) => f.project === project && f.run === run && !f.agree)
    .map((f) => `${f.id.startsWith("direction-advice:") || f.id.startsWith("direction-choice:") ? "chose otherwise than" : "disagreed with"} "${f.verdict}"${f.why ? `: ${f.why}` : ""}`);
}

const lessonsFile = (home: string) => join(home, "taste", "lessons.json");

export async function readLessons(home: string): Promise<Lesson[]> {
  try {
    const lessons = JSON.parse(await readFile(lessonsFile(home), "utf8")) as unknown;
    return Array.isArray(lessons)
      ? lessons.filter((l): l is Lesson => !!l && typeof (l as Lesson).text === "string" && Array.isArray((l as Lesson).runs)).map((l) => ({ ...l, projects: Array.isArray(l.projects) ? l.projects : [] }))
      : [];
  } catch {
    return [];
  }
}

/**
 * Keeps a lesson a run showed, with what it rests on: one already kept, in other words of
 * case or ending, counts once more; a run gives five at most; a lesson with nothing under
 * it is refused.
 */
export async function addLesson({ home, project, run, text, evidence, at }: { home: string; project: string; run: string; text: string; evidence: string; at: string }): Promise<"kept" | "confirmed" | "too many" | "no evidence"> {
  if (!evidence.trim()) return "no evidence";
  return locked(lessonsFile(home), async () => {
    // A list broken by hand is set aside, never written over.
    const raw = await readFile(lessonsFile(home), "utf8").catch(() => null);
    if (raw !== null) {
      try {
        JSON.parse(raw);
      } catch {
        await rename(lessonsFile(home), `${lessonsFile(home)}.broken-${Date.now()}`);
      }
    }
    const lessons = await readLessons(home);
    const same = lessons.find((l) => normal(l.text) === normal(text));
    // Every lesson a run gave, new or learned again, counts toward its five.
    if (!same?.runs.includes(run) && lessons.filter((l) => l.runs.includes(run)).length >= LESSONS_PER_RUN) return "too many" as const;
    if (same) {
      if (!same.runs.includes(run)) same.runs.push(run);
      if (!same.projects.includes(project)) same.projects.push(project);
      same.count = same.runs.length;
      same.evidence.push(evidence.trim());
      same.last = at;
    } else lessons.push({ text: text.trim().replace(/\s+/g, " "), evidence: [evidence.trim()], runs: [run], projects: [project], count: 1, first: at, last: at });
    const tmp = `${lessonsFile(home)}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(lessons, null, 2)}\n`);
    await rename(tmp, lessonsFile(home));
    return same ? ("confirmed" as const) : ("kept" as const);
  });
}

/**
 * What a brief reads of the person's taste: this project's rules first, then theirs, then
 * the lessons the most confirmed first, this project's and those two projects showed; an
 * index of BRIEF_LINES lines at most. The product sheet and the standard come before it
 * all, and a lesson never overrides a rule.
 */
export function tasteBrief({ rules, lessons, project: here }: { rules: Rule[]; lessons: Lesson[]; project?: string }): string {
  const parts: string[][] = [];
  const project = rules.filter((r) => r.scope === "project").map((r) => `- ${r.text}`);
  // A rule both layers hold is said once, as the project says it.
  const theirs = new Set(rules.filter((r) => r.scope === "project").map((r) => normal(r.text)));
  const person = rules.filter((r) => r.scope === "person" && !theirs.has(normal(r.text))).map((r) => `- ${r.text}`);
  // A lesson one project showed stays with it, a client's never reaching another's brief; two projects make it the person's.
  const mine = lessons.filter((l) => here === undefined || l.projects.includes(here) || l.projects.length >= 2);
  const learned = [...mine].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).map((l) => `- ${l.text}${l.count > 1 ? ` (${l.count} runs)` : ""}`);
  if (project.length) parts.push(["This project's rules, first:", ...project]);
  if (person.length) parts.push(["The person's own rules:", ...person]);
  if (learned.length) parts.push(["Lessons from earlier runs, the most confirmed first:", ...learned]);
  const lines = parts.flatMap((p, i) => (i ? ["", ...p] : p));
  return (lines.length > BRIEF_LINES ? [...lines.slice(0, BRIEF_LINES - 1), `- … ${lines.length - BRIEF_LINES + 1} more lines, in ~/.aeom/taste and .aeom/taste.md`] : lines).join("\n");
}
