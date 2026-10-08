import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

/**
 * What a step acts on: an element by its accessible role and name, such as a
 * link "Commandes", or by its visible text when it has no role. When several
 * elements match, `within` names the container that holds the right one, such
 * as the row "Lampe": its name needs only to appear in the container's.
 */
export type Target = ({ role: string; name: string } | { text: string }) & { within?: { role: string; name: string } };

export type Step =
  | { do: "open"; path: string }
  | { do: "click"; target: Target; lands?: string }
  | { do: "fill"; target: Target; value: string | { account: string } }
  | { do: "press"; key: string; lands?: string }
  | { do: "see"; text: string };

/** A key journey of the product sheet, as steps a browser can replay. */
export interface Journey {
  /** The file name without `.json`: it names the captures. */
  slug: string;
  /** The user's goal, as in the product sheet: "See my orders". */
  name: string;
  /** True for a journey that starts signed out, such as signing in itself. */
  signedOut?: boolean;
  steps: Step[];
}

/** Some journey files cannot be replayed. The message lists every problem. */
export class JourneyError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
    this.name = "JourneyError";
  }
}

const ACTIONS = ["open", "click", "fill", "press", "see"];

function targetProblem(target: unknown): string | null {
  if (!target || typeof target !== "object") return "needs a target";
  const t = target as Record<string, unknown>;
  const named = typeof t.role === "string" && t.role && typeof t.name === "string" && t.name;
  const text = typeof t.text === "string" && t.text;
  if (!named && !text) return "a target needs a role and a name, or a text";
  if (text && (t.role !== undefined || t.name !== undefined)) return "a target is either a role and a name, or a text, not both";
  if (t.within !== undefined) {
    const w = t.within as Record<string, unknown> | null;
    if (!w || typeof w.role !== "string" || typeof w.name !== "string" || !w.role || !w.name) return "within needs a role and a name";
  }
  return null;
}

/** What is wrong with one journey file's content, one sentence each. */
function problemsOf(file: string, data: unknown): string[] {
  const problems: string[] = [];
  const j = (data ?? {}) as Record<string, unknown>;
  if (typeof j.name !== "string" || !j.name.trim()) problems.push(`${file}: no name`);
  if (!Array.isArray(j.steps) || j.steps.length === 0) return [...problems, `${file}: no steps`];
  if ((j.steps[0] as { do?: unknown })?.do !== "open") problems.push(`${file}: the journey does not start with an open step`);
  j.steps.forEach((raw, i) => {
    const step = (raw ?? {}) as Record<string, unknown>;
    const at = `${file}, step ${i + 1}`;
    if (!ACTIONS.includes(step.do as string)) return problems.push(`${at}: unknown action "${String(step.do)}"`);
    if (step.do === "open" && (typeof step.path !== "string" || !step.path.startsWith("/"))) problems.push(`${at}: open needs a path starting with /`);
    if (step.do === "click" || step.do === "fill") {
      const problem = targetProblem(step.target);
      if (problem) problems.push(`${at}: ${problem === "needs a target" ? `${step.do} needs a target` : problem}`);
    }
    const fromAccount = typeof step.value === "object" && step.value !== null && typeof (step.value as { account?: unknown }).account === "string";
    if (step.do === "fill" && typeof step.value !== "string" && !fromAccount) problems.push(`${at}: fill needs a value, or { "account": "<field>" } for a value from the sign-in account`);
    if (step.do === "press" && (typeof step.key !== "string" || !step.key)) problems.push(`${at}: press needs a key`);
    if ((step.do === "click" || step.do === "press") && step.lands !== undefined && (typeof step.lands !== "string" || !step.lands.startsWith("/"))) problems.push(`${at}: lands needs a route starting with /`);
    if (step.do === "see" && (typeof step.text !== "string" || !step.text)) problems.push(`${at}: see needs a text`);
    return undefined;
  });
  return problems;
}

/**
 * Reads every `.json` file of `dir` as one journey, named after its file.
 * Refuses, with every problem at once, files that cannot be replayed.
 */
export async function loadJourneys(dir: string): Promise<Journey[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new JourneyError([`No journeys: ${dir} does not exist. /aeom --ux writes them.`]);
    throw new JourneyError([`Cannot read the journeys in ${dir}: ${error instanceof Error ? error.message : String(error)}`]);
  }
  const journeys: Journey[] = [];
  const problems: string[] = [];
  for (const file of files) {
    let data: unknown;
    try {
      data = JSON.parse(await readFile(join(dir, file), "utf8"));
    } catch (error) {
      problems.push(`${file}: ${error instanceof SyntaxError ? "not valid JSON" : String(error)}`);
      continue;
    }
    const found = problemsOf(file, data);
    if (found.length) problems.push(...found);
    else journeys.push({ ...(data as Omit<Journey, "slug">), slug: basename(file, ".json") });
  }
  if (problems.length) throw new JourneyError(problems);
  if (journeys.length === 0) throw new JourneyError([`No journeys: ${dir} has no .json file.`]);
  return journeys;
}

/** A step in words, as the report and the captures name it: `click link "Commandes"`. */
export function describeStep(step: Step): string {
  const target = (t: Target) => ("text" in t ? `"${t.text}"` : `${t.role} "${t.name}"`) + (t.within ? ` in ${t.within.role} "${t.within.name}"` : "");
  switch (step.do) {
    case "open":
      return `open ${step.path}`;
    case "click":
      return `click ${target(step.target)}`;
    case "fill":
      return `fill ${target(step.target)}`;
    case "press":
      return `press ${step.key}`;
    case "see":
      return `see "${step.text}"`;
  }
}
